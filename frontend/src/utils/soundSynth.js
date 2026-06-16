/**
 * SoundSampler/Synthesizer using Salamander Grand Piano WAV samples with pitch-shifting,
 * falling back to a custom oscillator synth if samples are still loading or fail.
 */

const SAMPLED_MIDIS = [
  21, 24, 27, 30, // A0, C1, D#1, F#1
  33, 36, 39, 42, // A1, C2, D#2, F#2
  45, 48, 51, 54, // A2, C3, D#3, F#3
  57, 60, 63, 66, // A3, C4, D#4, F#4
  69, 72, 75, 78, // A4, C5, D#5, F#5
  81, 84, 87, 90, // A5, C6, D#6, F#6
  93, 96, 99, 102, // A6, C7, D#7, F#7
  105, 108 // A7, C8
];

const MIDI_TO_NOTE = {
  21: 'A0', 24: 'C1', 27: 'D#1', 30: 'F#1',
  33: 'A1', 36: 'C2', 39: 'D#2', 42: 'F#2',
  45: 'A2', 48: 'C3', 51: 'D#3', 54: 'F#3',
  57: 'A3', 60: 'C4', 63: 'D#4', 66: 'F#4',
  69: 'A4', 72: 'C5', 75: 'D#5', 78: 'F#5',
  81: 'A5', 84: 'C6', 87: 'D#6', 90: 'F#6',
  93: 'A6', 96: 'C7', 99: 'D#7', 102: 'F#7',
  105: 'A7', 108: 'C8'
};

function detectIf1to88KeyIndex(fileNames) {
  let hasLowNumber = false;
  let hasNoteName = false;
  
  for (const name of fileNames) {
    const lastDot = name.lastIndexOf('.');
    const baseName = lastDot !== -1 ? name.substring(0, lastDot) : name;
    
    // Normalize and convert Chinese modifiers
    let normalized = baseName.toUpperCase();
    normalized = normalized.replace(/升/g, '#');
    normalized = normalized.replace(/降/g, 'B');
    normalized = normalized.replace(/#([A-G])/g, '$1#');
    normalized = normalized.replace(/\bB([A-G])(-?\d)/g, '$1B$2');
    normalized = normalized.replace(/_|-/g, ' ');
    
    // Check if it has a note name like C4
    const noteRegex = /\b([A-G])(#|B|S)?(-?\d)\b/i;
    if (noteRegex.test(normalized)) {
      hasNoteName = true;
      continue;
    }
    
    // Check if it has a number between 1 and 20
    const matches = normalized.match(/\d+/g);
    if (matches) {
      for (const m of matches) {
        const num = parseInt(m, 10);
        if (num >= 1 && num <= 20) {
          hasLowNumber = true;
        }
      }
    }
  }
  
  return hasLowNumber && !hasNoteName;
}

function parseNoteFromFilename(fileName, is1to88KeyIndex = false) {
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
  
  // Preprocessing and normalization
  let normalized = baseName.toUpperCase();
  normalized = normalized.replace(/升/g, '#');
  normalized = normalized.replace(/降/g, 'B'); // map to 'B' (flat)
  normalized = normalized.replace(/#([A-G])/g, '$1#');
  normalized = normalized.replace(/\bB([A-G])(-?\d)/g, '$1B$2');
  normalized = normalized.replace(/_|-/g, ' ');

  // 1. Try to find a note name like C4, A#3, Eb5, F-1, Cs4, Bb2
  const noteRegex = /\b([A-G])(#|B|S)?(-?\d)\b/i;
  const match = normalized.match(noteRegex);
  if (match) {
    let pitch = match[1].toUpperCase();
    let modifier = match[2] ? match[2].toUpperCase() : '';
    let octave = parseInt(match[3], 10);
    
    if (modifier === 'S') modifier = '#';
    if (modifier === 'B') modifier = 'b';
    
    const NOTE_TO_MIDI = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    
    const noteKey = pitch + modifier;
    const semitones = NOTE_TO_MIDI[noteKey];
    if (semitones !== undefined) {
      const midi = (octave + 1) * 12 + semitones;
      if (midi >= 0 && midi <= 127) return midi;
    }
  }

  // 2. Try to find parenthesis format first, e.g. "tone (1).wav"
  const parenMatch = normalized.match(/\((\d+)\)/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1], 10);
    if (is1to88KeyIndex) {
      if (num >= 1 && num <= 88) return num + 20;
    } else {
      if (num >= 21 && num <= 127) return num;
      if (num >= 1 && num <= 88) return num + 20; // Fallback
    }
  }

  // 3. Match any standalone number in the filename
  const numRegex = /\b(\d+)\b/;
  const numMatch = normalized.match(numRegex);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (is1to88KeyIndex) {
      if (num >= 1 && num <= 88) return num + 20;
    } else {
      if (num >= 21 && num <= 127) return num;
      if (num >= 1 && num <= 20) return num + 20;
    }
  }

  return null;
}

function getNearestSample(midi, buffers) {
  const keys = Array.from(buffers.keys());
  if (keys.length === 0) return null;
  let nearest = keys[0];
  let minDiff = Math.abs(midi - nearest);
  for (let i = 1; i < keys.length; i++) {
    const diff = Math.abs(midi - keys[i]);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = keys[i];
    }
  }
  return nearest;
}

