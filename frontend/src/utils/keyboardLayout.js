// Keyboard layout helper for 88 keys (MIDI 21 to 108, i.e., A0 to C8)
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const KEYS_88 = [];
let whiteKeyCount = 0;

// Step 1: Identify all keys
for (let midi = 21; midi <= 108; midi++) {
  const noteInOctave = (midi - 12) % 12;
  const name = noteNames[noteInOctave];
  const octave = Math.floor((midi - 12) / 12) - 1;
  const isBlack = name.includes('#');
  
  KEYS_88.push({
    midi,
    name: `${name}${octave}`,
    pc: name,
    isBlack,
    whiteIndex: isBlack ? -1 : whiteKeyCount++
  });
}

// Step 2: Assign positions (percentages of total width)
const whiteKeyWidth = 100 / 52; // ~1.923%
const blackKeyWidth = whiteKeyWidth * 0.65; // ~1.25%

KEYS_88.forEach((key) => {
  if (!key.isBlack) {
    key.left = key.whiteIndex * whiteKeyWidth;
    key.width = whiteKeyWidth;
  }
});

KEYS_88.forEach((key, idx) => {
  if (key.isBlack) {
    // A black key is always followed by a white key on a piano
    const nextKey = KEYS_88[idx + 1];
    if (nextKey && !nextKey.isBlack) {
      const boundary = nextKey.left;
      key.left = boundary - blackKeyWidth / 2;
      key.width = blackKeyWidth;
    }
  }
});

// Helper to look up key positions by midi
const keyMap = {};
KEYS_88.forEach(key => {
  keyMap[key.midi] = key;
});

export function getMidiKey(midi) {
  return keyMap[midi] || null;
}
