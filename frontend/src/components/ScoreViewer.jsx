import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { injectNoteNamesToXml } from '../utils/xmlModifier';

export default function ScoreViewer({ xmlContent, annotationMode, zoom }) {
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
    const loadScore = async () => {
      if (!osmdRef.current || !xmlContent) return;
      
      setLoading(true);
      setError('');
      
      // Check if it is a MIDI JSON content
      if (typeof xmlContent === 'string' && xmlContent.trim().startsWith('{')) {
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
      
      try {
        // Inject note names into XML before loading into OSMD
        const processedXml = injectNoteNamesToXml(xmlContent);
        
        await osmdRef.current.load(processedXml);
        
        applyRules();
        osmdRef.current.render();
      } catch (err) {
        console.error('Error rendering MusicXML score:', err);
        setError('无法绘制乐谱，请检查文件格式。');
      } finally {
        setLoading(false);
      }
    };
    
    loadScore();
  }, [xmlContent]);

  // 3. Listen to rules change (Annotation Mode & Zoom)
  useEffect(() => {
    if (!osmdRef.current || !osmdRef.current.sheet) return;
    
    try {
      applyRules();
      osmdRef.current.render();
    } catch (err) {
      console.error('Error applying engraving rules:', err);
    }
  }, [annotationMode, zoom]);

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