class SoundSynth {
  constructor() {
    this.ctx = null;
    this.activeSources = [];
    this.masterVolume = 0.5;
    this.buffers = new Map(); // midi -> AudioBuffer
    this.loading = false;
    this.loaded = false;
    this.progressCallbacks = new Set();
    this.activeLiveNotes = new Map(); // midi -> voice object
    this.sustainPedal = false;
  }

  addProgressListener(cb) {
    this.progressCallbacks.add(cb);
    cb(this.buffers.size, SAMPLED_MIDIS.length, this.loaded);
  }

  removeProgressListener(cb) {
    this.progressCallbacks.delete(cb);
  }

  notifyProgress(loadedCount, totalCount) {
    this.progressCallbacks.forEach(cb => {
      try {
        cb(loadedCount, totalCount, this.loaded);
      } catch (e) {
        console.error("Error in progress callback", e);
      }
    });
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.preloadSamples();
  }

  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  async preloadSamples() {
    if (this.loading || this.loaded) {
      this.notifyProgress(this.buffers.size, SAMPLED_MIDIS.length);
      return;
    }
    this.loading = true;
    console.log("Start preloading Salamander Grand Piano samples...");
    
    let loadedCount = 0;
    const totalCount = SAMPLED_MIDIS.length;
    this.notifyProgress(0, totalCount);

    const promises = SAMPLED_MIDIS.map(async (midi) => {
      const noteName = MIDI_TO_NOTE[midi];
      // Replace '#' with 's' for URL-safe filenames without fragment issues
      const safeNoteName = noteName.replace('#', 's');
      const url = `/salamander/${safeNoteName}.wav`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(midi, audioBuffer);
      } catch (err) {
        // Warn but do not crash (will fall back to synth)
        console.warn(`Failed to load sample for ${noteName} at ${url}:`, err);
      } finally {
        loadedCount++;
        this.notifyProgress(loadedCount, totalCount);
      }
    });

