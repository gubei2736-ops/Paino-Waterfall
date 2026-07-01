import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Music, 
  UploadCloud, 
  ZoomIn, 
  ZoomOut, 
  Info,
  Menu,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Download,
  X
} from 'lucide-react';
import ScoreViewer from './components/ScoreViewer';
import MidiKeyboard from './components/MidiKeyboard';
import soundSynth from './utils/soundSynth';
import { parseMidiFile } from './utils/midiParser';

export default function App() {
  // Score slot 1 (上)
  const [xmlContent, setXmlContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [isImageFile, setIsImageFile] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  // Score slot 2 (下)
  const [xmlContent2, setXmlContent2] = useState('');
  const [pdfUrl2, setPdfUrl2] = useState('');
  const [isImageFile2, setIsImageFile2] = useState(false);
  const [uploadedFile2, setUploadedFile2] = useState(null);

  const [activeScoreTitle, setActiveScoreTitle] = useState('未选择乐谱');
  const [soundSourceType, setSoundSourceType] = useState('默认钢琴音源 (Salamander)');
  const [soundfontsList, setSoundfontsList] = useState({});
  const [selectedSoundfont, setSelectedSoundfont] = useState('default');

  useEffect(() => {
    // Start preloading the Salamander grand piano samples immediately on app mount
    soundSynth.init();
    
    // Fetch soundfonts list from backend
    const fetchSoundfonts = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/soundfonts');
        if (response.ok) {
          const data = await response.json();
          setSoundfontsList(data);
        }
      } catch (err) {
        console.error('Failed to fetch soundfonts list from backend:', err);
      }
    };
    fetchSoundfonts();
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    return () => {
      if (pdfUrl2) URL.revokeObjectURL(pdfUrl2);
    };
  }, [pdfUrl2]);
  
  // Scoring parameters
  const [annotationMode, setAnnotationMode] = useState('none'); // 'none', 'notes'
  const [midiScoreZoom, setMidiScoreZoom] = useState(0.7); // default 0.7 for split panel
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMidiScore, setShowMidiScore] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  // Playback sync states for score follower
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBpm, setPlaybackBpm] = useState(120);
  const [seekRequest, setSeekRequest] = useState(null);

  // Key and time signature states for transcription
  const [selectedKey, setSelectedKey] = useState('C');
  const [selectedMeter, setSelectedMeter] = useState('4/4');

  const handleTimeUpdate = useCallback((time, playing, bpm) => {
    setPlaybackTime(time);
    setIsPlaying(playing);
    if (bpm) setPlaybackBpm(bpm);
  }, []);

  const handleScoreNoteClick = useCallback((time) => {
    setSeekRequest({ time });
  }, []);

  // Resizable split pane
  const [scoreWidthPercent, setScoreWidthPercent] = useState(48);
  const workspaceRef = useRef(null);
  const scoreContainerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const handleSplitterMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Disable pointer events on heavy content during drag to prevent iframe/canvas stealing events
    if (scoreContainerRef.current) {
      scoreContainerRef.current.style.pointerEvents = 'none';
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !workspaceRef.current || !scoreContainerRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (offsetX / rect.width) * 100));
      // Direct DOM manipulation — no React re-render during drag
      scoreContainerRef.current.style.width = pct + '%';
    };
    const handleMouseUp = (e) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (scoreContainerRef.current) {
        scoreContainerRef.current.style.pointerEvents = '';
        // Read final width and commit to React state once
        const finalWidth = parseFloat(scoreContainerRef.current.style.width);
        if (!isNaN(finalWidth)) {
          setScoreWidthPercent(finalWidth);
        }
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
  // File upload state
  const [dragOver, setDragOver] = useState(false);
  const [backendProcessing, setBackendProcessing] = useState(false);
  const [omrStage, setOmrStage] = useState('等待处理...');
  const [omrProgress, setOmrProgress] = useState(0);

  // Derived flags
  const hasScore1 = !!(xmlContent || pdfUrl);
  const hasScore2 = !!(xmlContent2 || pdfUrl2);
  const hasAnyScore = hasScore1 || hasScore2;

  // Drag-and-drop / file handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    const lowerName = file.name.toLowerCase();
    const isXml = lowerName.endsWith('.musicxml') || lowerName.endsWith('.xml');
    const isMidi = lowerName.endsWith('.mid') || lowerName.endsWith('.midi');
    const isPdf = lowerName.endsWith('.pdf');
    const isImage = /\.(png|jpe?g|bmp|webp)$/.test(lowerName);

    if (!isXml && !isMidi && !isPdf && !isImage) {
      alert('只支持 MIDI (.mid / .midi)、MusicXML (.musicxml / .xml)、PDF (.pdf) 或图片 (.png / .jpg / .jpeg / .bmp / .webp) 文件！');
      return;
    }

    // Auto-route: slot 1 first, then slot 2, if both full replace slot 2
    const targetSlot = !uploadedFile ? 1 : 2;
    
    if (targetSlot === 1) {
      setUploadedFile(file);
      if (isXml) {
        setPdfUrl(''); setIsImageFile(false);
        const reader = new FileReader();
        reader.onload = (e) => setXmlContent(e.target.result);
        reader.readAsText(file);
      } else if (isMidi) {
        setPdfUrl(''); setIsImageFile(false);
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = parseMidiFile(e.target.result);
            setXmlContent(JSON.stringify(parsed));
          } catch (err) {
            console.error('Failed to parse MIDI file:', err);
            alert('MIDI 文件解析失败，请检查文件是否损坏。');
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const url = URL.createObjectURL(file);
        setPdfUrl(url); setIsImageFile(isImage); setXmlContent('');
      }
    } else {
      setUploadedFile2(file);
      if (isXml) {
        setPdfUrl2(''); setIsImageFile2(false);
        const reader = new FileReader();
        reader.onload = (e) => setXmlContent2(e.target.result);
        reader.readAsText(file);
      } else if (isMidi) {
        setPdfUrl2(''); setIsImageFile2(false);
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = parseMidiFile(e.target.result);
            setXmlContent2(JSON.stringify(parsed));
          } catch (err) {
            console.error('Failed to parse MIDI file:', err);
            alert('MIDI 文件解析失败，请检查文件是否损坏。');
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const url = URL.createObjectURL(file);
        setPdfUrl2(url); setIsImageFile2(isImage); setXmlContent2('');
      }
    }

    // Update toolbar title
    if (targetSlot === 1) {
      setActiveScoreTitle(uploadedFile2 ? `${file.name} / ${uploadedFile2.name}` : file.name);
    } else {
      setActiveScoreTitle(uploadedFile ? `${uploadedFile.name} / ${file.name}` : file.name);
    }
  };

  const closeActiveFile = () => {
    setXmlContent('');
    setPdfUrl('');
    setIsImageFile(false);
    setUploadedFile(null);
    setActiveScoreTitle(uploadedFile2 ? uploadedFile2.name : '未选择乐谱');
  };

  const closeActiveFile2 = () => {
    setXmlContent2('');
    setPdfUrl2('');
    setIsImageFile2(false);
    setUploadedFile2(null);
    setActiveScoreTitle(uploadedFile ? uploadedFile.name : '未选择乐谱');
  };

  const closeAllFiles = () => {
    closeActiveFile();
    closeActiveFile2();
    setActiveScoreTitle('未选择乐谱');
  };



  const handleSoundfontChange = async (e) => {
    const value = e.target.value;
    setSelectedSoundfont(value);
    
    if (value === 'default') {
      setSoundSourceType('正在恢复默认音源...');
      try {
        soundSynth.buffers.clear();
        soundSynth.loaded = false;
        soundSynth.loading = false;
        await soundSynth.preloadSamples();
        setSoundSourceType('默认钢琴音源 (Salamander)');
      } catch (err) {
        console.error(err);
        setSoundSourceType('恢复失败，请重试');
      }
    } else {
      const files = soundfontsList[value] || [];
      setSoundSourceType(`正在加载 ${value}...`);
      try {
        const loadedCount = await soundSynth.loadRemoteSoundfont(value, files);
        if (loadedCount > 0) {
          setSoundSourceType(`${value} (${loadedCount}个采样)`);
        } else {
          setSoundSourceType('默认钢琴音源 (Salamander)');
          setSelectedSoundfont('default');
          alert(`音源 ${value} 中未发现任何有效采样。已回退到默认音源。`);
        }
      } catch (err) {
        console.error(err);
        alert(`加载音源 ${value} 失败: ` + err.message);
        setSoundSourceType('默认钢琴音源 (Salamander)');
        setSelectedSoundfont('default');
      }
    }
  };

  const handleMidiZoom = (factor) => {
    setMidiScoreZoom(prev => Math.max(0.4, Math.min(2.0, prev + factor)));
  };

  const handleDownloadXml = (slotNum = 1) => {
    const xml = slotNum === 1 ? xmlContent : xmlContent2;
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcribed_score_${slotNum}.musicxml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`app-container ${focusMode ? 'focus-mode' : ''}`}>
      {/* Sidebar panel */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} style={focusMode ? { display: 'none' } : undefined}>
        <div className="brand">
          <div className="logo-icon">
            <Music />
          </div>
          <div className="brand-text">
            <h1>Piano Waterfall</h1>
          </div>
        </div>

        {/* Sidebar content panel */}
        <div className="sidebar-content">
          <div className="tab-panel">
            <h3 className="panel-title">加载乐谱</h3>
            
            {/* Drag and Drop Zone */}
            <div 
              className={`upload-area ${dragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('musicFileInput').click()}
            >
              <UploadCloud className="upload-icon" />
              <p className="upload-text">点击或拖拽上传乐谱文件</p>
              <p className="upload-hint">支持 MIDI / MusicXML 或 PDF / 图片 (智能识别)</p>
              <input 
                type="file" 
                id="musicFileInput" 
                accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp,.musicxml,.xml,.mid,.midi,text/xml,application/xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,audio/midi,audio/x-midi" 
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* Uploaded File status - Slot 1 */}
            {uploadedFile && (
              <div className="file-info-box">
                <div className="info-item">
                  <span className="info-label">乐谱 1 (上):</span>
                  <span className="info-value">{uploadedFile.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">大小:</span>
                  <span className="info-value">{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                </div>
                <button 
                  className="btn btn-secondary btn-sm btn-block" 
                  onClick={closeActiveFile}
                >
                  关闭乐谱 1
                </button>
              </div>
            )}

            {/* Uploaded File status - Slot 2 */}
            {uploadedFile2 && (
              <div className="file-info-box" style={{ marginTop: '8px' }}>
                <div className="info-item">
                  <span className="info-label">乐谱 2 (下):</span>
                  <span className="info-value">{uploadedFile2.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">大小:</span>
                  <span className="info-value">{(uploadedFile2.size / 1024).toFixed(1)} KB</span>
                </div>
                <button 
                  className="btn btn-secondary btn-sm btn-block" 
                  onClick={closeActiveFile2}
                >
                  关闭乐谱 2
                </button>
              </div>
            )}

            {/* Common controls for loaded scores */}
            {(uploadedFile || uploadedFile2 || xmlContent || xmlContent2) && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {((uploadedFile && uploadedFile2) || (xmlContent && xmlContent2)) && (
                  <button 
                    className="btn btn-secondary btn-sm btn-block" 
                    onClick={closeAllFiles}
                  >
                    关闭全部乐谱
                  </button>
                )}
                <button 
                  className={`btn ${showMidiScore ? 'btn-secondary' : 'btn-primary'} btn-sm btn-block`} 
                  onClick={() => setShowMidiScore(!showMidiScore)}
                >
                  {showMidiScore ? '隐藏对照乐谱' : '显示对照乐谱'}
                </button>
              </div>
            )}
            
            <div className="info-alert" style={{ marginTop: '20px', padding: '12px', backgroundColor: 'var(--accent-light)', borderLeft: '3px solid var(--accent-color)', borderRadius: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
                <Info style={{ width: '20px', height: '20px', flexShrink: 0, color: 'var(--accent-color)' }} />
                <div>
                  您可以可视化播放已加载的乐谱，调节播放速度、音量及自定义瀑布流颜色。支持外接物理 MIDI 键盘或使用电脑键盘弹奏（A-L 对应白键 C4-D5，W-P 对应黑键 #C4-#D5）。
                </div>
              </div>
            </div>

            {/* Sound Source Settings */}
            <div className="sound-source-section" style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>钢琴音源设置</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>音源切换:</span>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '10px' }}>{soundSourceType}</span>
                </label>
                <select 
                  value={selectedSoundfont}
                  onChange={handleSoundfontChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="default">默认钢琴音源 (Salamander)</option>
                  {Object.keys(soundfontsList).map(sf => (
                    <option key={sf} value={sf}>{sf}</option>
                  ))}
                </select>
              </div>


              
              <p style={{ fontSize: '10px', color: '#ffffff', marginTop: '8px', lineHeight: '1.3' }}>
                提示：音源仅支持 .wav、.mp3 格式，文件名需为 1-88 的数字（对应琴键）或者 C#4/升C4/#C4 这种音名命名方式。音源需存放在 `frontend/public/soundfonts/` 相应的子目录内，系统将自动扫描。未覆盖的琴键将自动通过最邻近采样变调播放。
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main workspace panel */}
      <main className="workspace">
        {/* Top Header Toolbar */}
        <header className="toolbar" style={focusMode ? { display: 'none' } : undefined}>
          <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              style={{ padding: '6px 8px', borderRadius: '4px' }}
            >
              {sidebarCollapsed ? <Menu style={{ width: '16px', height: '16px' }} /> : <ChevronLeft style={{ width: '16px', height: '16px' }} />}
            </button>
            <span className="toolbar-title">{activeScoreTitle}</span>
          </div>

          <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {(xmlContent || xmlContent2) && (
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${annotationMode === 'notes' ? 'active' : ''}`}
                  onClick={() => setAnnotationMode('notes')}
                >
                  显示音名
                </button>
                <button 
                  className={`toggle-btn ${annotationMode === 'none' ? 'active' : ''}`}
                  onClick={() => setAnnotationMode('none')}
                >
                  无标注
                </button>
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm focus-mode-btn"
              onClick={() => setFocusMode(true)}
              title="专注模式 — 隐藏所有面板，只保留瀑布流和键盘"
              style={{ padding: '6px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Maximize2 style={{ width: '14px', height: '14px' }} />
              <span style={{ fontSize: '12px' }}>专注模式</span>
            </button>
          </div>
        </header>

        {/* Main rendering area */}
        <section ref={workspaceRef} className={`midi-workspace-area ${((hasAnyScore && showMidiScore) || backendProcessing) && !focusMode ? 'split' : ''}`}>
          {(hasAnyScore || backendProcessing) && !focusMode && (
            <div ref={scoreContainerRef} className="midi-score-container" style={{ display: (showMidiScore || backendProcessing) ? undefined : 'none', width: `${scoreWidthPercent}%` }}>
              <div className="midi-score-toolbar">
                <span className="midi-score-title">{backendProcessing ? "正在智能解析乐谱..." : "对照乐谱"}</span>
                {!backendProcessing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {(xmlContent || xmlContent2) && (
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => handleDownloadXml(xmlContent ? 1 : 2)} 
                        title="下载 MusicXML 乐谱"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: 'var(--accent-color)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          transition: 'all var(--transition-normal)',
                          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
                        }}
                      >
                        <Download style={{ width: '12px', height: '12px' }} />
                        <span>下载乐谱</span>
                      </button>
                    )}
                    <div className="zoom-controls">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleMidiZoom(-0.1)} title="缩小">
                        <ZoomOut style={{ width: '12px', height: '12px' }} />
                      </button>
                      <span className="zoom-level" style={{ minWidth: '35px', fontSize: '12px' }}>{Math.round(midiScoreZoom * 100)}%</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleMidiZoom(0.1)} title="放大">
                        <ZoomIn style={{ width: '12px', height: '12px' }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="midi-score-scrollable" style={{ display: 'flex', flexDirection: 'column' }}>
                {backendProcessing ? (
                  <div className="score-loader" style={{ 
                    height: '100%', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '40px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    margin: '20px',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }}>
                    <div className="spinner" style={{ marginBottom: '24px' }}></div>
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: '12px', fontSize: '16px', fontWeight: '500' }}>智能乐谱识别中</h3>
                    
                    {/* Progress Bar */}
                    <div style={{ 
                      width: '100%', 
                      maxWidth: '400px', 
                      height: '6px', 
                      backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                      borderRadius: '3px',
                      overflow: 'hidden',
                      marginBottom: '16px'
                    }}>
                      <div style={{ 
                        width: `${omrProgress}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--accent-color) 0%, #6366f1 100%)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out'
                      }}></div>
                    </div>
                    
                    {/* Progress details */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      width: '100%', 
                      maxWidth: '400px',
                      color: 'var(--text-secondary)',
                      fontSize: '12px'
                    }}>
                      <span>{omrStage}</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{omrProgress}%</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Score Slot 1 (上) */}
                    {hasScore1 && (
                      <div style={{ 
                        flex: hasScore2 ? '0 0 50%' : '1', 
                        overflow: 'auto', 
                        borderBottom: hasScore2 ? '2px solid var(--border-color)' : 'none',
                        minHeight: 0,
                        width: '100%'
                      }}>
                        {pdfUrl ? (
                          isImageFile ? (
                            <div style={{ padding: '10px', width: '100%', height: '100%', overflow: 'auto', textAlign: 'center' }}>
                              <img 
                                src={pdfUrl} 
                                alt="Score 1" 
                                style={{ 
                                  width: `${midiScoreZoom * 100}%`,
                                  height: 'auto',
                                  objectFit: 'contain'
                                }} 
                              />
                            </div>
                          ) : (
                            <iframe 
                              src={pdfUrl} 
                              title="Score 1 PDF" 
                              style={{ width: '100%', height: '100%', border: 'none', backgroundColor: 'white' }} 
                            />
                          )
                        ) : (
                           <ScoreViewer 
                             xmlContent={xmlContent} 
                             annotationMode={annotationMode} 
                             zoom={midiScoreZoom} 
                             playbackTime={playbackTime}
                             isPlaying={isPlaying}
                             bpm={playbackBpm}
                             onNoteClick={handleScoreNoteClick}
                           />
                        )}
                      </div>
                    )}
                    {/* Score Slot 2 (下) */}
                    {hasScore2 && (
                      <div style={{ 
                        flex: hasScore1 ? '0 0 50%' : '1', 
                        overflow: 'auto',
                        minHeight: 0,
                        width: '100%'
                      }}>
                        {pdfUrl2 ? (
                          isImageFile2 ? (
                            <div style={{ padding: '10px', width: '100%', height: '100%', overflow: 'auto', textAlign: 'center' }}>
                              <img 
                                src={pdfUrl2} 
                                alt="Score 2" 
                                style={{ 
                                  width: `${midiScoreZoom * 100}%`,
                                  height: 'auto',
                                  objectFit: 'contain'
                                }} 
                              />
                            </div>
                          ) : (
                            <iframe 
                              src={pdfUrl2} 
                              title="Score 2 PDF" 
                              style={{ width: '100%', height: '100%', border: 'none', backgroundColor: 'white' }} 
                            />
                          )
                        ) : (
                           <ScoreViewer 
                             xmlContent={xmlContent2} 
                             annotationMode={annotationMode} 
                             zoom={midiScoreZoom} 
                             playbackTime={playbackTime}
                             isPlaying={isPlaying}
                             bpm={playbackBpm}
                             onNoteClick={handleScoreNoteClick}
                           />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {/* Draggable Splitter */}
          {(hasAnyScore || backendProcessing) && (showMidiScore || backendProcessing) && !focusMode && (
            <div
              className="split-divider"
              onMouseDown={handleSplitterMouseDown}
            >
              <div className="split-divider-grip">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          <MidiKeyboard 
             xmlContent={xmlContent} 
             setXmlContent={setXmlContent} 
             showMidiScore={showMidiScore} 
             setShowMidiScore={setShowMidiScore}
             focusMode={focusMode}
             onTimeUpdate={handleTimeUpdate}
             seekRequest={seekRequest}
             setSeekRequest={setSeekRequest}
             selectedKey={selectedKey}
             setSelectedKey={setSelectedKey}
             selectedMeter={selectedMeter}
             setSelectedMeter={setSelectedMeter}
           />
        </section>

        {/* Focus mode floating exit button */}
        {focusMode && (
          <button
            className="focus-mode-exit-btn"
            onClick={() => setFocusMode(false)}
            title="退出专注模式"
          >
            <Minimize2 style={{ width: '16px', height: '16px' }} />
          </button>
        )}
      </main>
    </div>
  );
}
