import { Midi } from '@tonejs/midi';

/**
 * Parses a MIDI file (binary ArrayBuffer) and converts it to the unified score format
 * used by MidiKeyboard and TrackVisualizer.
 * 
 * Unified format:
 * {
 *   notes: [ { id, midi, time, duration, trackId } ],
 *   tracks: [ { id, name } ],
 *   totalDuration: number (seconds)
 * }
 */
export function parseMidiFile(arrayBuffer) {
  const midi = new Midi(arrayBuffer);
  const allNotes = [];
  const tracks = [];

  midi.tracks.forEach((track, index) => {
    const trackId = index;
    const trackName = track.name.trim() || `音轨 ${index + 1}`;
    
    tracks.push({
      id: trackId,
      name: trackName
    });

    track.notes.forEach((note, noteIdx) => {
      allNotes.push({
        id: `${trackId}-${note.midi}-${note.time}-${noteIdx}`,
        midi: note.midi,
        time: note.time, // ToneJS/Midi calculates seconds automatically
        duration: note.duration, // duration in seconds
        trackId: trackId
      });
    });
  });

  // Sort notes by start time
  allNotes.sort((a, b) => a.time - b.time);

  return {
    notes: allNotes,
    tracks,
    totalDuration: midi.duration || 0
  };
}
