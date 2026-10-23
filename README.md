# Script Corrector (口播稿校对与字幕工具) `v1.2.0`

<p align="center">
  <img src="./public/script_corrector_icon.jpg" alt="Script Corrector Icon" width="136" height="136" style="border-radius: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" /><br/><br/>
  <a href="https://aistudio.google.com/">
    <img src="https://img.shields.io/badge/Open%20in-Google%20AI%20Studio-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Open in Google AI Studio" />
  </a>
  <a href="#-开源许可证-license">
    <img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=for-the-badge" alt="GPL v3 License" />
  </a>
  <a href="#-自动化测试矩阵-test-suite">
    <img src="https://img.shields.io/badge/Tests-40%2F40%20Passing-emerald?style=for-the-badge" alt="Tests 40/40 Passing" />
  </a>
  <a href="https://deepmind.google/technologies/gemini/">
    <img src="https://img.shields.io/badge/Model-Gemini%203.8%20Flash-orange?style=for-the-badge&logo=google" alt="Gemini 3.8 Flash" />
  </a>
</p>

一个专为口播音频、演讲录音与神学宣讲打造的高精度语音转录与字幕智能审校系统。系统深度整合 **Gladia ASR 语音识别** 与 **Google Gemini 3.8 Flash 大语言模型**，针对原始文字稿与说话人实际发音采用独创的**“双重标准 (Dual Standard)”**智能对齐校正，并提供符合现代影视与自媒体短视频排版标准的自动化语法断行、逐行统计与 `.srt` / `.txt` 字幕导出能力。

---

## 📝 更新日志 (Changelog)

### [v1.2.0] - 2026-10-22
- 🌐 **多语言全流程支持升级**：
  - 全面支持**西班牙语 (Español 默认)**、**法语 (Français)** 与 **英语 (English)** 的全流程智能校对与语音识别；
  - 西班牙语模式自动启用神圣人称代词首字母大写（Él, Su, Ti, Mí）、标点规范（¿? ¡! « »）以及西语语法断行规则；
  - 核对差异报告支持一键在**西班牙语全篇输出**与**中文输出**之间平滑切换。
- 🧱 **系统架构模块化大重构**：
  - **提示词配置文件解耦**：将原嵌入在前端组件中的长达 130 行提示词核心规则完整剥离至独立的配置文件 `src/config/prompts.ts` 与全局常量配置 `src/config/constants.ts`；
  - **组件化拆分**：原 1250 余行的单体 `App.tsx` 拆分为 `Header`、`QuotaAlert`、`TranscriptionPanel`、`ScriptPanel`、`SubtitleSettingsPanel`、`ResultsPanel` 等 6 大高内聚、低耦合子组件，主页面代码精简为清晰的流程编排器。
- 🛡️ **单次文本 10 万字符防御边界**：
  - 服务端新增严格的单次 Payload 上限防御，对于超过 100,000 字符（10 万字符）的请求直接予以拦截并返回 `HTTP 400 / PAYLOAD_TOO_LARGE`，保障服务资源与内存安全。
- 🧪 **全链路 40 项自动化测试覆盖（9 大测试套件，100% 满额通过）**：
  - 构建了基于 **Vitest + jsdom + @testing-library/react** 的全链路测试体系；
  - 覆盖配额保护（503/429/0 次重试）、网关防御（HTML 200 Starting Server 唤醒识别）、服务端校验（10 万字符边界/限流）、Gladia 语音转录模拟、前端组件点击交互，以及端到端全流程模拟串联测试。
- 📜 **引入 GNU General Public License v3.0 (GPL v3)** 开源许可证。

### [v1.1.0] - 2026-10-22
- 🚀 **模型引擎全面升级至 `gemini-3.8-flash`**：
  - 默认调用 Google 官方当前最新标准文本模型 `gemini-3.8-flash`；
  - 显著提升了多语言神学严谨校对的推理精度与语法分析稳定性。
