import { z } from 'zod';
import {
  RegisterDatasetSchema,
  DescribeDatasetSchema,
  SqlSchema,
  ExportArtifactSchema,
  RenderTableSchema,
  BarChartSchema,
  LineChartSchema,
  HistogramSchema,
  PieChartSchema,
  ScatterPlotSchema,
} from '../llm/tools';
import type { DuckDBEngine } from '../engines/duckdb';
import type { ArtifactStore } from '../artifacts/store';
import {
  renderHorizontalBarChart,
  renderVerticalBarChart,
  renderLineChart,
  renderHistogram,
  renderPieChart,
  renderScatterPlot,
  type ChartDataPoint,
  type ScatterPoint,
} from '../tui/components/chart';
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

// Convert BigInt values to numbers for JSON serialization
function convertBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    // Convert to number if safe, otherwise to string
    return Number(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigInts);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
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
          data: convertBigInts({
            message: `Dataset "${input.alias}" registered successfully`,
            columns: info.columns,
            rowCount: info.rowCount,
            format: info.format,
          }),
        };
      }

      case 'list_datasets': {
        const datasets = ctx.engine.listDatasets();
        return {
          success: true,
          data: convertBigInts({
            datasets: datasets.map((d) => ({
              alias: d.alias,
              path: d.path,
              format: d.format,
              rowCount: d.rowCount,
              columns: d.columns.length,
            })),
          }),
        };
      }

      case 'describe_dataset': {
        const input = DescribeDatasetSchema.parse(args);
        const result = await ctx.engine.describeDataset(input.alias);
        return {
          success: true,
          data: convertBigInts({
            alias: result.info.alias,
            path: result.info.path,
            format: result.info.format,
            rowCount: result.info.rowCount,
            columns: result.info.columns,
            preview: result.preview,
          }),
        };
      }

      case 'sql': {
        const input = SqlSchema.parse(args);
        const result = await ctx.engine.executeQuery(input.query);
        const artifact = ctx.artifactStore.storeTable(result, input.query);
        return {
          success: true,
          data: convertBigInts({
            message: `Query executed successfully`,
            rowCount: result.rowCount,
            truncated: result.truncated,
            executionTime: `${result.executionTime.toFixed(2)}ms`,
            columns: result.columns.map((c) => c.name),
            preview: result.rows.slice(0, 5),
          }),
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
          data: convertBigInts({
            page: page.page,
            totalPages: page.totalPages,
            pageSize: page.pageSize,
            totalRows: page.totalRows,
            columns: page.columns.map((c) => c.name),
            rows: page.rows,
          }),
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

      case 'bar_chart': {
        const input = BarChartSchema.parse(args);
        const tableArtifact = ctx.artifactStore.getTable(input.artifact_id);
        if (!tableArtifact) {
          return { success: false, error: `Table artifact "${input.artifact_id}" not found` };
        }

        // Find column indices
        const labelIdx = tableArtifact.columns.findIndex((c) => c.name === input.label_column);
        const valueIdx = tableArtifact.columns.findIndex((c) => c.name === input.value_column);
        if (labelIdx === -1) {
          return { success: false, error: `Column "${input.label_column}" not found` };
        }
        if (valueIdx === -1) {
          return { success: false, error: `Column "${input.value_column}" not found` };
        }

        // Extract data
        const limit = input.limit || 10;
        const data: ChartDataPoint[] = tableArtifact.rows.slice(0, limit).map((row) => ({
          label: String(row[labelIdx] ?? ''),
          value: Number(row[valueIdx]) || 0,
        }));

        // Render chart
        const lines = input.horizontal
          ? renderHorizontalBarChart({ title: input.title, data, maxWidth: 60, showValues: true })
          : renderVerticalBarChart({ title: input.title, data, maxWidth: 60, maxHeight: 12, showValues: true });

        const chartArtifact = ctx.artifactStore.storeChart('bar', lines, input.artifact_id, input.title);

        return {
          success: true,
          data: {
            message: `Bar chart created with ${data.length} data points`,
            chartType: 'bar',
            dataPoints: data.length,
          },
          artifactId: chartArtifact.id,
        };
      }

      case 'line_chart': {
        const input = LineChartSchema.parse(args);
        const tableArtifact = ctx.artifactStore.getTable(input.artifact_id);
        if (!tableArtifact) {
          return { success: false, error: `Table artifact "${input.artifact_id}" not found` };
        }

        const valueIdx = tableArtifact.columns.findIndex((c) => c.name === input.value_column);
        if (valueIdx === -1) {
          return { success: false, error: `Column "${input.value_column}" not found` };
        }

        // Extract values
        const values = tableArtifact.rows.map((row) => Number(row[valueIdx]) || 0);

        // Extract labels if specified
        let labels: string[] | undefined;
        if (input.label_column) {
          const labelIdx = tableArtifact.columns.findIndex((c) => c.name === input.label_column);
          if (labelIdx !== -1) {
            labels = tableArtifact.rows.map((row) => String(row[labelIdx] ?? ''));
          }
        }

        const lines = renderLineChart({
          title: input.title,
          data: values,
          labels,
          maxWidth: 60,
          maxHeight: 10,
        });

        const chartArtifact = ctx.artifactStore.storeChart('line', lines, input.artifact_id, input.title);

        return {
          success: true,
          data: {
            message: `Line chart created with ${values.length} data points`,
            chartType: 'line',
            dataPoints: values.length,
          },
          artifactId: chartArtifact.id,
        };
      }

      case 'histogram': {
        const input = HistogramSchema.parse(args);
        const tableArtifact = ctx.artifactStore.getTable(input.artifact_id);
        if (!tableArtifact) {
          return { success: false, error: `Table artifact "${input.artifact_id}" not found` };
        }

        const valueIdx = tableArtifact.columns.findIndex((c) => c.name === input.value_column);
        if (valueIdx === -1) {
          return { success: false, error: `Column "${input.value_column}" not found` };
        }

        // Extract numeric values
        const values = tableArtifact.rows
          .map((row) => Number(row[valueIdx]))
          .filter((v) => !isNaN(v));

        const lines = renderHistogram({
          title: input.title,
          data: values,
          bins: input.bins || 10,
          maxWidth: 60,
          maxHeight: 10,
        });

        const chartArtifact = ctx.artifactStore.storeChart('histogram', lines, input.artifact_id, input.title);

        return {
          success: true,
          data: {
            message: `Histogram created with ${values.length} values in ${input.bins || 10} bins`,
            chartType: 'histogram',
            dataPoints: values.length,
            bins: input.bins || 10,
          },
          artifactId: chartArtifact.id,
        };
      }

      case 'pie_chart': {
        const input = PieChartSchema.parse(args);
        const tableArtifact = ctx.artifactStore.getTable(input.artifact_id);
        if (!tableArtifact) {
          return { success: false, error: `Table artifact "${input.artifact_id}" not found` };
        }

        const labelIdx = tableArtifact.columns.findIndex((c) => c.name === input.label_column);
        const valueIdx = tableArtifact.columns.findIndex((c) => c.name === input.value_column);
        if (labelIdx === -1) {
          return { success: false, error: `Column "${input.label_column}" not found` };
        }
        if (valueIdx === -1) {
          return { success: false, error: `Column "${input.value_column}" not found` };
        }

        const limit = input.limit || 8;
        const data: ChartDataPoint[] = tableArtifact.rows.slice(0, limit).map((row) => ({
          label: String(row[labelIdx] ?? ''),
          value: Number(row[valueIdx]) || 0,
        }));

        const lines = renderPieChart({
          title: input.title,
          data,
          maxWidth: 60,
          showLegend: true,
        });

        const chartArtifact = ctx.artifactStore.storeChart('pie', lines, input.artifact_id, input.title);

        return {
          success: true,
          data: {
            message: `Pie chart created with ${data.length} segments`,
            chartType: 'pie',
            segments: data.length,
          },
          artifactId: chartArtifact.id,
        };
      }

      case 'scatter_plot': {
        const input = ScatterPlotSchema.parse(args);
        const tableArtifact = ctx.artifactStore.getTable(input.artifact_id);
        if (!tableArtifact) {
          return { success: false, error: `Table artifact "${input.artifact_id}" not found` };
        }

        const xIdx = tableArtifact.columns.findIndex((c) => c.name === input.x_column);
        const yIdx = tableArtifact.columns.findIndex((c) => c.name === input.y_column);
        if (xIdx === -1) {
          return { success: false, error: `Column "${input.x_column}" not found` };
        }
        if (yIdx === -1) {
          return { success: false, error: `Column "${input.y_column}" not found` };
        }

        const data: ScatterPoint[] = tableArtifact.rows
          .map((row) => ({
            x: Number(row[xIdx]),
            y: Number(row[yIdx]),
          }))
          .filter((p) => !isNaN(p.x) && !isNaN(p.y));

        const lines = renderScatterPlot({
          title: input.title,
          data,
          maxWidth: 60,
          maxHeight: 12,
        });

        const chartArtifact = ctx.artifactStore.storeChart('scatter', lines, input.artifact_id, input.title);

        return {
          success: true,
          data: {
            message: `Scatter plot created with ${data.length} points`,
            chartType: 'scatter',
            dataPoints: data.length,
          },
          artifactId: chartArtifact.id,
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
