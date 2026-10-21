# Extraction of Correction Prompt to Standalone Markdown Configuration

Decouple the large French theological subtitle correction prompt from `server.ts` into a standalone, human-readable Markdown template file (`config/promptTemplate.md`), loaded once at server startup with in-memory caching and dynamic option placeholder substitution.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed via interactive clarification:

- **Confirmed Decision 1 (File Format)**: Markdown template file (`config/promptTemplate.md`). This enables prompt editors and theological consultants to inspect and edit guidelines using clean Markdown syntax without touching TypeScript source code.
- **Confirmed Decision 2 (Loading Strategy)**: Loaded once into memory at server startup (`fs.readFileSync`) and cached for zero-latency execution on incoming requests.
- **Variable Interpolation Strategy**: The static rules and guidelines are maintained in the markdown file, while dynamic runtime values (`{{transcribedText}}`, `{{referenceText}}`, `{{lineBreakRule}}`) are safely substituted at request time.

---

## 1. Overview & Core Concept

- **What It Does**: Moves the ~70 lines of French theological guidelines, strict/faithful mode rules, and output instructions from TypeScript inline template strings into a dedicated configuration file `config/promptTemplate.md`.
- **Target Audience**: Content managers, theology editors, and developers who need to adjust prompt rules, bible formatting guidelines, or subtitle line break instructions without modifying server code or recompiling TypeScript.
- **Key Value**: Clean separation of prompt engineering from backend routing logic, reducing clutter in `server.ts` and minimizing risk of regression during prompt iterations.

---

## 2. Configuration & Prompt Architecture

### Directory & File Placement
- **Prompt Template**: `config/promptTemplate.md`
  - Contains complete system instructions, "Double Standard" (Strict Mode vs. Faithful Mode) rules, Divine capitalization rules, French punctuation standards, and output JSON schemas.
  - Contains standardized template interpolation tags:
    - `{{lineBreakRule}}`: Injected dynamically based on user toggle (`enableLineBreaks`, `maxLineLength`, `minLineLength`, `enableVisualOptimization`, `visualOptStart`, `visualOptEnd`).
    - `{{transcribedText}}`: User's Speech-to-Text transcript (Text A).
    - `{{referenceText}}`: User's original script (Text B).

### Startup & Caching Flow
```
 ┌─────────────────────────┐
 │ config/promptTemplate.md│
 └───────────┬─────────────┘
             │ Startup read (fs.readFileSync)
             ▼
 ┌─────────────────────────┐
 │ In-Memory Cached String │
 └───────────┬─────────────┘
             │ Per-request interpolation
             ▼
 ┌──────────────────────────────────────────────────────────┐
 │ buildCorrectionPrompt(textA, textB, options)             │
 │ - Generates {{lineBreakRule}} from options               │
 │ - Replaces {{transcribedText}} and {{referenceText}}     │
 └───────────┬──────────────────────────────────────────────┘
             │ Send to GoogleGenAI
             ▼
 ┌─────────────────────────┐
 │ Gemini 3.6 Flash API    │
 └─────────────────────────┘
```

---

## 3. Key Decisions & Trade-Offs

- **Decision 1: Template Placeholder Substitution vs. Multi-File Fragments**
  - *Chosen Approach*: Single cohesive Markdown file with targeted placeholders (`{{lineBreakRule}}`, `{{transcribedText}}`, `{{referenceText}}`).
  - *Why*: Keeps the entire system prompt readable as a single coherent document from top to bottom, making it easy to copy-paste into AI Studio or prompt testing tools.
  - *Alternatives Considered*: Splitting rules into multiple sub-files; rejected due to unnecessary filesystem fragmentation.

- **Decision 2: Startup Loading with Fallback**
  - *Chosen Approach*: Read `config/promptTemplate.md` at module initialization and cache in memory; include a reliable built-in fallback string in case the file is missing or unreadable.
  - *Why*: Prevents I/O overhead on every HTTP request and ensures application robustness in containerized environments.

---

## 4. Technical Architecture & Component Mapping

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Server Architecture                              │
├────────────────────────────────┬─────────────────────────────────────────┤
│ Configuration Layer            │ config/promptTemplate.md                │
│                                │ - French theological guidelines         │
│                                │ - Strict / Faithful mode rules          │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Server Engine (server.ts)      │ - loadPromptTemplate() cache            │
│                                │ - buildCorrectionPrompt() substitution  │
│                                │ - POST /api/correct endpoint handler    │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Verification                   │ - npm run lint (TypeScript check)       │
│                                │ - npm run build (Compile verification)  │
│                                │ - Local endpoint curl test              │
└────────────────────────────────┴─────────────────────────────────────────┘
```

### Planned Implementation Steps:
1. **Create Configuration File**: Create `config/promptTemplate.md` containing the exact, pristine French theological prompt template with `{{lineBreakRule}}`, `{{transcribedText}}`, and `{{referenceText}}` tags.
2. **Refactor `server.ts`**:
   - Add prompt loader function `loadPromptTemplate()` that reads `config/promptTemplate.md` on startup and stores it in memory.
   - Refactor `buildCorrectionPrompt()` to generate the dynamic `lineBreakRule` block and interpolate placeholders into the cached template.
   - Ensure graceful fallback if the file cannot be accessed.
3. **Compile & Verify**:
   - Run `lint_applet` (`tsc --noEmit`) to confirm zero type errors.
   - Run `compile_applet` to confirm successful build.
   - Restart server and verify `/api/correct` response via automated curl testing.
