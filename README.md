# 🎹 钢琴瀑布流与智能记谱系统 (Piano Waterfall)

这是一个集成了**钢琴瀑布流可视化**、**五线谱交互播放**、**MIDI/电脑键盘演奏**以及**智能录音转译记谱**的专业级网页应用。系统提供了精美的毛玻璃暗黑界面、沉浸式空间混响声效以及为教学练习量身定制的多种辅助模式。
<img width="2538" height="1283" alt="image" src="https://github.com/user-attachments/assets/9764f907-ab8c-4f49-bdce-a6fbcb40f61e" />

---

## 🌟 核心功能一览

### 🎼 演奏与播放
- **MIDI 键盘 / 电脑键盘支持**：A–L 对应白键 C4–D5，W–P 对应黑键，完整映射 88 键
- **乐谱可视化播放**：支持 MusicXML / MIDI / PDF / 图片格式，OSMD 五线谱渲染，点击音符跳转播放位置
- **智能跟弹模式 (Practice Mode)**：乐谱自动暂停等待，配合琥珀色呼吸灯提示，弹对音符后继续推进
- **双谱分屏对照**：上下两个乐谱槽，可同时加载两份乐谱对照参考
- **空间混响 & 音量控制**：殿堂级混响深度与全局音量实时调节

### 🎨 瀑布流视觉特效
- **气泡 / 水流 / 情书 / 爆炸粒子 / 呼吸 / 力度染色**：六种可独立开关的动态粒子特效
- **黑白键色**：白键音符条亮度为黑键的 50%，凸显键盘层次
- **自定义色彩模式**（最多 5 色循环渐变）：
  - **中央C双色**：以中央 C（MIDI 60）为分界，左右两侧独立配色
  - **黑白键色Plus**：白键与黑键分别设置独立颜色
  - **四区联动模式**（黑白键色Plus + 中央C双色同时开启）：高音白键 / 高音黑键 / 低音白键 / 低音黑键四区完全独立配色

### 🎯 专注模式
- **一键全屏沉浸**：隐藏所有 UI 面板，仅保留瀑布流与钢琴键盘，四边无边框、无圆角
- **Esc 键快速退出**
- **键盘范围控制浮层**：2 秒无操作自动隐藏，鼠标划入热区平滑唤醒

### 🎹 和弦检测区
- **和弦检测开关**：可开/关，状态持久化；关闭后和弦名称与音符列表同步隐藏
- **自动显示/隐藏**：开启状态下，演奏时显示和弦名称，停止演奏后自动淡出；鼠标悬停热区可唤出开关按钮
- **乐理卡片**：点击和弦名称展开乐理详情（和弦类型、音符构成、级数分析、微型钢琴指法图）

### 🔊 音色引擎
- **Salamander 豪华三角钢琴采样**：30 个采样点全音域高质量 WAV 插值
- **MIDI 对数力度曲线**：符合听觉感知的力度映射，重击音色明亮、轻弹圆润
- **自定义音源加载**：支持将自定义 WAV/MP3 采样放入 `public/soundfonts/` 子目录自动扫描

### 🎙️ 录音转谱
- 现场演奏录音，通过后端 `music21` 自动转译为标准 MusicXML 乐谱供下载

---

## 📂 项目结构

```text
Piano Waterfall/
├── backend/                        # 后端服务 (FastAPI + music21)
│   ├── main.py                     # MIDI转译、音源探测、音频转码
│   ├── requirements.txt            # Python 依赖
│   └── venv/                       # Python 虚拟环境（本地新建）
├── frontend/                       # 前端项目 (Vite + React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── MidiKeyboard.jsx    # 钢琴主界面、控制栏、色彩设置、录音与跟弹
│   │   │   ├── ScoreViewer.jsx     # OSMD 五线谱渲染与播放光标跟随
│   │   │   └── TrackVisualizer.jsx # Canvas 瀑布流、多种粒子特效、分区配色渲染
│   │   ├── utils/
│   │   │   ├── soundSynth.js       # Web Audio API 采样播放、混响、包络与滤波
│   │   │   ├── musicXmlParser.js   # MusicXML 解析、节拍转换与静默压缩
│   │   │   ├── midiParser.js       # MIDI 文件二进制解析
│   │   │   └── keyboardLayout.js   # 88 键布局与 MIDI 映射表
│   │   ├── App.jsx                 # 应用入口，双谱分屏与状态协同
│   │   ├── main.jsx                # React 挂载入口
│   │   └── index.css               # 全局 UI 样式与暗黑毛玻璃主题
│   ├── public/
│   │   ├── salamander/             # Salamander 钢琴 WAV 采样文件
│   │   ├── soundfonts/             # 用户自定义音源目录（子目录自动扫描）
│   │   └── favicon.svg
│   └── package.json
├── .gitignore
├── start.bat                       # Windows 一键双端启动脚本
└── README.md
```

---

## 📥 本地部署

> 💡 **首次部署说明**：`node_modules` 和 `venv` 因体积原因不随代码分发，首次使用需按以下步骤初始化，之后每次运行只需双击 `start.bat`。

### 前提条件
- [Node.js](https://nodejs.org/) v18 及以上
- [Python 3.10+](https://www.python.org/)

---

### 1. 初始化后端

```bash
cd backend
python -m venv venv
```

- **Windows**：`.\venv\Scripts\pip install -r requirements.txt`
- **macOS / Linux**：`source venv/bin/activate && pip install -r requirements.txt`

---

### 2. 初始化前端

```bash
cd frontend
npm install
```

---

### 3. 启动应用

初始化完成后，在项目根目录**双击 `start.bat`** 即可：
1. 自动启动 FastAPI 后端（`http://localhost:8000`）
2. 自动启动 Vite 前端开发服务器（`http://localhost:5173`）
3. 自动在浏览器中打开界面

> *macOS / Linux：在 `backend/` 运行 `python main.py`，在 `frontend/` 运行 `npm run dev`*

---

## 🔧 二次开发指南

| 目标 | 位置 |
|---|---|
| 修改瀑布流粒子特效（气泡、爆炸、水流等） | `TrackVisualizer.jsx` |
| 修改黑白键配色渲染逻辑 | `TrackVisualizer.jsx` → `getActiveNoteColor()` 函数 |
| 修改音色包络、混响参数 | `soundSynth.js` → `playNote()` / `startNote()` |
| 修改 MusicXML 解析逻辑或静默裁剪阈值 | `musicXmlParser.js` → `SILENCE_THRESHOLD` |
| 添加自定义钢琴音源 | 在 `frontend/public/soundfonts/` 下新建子目录，放入 WAV/MP3 文件（文件名为 1–88 的数字或 C4、#C4 等音名格式） |

---

## ⌨️ 快捷键

| 按键 | 功能 |
|---|---|
| `A` – `L` | 白键 C4 – D5 |
| `W` `E` `T` `Y` `U` `O` `P` | 黑键 C#4 – D#5 |
| `Esc` | 退出专注模式 |
