import * as duckdb from 'duckdb';

export interface Column {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: Column[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  executionTime: number;
}

export interface DatasetInfo {
  alias: string;
  path: string;
  format: 'csv' | 'parquet' | 'json';
  columns: Column[];
  rowCount: number;
}

export class DuckDBEngine {
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  private datasets: Map<string, DatasetInfo> = new Map();
  private maxRows: number;

  constructor(maxRows: number = 1000) {
    this.maxRows = maxRows;
    this.db = new duckdb.Database(':memory:');
    this.conn = this.db.connect();
  }

  private detectFormat(path: string): 'csv' | 'parquet' | 'json' {
    const ext = path.toLowerCase().split('.').pop();
    if (ext === 'parquet') return 'parquet';
    if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
    return 'csv';
  }

  private runQuery(query: string): Promise<{ columns: Column[]; rows: unknown[][] }> {
    return new Promise((resolve, reject) => {
      this.conn.all(query, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        if (!result || result.length === 0) {
          resolve({ columns: [], rows: [] });
          return;
        }

        // Extract column names from first row
        const columns: Column[] = Object.keys(result[0]).map((name) => ({
          name,
          type: typeof result[0][name],
        }));

        // Convert to rows
        const rows = result.map((row) => Object.values(row));

        resolve({ columns, rows });
      });
    });
  }

  async registerDataset(path: string, alias: string, dataDir: string): Promise<DatasetInfo> {
    const format = this.detectFormat(path);
    const fullPath = `${dataDir}/${path}`;

    // Create a view for the dataset
    let createViewQuery: string;
    switch (format) {
      case 'parquet':
        createViewQuery = `CREATE OR REPLACE VIEW "${alias}" AS SELECT * FROM read_parquet('${fullPath}')`;
        break;
      case 'json':
        createViewQuery = `CREATE OR REPLACE VIEW "${alias}" AS SELECT * FROM read_json_auto('${fullPath}')`;
        break;
      case 'csv':
      default:
        createViewQuery = `CREATE OR REPLACE VIEW "${alias}" AS SELECT * FROM read_csv_auto('${fullPath}')`;
        break;
    }

    await this.runQuery(createViewQuery);

    // Get schema
    const schemaResult = await this.runQuery(`DESCRIBE "${alias}"`);
    const columns: Column[] = schemaResult.rows.map((row) => ({
      name: row[0] as string,
      type: row[1] as string,
    }));

    // Get row count
    const countResult = await this.runQuery(`SELECT COUNT(*) as count FROM "${alias}"`);
    const rowCount = (countResult.rows[0]?.[0] as number) ?? 0;

    const info: DatasetInfo = {
      alias,
      path,
      format,
      columns,
      rowCount,
    };

    this.datasets.set(alias, info);
    return info;
  }

  listDatasets(): DatasetInfo[] {
    return Array.from(this.datasets.values());
  }

  getDataset(alias: string): DatasetInfo | undefined {
    return this.datasets.get(alias);
  }

  async describeDataset(alias: string, previewRows: number = 5): Promise<{
    info: DatasetInfo;
    preview: unknown[][];
  }> {
    const info = this.datasets.get(alias);
    if (!info) {
      throw new Error(`Dataset "${alias}" not found`);
    }

    // Get sample rows
    const previewResult = await this.runQuery(`SELECT * FROM "${alias}" LIMIT ${previewRows}`);

    return {
      info,
      preview: previewResult.rows,
    };
  }

  async executeQuery(query: string): Promise<QueryResult> {
    const startTime = performance.now();

    // Add LIMIT if not present
    const upperQuery = query.toUpperCase().trim();
    let limitedQuery = query;
    if (!upperQuery.includes('LIMIT')) {
      limitedQuery = `${query} LIMIT ${this.maxRows + 1}`;
    }

    const result = await this.runQuery(limitedQuery);
    const executionTime = performance.now() - startTime;

    // Check if we hit the limit
    const truncated = result.rows.length > this.maxRows;
    const rows = truncated ? result.rows.slice(0, this.maxRows) : result.rows;

    return {
      columns: result.columns,
      rows,
      rowCount: rows.length,
      truncated,
      executionTime,
    };
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.conn.close();
      this.db.close(() => resolve());
    });
  }
}
