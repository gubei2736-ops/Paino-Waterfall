# 🎹 钢琴瀑布流与智能记谱系统 (Piano Waterfall & Sheet Music System)

这是一个集成了**钢琴瀑布流可视化**、**五线谱交互播放**、**MIDI/电脑键盘演奏**以及**智能录音转译记谱**的智能化、专业级网页应用。系统提供了精美的毛玻璃暗黑界面、沉浸式空间混响声效以及为教学练习量身定制的辅助模式。

---

## 🌟 核心亮点与最新特性

* **🎯 智能跟弹模式 (Practice Mode)**：乐谱播放至下落触键点时自动暂停等待，配合物理键盘**琥珀色呼吸灯提示**，弹对正确音符（支持和弦）后乐谱才会自动继续向下流动。
* **🎆 爆炸粒子物理特效 (Key Blast)**：全新的音符击键视觉动效，音符触键瞬间产生向上喷射的发光粒子流，配合重力衰减、星光闪烁与多色混合。
* **🎹 MIDI 对数力度与音色动态滤波 (Dynamic Velocity & Timbre)**：完美识别 MIDI 物理键盘击键力度，采用听觉对数感知音量曲线；同时引入动态滤波器，重击音色更明亮（高架滤波 +6dB 增益），轻弹音色更圆润，触键 Attack 时间可随力度动态调整。
* **🎛️ 空间混响与总音量控制 (Reverb Depth & Master Volume)**：无缝融合至和弦识别区域中心，支持滑块调节殿堂级空间混响衰减深度与全局总音量。
* **✂️ 乐谱时值静默压缩 (Auto Silence Compression)**：自动扫描 MusicXML 文件，若中间或末尾产生超过 2.0 秒的连续无声空白（常由 PDF 识别噪点引起），系统将自动裁剪该空白段并平移后续时间轴，避免播放等待。
* **🎼 标准 MusicXML 直接渲染**：废弃了破坏文件兼容性的音名注入，改为将标准的 MusicXML 直接载入 OpenSheetMusicDisplay (OSMD) 渲染，支持平滑缩放、点击乐谱音符跳转定位播放。
* **🎙️ 现场录音与转译记谱**：支持演奏录音，通过后端的 `music21` 核心自动将现场演奏的时值和音阶转译为标准 MIDI 或标准格式乐谱文件供下载。

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
│   │   │   ├── MidiKeyboard.jsx    # 钢琴主界面、控制栏、录音控制器与跟弹模式
│   │   │   ├── ScoreViewer.jsx     # OSMD 五线谱渲染与播放光标跟随
│   │   │   └── TrackVisualizer.jsx # Canvas 钢琴瀑布流与 Key Blast 等多种粒子动效
│   │   ├── utils/
│   │   │   ├── soundSynth.js       # Web Audio API 采样播放、动态混响、包络与滤波
│   │   │   └── musicXmlParser.js   # 智能 MusicXML 解析、O(log M) 节拍时间转换与静默压缩
│   │   ├── App.jsx                 # 前端应用入口，负责多谱分屏与状态协同
│   │   └── index.css               # 全局 UI 样式与现代暗黑毛玻璃主题
│   ├── public/                     # 静态资源 (采样音源)
│   │   └── salamander/             # Salamander 豪华大三角钢琴 WAV 采样文件
│   └── package.json                # 前端 Node 依赖与构建配置
├── .gitignore                 # 统一的项目 Git 忽略配置
└── start.bat                  # 一键双端启动脚本
```

---

## 📥 本地部署与分发使用

> 💡 **如果是直接压缩发给他人使用**：  
> 他人解压后**无法直接双击运行**。因为项目中庞大的依赖库（如前端的 `node_modules`，后端的 `venv` 虚拟环境）出于体积优化原因均被排除了。接收方需要按照以下部署指南进行**一次性的初始化依赖安装**，之后即可通过 `start.bat` 一键运行。

### 前提条件
* 本地已安装 [Node.js](https://nodejs.org/) (建议 v18+ 或更高版本)
* 本地已安装 [Python 3.10+](https://www.python.org/)

---

### 1. 配置后端环境与依赖
1. 打开命令行，进入项目根目录的 `backend` 文件夹：
   ```bash
   cd backend
   ```
2. 创建 Python 虚拟环境（这一步会自动生成 `venv` 文件夹）：
   ```bash
   python -m venv venv
   ```
3. 激活虚拟环境并安装 Python 依赖库：
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

### 2. 配置前端依赖
1. 打开另一个命令行窗口，进入项目根目录的 `frontend` 文件夹：
   ```bash
   cd frontend
   ```
2. 安装前端 Node 依赖包（会自动生成 `node_modules`）：
   ```bash
   npm install
   ```

---

### 3. 一键双端启动
依赖安装完毕后，之后每次运行项目，只需在项目根目录下**双击运行 `start.bat` 脚本**。  
该脚本会自动：
1. 启动 FastAPI 后端服务（端口 `http://localhost:8000`）
2. 启动 Vite 前端开发服务器（端口 `http://localhost:5173`）
3. 自动在系统默认浏览器中打开应用界面。

*(macOS/Linux 用户可通过终端在各自目录分别执行 `python main.py` 和 `npm run dev` 启动。)*

---

## 🔧 二次开发与微调指南

* **修改瀑布流与爆炸粒子**：前往 [`frontend/src/components/TrackVisualizer.jsx`](file:///F:/Paino%20Waterfall/frontend/src/components/TrackVisualizer.jsx)。可在 `p.type === 'keyBlast'` 中调整粒子喷射的引力、衰减速度或闪烁概率。
* **修改声音合成、音色包络或混响属性**：前往 [`frontend/src/utils/soundSynth.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js) 中的 `playNote` 以及 `startNote`，可在 `BiquadFilterNode` 中配置不同的高低架增益曲线来定制专属声效。
* **优化记谱解析器**：前往 [`frontend/src/utils/musicXmlParser.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/musicXmlParser.js)，修改 `convertBeatsToSeconds` 二分法算法或调整静默裁剪阈值 `SILENCE_THRESHOLD`。
