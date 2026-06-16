import React, { useState, useEffect } from 'react';
import { 
  Music, 
  UploadCloud, 
  ZoomIn, 
  ZoomOut, 
  Info,
  Download,
  Menu,
  ChevronLeft
} from 'lucide-react';
import ScoreViewer from './components/ScoreViewer';
import MidiKeyboard from './components/MidiKeyboard';
import soundSynth from './utils/soundSynth';

export default function App() {
  const [xmlContent, setXmlContent] = useState('');
  const [activeScoreTitle, setActiveScoreTitle] = useState('未选择乐谱');
  const [pdfUrl, setPdfUrl] = useState('');
  const [isImageFile, setIsImageFile] = useState(false);
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
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);
  
  // Scoring parameters
  const [annotationMode, setAnnotationMode] = useState('notes'); // 'none', 'notes'
  const [midiScoreZoom, setMidiScoreZoom] = useState(0.7); // default 0.7 for split panel
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMidiScore, setShowMidiScore] = useState(true);
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [backendProcessing, setBackendProcessing] = useState(false);
  const [omrStage, setOmrStage] = useState('等待处理...');
  const [omrProgress, setOmrProgress] = useState(0);

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
    const isPdf = lowerName.endsWith('.pdf');
    const isImage = /\.(png|jpe?g|bmp|webp)$/.test(lowerName);

    if (!isXml && !isPdf && !isImage) {
      alert('只支持 MusicXML (.musicxml / .xml)、PDF (.pdf) 或图片 (.png / .jpg / .jpeg / .bmp / .webp) 文件！');
      return;
    }

    setUploadedFile(file);
    setActiveScoreTitle(file.name);

    if (isXml) {
      setPdfUrl('');
      setIsImageFile(false);
      // Direct reading for XML files client-side
      const reader = new FileReader();
      reader.onload = (e) => {
        setXmlContent(e.target.result);
      };
      reader.readAsText(file);
    } else if (isPdf || isImage) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setIsImageFile(isImage);
      setXmlContent('');
    }
  };

  const closeActiveFile = () => {
    setXmlContent('');
    setPdfUrl('');
    setIsImageFile(false);
    setUploadedFile(null);
    setActiveScoreTitle('未选择乐谱');
  };

  const handleCustomSoundUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setSelectedSoundfont('default');
      return;
    }
    
    setSoundSourceType('正在加载自定义采样...');
    setSelectedSoundfont('custom');
    
    try {
      const loadedCount = await soundSynth.loadCustomSamples(files);
      if (loadedCount > 0) {
        setSoundSourceType(`自定义音源 (${loadedCount}个采样)`);
        alert(`成功加载了 ${loadedCount} 个自定义音源采样！`);
      } else {
        setSoundSourceType('默认钢琴音源 (Salamander)');
        setSelectedSoundfont('default');
        alert('未能识别出任何有效的音频采样。文件名需包含 MIDI 编号 (如 60.wav) 或音名 (如 C4.mp3)。');
      }
    } catch (err) {
      console.error(err);
      alert('加载自定义音源失败: ' + err.message);
      setSoundSourceType('默认钢琴音源 (Salamander)');
      setSelectedSoundfont('default');
    }
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
    } else if (value === 'custom') {
      document.getElementById('customSoundInput').click();
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

  const downloadXmlFile = () => {
    if (!xmlContent) return;
    const blob = new Blob([xmlContent], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    let filename = activeScoreTitle;
    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith('.musicxml') && !lowerName.endsWith('.xml')) {
      const lastDot = filename.lastIndexOf('.');
      if (lastDot !== -1) {
        filename = filename.substring(0, lastDot) + '.musicxml';
      } else {
        filename = filename + '.musicxml';
      }
    }
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      {/* Sidebar panel */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
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
              <p className="upload-hint">支持 PDF / 图片 (后端识别) 或 MusicXML / XML</p>
              <input 
                type="file" 
                id="musicFileInput" 
                accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp,.musicxml,.xml,text/xml,application/xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml" 
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* Uploaded File status */}
            {uploadedFile && (
              <div className="file-info-box">
                <div className="info-item">
                  <span className="info-label">已加载文件:</span>
                  <span className="info-value">{uploadedFile.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">大小:</span>
                  <span className="info-value">{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                </div>
                {xmlContent && (
                  <button 
                    className="btn btn-primary btn-sm btn-block" 
                    style={{ marginTop: '10px', marginBottom: '8px' }}
                    onClick={downloadXmlFile}
                  >
                    <Download style={{ width: '14px', height: '14px', marginRight: '6px' }} />
                    <span>下载 MusicXML</span>
                  </button>
                )}
                <button 
                  className="btn btn-secondary btn-sm btn-block" 
                  onClick={closeActiveFile}
                >
                  关闭当前文件
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
                  <option value="custom">手动导入本地采样...</option>
                </select>
              </div>

              <input 
                type="file"
                id="customSoundInput"
                multiple
                accept="audio/*"
                onChange={handleCustomSoundUpload}
                style={{ display: 'none' }}
              />
              
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.3' }}>
                提示：音源仅支持 .wav、.mp3 格式，文件名需为 1-88 的数字（对应琴键）或者 C#4/升C4/#C4 这种音名命名方式。音源需存放在 `frontend/public/soundfonts/` 相应的子目录内，系统将自动扫描。未覆盖的琴键将自动通过最邻近采样变调播放。
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main workspace panel */}
      <main className="workspace">
        {/* Top Header Toolbar */}
        <header className="toolbar">
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

          {xmlContent && (
            <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* Toggle controls */}
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

              {/* Download MusicXML Button */}
              <button 
                className="btn btn-primary btn-sm" 
                onClick={downloadXmlFile}
                title="下载 MusicXML 乐谱"
              >
                <Download style={{ width: '14px', height: '14px' }} />
                <span>下载 MusicXML</span>
              </button>
            </div>
          )}
        </header>

        {/* Main rendering area */}
        <section className={`midi-workspace-area ${((xmlContent || pdfUrl) && showMidiScore) || backendProcessing ? 'split' : ''}`}>
          {(((xmlContent || pdfUrl) && showMidiScore) || backendProcessing) && (
            <div className="midi-score-container">
              <div className="midi-score-toolbar">
                <span className="midi-score-title">{backendProcessing ? "正在智能解析乐谱..." : "对照乐谱"}</span>
                {!backendProcessing && (
                  <div className="zoom-controls">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleMidiZoom(-0.1)} title="缩小">
                      <ZoomOut style={{ width: '12px', height: '12px' }} />
                    </button>
                    <span className="zoom-level" style={{ minWidth: '35px', fontSize: '12px' }}>{Math.round(midiScoreZoom * 100)}%</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleMidiZoom(0.1)} title="放大">
                      <ZoomIn style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                )}
              </div>
              <div className="midi-score-scrollable">
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
                ) : pdfUrl ? (
                  isImageFile ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', height: '100%', overflow: 'auto' }}>
                      <img 
                        src={pdfUrl} 
                        alt="Uploaded Score" 
                        style={{ 
                          maxWidth: '100%', 
                          height: 'auto', 
                          transform: `scale(${midiScoreZoom})`, 
                          transformOrigin: 'top center',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    </div>
                  ) : (
                    <iframe 
                      src={pdfUrl} 
                      title="Uploaded PDF Score" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        border: 'none',
                        backgroundColor: 'white'
                      }} 
                    />
                  )
                ) : (
                  <ScoreViewer 
                    xmlContent={xmlContent} 
                    annotationMode={annotationMode} 
                    zoom={midiScoreZoom} 
                  />
                )}
              </div>
            </div>
          )}
          <MidiKeyboard 
            xmlContent={xmlContent} 
            showMidiScore={showMidiScore} 
            setShowMidiScore={setShowMidiScore} 
          />
        </section>
      </main>
    </div>
  );
}
