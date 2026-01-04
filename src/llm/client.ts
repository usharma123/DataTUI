import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export interface LLMConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private messages: ChatCompletionMessageParam[] = [];
  private tools: ChatCompletionTool[] = [];

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://datatui.local',
        'X-Title': 'DataTUI',
      },
    });
    this.model = config.model;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  setSystemPrompt(prompt: string): void {
    // Remove existing system message if any
    this.messages = this.messages.filter((m) => m.role !== 'system');
    // Add new system message at the beginning
    this.messages.unshift({ role: 'system', content: prompt });
  }

  setTools(tools: ChatCompletionTool[]): void {
    this.tools = tools;
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }

  addToolResult(toolCallId: string, result: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: result,
    });
  }

  addAssistantToolCalls(
    toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>
  ): void {
    this.messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    });
  }

  async chat(): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: this.tools.length > 0 ? this.tools : undefined,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Parse tool calls
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        } catch {
          // Skip malformed tool calls
          console.error('Failed to parse tool call arguments:', tc.function.arguments);
        }
      }

      // Add the assistant message with tool calls to history
      this.addAssistantToolCalls(
        message.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }))
      );
    } else if (message.content) {
      // Add assistant message to history
      this.addAssistantMessage(message.content);
    }

    return {
      content: message.content,
      toolCalls,
      finishReason: choice.finish_reason,
    };
  }

  async *chatStream(): AsyncGenerator<{ type: 'content' | 'tool_call'; data: string | ToolCall }> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: this.tools.length > 0 ? this.tools : undefined,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    });

    let fullContent = '';
    const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        yield { type: 'content', data: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsInProgress.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallsInProgress.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
      }
    }

    // Add to history
    if (toolCallsInProgress.size > 0) {
      const calls = Array.from(toolCallsInProgress.values());
      this.addAssistantToolCalls(
        calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }))
      );

      // Yield completed tool calls
      for (const tc of calls) {
        try {
          yield {
            type: 'tool_call',
            data: {
              id: tc.id,
              name: tc.name,
              arguments: JSON.parse(tc.arguments),
            },
          };
        } catch {
          console.error('Failed to parse tool call arguments:', tc.arguments);
        }
      }
    } else if (fullContent) {
      this.addAssistantMessage(fullContent);
    }
  }

  clearHistory(): void {
    const systemMessage = this.messages.find((m) => m.role === 'system');
    this.messages = systemMessage ? [systemMessage] : [];
  }

  getHistory(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }
}
