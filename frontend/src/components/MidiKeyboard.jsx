import React, { useState, useEffect, useRef } from 'react';
import { Midi, Chord } from '@tonaljs/tonal';
import { Play, Pause, Square, Volume2, ListMusic, Info } from 'lucide-react';
import { KEYS_88 } from '../utils/keyboardLayout';
import { parseMusicXml } from '../utils/musicXmlParser';
import soundSynth from '../utils/soundSynth';
import TrackVisualizer from './TrackVisualizer';

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

const MIDI_TO_KEY_LABEL = {
  60: 'A',
  61: 'W',
  62: 'S',
  63: 'E',
  64: 'D',
  65: 'F',
  66: 'T',
  67: 'G',
  68: 'Y',
  69: 'H',
  70: 'U',
  71: 'J',
  72: 'K',
  73: 'O',
  74: 'L',
  75: 'P'
};

const areArraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default function MidiKeyboard({ xmlContent, showMidiScore, setShowMidiScore, focusMode }) {
  const [activeNotes, setActiveNotes] = useState([]); // User manual played active MIDI numbers
  const [playbackActiveNotes, setPlaybackActiveNotes] = useState([]); // Auto-played MIDI numbers from score
  const [liveNotes, setLiveNotes] = useState([]); // Live notes stream history for real-time visualizer
  const [detectedChord, setDetectedChord] = useState('');
  const [midiDevices, setMidiDevices] = useState([]);
  const [midiError, setMidiError] = useState('');

  // Score playback states (only used in 'full' mode)
  const [parsedScore, setParsedScore] = useState(null);
  const [activeTracks, setActiveTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(0.5);
  const [sustain, setSustain] = useState(false);

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

  const [effectsConfig, setEffectsConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_effects_config');
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        bubbles: true,
        waterCurrent: true,
        loveLetter: true,
        showNoteBars: true,
        noteBarsOpacity: 1.0,
        ...parsed
      };
    } catch (e) {
      return { bubbles: true, waterCurrent: true, loveLetter: true, showNoteBars: true, noteBarsOpacity: 1.0 };
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
      const saved = localStorage.getItem('waterfall_custom_color_2_enabled');
      return saved ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });
  const [customColor3Enabled, setCustomColor3Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_3_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColor4Enabled, setCustomColor4Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_4_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [customColor5Enabled, setCustomColor5Enabled] = useState(() => {
    try {
      const saved = localStorage.getItem('waterfall_custom_color_5_enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

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
    const handleClickOutside = (e) => {
      if (colorPopoverRef.current && !colorPopoverRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
      if (effectsPopoverRef.current && !effectsPopoverRef.current.contains(e.target)) {
        setShowEffectsPicker(false);
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
        synthRef.current.startNote(midiNum, 0);
        
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
            synth.playNote(note.midi, note.duration, audioStartTime, note.trackId);
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

  // 3. Web MIDI Connection & Live Notes manager
  const addLiveNote = (midi) => {
    const now = performance.now() / 1000;
    setLiveNotes(prev => {
      // Clean up finished notes older than 3.0s to prevent memory leaks
      const cleaned = prev.filter(n => n.endTime === null || now - n.endTime < 3.0);
      return [
        ...cleaned,
        {
          id: `live-${midi}-${now}-${Math.random()}`,
          midi,
          startTime: now,
          endTime: null
        }
      ];
    });
  };

  const releaseLiveNote = (midi) => {
    const now = performance.now() / 1000;
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
      
      for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = handleMidiMessage;
      }

      midiAccess.onstatechange = () => {
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
        input.onmidimessage = handleMidiMessage;
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
    const [status, note, velocity] = event.data;

    // Check for Sustain Pedal (CC 64)
    const isCC = status === 176;
    if (isCC && note === 64) {
      const pedalOn = velocity >= 64;
      setSustain(pedalOn);
      return;
    }

    const isNoteOn = status === 144 && velocity > 0;
    const isNoteOff = status === 128 || (status === 144 && velocity === 0);

    if (isNoteOn) {
      setActiveNotes(prev => {
        if (prev.includes(note)) return prev;
        return [...prev, note].sort((a, b) => a - b);
      });
      // Physical key click triggers synth sound immediately
      synthRef.current.init();
      synthRef.current.startNote(note, 0);
      
      // Feed note to live visualizer
      addLiveNote(note);
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
    synthRef.current.startNote(midiNum, 0);

    const now = performance.now() / 1000;
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

  const clearKeyboard = () => {
    setActiveNotes([]);
    setPlaybackActiveNotes([]);
    setLiveNotes([]);
  };

  // Cleanup synthesizer on component unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      synthRef.current.stopAll();
    };
  }, []);

  // --- RENDER MIDI Test Workspace ---
  return (
    <div className="midi-keyboard-full-container">
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
            <button
              className={`btn btn-sm ${Object.values(effectsConfig).some(Boolean) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowEffectsPicker(!showEffectsPicker)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                backgroundColor: Object.values(effectsConfig).some(Boolean) ? 'var(--accent-color)' : 'var(--bg-input)',
                color: Object.values(effectsConfig).some(Boolean) ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                boxShadow: Object.values(effectsConfig).some(Boolean) ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
                transition: 'all var(--transition-normal)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>✨ 特效设置</span>
            </button>

            {showEffectsPicker && (
              <div 
                className="effects-settings-popover"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
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
                  left: '0',
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>渐变显示</span>
                      <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                        <input 
                          type="checkbox" 
                          checked={customColorGradient}
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>配色方案 (最多5种)</span>
                      
                      {/* Color 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={customColor1Enabled}
                            onChange={() => handleToggleColorEnabled(1, customColor1Enabled)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '11px', color: customColor1Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 1</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor1Enabled ? 1 : 0.5 }}>
                            <input 
                              type="color" 
                              value={customColor1}
                              disabled={!customColor1Enabled}
                              onChange={(e) => setCustomColor1(e.target.value)}
                              className="color-picker-input"
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor1Enabled ? 1 : 0.5 }}>{customColor1.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Color 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={customColor2Enabled}
                            onChange={() => handleToggleColorEnabled(2, customColor2Enabled)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '11px', color: customColor2Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 2</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor2Enabled ? 1 : 0.5 }}>
                            <input 
                              type="color" 
                              value={customColor2}
                              disabled={!customColor2Enabled}
                              onChange={(e) => setCustomColor2(e.target.value)}
                              className="color-picker-input"
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor2Enabled ? 1 : 0.5 }}>{customColor2.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Color 3 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={customColor3Enabled}
                            onChange={() => handleToggleColorEnabled(3, customColor3Enabled)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '11px', color: customColor3Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 3</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor3Enabled ? 1 : 0.5 }}>
                            <input 
                              type="color" 
                              value={customColor3}
                              disabled={!customColor3Enabled}
                              onChange={(e) => setCustomColor3(e.target.value)}
                              className="color-picker-input"
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor3Enabled ? 1 : 0.5 }}>{customColor3.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Color 4 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={customColor4Enabled}
                            onChange={() => handleToggleColorEnabled(4, customColor4Enabled)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '11px', color: customColor4Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 4</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor4Enabled ? 1 : 0.5 }}>
                            <input 
                              type="color" 
                              value={customColor4}
                              disabled={!customColor4Enabled}
                              onChange={(e) => setCustomColor4(e.target.value)}
                              className="color-picker-input"
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor4Enabled ? 1 : 0.5 }}>{customColor4.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Color 5 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={customColor5Enabled}
                            onChange={() => handleToggleColorEnabled(5, customColor5Enabled)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '11px', color: customColor5Enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>颜色 5</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="color-picker-input-wrapper" style={{ width: '24px', height: '24px', opacity: customColor5Enabled ? 1 : 0.5 }}>
                            <input 
                              type="color" 
                              value={customColor5}
                              disabled={!customColor5Enabled}
                              onChange={(e) => setCustomColor5(e.target.value)}
                              className="color-picker-input"
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: customColor5Enabled ? 1 : 0.5 }}>{customColor5.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
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
                        onChange={(e) => setCustomColorDuration(parseFloat(e.target.value))}
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* Show/Hide Score Button (Only visible if score exists) */}
          {xmlContent && (
            <button
              className={`btn btn-sm ${showMidiScore ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => setShowMidiScore(!showMidiScore)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                transition: 'all var(--transition-normal)'
              }}
            >
              {showMidiScore ? '隐藏对照乐谱' : '显示对照乐谱'}
            </button>
          )}

          {/* Top Volume Slider */}
          <div className="control-slider-group" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Volume2 style={{ width: '13px', height: '13px', color: 'var(--text-secondary)' }} />
            <input 
              type="range"
              min={0}
              max={1.0}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="control-range-input"
              style={{ width: '70px', height: '3px' }}
            />
            <span className="slider-value-display" style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '28px' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {(activeNotes.length > 0 || liveNotes.length > 0) && (
          <button className="btn btn-secondary btn-sm" onClick={clearKeyboard}>清除</button>
        )}
      </div>
      )}

      {!focusMode && (
        <div className="chord-display-hero">
        <div className="chord-name-large">
          {detectedChord ? detectedChord : '弹奏或播放以检测和弦'}
        </div>
        <div className="active-notes-list">
          {mergedActiveNotes.length > 0 ? (
            mergedActiveNotes.map(m => (
              <span key={m} className="note-pill">
                {Midi.midiToNoteName(m)}
              </span>
            ))
          ) : (
            <span className="placeholder-text">等待音符输入...</span>
          )}
        </div>
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
            <div className="play-buttons">
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
              <button className="btn btn-secondary btn-sm" onClick={handleStop}>
                <Square style={{ width: '14px', height: '14px' }} />
                <span>停止</span>
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

            <div className="control-slider-group">
              <Volume2 style={{ width: '14px', height: '14px', color: 'var(--text-secondary)' }} />
              <input 
                type="range"
                min={0}
                max={1.0}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="control-range-input"
              />
              <span className="slider-value-display">{Math.round(volume * 100)}%</span>
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
        />
      </div>

      {/* 88-Key piano keyboard (Row 4, absolute bottom of full container) */}
      <div className="piano-keyboard-wrapper">
        <div className="piano-keys-container">
          {KEYS_88.map((key) => {
            const isPressed = mergedActiveNotes.includes(key.midi);
            return (
              <div
                key={key.midi}
                className={`piano-key-full ${key.isBlack ? 'black' : 'white'} ${isPressed ? 'pressed' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${key.left}%`,
                  width: `${key.width}%`
                }}
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