    await Promise.all(promises);
    this.loaded = true;
    this.loading = false;
    this.notifyProgress(this.buffers.size, totalCount);
    console.log(`Salamander Grand Piano samples loading complete: ${this.buffers.size} / ${SAMPLED_MIDIS.length}`);
  }

  async loadCustomSamples(files) {
    this.init();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    
    this.buffers.clear();
    
    let loadedCount = 0;
    const filesArray = Array.from(files);
    const totalCount = filesArray.length;
    this.notifyProgress(0, totalCount);
    
    // Detect if the files list uses 1-88 key index
    const fileNames = filesArray.map(f => f.name);
    const is1to88KeyIndex = detectIf1to88KeyIndex(fileNames);
    console.log(`loadCustomSamples: is1to88KeyIndex detected as ${is1to88KeyIndex}`);
    
    const promises = filesArray.map(async (file) => {
      const midi = parseNoteFromFilename(file.name, is1to88KeyIndex);
      
      if (midi !== null && midi >= 0 && midi <= 127) {
        try {
          const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error("File reading error"));
            reader.readAsArrayBuffer(file);
          });
          
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.buffers.set(midi, audioBuffer);
        } catch (err) {
          console.warn(`Failed to decode custom sample ${file.name}:`, err);
        }
      } else {
        console.warn(`Could not parse MIDI or note from filename: ${file.name}`);
      }
      
      loadedCount++;
      this.notifyProgress(loadedCount, totalCount);
    });
    
    await Promise.all(promises);
    
    if (this.buffers.size > 0) {
      this.loaded = true;
      this.loading = false;
      this.notifyProgress(this.buffers.size, this.buffers.size);
    } else {
      this.loaded = false;
      this.loading = false;
      await this.preloadSamples();
    }
    
    return this.buffers.size;
  }

  async loadRemoteSoundfont(soundfontName, filesList) {
    this.init();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.buffers.clear();
    this.loaded = false;
    this.loading = true;

    let loadedCount = 0;
    const totalCount = filesList.length;
    this.notifyProgress(0, totalCount);

    // Detect if the files list uses 1-88 key index
    const is1to88KeyIndex = detectIf1to88KeyIndex(filesList);
    console.log(`loadRemoteSoundfont: is1to88KeyIndex detected as ${is1to88KeyIndex}`);

    const promises = filesList.map(async (fileName) => {
      const midi = parseNoteFromFilename(fileName, is1to88KeyIndex);
      if (midi !== null && midi >= 0 && midi <= 127) {
        const url = `/soundfonts/${soundfontName}/${fileName}`;
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP error ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.buffers.set(midi, audioBuffer);
        } catch (err) {
          console.warn(`Failed to fetch/decode remote sample ${url}:`, err);
        }
      } else {
        console.warn(`Could not parse note from remote filename: ${fileName}`);
      }
      loadedCount++;
      this.notifyProgress(loadedCount, totalCount);
    });

    await Promise.all(promises);

    if (this.buffers.size > 0) {
      this.loaded = true;
      this.loading = false;
      this.notifyProgress(this.buffers.size, this.buffers.size);
    } else {
      this.loaded = false;
      this.loading = false;
      console.warn(`No samples loaded for remote soundfont ${soundfontName}. Falling back to default.`);
      await this.preloadSamples();
    }

    return this.buffers.size;
  }

  startNote(midi, trackId = 0) {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Stop any existing active note of the same midi first to prevent overlap build-up
    this.stopNote(midi, true); // force immediate stop

    if (this.masterVolume <= 0) {
      // Just record a dummy voice so stopNote handles it without issues
      this.activeLiveNotes.set(midi, { midi, trackId, released: false });
      return;
    }

    const nearestMidi = getNearestSample(midi, this.buffers);
    const buffer = nearestMidi !== null ? this.buffers.get(nearestMidi) : null;
    const startTime = this.ctx.currentTime;

    const voice = {
      midi,
      trackId,
      source: null,
      sourceHarmonic: null,
      gainNode: null,
      startTime,
      released: false,
      isSynth: false
    };

    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const semitonesDiff = midi - nearestMidi;
      const pitchShiftFactor = Math.pow(2, semitonesDiff / 12);
      source.playbackRate.value = pitchShiftFactor;

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.9, startTime + 0.005);

      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      source.start(startTime);

      // Keep it playing for a long time (salamander samples are up to 10-20s, set stop time to 15s to be safe)
      source.stop(startTime + 15.0);

      voice.source = source;
      voice.gainNode = gainNode;
    } else {
      // SYNTHESIZER FALLBACK
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      const oscFundamental = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      
      const gainFundamental = this.ctx.createGain();
      const gainHarmonic = this.ctx.createGain();
      const masterGain = this.ctx.createGain();

      if (trackId % 3 === 0) {
        oscFundamental.type = 'triangle';
        oscHarmonic.type = 'sine';
      } else if (trackId % 3 === 1) {
        oscFundamental.type = 'sine';
        oscHarmonic.type = 'triangle';
      } else {
        oscFundamental.type = 'triangle';
        oscHarmonic.type = 'triangle';
      }

      oscFundamental.frequency.setValueAtTime(freq, startTime);
      oscHarmonic.frequency.setValueAtTime(freq * 2, startTime);

      masterGain.gain.setValueAtTime(this.masterVolume, startTime);

      gainFundamental.gain.setValueAtTime(0, startTime);
      gainFundamental.gain.linearRampToValueAtTime(0.5, startTime + 0.005);
      gainFundamental.gain.setValueAtTime(0.15, startTime + 0.15);

      gainHarmonic.gain.setValueAtTime(0, startTime);
      gainHarmonic.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
      gainHarmonic.gain.setValueAtTime(0.15, startTime + 0.15);

      oscFundamental.connect(gainFundamental);
      oscHarmonic.connect(gainHarmonic);
      
      gainFundamental.connect(masterGain);
      gainHarmonic.connect(masterGain);
      
      masterGain.connect(this.ctx.destination);

      oscFundamental.start(startTime);
      oscHarmonic.start(startTime);

      oscFundamental.stop(startTime + 10.0);
      oscHarmonic.stop(startTime + 10.0);

      voice.source = oscFundamental;
      voice.sourceHarmonic = oscHarmonic;
      voice.gainNode = masterGain;
      voice.isSynth = true;
    }

    this.activeLiveNotes.set(midi, voice);
  }

  stopNote(midi, force = false) {
    const voice = this.activeLiveNotes.get(midi);
    if (!voice) return;

    voice.released = true;
    const now = this.ctx ? this.ctx.currentTime : 0;

    // If pedal is on and we are not forcing, keep sustaining
    if (this.sustainPedal && !force) {
      return;
    }

    // Otherwise, release immediately
    this.fadeAndStopVoice(voice, now);
    this.activeLiveNotes.delete(midi);
  }

  fadeAndStopVoice(voice, time) {
    if (!voice || !voice.gainNode) return;
    try {
      voice.gainNode.gain.cancelScheduledValues(time);
      voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value || this.masterVolume, time);
      if (this.masterVolume === 0) {
        voice.gainNode.gain.linearRampToValueAtTime(0, time + 0.1);
      } else {
        voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      }
      
      if (voice.source) {
        voice.source.stop(time + 0.12);
      }
      if (voice.sourceHarmonic) {
        voice.sourceHarmonic.stop(time + 0.12);
      }
    } catch (e) {
      // AudioContext might be suspended or closed
    }
  }

  setSustain(sustain) {
    this.sustainPedal = !!sustain;
    
    // If pedal is released, fade out any notes that have already been released
    if (!this.sustainPedal && this.ctx) {
      const now = this.ctx.currentTime;
      for (const [midi, voice] of this.activeLiveNotes.entries()) {
        if (voice.released) {
          this.fadeAndStopVoice(voice, now);
          this.activeLiveNotes.delete(midi);
        }
      }
    }
  }

  playNote(midi, duration, startTime, trackId = 0) {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.masterVolume <= 0) return;

    const nearestMidi = getNearestSample(midi, this.buffers);
    const buffer = nearestMidi !== null ? this.buffers.get(nearestMidi) : null;

    if (buffer) {
      // PLAY SALAMANDER SAMPLER NOTE
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      // Apply pitch shift (semitone diff playback rate adjustment)
      const semitonesDiff = midi - nearestMidi;
      const pitchShiftFactor = Math.pow(2, semitonesDiff / 12);
      source.playbackRate.value = pitchShiftFactor;

      const gainNode = this.ctx.createGain();
      
      // Simple gain envelope
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.9, startTime + 0.005);
      gainNode.gain.setValueAtTime(this.masterVolume * 0.9, startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.1);

      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      source.start(startTime);
      source.stop(startTime + duration + 0.15);

      const sourceObj = {
        source,
        gainNode,
        startTime,
        stopTime: startTime + duration + 0.15
      };

      this.activeSources.push(sourceObj);
      this.activeSources = this.activeSources.filter(s => s.stopTime > this.ctx.currentTime);
    } else {
      // SYNTHESIZER FALLBACK
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      
      const oscFundamental = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      
      const gainFundamental = this.ctx.createGain();
      const gainHarmonic = this.ctx.createGain();
      const masterGain = this.ctx.createGain();

      if (trackId % 3 === 0) {
        oscFundamental.type = 'triangle';
        oscHarmonic.type = 'sine';
      } else if (trackId % 3 === 1) {
        oscFundamental.type = 'sine';
        oscHarmonic.type = 'triangle';
      } else {
        oscFundamental.type = 'triangle';
        oscHarmonic.type = 'triangle';
      }

      oscFundamental.frequency.setValueAtTime(freq, startTime);
      oscHarmonic.frequency.setValueAtTime(freq * 2, startTime);

      masterGain.gain.setValueAtTime(this.masterVolume, startTime);

      gainFundamental.gain.setValueAtTime(0, startTime);
      gainFundamental.gain.linearRampToValueAtTime(0.5, startTime + 0.005);
      gainFundamental.gain.exponentialRampToValueAtTime(0.15, startTime + 0.15);
      gainFundamental.gain.setValueAtTime(0.15, startTime + duration - 0.05);
      gainFundamental.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.1);

      gainHarmonic.gain.setValueAtTime(0, startTime);
      gainHarmonic.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(duration, 0.3));

      oscFundamental.connect(gainFundamental);
      oscHarmonic.connect(gainHarmonic);
      
      gainFundamental.connect(masterGain);
      gainHarmonic.connect(masterGain);
      
      masterGain.connect(this.ctx.destination);

      oscFundamental.start(startTime);
      oscHarmonic.start(startTime);

      const stopTime = startTime + duration + 0.15;
      oscFundamental.stop(stopTime);
      oscHarmonic.stop(stopTime);

      const sourceObj = {
        source: oscFundamental, // Store primary oscillator to support stop()
        sourceHarmonic: oscHarmonic,
        gainNode: masterGain,
        startTime,
        stopTime
      };

      this.activeSources.push(sourceObj);
      this.activeSources = this.activeSources.filter(s => s.stopTime > this.ctx.currentTime);
    }
  }

  stopAll() {
    if (!this.ctx) return;
    
    // Stop scheduled playback notes
    this.activeSources.forEach(s => {
      try {
        s.source.stop();
        if (s.sourceHarmonic) s.sourceHarmonic.stop();
      } catch (e) {}
    });
    this.activeSources = [];

    // Stop active live notes
    const now = this.ctx.currentTime;
    this.activeLiveNotes.forEach(voice => {
      this.fadeAndStopVoice(voice, now);
    });
    this.activeLiveNotes.clear();
  }
}

const soundSynth = new SoundSynth();
export default soundSynth;
