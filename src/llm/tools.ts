import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// Zod schemas for tool inputs
export const RegisterDatasetSchema = z.object({
  path: z.string().describe('Path to the dataset file relative to ./data/'),
  alias: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,32}$/)
    .describe('Short alias for the dataset (1-32 alphanumeric chars, underscores, dashes)'),
});

export const ListDatasetsSchema = z.object({});

export const DescribeDatasetSchema = z.object({
  alias: z.string().describe('Alias of the dataset to describe'),
});

export const SqlSchema = z.object({
  query: z.string().describe('SQL query to execute. Use dataset aliases as table names.'),
  aliases: z.array(z.string()).optional().describe('List of dataset aliases used in the query'),
});

export const ExportArtifactSchema = z.object({
  artifact_id: z.string().describe('ID of the artifact to export'),
  output_path: z.string().describe('Output file path relative to ./outputs/'),
  format: z.enum(['csv', 'json', 'parquet']).optional().default('csv').describe('Export format'),
});

export const RenderTableSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact to render'),
  page: z.number().optional().default(1).describe('Page number (1-indexed)'),
  page_size: z.number().optional().default(20).describe('Rows per page'),
});

// Convert Zod schema to JSON Schema for OpenAI tools
function zodToJsonSchema(schema: z.ZodObject<any>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const description = zodType._def.description || '';

    if (zodType instanceof z.ZodString) {
      properties[key] = { type: 'string', description };
      if (!zodType.isOptional()) required.push(key);
    } else if (zodType instanceof z.ZodNumber) {
      properties[key] = { type: 'number', description };
      if (!zodType.isOptional()) required.push(key);
    } else if (zodType instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean', description };
      if (!zodType.isOptional()) required.push(key);
    } else if (zodType instanceof z.ZodArray) {
      properties[key] = { type: 'array', items: { type: 'string' }, description };
      if (!zodType.isOptional()) required.push(key);
    } else if (zodType instanceof z.ZodEnum) {
      properties[key] = { type: 'string', enum: zodType._def.values, description };
      if (!zodType.isOptional()) required.push(key);
    } else if (zodType instanceof z.ZodDefault) {
      // Handle defaults - get the inner type
      const innerType = zodType._def.innerType;
      if (innerType instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description };
      } else if (innerType instanceof z.ZodString) {
        properties[key] = { type: 'string', description };
      } else if (innerType instanceof z.ZodEnum) {
        properties[key] = { type: 'string', enum: innerType._def.values, description };
      }
      // Defaults are optional
    } else if (zodType instanceof z.ZodOptional) {
      const innerType = zodType._def.innerType;
      if (innerType instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description };
      } else if (innerType instanceof z.ZodString) {
        properties[key] = { type: 'string', description };
      } else if (innerType instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'string' }, description };
      }
    } else {
      // Fallback
      properties[key] = { type: 'string', description };
      if (!zodType.isOptional()) required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

// OpenAI tool definitions
export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'register_dataset',
      description:
        'Register a dataset file (CSV, Parquet, or JSON) for analysis. The file must be in the ./data/ directory.',
      parameters: zodToJsonSchema(RegisterDatasetSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_datasets',
      description: 'List all currently registered datasets with their aliases, paths, and basic info.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_dataset',
      description:
        'Get detailed information about a registered dataset including column names, types, row count, and sample data.',
      parameters: zodToJsonSchema(DescribeDatasetSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'sql',
      description:
        'Execute a SQL query against registered datasets. Use dataset aliases as table names. Results are automatically paginated.',
      parameters: zodToJsonSchema(SqlSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_table',
      description: 'Render a table artifact in the terminal with pagination controls.',
      parameters: zodToJsonSchema(RenderTableSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_artifact',
      description: 'Export a query result or artifact to a file in the ./outputs/ directory.',
      parameters: zodToJsonSchema(ExportArtifactSchema),
    },
  },
];

// Type exports
export type RegisterDatasetInput = z.infer<typeof RegisterDatasetSchema>;
export type DescribeDatasetInput = z.infer<typeof DescribeDatasetSchema>;
export type SqlInput = z.infer<typeof SqlSchema>;
export type ExportArtifactInput = z.infer<typeof ExportArtifactSchema>;
export type RenderTableInput = z.infer<typeof RenderTableSchema>;
