import React, { useState, useEffect, useRef } from 'react';
import { Midi, Chord } from '@tonaljs/tonal';
import { Play, Pause, Volume2, ListMusic, Sparkles } from 'lucide-react';
import { KEYS_88 } from '../utils/keyboardLayout';
import { parseMusicXml } from '../utils/musicXmlParser';
import soundSynth from '../utils/soundSynth';
import TrackVisualizer, { getVisibleKeysLayout } from './TrackVisualizer';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const COMPUTER_KEY_MAP = {
  'a': 60, // C4
  'w': 61, // C#4
  's': 62, // D4
  'e': 63, // D#4
  'd': 64, // E4
  'f': 65, // F4
  't': 66, // F#4
  'g': 67, // G4
  'y': 68, // G#4
  'h': 69, // A4
  'u': 70, // A#4
  'j': 71, // B4
  'k': 72, // C5
  'o': 73, // C#5
  'l': 74, // D5
  'p': 75  // D#5
};

// Derived automatically from COMPUTER_KEY_MAP to avoid duplicate maintenance
const MIDI_TO_KEY_LABEL = Object.fromEntries(
  Object.entries(COMPUTER_KEY_MAP).map(([key, midi]) => [midi, key.toUpperCase()])
);

const areArraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const MAJOR_SCALE_MAP = {
  'C': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'C#': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
  'Db': ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  'D': ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  'Eb': ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  'E': ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  'F': ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  'Gb': ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  'G': ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  'Ab': ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  'A': ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  'Bb': ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  'B': ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#']
};

const NOTE_TO_SEMITONE = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11
};

const analyzeChordDegree = (chordName, key) => {
  if (!chordName || chordName === '未知和弦 (Unknown)' || chordName === '检测和弦...') return '';
  
  let root = chordName[0];
  if (chordName.length > 1 && (chordName[1] === '#' || chordName[1] === 'b')) {
    root += chordName[1];
  }
  
  const suffix = chordName.slice(root.length);
  const rootVal = NOTE_TO_SEMITONE[root];
  if (rootVal === undefined) return '';

  const cleanKey = key ? key.replace('m', '') : 'C';
  const scale = MAJOR_SCALE_MAP[cleanKey] || MAJOR_SCALE_MAP['C'];
  
  let degreeIdx = -1;
  for (let i = 0; i < scale.length; i++) {
    const scaleVal = NOTE_TO_SEMITONE[scale[i]];
    if (scaleVal === rootVal) {
      degreeIdx = i;
      break;
    }
  }
  
  const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  if (degreeIdx !== -1) {
    return `${ROMANS[degreeIdx]}${suffix}`;
  }
  
  for (let i = 0; i < scale.length; i++) {
    const scaleVal = NOTE_TO_SEMITONE[scale[i]];
    const diff = (rootVal - scaleVal + 12) % 12;
    if (diff === 11) {
      return `b${ROMANS[i]}${suffix}`;
    } else if (diff === 1) {
      return `#${ROMANS[i]}${suffix}`;
    }
  }
  
  return root + suffix;
};