- 🛡️ **严格 0 次自动重试机制（保护每日免费额度）**：
  - 彻底移除了后端在遭遇 503 / 429 报错时的后台静默循环重试，杜绝了此前因网络瞬时波动导致“前端点击 1 次在后台消耗 3 次请求额度”的问题；
  - 严格保持 1 动作 = 1 次 API 请求，最大程度守护 5 RPM 与 20 RPD 的宝贵免费调用配额。
- 📊 **智能诊断级错误看板与使用量检查提示**：
  - 页面顶部新增结构化错误卡片，直观显示 HTTP 状态码徽章（如 `HTTP 429`、`HTTP 503`、`CONTAINER_STARTING`）；
  - 自动归纳展示“🤔 猜测的错误原因 (Suspected Reason)”；
  - 醒目提供“💡 配额保护与用量检查提示 (Check Quota & Usage)”，一键直达 Google AI Studio 控制台查看 RPM/RPD 使用进度。
- 🌐 **容器冷启动唤醒与网关防御式解析**：
  - 重构前端对后端响应的读取流程（优先提取 `response.text()` 并防御性校验），彻底根除了 `SyntaxError: Unexpected token '<', "<!doctype "...` 的 JSON 语法解析崩溃；
  - 针对 AI Studio 容器在冷启动或重启时返回的 `Starting Server...` HTML 页面进行了精准识别，明确告知用户“容器正在唤醒中，未实际调用模型，消耗配额为 0”。

### [v1.0.0] - 2026-10-11
- 🎉 **首个正式发布版本**；
- 集成 Gladia ASR 语音识别与 Google Gemini 智能神学校正；
- 支持经文 100% 对齐文案（Strict Mode）与口语讲解忠实还原语音（Faithful Mode）的双重标准处理；
- 自动化字幕断行排版与视觉避险区间算法；
- 支持标准 `.srt` 字幕文件与时间轴 `.txt` 文本的一键导出。

---

## 🌟 核心特性与功能亮点

### 1. 独创的“双重标准”神学文本智能审校
在口播演讲与神学录音中，机械化的比对往往无法兼顾“神圣经文的庄严权威”与“口播讲员的自然发挥”。Script Corrector 采用双重标准策略：
- **经文与神话语部分 (Strict Mode)**：
  - 引用圣经经文、神的话语、祷告词部分，拼写、标点、措辞 **100% 严格遵照文案原稿（文本 B）**；
  - 强制遵循神圣代词首字母大写（Mayúscula Reverencial / Capitalisation Divine），如西语：*Él, Su, Suyo, Ti, Tú, Mí, Señor, Padre*；
  - 标点符号使用标准拉丁书名号 `« ... »` 与西语倒问号/倒感叹号 `¿? ¡!`。
- **口语讲解与非经文部分 (Faithful Mode)**：
  - 讲员的解释、见证与过渡语，**忠实还原说话人实际录音（文本 A）**；
  - 保留口语连接词与语气词（如西语：*bueno, pues, o sea, entonces*；法语：*et bah, en fait, du coup*）；
  - 自动修复语音识别（ASR）造成的同音词混淆（如 *ha / a / ah*, *hecho / echo*, *tubo / tuvo*）与重音符错漏（Tildes）。

### 2. 多语言全方位支持
- 🇪🇸 **西班牙语 (Español)**：神圣代词大写、西语标点、语法断行，差异报告全篇西语/中文自由切换。
- 🇫🇷 **法语 (Français)**：法语标点规范、神性代词大写、专有名词与章节格式对齐。
- 🇬🇧 **英语 (English)**：双重标准校对、标点与语法自动修正。

