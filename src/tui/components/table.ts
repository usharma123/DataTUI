import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  RGBA,
} from '@opentui/core';
import type { Column } from '../../engines/duckdb';

// Box drawing characters
const BOX = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  teeDown: '\u252c',
  teeUp: '\u2534',
  teeRight: '\u251c',
  teeLeft: '\u2524',
  cross: '\u253c',
};

// Colors
const TableColors = {
  border: RGBA.fromHex('#3a3a4a'),
  header: RGBA.fromHex('#6b8afd'),
  headerBg: RGBA.fromHex('#1a1a2a'),
  cell: RGBA.fromHex('#e0e0e0'),
  cellAlt: RGBA.fromHex('#c0c0c0'),
  info: RGBA.fromHex('#808080'),
  truncated: RGBA.fromHex('#fbbf24'),
};

export interface TableRenderOptions {
  columns: Column[];
  rows: unknown[][];
  page: number;
  totalPages: number;
  totalRows: number;
  truncated: boolean;
  maxWidth: number;
}

interface ColumnLayout {
  name: string;
  width: number;
  type: string;
}

function formatCell(value: unknown, maxWidth: number): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  let str = String(value);
  if (str.length > maxWidth) {
    str = str.slice(0, maxWidth - 1) + '\u2026'; // ellipsis
  }
  return str;
}

function calculateColumnWidths(
  columns: Column[],
  rows: unknown[][],
  maxTotalWidth: number
): ColumnLayout[] {
  const minWidth = 4;
  const maxColWidth = 30;

  // Calculate ideal widths based on content
  const layouts: ColumnLayout[] = columns.map((col, idx) => {
    let maxLen = col.name.length;
    for (const row of rows) {
      const cellLen = String(row[idx] ?? 'NULL').length;
      maxLen = Math.max(maxLen, cellLen);
    }
    return {
      name: col.name,
      type: col.type,
      width: Math.min(Math.max(maxLen, minWidth), maxColWidth),
    };
  });

  // Calculate total width needed (including borders)
  // Format: | col1 | col2 | col3 | = columns + (columns+1) borders + 2*columns padding
  const bordersWidth = layouts.length + 1;
  const paddingWidth = layouts.length * 2;
  let totalContentWidth = layouts.reduce((sum, l) => sum + l.width, 0);
  let totalWidth = totalContentWidth + bordersWidth + paddingWidth;

  // If too wide, shrink columns proportionally
  if (totalWidth > maxTotalWidth) {
    const availableContent = maxTotalWidth - bordersWidth - paddingWidth;
    const scale = availableContent / totalContentWidth;
    for (const layout of layouts) {
      layout.width = Math.max(minWidth, Math.floor(layout.width * scale));
    }
  }

  return layouts;
}

function padCell(content: string, width: number): string {
  if (content.length >= width) {
    return content.slice(0, width);
  }
  return content + ' '.repeat(width - content.length);
}

function renderTableLine(
  layouts: ColumnLayout[],
  left: string,
  middle: string,
  right: string,
  fill: string
): string {
  const segments = layouts.map((l) => fill.repeat(l.width + 2));
  return left + segments.join(middle) + right;
}

function renderTableRow(layouts: ColumnLayout[], cells: string[]): string {
  const paddedCells = layouts.map((l, i) => ' ' + padCell(cells[i] || '', l.width) + ' ');
  return BOX.vertical + paddedCells.join(BOX.vertical) + BOX.vertical;
}

