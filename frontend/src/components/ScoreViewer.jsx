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