### 3. 影视级智能字幕断行与排版避险
- **字符数严格限制**：支持自定义单行最长字符数（默认 25，推荐 25~36）与最短字符数（默认 12，防止单字成行）；
- **语法停顿断行**：优先在标点（句号、逗号、分号、书名号）与自然语义分句处换行，严禁词内截断；
- **防悬挂介词/冠词**：自动消除行末孤悬的单字介词与短连词（如西语 *« y », « a », « en », « de », « el », « la »*）；
- **视觉排版避险 (Visual Optimization)**：自动避开容易导致视觉疲劳的不协调断行区间。

### 4. 丰富多格式字幕导出
- **标准 SRT 字幕 (`.srt`)**：根据音频总播放时长与各行字数比重自适应计算毫秒级时间戳，可无缝导入 **剪映 (CapCut)、Adobe Premiere Pro、Final Cut Pro、DaVinci Resolve** 等剪辑软件；
- **时间轴纯文本 (`.txt`)**：带有清晰行号索引与时间范围的格式化审校记录。

---

## 🛡️ 配额保护与系统安全架构

| 防护维度 | 实现方案与机制 | 带来的保障 |
| :--- | :--- | :--- |
| **0 次后台静默重试** | 遭遇 503 / 429 报错时立即返回客户端，后台重试次数设为 **0** | 杜绝网络瞬时抖动造成数倍消耗，保护 5 RPM / 20 RPD 免费额度 |
| **单次 10 万字符防御** | 服务端对提交的 Prompt 执行字符数硬校验（$\le 100,000$） | 拦截异常超大请求，彻底阻断内存溢出或 DoS 攻击 |
| **网关 200 HTML 防御** | 客户端在 JSON 解析前执行 HTML 探针检测与不区分大小写的标签检查 | 优雅识别容器冷启动 `Starting Server` 页面，0 配额消耗明确提示 |
| **双重存活探针** | 点击处理前先行通过 `/api/health` 轮询校验服务是否已输出真实 JSON | 避开平台容器重启的 2~3 秒窗口，防止请求直接撞上网关过渡页 |
| **模型安全白名单** | 服务端配置白名单集合，仅允许经过认证的 Google 官方模型别名透传 | 防止非法/恶意模型参数传递至后台 |
| **IP 速率限制器** | 内置内存级 IP 频率监控（Rate Limiter） | 防止短时间恶意高频突发调用打满网关 |

---

## 🧪 自动化测试矩阵 (Test Suite)

项目配备了高密度的自动化回归测试矩阵，可通过 `npm test` 离线运行，耗时仅约 **4 秒**，且**不产生任何真实网络请求或配额消耗**：

```text
✓ test/components_interaction.test.tsx (4 tests)  # 前端组件交互、语言切换与按钮点击测试
✓ test/subtitle_formatter.test.ts      (7 tests)  # 西语法语断行、时间戳精度与文件名安全测试
✓ test/quota_protection.test.ts        (4 tests)  # 503/429错误诊断、0次重试与配额保护测试
✓ test/response_shield.test.ts         (4 tests)  # 网关 HTML 200/504 页面防御与流安全测试
✓ test/server_api.test.ts              (5 tests)  # 10万字符上限拦截、模型白名单与速率限制测试
✓ test/e2e_pipeline.test.ts            (2 tests)  # 端到端全流程模拟串联测试（Audio -> SRT）
✓ test/gladia_transcribe.test.ts       (5 tests)  # Gladia 402额度耗尽、自定义Key与语言映射测试
✓ test/prompts.test.ts                 (4 tests)  # 西语法语神学提示词配置文件测试
✓ test/diff_parser.test.ts             (5 tests)  # 大模型 JSON 鲁棒性与差异提取容错测试

Test Files  9 passed (9)
Tests       40 passed (40)
Duration    ~4.3s (100% 满额通过)
```

---

## 📖 使用操作指南 (Step-by-Step Guide)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 1. 语音设置     │       │ 2. 输入文案     │       │ 3. 字幕参数     │
│ 上传音频/选择语种 ├──────►│ 粘贴原稿(文本B)  ├──────►│ 设置行长/避险   │
└─────────────────┘       └─────────────────┘       └────────┬────────┘
                                                             │
                                                             ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 6. 导出字幕     │       │ 5. 双重智能校对 │       │ 4. 一键处理     │
