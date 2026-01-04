import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  RGBA,
} from '@opentui/core';

// Unicode block characters for drawing charts
const BLOCKS = {
  full: '\u2588',      // █
  sevenEighths: '\u2587', // ▇
  threeQuarters: '\u2586', // ▆
  fiveEighths: '\u2585',  // ▅
  half: '\u2584',      // ▄
  threeEighths: '\u2583', // ▃
  quarter: '\u2582',   // ▂
  eighth: '\u2581',    // ▁
  empty: ' ',
};

// Braille characters for high-resolution line charts
const BRAILLE = {
  base: 0x2800,
  dots: [
    [0x01, 0x08], // dots 1,4 (top)
    [0x02, 0x10], // dots 2,5
    [0x04, 0x20], // dots 3,6
    [0x40, 0x80], // dots 7,8 (bottom)
  ],
};

// Sparkline characters
const SPARKLINE_CHARS = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

// Colors for charts
const ChartColors = {
  axis: RGBA.fromHex('#6b8afd'),
  label: RGBA.fromHex('#808080'),
  bar: RGBA.fromHex('#22c55e'),
  barAlt: RGBA.fromHex('#3b82f6'),
  line: RGBA.fromHex('#f59e0b'),
  grid: RGBA.fromHex('#2a2a3a'),
  title: RGBA.fromHex('#e0e0e0'),
  value: RGBA.fromHex('#a5d6a7'),
};

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface BarChartOptions {
  title?: string;
  data: ChartDataPoint[];
  maxWidth: number;
  maxHeight?: number;
  showValues?: boolean;
  horizontal?: boolean;
  color?: RGBA;
}

export interface LineChartOptions {
  title?: string;
  data: number[];
  labels?: string[];
  maxWidth: number;
  maxHeight?: number;
  showPoints?: boolean;
  color?: RGBA;
}

export interface HistogramOptions {
  title?: string;
  data: number[];
  bins?: number;
  maxWidth: number;
  maxHeight?: number;
  color?: RGBA;
}

export interface SparklineOptions {
  data: number[];
  width?: number;
  color?: RGBA;
}

export interface PieChartOptions {
  title?: string;
  data: ChartDataPoint[];
  maxWidth: number;
  showLegend?: boolean;
}

// Helper functions
function normalizeValues(values: number[]): number[] {
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

function getBlockChar(fraction: number): string {
  if (fraction <= 0) return BLOCKS.empty;
  if (fraction >= 1) return BLOCKS.full;
  if (fraction >= 0.875) return BLOCKS.sevenEighths;
  if (fraction >= 0.75) return BLOCKS.threeQuarters;
  if (fraction >= 0.625) return BLOCKS.fiveEighths;
  if (fraction >= 0.5) return BLOCKS.half;
  if (fraction >= 0.375) return BLOCKS.threeEighths;
  if (fraction >= 0.25) return BLOCKS.quarter;
  if (fraction >= 0.125) return BLOCKS.eighth;
  return BLOCKS.empty;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '…';
}

// ============ HORIZONTAL BAR CHART ============
export function renderHorizontalBarChart(options: BarChartOptions): string[] {
  const { title, data, maxWidth, showValues = true, color } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const maxLabelLen = Math.min(12, Math.max(...data.map((d) => d.label.length)));
  const valueWidth = showValues ? formatNumber(maxValue).length + 2 : 0;
  const barMaxWidth = maxWidth - maxLabelLen - 3 - valueWidth;

  for (const point of data) {
    const label = truncateLabel(point.label, maxLabelLen).padEnd(maxLabelLen);
    const normalizedValue = maxValue > 0 ? point.value / maxValue : 0;
    const barWidth = Math.round(normalizedValue * barMaxWidth);
    const bar = BLOCKS.full.repeat(barWidth);
    const valueStr = showValues ? ` ${formatNumber(point.value)}` : '';
    lines.push(`${label} │${bar}${valueStr}`);
  }

  return lines;
}

// ============ VERTICAL BAR CHART ============
export function renderVerticalBarChart(options: BarChartOptions): string[] {
  const { title, data, maxWidth, maxHeight = 10, showValues = true } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values);
  const normalizedValues = normalizeValues(values);

  // Calculate bar width based on available space
  const numBars = data.length;
  const barWidth = Math.max(1, Math.floor((maxWidth - numBars - 1) / numBars));
  const chartHeight = maxHeight;

  // Render bars from top to bottom
  for (let row = chartHeight - 1; row >= 0; row--) {
    let line = '';
    const threshold = row / chartHeight;

    for (let i = 0; i < numBars; i++) {
      const normalizedVal = normalizedValues[i];
      const nextThreshold = (row + 1) / chartHeight;

      let barChar: string;
      if (normalizedVal >= nextThreshold) {
        barChar = BLOCKS.full;
      } else if (normalizedVal > threshold) {
        const fraction = (normalizedVal - threshold) / (1 / chartHeight);
        barChar = getBlockChar(fraction);
      } else {
        barChar = ' ';
      }

      line += barChar.repeat(barWidth) + ' ';
    }
    lines.push(line);
  }

  // X-axis
  lines.push('─'.repeat(numBars * (barWidth + 1)));

  // Labels (truncated)
  const labelLine = data
    .map((d) => truncateLabel(d.label, barWidth).padEnd(barWidth))
    .join(' ');
  lines.push(labelLine);

  // Values if requested
  if (showValues) {
    const valueLine = data
      .map((d) => formatNumber(d.value).padStart(barWidth))
      .join(' ');
    lines.push(valueLine);
  }

  return lines;
}

