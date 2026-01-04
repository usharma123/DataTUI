# Data Analysis Terminal Agent — Product & Technical Spec (MVP)

## 1. Summary
Build an “OpenCode-style” terminal agent that **strictly performs data analysis** on local datasets. The agent runs in a TUI, supports structured tool calls (SQL + Python analytics), renders tables/plots in-terminal, and exports analysis artifacts **only** to a controlled output directory.

## 2. Goals
- Provide an interactive terminal experience for:
  - Loading datasets (CSV/Parquet/JSON)
  - Querying (SQL) and statistical analysis (Python)
  - Visualizing results (ASCII + optional truecolor plot rendering)
  - Exporting reports/tables on explicit user request
- Enforce a **hard boundary**: *data analysis only*.
- Deterministic, auditable execution: all operations occur via validated tools.

## 3. Non-Goals
- No web browsing / external APIs / online dataset fetching
- No general coding agent behavior (no scaffolding apps, refactors, etc.)
- No arbitrary shell execution
- No arbitrary file writes outside an allowlisted folder
- No long-running training jobs or heavy ML pipelines (MVP)

## 4. User Experience Requirements
### 4.1 TUI Layout
- **Left pane**: conversation log (user + agent)
- **Right pane**: artifacts viewer
  - Dataset schema
  - Result tables (with paging)
  - Plot preview (optional truecolor)
- **Bottom bar**: status + mode indicators
  - Current dataset(s)
  - Row limits / execution time
  - Sandbox mode (“NO NETWORK”, “OUTPUTS ONLY”)

### 4.2 Interaction Flow
1. User asks a question (e.g., “Find top 10 customers by revenue”)
2. If no dataset loaded, agent asks user to load or choose a dataset alias
3. Agent executes:
   - SQL for filtering/aggregation/joins
   - Python for stats/plots
4. Agent returns:
   - A concise narrative answer
   - One or more artifacts (table/plot)
5. User can request export (e.g., “export this as results.csv”)

## 5. Policy: “Strictly Data Analysis”
### 5.1 Allowed Operations
- Read datasets from allowlisted paths (e.g., `./data/`)
- Compute: descriptive stats, aggregations, joins, correlations, regression (basic)
- Render: tables, charts, summaries
- Export artifacts to `./outputs/` **only**, when user requests

### 5.2 Disallowed Operations
- Network access of any kind
- Reading arbitrary filesystem paths (outside allowlist)
- Writing to arbitrary filesystem paths (outside `./outputs/`)
- Executing shell commands not owned by the tool runtime
- Modifying codebases / generating multi-file projects

### 5.3 Enforcement Mechanisms
- The model only receives a small **toolset**; no “escape hatches”
- All tool calls validated by:
  - JSON schema / typed validators
  - Path allowlisting
  - Query safety checks (optional)
- Python runs in a sandbox (subprocess or Docker `--network none`)
- Export tool enforces output path prefix `./outputs/`

## 6. System Architecture
### 6.1 Components
- **TUI (OpenTUI)**: rendering + input, artifacts panes
- **Orchestrator**: agent loop, state management, policy enforcement
- **Tools Layer**: schema validation + dispatcher
- **Execution Engines**
  - DuckDB engine (SQL)
  - Python engine (stats/plots) — sandboxed
- **Artifact Store**: in-memory registry of tables/plots + metadata
- **Exporter**: writes artifacts to `./outputs/`

### 6.2 Data Flow
User Input → Orchestrator → LLM (with tool schema) → Tool Calls → Validator/Policy →
Execute (DuckDB/Python) → Artifact Store → TUI Renderer → Final Narrative Answer

## 7. Data Handling
### 7.1 Supported Formats (MVP)
- CSV (with delimiter detection basic)
- Parquet
- JSON (newline-delimited preferred)

### 7.2 Dataset Registry
Datasets are registered as aliases with metadata:
- `alias`
- `path`
- `format`
- `schema` (column names/types)
- `row_count` (estimated ok)

### 7.3 Sampling / Row Limits
- Default preview limit: 200 rows
- Default query result limit: 1,000 rows (configurable)
- Provide warnings when truncation occurs

## 8. Tools API (Contract)
All analysis must go through these tools. The orchestrator rejects any nonconforming calls.

### 8.1 Tool List
1. `register_dataset(path, alias)`
2. `list_datasets()`
3. `describe_dataset(alias)`
4. `sql(query, aliases)`
5. `py_analyze(code, inputs)`
6. `render_table(artifact_id, page, page_size)`
7. `render_plot(artifact_id)` (optional)
8. `export_artifact(artifact_id, output_path)`

### 8.2 Tool Schemas (Simplified)
> Implementation can use Zod/Valibot/JSON Schema. Below is a readable contract.

#### register_dataset
- Inputs:
  - `path`: string (must be within `./data/`)
  - `alias`: string `[a-zA-Z0-9_-]{1,32}`
- Output:
  - dataset metadata (schema, row estimate)

#### sql
- Inputs:
  - `query`: string
  - `aliases`: string[] (must refer to registered datasets)
- Behavior:
  - Runs in DuckDB
  - Enforces `LIMIT` if absent (optional auto-limit)