export function renderTableToStrings(options: TableRenderOptions): string[] {
  const { columns, rows, page, totalPages, totalRows, truncated, maxWidth } = options;

  if (columns.length === 0) {
    return ['No columns to display'];
  }

  const layouts = calculateColumnWidths(columns, rows, maxWidth);
  const lines: string[] = [];

  // Top border
  lines.push(renderTableLine(layouts, BOX.topLeft, BOX.teeDown, BOX.topRight, BOX.horizontal));

  // Header row
  const headerCells = layouts.map((l) => l.name);
  lines.push(renderTableRow(layouts, headerCells));

  // Header separator
  lines.push(renderTableLine(layouts, BOX.teeRight, BOX.cross, BOX.teeLeft, BOX.horizontal));

  // Data rows
  if (rows.length === 0) {
    const emptyRow = layouts.map(() => '');
    emptyRow[0] = '(no data)';
    lines.push(renderTableRow(layouts, emptyRow));
  } else {
    for (const row of rows) {
      const cells = layouts.map((l, i) => formatCell(row[i], l.width));
      lines.push(renderTableRow(layouts, cells));
    }
  }

  // Bottom border
  lines.push(renderTableLine(layouts, BOX.bottomLeft, BOX.teeUp, BOX.bottomRight, BOX.horizontal));

  // Pagination info
  const startRow = (page - 1) * rows.length + 1;
  const endRow = startRow + rows.length - 1;
  let pageInfo = `Page ${page}/${totalPages} | Rows ${startRow}-${endRow} of ${totalRows}`;
  if (truncated) {
    pageInfo += ' (truncated)';
  }
  lines.push(pageInfo);
  lines.push('PageUp/PageDown to navigate');

  return lines;
}

// Helper to clear all children from a ScrollBoxRenderable
function clearScrollBox(scrollBox: ScrollBoxRenderable): void {
  const children = scrollBox.getChildren();
  for (const child of children) {
    scrollBox.remove(child.id);
  }
}

export function createTableDisplay(
  renderer: CliRenderer,
  artifactPane: ScrollBoxRenderable,
  options: TableRenderOptions
): void {
  // Clear existing content
  clearScrollBox(artifactPane);

  const lines = renderTableToStrings(options);

  // Create a container for the table
  const tableContainer = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    padding: 0,
  });

  // Add each line as a text renderable
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = new TextRenderable(renderer, {
      content: line,
      width: '100%',
    });

    // Style based on line type
    if (i === 0 || i === 2 || i === lines.length - 4) {
      // Border lines
      text.fg = TableColors.border;
    } else if (i === 1) {
      // Header row
      text.fg = TableColors.header;
      text.attributes = 1; // bold
    } else if (i >= lines.length - 2) {
      // Pagination info
      text.fg = TableColors.info;
    } else if (options.truncated && i === lines.length - 3) {
      // Truncation warning in pagination
      text.fg = TableColors.truncated;
    } else {
      // Data rows
      text.fg = TableColors.cell;
    }

    tableContainer.add(text);
  }

  artifactPane.add(tableContainer);
}

export function createEmptyArtifactDisplay(
  renderer: CliRenderer,
  artifactPane: ScrollBoxRenderable,
  message: string = 'No artifacts yet. Query some data to see results here.'
): void {
  clearScrollBox(artifactPane);

  const placeholder = new TextRenderable(renderer, {
    content: message,
    width: '100%',
  });
  placeholder.fg = TableColors.info;

  artifactPane.add(placeholder);
}

export function createSchemaDisplay(
  renderer: CliRenderer,
  artifactPane: ScrollBoxRenderable,
  datasetInfo: {
    alias: string;
    path: string;
    format: string;
    rowCount: number;
    columns: Column[];
  }
): void {
  clearScrollBox(artifactPane);

  const container = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    gap: 1,
  });

  // Title
  const title = new TextRenderable(renderer, {
    content: `Dataset: ${datasetInfo.alias}`,
  });
  title.fg = TableColors.header;
  title.attributes = 1; // bold
  container.add(title);

  // Info
  const info = new TextRenderable(renderer, {
    content: `File: ${datasetInfo.path} (${datasetInfo.format})\nRows: ${datasetInfo.rowCount.toLocaleString()}`,
  });
  info.fg = TableColors.cell;
  container.add(info);

  // Columns header
  const colHeader = new TextRenderable(renderer, {
    content: '\nColumns:',
  });
  colHeader.fg = TableColors.header;
  colHeader.attributes = 1; // bold
  container.add(colHeader);

  // Column list
  for (const col of datasetInfo.columns) {
    const colText = new TextRenderable(renderer, {
      content: `  ${col.name}: ${col.type}`,
    });
    colText.fg = TableColors.cell;
    container.add(colText);
  }

  artifactPane.add(container);
}
