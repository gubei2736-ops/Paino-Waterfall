# 🎹 钢琴瀑布流与智能记谱系统 (Piano Waterfall & Sheet Music System)

这是一个集成了**钢琴瀑布流可视化**、**五线谱交互播放**、**MIDI/电脑键盘演奏**以及**智能录音转译记谱**的现代化网页应用。项目去除了冗余的 AI 图像识别（OMR）模块，保留了纯净的基于 `music21` 的音频录制转译核心，提供轻量、高效的乐谱辅助教学体验。

---

## 📂 项目结构与模块设计

项目采用前后端分离架构设计，结构极简且模块清晰：

```text
Piano Waterfall/
├── backend/                   # 后端服务 (FastAPI + music21)
│   ├── main.py                # 主服务逻辑：MIDI转译、音源探测、音频转码
│   ├── requirements.txt       # 后端 Python 依赖
│   └── venv/                  # Python 虚拟环境
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

## ⚡ 快速启动

1. **一键启动**：双击根目录下的 `start.bat`，脚本将自动激活后端虚拟环境并启动 FastAPI，同时在前端运行 Vite 开发者服务器。
2. **访问应用**：在浏览器中打开命令行输出的本地地址（默认前端为 `http://localhost:5173`，后端 API 为 `http://localhost:8000`）。

---

## 🔧 核心功能开发与修改指南

如果您想针对特定模块进行二次开发或定制修改，请参照以下路径：

### 1. 🎨 修改瀑布流视觉动效 (HTML5 Canvas)
* **核心文件**：[`frontend/src/components/TrackVisualizer.jsx`](file:///F:/Paino%20Waterfall/frontend/src/components/TrackVisualizer.jsx)
* **如何修改**：
  * **修改瀑布流落块颜色/渐变**：定位到 `drawPlaybackNote` 与 `drawLiveNote` 方法，修改 `ctx.fillStyle` 为您喜爱的 Canvas 线性渐变或纯色。
  * **调整气泡与粒子喷射特效**：定位到 `createNoteParticles` 或 `updateParticles`，可以更改粒子的衰减速度（`alpha`）、大小（`radius`）、喷射速度（`vx`, `vy`）或启用全新的重力加速度参数，让击键效果更加华丽。
  * **瀑布流流动方向**：修改 `y` 轴坐标的映射方向，可将“下落式（Falling）”改为“上升式（Rising）”。

### 2. 🎼 定制五线谱渲染与音名标注
* **核心文件**：[`frontend/src/utils/xmlModifier.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/xmlModifier.js) 和 [`frontend/src/components/ScoreViewer.jsx`](file:///F:/Paino%20Waterfall/frontend/src/components/ScoreViewer.jsx)
* **如何修改**：
  * **修改音名标注的显示格式**：`xmlModifier.js` 通过 DOMParser 动态解析 MusicXML，并在音符的 `lyric` 节点注入中文或英文音名。若想增加简谱数字或改变标注的层级，可在此文件中修改节点注入逻辑。
  * **修改光标样式与行为**：`ScoreViewer.jsx` 实例化并渲染 OpenSheetMusicDisplay（OSMD）。您可以修改 cursor 样式或调整 `playbackTime` 同步计算算法。如需修改红线光标的颜色和宽度，可在 `index.css` 的 `.osmdCursor` 相关选择器中进行修改。

### 3. 🔊 声音合成器与混响调节
* **核心文件**：[`frontend/src/utils/soundSynth.js`](file:///F:/Paino%20Waterfall/frontend/src/utils/soundSynth.js)
* **如何修改**：
  * **更换乐器采样音源**：修改 `soundSynth.js` 中的采样加载映射（默认为 `salamander` 钢琴的 A0-C8 采样）。您可以替换 `public/salamander/` 下的 WAV 音频文件，或指向其他乐器的采样目录。
  * **调节合成包络（ADSR）**：在 `playNote` 方法中，修改 `gainNode.gain.linearRampToValueAtTime` 及其时间参数，以调整音符的起音（Attack）、衰减（Decay）与余音释放（Release）长度。
  * **调整空间混响（Reverb）**：修改 `createReverbConvolver` 中的脉冲冲激响应缓冲，或调整 `reverbMix` 的增益（Gain）比率，来增强或减弱音乐厅混响质感。

### 4. 🎤 录音转译记谱逻辑 (Python 后端)
* **核心文件**：[`backend/main.py`](file:///F:/Paino%20Waterfall/backend/main.py)
* **如何修改**：
  * **修改 MIDI 音轨转谱逻辑**：定位到 `/api/transcribe` 接口。后端使用 `music21.stream.Part` 动态构建小节。您可以修改量子化（Quantization）规则，调整音符时值圆整（如将 16 分音符过滤或合并为 8 分音符）。
  * **修改转译输出样式**：在 `music21` 组装完乐谱（Stream）后，可在导出前利用库内置方法注入特定的调性标记（Key Signature）、拍号（Time Signature）或作者元信息。
