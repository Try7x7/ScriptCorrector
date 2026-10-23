import { SupportedLanguage, ReportLanguage, PromptFormattingOptions } from '../types';

export function getCorrectionPrompt(
  lang: SupportedLanguage,
  transcribed: string,
  originalScript: string,
  reportLang: ReportLanguage = 'es',
  formattingOptions: PromptFormattingOptions
): string {
  const {
    enableLineBreaks,
    maxLineLength,
    minLineLength,
    enableVisualOptimization,
    visualOptStart,
    visualOptEnd
  } = formattingOptions;

  if (lang === 'es') {
    const isSpanishReport = reportLang === 'es';
    return `你是一个专业的音频转录编辑，专门处理西班牙语神学内容与口播稿的字幕校对。
你的任务是将语音识别生成的原始西班牙语文本（文本A）修正为准确、通顺且符合神学规范的西班牙语字幕文本（文本C），同时参考文案原稿（文本B）进行核对。

### 核心原则：采用“双重标准”处理策略
1. **经文与神话语部分 (Strict Mode - Citas Bíblicas y Palabras Divinas)**：严格对齐文案原稿（文本B）。
2. **口语讲解部分 (Faithful Mode - Discurso Oral y Explicaciones)**：忠实还原实际录音（文本A），仅修复语音识别（ASR）错误与语法错漏。

### 详细修正规则：

#### 1. 经文与神话语部分 (Strict Mode)
- **适用范围**：引用圣经经文、直接引用上帝/耶稣的话语（如：Dios dice / Jesús dice...）、祷告词。
- **绝对权威**：此部分的拼写、标点、措辞必须 100% 严格按照文本B执行。即使录音中的说话人读错或稍有改词，也必须强制修正为文本B的标准写法。
- **神圣代词首字母大写 (Mayúscula Reverencial / Divina)**：在西班牙语神学规范中，所有指代上帝、耶稣、圣灵的人称代词与物主代词必须首字母大写（例如：Él, Su, Suyo, Ti, Tú, Mí, Señor, Padre）。
- **标点符号**：使用西班牙语规范引号 « ... » (comillas latinas) 或 “ ... ” 包裹经文或神的话语。注意西班牙语开头的倒问号 ¿ 与倒感叹号 ¡ 必须正确配对，严格跟随文本B的标点位置。
- **专有名词与圣经章节**：书卷名采用标准西班牙语（如 Mateo, Marcos, Lucas, Juan, Hechos, Romanos, Corintios, Gálatas, Efesios, Filipenses, Colosenses, Génesis, Éxodo, Salmos, Proverbios, Isaías 等）。章节格式统一为标准规范（如 Juan 3:16）。

#### 2. 口语讲解/非经文部分 (Faithful Mode)
- **适用范围**：讲员的解释、见证、引导语、结尾问候与自由口播。
- **忠实还原语音**：不要机械照搬文本B。如果说话人在录音中有改词、加词、漏词或换了说法，必须准确记录说话人实际说的西班牙语内容。
- **保留西语口语特征**：保留说话人的西班牙语口语连接词、语气助词（如：bueno, pues, o sea, es decir, entonces, la verdad, claro, mira, fíjate 等）以及自然的口语表达结构。
- **修复西语 ASR 识别错误**：
  - 修复西语同音词/近音词混淆（例如：ha / a / ah, hecho / echo, tubo / tuvo, habría / abría, rebelar / revelar, vez / ves 等）。
  - 修复重音符错漏（Tildes: está / esta, él / el, sí / si, más / mas, cómo / como, qué / que, dónde / donde, cuándo / cuando 等）。
  - 修复动词人称变位错漏与无意义的 ASR 听辨噪词。

#### 3. 通用格式规范
- **数字**：一般小数字 1, 2, 3 转为西语单词 uno/una, dos, tres（除非是章节号、具体年份或长数字编号）。
- **缩写**：如 N.° / núm. -> número 等。
${enableLineBreaks ? `- **强制断行要求 (西班牙语字幕排版关键准则，必须使用 \\n 换行符)**：
  - **逐行输出**：请务必在 \`correctedText\` 中**使用换行符 (\\n)** 将整篇文本分割为一行一行的标准西班牙语字幕，不要输出为一整段不换行的长篇文本！
  - **字符数严格限制 (以字母、标点和空格总字符数为准)**：
    - 每行最长不得超过 ${maxLineLength} 个字符（包含标点与空格）。
    - 每行最短建议不低于 ${minLineLength} 个字符（避免单个单词独立成行）。
${enableVisualOptimization ? `    - **避开视觉盲区**：尽量避免单行字符数落在 ${Math.min(visualOptStart, maxLineLength - 2)} 到 ${Math.min(visualOptEnd, maxLineLength)} 个字符的区间。` : ''}
  - **西班牙语语义断行法则**：
    1. 优先在句子与分句标点处（句号 .、问号 ?、感叹号 !、逗号 ,、分号 ;、冒号 :、省略号 …、西语引号 « »）自然停顿断行。
    2. 依据西班牙语语法结构（主谓宾、关系从句、介词短语）合理断行，切勿在单词内部截断。
    3. 严禁单字或短介词/冠词/连词在行末悬挂或孤立（例如：« y », « e », « o », « u », « a », « en », « de », « el », « la », « un », « una », « por », « para », « con », « sin » 必须与后接名词或从句在同一行）。
    4. 对称平衡：长句拆分为两行时，前后两行字符数尽量均衡。` : '- **断行要求**：不需要换行，直接输出为一整段连续文本（不包含换行符）。'}

### 输出要求：
- 请以 JSON 格式输出，包含以下两个字段：
  - \`correctedText\`: 最终的西班牙语文本C。特别注意：如果启用了断行，行与行之间必须使用换行符 (\\n) 分隔。
  - \`differences\`: 文本C与文本B（文案原稿）的核对与差异分析报告。${
    isSpanishReport
      ? `**【重要：必须全篇使用西班牙语撰写此报告 (Redactar obligatoriamente en español)】**。请条理分明地列出差异，格式清晰，包含：\n    - Palabras o frases modificadas / cambiadas: 对比原稿（Texto B）与实际录音口播（Texto C）的用词改变。\n    - Palabras o frases añadidas: 录音中多讲或补充的内容。\n    - Palabras o frases omitidas: 原稿中有但录音中遗漏未读的内容。\n    - Discrepancias generales: 任何与文案原稿不一致的语法或词汇差异。`
      : `**【请使用中文回复此字段】**。请详细列出说话人改词、加词、漏词或与文案不一致的地方，并注明文本B原词与文本C实际西语词汇的对照。`
  }
- 不要包含 markdown 代码块标记（如 \\\`\\\`\\\`json），直接输出 JSON 字符串。

---
**文本A (原始西班牙语语音识别结果)：**
${transcribed}

**文本B (西班牙语文案原稿)：**
${originalScript}`;
  }

  if (lang === 'fr') {
    return `你是一个专业的音频转录编辑，专门处理法语神学内容的字幕校对。
你的任务是将语音识别生成的原始文本（文本A）修正为准确、通顺且符合神学规范的字幕文本（文本C），同时参考文案原稿（文本B）进行核对。

### 核心原则：采用“双重标准”处理策略
1. **经文与神话语部分 (Strict Mode)**：严格对齐文案（文本B）。
2. **口语讲解部分 (Faithful Mode)**：忠实还原语音（文本A），仅修复错误。

### 详细修正规则：

#### 1. 经文与神话语部分 (Strict Mode)
- **适用范围**：引用圣经经文、直接引用上帝的话（Dieu dit / Jésus dit...）、祷告词。
- **绝对权威**：此部分的拼写、标点、措辞必须 100% 严格按照文本B执行。即使说话人读错或稍微改词，优先修正为文本B的标准写法。
- **神性代词大写 (Capitalisation Divine)**：所有指代上帝、耶稣、圣灵的代词必须首字母大写（如：Il, Son, Lui, Ton, Moi）。
- **标点符号**：必须使用法语引号 « ... » 包裹经文或神的话语。严格跟随文本B的逗号、句号位置。
- **专有名词与章节**：书卷名必须准确且大写（如 Matthieu, Ésaïe）。章节格式统一为“书名 章:节”（如 Jean 3:16）。

#### 2. 口语讲解/非经文部分 (Faithful Mode)
- **适用范围**：讲员的解释、见证、引导语、结尾问候。
- **忠实还原语音**：不要照搬文本B。如果说话人改词、加词或换了说法，必须记录说话人实际说的内容。
- **保留口语特征**：保留连接词和语气词（如：et bah, en fait, donc, alors, du coup）和口语语法结构。
- **修复 ASR 错误**：修复同音词错误（如 verre -> ver, encre -> ancre）、动词变位错误、以及无意义的听辨错误。

#### 3. 通用格式规范
- **数字**：将数字 1, 2, 3 改为单词 un/une, deux, trois（除非是章节号或年份）。
- **缩写**：N° -> numéro。
${enableLineBreaks ? `- **强制断行要求 (字幕排版关键准则，必须使用 \\n 换行符)**：
  - **逐行输出**：请务必在 \`correctedText\` 中**使用换行符 (\\n)** 将整篇文本分割为一行一行的标准字幕，不要输出为一整段不换行的长篇文本！
  - **字符数严格限制 (以字母、标点和空格总字符数为准)**：
    - 每行最长不得超过 ${maxLineLength} 个字符（包含标点与空格）。
    - 每行最短建议不低于 ${minLineLength} 个字符（避免单个词独立成行）。
${enableVisualOptimization ? `    - **避开视觉盲区**：尽量避免单行字符数落在 ${Math.min(visualOptStart, maxLineLength - 2)} 到 ${Math.min(visualOptEnd, maxLineLength)} 个字符的区间。` : ''}
  - **语义断行法则**：
    1. 优先在句子与分句标点处（句号 .、问号 ?、感叹号 !、逗号 ,、分号 ;、冒号 :、省略号 …、法语引号 « »）自然停顿断行。
    2. 依据语法结构（主谓宾、关系从句、介词短语）合理断行，切勿在单词中间截断。
    3. 严禁单字介词/冠词在行末悬挂或孤立（如 « et », « de », « le », « la », « un », « une », « à », « pour » 必须与后接名词或从句在同一行）。
    4. 对称平衡：长句拆分为两行时，前后两行字符数尽量均衡。` : '- **断行要求**：不需要换行，直接输出为一整段连续文本（不包含换行符）。'}

### 输出要求：
- 请以 JSON 格式输出，包含以下两个字段：
  - \`correctedText\`: 最终的文本C。特别注意：如果启用了断行，行与行之间必须使用换行符 (\\n) 分隔。
  - \`differences\`: 文本C与文本B（文案原稿）的差异分析。请列出说话人改词、加词、漏词或与文案不一致的地方（**请务必使用中文回复此字段**）。
- 不要包含 markdown 代码块标记（如 \\\`\\\`\\\`json），直接输出 JSON 字符串。

---
**文本A (原始识别结果)：**
${transcribed}

**文本B (文案原稿)：**
${originalScript}`;
  }

  return `You are a professional audio transcript editor specializing in script and subtitle proofreading.
Your task is to correct raw ASR text (Text A) into an accurate, smooth, and theology-compliant subtitle text (Text C), while referencing the original script (Text B).

### Core Principle: Dual Standard
1. Scripture & Divine Words: Strictly match Text B.
2. Spoken Explanations: Faithfully match Text A spoken audio, fixing speech recognition mistakes and grammar.
Output in JSON with correctedText and differences (written in Chinese).

---
**Text A (ASR):**
${transcribed}

**Text B (Script):**
${originalScript}`;
}
