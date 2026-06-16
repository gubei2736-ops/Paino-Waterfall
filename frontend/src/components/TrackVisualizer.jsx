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
  customColorDuration = 3.0
}) {
  const canvasRef = useRef(null);

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
        
        playbackNotes.forEach((note) => {
          const t_start = note.time;
          const t_end = note.time + note.duration;

          if (t_end >= T && t_start <= T + W) {
            if (!activeTracks.includes(note.trackId)) return;

            const key = KEYS_88.find(k => k.midi === note.midi);
            if (!key) return;

            const x = (key.left / 100) * w;
            const kw = (key.width / 100) * w;

            // Downward layout math
            const y_bottom = h - 2 - ((t_start - T) / W) * (h - 2);
            const y_top = h - 2 - ((t_end - T) / W) * (h - 2);
            const kh = Math.max(y_bottom - y_top, 3);

            const isActive = T >= t_start && T <= t_end;
            const colorPair = customColorsEnabled ? activeCustomColor : getTrackColor(note.trackId);

            const grad = ctx.createLinearGradient(x, y_top, x, y_bottom);
            grad.addColorStop(0, colorPair.start);
            grad.addColorStop(1, colorPair.end);

            ctx.fillStyle = grad;
            const radius = Math.min(kw / 2, 4);
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x, y_top, kw, kh, radius);
            } else {
              ctx.rect(x, y_top, kw, kh);
            }
            ctx.fill();

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
                ctx.roundRect(x, y_top, kw, kh, radius);
              } else {
                ctx.rect(x, y_top, kw, kh);
              }
              ctx.stroke();
              ctx.shadowBlur = 0;

              // Hit indicator flare
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(x + kw / 2, h - 2, Math.min(kw / 2, 5), 0, Math.PI, true);
              ctx.fill();
            }
          }
        });
      }

      // 3. Render live playing notes (flowing upwards)
      if (liveNotes && liveNotes.length > 0) {
        const now = performance.now() / 1000;
        
        liveNotes.forEach((note) => {
          const t_start = note.startTime;
          const t_end = note.endTime !== null ? note.endTime : now;

          // Check if live note is within the float window W
          if (now - t_start <= W || (note.endTime !== null && now - note.endTime <= W)) {
            const key = KEYS_88.find(k => k.midi === note.midi);
            if (!key) return;

            const x = (key.left / 100) * w;
            const kw = (key.width / 100) * w;

            // Upward layout math
            // Start of note (older) floats up further: y_top is smaller
            const y_bottom = h - 2 - ((now - t_end) / W) * (h - 2);
            const y_top = h - 2 - ((now - t_start) / W) * (h - 2);
            const kh = Math.max(y_bottom - y_top, 4);

            const isHolding = note.endTime === null;
            const colorPair = customColorsEnabled ? activeCustomColor : getTrackColor('live');

            const grad = ctx.createLinearGradient(x, y_top, x, y_bottom);
            // Gradients mirror direction of movement
            grad.addColorStop(0, colorPair.end);
            grad.addColorStop(1, colorPair.start);

            ctx.fillStyle = grad;
            const radius = Math.min(kw / 2, 4);
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x, y_top, kw, kh, radius);
            } else {
              ctx.rect(x, y_top, kw, kh);
            }
            ctx.fill();

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
                ctx.roundRect(x, y_top, kw, kh, radius);
              } else {
                ctx.rect(x, y_top, kw, kh);
              }
              ctx.stroke();
              ctx.shadowBlur = 0;

              // Key hit flash
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(x + kw / 2, h - 2, Math.min(kw / 2, 5), 0, Math.PI, true);
              ctx.fill();
            }
          }
        });
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
    customColorDuration
  ]);

  return (
    <div className="track-visualizer-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
