# 🎹 Piano Waterfall - 智能 MIDI 可视化测试台

`Piano Waterfall` 是一个专为 **MIDI 设备调试、虚拟钢琴演奏与乐谱对照** 设计的现代化网页端工作台。它结合了极速的乐谱与 MIDI 播放渲染、高级音频合成引擎，提供直观原生音轨瀑布流与 88 键虚拟键盘交互。

---

## 🌟 核心功能特色与对应核心文件

为了方便您快速了解系统架构，下文将系统功能与对应的核心代码文件进行了对照梳理：

### 1. 乐谱直显、OMR 识别与对照系统
*   **多格式乐谱展示**：支持直接上传 PDF 或图片格式乐谱，利用浏览器内置引擎在左侧分栏展示，**完全无需等待繁慢的后端 OMR 识别**。
*   **MusicXML 矢量渲染**：拖入 `.musicxml` / `.xml` 乐谱后，前端基于 OSMD (OpenSheetMusicDisplay) 引擎渲染出精美的五线谱，支持自适应音名标注切换与独立缩放。
*   **OMR 光学乐谱识别**：集成后台 OMR 识别流水线，支持一键上传 PDF/图片并通过后端 Python 神经网络引擎（基于 `oemer`）实时提取五线谱音符，通过 EventStream 机制向前端实时推送识别进度，并自动合并多页识别结果。
*   **音符拼音/音名自动注入**：解析 MusicXML 时自动计算当前调号与临时变音记号，并把音名（如 `C4`, `F#5`）以 `<lyric>` 标签的形式动态注入并渲染在五线谱上方。
*   **📌 对应核心文件**：
    *   [ScoreViewer.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/ScoreViewer.jsx)（前端）：负责乐谱分栏展示、PDF/图片加载、OSMD 渲染逻辑以及上传组件。
    *   [xmlModifier.js](file:///F:/Paino%20Waterfall/frontend/src/utils/xmlModifier.js)（前端）：提供五线谱音名（如 C4、F#5）的智能分析与 lyric 节点注入逻辑。
    *   [musicXmlParser.js](file:///F:/Paino%20Waterfall/frontend/src/utils/musicXmlParser.js)（前端）：负责将 MusicXML 结构解析为播放器与瀑布流所需的音符序列。
    *   [main.py](file:///F:/Paino%20Waterfall/backend/main.py)（后端）：实现 `/api/upload-pdf` 接口，执行 PDF 页面图像提取，调用 `oemer` 识别，以及进行多页 XML 合并。

### 2. MIDI 播放、解析与音轨控制器
*   **MIDI 乐谱加载与播放**：支持直接加载 `.mid` 和 `.midi` 标准乐谱文件，前端利用 `@tonejs/midi` 解析多声部音轨，实现音轨可视化对照播放。
*   **音轨过滤与播放控制**：支持通过复选框勾选或屏蔽特定声部/音轨播放；支持播放/暂停、播放进度条拖拽、音量大小调节以及播放速度调节（0.5x - 2.0x）。
*   **📌 对应核心文件**：
    *   [App.jsx](file:///F:/Paino%20Waterfall/frontend/src/App.jsx)（前端）：整合了播放器状态管理，通过 `requestAnimationFrame` 驱动播放进度，并实现音轨多选控制与播放速度/音量控制。
    *   [midiParser.js](file:///F:/Paino%20Waterfall/frontend/src/utils/midiParser.js)（前端）：调用 `@tonejs/midi` 将二进制 MIDI 缓存转换为标准的播放格式。

### 3. 88键交互钢琴键盘、和弦识别与物理设备
*   **物理 MIDI 设备直连**：支持 Web MIDI API，接入电子琴/MIDI键盘即可低延迟弹奏。
*   **QWERTY 电脑热键映射**：支持通过电脑按键直接测试弹奏（白键 `A-L` $\rightarrow$ `C4-D5`，黑键 `W-P` $\rightarrow$ `#C4-#D5`）。
*   **智能和弦识别**：结合 `Tonal.js` 实时分析当前按下（或乐谱播放中）的音符，并在顶端显示标准的音乐和弦名称。
*   **延音踏板与物理按键绑定**：允许点击界面上的“绑定”按钮，按下键盘上的**任意物理按键**（如空格键 Space）作为自定义延音开关。
*   **演奏实时转译五线谱**：集成录制控制面板，支持同步开启木鱼 Click 声低延迟节拍器（BPM 40-240 自定义调节）。录音完毕后一键发送至后端，使用 `music21` 智能进行 50ms 起键和弦合并、16分音符/三连音量化对齐、高低音双轨分流，并自动生成小节及休止符，实时重新渲染出五线谱。
*   **专注模式 (Focus Mode)**：一键隐藏左右侧边栏与配置，最大化展示瀑布流与 88 键钢琴，带来沉浸式体验。
*   **📌 对应核心文件**：
    *   [MidiKeyboard.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/MidiKeyboard.jsx)（前端）：88键钢琴交互渲染、录制控制面板、BPM与节拍器切换、Web MIDI 设备连接监听、电脑热键弹奏处理器、延音绑定逻辑，以及特效配置悬浮窗 UI。
    *   [soundSynth.js](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js)（前端）：提供音频合成引擎与低延迟 Web Audio API 节拍器 Click 音效。
    *   [keyboardLayout.js](file:///F:/Paino%20Waterfall/frontend/src/utils/keyboardLayout.js)（前端）：定义 QWERTY 键盘到 MIDI 音符的映射布局映射表。
    *   [main.py](file:///F:/Paino%20Waterfall/backend/main.py)（后端）：提供 `/api/soundfonts` 扫描接口，以及 `/api/transcribe` 接口负责调用 `music21` 执行智能量化并输出 MusicXML。

### 4. 项目级采样管理器与智能音色映射
*   **内置音色包管理器**：自动扫描后端 `public/soundfonts/` 下的子文件夹，每一个文件夹作为一个“音色包”（如 `施坦威钢琴`），支持零延迟一键加载。
*   **超级模糊智能文件名解析算法**：导入采样时无需手动批量重命名，算法支持 4 大主流采样命名法：
    1.  **1-88键序列识别**：自动解析如 `tone (1).wav` 到 `tone (88).wav` 的序号，映射到 A0-C8。
    2.  **标准英美音名**：支持 `C4`、`A#5`、`Eb3` 等。
    3.  **前缀与中文升降号**：兼容如 `#C4`、`Cs4`、`升C4`、`C升4`、`降E3`、`E降3` 等写法。
    4.  **纯 MIDI 编号**：支持 `60.wav`、`82.mp3` 等。
*   **手动临时音色导入**：支持在下拉菜单中选择本地文件批量导入，临时存入浏览器内存（RAM），无需写入磁盘。
*   **📌 对应核心文件**：
    *   [soundSynth.js](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js)（前端）：基于 Web Audio API 的音频合成器。包含多音轨播放通道、延音释音逻辑、PCM 缓存加载器，以及**超级模糊智能文件名解析算法**的实现。
    *   [main.py](file:///F:/Paino%20Waterfall/backend/main.py)（后端）：提供 `/api/soundfonts` 扫描接口，读取本地预设的音源并提供目录结构。

### 5. Canvas 瀑布流渲染与粒子物理特效
*   **音符瀑布流不透明度控制**：移除传统的显示开关，改为 **“长条不透明度” (0% - 100%)** 无级调节。当滑动到 `0%` 时，下落/上升的长条完全隐藏以节省渲染资源，但琴键上方的**白色弧形击键闪光 flare** 依旧 100% 渲染，提供最佳的物理打击反馈。
*   **自定义渐变色彩调色盘**：可启用呼吸渐变色彩，支持用户自定义起始与结束渐变色值。
*   **三大主题特效粒子系统**：
    1.  **气泡上升 (Bubbles)**：半透明气泡以正弦曲线在 3-5 秒内快速上浮，营造唯美水下氛围。
    2.  **水中气流 (Water Current)**：物理引擎模拟 3D 盘旋的气流柱先导，并在其路径上随时间持续产生微小的发光蓝藻微粒。蓝藻粒子以 3D 漩涡公转轨道扩散并渐变消散。若启用自定义色彩，蓝藻的色值自动匹配音符长条颜色。
    3.  **情书 (Love Letter)**：按键时激发出高密度的 SeeMusic 风格**霓虹星芒粒子喷泉**（包含高亮旋转的方钻微粒与具有纯白高热核心的四角星芒），粒子受向上垂直减速流体阻力并向左右扇形扩散。
*   **📌 对应核心文件**：
    *   [TrackVisualizer.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/TrackVisualizer.jsx)（前端）：瀑布流核心渲染逻辑。驱动 Canvas 的绘制主循环，完成音轨音符长条计算、渐变色彩插值、击键白色光弧绘制，以及 `Bubbles` / `Water Current` / `Love Letter` 三类粒子物理解析与运动绘制。
    *   [MidiKeyboard.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/MidiKeyboard.jsx)（前端）：负责接收并传递粒子特效勾选状态、透明度滑块数据以及自定义色彩值。

---

## 📂 项目核心文件结构

以下是项目的整体目录树结构与重点文件的开发指引：

*   `F:\Paino Waterfall\`
    *   [start.bat](file:///F:/Paino%20Waterfall/start.bat)：一键启动脚本，自动检查并释放 8000 端口，并发启动 FastAPI 后端与 Vite 前端。
    *   `backend/`：FastAPI 后端服务。
        *   [main.py](file:///F:/Paino%20Waterfall/backend/main.py)：提供本地 `soundfonts/` 预设音源目录的自动遍历接口与 OMR 识别微服务。
    *   `frontend/`：Vite + React 前端工作台。
        *   [src/App.jsx](file:///F:/Paino%20Waterfall/frontend/src/App.jsx) / [App.css](file:///F:/Paino%20Waterfall/frontend/src/App.css)：主页面布局、侧边栏设置面板、文件上传以及全局音源状态管理。
        *   [src/index.css](file:///F:/Paino%20Waterfall/frontend/src/index.css)：全局样式、毛玻璃（Glassmorphism）和现代黑暗风格调色盘定义。
        *   `src/components/`：
            *   [ScoreViewer.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/ScoreViewer.jsx)：乐谱渲染器（PDF / Image / OSMD-XML）。
            *   [MidiKeyboard.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/MidiKeyboard.jsx) / [App.css](file:///F:/Paino%20Waterfall/frontend/src/App.css)：88键物理/软键盘交互、延音设置与音效控制悬浮面板。
            *   [TrackVisualizer.jsx](file:///F:/Paino%20Waterfall/frontend/src/components/TrackVisualizer.jsx)：Canvas 绘制主进程与粒子群物理动画引擎。
        *   `src/utils/`：
            *   [soundSynth.js](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js)：超级模糊智能文件名解析算法及 Web Audio API 声音合成内核。
            *   [xmlModifier.js](file:///F:/Paino%20Waterfall/frontend/src/utils/xmlModifier.js)：音谱音名 lyric 标签动态修改算法。
            *   [musicXmlParser.js](file:///F:/Paino%20Waterfall/frontend/src/utils/musicXmlParser.js) / [midiParser.js](file:///F:/Paino%20Waterfall/frontend/src/utils/midiParser.js)：MusicXML 与 MIDI 乐谱数据解析器。
            *   [keyboardLayout.js](file:///F:/Paino%20Waterfall/frontend/src/utils/keyboardLayout.js)：电脑键盘按键键值定义。
        *   `public/soundfonts/`：预设音源包根目录。每一个子目录名称即代表一个音色。

---

## 🚀 快速启动指引

### 第一步：准备后端环境
在 `backend` 目录下创建 Python 虚拟环境并安装基础扫描依赖：
```bash
cd backend
python -m venv venv
venv\Scripts\pip install fastapi uvicorn pymupdf python-multipart
```

### 第二步：安装前端依赖
在 `frontend` 目录下安装 NPM 依赖：
```bash
cd ../frontend
npm install
```

### 第三步：一键运行
返回项目根目录，双击运行 [start.bat](file:///F:/Paino%20Waterfall/start.bat) 即可自动在后台拉起前后端服务，并在浏览器中自动开启 `http://localhost:5173`。

---

## 🎹 如何添加您自己的音色包？

1.  在 [frontend/public/soundfonts/](file:///F:/Paino%20Waterfall/frontend/public/soundfonts/) 文件夹下新建一个子文件夹，例如 `Rhodes电钢琴`。
2.  将您的音频采样（支持 `.wav` 和 `.mp3`）放入其中。文件名必须为 `tone (1).wav` 这种 1-88 序号，或者包含音名如 `C4.mp3`、`升C4.wav`。
3.  刷新网页，即可在音源下拉菜单中选择并直接弹奏！
