# 🎹 Piano Waterfall - 智能 MIDI 可视化测试台

`Piano Waterfall` 是一个专为 **MIDI 设备调试、虚拟钢琴演奏与乐谱对照** 设计的现代化网页端工作台。它结合了极速的乐谱渲染与高级音频合成引擎，提供直观的音轨瀑布流与 88 键虚拟键盘交互。

---

## 🌟 核心功能特色

### 1. 乐谱直显与对照系统 (PDF / 图片 / MusicXML)
*   **PDF/图片秒级直显**: 支持直接上传 PDF 或图片格式的乐谱，利用浏览器内置引擎（`<iframe>`）或高性能图像渲染在左侧分栏展示，**完全无需等待繁慢的后端 OMR 识别**。支持工具栏缩放与多页滚动。
*   **MusicXML 矢量渲染**: 拖入 `.musicxml` / `.xml` 乐谱后，前端基于 OSMD (OpenSheetMusicDisplay) 引擎渲染出精美的五线谱，支持自适应音名标注切换与独立缩放。
*   **五线谱对照播放**: 加载 MusicXML 后，可开启对照自动播放，支持音轨选择（选择性播放特定声部）、播放速度调节（0.5x - 2.0x）和全局音量调节。

### 2. 多合一钢琴键盘交互与调试 (88 键)
*   **物理 MIDI 键盘接入**: 支持 Web MIDI API，插上物理电子琴/MIDI 键盘即可免驱自动连接，弹奏延迟极低。
*   **QWERTY 电脑热键映射**: 在没有 MIDI 键盘时，支持通过电脑按键直接弹奏测试（白键 `A-L` $\rightarrow$ `C4-D5`，黑键 `W-P` $\rightarrow$ `#C4-#D5`）。
*   **智能和弦识别**: 自动汇总您的手弹音符与乐谱播放音符，基于 `Tonal.js` 实时计算并显式呈现当前的音乐和弦名称（三和弦、七和弦等）。
*   **自定义延音踏板快捷键**: 支持一键开启/关闭延音。允许用户点击绑定按钮后，按下键盘上的**任意物理按键**（如空格键 Space）作为自定义延音开关。

### 3. 项目级音源管理器与智能采样映射
*   **项目预设音源目录**: 
    *   在项目目录 `frontend/public/soundfonts/` 下，每个子文件夹都会被视作一个独立的“音色包”（如 `施坦威钢琴`）。
    *   后端服务自动扫描此目录下的音频文件，前端通过下拉菜单可进行零延迟的一键切换。
*   **超级模糊智能文件名解析**: 导入采样时，算法自动去噪，支持多种主流采样文件命名法则，**无需手动批量重命名**：
    1.  **1-88 键索引识别**：检测到包含 1-88 数字序列时（例如 `tone (1).wav` 到 `tone (88).wav`），自动通过偏移运算映射至 MIDI `21` (A0)至 `108` (C8)。
    2.  **标准英美音名**：支持 `C4`、`A#5`、`Eb3` 等。
    3.  **前缀与中文升降号**：完美兼容如 `#C4`、`Cs4`、`升C4`、`C升4`、`降E3`、`E降3` 等写法。
    4.  **纯 MIDI 编号**：支持 `60.wav`、`82.mp3`。
*   **手动临时音源导入**: 支持随时在下拉菜单中选择“手动导入本地采样”，多选文件后将临时数据直接载入浏览器内存（RAM），安全、快速且不占用本地磁盘空间。

### 4. 绚丽的 Canvas 瀑布流视觉效果
*   拥有自主渲染的高帧率 Canvas 音轨瀑布流，支持显示音名字标。
*   提供**自定义色彩调色盘**，可启用多色呼吸色彩和插值渐变过渡，让视觉效果更加生动 premium。

---

## 📂 项目结构

*   [start.bat](file:/Paino Waterfall/start.bat)：一键启动脚本，自动检查端口 8000 并并发启动前端与后端。
*   `backend/`：FastAPI 后端服务。
    *   `main.py`：包含用于扫描 `soundfonts` 目录下可用音频的扫描 API，以及保留的 PDF 提取服务。
*   `frontend/`：Vite + React 前端工作台。
    *   `src/App.jsx`：主页面框架、文件上传响应与音源状态管理。
    *   `src/components/MidiKeyboard.jsx`：88键键盘渲染、MIDI 协议对接、快捷键绑定及播放面板。
    *   `src/components/TrackVisualizer.jsx`：Canvas 瀑布流粒子绘制核心。
    *   `src/utils/soundSynth.js`：音频解码引擎、PCM 缓冲管理与智能文件名解析算法。
    *   `public/soundfonts/`：**自定义音源存放文件夹**。

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

### 第三步：双击运行
返回项目根目录，双击运行 [start.bat](file:/Paino Waterfall/start.bat) 即可自动在后台拉起前后端服务，并在默认浏览器中开启 `http://localhost:5173`。

---

## 🎹 如何添加您自己的音色包？

1.  在 [frontend/public/soundfonts/](file:/Paino Waterfall/frontend/public/soundfonts/) 文件夹下新建一个子文件夹，例如 `Rhodes电钢琴`。
2.  将您的音频采样（支持 `.wav` 和 `.mp3`）放入其中。文件名必须为 `tone (1).wav` 这种 1-88 序号，或者包含音名如 `C4.mp3`、`升C4.wav`。
3.  刷新网页，即可在下拉菜单中选择并直接弹奏！
