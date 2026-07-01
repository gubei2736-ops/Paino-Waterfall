import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { injectNoteNamesToXml } from '../utils/xmlModifier';

export default function ScoreViewer({ xmlContent, annotationMode, zoom, playbackTime, isPlaying, bpm, onNoteClick }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Initialize OSMD instance
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      try {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: "canvas", // Use HTML5 Canvas to speed up rendering and lower DOM tree recalculation overhead
          drawTitle: true,
          drawSubtitle: true,
          drawCredits: false,
          drawLyrics: true, // Enable lyrics rendering so note names show up
          drawPartNames: true,
          coloringEnabled: true,
          colorNotes: true // Colors note heads differently if specified
        });
      } catch (err) {
        console.error('Failed to initialize OpenSheetMusicDisplay:', err);
        setError('乐谱渲染引擎初始化失败');
      }
    }
    
    return () => {
      if (osmdRef.current) {
        try {
          osmdRef.current.clear();
        } catch (e) {}
      }
    };
  }, []);

  // 2. Load XML Content and render
  useEffect(() => {
    let active = true;
    const loadScore = async () => {
      if (!osmdRef.current || !xmlContent) return;
      
      setLoading(true);
      setError('');
      
      // Check if it is a MIDI JSON content
      if (typeof xmlContent === 'string' && xmlContent.trim().startsWith('{')) {
        if (!active) return;
        setError('');
        setLoading(false);
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="midi-placeholder-box" style="
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              padding: 40px;
              color: var(--text-secondary);
              text-align: center;
              font-family: 'Outfit', sans-serif;
            ">
              <span style="font-size: 48px; margin-bottom: 16px;">🎵</span>
              <h4 style="color: var(--text-primary); font-size: 16px; margin-bottom: 8px; font-weight: 500;">MIDI 乐谱数据已加载</h4>
              <p style="font-size: 13px; max-width: 300px; line-height: 1.5; color: var(--text-muted);">MIDI 文件不含可视化五线谱符号。请在右下方控制栏中点击“播放”即可在瀑布流中播放显示音符。</p>
            </div>
          `;
        }
        return;
      }
      
      // Yield thread (50ms delay) to let React paint the loading spinner state and start CSS animation
      await new Promise(resolve => setTimeout(resolve, 50));
      if (!active) return;
      
      try {
        // Inject note names into XML before loading into OSMD
        const processedXml = injectNoteNamesToXml(xmlContent);
        
        await osmdRef.current.load(processedXml);
        if (!active) return;
        
        applyRules();
        osmdRef.current.render();
        
        if (osmdRef.current.cursor) {
          osmdRef.current.cursor.show();
          osmdRef.current.cursor.reset();
        }
      } catch (err) {
        console.error('Error rendering MusicXML score:', err);
        if (active) setError('无法绘制乐谱，请检查文件格式。');
      } finally {
        if (active) setLoading(false);
      }
    };
    
    loadScore();
    return () => {
      active = false;
    };
  }, [xmlContent]);

  // 3. Listen to rules change (Annotation Mode & Zoom)
  useEffect(() => {
    if (!osmdRef.current || !osmdRef.current.sheet) return;
    
    try {
      applyRules();
      osmdRef.current.render();
      
      if (osmdRef.current.cursor) {
        osmdRef.current.cursor.show();
        osmdRef.current.cursor.reset();
      }
    } catch (err) {
      console.error('Error applying engraving rules:', err);
    }
  }, [annotationMode, zoom]);

  // 4. Playback Cursor Follow (without scrolling)
  useEffect(() => {
    try {
      const osmd = osmdRef.current;
      if (!osmd || !osmd.cursor) return;

      if (!isPlaying) {
        if (playbackTime < 0.1) {
          osmd.cursor.reset();
        }
        return;
      }

      // Convert playbackTime (seconds) to beats (quarterLength)
      const currentBeat = (playbackTime * (bpm || 120)) / 60.0;

      // Reset cursor to start if playback is at the beginning
      if (playbackTime < 0.15) {
        osmd.cursor.reset();
      }

      // Step cursor forward while cursor beat is less than currentBeat
      let count = 0;
      while (osmd.cursor.iterator && 
             osmd.cursor.iterator.currentTime && 
             osmd.cursor.iterator.currentTime.RealValue * 4.0 < currentBeat) {
        if (osmd.cursor.iterator.isAtEnd()) break;
        osmd.cursor.next();
        count++;
        if (count > 800) break; // Infinite loop guard
      }

      // Step cursor backward (by resetting and stepping forward) if play position jumped backwards
      if (osmd.cursor.iterator && 
          osmd.cursor.iterator.currentTime && 
          osmd.cursor.iterator.currentTime.RealValue * 4.0 > currentBeat + 0.4) {
        osmd.cursor.reset();
        count = 0;
        while (osmd.cursor.iterator && 
               osmd.cursor.iterator.currentTime && 
               osmd.cursor.iterator.currentTime.RealValue * 4.0 < currentBeat) {
          if (osmd.cursor.iterator.isAtEnd()) break;
          osmd.cursor.next();
          count++;
          if (count > 800) break; // Infinite loop guard
        }
      }
    } catch (e) {
      console.error("Error in ScoreViewer cursor playback sync:", e);
    }
  }, [playbackTime, isPlaying, bpm]);

  // 5. Click on score to seek/jump
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onNoteClick) return;

    const handleClick = (e) => {
      const osmd = osmdRef.current;
      if (!osmd || !osmd.GraphicSheet) return;

      const rect = container.getBoundingClientRect();
      // Click position relative to the container's scroll content
      const clickX = e.clientX - rect.left + container.scrollLeft;
      const clickY = e.clientY - rect.top + container.scrollTop;

      let closestMeasure = null;
      let minDistance = Infinity;

      const unitInPixels = osmd.GraphicSheet.unitInPixels;
      const systems = osmd.GraphicSheet.MusicSystems || [];

      for (let s = 0; s < systems.length; s++) {
        const system = systems[s];
        for (let sl = 0; sl < (system.StaffLines || []).length; sl++) {
          const staffLine = system.StaffLines[sl];
          for (let m = 0; m < (staffLine.Measures || []).length; m++) {
            const measure = staffLine.Measures[m];
            const bbox = measure.PositionAndSize;
            if (!bbox) continue;

            // Bounding box in pixels
            const mX = bbox.x * unitInPixels;
            const mY = bbox.y * unitInPixels;
            const mW = bbox.width * unitInPixels;
            const mH = bbox.height * unitInPixels;

            // Check if click coordinates fall inside the measure box
            if (clickX >= mX && clickX <= mX + mW && clickY >= mY && clickY <= mY + mH) {
              closestMeasure = measure;
              minDistance = 0;
              break;
            }

            // Fallback: track closest measure by Euclidean distance to center
            const centerX = mX + mW / 2;
            const centerY = mY + mH / 2;
            const dist = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));
            if (dist < minDistance) {
              minDistance = dist;
              closestMeasure = measure;
            }
          }
          if (closestMeasure && minDistance === 0) break;
        }
        if (closestMeasure && minDistance === 0) break;
      }

      if (closestMeasure && closestMeasure.parentSourceMeasure) {
        const absoluteBeat = closestMeasure.parentSourceMeasure.AbsoluteTimestamp.RealValue * 4.0;
        const timeInSeconds = absoluteBeat * 60.0 / (bpm || 120);
        
        console.log(`[ScoreViewer] Jumped to measure ${closestMeasure.MeasureNumber}, beat ${absoluteBeat}, time: ${timeInSeconds}s`);
        onNoteClick(timeInSeconds);
      }
    };

    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [onNoteClick, bpm]);

  const applyRules = () => {
    const osmd = osmdRef.current;
    if (!osmd) return;

    // Set Zoom Factor
    osmd.Zoom = zoom;

    // Adjust lyric spacing rules to prevent horizontal collisions of note name labels
    osmd.rules.BetweenSyllableMinimumDistance = 18.0; // Minimum horizontal distance between labels
    osmd.rules.MaximumLyricsElongationFactor = 3.5;   // Allows measure width to expand to accommodate labels
    osmd.rules.LyricsXPaddingFactorForLongLyrics = 4.0; // Additional horizontal padding for long labels

    // Toggle rules based on annotationMode
    // Modes: 'none', 'chords', 'notes', 'both'
    switch (annotationMode) {
      case 'none':
        osmd.rules.RenderLyrics = false;
        osmd.rules.RenderChordSymbols = false;
        break;
      case 'notes':
        osmd.rules.RenderLyrics = true;
        osmd.rules.RenderChordSymbols = false;
        break;
      default:
        break;
    }
  };

  return (
    <div className="score-viewer-wrapper">
      {loading && (
        <div className="score-loader">
          <div className="spinner"></div>
          <p>正在解析并绘制五线谱...</p>
        </div>
      )}
      {error && (
        <div className="score-error-alert">
          <p>{error}</p>
        </div>
      )}
      <div ref={containerRef} className="osmd-container-element" />
    </div>
  );
}
