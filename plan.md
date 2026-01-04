     # DataTUI Implementation Plan
     
     ## Overview
     Build a terminal-based data analysis agent using **TypeScript** with OpenTUI for
      rendering, OpenRouter (MiniMax M2.1) for LLM, DuckDB for SQL, and
     Docker-sandboxed Python for analytics.
     
     ---
     
     ## Project Structure
     
     ```
     datatui/
     ├── src/
     │   ├── index.ts                  # Entry point
     │   ├── app.ts                    # Application bootstrap
     │   ├── config.ts                 # Environment config
     │   │
     │   ├── tui/
     │   │   ├── renderer.ts           # OpenTUI wrapper
     │   │   ├── layout.ts             # Split-pane layout
     │   │   ├── chat-pane.ts          # Left: conversation
     │   │   ├── artifact-pane.ts      # Right: tables/charts
     │   │   ├── status-bar.ts         # Bottom: indicators
     │   │   ├── input.ts              # Keyboard handling
     │   │   └── components/
     │   │       ├── table.ts          # Table with paging
     │   │       ├── chart.ts          # ASCII charts
     │   │       ├── scroll-view.ts    # Scrollable text
     │   │       └── text-input.ts     # Input field
     │   │
     │   ├── orchestrator/
     │   │   ├── orchestrator.ts       # Agent loop
     │   │   ├── state.ts              # Conversation state
     │   │   └── policy.ts             # Policy enforcement
     │   │
     │   ├── llm/
     │   │   ├── client.ts             # OpenRouter client
     │   │   ├── messages.ts           # History management
     │   │   ├── tools.ts              # Tool definitions
     │   │   └── prompts.ts            # System prompts
     │   │
     │   ├── tools/
     │   │   ├── registry.ts           # Tool dispatcher
     │   │   ├── validator.ts          # Zod schema validation
     │   │   ├── dataset.ts            # register/list/describe
     │   │   ├── sql.ts                # SQL tool
     │   │   ├── python.ts             # py_analyze tool
     │   │   ├── render.ts             # render_table/plot
     │   │   └── export.ts             # export_artifact
     │   │
     │   ├── engines/
     │   │   ├── duckdb.ts             # DuckDB execution
     │   │   └── python/
     │   │       ├── sandbox.ts        # Sandbox interface
     │   │       └── docker.ts         # Docker executor
     │   │
     │   ├── artifacts/
     │   │   ├── store.ts              # In-memory registry
     │   │   └── types.ts              # Artifact types
     │   │
     │   ├── datasets/
     │   │   ├── registry.ts           # Alias registry
     │   │   └── schema.ts             # Schema detection
     │   │
     │   └── security/
     │       └── paths.ts              # Path validation
     │
     ├── scripts/python/
     │   ├── runner.py                 # Python harness
     │   ├── requirements.txt          # pandas, matplotlib
     │   └── Dockerfile                # Sandbox image
     │
     ├── data/                         # Read-only data dir
     ├── outputs/                      # Write-only output dir
     │
     ├── package.json
     ├── tsconfig.json                 # Bun uses this for type checking
     ├── bunfig.toml                   # Bun configuration (optional)
     ├── .env.example
     └── README.md
     ```
     
     ---
     
     ## Technical Decisions
     
     | Component | Choice | Rationale |
     |-----------|--------|-----------|
     | Language | TypeScript | Native OpenTUI support, simpler async |
     | Runtime | **Bun** | Faster startup, native TS, built-in test runner |
     | TUI | OpenTUI (`@opentui/core`) | Native TS, well-maintained |
     | LLM Client | OpenAI SDK | Works with OpenRouter, streaming support |
     | SQL Engine | `duckdb` (npm) | Works with Bun's Node.js compatibility |
     | Validation | Zod | Type-safe schema validation |
     | Python Sandbox | Docker | `--network none`, isolated |
     | Config | Bun.env + zod | Native env support, type-safe parsing |
     
     ---
     
     ## Key Dependencies
     
     ```json
     {
       "dependencies": {
         "@opentui/core": "^0.x.x",
         "openai": "^4.x.x",
         "duckdb": "^1.x.x",
         "zod": "^3.x.x",
         "dockerode": "^4.x.x",
         "nanoid": "^5.x.x"
       },
       "devDependencies": {
         "@types/bun": "latest",
         "@types/dockerode": "^3.x.x"
       }
     }
     ```
     
     **Note:** Bun has native TypeScript support - no need for `typescript` or `tsx`.
      Uses `Bun.env` instead of `dotenv`.
     
     ---
     
     ## Implementation Phases
     
     ### Phase 1: Project Foundation
     - [ ] Initialize Bun project (`bun init`)
     - [ ] Set up OpenTUI renderer with basic event loop
     - [ ] Implement split-pane layout (chat left, artifacts right, status bottom)
     - [ ] Create text input component with cursor
     - [ ] Create scrollable text view for chat history
     
     **Files:** `src/index.ts`, `src/tui/renderer.ts`, `src/tui/layout.ts`
     
     ### Phase 2: TUI Components
     - [ ] Implement ChatPane with message rendering (user/assistant styling)
     - [ ] Implement ArtifactPane with content switching
     - [ ] Implement StatusBar with dataset/mode indicators
     - [ ] Add keyboard navigation (Tab to switch panes, arrows to scroll)
     - [ ] Handle terminal resize events
     
     **Files:** `src/tui/chat-pane.ts`, `src/tui/artifact-pane.ts`,
     `src/tui/status-bar.ts`
     
     ### Phase 3: LLM Integration
     - [ ] Create OpenRouter client using OpenAI SDK
     - [ ] Implement message history accumulation
     - [ ] Define tool schemas using Zod (convert to JSON Schema)
     - [ ] Build agent loop: user input → LLM → tool calls → response
     - [ ] Add streaming support for responsive output
     
     **Files:** `src/llm/client.ts`, `src/llm/tools.ts`,
     `src/orchestrator/orchestrator.ts`
     
     ### Phase 4: Security Layer
     - [ ] Implement path validation with symlink resolution
     - [ ] Create allowlist for `./data/` (read) and `./outputs/` (write)
     - [ ] Build tool input validator with Zod schemas
     - [ ] Add policy enforcement layer in orchestrator
     
     **Files:** `src/security/paths.ts`, `src/tools/validator.ts`,
     `src/orchestrator/policy.ts`
     
     ### Phase 5: Dataset Management
     - [ ] Create dataset registry with alias mapping
     - [ ] Implement schema detection (CSV, Parquet, JSON)
     - [ ] Build `register_dataset` tool
     - [ ] Build `list_datasets` tool
     - [ ] Build `describe_dataset` tool
     
     **Files:** `src/datasets/registry.ts`, `src/tools/dataset.ts`
     
     ### Phase 6: DuckDB SQL Engine
     - [ ] Initialize DuckDB connection
     - [ ] Create query executor with row limits
     - [ ] Register datasets as DuckDB tables
     - [ ] Build `sql` tool with result capture
     - [ ] Store results in artifact store
     
     **Files:** `src/engines/duckdb.ts`, `src/tools/sql.ts`, `src/artifacts/store.ts`
     
     ### Phase 7: Table Rendering
     - [ ] Build table renderer with column alignment
     - [ ] Add paging support (page/pageSize params)
     - [ ] Implement `render_table` tool
     - [ ] Add keyboard shortcuts for page navigation
     - [ ] Show truncation warnings
     
     **Files:** `src/tui/components/table.ts`, `src/tools/render.ts`
     
     ### Phase 8: Export & Polish
     - [ ] Implement `export_artifact` tool (CSV export)
     - [ ] Add help overlay (keybindings)
     - [ ] Error display and recovery UX
     - [ ] Configuration documentation
     - [ ] Integration testing
     
     **Files:** `src/tools/export.ts`
     
     ### Phase 9: Python Sandbox (Post-MVP)
     - [ ] Create Dockerfile with pandas/matplotlib
     - [ ] Build Python execution harness (runner.py)
     - [ ] Implement Docker executor using dockerode
     - [ ] Build `py_analyze` tool
     - [ ] Capture stdout and plot artifacts
     
     **Files:** `src/engines/python/docker.ts`, `src/tools/python.ts`,
     `scripts/python/`
     
     ### Phase 10: Charts (Post-MVP)
     - [ ] ASCII histogram using Unicode blocks
     - [ ] ASCII bar chart
     - [ ] Sparklines
     - [ ] Truecolor plots via DrawSuperSampleBuffer
     
     **Files:** `src/tui/components/chart.ts`
     
     ---
     
     ## Key Interfaces
     
     ### Tool Interface
     ```typescript
     interface Tool {
       name: string;
       description: string;
       parameters: z.ZodSchema;
       execute(input: unknown): Promise<ToolResult>;
     }
     
     interface ToolResult {
       success: boolean;
       data?: unknown;
       artifactId?: string;
       error?: string;
     }
     ```
     
     ### Engine Interface
     ```typescript
     interface QueryEngine {
       execute(query: string, opts: QueryOptions): Promise<QueryResult>;
       close(): Promise<void>;
     }
     
     interface QueryResult {
       columns: Column[];
       rows: unknown[][];
       rowCount: number;
       truncated: boolean;
     }
     ```
     
     ### Artifact Store Interface
     ```typescript
     interface ArtifactStore {
       store(artifact: Artifact): string;
       get(id: string): Artifact | undefined;
       getPage(id: string, page: number, pageSize: number): TablePage;
     }
     
     type Artifact = TableArtifact | PlotArtifact | TextArtifact;
     ```
     
     ---
     
     ## OpenRouter Integration
     
     ```typescript
     import OpenAI from 'openai';
     
     const client = new OpenAI({
       baseURL: 'https://openrouter.ai/api/v1',
       apiKey: process.env.OPENROUTER_API_KEY,
       defaultHeaders: {
         'HTTP-Referer': 'https://datatui.local',
       },
     });
     
     const response = await client.chat.completions.create({
       model: 'minimax/minimax-m2.1',
       messages: history,
       tools: toolDefinitions,
       stream: true,
     });
     ```
     
     ---
     
     ## TUI Layout (OpenTUI)
     
     ```
     +---------------------------+---------------------------+
     |                           |                           |
     |      Chat Pane            |    Artifact Pane          |
     |      (50% width)          |    (50% width)            |
     |      - User messages      |    - Schema view          |
     |      - Agent responses    |    - Table results        |
     |      - Tool indicators    |    - Charts               |
     |                           |                           |
     +---------------------------+---------------------------+
     |  Datasets: 2 | SANDBOX: NO NETWORK | Rows: 1000      |
     +-------------------------------------------------------+
     ```
     
     **OpenTUI TypeScript API:**
     ```typescript
     import { Renderer, Buffer, RGBA } from '@opentui/core';
     
     const renderer = new Renderer(width, height);
     const buffer = renderer.getNextBuffer();
     
     // Drawing primitives
     buffer.clear(new RGBA(0.05, 0.05, 0.1, 1));
     buffer.drawBox(x, y, width, height, { title: 'Chat', fill: true }, borderColor,
     bgColor);
     buffer.drawText('Hello', x, y, fgColor, bgColor, attributes);
     buffer.fillRect(x, y, width, height, bgColor);
     
     // High-res graphics
     buffer.drawSuperSampleBuffer(x, y, pixelData, 'rgba', bytesPerRow);
     
     renderer.render();
     ```
     
     ---
     
     ## Configuration
     
     ```bash
     # .env
     OPENROUTER_API_KEY=sk-...
     DATATUI_MODEL=minimax/minimax-m2.1
     DATATUI_DATA_DIR=./data
     DATATUI_OUTPUT_DIR=./outputs
     DATATUI_MAX_RESULT_ROWS=1000
     DATATUI_PREVIEW_ROWS=200
     DATATUI_PY_TIMEOUT=10000
     DATATUI_TEMPERATURE=0.2
     DATATUI_MAX_ITERATIONS=5
     ```
     
     ```typescript
     // src/config.ts
     import { z } from 'zod';
     
     const configSchema = z.object({
       openrouterApiKey: z.string(),
       model: z.string().default('minimax/minimax-m2.1'),
       dataDir: z.string().default('./data'),
       outputDir: z.string().default('./outputs'),
       maxResultRows: z.coerce.number().default(1000),
       previewRows: z.coerce.number().default(200),
       pyTimeout: z.coerce.number().default(10000),
       temperature: z.coerce.number().default(0.2),
       maxIterations: z.coerce.number().default(5),
     });
     
     // Bun loads .env automatically
     export const config = configSchema.parse({
       openrouterApiKey: Bun.env.OPENROUTER_API_KEY,
       model: Bun.env.DATATUI_MODEL,
       dataDir: Bun.env.DATATUI_DATA_DIR,
       outputDir: Bun.env.DATATUI_OUTPUT_DIR,
       maxResultRows: Bun.env.DATATUI_MAX_RESULT_ROWS,
       previewRows: Bun.env.DATATUI_PREVIEW_ROWS,
       pyTimeout: Bun.env.DATATUI_PY_TIMEOUT,
       temperature: Bun.env.DATATUI_TEMPERATURE,
       maxIterations: Bun.env.DATATUI_MAX_ITERATIONS,
     });
     ```
     
     ---
     
     ## Critical Files to Create
     
     1. `src/index.ts` - Entry point, initializes app
     2. `src/tui/layout.ts` - Split-pane layout manager
     3. `src/orchestrator/orchestrator.ts` - Agent loop coordinator
     4. `src/llm/client.ts` - OpenRouter API client
     5. `src/tools/registry.ts` - Tool validation and dispatch
     6. `src/engines/duckdb.ts` - SQL execution
     7. `src/security/paths.ts` - Path allowlisting
     
     ---
     
     ## MVP Deliverable
     
     A polished TUI application that:
     1. Displays split-pane interface (chat + artifacts + status)
     2. Accepts natural language queries about data
     3. Loads CSV/Parquet/JSON datasets from `./data/`
     4. Executes SQL via DuckDB based on LLM tool calls
     5. Renders paginated tables in artifact pane
     6. Exports results to `./outputs/` on request
     7. Enforces strict security boundaries
     
     ---
     
     ## Running the App
     
     ```bash
     # Install dependencies
     bun install
     
     # Development (with hot reload)
     bun --watch src/index.ts
     
     # Run tests
     bun test
     
     # Production
     bun run src/index.ts
     ```
     
     **package.json scripts:**
     ```json
     {
       "scripts": {
         "dev": "bun --watch src/index.ts",
         "start": "bun run src/index.ts",
         "test": "bun test"
       }
     }
     ```
     
     
     "/plan open" to edit this plan in Vim
     

  Todos
  ☒ Initialize Bun project with package.json and tsconfig.json
  ☒ Set up OpenTUI renderer with basic event loop
  ☒ Implement split-pane layout (chat left, artifacts right, status bottom)
  ☒ Create text input component with cursor
  ☒ Create scrollable text view for chat history
  ☒ Create OpenRouter LLM client with tool calling
  ☒ Define tool schemas (register_dataset, sql, etc.)
  ☒ Implement DuckDB SQL engine
  ☒ Create artifact store for tables/results
  ☒ Build table rendering component with paging
  ☒ Create orchestrator to wire LLM, tools, and TUI together
  ☒ Add streaming message support
  ☒ Add tool execution indicators
  ☒ Implement page navigation for tables