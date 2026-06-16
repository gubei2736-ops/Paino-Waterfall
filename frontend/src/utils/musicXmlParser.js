/**
 * Helper to parse MusicXML and extract note event list for playback and visualization.
 */
export function parseMusicXml(xmlString) {
  // Strip BOM, trim, and remove DOCTYPE declaration to avoid DOMParser parsererror in browser
  const cleanXml = xmlString.replace(/^\uFEFF/, '').trim().replace(/<!DOCTYPE\s+[^>\[]*(?:\[[\s\S]*?\])?\s*>/gi, '');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');
  
  // 1. Resolve tracks (parts)
  const partMap = {}; // partId -> { id, name }
  const scoreParts = xmlDoc.querySelectorAll('score-part');
  
  if (scoreParts.length > 0) {
    scoreParts.forEach((scorePart, index) => {
      const id = scorePart.getAttribute('id');
      const nameNode = scorePart.querySelector('part-name');
      const name = nameNode ? nameNode.textContent.trim() : `音轨 ${index + 1}`;
      partMap[id] = { id: index, name };
    });
  }

  // Find all part nodes
  let parts = xmlDoc.querySelectorAll('part');
  if (parts.length === 0) {
    parts = xmlDoc.querySelectorAll('score-partwise > part');
  }

  const allNotes = [];
  const tempoChanges = [{ beat: 0, bpm: 120 }]; // Default tempo 120 BPM

  // 2. Parse notes and tempo changes from each part
  parts.forEach((part) => {
    const partIdAttr = part.getAttribute('id');
    // Assign a fallback ID if not declared in part-list
    if (partIdAttr && !partMap[partIdAttr]) {
      partMap[partIdAttr] = { id: Object.keys(partMap).length, name: `音轨 ${Object.keys(partMap).length + 1}` };
    }
    const partInfo = partMap[partIdAttr] || { id: 0, name: '主轨道' };
    const trackId = partInfo.id;
    
    let currentTime = 0; // divisions counter
    let currentDivisions = 1;
    let lastNoteTime = 0;
    let lastNoteDuration = 0;

    const measures = part.querySelectorAll('measure');
    measures.forEach((measure) => {
      const children = measure.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const nodeName = child.nodeName.toLowerCase();
        
        if (nodeName === 'attributes') {
          const divNode = child.querySelector('divisions');
          if (divNode) {
            currentDivisions = parseInt(divNode.textContent, 10) || 1;
          }
        } else if (nodeName === 'direction') {
          const soundNode = child.querySelector('sound');
          if (soundNode) {
            const tempo = soundNode.getAttribute('tempo');
            if (tempo) {
              const bpm = parseFloat(tempo);
              const beat = currentTime / currentDivisions;
              tempoChanges.push({ beat, bpm });
            }
          }
        } else if (nodeName === 'backup') {
          const durNode = child.querySelector('duration');
          if (durNode) {
            currentTime -= parseInt(durNode.textContent, 10) || 0;
          }
        } else if (nodeName === 'forward') {
          const durNode = child.querySelector('duration');
          if (durNode) {
            currentTime += parseInt(durNode.textContent, 10) || 0;
          }
        } else if (nodeName === 'note') {
          const isChord = child.querySelector('chord') !== null;
          const isRest = child.querySelector('rest') !== null;
          const durNode = child.querySelector('duration');
          const duration = durNode ? (parseInt(durNode.textContent, 10) || 0) : 0;
          
          let noteStart = currentTime;
          if (isChord) {
            noteStart = lastNoteTime;
          } else {
            lastNoteTime = currentTime;
            lastNoteDuration = duration;
          }

          if (!isRest) {
            const pitchNode = child.querySelector('pitch');
            if (pitchNode) {
              const step = pitchNode.querySelector('step')?.textContent;
              const octave = parseInt(pitchNode.querySelector('octave')?.textContent, 10);
              const alterNode = pitchNode.querySelector('alter');
              const alter = alterNode ? parseFloat(alterNode.textContent) : 0;
              
              if (step && !isNaN(octave)) {
                // Compute MIDI number
                const stepToPitchClass = {
                  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
                };
                const pc = stepToPitchClass[step.toUpperCase()] || 0;
                const midi = Math.round((octave + 1) * 12 + pc + alter);
                
                allNotes.push({
                  id: `${trackId}-${midi}-${noteStart}-${allNotes.length}`,
                  midi,
                  beatStart: noteStart / currentDivisions,
                  beatDuration: duration / currentDivisions,
                  trackId,
                });
              }
            }
          }
          
          if (!isChord) {
            currentTime += duration;
          }
        }
      }
    });
  });

  // Sort and remove duplicates in tempo changes
  tempoChanges.sort((a, b) => a.beat - b.beat);
  const uniqueTempoChanges = [];
  tempoChanges.forEach(tc => {
    if (uniqueTempoChanges.length === 0) {
      uniqueTempoChanges.push(tc);
    } else {
      const last = uniqueTempoChanges[uniqueTempoChanges.length - 1];
      if (Math.abs(last.beat - tc.beat) < 0.001) {
        last.bpm = tc.bpm; // update BPM if they occur at the exact same beat
      } else {
        uniqueTempoChanges.push(tc);
      }
    }
  });

  // Helper to convert beat counts to absolute seconds
  const convertBeatsToSeconds = (beat) => {
    let timeSeconds = 0;
    let currentBpm = 120;
    let currentBeat = 0;
    
    for (const tc of uniqueTempoChanges) {
      if (tc.beat > beat) break;
      const beatsElapsed = tc.beat - currentBeat;
      timeSeconds += beatsElapsed * (60 / currentBpm);
      currentBeat = tc.beat;
      currentBpm = tc.bpm;
    }
    
    const beatsRemaining = beat - currentBeat;
    timeSeconds += beatsRemaining * (60 / currentBpm);
    return timeSeconds;
  };

  // 3. Map notes to absolute time in seconds
  const notesWithSeconds = allNotes.map(n => {
    const time = convertBeatsToSeconds(n.beatStart);
    const endTime = convertBeatsToSeconds(n.beatStart + n.beatDuration);
    const duration = endTime - time;
    return {
      id: n.id,
      midi: n.midi,
      time,
      duration: duration > 0 ? duration : 0.1, // Ensure all notes have a playing duration
      trackId: n.trackId
    };
  });

  // Sort notes sequentially by start time
  notesWithSeconds.sort((a, b) => a.time - b.time);

  // Calculate total playing duration
  let maxEndTime = 0;
  notesWithSeconds.forEach(n => {
    if (n.time + n.duration > maxEndTime) {
      maxEndTime = n.time + n.duration;
    }
  });

  // Extract track definitions
  let tracks = Object.values(partMap);
  if (tracks.length === 0) {
    tracks = [{ id: 0, name: '主音轨' }];
  }

  // Ensure tracks are sorted by ID
  tracks.sort((a, b) => a.id - b.id);

  return {
    notes: notesWithSeconds,
    tracks,
    totalDuration: maxEndTime
  };
}
