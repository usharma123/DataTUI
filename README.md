# DataTUI

Terminal data analysis agent with LLM-powered natural language interface.

## Features

- **Interactive TUI** - Chat-based interface for data exploration
- **SQL & Python analysis** - Query with DuckDB, analyze with Python
- **Sandboxed execution** - No network access, strict file boundaries
- **Visualizations** - Tables with paging, ASCII charts
- **Export control** - Write artifacts only to `./outputs/`

## Quick Start

```bash
bun install
bun run dev
```

## Usage

1. Load a dataset (CSV, Parquet, JSON) from `./data/`
2. Ask questions in natural language
3. View results as tables or plots
4. Export artifacts on request

## Configuration

See `.env.example` for model and runtime settings.

## Architecture

- **TUI** - OpenTUI for rendering
- **Orchestrator** - Agent loop with policy enforcement
- **Tools** - SQL, Python, export, render
- **Engines** - DuckDB (SQL), sandboxed Python subprocess
