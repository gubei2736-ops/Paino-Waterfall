/**
 * Parses a MusicXML string, extracts pitch information for each note,
 * and injects a <lyric> element containing the note name (e.g., C4, F#5).
 * Note names are determined based on local alterations or the active key signature.
 * Note names are placed above the staff by setting the placement="above" attribute.
 */
export function injectNoteNamesToXml(xmlString) {
  try {
    // Strip BOM, trim, and remove DOCTYPE declaration to avoid DOMParser parsererror in browser
    const cleanXml = xmlString.replace(/^\uFEFF/, '').trim().replace(/<!DOCTYPE\s+[^>\[]*(?:\[[\s\S]*?\])?\s*>/gi, '');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXml, 'application/xml');
    
    // Check parser errors
    const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      console.warn('XML parser error, returning cleaned string:', parserError.textContent);
      return cleanXml;
    }
    
    // Key signature alterations order
    const SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const FLATS_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

    function getKeyAlteration(step, fifths) {
      if (fifths > 0) {
        // Sharp keys: sharps are added in SHARPS_ORDER
        const sharpsInKey = SHARPS_ORDER.slice(0, fifths);
        if (sharpsInKey.includes(step)) {
          return 1;
        }
      } else if (fifths < 0) {
        // Flat keys: flats are added in FLATS_ORDER
        const flatsInKey = FLATS_ORDER.slice(0, -fifths);
        if (flatsInKey.includes(step)) {
          return -1;
        }
      }
      return 0;
    }

    function getPitchValue(step, octave, alterVal) {
      const stepMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      const stepVal = stepMap[step] || 0;
      return octave * 12 + stepVal + alterVal;
    }

    const parts = xmlDoc.getElementsByTagName('part');
    
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const measures = part.getElementsByTagName('measure');
      
      let activeFifths = 0; // Default key is C Major / A Minor
      
      for (let m = 0; m < measures.length; m++) {
        const measure = measures[m];
        
        // 1. Detect key signature change in the measure
        const keyEl = measure.getElementsByTagName('key')[0];
        if (keyEl) {
          const fifthsEl = keyEl.getElementsByTagName('fifths')[0];
          if (fifthsEl) {
            activeFifths = parseInt(fifthsEl.textContent, 10) || 0;
          }
        }
        
        // 2. Group notes in the measure by chord
        const notes = measure.getElementsByTagName('note');
        const chordGroups = [];
        let currentGroup = null;

        for (let i = 0; i < notes.length; i++) {
          const note = notes[i];
          
          // Skip rests
          const isRest = note.getElementsByTagName('rest').length > 0;
          if (isRest) continue;
          
          const pitch = note.getElementsByTagName('pitch')[0];
          if (!pitch) continue;

          const isChord = note.getElementsByTagName('chord').length > 0;
          
          if (isChord && currentGroup) {
            currentGroup.push(note);
          } else {
            currentGroup = [note];
            chordGroups.push(currentGroup);
          }
        }

        // 3. Process each chord group
        for (let g = 0; g < chordGroups.length; g++) {
          const group = chordGroups[g];
          const baseNote = group[0];
          
          // Remove all existing lyric tags from ALL notes in the group first
          for (let n = 0; n < group.length; n++) {
            const note = group[n];
            const existingLyrics = Array.from(note.getElementsByTagName('lyric'));
            for (let l = 0; l < existingLyrics.length; l++) {
              note.removeChild(existingLyrics[l]);
            }
          }

          // Parse details of all notes in the group
          const parsedNotes = [];
          for (let n = 0; n < group.length; n++) {
            const note = group[n];
            const pitch = note.getElementsByTagName('pitch')[0];
            const step = pitch.getElementsByTagName('step')[0]?.textContent || '';
            const octave = parseInt(pitch.getElementsByTagName('octave')[0]?.textContent || '4', 10);
            const alterEl = pitch.getElementsByTagName('alter')[0];
            const accidentalEl = note.getElementsByTagName('accidental')[0];
            
            let alterVal = 0;
            if (alterEl) {
              alterVal = parseFloat(alterEl.textContent);
            } else if (accidentalEl && accidentalEl.textContent.trim() === 'natural') {
              alterVal = 0; // Explicitly naturalized
            } else {
              // Apply key signature alteration
              alterVal = getKeyAlteration(step, activeFifths);
            }
            
            let alterText = '';
            if (alterVal === 1) alterText = '♯';
            else if (alterVal === -1) alterText = '♭';
            else if (alterVal === 0.5) alterText = '¼#';
            else if (alterVal === -0.5) alterText = '¼b';
            
            const noteName = `${step}${alterText}${octave}`;
            const pitchVal = getPitchValue(step, octave, alterVal);
            
            parsedNotes.push({ noteName, pitchVal });
          }

          // Sort by pitch value in descending order (highest pitch first, i.e., top to bottom)
          parsedNotes.sort((a, b) => b.pitchVal - a.pitchVal);

          // Now inject a single lyric element on the base note
          const isChordGroup = parsedNotes.length > 1;
          const noteNameText = isChordGroup 
            ? parsedNotes.map(n => n.noteName).join('/') 
            : parsedNotes[0].noteName;
            
          // Font size is shrunk to half of the original size (9 / 2 = 4.5) for chords containing 2 or more notes
          const fontSize = isChordGroup ? '4.5' : '9';

          const lyric = xmlDoc.createElement('lyric');
          lyric.setAttribute('number', '99');
          lyric.setAttribute('placement', 'above');
          
          const syllabic = xmlDoc.createElement('syllabic');
          syllabic.textContent = 'single';
          
          const text = xmlDoc.createElement('text');
          text.setAttribute('font-size', fontSize);
          text.textContent = noteNameText;
          
          lyric.appendChild(syllabic);
          lyric.appendChild(text);
          baseNote.appendChild(lyric);
        }
      }
    }
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
  } catch (err) {
    console.error('Error injecting note names to MusicXML:', err);
    try {
      return xmlString.replace(/^\uFEFF/, '').trim().replace(/<!DOCTYPE\s+[^>\[]*(?:\[[\s\S]*?\])?\s*>/gi, '');
    } catch (e) {
      return xmlString;
    }
  }
}