- Output:
  - `artifact_id` (table)
  - `columns`, `row_count`, `truncated` boolean

#### py_analyze
- Inputs:
  - `code`: string (restricted Python snippet)
  - `inputs`: artifact/dataset references
- Behavior:
  - Executes in sandbox
  - Returns:
    - text summary
    - optional table artifact
    - optional plot artifact
- Output:
  - `stdout` (captured)
  - `artifacts[]`

#### export_artifact
- Inputs:
  - `artifact_id`: string
  - `output_path`: string (must be under `./outputs/`)
- Output:
  - absolute/relative saved path

## 9. LLM Prompting
### 9.1 System Prompt Requirements
- Must state:
  - “You are a terminal data analysis agent”
  - Only use tools
  - No web, no shell, no codebase modifications
  - Ask for dataset if none is present
- Must instruct:
  - Prefer SQL for data shaping
  - Prefer Python for stats/plots
  - Always state assumptions and note truncation

### 9.2 Response Format (Agent)
- When tools needed:
  - Provide tool calls only (structured)
- When answering:
  - 3 sections:
    1. **Answer** (concise)
    2. **Evidence** (key figures from results)
    3. **Next steps** (suggest 1–3 analyses)

## 10. Rendering & Visualization
### 10.1 Tables
- Render tables with:
  - Column alignment
  - Paging controls
  - Truncation indicator
- Provide “copy as CSV” in UI (optional)

### 10.2 Charts (MVP Options)
- **Phase 1 (ASCII)**: histograms, sparklines, bar charts
- **Phase 2 (Truecolor)**:
  - Python generates plot image (PNG in-memory)
  - Convert to RGBA buffer
  - Render via OpenTUI supersampled buffer in the artifacts pane

## 11. Security & Sandboxing
### 11.1 No Network
- Ensure the runtime cannot make outbound calls
  - Docker: `--network none`
  - Subprocess: OS-level firewall rules optional; do not rely solely on prompts

### 11.2 Filesystem Boundaries
- Read allowed: `./data/**`
- Write allowed: `./outputs/**`
- Deny:
  - `..` traversal
  - absolute paths not allowlisted
  - symlink escapes (resolve realpath)

### 11.3 Python Restrictions (MVP)
- Prefer Docker isolation:
  - mount `./data` read-only
  - mount `./outputs` read-write
  - run as non-root
- Capture stdout/stderr and time out runs (e.g., 10s default)

## 12. Reliability & Observability
### 12.1 Error Handling
- Validation errors:
  - Show “Tool call rejected” with reason
  - Ask model to retry within constraints
- Runtime errors:
  - Show stack trace summary (sanitized)
  - Offer fallback (e.g., “Try a smaller sample”)

### 12.2 Logging
- Log events locally:
  - user messages
  - tool calls + params (redact paths if needed)
  - execution time + row counts
  - export actions

### 12.3 Determinism Options
- Config for:
  - model temperature
  - max tool iterations per request (e.g., 5)
  - max rows returned

## 13. Testing Plan
### 13.1 Unit Tests
- Path allowlisting + symlink escape prevention
- Tool schema validation rejects malformed calls
- Auto-limit insertion for SQL (if implemented)
- Artifact store correctness (paging, truncation)

### 13.2 Integration Tests
- Load sample datasets (CSV/Parquet)
- Run standard queries (groupby, joins)
- Python stats + plot generation path (if enabled)
- Export artifacts to outputs

### 13.3 Security Tests
- Attempt to read `/etc/passwd` (must fail)
- Attempt to write outside `./outputs` (must fail)
- Attempt network call in Python (must fail)

## 14. Configuration
- `DATA_DIR=./data`
- `OUTPUT_DIR=./outputs`
- `MAX_RESULT_ROWS=1000`
- `PREVIEW_ROWS=200`
- `PY_TIMEOUT_SECONDS=10`
- `SANDBOX_MODE=docker|subprocess`
- `MODEL_NAME=...`
- `TEMPERATURE=0.2`

## 15. Milestones
### MVP (Week 0)
- TUI + chat
- register/list datasets
- DuckDB SQL tool
- table rendering + paging
- strict export to outputs
- policy enforcement + validation

### V1
- Python tool (sandboxed)
- Basic statistics helpers (correlation, missingness, outliers)
- ASCII charts

### V2
- Truecolor plot rendering via image buffer
- Dataset joins across aliases + caching
- “Analysis sessions” (save/load state)

## 16. Open Questions
- Preferred language/runtime: Go-only vs Go + Python sidecar?
- Do we support multiple datasets in one query by default?
- Should SQL allow UDFs? (Recommended: no for MVP)
- Should we add a “data dictionary” tool for column descriptions?

---
**Appendix A: Example User Stories**
1. “Load `sales.csv` and show revenue trend by month.”
2. “Find top 10 products by profit margin, excluding returns.”
3. “Check if churn differs by region; show significance test.”
4. “Export the final table and a markdown report to outputs.”

**Appendix B: Example Tool-Driven Turn**
- User: “Top 10 customers by revenue”
- Agent:
  1) `sql("SELECT customer_id, SUM(revenue) ... ORDER BY ... LIMIT 10", ["sales"])`
  2) Render table artifact
  3) Answer with key figures + export option
