/**
 * Helper to parse MusicXML and extract note event list for playback and visualization.
 */

// Dynamics marking -> MIDI velocity mapping (standard values)
const DYNAMICS_VELOCITY = {
  ppp: 16, pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 127,
  fp: 64, sfz: 112, sf: 96, fz: 96, rfz: 96
};

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

  // 2. Parse notes, tempo changes and dynamics from each part
  parts.forEach((part) => {
    const partIdAttr = part.getAttribute('id');
    // Assign a fallback ID if not declared in part-list
    if (partIdAttr && !partMap[partIdAttr]) {
      partMap[partIdAttr] = { id: Object.keys(partMap).length, name: `音轨 ${Object.keys(partMap).length + 1}` };
    }
    const partInfo = partMap[partIdAttr] || { id: 0, name: '主轨道' };
    const trackId = partInfo.id;
    
    let currentTime = 0;      // divisions counter
    let currentDivisions = 1;
    let lastNoteTime = 0;
    let lastNoteDuration = 0;
    let currentDynamics = 80; // default mf velocity

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
          // Parse tempo changes
          const soundNode = child.querySelector('sound');
          if (soundNode) {
            const tempo = soundNode.getAttribute('tempo');
            if (tempo) {
              const bpm = parseFloat(tempo);
              const beat = currentTime / currentDivisions;
              tempoChanges.push({ beat, bpm });
            }
            // Parse dynamics from <sound dynamics="N"> attribute (0–127 or percentage)
            const dynAttr = soundNode.getAttribute('dynamics');
            if (dynAttr !== null) {
              const dynVal = parseFloat(dynAttr);
              if (!isNaN(dynVal)) {
                // MusicXML dynamics attribute is a percentage of ff (90); scale to 0~127
                currentDynamics = Math.max(1, Math.min(127, Math.round(dynVal * 127 / 90)));
              }
            }
          }
          // Parse dynamics from <dynamics> marking element (ppp/pp/p/mp/mf/f/ff/fff)
          const dynNode = child.querySelector('dynamics');
          if (dynNode && dynNode.children.length > 0) {
            const markingName = dynNode.children[0].nodeName.toLowerCase();
            if (DYNAMICS_VELOCITY[markingName] !== undefined) {
              currentDynamics = DYNAMICS_VELOCITY[markingName];
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
                  velocity: currentDynamics, // carry current dynamics into note
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

  // Pre-compute cumulative time at the start of each tempo segment for O(log M) beat→second lookup
  const tempoSegments = [];
  {
    let accTime = 0;
    let prevBeat = 0;
    let prevBpm = 120;
    for (const tc of uniqueTempoChanges) {
      accTime += (tc.beat - prevBeat) * (60 / prevBpm);
      tempoSegments.push({ beat: tc.beat, bpm: tc.bpm, timeAtBeat: accTime });
      prevBeat = tc.beat;
      prevBpm = tc.bpm;
    }
  }

  // O(log M) beat-to-seconds converter using binary search over tempoSegments
  const convertBeatsToSeconds = (beat) => {
    let lo = 0, hi = tempoSegments.length - 1, segIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tempoSegments[mid].beat <= beat) { segIdx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    const seg = tempoSegments[segIdx];
    return seg.timeAtBeat + (beat - seg.beat) * (60 / seg.bpm);
  };

  // 3. Map notes to absolute time in seconds, preserving velocity
  const notesWithSeconds = allNotes.map(n => {
    const time = convertBeatsToSeconds(n.beatStart);
    const endTime = convertBeatsToSeconds(n.beatStart + n.beatDuration);
    const duration = endTime - time;
    return {
      id: n.id,
      midi: n.midi,
      time,
      duration: duration > 0 ? duration : 0.1, // Ensure all notes have a playing duration
      trackId: n.trackId,
      velocity: n.velocity,                     // dynamics-derived velocity (1~127)
    };
  });

  // Sort notes sequentially by start time
  notesWithSeconds.sort((a, b) => a.time - b.time);

  // 4. Silence compression: remove gaps > 2s between notes
  //    Scans notes in order; if the gap between the current note's start and
  //    the furthest note-end seen so far (waveFront) exceeds the threshold,
  //    the entire gap is trimmed and all subsequent note times shift earlier.
  const SILENCE_THRESHOLD = 2.0; // seconds
  let cumulativeTrim = 0;
  let waveFront = 0; // max note end-time seen so far, in ORIGINAL time space

  for (const note of notesWithSeconds) {
    const origStart = note.time;
    const gap = origStart - waveFront; // gap since last audible note ended

    if (gap > SILENCE_THRESHOLD) {
      cumulativeTrim += gap; // trim the entire gap
    }

    note.time = Math.max(0, origStart - cumulativeTrim);

    const origEnd = origStart + note.duration;
    if (origEnd > waveFront) {
      waveFront = origEnd;
    }
  }

  // Calculate total playing duration (after compression)
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
