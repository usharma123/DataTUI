import { z } from 'zod';
import {
  RegisterDatasetSchema,
  DescribeDatasetSchema,
  SqlSchema,
  ExportArtifactSchema,
  RenderTableSchema,
} from '../llm/tools';
import type { DuckDBEngine } from '../engines/duckdb';
import type { ArtifactStore } from '../artifacts/store';
import * as fs from 'fs';
import * as path from 'path';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  artifactId?: string;
  error?: string;
}

export interface ToolContext {
  engine: DuckDBEngine;
  artifactStore: ArtifactStore;
  dataDir: string;
  outputDir: string;
}

// Validate path is within allowed directory
function validatePath(inputPath: string, baseDir: string, allowWrite: boolean = false): string {
  // Normalize the path
  const normalizedBase = path.resolve(baseDir);
  const fullPath = path.resolve(baseDir, inputPath);

  // Check for directory traversal
  if (!fullPath.startsWith(normalizedBase)) {
    throw new Error(`Path "${inputPath}" is outside allowed directory`);
  }

  // Check if path exists (for read) or parent exists (for write)
  if (allowWrite) {
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } else if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  return fullPath;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'register_dataset': {
        const input = RegisterDatasetSchema.parse(args);
        // Validate path
        validatePath(input.path, ctx.dataDir);
        const info = await ctx.engine.registerDataset(input.path, input.alias, ctx.dataDir);
        return {
          success: true,
          data: {
            message: `Dataset "${input.alias}" registered successfully`,
            columns: info.columns,
            rowCount: info.rowCount,
            format: info.format,
          },
        };
      }

      case 'list_datasets': {
        const datasets = ctx.engine.listDatasets();
        return {
          success: true,
          data: {
            datasets: datasets.map((d) => ({
              alias: d.alias,
              path: d.path,
              format: d.format,
              rowCount: d.rowCount,
              columns: d.columns.length,
            })),
          },
        };
      }

      case 'describe_dataset': {
        const input = DescribeDatasetSchema.parse(args);
        const result = await ctx.engine.describeDataset(input.alias);
        return {
          success: true,
          data: {
            alias: result.info.alias,
            path: result.info.path,
            format: result.info.format,
            rowCount: result.info.rowCount,
            columns: result.info.columns,
            preview: result.preview,
          },
        };
      }

      case 'sql': {
        const input = SqlSchema.parse(args);
        const result = await ctx.engine.executeQuery(input.query);
        const artifact = ctx.artifactStore.storeTable(result, input.query);
        return {
          success: true,
          data: {
            message: `Query executed successfully`,
            rowCount: result.rowCount,
            truncated: result.truncated,
            executionTime: `${result.executionTime.toFixed(2)}ms`,
            columns: result.columns.map((c) => c.name),
            preview: result.rows.slice(0, 5),
          },
          artifactId: artifact.id,
        };
      }

      case 'render_table': {
        const input = RenderTableSchema.parse(args);
        const page = ctx.artifactStore.getTablePage(input.artifact_id, input.page, input.page_size);
        if (!page) {
          return { success: false, error: `Artifact "${input.artifact_id}" not found` };
        }
        return {
          success: true,
          data: {
            page: page.page,
            totalPages: page.totalPages,
            pageSize: page.pageSize,
            totalRows: page.totalRows,
            columns: page.columns.map((c) => c.name),
            rows: page.rows,
          },
          artifactId: input.artifact_id,
        };
      }

      case 'export_artifact': {
        const input = ExportArtifactSchema.parse(args);
        const artifact = ctx.artifactStore.get(input.artifact_id);
        if (!artifact) {
          return { success: false, error: `Artifact "${input.artifact_id}" not found` };
        }

        if (artifact.type !== 'table') {
          return { success: false, error: `Only table artifacts can be exported` };
        }

        // Validate output path
        const outputPath = validatePath(input.output_path, ctx.outputDir, true);

        let content: string;
        if (input.format === 'json') {
          content = ctx.artifactStore.exportTableToJson(input.artifact_id) || '';
        } else {
          content = ctx.artifactStore.exportTableToCsv(input.artifact_id) || '';
        }

        fs.writeFileSync(outputPath, content, 'utf-8');

        return {
          success: true,
          data: {
            message: `Exported to ${input.output_path}`,
            path: input.output_path,
            format: input.format,
            rowCount: artifact.totalRows,
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Invalid input: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