// ============ LINE CHART (using braille) ============
export function renderLineChart(options: LineChartOptions): string[] {
  const { title, data, labels, maxWidth, maxHeight = 8 } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  // Chart dimensions in braille dots (each char is 2x4 dots)
  const chartWidth = Math.min(maxWidth - 8, data.length); // Reserve space for Y axis
  const chartHeightChars = maxHeight;
  const chartHeightDots = chartHeightChars * 4;

  // Create braille grid
  const grid: number[][] = Array(chartHeightChars)
    .fill(0)
    .map(() => Array(Math.ceil(chartWidth / 2)).fill(BRAILLE.base));

  // Sample data points to fit width
  const sampledData: number[] = [];
  for (let i = 0; i < chartWidth; i++) {
    const dataIdx = Math.floor((i / chartWidth) * data.length);
    sampledData.push(data[dataIdx]);
  }

  // Plot points
  for (let x = 0; x < sampledData.length; x++) {
    const normalizedY = (sampledData[x] - minVal) / range;
    const dotY = Math.floor((1 - normalizedY) * (chartHeightDots - 1));
    const charX = Math.floor(x / 2);
    const charY = Math.floor(dotY / 4);
    const dotInCharX = x % 2;
    const dotInCharY = dotY % 4;

    if (charY >= 0 && charY < chartHeightChars && charX >= 0 && charX < grid[0].length) {
      grid[charY][charX] |= BRAILLE.dots[dotInCharY][dotInCharX];
    }
  }

  // Render with Y axis
  const yAxisWidth = 6;
  for (let row = 0; row < chartHeightChars; row++) {
    let yLabel = '';
    if (row === 0) {
      yLabel = formatNumber(maxVal).padStart(yAxisWidth);
    } else if (row === chartHeightChars - 1) {
      yLabel = formatNumber(minVal).padStart(yAxisWidth);
    } else {
      yLabel = ' '.repeat(yAxisWidth);
    }

    const chartLine = grid[row].map((code) => String.fromCharCode(code)).join('');
    lines.push(`${yLabel} │${chartLine}`);
  }

  // X axis
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(grid[0].length));

  // X labels if provided
  if (labels && labels.length > 0) {
    const firstLabel = labels[0] || '';
    const lastLabel = labels[labels.length - 1] || '';
    const xLabelLine =
      ' '.repeat(yAxisWidth + 2) +
      firstLabel.slice(0, 8) +
      ' '.repeat(Math.max(0, grid[0].length - firstLabel.length - lastLabel.length)) +
      lastLabel.slice(0, 8);
    lines.push(xLabelLine);
  }

  return lines;
}

// ============ SPARKLINE ============
export function renderSparkline(options: SparklineOptions): string {
  const { data, width } = options;

  if (data.length === 0) return '';

  const displayWidth = width || data.length;
  const sampledData: number[] = [];

  // Sample data to fit width
  for (let i = 0; i < displayWidth; i++) {
    const dataIdx = Math.floor((i / displayWidth) * data.length);
    sampledData.push(data[dataIdx]);
  }

  const min = Math.min(...sampledData);
  const max = Math.max(...sampledData);
  const range = max - min || 1;

  return sampledData
    .map((v) => {
      const normalized = (v - min) / range;
      const charIndex = Math.round(normalized * (SPARKLINE_CHARS.length - 1));
      return SPARKLINE_CHARS[charIndex];
    })
    .join('');
}

// ============ HISTOGRAM ============
export function renderHistogram(options: HistogramOptions): string[] {
  const { title, data, bins = 10, maxWidth, maxHeight = 8 } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const binWidth = range / bins;

  // Count values in each bin
  const binCounts: number[] = Array(bins).fill(0);
  for (const value of data) {
    let binIndex = Math.floor((value - min) / binWidth);
    if (binIndex >= bins) binIndex = bins - 1;
    binCounts[binIndex]++;
  }

  // Convert to chart data
  const chartData: ChartDataPoint[] = binCounts.map((count, i) => {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    return {
      label: `${formatNumber(binStart)}-${formatNumber(binEnd)}`,
      value: count,
    };
  });

  // Use vertical bar chart for histogram
  const barLines = renderVerticalBarChart({
    data: chartData,
    maxWidth,
    maxHeight,
    showValues: true,
  });

  lines.push(...barLines);
  return lines;
}

