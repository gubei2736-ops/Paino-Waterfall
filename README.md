# 🎹 钢琴瀑布流与智能记谱系统 (Piano Waterfall & Sheet Music System)

这是一个集成了**钢琴瀑布流可视化**、**五线谱交互播放**、**MIDI/电脑键盘演奏**以及**智能录音转译记谱**的现代化网页应用。项目去除了冗余的 AI 图像识别（OMR）模块，保留了纯净的基于 `music21` 的音频录制转译核心，提供轻量、高效的乐谱辅助教学体验。
<img width="2502" height="1261" alt="image" src="https://github.com/user-attachments/assets/0bbd961c-b6dd-4c24-95a1-61b2dab7332c" />

---

## 📂 项目结构与模块设计

项目采用前后端分离架构设计，结构极简且模块清晰：

```text
Piano Waterfall/
├── backend/                   # 后端服务 (FastAPI + music21)
│   ├── main.py                # 主服务逻辑：MIDI转译、音源探测、音频转码
│   ├── requirements.txt       # 后端 Python 依赖
│   └── venv/                  # Python 虚拟环境 (克隆后本地新建)
├── frontend/                  # 前端项目 (Vite + React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── MidiKeyboard.jsx    # 钢琴主界面、控制栏与录音控制器
│   │   │   ├── ScoreViewer.jsx     # OpenSheetMusicDisplay 五线谱渲染与光标跟随
│   │   │   └── TrackVisualizer.jsx # HTML5 Canvas 钢琴瀑布流粒子与气泡动效
│   │   ├── utils/
│   │   │   ├── soundSynth.js       # Web Audio API 声音合成、混响与声部调度
│   │   │   ├── xmlModifier.js      # MusicXML DOM 注入器，用于生成音名标注
│   │   │   └── musicXmlParser.js   # 简易 MusicXML 解析与音轨数据提取
│   │   ├── App.jsx                 # 前端应用入口，负责多谱分屏与状态协同
│   │   └── index.css               # 全局 UI 样式与现代暗黑毛玻璃主题
│   ├── public/                     # 静态资源 (采样音源)
│   │   └── salamander/             # Salamander 豪华大三角钢琴 WAV 采样文件
│   └── package.json                # 前端 Node 依赖与构建配置
├── .gitignore                 # 统一的项目 Git 忽略配置
└── start.bat                  # 一键双端启动脚本
```

---

## 📥 克隆仓库后的本地安装与部署 (推荐)


### 前提条件
* 本地已安装 [Node.js](https://nodejs.org/) (建议 v18+ 或更高版本)
* 本地已安装 [Python 3.10+](https://www.python.org/)

---

### 第一步：配置后端环境与依赖
1. 打开命令行，进入项目根目录的 `backend` 文件夹：
   ```bash
   cd backend
   ```
2. 创建 Python 虚拟环境（这一步会自动生成 `venv` 文件夹）：
   ```bash
   python -m venv venv
   ```
3. 激活虚拟环境并安装 Python 依赖库（主要是 FastAPI 和 music21）：
   * **Windows 用户 (PowerShell / CMD)**：
     ```bash
     .\venv\Scripts\pip install -r requirements.txt
     ```
   * **macOS / Linux 用户**：
     ```bash
     source venv/bin/activate
     pip install -r requirements.txt
     ```

---

### 第二步：配置前端依赖
1. 打开另一个命令行窗口，进入项目根目录的 `frontend` 文件夹：
   ```bash
   cd frontend
   ```
2. 安装 Node.js 依赖模块（这一步会自动生成 `node_modules` 文件夹）：
   ```bash
   npm install
   ```

---

### 第三步：一键双端启动
当上面两步的依赖都安装完毕后，之后每次运行项目，只需在项目根目录下**双击 `start.bat` 脚本**。
脚本将会：
1. 启动本地 FastAPI 后端服务（运行在 `http://localhost:8000`）
2. 启动 Vite 前端开发服务器（运行在 `http://localhost:5173`）
3. 自动在浏览器中打开应用页面。

*(如果你是 macOS/Linux 用户，也可以在各自目录手动运行 `python main.py` 和 `npm run dev` 启动项目。)*

---


## 🔧 核心功能开发与修改指南

如果您想针对特定模块进行二次开发或定制修改，请参照以下路径：

### 1. 🎨 修改瀑布流视觉动效 (HTML5 Canvas)
* **核心文件**：[`frontend/src/components/TrackVisualizer.jsx`](file:///F:/Paino%20Waterfall/frontend/src/components/TrackVisualizer.jsx)
  * **落块颜色/渐变**：在 `drawPlaybackNote` 与 `drawLiveNote` 方法中修改 `ctx.fillStyle`。
  * **气泡与粒子喷射**：在 `createNoteParticles` 或 `updateParticles` 调整粒子的衰减速度和喷射范围。

### 2. 🎼 定制五线谱渲染与音名标注
* **核心文件**：[`frontend/src/utils/xmlModifier.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/xmlModifier.js) 和 [`frontend/src/components/ScoreViewer.jsx`](file:///F:/Paino%20Waterfall/frontend/src/components/ScoreViewer.jsx)
  * **音名显示格式**：在 `xmlModifier.js` 中修改 DOMParser 注入 `lyric` 节点的音名文本逻辑。
  * **五线谱渲染配置**：在 `ScoreViewer.jsx` 中调整 OpenSheetMusicDisplay 的缩放和定位参数。

### 3. 🔊 声音合成器与混响调节
* **核心文件**：[`frontend/src/utils/soundSynth.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js)
  * **声音采样与包络**：在 `playNote` 中微调起音、衰减、释音等 ADSR 时序，或在 `public/salamander/` 中替换 WAV 乐器采样音频。
  * **空间混响**：调整 `reverbMix` 增益来修改音效空间感。
