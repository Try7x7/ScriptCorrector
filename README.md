# Script Corrector (口播稿校对工具-法语)

<p align="center">
  <img src="./src/assets/images/script_corrector_icon_1791735239310.jpg" alt="Script Corrector Icon" width="128" height="128" style="border-radius: 24px;" />
</p>

一个专为口播音频、演讲和神学录音打造的高精度语音转录与字幕智能校对工具。系统结合 **Gladia ASR** 语音识别与 **Google Gemini** 大语言模型，针对原始文案与实际发音进行“双重标准”智能对齐校正，并提供符合现代影视/自媒体规范的自动化字幕断行与 SRT/TXT 导出能力。

---

## ⚠️ 重要说明：Gemini API 与部署环境

> **核心提示**：本项目针对 **Google AI Studio** 托管环境进行了深度定制与集成（具备 `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` 能力）。

### 1. 部署在 Google AI Studio 环境
- **免去自行配置/管理外部 Gemini API 服务的开销**：当项目在 Google AI Studio 内部部署与运行时，平台服务会在容器运行时自动通过内部机制注入与托管 Gemini API 凭证，无需在客户端暴露密钥，也无需自行搭建复杂的第三方 LLM API 转发代理或单独维护外部账单。
- 平台自动管理运行时生命周期，实现服务端安全的开箱即用。

### 2. 部署在非 Google AI Studio 外部环境（如自建 VPS、Docker、Vercel 等）
- 外部环境**无法**享受 Google AI Studio 平台的内置 Gemini 凭据托管服务。
- 您**必须**在服务器环境变量或 `.env` 文件中显式配置您自行申请的 `GEMINI_API_KEY`，否则后端在调用 `/api/correct` 进行文本校正时将抛出 `500` 错误并提示未配置有效密钥。

---

## 🌟 核心特性

1. **精准语音转录 (ASR)**：
   - 基于 Gladia Speech-to-Text 引擎，支持 MP3, WAV, M4A, AAC, OGG 等常见音频格式。
   - 支持后端预设系统级 Gladia API Key，亦支持用户在前端临时填入个人自定义 Key。

2. **“双重标准”神学文本智能校正 (Gemini 3.6 Flash)**：
   - **经文与神话语 (Strict Mode)**：严格 100% 对齐原始文案（文本 B），包括标点（法语引号 « ... »）、神性代词大写（Il, Son, Lui 等）与圣经章节规范。
   - **口语讲解/非经文部分 (Faithful Mode)**：忠实还原语音（文本 A）真实口语表达，保留说话人真实连接词，仅修正同音词、变位错漏等 ASR 错误。
   - 自动生成中文差异对比报告（改词、加词、漏词分析）。

3. **字幕规范自动排版与排版避险**：
   - 可配置每行最大字符数（推荐 28~36 字符）与最小字符数。
   - 智能语法停顿断行，避免悬挂介词/冠词。
   - 视觉排版避险算法，避开易造成视觉不协调的行长区间。

4. **多格式字幕导出**：
   - **SRT 字幕文件**：根据音频真实时长或自然阅读语速自动生成精确时间戳。
   - **TXT 文本文件**：带有序号与时间区间排版的纯文本记录。

---

## 🛡️ 安全架构设计

本项目已完成全面的应用安全工程加固：
- **Prompt 闭环管理**：提示词构建逻辑完全收拢于服务端受信环境，前端仅传输结构化文本参数，彻底杜绝外部任意 Prompt 注入与未授权 LLM 代理滥用。
- **音频文件白名单**：Multer 严格限制上传文件为合法音频 MIME 类型与扩展名，限制单文件最大 50MB。
- **内存 DoS 防护**：全局 JSON 与 URL-encoded 限制为 2MB，防止恶意大包打满 Node.js V8 堆内存。
- **智能速率限制 (Rate Limiting)**：
  - `/api/transcribe` 限制单 IP 每分钟 12 次请求。
  - `/api/correct` 限制单 IP 每分钟 20 次请求。
- **网络反向代理与传输安全**：
  - 启用 `trust proxy`，精确识别多层网关下的客户端真实 IP。
  - 上游轮询接口严格执行 HTTPS 协议与域名双重校验。
- **依赖供应链 0 漏洞**：全量锁文件经过深度 CVE/GHSA 修复与验证（`npm audit: 0 vulnerabilities`）。

---

## 🛠️ 环境变量说明

复制 `.env.example` 为 `.env`：

```bash
# Gemini API Key（在 Google AI Studio 中会自动注入；在外部自建部署时必须提供）
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Gladia API Key（用于语音转录）
GLADIA_API_KEY="YOUR_GLADIA_API_KEY"

# 应用运行公网地址（由平台自动注入）
APP_URL="YOUR_APP_URL"
```

---

## 🚀 本地开发与构建

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```
> 服务将在 `http://localhost:3000` 启动，后端 API 与 Vite 前端中间件协同运行。

### 生产环境编译构建
```bash
npm run build
```

### 类型与代码质量检查
```bash
npm run lint
```
