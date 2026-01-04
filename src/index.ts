import { initRenderer } from './tui/renderer';
import {
  createLayout,
  addChatMessage,
  addMarkdownChatMessage,
  createStreamingMessage,
  appendToStreamingMessage,
  addToolIndicator,
  updateToolIndicator,
  addErrorMessage,
  updateStatusBar,
  updateArtifactTitle,
  type StreamingMessage,
} from './tui/layout';
import { createTableDisplay, createEmptyArtifactDisplay } from './tui/components/table';
import { createChartDisplay } from './tui/components/chart';
import { InputRenderableEvents, type KeyEvent } from '@opentui/core';
import { Orchestrator } from './orchestrator/orchestrator';
import { getConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

const PAGE_SIZE = 20;

async function ensureDirectories(dataDir: string, outputDir: string): Promise<void> {
  for (const dir of [dataDir, outputDir]) {
    const resolvedDir = path.resolve(dir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
  }
}

async function main() {
  // Load config
  let config;
  try {
    config = getConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    console.error('\nPlease ensure OPENROUTER_API_KEY is set in your environment or .env file');
    process.exit(1);
  }

  // Ensure directories exist
  await ensureDirectories(config.dataDir, config.outputDir);

  // Initialize orchestrator
  const orchestrator = new Orchestrator({
    apiKey: config.openrouterApiKey,
    model: config.model,
    temperature: config.temperature,
    dataDir: config.dataDir,
    outputDir: config.outputDir,
    maxResultRows: config.maxResultRows,
    maxIterations: config.maxIterations,
  });

  // Initialize renderer
  const renderer = await initRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    useAlternateScreen: true,
  });

  // Create the layout
  const layout = createLayout(renderer);

  // State
  let currentArtifactId: string | null = null;
  let currentPage = 1;
  let isProcessing = false;
  let verboseTools = false;

  // Helper to display current artifact
  function displayCurrentArtifact(): void {
    if (!currentArtifactId) {
      createEmptyArtifactDisplay(renderer, layout.artifactPane);
      updateArtifactTitle(layout.artifactContainer, 'Artifacts');
      return;
    }

    const artifactStore = orchestrator.getArtifactStore();
    const artifact = artifactStore.get(currentArtifactId);

    if (!artifact) {
      createEmptyArtifactDisplay(renderer, layout.artifactPane, `Artifact ${currentArtifactId} not found`);
      return;
    }

    if (artifact.type === 'table') {
      const page = artifactStore.getTablePage(currentArtifactId, currentPage, PAGE_SIZE);
      if (page) {
        createTableDisplay(renderer, layout.artifactPane, {
          columns: page.columns,
          rows: page.rows,
          page: page.page,
          totalPages: page.totalPages,
          totalRows: page.totalRows,
          truncated: false,
          maxWidth: Math.floor(renderer.width / 2) - 4,
        });
        updateArtifactTitle(layout.artifactContainer, `Table: ${currentArtifactId}`);
        updateStatusBar(layout.statusText, {
          datasetCount: orchestrator.getDatasetCount(),
          artifactId: currentArtifactId,
          pageInfo: `${page.page}/${page.totalPages}`,
          processing: isProcessing,
        });
      }
    } else if (artifact.type === 'chart') {
      createChartDisplay(renderer, layout.artifactPane, artifact.lines, artifact.chartType);
      const chartTypeLabel = artifact.chartType.charAt(0).toUpperCase() + artifact.chartType.slice(1);
      updateArtifactTitle(layout.artifactContainer, `${chartTypeLabel} Chart: ${currentArtifactId}`);
      updateStatusBar(layout.statusText, {
        datasetCount: orchestrator.getDatasetCount(),
        artifactId: currentArtifactId,
        processing: isProcessing,
      });
    }
  }

  // Helper to update status
  function refreshStatus(): void {
    updateStatusBar(layout.statusText, {
      datasetCount: orchestrator.getDatasetCount(),
      artifactId: currentArtifactId || undefined,
      pageInfo: currentArtifactId ? `${currentPage}/?` : undefined,
      processing: isProcessing,
    });
  }

  // Add welcome message with markdown formatting
  addMarkdownChatMessage(
    layout.chatPane,
    renderer,
    'assistant',
    `# Welcome to DataTUI!

I can help you analyze data in your terminal.

## Getting Started

- **Load a dataset**: "Load sales.csv as sales"
- **Query data**: "Show the top 5 customers by revenue"
- **Create charts**: "Show a bar chart of sales by region"
- **Export results**: "Export to results.csv"

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Send message |
| PageUp/Down | Navigate table pages |
| Ctrl+V | Toggle verbose mode |
| Ctrl+C | Exit |
`
  );

  // Handle input submission
  layout.chatInput.on(InputRenderableEvents.ENTER, async () => {
    if (isProcessing) return;

    const message = layout.chatInput.value.trim();
    if (!message) return;

    // Add user message
    addChatMessage(layout.chatPane, renderer, 'user', message);

    // Clear input
    layout.chatInput.value = '';

    // Start processing
    isProcessing = true;
    refreshStatus();

    // Create streaming message for assistant response
    let streamingMsg: StreamingMessage | null = null;
    const toolIndicators: Map<string, BoxRenderable> = new Map();
    const artifactsCreated: string[] = [];

    // Import BoxRenderable type for the map
    type BoxRenderable = ReturnType<typeof addToolIndicator>;

    try {
      for await (const event of orchestrator.processMessage(message)) {
        switch (event.type) {
          case 'content':
            // Initialize streaming message on first content
            if (!streamingMsg) {
              streamingMsg = createStreamingMessage(layout.chatPane, renderer);
            }
            appendToStreamingMessage(streamingMsg, event.data);
            break;

          case 'tool_start':
            // Add tool indicator
            const indicator = addToolIndicator(
              layout.chatPane,
              renderer,
              event.toolName,
              'running',
              verboseTools,
              event.args
            );
            toolIndicators.set(event.toolName, indicator);
            break;

          case 'tool_result':
            // Update tool indicator
            const existingIndicator = toolIndicators.get(event.toolName);
            if (existingIndicator) {
              updateToolIndicator(
                existingIndicator,
                renderer,
                event.toolName,
                event.result.success ? 'success' : 'error'
              );
            }

            // Track artifacts
            if (event.result.artifactId) {
              artifactsCreated.push(event.result.artifactId);
            }

            // Show error if tool failed
            if (!event.result.success && event.result.error) {
              addErrorMessage(layout.chatPane, renderer, event.result.error);
            }
            break;

          case 'error':
            addErrorMessage(layout.chatPane, renderer, event.message);
            break;

          case 'done':
            // Display latest table artifact if any
            if (artifactsCreated.length > 0) {
              currentArtifactId = artifactsCreated[artifactsCreated.length - 1];
              currentPage = 1;
              displayCurrentArtifact();
            }
            break;
        }
      }

      // If no content was streamed but we have artifacts, add a summary
      if (!streamingMsg && artifactsCreated.length > 0) {
        addChatMessage(
          layout.chatPane,
          renderer,
          'assistant',
          `Query completed. Results stored in artifact ${artifactsCreated[artifactsCreated.length - 1]}.`
        );
      }
    } catch (err) {
      addErrorMessage(
        layout.chatPane,
        renderer,
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Done processing
    isProcessing = false;
    refreshStatus();
  });

  // Handle keyboard events
  renderer.keyInput.on('keypress', (event: KeyEvent) => {
    // Ctrl+C for clean exit
    if (event.name === 'c' && event.ctrl) {
      orchestrator.close().then(() => {
        renderer.destroy();
        process.exit(0);
      });
      return;
    }

    // Ctrl+V to toggle verbose mode
    if (event.name === 'v' && event.ctrl) {
      verboseTools = !verboseTools;
      orchestrator.setVerboseTools(verboseTools);
      addChatMessage(
        layout.chatPane,
        renderer,
        'assistant',
        `Verbose tool output: ${verboseTools ? 'ON' : 'OFF'}`
      );
      return;
    }

    // Page navigation for artifacts
    if (!isProcessing && currentArtifactId) {
      const artifactStore = orchestrator.getArtifactStore();
      const artifact = artifactStore.getTable(currentArtifactId);
      if (artifact) {
        const totalPages = Math.ceil(artifact.rows.length / PAGE_SIZE);

        if (event.name === 'pagedown' || (event.name === 'j' && event.ctrl)) {
          if (currentPage < totalPages) {
            currentPage++;
            displayCurrentArtifact();
          }
        } else if (event.name === 'pageup' || (event.name === 'k' && event.ctrl)) {
          if (currentPage > 1) {
            currentPage--;
            displayCurrentArtifact();
          }
        }
      }
    }
  });

  // Start rendering
  renderer.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