// ============ PIE CHART (ASCII) ============
const PIE_CHARS = ['█', '▓', '▒', '░', '○', '●', '◐', '◑'];
const PIE_COLORS = [
  RGBA.fromHex('#22c55e'),
  RGBA.fromHex('#3b82f6'),
  RGBA.fromHex('#f59e0b'),
  RGBA.fromHex('#ef4444'),
  RGBA.fromHex('#8b5cf6'),
  RGBA.fromHex('#ec4899'),
  RGBA.fromHex('#06b6d4'),
  RGBA.fromHex('#84cc16'),
];

export function renderPieChart(options: PieChartOptions): string[] {
  const { title, data, maxWidth, showLegend = true } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    lines.push('No data (all values are 0)');
    return lines;
  }

  // Calculate percentages
  const percentages = data.map((d) => (d.value / total) * 100);

  // Simple text-based pie representation
  const barWidth = Math.min(40, maxWidth - 20);
  let barLine = '';
  for (let i = 0; i < data.length; i++) {
    const segmentWidth = Math.round((percentages[i] / 100) * barWidth);
    barLine += PIE_CHARS[i % PIE_CHARS.length].repeat(segmentWidth);
  }
  lines.push(`[${barLine}]`);
  lines.push('');

  // Legend
  if (showLegend) {
    for (let i = 0; i < data.length; i++) {
      const char = PIE_CHARS[i % PIE_CHARS.length];
      const pct = percentages[i].toFixed(1);
      const label = truncateLabel(data[i].label, 15);
      lines.push(`  ${char} ${label}: ${formatNumber(data[i].value)} (${pct}%)`);
    }
  }

  return lines;
}

// ============ SCATTER PLOT (ASCII) ============
export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ScatterPlotOptions {
  title?: string;
  data: ScatterPoint[];
  maxWidth: number;
  maxHeight?: number;
}

export function renderScatterPlot(options: ScatterPlotOptions): string[] {
  const { title, data, maxWidth, maxHeight = 10 } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(title);
    lines.push('─'.repeat(Math.min(title.length, maxWidth)));
  }

  if (data.length === 0) {
    lines.push('No data');
    return lines;
  }

  const xValues = data.map((d) => d.x);
  const yValues = data.map((d) => d.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const plotWidth = maxWidth - 8;
  const plotHeight = maxHeight;

  // Create empty grid
  const grid: string[][] = Array(plotHeight)
    .fill(0)
    .map(() => Array(plotWidth).fill(' '));

  // Plot points
  for (const point of data) {
    const x = Math.floor(((point.x - minX) / rangeX) * (plotWidth - 1));
    const y = Math.floor((1 - (point.y - minY) / rangeY) * (plotHeight - 1));
    if (x >= 0 && x < plotWidth && y >= 0 && y < plotHeight) {
      grid[y][x] = '●';
    }
  }

  // Render with Y axis
  const yAxisWidth = 6;
  for (let row = 0; row < plotHeight; row++) {
    let yLabel = '';
    if (row === 0) {
      yLabel = formatNumber(maxY).padStart(yAxisWidth);
    } else if (row === plotHeight - 1) {
      yLabel = formatNumber(minY).padStart(yAxisWidth);
    } else {
      yLabel = ' '.repeat(yAxisWidth);
    }

    const rowLine = grid[row].join('');
    lines.push(`${yLabel} │${rowLine}`);
  }

  // X axis
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(plotWidth));

  // X labels
  const xLabelLine =
    ' '.repeat(yAxisWidth + 2) +
    formatNumber(minX).padEnd(8) +
    ' '.repeat(Math.max(0, plotWidth - 16)) +
    formatNumber(maxX).padStart(8);
  lines.push(xLabelLine);

  return lines;
}

// ============ RENDERABLE CREATORS ============

export function createChartDisplay(
  renderer: CliRenderer,
  artifactPane: ScrollBoxRenderable,
  chartLines: string[],
  chartType: string
): void {
  // Clear existing content
  const children = artifactPane.getChildren();
  for (const child of children) {
    artifactPane.remove(child.id);
  }

  const container = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    padding: 0,
  });

  for (let i = 0; i < chartLines.length; i++) {
    const text = new TextRenderable(renderer, {
      content: chartLines[i],
      width: '100%',
    });

    // Color based on line content
    if (i === 0 && chartLines[i].length > 0 && !chartLines[i].startsWith('─')) {
      // Title
      text.fg = ChartColors.title;
      text.attributes = 1; // bold
    } else if (chartLines[i].includes('│') || chartLines[i].includes('└')) {
      // Axis
      text.fg = ChartColors.axis;
    } else if (chartLines[i].includes(BLOCKS.full) || chartLines[i].includes('█')) {
      // Bar content
      text.fg = ChartColors.bar;
    } else {
      text.fg = ChartColors.label;
    }

    container.add(text);
  }

  artifactPane.add(container);
}
