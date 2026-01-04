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

// Chart schemas
export const BarChartSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact containing the data'),
  label_column: z.string().describe('Column name to use for labels (x-axis)'),
  value_column: z.string().describe('Column name to use for values (y-axis)'),
  title: z.string().optional().describe('Chart title'),
  horizontal: z.boolean().optional().default(true).describe('Whether to render as horizontal bars (default: true)'),
  limit: z.number().optional().default(10).describe('Maximum number of bars to show'),
});

export const LineChartSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact containing the data'),
  value_column: z.string().describe('Column name to use for values (y-axis)'),
  label_column: z.string().optional().describe('Column name to use for x-axis labels'),
  title: z.string().optional().describe('Chart title'),
});

export const HistogramSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact containing the data'),
  value_column: z.string().describe('Column name containing numeric values to bin'),
  bins: z.number().optional().default(10).describe('Number of bins (default: 10)'),
  title: z.string().optional().describe('Chart title'),
});

export const PieChartSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact containing the data'),
  label_column: z.string().describe('Column name to use for segment labels'),
  value_column: z.string().describe('Column name to use for segment values'),
  title: z.string().optional().describe('Chart title'),
  limit: z.number().optional().default(8).describe('Maximum number of segments to show'),
});

export const ScatterPlotSchema = z.object({
  artifact_id: z.string().describe('ID of the table artifact containing the data'),
  x_column: z.string().describe('Column name for x-axis values'),
  y_column: z.string().describe('Column name for y-axis values'),
  title: z.string().optional().describe('Chart title'),
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
  {
    type: 'function',
    function: {
      name: 'bar_chart',
      description:
        'Create a bar chart visualization from a table artifact. Great for comparing values across categories.',
      parameters: zodToJsonSchema(BarChartSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'line_chart',
      description:
        'Create a line chart visualization from a table artifact. Great for showing trends over time or sequences.',
      parameters: zodToJsonSchema(LineChartSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'histogram',
      description:
        'Create a histogram showing the distribution of numeric values. Great for understanding data distribution.',
      parameters: zodToJsonSchema(HistogramSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'pie_chart',
      description:
        'Create a pie chart showing proportions. Great for showing parts of a whole.',
      parameters: zodToJsonSchema(PieChartSchema),
    },
  },
  {
    type: 'function',
    function: {
      name: 'scatter_plot',
      description:
        'Create a scatter plot showing the relationship between two numeric columns. Great for correlation analysis.',
      parameters: zodToJsonSchema(ScatterPlotSchema),
    },
  },
];

// Type exports
export type RegisterDatasetInput = z.infer<typeof RegisterDatasetSchema>;
export type DescribeDatasetInput = z.infer<typeof DescribeDatasetSchema>;
export type SqlInput = z.infer<typeof SqlSchema>;
export type ExportArtifactInput = z.infer<typeof ExportArtifactSchema>;
export type RenderTableInput = z.infer<typeof RenderTableSchema>;
export type BarChartInput = z.infer<typeof BarChartSchema>;
export type LineChartInput = z.infer<typeof LineChartSchema>;
export type HistogramInput = z.infer<typeof HistogramSchema>;
export type PieChartInput = z.infer<typeof PieChartSchema>;
export type ScatterPlotInput = z.infer<typeof ScatterPlotSchema>;