export default function MidiKeyboard({ xmlContent, setXmlContent, showMidiScore, setShowMidiScore, focusMode, selectedKey }) {
  const [activeNotes, setActiveNotes] = useState([]); // User manual played active MIDI numbers
  const [playbackActiveNotes, setPlaybackActiveNotes] = useState([]); // Auto-played MIDI numbers from score
  const [liveNotes, setLiveNotes] = useState([]); // Live notes stream history for real-time visualizer
  const [detectedChord, setDetectedChord] = useState('');
  const [showChordTheory, setShowChordTheory] = useState(false);
  const chordTheoryRef = useRef(null);
  const [midiDevices, setMidiDevices] = useState([]);
  const [midiError, setMidiError] = useState('');

  // Live recording & transcription states
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const isRecordingLiveRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(120);

  // Sync state to ref to avoid stale closures in event listeners
  useEffect(() => {
    isRecordingLiveRef.current = isRecordingLive;
  }, [isRecordingLive]);

  const recordedNotesRef = useRef([]);
  const activeRecordedNotesRef = useRef(new Map());
  const recordingStartTimeRef = useRef(0);
  const metronomeIntervalRef = useRef(null);

  // Score playback states (only used in 'full' mode)
  const [parsedScore, setParsedScore] = useState(null);
  const [activeTracks, setActiveTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(0.5);
  const [reverbMix, setReverbMix] = useState(0.3);
  const [sustain, setSustain] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [waitingNotes, setWaitingNotes] = useState([]);

  const practiceModeRef = useRef(practiceMode);
  const waitingNotesRef = useRef(waitingNotes);
  const activeNotesRef = useRef(activeNotes);

  // Visible piano range states (zoom & shift) in Focus Mode
  const [visibleStartMidi, setVisibleStartMidi] = useState(21); // default A0
  const [visibleEndMidi, setVisibleEndMidi] = useState(108); // default C8

  const [showFocusControls, setShowFocusControls] = useState(true);
  const focusControlsTimeoutRef = useRef(null);

  // Automatically handle focus mode range selector hiding after 2s of inactivity
  useEffect(() => {
    if (focusMode) {
      setShowFocusControls(true);
      if (focusControlsTimeoutRef.current) {
        clearTimeout(focusControlsTimeoutRef.current);
      }
      focusControlsTimeoutRef.current = setTimeout(() => {
        setShowFocusControls(false);
      }, 2000);
    }
    return () => {
      if (focusControlsTimeoutRef.current) {
        clearTimeout(focusControlsTimeoutRef.current);
      }
    };
  }, [focusMode]);

  const handleControlsActivity = () => {
    setShowFocusControls(true);
    if (focusControlsTimeoutRef.current) {
      clearTimeout(focusControlsTimeoutRef.current);
    }
    focusControlsTimeoutRef.current = setTimeout(() => {
      setShowFocusControls(false);
    }, 2000);
  };

  const handleControlsMouseEnter = () => {
    setShowFocusControls(true);
    if (focusControlsTimeoutRef.current) {
      clearTimeout(focusControlsTimeoutRef.current);
    }
  };

  const handleControlsMouseLeave = () => {
    if (focusControlsTimeoutRef.current) {
      clearTimeout(focusControlsTimeoutRef.current);
    }
    focusControlsTimeoutRef.current = setTimeout(() => {
      setShowFocusControls(false);
    }, 2000);
  };

  // ── 和弦检测开关 ──
  const [chordDetectionEnabled, setChordDetectionEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_chord_detection_enabled');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_chord_detection_enabled', JSON.stringify(chordDetectionEnabled));
    } catch (e) {}
  }, [chordDetectionEnabled]);

  // 是否显示和弦区（hover 时显示；有音符演奏时始终显示）
  const [showChordArea, setShowChordArea] = useState(false);
  const chordAreaTimeoutRef = useRef(null);

  const handleChordAreaMouseEnter = () => {
    if (chordAreaTimeoutRef.current) clearTimeout(chordAreaTimeoutRef.current);
    setShowChordArea(true);
  };

  const handleChordAreaMouseLeave = () => {
    if (chordAreaTimeoutRef.current) clearTimeout(chordAreaTimeoutRef.current);
    chordAreaTimeoutRef.current = setTimeout(() => setShowChordArea(false), 800);
  };

  const zoomInKeys = () => {
    const currentKeys = KEYS_88.filter(k => k.midi >= visibleStartMidi && k.midi <= visibleEndMidi);
    const whiteKeys = currentKeys.filter(k => !k.isBlack);
    if (whiteKeys.length <= 15) return; // limit minimum visibility (about 2 octaves)

    const fullWhiteKeys = KEYS_88.filter(k => !k.isBlack);
    const startIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleStartMidi);
    const endIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleEndMidi);

    if (startIdx !== -1 && endIdx !== -1 && endIdx - startIdx > 10) {
      const newStartMidi = fullWhiteKeys[startIdx + 2].midi;
      const newEndMidi = fullWhiteKeys[endIdx - 2].midi;
      setVisibleStartMidi(newStartMidi);
      setVisibleEndMidi(newEndMidi);
    }
  };

  const zoomOutKeys = () => {
    const fullWhiteKeys = KEYS_88.filter(k => !k.isBlack);
    const startIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleStartMidi);
    const endIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleEndMidi);

    if (startIdx !== -1 && endIdx !== -1) {
      const newStartIdx = Math.max(0, startIdx - 2);
      const newEndIdx = Math.min(fullWhiteKeys.length - 1, endIdx + 2);
      setVisibleStartMidi(fullWhiteKeys[newStartIdx].midi);
      setVisibleEndMidi(fullWhiteKeys[newEndIdx].midi);
    }
  };

  const shiftLeftKeys = () => {
    const fullWhiteKeys = KEYS_88.filter(k => !k.isBlack);
    const startIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleStartMidi);
    const endIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleEndMidi);

    if (startIdx > 0 && endIdx !== -1) {
      const shiftAmt = Math.min(startIdx, 2);
      const newStartIdx = startIdx - shiftAmt;
      const newEndIdx = endIdx - shiftAmt;
      setVisibleStartMidi(fullWhiteKeys[newStartIdx].midi);
      setVisibleEndMidi(fullWhiteKeys[newEndIdx].midi);
    }
  };

  const shiftRightKeys = () => {
    const fullWhiteKeys = KEYS_88.filter(k => !k.isBlack);
    const startIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleStartMidi);
    const endIdx = fullWhiteKeys.findIndex(k => k.midi >= visibleEndMidi);

    if (startIdx !== -1 && endIdx < fullWhiteKeys.length - 1) {
      const shiftAmt = Math.min(fullWhiteKeys.length - 1 - endIdx, 2);
      const newStartIdx = startIdx + shiftAmt;
      const newEndIdx = endIdx + shiftAmt;
      setVisibleStartMidi(fullWhiteKeys[newStartIdx].midi);
      setVisibleEndMidi(fullWhiteKeys[newEndIdx].midi);
    }
  };

  const resetKeys = () => {
    setVisibleStartMidi(21);
    setVisibleEndMidi(108);
  };

  useEffect(() => {
    practiceModeRef.current = practiceMode;
    if (!practiceMode) {
      setWaitingNotes([]);
      waitingNotesRef.current = [];
    }
  }, [practiceMode]);

  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  const [sustainShortcut, setSustainShortcut] = useState(() => {
    try {
      const saved = localStorage.getItem('sustain_shortcut');
      return saved ? JSON.parse(saved) : { name: 'Space', code: 'Space' };
    } catch (e) {
      return { name: 'Space', code: 'Space' };
    }
  });
  const [isBinding, setIsBinding] = useState(false);
  const [showNoteNames, setShowNoteNames] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_show_note_names');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_show_note_names', JSON.stringify(showNoteNames));
    } catch (e) {}
  }, [showNoteNames]);

  const handleMidiMessageRef = useRef(null);
  useEffect(() => {
    handleMidiMessageRef.current = handleMidiMessage;
  });

  const [effectsConfig, setEffectsConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_effects_config');
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        bubbles: true,
        waterCurrent: true,
        loveLetter: true,
        keyBlast: true,
        barBreathing: false,
        velocityColoring: false,
        showNoteBars: true,
        noteBarsOpacity: 1.0,
        sustainGlow: true,
        whiteKeysDim: false,
        ...parsed
      };
    } catch (e) {
      return { bubbles: true, waterCurrent: true, loveLetter: true, keyBlast: true, barBreathing: false, velocityColoring: false, showNoteBars: true, noteBarsOpacity: 1.0, sustainGlow: true, whiteKeysDim: false };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_effects_config', JSON.stringify(effectsConfig));
    } catch (e) {}
  }, [effectsConfig]);

  const [showEffectsPicker, setShowEffectsPicker] = useState(false);
  const effectsPopoverRef = useRef(null);

  const [customColorsEnabled, setCustomColorsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_colors_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColorGradient, setCustomColorGradient] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_gradient');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });
  const [customColor1, setCustomColor1] = useState(() => {
    return localStorage.getItem('waterfall_custom_color1') || '#ff007f';
  });
  const [customColor2, setCustomColor2] = useState(() => {
    return localStorage.getItem('waterfall_custom_color2') || '#7f00ff';
  });
  const [customColor3, setCustomColor3] = useState(() => {
    return localStorage.getItem('waterfall_custom_color3') || '#00f2fe';
  });
  const [customColor4, setCustomColor4] = useState(() => {
    return localStorage.getItem('waterfall_custom_color4') || '#10b981';
  });
  const [customColor5, setCustomColor5] = useState(() => {
    return localStorage.getItem('waterfall_custom_color5') || '#f59e0b';
  });

  const [customColor1Enabled, setCustomColor1Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color1_enabled');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });
  const [customColor2Enabled, setCustomColor2Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color2_enabled');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });
  const [customColor3Enabled, setCustomColor3Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color3_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColor4Enabled, setCustomColor4Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color4_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColor5Enabled, setCustomColor5Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color5_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColorSplitC, setCustomColorSplitC] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_split_c');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const [customColorBlackWhitePlus, setCustomColorBlackWhitePlus] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_black_white_plus');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color_black_white_plus', JSON.stringify(customColorBlackWhitePlus));
    } catch (e) {}
  }, [customColorBlackWhitePlus]);

  const [customColorDuration, setCustomColorDuration] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_duration');
      return saved ? JSON.parse(saved) : 3.0;
    } catch (e) {
      return 3.0;
    }
  });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPopoverRef = useRef(null);

  const handleToggleColorEnabled = (num, currentVal) => {
    const enabledStates = [
      customColor1Enabled,
      customColor2Enabled,
      customColor3Enabled,
      customColor4Enabled,
      customColor5Enabled
    ];
    const enabledCount = enabledStates.filter(Boolean).length;
    if (currentVal && enabledCount <= 1) {
      alert('请至少保留一种启用的颜色！');
      return;
    }
    if (num === 1) setCustomColor1Enabled(!currentVal);
    if (num === 2) setCustomColor2Enabled(!currentVal);
    if (num === 3) setCustomColor3Enabled(!currentVal);
    if (num === 4) setCustomColor4Enabled(!currentVal);
    if (num === 5) setCustomColor5Enabled(!currentVal);
  };

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_colors_enabled', JSON.stringify(customColorsEnabled));
    } catch (e) {}
  }, [customColorsEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color_gradient', JSON.stringify(customColorGradient));
    } catch (e) {}
  }, [customColorGradient]);

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color1', customColor1);
      localStorage.setItem('waterfall_custom_color2', customColor2);
      localStorage.setItem('waterfall_custom_color3', customColor3);
      localStorage.setItem('waterfall_custom_color4', customColor4);
      localStorage.setItem('waterfall_custom_color5', customColor5);
    } catch (e) {}
  }, [customColor1, customColor2, customColor3, customColor4, customColor5]);

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color1_enabled', JSON.stringify(customColor1Enabled));
      localStorage.setItem('waterfall_custom_color2_enabled', JSON.stringify(customColor2Enabled));
      localStorage.setItem('waterfall_custom_color3_enabled', JSON.stringify(customColor3Enabled));
      localStorage.setItem('waterfall_custom_color4_enabled', JSON.stringify(customColor4Enabled));
      localStorage.setItem('waterfall_custom_color5_enabled', JSON.stringify(customColor5Enabled));
    } catch (e) {}
  }, [customColor1Enabled, customColor2Enabled, customColor3Enabled, customColor4Enabled, customColor5Enabled]);

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color_duration', JSON.stringify(customColorDuration));
    } catch (e) {}
  }, [customColorDuration]);

  useEffect(() => {
    try {
      localStorage.setItem('waterfall_custom_color_split_c', JSON.stringify(customColorSplitC));
    } catch (e) {}
  }, [customColorSplitC]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorPopoverRef.current && !colorPopoverRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
      if (effectsPopoverRef.current && !effectsPopoverRef.current.contains(e.target)) {
        setShowEffectsPicker(false);
      }
      if (chordTheoryRef.current && !chordTheoryRef.current.contains(e.target)) {
        setShowChordTheory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [audioStatus, setAudioStatus] = useState({
    loaded: soundSynth.loaded,
    loading: soundSynth.loading,
    loadedCount: soundSynth.buffers.size,
    totalCount: 30
  });

  // Playback Refs for high-performance animation loop
  const synthRef = useRef(soundSynth);
  const currentTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const scheduledNotes = useRef(new Set());
  const animationFrameRef = useRef(null);
  const playbackActiveNotesRef = useRef([]);

  // Synchronized refs to avoid closure stale state in requestAnimationFrame loop
  const isPlayingRef = useRef(isPlaying);
  const activeTracksRef = useRef(activeTracks);
  const notesRef = useRef([]);
  const playbackRateRef = useRef(playbackRate);

  const progressSliderRef = useRef(null);
  const timeTextRef = useRef(null);

  // Sync state to refs
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { activeTracksRef.current = activeTracks; }, [activeTracks]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { synthRef.current.setVolume(volume); }, [volume]);
  useEffect(() => { synthRef.current.setReverbMix(reverbMix); }, [reverbMix]);
  useEffect(() => { synthRef.current.setSustain(sustain); }, [sustain]);

  // Listen to piano sound font loading progress
  useEffect(() => {
    const handleProgress = (loadedCount, totalCount, loaded) => {
      setAudioStatus({
        loaded,
        loading: !loaded && loadedCount > 0,
        loadedCount,
        totalCount
      });
    };

    soundSynth.addProgressListener(handleProgress);
    soundSynth.init(); // Auto-start preloading on mount

    return () => {
      soundSynth.removeProgressListener(handleProgress);
    };
  }, []);

  // Global keydown listener for custom sustain pedal shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Ignore keydown if user is typing in form inputs
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      if (isBinding) {
        e.preventDefault();
        e.stopPropagation();
        
        let keyName = e.key;
        let keyCode = e.code;
        
        if (keyCode === 'Space' || keyName === ' ') {
          keyName = 'Space';
          keyCode = 'Space';
        } else if (keyName.length === 1) {
          keyName = keyName.toUpperCase();
        }
        
        const newShortcut = { name: keyName, code: keyCode };
        setSustainShortcut(newShortcut);
        localStorage.setItem('sustain_shortcut', JSON.stringify(newShortcut));
        setIsBinding(false);
        return;
      }

      // Match shortcut code or key name
      const isMatch = e.code === sustainShortcut.code || e.key.toUpperCase() === sustainShortcut.name.toUpperCase();
      if (isMatch) {
        e.preventDefault();
        setSustain(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isBinding, sustainShortcut, sustain]);

  // QWERTY computer keyboard mapping to 88-key piano keyboard (C3 to D#4)
  useEffect(() => {
    const pressedKeys = new Set();

    const handleKeyDown = (e) => {
      // Ignore keydown if user is typing in form inputs
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      if (isBinding) return; // Prevent playing keys while binding shortcut
      if (e.repeat) return; // Prevent repeated keydown trigger when held down

      const keyChar = e.key.toLowerCase();
      const midiNum = COMPUTER_KEY_MAP[keyChar];

      if (midiNum !== undefined) {
        e.preventDefault();
        pressedKeys.add(keyChar);

        // Note On
        setActiveNotes(prev => {
          if (prev.includes(midiNum)) return prev;
          return [...prev, midiNum].sort((a, b) => a - b);
        });

        // Initialize and play synth note
        synthRef.current.init();
        synthRef.current.startNote(midiNum, 0, 100);
        
        // Feed note to live visualizer
        addLiveNote(midiNum);
      }
    };

    const handleKeyUp = (e) => {
      const keyChar = e.key.toLowerCase();
      const midiNum = COMPUTER_KEY_MAP[keyChar];

      if (midiNum !== undefined) {
        e.preventDefault();
        pressedKeys.delete(keyChar);

        // Note Off
        setActiveNotes(prev => prev.filter(n => n !== midiNum));
        releaseLiveNote(midiNum);
        synthRef.current.stopNote(midiNum);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isBinding]);

  // 1. Handle score updates (supports MusicXML and MIDI JSON structures)
  useEffect(() => {
    handleStop();
    if (xmlContent) {
      try {
        let parsed;
        if (typeof xmlContent === 'string' && xmlContent.trim().startsWith('{')) {
          parsed = JSON.parse(xmlContent);
        } else {
          parsed = parseMusicXml(xmlContent);
        }
        setParsedScore(parsed);
        notesRef.current = parsed.notes;
        setActiveTracks(parsed.tracks.map(t => t.id));
        setWaitingNotes([]);
        waitingNotesRef.current = [];
      } catch (err) {
        console.error('Failed to parse score content for playback:', err);
        setParsedScore(null);
        notesRef.current = [];
      }
    } else {
      setParsedScore(null);
      notesRef.current = [];
    }
  }, [xmlContent]);

  // 2. Playback Loop Scheduler (Look-ahead technique)
  const playLoop = (timestamp) => {
    if (!isPlayingRef.current) return;

    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }
    const elapsed = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    const totalDur = parsedScore ? parsedScore.totalDuration : 0;
    let nextTime = currentTimeRef.current + elapsed * playbackRateRef.current;

    // Practice Mode logic: wait for correct MIDI note triggers
    if (practiceModeRef.current && parsedScore && notesRef.current.length > 0) {
      const currentT = currentTimeRef.current;
      let earliestFutureNoteTime = Infinity;
      
      // Find the earliest upcoming note start time
      for (let i = 0; i < notesRef.current.length; i++) {
        const note = notesRef.current[i];
        if (activeTracksRef.current.includes(note.trackId) && note.time > currentT - 0.05) {
          if (note.time < earliestFutureNoteTime) {
            earliestFutureNoteTime = note.time;
          }
        }
      }
      
      // If there's an upcoming note group within 0.12 seconds
      if (earliestFutureNoteTime !== Infinity && earliestFutureNoteTime - currentT <= 0.12) {
        const targetNotes = [];
        for (let i = 0; i < notesRef.current.length; i++) {
          const note = notesRef.current[i];
          if (activeTracksRef.current.includes(note.trackId) && Math.abs(note.time - earliestFutureNoteTime) < 0.04) {
            targetNotes.push(note.midi);
          }
        }
        
        const uniqueTargetNotes = [...new Set(targetNotes)];
        
        // Check if all notes in the upcoming group are pressed by the user
        const allPressed = uniqueTargetNotes.every(midi => activeNotesRef.current.includes(midi));
        
        if (!allPressed) {
          // Freeze timeline slightly before the notes hit the keyboard line
          nextTime = Math.max(currentT, earliestFutureNoteTime - 0.015);
          
          if (JSON.stringify(waitingNotesRef.current) !== JSON.stringify(uniqueTargetNotes)) {
            waitingNotesRef.current = uniqueTargetNotes;
            setWaitingNotes(uniqueTargetNotes);
          }
        } else {
          if (waitingNotesRef.current.length > 0) {
            waitingNotesRef.current = [];
            setWaitingNotes([]);
          }
        }
      } else {
        if (waitingNotesRef.current.length > 0) {
          waitingNotesRef.current = [];
          setWaitingNotes([]);
        }
      }
    } else {
      if (waitingNotesRef.current.length > 0) {
        waitingNotesRef.current = [];
        setWaitingNotes([]);
      }
    }

    // Loop end check
    if (nextTime >= totalDur) {
      nextTime = 0;
      currentTimeRef.current = 0;
      lastTimeRef.current = 0;
      scheduledNotes.current.clear();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setPlaybackActiveNotes([]);
      synthRef.current.stopAll();
      
      if (progressSliderRef.current) progressSliderRef.current.value = 0;
      if (timeTextRef.current) timeTextRef.current.textContent = `00:00 / ${formatTime(totalDur)}`;
      return;
    }

    currentTimeRef.current = nextTime;

    if (progressSliderRef.current) {
      progressSliderRef.current.value = nextTime;
    }
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${formatTime(nextTime)} / ${formatTime(totalDur)}`;
    }

    // Schedule audio notes (lookahead window = 200ms) - Optimized with early break
    const lookAhead = 0.2;
    const T = currentTimeRef.current;
    const synth = synthRef.current;

    for (let i = 0; i < notesRef.current.length; i++) {
      const note = notesRef.current[i];
      if (note.time >= T + lookAhead) break; // Early break! Any subsequent notes start beyond lookAhead.
      
      if (note.time >= T) {
        if (!scheduledNotes.current.has(note.id)) {
          if (activeTracksRef.current.includes(note.trackId)) {
            scheduledNotes.current.add(note.id);
            const delay = note.time - T;
            const audioStartTime = synth.ctx 
              ? (synth.ctx.currentTime + delay / playbackRateRef.current) 
              : 0;
            synth.playNote(note.midi, note.duration, audioStartTime, note.trackId, note.velocity ?? 100);
          }
        }
      }
    }

    // Detect currently sounding notes for piano keys visual feedback - Optimized with early break
    const activePlayback = [];
    for (let i = 0; i < notesRef.current.length; i++) {
      const n = notesRef.current[i];
      if (n.time > T) break; // Early break! No future note can be active now.
      if (T >= n.time && T <= n.time + n.duration && activeTracksRef.current.includes(n.trackId)) {
        activePlayback.push(n.midi);
      }
    }

    activePlayback.sort((a, b) => a - b);

    // Only update state and trigger React re-render if active notes list actually changed!
    if (!areArraysEqual(activePlayback, playbackActiveNotesRef.current)) {
      playbackActiveNotesRef.current = activePlayback;
      setPlaybackActiveNotes(activePlayback);
    }

    animationFrameRef.current = requestAnimationFrame(playLoop);
  };

  // Playback Control Handlers
  const handlePlay = () => {
    if (!parsedScore || parsedScore.notes.length === 0) return;
    synthRef.current.init();
    setIsPlaying(true);
    isPlayingRef.current = true;
    lastTimeRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(playLoop);
  };

  const handlePause = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    cancelAnimationFrame(animationFrameRef.current);
    synthRef.current.stopAll();
    setWaitingNotes([]);
    waitingNotesRef.current = [];
  };

  const handleStop = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    cancelAnimationFrame(animationFrameRef.current);
    currentTimeRef.current = 0;
    scheduledNotes.current.clear();
    playbackActiveNotesRef.current = [];
    setPlaybackActiveNotes([]);
    synthRef.current.stopAll();
    setWaitingNotes([]);
    waitingNotesRef.current = [];

    const totalDur = parsedScore ? parsedScore.totalDuration : 0;
    if (progressSliderRef.current) progressSliderRef.current.value = 0;
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `00:00 / ${formatTime(totalDur)}`;
    }
  };

  const handleSeek = (e) => {
    const seekTime = parseFloat(e.target.value);
    currentTimeRef.current = seekTime;
    scheduledNotes.current.clear();
    synthRef.current.stopAll();

    const totalDur = parsedScore ? parsedScore.totalDuration : 0;
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${formatTime(seekTime)} / ${formatTime(totalDur)}`;
    }

    const T = seekTime;
    const activePlayback = [];
    for (let i = 0; i < notesRef.current.length; i++) {
      const n = notesRef.current[i];
      if (n.time > T) break; // Early break!
      if (T >= n.time && T <= n.time + n.duration && activeTracksRef.current.includes(n.trackId)) {
        activePlayback.push(n.midi);
      }
    }
    activePlayback.sort((a, b) => a - b);
    playbackActiveNotesRef.current = activePlayback;
    setPlaybackActiveNotes(activePlayback);
  };

  const handleTrackToggle = (trackId) => {
    setActiveTracks(prev => {
      const next = prev.includes(trackId) 
        ? prev.filter(id => id !== trackId) 
        : [...prev, trackId].sort((a, b) => a - b);
      return next;
    });
    scheduledNotes.current.clear();
    synthRef.current.stopAll();
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Convert hex color to rgba for transparency overlay
  const hexToRgba = (hex, alpha) => {
    if (!hex) return `rgba(255, 255, 255, ${alpha})`;
    if (hex.startsWith('rgba')) {
      return hex.replace(/[\d\.]+\)$/, `${alpha})`);
    }
    if (hex.startsWith('rgb')) {
      return hex.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Resolve visualizer note color matches for active keys
  const getActiveKeyColor = (midi) => {
    const TRACK_COLORS = [
      { start: '#6366f1', end: '#8b5cf6' }, // Indigo -> Violet
      { start: '#ec4899', end: '#f43f5e' }, // Pink -> Rose
      { start: '#06b6d4', end: '#0891b2' }, // Cyan -> Dark Cyan
      { start: '#10b981', end: '#059669' }, // Emerald -> Green
      { start: '#f59e0b', end: '#d97706' }, // Amber -> Orange
    ];

    if (customColorsEnabled) {
      if (customColorSplitC) {
        const col = midi >= 60 ? (customColor1 || '#ff007f') : (customColor2 || '#7f00ff');
        return { start: col, end: col };
      }
      return { start: customColor1 || '#ff007f', end: customColor2 || '#7f00ff' };
    }

    if (activeNotes.includes(midi)) {
      return { start: '#00f2fe', end: '#4facfe' }; // Cyan to blue for live hand play
    }

    if (parsedScore && parsedScore.notes) {
      const T = currentTimeRef.current;
      for (let i = 0; i < parsedScore.notes.length; i++) {
        const note = parsedScore.notes[i];
        if (note.midi === midi && T >= note.time && T <= note.time + note.duration && activeTracks.includes(note.trackId)) {
          const idx = note.trackId % TRACK_COLORS.length;
          return TRACK_COLORS[idx];
        }
      }
    }

    return { start: '#6366f1', end: '#8b5cf6' };
  };

  // 3. Web MIDI Connection & Live Notes manager
  const addLiveNote = (midi, velocity = 100) => {
    const now = performance.now() / 1000;
    
    if (isRecordingLiveRef.current) {
      const relStartTime = now - recordingStartTimeRef.current;
      activeRecordedNotesRef.current.set(midi, relStartTime);
    }

    setLiveNotes(prev => {
      // Clean up finished notes older than 3.0s to prevent memory leaks
      const cleaned = prev.filter(n => n.endTime === null || now - n.endTime < 3.0);
      return [
        ...cleaned,
        {
          id: `live-${midi}-${now}-${Math.random()}`,
          midi,
          startTime: now,
          endTime: null,
          velocity
        }
      ];
    });
  };

  const releaseLiveNote = (midi) => {
    const now = performance.now() / 1000;

    if (isRecordingLiveRef.current) {
      if (activeRecordedNotesRef.current.has(midi)) {
        const relStartTime = activeRecordedNotesRef.current.get(midi);
        const relEndTime = now - recordingStartTimeRef.current;
        const duration = relEndTime - relStartTime;
        recordedNotesRef.current.push({
          midi,
          time: relStartTime,
          duration: Math.max(0.05, duration)
        });
        activeRecordedNotesRef.current.delete(midi);
      }
    }

    setLiveNotes(prev => prev.map(n => {
      if (n.midi === midi && n.endTime === null) {
        return { ...n, endTime: now };
      }
      return n;
    }));
  };

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiError('您的浏览器不支持 Web MIDI API，请使用 Chrome 或 Edge 浏览器。');
      return;
    }

    let midiAccessRef = null;

    const onMIDISuccess = (midiAccess) => {
      midiAccessRef = midiAccess;
      updateDevices(midiAccess);

      midiAccess.onstatechange = (e) => {
        if (e.port) {
          console.log(`MIDI port state change: [${e.port.name}] is now state=[${e.port.state}], connection=[${e.port.connection}]`);
        }
        updateDevices(midiAccess);
      };
    };

    const onMIDIFailure = () => {
      setMidiError('无法访问您的 MIDI 设备。');
    };

    const updateDevices = (midiAccess) => {
      const devices = [];
      for (const input of midiAccess.inputs.values()) {
        devices.push({ name: input.name, id: input.id });
      }
      setMidiDevices(devices);
      
      for (const input of midiAccess.inputs.values()) {
        const stableHandler = (event) => {
          if (handleMidiMessageRef.current) {
            handleMidiMessageRef.current(event);
          }
        };

        // Explicitly open the input port to make MIDI connection robust on Windows/Chrome
        if (input.connection !== 'open') {
          input.open()
            .then(() => {
              input.onmidimessage = stableHandler;
            })
            .catch(err => {
              console.warn(`Failed to explicitly open MIDI input port [${input.name}]:`, err);
              input.onmidimessage = stableHandler; // fallback binding
            });
        } else {
          input.onmidimessage = stableHandler;
        }
      }
    };

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);

    return () => {
      if (midiAccessRef) {
        for (const input of midiAccessRef.inputs.values()) {
          input.onmidimessage = null;
        }
        midiAccessRef.onstatechange = null;
      }
    };
  }, []);

  const handleMidiMessage = (event) => {
    if (!event || !event.data) return;
    const [status, note, velocity] = event.data;

    // Diagnostic console logging to help user check if MIDI signals are reaching the browser
    console.log(`[MIDI Info] status=${status}, note=${note}, velocity=${velocity} (Channel: ${(status & 0x0F) + 1})`);

    const msgType = status & 0xF0;

    // Check for Sustain Pedal (CC 64) on any MIDI Channel (0xB0 to 0xBF)
    const isCC = msgType === 0xB0;
    if (isCC && note === 64) {
      const pedalOn = velocity >= 64;
      setSustain(pedalOn);
      return;
    }

    // Support Note On (0x90) and Note Off (0x80) on any MIDI Channel
    const isNoteOn = msgType === 0x90 && velocity > 0;
    const isNoteOff = msgType === 0x80 || (msgType === 0x90 && velocity === 0);

    if (isNoteOn) {
      setActiveNotes(prev => {
        if (prev.includes(note)) return prev;
        return [...prev, note].sort((a, b) => a - b);
      });
      // Physical key click triggers synth sound immediately
      synthRef.current.init();
      synthRef.current.startNote(note, 0, velocity);
      
      // Feed note to live visualizer
      addLiveNote(note, velocity);
    } else if (isNoteOff) {
      setActiveNotes(prev => prev.filter(n => n !== note));
      releaseLiveNote(note);
      synthRef.current.stopNote(note);
    }
  };

  // 4. Chord detection (combine user inputs and playback active notes)
  const mergedActiveNotes = [...new Set([...activeNotes, ...playbackActiveNotes])];

  useEffect(() => {
    if (mergedActiveNotes.length === 0) {
      setDetectedChord('');
      return;
    }
    const notes = mergedActiveNotes.map(n => Midi.midiToNoteName(n, { pitchClass: true }));
    const chords = Chord.detect(notes);
    if (chords.length > 0) {
      setDetectedChord(chords[0]);
    } else {
      setDetectedChord('未知和弦 (Unknown)');
    }
  }, [playbackActiveNotes, activeNotes]);

  // 5. On-screen key click handler (manual test playing)
  const handleKeyClick = (midiNum) => {
    synthRef.current.init();
    synthRef.current.startNote(midiNum, 0, 100);

    const now = performance.now() / 1000;
    
    if (isRecordingLiveRef.current) {
      const relStartTime = now - recordingStartTimeRef.current;
      recordedNotesRef.current.push({
        midi: midiNum,
        time: relStartTime,
        duration: 0.2 // Fixed duration for on-screen mouse clicks
      });
    }

    const clickNoteId = `live-click-${midiNum}-${now}-${Math.random()}`;

    // Add note to live stream
    setLiveNotes(prev => {
      const cleaned = prev.filter(n => n.endTime === null || now - n.endTime < 3.0);
      return [
        ...cleaned,
        {
          id: clickNoteId,
          midi: midiNum,
          startTime: now,
          endTime: null
        }
      ];
    });

    // Auto-release the clicked screen note after 200ms
    setTimeout(() => {
      const releaseTime = performance.now() / 1000;
      setLiveNotes(prev => prev.map(n => {
        if (n.id === clickNoteId) {
          return { ...n, endTime: releaseTime };
        }
        return n;
      }));
      synthRef.current.stopNote(midiNum);
    }, 200);

    setActiveNotes(prev => {
      if (prev.includes(midiNum)) return prev;
      return [...prev, midiNum].sort((a, b) => a - b);
    });

    setTimeout(() => {
      setActiveNotes(prev => prev.filter(n => n !== midiNum));
    }, 250);
  };

  const handleToggleRecording = () => {
    if (isRecordingLive) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    clearKeyboard();
    recordedNotesRef.current = [];
    activeRecordedNotesRef.current.clear();
    recordingStartTimeRef.current = performance.now() / 1000;
    isRecordingLiveRef.current = true;
    setIsRecordingLive(true);
    
    if (metronomeEnabled) {
      const beatInterval = 60000 / metronomeBpm;
      synthRef.current.playMetronomeClick();
      metronomeIntervalRef.current = setInterval(() => {
        synthRef.current.playMetronomeClick();
      }, beatInterval);
    }
  };

  const stopRecording = async () => {
    if (!isRecordingLiveRef.current) return;
    isRecordingLiveRef.current = false;
    setIsRecordingLive(false);
    
    if (metronomeIntervalRef.current) {
      clearInterval(metronomeIntervalRef.current);
      metronomeIntervalRef.current = null;
    }
    
    const stopTime = (performance.now() / 1000) - recordingStartTimeRef.current;
    activeRecordedNotesRef.current.forEach((relStartTime, midi) => {
      recordedNotesRef.current.push({
        midi,
        time: relStartTime,
        duration: Math.max(0.05, stopTime - relStartTime)
      });
    });
    activeRecordedNotesRef.current.clear();
    
    if (recordedNotesRef.current.length === 0) {
      alert("未录制到任何演奏音符，请弹奏后再试！");
      return;
    }
    
    console.log("Recorded notes before sending to backend:", recordedNotesRef.current);
    setIsTranscribing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: recordedNotesRef.current,
          bpm: metronomeBpm
        })
      });
      
      if (!response.ok) {
        throw new Error("后端转译服务异常");
      }
      
      const data = await response.json();
      if (data.status === 'success' && data.xml) {
        if (setXmlContent) {
          setXmlContent(data.xml);
        }
        setShowMidiScore(true);
      } else {
        alert("转写失败，未获得合法的乐谱数据。");
      }
    } catch (e) {
      console.error(e);
      alert(`智能转写失败: ${e.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const clearKeyboard = () => {
    setActiveNotes([]);
    setPlaybackActiveNotes([]);
    setLiveNotes([]);
  };

  // Cleanup synthesizer on component unmount & Resume AudioContext on initial page interaction
  useEffect(() => {
    const resumeAudio = () => {
      // Pre-initialize and resume soundfont player on user gestures
      soundSynth.init();
      if (soundSynth.ctx && soundSynth.ctx.state === 'suspended') {
        soundSynth.ctx.resume().then(() => {
          console.log("Web AudioContext successfully resumed via user interaction.");
          cleanupInteractionListeners();
        });
      } else if (soundSynth.ctx && soundSynth.ctx.state === 'running') {
        cleanupInteractionListeners();
      }
    };

    const cleanupInteractionListeners = () => {
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
      document.removeEventListener('touchstart', resumeAudio);
    };

    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);

    return () => {
      cleanupInteractionListeners();
      cancelAnimationFrame(animationFrameRef.current);
      synthRef.current.stopAll();
      if (metronomeIntervalRef.current) {
        clearInterval(metronomeIntervalRef.current);
        metronomeIntervalRef.current = null;
      }
    };
  }, []);

  // --- RENDER MIDI Test Workspace ---
  const visibleKeys = getVisibleKeysLayout(visibleStartMidi, visibleEndMidi);

  // Get chord details for the tooltip theory panel
  const getChordDetails = () => {
    if (!detectedChord || detectedChord === '未知和弦 (Unknown)' || detectedChord === '检测和弦...') {
      return { notes: [], degree: '', typeName: '未知 (Unknown)' };
    }
    try {
      const info = Chord.get(detectedChord);
      const degree = analyzeChordDegree(detectedChord, selectedKey);
      return {
        notes: info ? info.notes : [],
        degree: degree || '',
        typeName: info ? info.name || '未知 (Unknown)' : '未知 (Unknown)'
      };
    } catch (e) {
      return { notes: [], degree: '', typeName: '未知 (Unknown)' };
    }
  };
  const chordDetails = getChordDetails();

  const renderMiniPianoSvg = (chordNotes) => {
    // Helper to get note chroma (0-11) for enharmonic equivalent check
    const getNoteChroma = (noteName) => {
      const pc = noteName.replace(/[0-9]/g, '');
      const chromaMap = {
        'C': 0, 'B#': 0,
        'C#': 1, 'Db': 1,
        'D': 2,
        'D#': 3, 'Eb': 3,
        'E': 4, 'Fb': 4,
        'F': 5, 'E#': 5,
        'F#': 6, 'Gb': 6,
        'G': 7,
        'G#': 8, 'Ab': 8,
        'A': 9,
        'A#': 10, 'Bb': 10,
        'B': 11, 'Cb': 11
      };
      return chromaMap[pc] !== undefined ? chromaMap[pc] : -1;
    };

    // Calculate 24 keys layout: MIDI 48 to 71 (C3 to B4)
    // 14 white keys total = 336px width (24px each)
    const whiteKeys = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71];
    const blackKeys = [
      { midi: 49, left: 17 },   // C#3
      { midi: 51, left: 41 },   // D#3
      { midi: 54, left: 89 },   // F#3
      { midi: 56, left: 113 },  // G#3
      { midi: 58, left: 137 },  // A#3
      { midi: 61, left: 185 },  // C#4
      { midi: 63, left: 209 },  // D#4
      { midi: 66, left: 257 },  // F#4
      { midi: 68, left: 281 },  // G#4
      { midi: 70, left: 305 }   // A#4
    ];

    const w_white = 24;
    const h_white = 76;
    const w_black = 14;
    const h_black = 48;

    // Retrieve chord note label matching current key chroma
    const getActiveNoteLabel = (midiNum) => {
      const targetChroma = midiNum % 12;
      return chordNotes.find(n => getNoteChroma(n) === targetChroma) || '';
    };

    return (
      <svg 
        width="336" 
        height="78" 
        style={{ 
          backgroundColor: '#0f1115', 
          borderRadius: '6px', 
          border: '1px solid var(--border-color)', 
          margin: '0 auto', 
          display: 'block',
          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)'
        }}
      >
        {/* Draw White Keys */}
        {whiteKeys.map((midi, idx) => {
          const noteLabel = getActiveNoteLabel(midi);
          const isAct = noteLabel !== '';
          const x = idx * w_white;
          return (
            <g key={midi}>
              <rect 
                x={x + 0.5} 
                y={0.5} 
                width={w_white - 1} 
                height={h_white} 
                fill={isAct ? 'rgba(234, 179, 8, 0.25)' : '#1b1d24'} 
                stroke="#0b0c10"
                strokeWidth="1.5"
                rx="2"
              />
              {isAct && (
                <rect
                  x={x + 2}
                  y={0.5}
                  width={w_white - 4}
                  height="4"
                  fill="#eab308"
                  rx="1"
                />
              )}
              {isAct && (
                <text 
                  x={x + w_white / 2} 
                  y={h_white - 12} 
                  fontFamily='"Outfit", "Noto Sans SC", sans-serif'
                  fontSize="10px"
                  fontWeight="bold"
                  fill="#ffffff"
                  textAnchor="middle"
                >
                  {noteLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Draw Black Keys */}
        {blackKeys.map((bk) => {
          const noteLabel = getActiveNoteLabel(bk.midi);
          const isAct = noteLabel !== '';
          return (
            <g key={bk.midi}>
              <rect 
                x={bk.left} 
                y={0.5} 
                width={w_black} 
                height={h_black} 
                fill={isAct ? 'rgba(168, 85, 247, 0.85)' : '#07080b'} 
                stroke="#0b0c10"
                strokeWidth="1"
                rx="1.5"
              />
              {isAct && (
                <rect
                  x={bk.left + 1.5}
                  y={0.5}
                  width={w_black - 3}
                  height="3"
                  fill="#a855f7"
                  rx="0.5"
                />
              )}
              {isAct && (
                <text 
                  x={bk.left + w_black / 2} 
                  y={h_black - 8} 
                  fontFamily='"Outfit", "Noto Sans SC", sans-serif'
                  fontSize="8px"
                  fontWeight="bold"
                  fill="#ffffff"
                  textAnchor="middle"
                >
                  {noteLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="midi-keyboard-full-container">
      {/* Floating Keyboard Bounds Controls for Focus Mode */}
      {focusMode && (
        <div 
          className="focus-controls-trigger-zone"
          onMouseEnter={handleControlsMouseEnter}
          onMouseMove={handleControlsActivity}
          onMouseLeave={handleControlsMouseLeave}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '380px',
            height: '68px',
            zIndex: 1000,
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            pointerEvents: 'auto'
          }}
        >
          <div 
            className="focus-controls-overlay" 
            style={{
              display: 'flex',
              gap: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.35)',
              backdropFilter: 'blur(12px)',
              padding: '8px 12px',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              alignItems: 'center',
              fontFamily: '"Outfit", "Noto Sans SC", sans-serif',
              opacity: showFocusControls ? 1 : 0,
              transform: showFocusControls ? 'translateY(0)' : 'translateY(-10px)',
              pointerEvents: showFocusControls ? 'auto' : 'none',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '11px', color: '#94a3b8', marginRight: '4px', userSelect: 'none' }}>键盘范围:</span>
            
            <button 
              className="btn btn-secondary btn-sm"
              onClick={(e) => { e.stopPropagation(); zoomInKeys(); handleControlsActivity(); }}
              title="放大（显示更少按键，使其变宽）"
              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              +
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={(e) => { e.stopPropagation(); zoomOutKeys(); handleControlsActivity(); }}
              title="缩小（显示更多按键，使其变窄）"
              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              -
            </button>
            
            <button 
              className="btn btn-secondary btn-sm"
              onClick={(e) => { e.stopPropagation(); shiftLeftKeys(); handleControlsActivity(); }}
              title="向左移动键盘范围"
              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              ◀
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={(e) => { e.stopPropagation(); shiftRightKeys(); handleControlsActivity(); }}
              title="向右移动键盘范围"
              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              ▶
            </button>
            
            <button 
              className="btn btn-secondary btn-sm"
              onClick={(e) => { e.stopPropagation(); resetKeys(); handleControlsActivity(); }}
              title="恢复完整 88 键显示"
              style={{ padding: '2px 8px', fontSize: '11px', height: '28px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              重置
            </button>
          </div>
        </div>
      )}
      {/* Top MIDI details and Chord Detection (Row 1) */}
      {!focusMode && (
        <div className="midi-status-bar">
        <div className="devices-list" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="status-indicator-dot" style={{ backgroundColor: midiDevices.length > 0 ? '#10b981' : '#f59e0b' }}></span>
            <span style={{ fontSize: '12px' }}>
              {midiDevices.length > 0 
                ? `已连接: ${midiDevices[0].name.substring(0, 10)}${midiDevices[0].name.length > 10 ? '...' : ''}` 
                : '未检测到 MIDI 设备'}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid var(--border-color)', paddingLeft: '15px' }}>
            <span className="status-indicator-dot" style={{ backgroundColor: audioStatus.loaded ? '#10b981' : '#f59e0b' }}></span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {audioStatus.loaded 
                ? '🎹 音源已就绪' 
                : `🎹 音源加载中 (${audioStatus.loadedCount}/30)`}
            </span>
          </div>
        </div>

        {/* Top Controls: Sustain Pedal, Keybinder, Global Volume, and Score Toggle */}
        <div className="top-midi-controls" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Sustain Pedal and Keybinder Group */}
          <div className="sustain-pedal-group" style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
            <button 
              className={`btn btn-sm sustain-pedal-btn ${sustain ? 'active' : ''}`}
              onClick={() => setSustain(!sustain)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px 0 0 20px',
                fontSize: '11px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: sustain ? 'var(--accent-color)' : 'var(--bg-input)',
                color: sustain ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRight: 'none',
                boxShadow: sustain ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
                transition: 'all var(--transition-normal)'
              }}
            >
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: sustain ? '#10b981' : '#64748b',
                display: 'inline-block'
              }}></span>
              <span>延音板: {sustain ? '开启' : '关闭'}</span>
            </button>
            <button
              onClick={() => setIsBinding(true)}
              title="点击可按键盘任意键设置自定义快捷键"
              className="sustain-shortcut-badge"
              style={{
                padding: '6px 10px',
                borderRadius: '0 20px 20px 0',
                fontSize: '10px',
                fontWeight: '600',
                backgroundColor: isBinding ? 'var(--accent-color)' : 'var(--bg-panel)',
                color: isBinding ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                transition: 'all var(--transition-normal)',
                outline: 'none'
              }}
            >
              {isBinding ? '按任意键...' : `快捷键: ${sustainShortcut.name}`}
            </button>
          </div>

          {/* Recording & Transcription Control Group */}
          <div className="recording-controls-group" style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
            <button 
              className={`btn btn-sm record-btn ${isRecordingLive ? 'active' : ''}`}
              onClick={handleToggleRecording}
              disabled={isTranscribing}
              style={{
                padding: '6px 12px',
                borderRadius: '20px 0 0 20px',
                fontSize: '11px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: isRecordingLive ? '#ef4444' : 'var(--bg-input)',
                color: isRecordingLive ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRight: 'none',
                boxShadow: isRecordingLive ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none',
                transition: 'all var(--transition-normal)'
              }}
            >
              <span className={`status-indicator-dot ${isRecordingLive ? 'blinking' : ''}`} style={{ 
                width: '7px', 
                height: '7px', 
                borderRadius: '50%', 
                backgroundColor: isRecordingLive ? '#ffffff' : '#ef4444',
                display: 'inline-block',
              }}></span>
              <span>{isTranscribing ? '转写中...' : isRecordingLive ? '停止录制并转写' : '录制演奏'}</span>
            </button>
            
            {/* Metronome toggle */}
            <button
              onClick={() => setMetronomeEnabled(!metronomeEnabled)}
              disabled={isRecordingLive}
              title="录制期间的节拍器 Click 声音"
              style={{
                padding: '6px 10px',
                fontSize: '10px',
                fontWeight: '600',
                backgroundColor: metronomeEnabled ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-panel)',
                color: metronomeEnabled ? 'var(--accent-color)' : 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                borderRight: 'none',
                cursor: 'pointer',
                transition: 'all var(--transition-normal)',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🔊 节拍器: {metronomeEnabled ? '开' : '关'}</span>
            </button>

            {/* Metronome BPM selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '0 20px 20px 0',
              padding: '2px 8px',
              height: '29px',
              gap: '4px'
            }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>BPM:</span>
              <input 
                type="number"
                min="40"
                max="240"
                value={metronomeBpm}
                disabled={isRecordingLive}
                onChange={(e) => setMetronomeBpm(Math.max(40, Math.min(240, parseInt(e.target.value) || 120)))}
                style={{
                  width: '42px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  outline: 'none',
                  textAlign: 'center',
                  padding: '0'
                }}
              />
            </div>
          </div>

          {/* Note Name Display Switch */}
          <button
            className={`btn btn-sm ${showNoteNames ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowNoteNames(!showNoteNames)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: showNoteNames ? 'var(--accent-color)' : 'var(--bg-input)',
              color: showNoteNames ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              boxShadow: showNoteNames ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all var(--transition-normal)'
            }}
          >
            {showNoteNames ? '瀑布流音名: 开启' : '瀑布流音名: 关闭'}
          </button>

          {/* Visual Effects Settings Popover Container */}
          <div className="effects-settings-container" style={{ position: 'relative' }} ref={effectsPopoverRef}>
            {(() => {
              const VISUAL_EFFECT_KEYS = ['bubbles', 'waterCurrent', 'loveLetter', 'keyBlast', 'barBreathing', 'velocityColoring', 'whiteKeysDim'];
              const hasActiveEffect = VISUAL_EFFECT_KEYS.some(k => effectsConfig[k]);
              return (
                <button
                  className={`btn btn-sm ${hasActiveEffect ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setShowEffectsPicker(!showEffectsPicker)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: hasActiveEffect ? 'var(--accent-color)' : 'var(--bg-input)',
                    color: hasActiveEffect ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    boxShadow: hasActiveEffect ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
                    transition: 'all var(--transition-normal)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>✨ 特效设置</span>
                </button>
              );
            })()}

            {showEffectsPicker && (
              <div 
                className="effects-settings-popover"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  width: '220px',
                  backgroundColor: 'rgba(20, 24, 33, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  padding: '12px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
                  选择开启的特效
                </div>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.bubbles}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, bubbles: !prev.bubbles }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>气泡上升 (Bubbles)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.waterCurrent}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, waterCurrent: !prev.waterCurrent }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>水中气流 (Water Current)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.loveLetter}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, loveLetter: !prev.loveLetter }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>情书 (Love Letter)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.keyBlast}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, keyBlast: !prev.keyBlast }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>爆炸粒子 (Key Blast)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.barBreathing}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, barBreathing: !prev.barBreathing }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>长条呼吸灯 (Breathing Bars)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.whiteKeysDim}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, whiteKeysDim: !prev.whiteKeysDim }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>黑白键色</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    checked={!!effectsConfig.velocityColoring}
                    onChange={() => setEffectsConfig(prev => ({ ...prev, velocityColoring: !prev.velocityColoring }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold' }}>⚡ 按键强弱色彩 (Velocity Coloring)</span>
                </label>

                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)', marginTop: '8px', marginBottom: '6px' }}>
                  瀑布流长条设置
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>长条不透明度:</span>
                    <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{Math.round((effectsConfig.noteBarsOpacity !== undefined ? effectsConfig.noteBarsOpacity : 1.0) * 100)}%</span>
                  </div>
                  <input 
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={effectsConfig.noteBarsOpacity !== undefined ? effectsConfig.noteBarsOpacity : 1.0}
                    onChange={(e) => {
                      const opacityVal = parseFloat(e.target.value);
                      setEffectsConfig(prev => ({ ...prev, noteBarsOpacity: opacityVal }));
                    }}
                    className="control-range-input"
                    style={{
                      width: '100%',
                      height: '4px',
                      borderRadius: '2px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Custom Color Settings Popover Container */}
          <div className="color-settings-container" style={{ position: 'relative' }} ref={colorPopoverRef}>
            <button
              className={`btn btn-sm ${customColorsEnabled ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                backgroundColor: customColorsEnabled ? 'var(--accent-color)' : 'var(--bg-input)',
                color: customColorsEnabled ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                boxShadow: customColorsEnabled ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
                transition: 'all var(--transition-normal)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🎨 自定义色彩</span>
            </button>

            {showColorPicker && (
              <div 
                className="color-settings-popover"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  width: '240px',
                  backgroundColor: 'rgba(20, 24, 33, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  padding: '16px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>自定义色彩</span>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                    <input 
                      type="checkbox" 
                      checked={customColorsEnabled}
                      onChange={(e) => setCustomColorsEnabled(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span 
                      style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: customColorsEnabled ? 'var(--accent-color)' : '#475569',
                        transition: '0.3s',
                        borderRadius: '20px'
                      }}
                    >
                      <span 
                        style={{
                          position: 'absolute',
                          content: '""',
                          height: '14px', width: '14px',
                          left: customColorsEnabled ? '18px' : '3px',
                          bottom: '3px',
                          backgroundColor: 'white',
                          transition: '0.3s',
                          borderRadius: '50%'
                        }}
                      />
                    </span>
                  </label>
                </div>

                {customColorsEnabled && (
                  <>
                    {/* 中央C双色开关 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>中央C双色</span>
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                        <input 
                          type="checkbox" 
                          checked={customColorSplitC}
                          onChange={(e) => setCustomColorSplitC(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: customColorSplitC ? 'var(--accent-color)' : '#475569', transition: '0.3s', borderRadius: '20px' }}>
                          <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: customColorSplitC ? '18px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                        </span>
                      </label>
                    </div>

                    {/* 黑白键色Plus开关：中央C双色已开时禁用 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', opacity: customColorSplitC ? 0.4 : 1, pointerEvents: customColorSplitC ? 'none' : 'auto' }}>
                      <span style={{ fontSize: '11px', color: customColorSplitC ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                        黑白键色Plus
                        {customColorSplitC && <span style={{ fontSize: '9px', marginLeft: '4px', color: '#ef4444' }}>需先关闭中央C双色</span>}
                      </span>
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                        <input 
                          type="checkbox"
                          checked={customColorBlackWhitePlus}
                          disabled={customColorSplitC}
                          onChange={(e) => setCustomColorBlackWhitePlus(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{ position: 'absolute', cursor: customColorSplitC ? 'not-allowed' : 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: customColorBlackWhitePlus ? 'var(--accent-color)' : '#475569', transition: '0.3s', borderRadius: '20px' }}>
                          <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: customColorBlackWhitePlus ? '18px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                        </span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', opacity: (customColorSplitC || customColorBlackWhitePlus) ? 0.5 : 1, pointerEvents: (customColorSplitC || customColorBlackWhitePlus) ? 'none' : 'auto' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>渐变显示</span>
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                        <input 
                          type="checkbox" 
                          checked={customColorGradient}
                          disabled={customColorSplitC || customColorBlackWhitePlus}
                          onChange={(e) => setCustomColorGradient(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span 
                          style={{
                            position: 'absolute',
                            cursor: 'pointer',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: customColorGradient ? 'var(--accent-color)' : '#475569',
                            transition: '0.3s',
                            borderRadius: '20px'
                          }}
                        >
                          <span 
                            style={{
                              position: 'absolute',
                              content: '""',
                              height: '14px', width: '14px',
                              left: customColorGradient ? '18px' : '3px',
                              bottom: '3px',
                              backgroundColor: 'white',
                              transition: '0.3s',
                              borderRadius: '50%'
                            }}
                          />
                        </span>
                      </label>
                    </div>

                    {/* ── 动态配色面板 ── */}
                    {customColorBlackWhitePlus && customColorSplitC ? (
                      /* 模式三：黑白键色Plus + 中央C双色 → 4区分色面板 */
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>4区分色配置</span>

                        {/* 中央C及以上区域 */}
                        <div style={{ backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--accent-color)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>🎹 中央C 及以上</span>
                          {/* 白键色（高音区） */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>白键颜色</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                                <input type="color" value={customColor1} onChange={(e) => setCustomColor1(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor1.toUpperCase()}</span>
                            </div>
                          </div>
                          {/* 黑键色（高音区） */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>黑键颜色</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                                <input type="color" value={customColor2} onChange={(e) => setCustomColor2(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor2.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>

                        {/* 中央C以下区域 */}
                        <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '600', color: '#10b981', letterSpacing: '0.5px', textTransform: 'uppercase' }}>🎹 中央C 以下</span>
                          {/* 白键色（低音区） */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>白键颜色</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                                <input type="color" value={customColor3} onChange={(e) => setCustomColor3(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor3.toUpperCase()}</span>
                            </div>
                          </div>
                          {/* 黑键色（低音区） */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>黑键颜色</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                                <input type="color" value={customColor4} onChange={(e) => setCustomColor4(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor4.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : customColorBlackWhitePlus ? (
                      /* 模式二：仅黑白键色Plus → 2色面板 */
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>黑白键分色配置</span>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>⬜ 白键颜色</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                              <input type="color" value={customColor1} onChange={(e) => setCustomColor1(e.target.value)} className="color-picker-input" />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor1.toUpperCase()}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>⬛ 黑键颜色</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px' }}>
                              <input type="color" value={customColor2} onChange={(e) => setCustomColor2(e.target.value)} className="color-picker-input" />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customColor2.toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 模式一：常规 5 色方案 */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                          {customColorSplitC ? '配色方案 (中央C双色)' : '配色方案 (最多5种)'}
                        </span>
                        {/* Color 1 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input type="checkbox" checked={customColor1Enabled} onChange={() => handleToggleColorEnabled(1, customColor1Enabled)} style={{ cursor: 'pointer' }} />
                            <span style={{ fontSize: '11px', color: customColor1Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {customColorSplitC ? '颜色 1 (中央C及以上)' : '颜色 1'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor1Enabled ? 1 : 0.5 }}>
                              <input type="color" value={customColor1} disabled={!customColor1Enabled} onChange={(e) => setCustomColor1(e.target.value)} className="color-picker-input" />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor1Enabled ? 1 : 0.5 }}>{customColor1.toUpperCase()}</span>
                          </div>
                        </div>
                        {/* Color 2 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input type="checkbox" checked={customColor2Enabled} onChange={() => handleToggleColorEnabled(2, customColor2Enabled)} style={{ cursor: 'pointer' }} />
                            <span style={{ fontSize: '11px', color: customColor2Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {customColorSplitC ? '颜色 2 (中央C以下)' : '颜色 2'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor2Enabled ? 1 : 0.5 }}>
                              <input type="color" value={customColor2} disabled={!customColor2Enabled} onChange={(e) => setCustomColor2(e.target.value)} className="color-picker-input" />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor2Enabled ? 1 : 0.5 }}>{customColor2.toUpperCase()}</span>
                          </div>
                        </div>
                        {/* Color 3（中央C双色下隐藏） */}
                        {!customColorSplitC && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input type="checkbox" checked={customColor3Enabled} onChange={() => handleToggleColorEnabled(3, customColor3Enabled)} style={{ cursor: 'pointer' }} />
                              <span style={{ fontSize: '11px', color: customColor3Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 3</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor3Enabled ? 1 : 0.5 }}>
                                <input type="color" value={customColor3} disabled={!customColor3Enabled} onChange={(e) => setCustomColor3(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor3Enabled ? 1 : 0.5 }}>{customColor3.toUpperCase()}</span>
                            </div>
                          </div>
                        )}
                        {/* Color 4（中央C双色下隐藏） */}
                        {!customColorSplitC && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input type="checkbox" checked={customColor4Enabled} onChange={() => handleToggleColorEnabled(4, customColor4Enabled)} style={{ cursor: 'pointer' }} />
                              <span style={{ fontSize: '11px', color: customColor4Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 4</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor4Enabled ? 1 : 0.5 }}>
                                <input type="color" value={customColor4} disabled={!customColor4Enabled} onChange={(e) => setCustomColor4(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor4Enabled ? 1 : 0.5 }}>{customColor4.toUpperCase()}</span>
                            </div>
                          </div>
                        )}
                        {/* Color 5（中央C双色下隐藏） */}
                        {!customColorSplitC && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input type="checkbox" checked={customColor5Enabled} onChange={() => handleToggleColorEnabled(5, customColor5Enabled)} style={{ cursor: 'pointer' }} />
                              <span style={{ fontSize: '11px', color: customColor5Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 5</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor5Enabled ? 1 : 0.5 }}>
                                <input type="color" value={customColor5} disabled={!customColor5Enabled} onChange={(e) => setCustomColor5(e.target.value)} className="color-picker-input" />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor5Enabled ? 1 : 0.5 }}>{customColor5.toUpperCase()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 色彩过渡时长（仅常规模式下可用） */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', opacity: (customColorSplitC || customColorBlackWhitePlus) ? 0.5 : 1, pointerEvents: (customColorSplitC || customColorBlackWhitePlus) ? 'none' : 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>色彩过渡时长</span>
                        <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{customColorDuration.toFixed(1)} 秒</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={60.0}
                        step={0.5}
                        value={customColorDuration}
                        disabled={customColorSplitC || customColorBlackWhitePlus}
                        onChange={(e) => setCustomColorDuration(parseFloat(e.target.value))}
                        className="control-range-input"
                        style={{ width: '100%', height: '4px', borderRadius: '2px', outline: 'none', cursor: 'pointer' }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>


          </div>


      </div>
      )}

      {!focusMode && (
        <div className="chord-display-hero" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '10px 24px' }}>

          {/* ── 和弦检测区 ── */}
          <div
            style={{ position: 'relative', textAlign: 'left', minWidth: '180px' }}
            onMouseEnter={handleChordAreaMouseEnter}
            onMouseLeave={handleChordAreaMouseLeave}
          >
            {/* 触发热区标注（调试用，实际透明） */}
            {!chordDetectionEnabled && (
              /* 未开启：始终显示开关按钮 */
              <button
                onClick={() => setChordDetectionEnabled(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px dashed rgba(99,102,241,0.35)',
                  borderRadius: '20px',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  transition: 'all 0.2s ease',
                }}
                title="点击开启和弦检测"
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#475569', flexShrink: 0, display: 'inline-block' }} />
                和弦检测（已关闭）
              </button>
            )}

            {chordDetectionEnabled && (() => {
              const isPlaying = mergedActiveNotes.length > 0;

              return (
                <>
                  {/* 和弦名称 + 乐理按钮（有演奏时显示，过渡动效） */}
                  <div
                    ref={chordTheoryRef}
                    style={{
                      position: 'relative',
                      overflow: 'visible',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      userSelect: 'none',
                      opacity: isPlaying ? 1 : 0,
                      transform: isPlaying ? 'translateY(0)' : 'translateY(4px)',
                      transition: 'opacity 0.3s ease, transform 0.3s ease',
                      pointerEvents: isPlaying ? 'auto' : 'none',
                    }}
                    onClick={() => setShowChordTheory(!showChordTheory)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="chord-name-large" style={{ fontSize: 'inherit' }}>
                        {detectedChord && detectedChord !== '检测和弦...' ? detectedChord : '···'}
                      </span>
                      {detectedChord && detectedChord !== '未知和弦 (Unknown)' && detectedChord !== '检测和弦...' && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '1px 4px', lineHeight: '1.2' }}>乐理</span>
                      )}
                    </div>

                    {showChordTheory && detectedChord && detectedChord !== '未知和弦 (Unknown)' && detectedChord !== '检测和弦...' && (
                      <div
                        className="chord-theory-card"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          bottom: '130%',
                          left: '0',
                          width: '360px',
                          backgroundColor: 'rgba(20, 24, 33, 0.95)',
                          backdropFilter: 'blur(16px)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          padding: '14px',
                          boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
                          zIndex: 200,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent-color)' }}>{detectedChord}</span>
                          {chordDetails.degree && (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', backgroundColor: 'rgba(99, 102, 241, 0.25)', color: '#818cf8', padding: '2px 6px', borderRadius: '4px' }}>
                              级数: {chordDetails.degree}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>和弦类型</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{chordDetails.typeName}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>音符构成</span>
                            <span style={{ color: 'var(--accent-color)', fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {chordDetails.notes.join(' - ')}
                            </span>
                          </div>
                        </div>

                        <div style={{ marginTop: '4px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textAlign: 'center' }}>微型钢琴指法图 (C3 - B4)</div>
                          {renderMiniPianoSvg(chordDetails.notes)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* hover 时显示的关闭开关（无演奏时） */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0, left: 0,
                      opacity: (!isPlaying && showChordArea) ? 1 : 0,
                      transform: (!isPlaying && showChordArea) ? 'translateY(0)' : 'translateY(4px)',
                      transition: 'opacity 0.25s ease, transform 0.25s ease',
                      pointerEvents: (!isPlaying && showChordArea) ? 'auto' : 'none',
                    }}
                  >
                    <button
                      onClick={() => setChordDetectionEnabled(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: '20px',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        color: 'var(--accent-color)',
                        fontSize: '11px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                      }}
                      title="点击关闭和弦检测"
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1', flexShrink: 0, display: 'inline-block', boxShadow: '0 0 6px rgba(99,102,241,0.6)' }} />
                      和弦检测（已开启）
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Combined Sliders in the Middle */}
          <div className="chord-hero-sliders" style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center' }}>
            {/* Volume Slider */}
            <div className="control-slider-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Volume2 style={{ width: '13px', height: '13px', color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', userSelect: 'none' }}>音量:</span>
              <input 
                type="range"
                min={0}
                max={1.0}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="control-range-input"
                style={{ width: '80px', height: '3px' }}
              />
              <span className="slider-value-display" style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '28px' }}>
                {Math.round(volume * 100)}%
              </span>
            </div>

            {/* Reverb Slider */}
            <div className="control-slider-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles style={{ width: '13px', height: '13px', color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', userSelect: 'none' }}>混响:</span>
              <input 
                type="range"
                min={0}
                max={1.0}
                step={0.05}
                value={reverbMix}
                onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                className="control-range-input"
                style={{ width: '80px', height: '3px' }}
              />
              <span className="slider-value-display" style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '28px' }}>
                {Math.round(reverbMix * 100)}%
              </span>
            </div>
          </div>

          {chordDetectionEnabled && (
            <div className="active-notes-list" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', overflow: 'hidden' }}>
              {mergedActiveNotes.length > 0 ? (
                mergedActiveNotes.map(m => (
                  <span key={m} className="note-pill">
                    {Midi.midiToNoteName(m)}
                  </span>
                ))
              ) : (
                <span className="placeholder-text">等待输入...</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Playback Controls and Track List (Row 2, moved above the canvas) */}
      {!focusMode && parsedScore ? (
        <div className="playback-control-panel">
          <div className="timeline-container">
            <input 
              ref={progressSliderRef}
              type="range" 
              className="progress-slider"
              min={0}
              max={parsedScore.totalDuration}
              step={0.05}
              defaultValue={0}
              onChange={handleSeek}
            />
            <span ref={timeTextRef} className="time-display">
              00:00 / {formatTime(parsedScore.totalDuration)}
            </span>
          </div>

          <div className="controls-row">
            <div className="play-buttons" style={{ display: 'flex', gap: '8px' }}>
              {isPlaying ? (
                <button className="btn btn-secondary btn-sm" onClick={handlePause}>
                  <Pause style={{ width: '14px', height: '14px' }} />
                  <span>暂停</span>
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handlePlay} disabled={!parsedScore.notes.length}>
                  <Play style={{ width: '14px', height: '14px' }} />
                  <span>播放</span>
                </button>
              )}
              <button 
                className={`btn btn-sm ${practiceMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPracticeMode(!practiceMode)}
                disabled={!parsedScore}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: practiceMode ? 'var(--accent-color)' : '',
                  borderColor: practiceMode ? 'var(--accent-color)' : '',
                  color: practiceMode ? '#fff' : '',
                  boxShadow: practiceMode ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none'
                }}
                title="开启后，播放将暂停等待您在MIDI键盘上弹奏正确的音符"
              >
                <Sparkles style={{ width: '14px', height: '14px' }} />
                <span>跟弹模式</span>
              </button>
            </div>

            <div className="control-slider-group">
              <span className="slider-label">速度:</span>
              <input 
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="control-range-input"
              />
              <span className="slider-value-display">{playbackRate.toFixed(1)}x</span>
            </div>



            {/* Track checkboxes */}
            <div className="track-checklist-wrapper">
              <div className="track-checklist-title">
                <ListMusic style={{ width: '14px', height: '14px' }} />
                <span>音轨选择</span>
              </div>
              <div className="track-checkboxes">
                {parsedScore.tracks.map((track) => (
                  <label key={track.id} className="track-checkbox-label">
                    <input 
                      type="checkbox"
                      checked={activeTracks.includes(track.id)}
                      onChange={() => handleTrackToggle(track.id)}
                    />
                    <span className="track-checkbox-name" title={track.name}>
                      {track.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Falling and rising note visualizer (Row 3, middle, stretches dynamically) */}
      <div className="visualizer-canvas-wrapper">
        <TrackVisualizer 
          playbackNotes={parsedScore ? parsedScore.notes : []}
          liveNotes={liveNotes}
          currentTimeRef={currentTimeRef}
          activeTracks={activeTracks}
          isPlaying={isPlaying}
          windowTime={2.0}
          showNoteNames={showNoteNames}
          customColorsEnabled={customColorsEnabled}
          customColorGradient={customColorGradient}
          customColorSplitC={customColorSplitC}
          customColorBlackWhitePlus={customColorBlackWhitePlus}
          customColor1={customColor1}
          customColor2={customColor2}
          customColor3={customColor3}
          customColor4={customColor4}
          customColor5={customColor5}
          customColor1Enabled={customColor1Enabled}
          customColor2Enabled={customColor2Enabled}
          customColor3Enabled={customColor3Enabled}
          customColor4Enabled={customColor4Enabled}
          customColor5Enabled={customColor5Enabled}
          customColorDuration={customColorDuration}
          effectsConfig={effectsConfig}
          visibleStartMidi={visibleStartMidi}
          visibleEndMidi={visibleEndMidi}
        />
      </div>

      {/* 88-Key piano keyboard (Row 4, absolute bottom of full container) */}
      <div className="piano-keyboard-wrapper">
        <div className="piano-keys-container">
          {visibleKeys.map((key) => {
            const isPressed = mergedActiveNotes.includes(key.midi);
            const isWaiting = waitingNotes.includes(key.midi);
            
            // Resolve custom note color and aura glow dynamically if pressed
            const colorPair = isPressed ? getActiveKeyColor(key.midi) : null;
            
            const customStyle = {
              position: 'absolute',
              left: `${key.left}%`,
              width: `${key.width}%`
            };

            if (isPressed && colorPair) {
              if (key.isBlack) {
                customStyle.background = `linear-gradient(to bottom, #161622 0%, ${colorPair.start} 100%)`;
                customStyle.boxShadow = `0 3px 14px ${hexToRgba(colorPair.start, 0.75)}, inset 0 1px 1px rgba(255, 255, 255, 0.2)`;
                customStyle.borderColor = colorPair.start;
              } else {
                customStyle.background = `linear-gradient(to bottom, #ffffff 0%, ${hexToRgba(colorPair.start, 0.18)} 60%, ${colorPair.start} 100%)`;
                customStyle.boxShadow = `0 4px 16px ${hexToRgba(colorPair.start, 0.65)}, inset 0 0 6px ${hexToRgba(colorPair.start, 0.3)}`;
                customStyle.borderColor = colorPair.start;
              }
            }

            return (
              <div
                key={key.midi}
                className={`piano-key-full ${key.isBlack ? 'black' : 'white'} ${isPressed ? 'pressed' : ''} ${isWaiting ? 'waiting' : ''}`}
                style={customStyle}
                onClick={() => handleKeyClick(key.midi)}
              >
                {key.isBlack && MIDI_TO_KEY_LABEL[key.midi] && (
                  <span className="key-binding-hint black-key" style={{
                    fontSize: '8px',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    padding: '1px 3px',
                    borderRadius: '2px',
                    marginBottom: '8px',
                    alignSelf: 'flex-end',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}>
                    {MIDI_TO_KEY_LABEL[key.midi]}
                  </span>
                )}
                {!key.isBlack && (
                  <span className="key-label-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    {MIDI_TO_KEY_LABEL[key.midi] && (
                      <span className="key-binding-hint" style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        color: 'var(--accent-color)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        marginBottom: '2px'
                      }}>
                        {MIDI_TO_KEY_LABEL[key.midi]}
                      </span>
                    )}
                    {key.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