│ 下载 SRT / TXT   │◄──────┤ 查看文本C与差异  │◄──────┤ 开始处理 / 仅校对│
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **选择核对语言**：在页面左侧点击选择 **🇪🇸 西班牙语**、**🇫🇷 法语** 或 **🇬🇧 英语**。
2. **上传口播音频**：点击或将录音文件（MP3, WAV, M4A, OGG 等）拖拽至上传区域，系统自动读取音频时长。
3. **输入文案原稿 (文本 B)**：在左侧文本框粘贴原始文稿（神圣经文建议带完整标点）。
4. **配置排版参数**：按需设置单行最长字符数（默认 25）、最短字符数（默认 12）或直接点击“✓ 标准规范”与“宽松排版”预设。
5. **开始处理**：
   - 点击 **“完整处理 (Audio + Gemini)”**：系统先调用 Gladia 完成音频转录（得到文本 A），紧接着调用 Gemini 3.8 Flash 输出精准校正（得到文本 C）与差异分析；
   - 点击 **“仅运行 Gemini (Text Only)”**：无需音频，直接对原稿或既有转录文本执行大模型校对。
6. **导出字幕文件**：在校对结果栏点击 **“导出为 SRT”** 或 **“导出为 TXT”**，即刻下载可直接导入主流剪辑软件的字幕文件。

---

## 🛠️ 项目结构与模块划分

```text
├── LICENSE                     # GNU General Public License v3.0 (GPL-3.0)
├── README.md                   # 项目工程说明文档
├── package.json                # 项目依赖与脚本 (Version 1.2.0)
├── server.ts                   # Express 全功能后端服务 (Gemini API 代理与限流)
├── index.html                  # HTML 入口
├── src/
│   ├── main.tsx                # React 19 应用启动入口
│   ├── App.tsx                 # 核心流程编排器组件
│   ├── config/
│   │   ├── prompts.ts          # 提示词系统独立配置文件 (西语/法语/英语)
│   │   └── constants.ts        # 全局常量、模型与排版默认值
│   ├── types/
│   │   └── index.ts            # 全局 TypeScript 接口与类型定义
│   ├── components/
│   │   ├── Header.tsx          # 顶部导航与品牌标识组件
│   │   ├── QuotaAlert.tsx      # 错误诊断与用量检查看板组件
│   │   ├── TranscriptionPanel.tsx # 语音识别设置与音频上传面板
│   │   ├── ScriptPanel.tsx     # 文案原稿编辑与字数统计面板
│   │   ├── SubtitleSettingsPanel.tsx # 字幕断行排版与预设参数面板
│   │   └── ResultsPanel.tsx    # 识别结果、校正文本与差异报告面板
│   └── utils/
│       └── subtitleFormatter.ts# 核心语法断行、SRT/TXT 生成与时间戳计算引擎
└── test/                       # 9 大全自动化测试套件 (40 项用例)
```

---

## 💻 本地运行与开发

### 1. 克隆并安装依赖
```bash
git clone https://github.com/Try7x7/ScriptCorrector.git
cd ScriptCorrector
npm install
```

### 2. 运行自动化测试
```bash
npm test
```

### 3. 启动开发服务器
```bash
npm run dev
```
> 服务将在 `http://localhost:3000` 启动，后端 API 代理与 Vite 前端热服务协同运行。

### 4. 生产构建与代码质量检查
```bash
npm run lint    # 静态类型检查 (tsc --noEmit)
npm run build   # 生产环境打包构建
```

---

## 📜 开源许可证 (License)

本项目采用 **[GNU General Public License v3.0 (GPL-3.0)](./LICENSE)** 许可证开源。

欢迎自由使用、学习与二次分发，但衍生项目与修改版本必须同样以 GPL v3 保持开源并保留版权说明。
