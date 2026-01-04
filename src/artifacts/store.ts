import { nanoid } from 'nanoid';
import type { Column, QueryResult } from '../engines/duckdb';

export type ArtifactType = 'table' | 'plot' | 'text';

export interface TableArtifact {
  id: string;
  type: 'table';
  columns: Column[];
  rows: unknown[][];
  totalRows: number;
  truncated: boolean;
  createdAt: Date;
  query?: string;
}

export interface PlotArtifact {
  id: string;
  type: 'plot';
  data: Uint8Array; // PNG data
  width: number;
  height: number;
  createdAt: Date;
}

export interface TextArtifact {
  id: string;
  type: 'text';
  content: string;
  createdAt: Date;
}

export type Artifact = TableArtifact | PlotArtifact | TextArtifact;

export interface TablePage {
  rows: unknown[][];
  page: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  columns: Column[];
}

export class ArtifactStore {
  private artifacts: Map<string, Artifact> = new Map();

  storeTable(result: QueryResult, query?: string): TableArtifact {
    const id = `tbl_${nanoid(8)}`;
    const artifact: TableArtifact = {
      id,
      type: 'table',
      columns: result.columns,
      rows: result.rows,
      totalRows: result.rowCount,
      truncated: result.truncated,
      createdAt: new Date(),
      query,
    };
    this.artifacts.set(id, artifact);
    return artifact;
  }

  storePlot(data: Uint8Array, width: number, height: number): PlotArtifact {
    const id = `plt_${nanoid(8)}`;
    const artifact: PlotArtifact = {
      id,
      type: 'plot',
      data,
      width,
      height,
      createdAt: new Date(),
    };
    this.artifacts.set(id, artifact);
    return artifact;
  }

  storeText(content: string): TextArtifact {
    const id = `txt_${nanoid(8)}`;
    const artifact: TextArtifact = {
      id,
      type: 'text',
      content,
      createdAt: new Date(),
    };
    this.artifacts.set(id, artifact);
    return artifact;
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getTable(id: string): TableArtifact | undefined {
    const artifact = this.artifacts.get(id);
    if (artifact?.type === 'table') {
      return artifact;
    }
    return undefined;
  }

  getTablePage(id: string, page: number, pageSize: number): TablePage | undefined {
    const artifact = this.getTable(id);
    if (!artifact) return undefined;

    const startIdx = (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, artifact.rows.length);
    const totalPages = Math.ceil(artifact.rows.length / pageSize);

    return {
      rows: artifact.rows.slice(startIdx, endIdx),
      page,
      pageSize,
      totalPages,
      totalRows: artifact.totalRows,
      columns: artifact.columns,
    };
  }

  list(): Array<{ id: string; type: ArtifactType; createdAt: Date }> {
    return Array.from(this.artifacts.values()).map((a) => ({
      id: a.id,
      type: a.type,
      createdAt: a.createdAt,
    }));
  }

  delete(id: string): boolean {
    return this.artifacts.delete(id);
  }

  clear(): void {
    this.artifacts.clear();
  }

  // Export table to CSV string
  exportTableToCsv(id: string): string | undefined {
    const artifact = this.getTable(id);
    if (!artifact) return undefined;

    const headers = artifact.columns.map((c) => c.name).join(',');
    const rows = artifact.rows.map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          const str = String(cell);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    );

    return [headers, ...rows].join('\n');
  }

  // Export table to JSON string
  exportTableToJson(id: string): string | undefined {
    const artifact = this.getTable(id);
    if (!artifact) return undefined;

    const data = artifact.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      artifact.columns.forEach((col, idx) => {
        obj[col.name] = row[idx];
      });
      return obj;
    });

    return JSON.stringify(data, null, 2);
  }
}
