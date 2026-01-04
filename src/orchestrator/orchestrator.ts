import { LLMClient, type ToolCall } from '../llm/client';
import { TOOL_DEFINITIONS } from '../llm/tools';
import { SYSTEM_PROMPT } from '../llm/prompts';
import { DuckDBEngine } from '../engines/duckdb';
import { ArtifactStore } from '../artifacts/store';
import { executeTool, type ToolResult, type ToolContext } from '../tools/registry';

export interface OrchestratorConfig {
  apiKey: string;
  model: string;
  temperature: number;
  dataDir: string;
  outputDir: string;
  maxResultRows: number;
  maxIterations: number;
}

export type StreamEvent =
  | { type: 'content'; data: string }
  | { type: 'tool_start'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: ToolResult }
  | { type: 'error'; message: string }
  | { type: 'done'; artifactIds: string[] };

export class Orchestrator {
  private llmClient: LLMClient;
  private engine: DuckDBEngine;
  private artifactStore: ArtifactStore;
  private toolContext: ToolContext;
  private maxIterations: number;
  private _verboseTools: boolean = false;

  constructor(config: OrchestratorConfig) {
    this.maxIterations = config.maxIterations;

    // Initialize DuckDB engine
    this.engine = new DuckDBEngine(config.maxResultRows);

    // Initialize artifact store
    this.artifactStore = new ArtifactStore();

    // Initialize LLM client
    this.llmClient = new LLMClient({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
    });
    this.llmClient.setSystemPrompt(SYSTEM_PROMPT);
    this.llmClient.setTools(TOOL_DEFINITIONS);

    // Create tool context
    this.toolContext = {
      engine: this.engine,
      artifactStore: this.artifactStore,
      dataDir: config.dataDir,
      outputDir: config.outputDir,
    };
  }

  get verboseTools(): boolean {
    return this._verboseTools;
  }

  setVerboseTools(verbose: boolean): void {
    this._verboseTools = verbose;
  }

  getDatasetCount(): number {
    return this.engine.listDatasets().length;
  }

  getArtifactStore(): ArtifactStore {
    return this.artifactStore;
  }

  getEngine(): DuckDBEngine {
    return this.engine;
  }

  async *processMessage(userMessage: string): AsyncGenerator<StreamEvent> {
    // Add user message to history
    this.llmClient.addUserMessage(userMessage);

    const artifactIds: string[] = [];
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      try {
        // Stream the LLM response
        let hasToolCalls = false;
        const toolCalls: ToolCall[] = [];

        for await (const chunk of this.llmClient.chatStream()) {
          if (chunk.type === 'content') {
            yield { type: 'content', data: chunk.data as string };
          } else if (chunk.type === 'tool_call') {
            hasToolCalls = true;
            toolCalls.push(chunk.data as ToolCall);
          }
        }

        // If no tool calls, we're done
        if (!hasToolCalls) {
          break;
        }

        // Execute tool calls
        for (const toolCall of toolCalls) {
          yield {
            type: 'tool_start',
            toolName: toolCall.name,
            args: toolCall.arguments,
          };

          // Execute the tool
          const result = await executeTool(toolCall.name, toolCall.arguments, this.toolContext);

          // Track artifact IDs
          if (result.artifactId) {
            artifactIds.push(result.artifactId);
          }

          yield {
            type: 'tool_result',
            toolName: toolCall.name,
            result,
          };

          // Add tool result to LLM history
          this.llmClient.addToolResult(toolCall.id, JSON.stringify(result));
        }

        // Continue loop to let LLM process tool results
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        yield { type: 'error', message: errorMessage };
        break;
      }
    }

    // Signal completion
    yield { type: 'done', artifactIds };
  }

  // Non-streaming version for simpler use cases
  async processMessageSync(userMessage: string): Promise<{
    response: string;
    artifactIds: string[];
    error?: string;
  }> {
    let response = '';
    const artifactIds: string[] = [];
    let error: string | undefined;

    for await (const event of this.processMessage(userMessage)) {
      switch (event.type) {
        case 'content':
          response += event.data;
          break;
        case 'done':
          artifactIds.push(...event.artifactIds);
          break;
        case 'error':
          error = event.message;
          break;
      }
    }

    return { response, artifactIds, error };
  }

  async close(): Promise<void> {
    await this.engine.close();
  }
}
