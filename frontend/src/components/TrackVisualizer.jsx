import React, { useRef, useEffect } from 'react';
import { KEYS_88 } from '../utils/keyboardLayout';

const getNoteName = (midi) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const noteName = notes[midi % 12];
  return `${noteName}${octave}`;
};

const interpolateColor = (color1, color2, factor) => {
  const parseHex = (hex) => {
    if (hex.startsWith('rgb')) {
      const parts = hex.match(/\d+/g);
      return { r: parseInt(parts[0]), g: parseInt(parts[1]), b: parseInt(parts[2]) };
    }
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return { r, g, b };
  };
  try {
    const c1 = parseHex(color1);
    const c2 = parseHex(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  } catch (e) {
    return color1;
  }
};

const hexToRgba = (hex, alpha) => {
  if (!hex) return `rgba(255, 255, 255, ${alpha})`;
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d\.]+\)$/, `${alpha})`);
  }
  if (hex.startsWith('rgb')) {
    return hex.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  }
  const c = hex.replace('#', '');
  if (c.length === 3) {
    const r = parseInt(c[0] + c[0], 16);
    const g = parseInt(c[1] + c[1], 16);
    const b = parseInt(c[2] + c[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const drawDiamond = (ctx, x, y, size, angle, color, alpha) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawCrossStar = (ctx, x, y, size, angle, color, alpha) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 8;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.5);
  ctx.quadraticCurveTo(0, 0, size * 1.5, 0);
  ctx.quadraticCurveTo(0, 0, 0, size * 1.5);
  ctx.quadraticCurveTo(0, 0, -size * 1.5, 0);
  ctx.quadraticCurveTo(0, 0, 0, -size * 1.5);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawBubble = (ctx, x, y, radius, color) => {
  ctx.save();
  // Translucent bubble body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // White outline shell
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Reflection highlight arc (top-left)
  ctx.beginPath();
  ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, Math.PI, 1.5 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
};

export default function TrackVisualizer({ 
  playbackNotes = [], 
  liveNotes = [], 
  currentTimeRef, 
  activeTracks, 
  isPlaying, 
  windowTime = 2.0,
  showNoteNames = true,
  customColorsEnabled = false,
  customColorGradient = true,
  customColor1 = '#ff007f',
  customColor2 = '#7f00ff',
  customColor3 = '#00f2fe',
  customColor4 = '#10b981',
  customColor5 = '#f59e0b',
  customColor1Enabled = true,
  customColor2Enabled = true,
  customColor3Enabled = false,
  customColor4Enabled = false,
  customColor5Enabled = false,
  customColorDuration = 3.0,
  effectsConfig = { bubbles: true }
}) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const prevActiveMidisRef = useRef([]);
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Handle High DPI screens
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track colors (gradient pairs)
    const colors = [
      { start: '#6366f1', end: '#8b5cf6' }, // Indigo -> Violet
      { start: '#ec4899', end: '#f43f5e' }, // Pink -> Rose
      { start: '#06b6d4', end: '#0891b2' }, // Cyan -> Dark Cyan
      { start: '#10b981', end: '#059669' }, // Emerald -> Green
      { start: '#f59e0b', end: '#d97706' }, // Amber -> Orange
    ];

    const getTrackColor = (trackId) => {
      if (trackId === 'live') {
        // Neon cyan to bright electric blue for live playing
        return { start: '#00f2fe', end: '#4facfe' };
      }
      const idx = trackId % colors.length;
      return colors[idx];
    };

    // Main Canvas Render Loop
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const noteBarsOpacity = (effectsConfig && effectsConfig.noteBarsOpacity !== undefined) ? effectsConfig.noteBarsOpacity : 1.0;

      // Helper to check if a midi note is black key
      const isMidiBlack = (midi) => {
        const key = KEYS_88.find(k => k.midi === midi);
        return key ? key.isBlack : false;
      };

      const drawPlaybackNote = (note, T) => {
        const t_start = note.time;
        const t_end = note.time + note.duration;

        if (t_end >= T && t_start <= T + W) {
          if (!activeTracks.includes(note.trackId)) return;

          const key = KEYS_88.find(k => k.midi === note.midi);
          if (!key) return;

          const x = (key.left / 100) * w;
          const kw = (key.width / 100) * w;
          
          // Use black key width for all note bars to make them uniform
          const blackKeyWidthPercent = (100 / 52) * 0.65;
          const targetWidth = (blackKeyWidthPercent / 100) * w;
          const margin = 1.5;
          const drawWidth = Math.max(1, targetWidth - margin * 2);
          const drawX = x + kw / 2 - drawWidth / 2;

          // Downward layout math
          const y_bottom = h - 2 - ((t_start - T) / W) * (h - 2);
          const y_top = h - 2 - ((t_end - T) / W) * (h - 2);
          const kh = Math.max(y_bottom - y_top, 3);

          const isActive = T >= t_start && T <= t_end;
          const colorPair = customColorsEnabled ? activeCustomColor : getTrackColor(note.trackId);

          const grad = ctx.createLinearGradient(drawX, y_top, drawX, y_bottom);
          grad.addColorStop(0, colorPair.start);
          grad.addColorStop(1, colorPair.end);

          if (noteBarsOpacity > 0.01) {
            ctx.save();
            ctx.globalAlpha = noteBarsOpacity;

            // Draw note bar
            ctx.fillStyle = grad;
            const radius = Math.min(drawWidth / 2, 4);
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(drawX, y_top, drawWidth, kh, radius);
            } else {
              ctx.rect(drawX, y_top, drawWidth, kh);
            }
            ctx.fill();

            // Subtle dark border to distinguish overlapping or adjacent bars
            ctx.strokeStyle = 'rgba(11, 12, 16, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw note name inside the note bar if showNoteNames is true and there is enough height
            if (showNoteNames && kh >= 20) {
              ctx.save();
              const noteText = getNoteName(note.midi);
              const tx = x + kw / 2;
              const ty = y_top + kh / 2;
              
              ctx.font = 'bold 10px "Outfit", "Noto Sans SC", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Draw black text outline to prevent low-contrast on bright neon note bars
              ctx.strokeStyle = '#0b0c10';
              ctx.lineWidth = 3;
              ctx.lineJoin = 'round';
              ctx.strokeText(noteText, tx, ty);
              
              // Draw text fill
              ctx.fillStyle = '#FFF8E1';
              ctx.fillText(noteText, tx, ty);
              ctx.restore();
            }

            if (isActive) {
              ctx.shadowBlur = 8;
              ctx.shadowColor = colorPair.start;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(drawX, y_top, drawWidth, kh, radius);
              } else {
                ctx.rect(drawX, y_top, drawWidth, kh);
              }
              ctx.stroke();
              ctx.shadowBlur = 0;
            }

            ctx.restore();
          }

          if (isActive) {
            // Hit indicator flare
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + kw / 2, h - 2, Math.min(drawWidth / 2, 5), 0, Math.PI, true);
            ctx.fill();
          }
        }
      };

      const drawLiveNote = (note, now) => {
        const t_start = note.startTime;
        const t_end = note.endTime !== null ? note.endTime : now;

        // Check if live note is within the float window W
        if (note.endTime === null || now - note.endTime <= W) {
          const key = KEYS_88.find(k => k.midi === note.midi);
          if (!key) return;

          const x = (key.left / 100) * w;
          const kw = (key.width / 100) * w;

          // Use black key width for all note bars to make them uniform
          const blackKeyWidthPercent = (100 / 52) * 0.65;
          const targetWidth = (blackKeyWidthPercent / 100) * w;
          const margin = 1.5;
          const drawWidth = Math.max(1, targetWidth - margin * 2);
          const drawX = x + kw / 2 - drawWidth / 2;

          // Upward layout math
          // Start of note (older) floats up further: y_top is smaller
          const y_bottom = h - 2 - ((now - t_end) / W) * (h - 2);
          const y_top = h - 2 - ((now - t_start) / W) * (h - 2);
          const kh = Math.max(y_bottom - y_top, 4);

          const isHolding = note.endTime === null;
          const colorPair = customColorsEnabled ? activeCustomColor : getTrackColor('live');

          const grad = ctx.createLinearGradient(drawX, y_top, drawX, y_bottom);
          // Gradients mirror direction of movement
          grad.addColorStop(0, colorPair.end);
          grad.addColorStop(1, colorPair.start);

          if (noteBarsOpacity > 0.01) {
            ctx.save();
            ctx.globalAlpha = noteBarsOpacity;

            ctx.fillStyle = grad;
            const radius = Math.min(drawWidth / 2, 4);
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(drawX, y_top, drawWidth, kh, radius);
            } else {
              ctx.rect(drawX, y_top, drawWidth, kh);
            }
            ctx.fill();

            // Subtle dark border to distinguish overlapping or adjacent bars
            ctx.strokeStyle = 'rgba(11, 12, 16, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw note name inside the note bar if showNoteNames is true and there is enough height
            if (showNoteNames && kh >= 20) {
              ctx.save();
              const noteText = getNoteName(note.midi);
              const tx = x + kw / 2;
              const ty = y_top + kh / 2;
              
              ctx.font = 'bold 10px "Outfit", "Noto Sans SC", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Draw black text outline to prevent low-contrast on bright neon note bars
              ctx.strokeStyle = '#0b0c10';
              ctx.lineWidth = 3;
              ctx.lineJoin = 'round';
              ctx.strokeText(noteText, tx, ty);
              
              // Draw text fill
              ctx.fillStyle = '#FFF8E1';
              ctx.fillText(noteText, tx, ty);
              ctx.restore();
            }

            // Glow effect for notes currently being held down
            if (isHolding) {
              ctx.shadowBlur = 10;
              ctx.shadowColor = colorPair.start;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(drawX, y_top, drawWidth, kh, radius);
              } else {
                ctx.rect(drawX, y_top, drawWidth, kh);
              }
              ctx.stroke();
              ctx.shadowBlur = 0;
            }

            ctx.restore();
          }

          if (isHolding) {
            // Key hit flash
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + kw / 2, h - 2, Math.min(drawWidth / 2, 5), 0, Math.PI, true);
            ctx.fill();
          }
        }
      };
      
      // Clear canvas
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(0, 0, w, h);

      // Calculate dynamic custom color ratio if enabled
      let activeCustomColor = null;
      if (customColorsEnabled) {
        const activeColors = [];
        if (customColor1Enabled) activeColors.push(customColor1);
        if (customColor2Enabled) activeColors.push(customColor2);
        if (customColor3Enabled) activeColors.push(customColor3);
        if (customColor4Enabled) activeColors.push(customColor4);
        if (customColor5Enabled) activeColors.push(customColor5);

        // Fallback check
        if (activeColors.length === 0) {
          activeColors.push(customColor1);
        }

        const N = activeColors.length;
        if (N === 1) {
          const col = activeColors[0];
          activeCustomColor = { start: col, end: col };
        } else {
          const t = performance.now() / 1000;
          const D = customColorDuration;
          const T_trans = 1.0; // 1s transition
          const stepTime = D + T_trans;
          const period = N * stepTime;
          const cycle = t % period;
          
          const currentIndex = Math.floor(cycle / stepTime);
          const nextIndex = (currentIndex + 1) % N;
          
          const inStepTime = cycle % stepTime;
          let ratio = 0.0;
          if (inStepTime < D) {
            ratio = 0.0;
          } else {
            ratio = (inStepTime - D) / T_trans;
          }
          
          const c_curr = activeColors[currentIndex];
          const c_next = activeColors[nextIndex];
          
          const start = interpolateColor(c_curr, c_next, ratio);
          
          if (customColorGradient) {
            const end = interpolateColor(c_next, c_curr, ratio);
            activeCustomColor = { start, end };
          } else {
            activeCustomColor = { start, end: start };
          }
        }
      }

      // 1. Draw piano roll background columns
      KEYS_88.forEach((key) => {
        const x = (key.left / 100) * w;
        const kw = (key.width / 100) * w;

        if (key.isBlack) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(x, 0, kw, h);
        }
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      });

      // Target hitline
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h - 2);
      ctx.lineTo(w, h - 2);
      ctx.stroke();

      const W = windowTime;

      // 2. Render falling playback notes (flowing downwards)
      if (playbackNotes && playbackNotes.length > 0) {
        const T = currentTimeRef.current || 0;
        
        // Pass 1: Draw white key playback notes
        playbackNotes.forEach((note) => {
          if (isMidiBlack(note.midi)) return;
          drawPlaybackNote(note, T);
        });

        // Pass 2: Draw black key playback notes (on top of white key notes)
        playbackNotes.forEach((note) => {
          if (!isMidiBlack(note.midi)) return;
          drawPlaybackNote(note, T);
        });
      }

      // 3. Render live playing notes (flowing upwards)
      if (liveNotes && liveNotes.length > 0) {
        const now = performance.now() / 1000;
        
        // Pass 1: Draw white key live notes
        liveNotes.forEach((note) => {
          if (isMidiBlack(note.midi)) return;
          drawLiveNote(note, now);
        });

        // Pass 2: Draw black key live notes (on top of white key notes)
        liveNotes.forEach((note) => {
          if (!isMidiBlack(note.midi)) return;
          drawLiveNote(note, now);
        });
      }

      // 3.5. Update and Draw Particles
      const bubblesEnabled = effectsConfig && effectsConfig.bubbles;
      const waterCurrentEnabled = effectsConfig && effectsConfig.waterCurrent;
      const loveLetterEnabled = effectsConfig && effectsConfig.loveLetter;

      if (bubblesEnabled || waterCurrentEnabled || loveLetterEnabled) {
        const nowMs = performance.now();
        const lastTime = lastFrameTimeRef.current || nowMs;
        const dtReal = Math.min((nowMs - lastTime) / 1000, 0.1);
        lastFrameTimeRef.current = nowMs;

        // Tracking active notes
        const activeMidis = [];

        // Check active playback notes
        if (playbackNotes && playbackNotes.length > 0) {
          const T = currentTimeRef.current || 0;
          playbackNotes.forEach(note => {
            const t_start = note.time;
            const t_end = note.time + note.duration;
            if (t_end >= T && t_start <= T + W && activeTracks.includes(note.trackId)) {
              if (T >= t_start && T <= t_end) {
                activeMidis.push(note.midi);
              }
            }
          });
        }

        // Check active live notes
        if (liveNotes && liveNotes.length > 0) {
          liveNotes.forEach(note => {
            if (note.endTime === null) {
              activeMidis.push(note.midi);
            }
          });
        }

        const uniqueActiveMidis = [...new Set(activeMidis)];
        const prevActiveMidis = prevActiveMidisRef.current || [];

        // Color helper
        const getActiveNoteColor = (midi) => {
          if (customColorsEnabled && activeCustomColor) {
            return activeCustomColor;
          }
          const T = currentTimeRef.current || 0;
          const activePlaybackNote = playbackNotes.find(n => 
            n.midi === midi && T >= n.time && T <= n.time + n.duration && activeTracks.includes(n.trackId)
          );
          if (activePlaybackNote) {
            return getTrackColor(activePlaybackNote.trackId);
          }
          return getTrackColor('live');
        };

        uniqueActiveMidis.forEach(midi => {
          const key = KEYS_88.find(k => k.midi === midi);
          if (!key) return;

          const x = (key.left / 100) * w;
          const kw = (key.width / 100) * w;
          const centerX = x + kw / 2;
          const noteColor = getActiveNoteColor(midi);

          // A. Trigger Glow Flash and Particle burst on new key press
          if (!prevActiveMidis.includes(midi)) {
            // Glow flare at the hit line
            particlesRef.current.push({
              type: 'glow',
              x: centerX,
              y: h - 2,
              life: 0.3,
              maxLife: 0.3,
              size: kw * 1.5,
              color: noteColor,
            });

            // Initial bubble burst
            if (bubblesEnabled) {
              const bubbleCount = 4 + Math.floor(Math.random() * 3);
              for (let i = 0; i < bubbleCount; i++) {
                particlesRef.current.push({
                  type: 'bubble',
                  x0: centerX,
                  x: centerX,
                  y: h - 2 - Math.random() * 10,
                  vy: (-35 - Math.random() * 45) * 3.0,
                  life: 3.0 + Math.random() * 2.0,
                  maxLife: 5.0,
                  size: 2.0 + Math.random() * 4.0,
                  color: noteColor.start,
                  tOffset: Math.random() * Math.PI * 2,
                  freq: 3.5 + Math.random() * 3.5,
                  amp: 2.5 + Math.random() * 3.5,
                });
              }
            }

            // Initial water current burst
            if (waterCurrentEnabled) {
              const bioColor = customColorsEnabled 
                ? noteColor.start 
                : interpolateColor(noteColor.start, '#00f2fe', 0.5);
              const leaderCount = 2;
              for (let i = 0; i < leaderCount; i++) {
                particlesRef.current.push({
                  type: 'currentLeader',
                  x0: centerX,
                  x: centerX,
                  y: h - 2 - Math.random() * 10,
                  vy: -150 - Math.random() * 80,
                  life: 2.0 + Math.random() * 1.5,
                  maxLife: 3.5,
                  color: bioColor,
                  tOffset: Math.random() * Math.PI * 2 + i * Math.PI,
                  freq: 6.0 + Math.random() * 3.0,
                  amp: 8.0 + Math.random() * 6.0,
                });
              }
            }

            // Initial love letter (SeeMusic style spark fountain) burst
            if (loveLetterEnabled) {
              const sparkCount = 18 + Math.floor(Math.random() * 12);
              for (let i = 0; i < sparkCount; i++) {
                particlesRef.current.push({
                  type: 'seeMusicSpark',
                  x0: centerX,
                  x: centerX,
                  y: h - 2 - Math.random() * 8,
                  vx: (Math.random() - 0.5) * 80,
                  vy: -150 - Math.random() * 180,
                  ay: 90 + Math.random() * 60,
                  life: 0.6 + Math.random() * 0.8,
                  maxLife: 1.4,
                  size: 1.5 + Math.random() * 2.0,
                  color: noteColor.start,
                  shape: Math.random() < 0.4 ? 'diamond' : 'crossStar',
                  angle: Math.random() * Math.PI * 2,
                  rotSpeed: -4.0 + Math.random() * 8.0,
                });
              }
            }
          }

          // B. Continuous emission while key is held
          if (bubblesEnabled && Math.random() < 0.1) {
            particlesRef.current.push({
              type: 'bubble',
              x0: centerX,
              x: centerX,
              y: h - 2,
              vy: (-35 - Math.random() * 45) * 3.0,
              life: 3.0 + Math.random() * 2.0,
              maxLife: 5.0,
              size: 1.8 + Math.random() * 3.5,
              color: noteColor.start,
              tOffset: Math.random() * Math.PI * 2,
              freq: 3.5 + Math.random() * 3.5,
              amp: 2.5 + Math.random() * 3.5,
            });
          }

          if (waterCurrentEnabled && Math.random() < 0.08) {
            const bioColor = customColorsEnabled 
              ? noteColor.start 
              : interpolateColor(noteColor.start, '#00f2fe', 0.5);
            particlesRef.current.push({
              type: 'currentLeader',
              x0: centerX,
              x: centerX,
              y: h - 2,
              vy: -150 - Math.random() * 80,
              life: 2.0 + Math.random() * 1.5,
              maxLife: 3.5,
              color: bioColor,
              tOffset: Math.random() * Math.PI * 2,
              freq: 6.0 + Math.random() * 3.0,
              amp: 8.0 + Math.random() * 6.0,
            });
          }

          if (loveLetterEnabled) {
            const count = Math.random() < 0.7 ? 1 : 2;
            for (let i = 0; i < count; i++) {
              particlesRef.current.push({
                type: 'seeMusicSpark',
                x0: centerX,
                x: centerX,
                y: h - 2,
                vx: (Math.random() - 0.5) * 60,
                vy: -120 - Math.random() * 150,
                ay: 95 + Math.random() * 55,
                life: 0.6 + Math.random() * 0.8,
                maxLife: 1.4,
                size: 1.2 + Math.random() * 1.8,
                color: noteColor.start,
                shape: Math.random() < 0.4 ? 'diamond' : 'crossStar',
                angle: Math.random() * Math.PI * 2,
                rotSpeed: -4.0 + Math.random() * 8.0,
              });
            }
          }
        });

        prevActiveMidisRef.current = uniqueActiveMidis;

        const newSpawned = [];

        // Draw and update particles
        particlesRef.current.forEach(p => {
          if (p.type === 'glow') {
            p.life -= dtReal;
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.save();
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            grad.addColorStop(0, p.color.start);
            grad.addColorStop(0.3, p.color.start);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.globalAlpha = alpha * 0.75;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (p.type === 'bubble') {
            p.tOffset += dtReal;
            p.y += p.vy * dtReal;
            p.x = p.x0 + Math.sin(p.tOffset * p.freq) * p.amp;
            p.life -= dtReal;

            const alpha = Math.max(0, Math.min(p.life / 0.4, 1.0));
            ctx.save();
            ctx.globalAlpha = alpha * 0.6; // translucent bubbles
            drawBubble(ctx, p.x, p.y, p.size, p.color);
            ctx.restore();
          } else if (p.type === 'currentLeader') {
            p.tOffset += dtReal;
            p.y += p.vy * dtReal;
            p.x = p.x0 + Math.sin(p.tOffset * p.freq) * p.amp + Math.cos(p.tOffset * p.freq * 0.4) * (p.amp * 0.5);
            p.life -= dtReal;

            // Spawn trailing algae particles (reduced to exactly 25% of the initial rate)
            if (Math.random() < 0.25) {
              const spawnCount = Math.random() < 0.5 ? 1 : 2;
              for (let i = 0; i < spawnCount; i++) {
                newSpawned.push({
                  type: 'algae',
                  x0: p.x,
                  x: p.x,
                  y: p.y,
                  vy: p.vy * 0.15 - Math.random() * 15,
                  life: 1.0 + Math.random() * 0.8,
                  maxLife: 1.8,
                  size: 1.0 + Math.random() * 1.8,
                  color: p.color,
                  theta: Math.random() * Math.PI * 2,
                  rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 5),
                  radius: 1.0 + Math.random() * 3.0,
                });
              }
            }

            // Draw leader bubble core
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(p.life / 0.3, 0.75));
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();
          } else if (p.type === 'algae') {
            p.theta += p.rotSpeed * dtReal;
            p.radius += 5.0 * dtReal; // slowly expand trail to simulate water diffusion
            p.y += p.vy * dtReal;
            p.x = p.x0 + Math.cos(p.theta) * p.radius;
            p.life -= dtReal;

            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = hexToRgba(p.color, alpha * 0.95);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (p.type === 'seeMusicSpark') {
            p.vy += p.ay * dtReal;
            if (p.vy > 0) p.vy = 0;

            p.y += p.vy * dtReal;
            p.x += p.vx * dtReal;
            p.angle += p.rotSpeed * dtReal;
            p.life -= dtReal;

            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            if (p.shape === 'diamond') {
              drawDiamond(ctx, p.x, p.y, p.size, p.angle, p.color, alpha * 0.9);
            } else {
              drawCrossStar(ctx, p.x, p.y, p.size, p.angle, p.color, alpha * 0.95);
            }
            ctx.restore();
          }
        });

        if (newSpawned.length > 0) {
          particlesRef.current.push(...newSpawned);
        }

        // Cleanup
        particlesRef.current = particlesRef.current.filter(p => p.life > 0 && p.y > -50);
      } else {
        particlesRef.current = [];
        prevActiveMidisRef.current = [];
        lastFrameTimeRef.current = performance.now();
      }

      // 4. Center prompt if no notes are present at all
      const hasPlaybackNotes = playbackNotes && playbackNotes.length > 0;
      const hasLiveNotes = liveNotes && liveNotes.length > 0;
      if (!hasPlaybackNotes && !hasLiveNotes) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px "Outfit", "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('在 MIDI 键盘/电脑键盘弹奏 (A-L/W-P) 或点击琴键，即可实时显示音符瀑布流！', w / 2, h / 2 - 10);
        ctx.fillText('（上传乐谱后，将在此处激活多声部乐谱播放器）', w / 2, h / 2 + 15);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    playbackNotes, 
    liveNotes, 
    activeTracks, 
    windowTime, 
    showNoteNames,
    customColorsEnabled,
    customColorGradient,
    customColor1,
    customColor2,
    customColor3,
    customColor4,
    customColor5,
    customColor1Enabled,
    customColor2Enabled,
    customColor3Enabled,
    customColor4Enabled,
    customColor5Enabled,
    customColorDuration,
    effectsConfig
  ]);

  return (
    <div className="track-visualizer-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
