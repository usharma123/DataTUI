import {
  BoxRenderable,
  TextRenderable,
  CodeRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  RGBA,
  SyntaxStyle,
} from '@opentui/core';

// Colors for markdown elements
const MarkdownColors = {
  text: RGBA.fromHex('#e0e0e0'),
  heading1: RGBA.fromHex('#6b8afd'),
  heading2: RGBA.fromHex('#22c55e'),
  heading3: RGBA.fromHex('#f59e0b'),
  bold: RGBA.fromHex('#ffffff'),
  italic: RGBA.fromHex('#a5d6a7'),
  code: RGBA.fromHex('#f59e0b'),
  codeBlockBg: RGBA.fromHex('#1a1a24'),
  link: RGBA.fromHex('#3b82f6'),
  listBullet: RGBA.fromHex('#6b8afd'),
  blockquote: RGBA.fromHex('#808080'),
  blockquoteBorder: RGBA.fromHex('#4a4a6a'),
  hr: RGBA.fromHex('#3a3a4a'),
  tableHeader: RGBA.fromHex('#6b8afd'),
  tableBorder: RGBA.fromHex('#3a3a4a'),
};

// Markdown token types
type TokenType =
  | 'heading'
  | 'paragraph'
  | 'code_block'
  | 'code_inline'
  | 'bold'
  | 'italic'
  | 'link'
  | 'list_item'
  | 'blockquote'
  | 'hr'
  | 'table'
  | 'text';

interface Token {
  type: TokenType;
  content: string;
  level?: number; // For headings (1-6) and list nesting
  language?: string; // For code blocks
  url?: string; // For links
  children?: Token[];
  rows?: string[][]; // For tables
  headers?: string[]; // For tables
}

// Simple markdown parser
function parseMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      tokens.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      tokens.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      tokens.push({
        type: 'code_block',
        content: codeLines.join('\n'),
        language: language || undefined,
      });
      i++; // Skip closing ```
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].slice(1).trim());
        i++;
      }
      tokens.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const listItems: Token[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        const itemMatch = lines[i].match(/^(\s*)[-*+]\s+(.+)$/);
        if (itemMatch) {
          const indent = itemMatch[1].length;
          const level = Math.floor(indent / 2);
          listItems.push({
            type: 'list_item',
            content: itemMatch[2],
            level,
          });
        }
        i++;
      }
      tokens.push(...listItems);
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const listItems: Token[] = [];
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        const itemMatch = lines[i].match(/^(\s*)\d+\.\s+(.+)$/);
        if (itemMatch) {
          const indent = itemMatch[1].length;
          const level = Math.floor(indent / 2);
          listItems.push({
            type: 'list_item',
            content: itemMatch[2],
            level,
          });
        }
        i++;
      }
      tokens.push(...listItems);
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1])) {
      const tableLines: string[] = [line];
      i++;
      // Skip separator
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      const headers = parseTableRow(tableLines[0]);
      const rows = tableLines.slice(1).map(parseTableRow);

      tokens.push({
        type: 'table',
        content: '',
        headers,
        rows,
      });
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('>') &&
      !/^[\s]*[-*+]\s/.test(lines[i]) &&
      !/^[\s]*\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    tokens.push({
      type: 'paragraph',
      content: paragraphLines.join(' '),
    });
  }

  return tokens;
}

function parseTableRow(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '');
}

// Parse inline formatting (bold, italic, code, links)
interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

function parseInlineFormatting(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      segments.push({ text: codeMatch[1], code: true });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/);
    if (boldMatch) {
      segments.push({ text: boldMatch[1], bold: true });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      segments.push({ text: italicMatch[1], italic: true });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      segments.push({ text: linkMatch[1], link: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text until next special character
    const nextSpecial = remaining.search(/[`*_\[]/);
    if (nextSpecial === -1) {
      segments.push({ text: remaining });
      break;
    } else if (nextSpecial === 0) {
      // Special char not part of formatting, treat as text
      segments.push({ text: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      segments.push({ text: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return segments;
}

// Render inline formatted text to a BoxRenderable
function renderInlineText(
  renderer: CliRenderer,
  segments: InlineSegment[],
  baseColor: RGBA = MarkdownColors.text
): TextRenderable {
  // For simplicity, we'll render as plain text with the formatting indicators
  // A more advanced version would use TextNode children
  let fullText = '';
  for (const seg of segments) {
    fullText += seg.text;
  }

  const text = new TextRenderable(renderer, {
    content: fullText,
    width: '100%',
    wrapMode: 'word',
  });
  text.fg = baseColor;

  // Apply formatting based on first segment's style (simplified)
  if (segments.length > 0) {
    if (segments[0].bold) {
      text.attributes = 1; // bold
    } else if (segments[0].italic) {
      text.attributes = 2; // italic
    } else if (segments[0].code) {
      text.fg = MarkdownColors.code;
    } else if (segments[0].link) {
      text.fg = MarkdownColors.link;
      text.attributes = 4; // underline
    }
  }

  return text;
}

// Main markdown render function
export function renderMarkdown(
  renderer: CliRenderer,
  container: BoxRenderable | ScrollBoxRenderable,
  markdown: string,
  maxWidth: number = 80
): void {
  const tokens = parseMarkdown(markdown);

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const headingText = new TextRenderable(renderer, {
          content: token.content,
          width: '100%',
        });

        switch (token.level) {
          case 1:
            headingText.fg = MarkdownColors.heading1;
            headingText.attributes = 1; // bold
            break;
          case 2:
            headingText.fg = MarkdownColors.heading2;
            headingText.attributes = 1;
            break;
          case 3:
            headingText.fg = MarkdownColors.heading3;
            headingText.attributes = 1;
            break;
          default:
            headingText.fg = MarkdownColors.text;
            headingText.attributes = 1;
        }

        container.add(headingText);

        // Add underline for h1/h2
        if (token.level && token.level <= 2) {
          const underlineChar = token.level === 1 ? '═' : '─';
          const underline = new TextRenderable(renderer, {
            content: underlineChar.repeat(Math.min(token.content.length, maxWidth)),
          });
          underline.fg = token.level === 1 ? MarkdownColors.heading1 : MarkdownColors.heading2;
          container.add(underline);
        }

        // Spacing
        const spacer = new TextRenderable(renderer, { content: '' });
        container.add(spacer);
        break;
      }

      case 'paragraph': {
        const segments = parseInlineFormatting(token.content);
        const text = renderInlineText(renderer, segments);
        container.add(text);

        const spacer = new TextRenderable(renderer, { content: '' });
        container.add(spacer);
        break;
      }

      case 'code_block': {
        // Create code block with background
        const codeBox = new BoxRenderable(renderer, {
          width: '100%',
          backgroundColor: MarkdownColors.codeBlockBg,
          padding: 1,
          marginTop: 1,
          marginBottom: 1,
        });

        // Try to use CodeRenderable for syntax highlighting
        if (token.language) {
          try {
            const syntaxStyle = SyntaxStyle.create();
            const code = new CodeRenderable(renderer, {
              content: token.content,
              filetype: token.language,
              syntaxStyle,
              width: '100%',
            });
            code.fg = MarkdownColors.code;
            codeBox.add(code);
          } catch {
            // Fallback to plain text
            const codeText = new TextRenderable(renderer, {
              content: token.content,
              width: '100%',
            });
            codeText.fg = MarkdownColors.code;
            codeBox.add(codeText);
          }
        } else {
          const codeText = new TextRenderable(renderer, {
            content: token.content,
            width: '100%',
          });
          codeText.fg = MarkdownColors.code;
          codeBox.add(codeText);
        }

        container.add(codeBox);
        break;
      }

      case 'blockquote': {
        const quoteBox = new BoxRenderable(renderer, {
          width: '100%',
          flexDirection: 'row',
          marginTop: 1,
          marginBottom: 1,
        });

        const border = new TextRenderable(renderer, {
          content: '│ ',
        });
        border.fg = MarkdownColors.blockquoteBorder;

        const quoteText = new TextRenderable(renderer, {
          content: token.content,
          width: '100%',
          wrapMode: 'word',
        });
        quoteText.fg = MarkdownColors.blockquote;
        quoteText.attributes = 2; // italic

        quoteBox.add(border);
        quoteBox.add(quoteText);
        container.add(quoteBox);
        break;
      }

      case 'list_item': {
        const indent = '  '.repeat(token.level || 0);
        const bullet = token.level && token.level > 0 ? '○' : '•';
        const segments = parseInlineFormatting(token.content);

        const itemBox = new BoxRenderable(renderer, {
          width: '100%',
          flexDirection: 'row',
        });

        const bulletText = new TextRenderable(renderer, {
          content: `${indent}${bullet} `,
        });
        bulletText.fg = MarkdownColors.listBullet;

        const itemText = renderInlineText(renderer, segments);

        itemBox.add(bulletText);
        itemBox.add(itemText);
        container.add(itemBox);
        break;
      }

      case 'hr': {
        const hr = new TextRenderable(renderer, {
          content: '─'.repeat(maxWidth),
        });
        hr.fg = MarkdownColors.hr;
        container.add(hr);

        const spacer = new TextRenderable(renderer, { content: '' });
        container.add(spacer);
        break;
      }

      case 'table': {
        if (!token.headers || !token.rows) break;

        const tableBox = new BoxRenderable(renderer, {
          width: '100%',
          flexDirection: 'column',
          marginTop: 1,
          marginBottom: 1,
        });

        // Calculate column widths
        const numCols = token.headers.length;
        const colWidths: number[] = token.headers.map((h) => h.length);
        for (const row of token.rows) {
          for (let i = 0; i < row.length && i < numCols; i++) {
            colWidths[i] = Math.max(colWidths[i], row[i].length);
          }
        }

        // Limit column widths
        const maxColWidth = Math.floor((maxWidth - numCols - 1) / numCols);
        const finalWidths = colWidths.map((w) => Math.min(w, maxColWidth));

        // Header row
        const headerRow = token.headers
          .map((h, i) => h.slice(0, finalWidths[i]).padEnd(finalWidths[i]))
          .join('│');
        const headerText = new TextRenderable(renderer, {
          content: '│' + headerRow + '│',
        });
        headerText.fg = MarkdownColors.tableHeader;
        headerText.attributes = 1;
        tableBox.add(headerText);

        // Separator
        const separator = finalWidths.map((w) => '─'.repeat(w)).join('┼');
        const sepText = new TextRenderable(renderer, {
          content: '├' + separator + '┤',
        });
        sepText.fg = MarkdownColors.tableBorder;
        tableBox.add(sepText);

        // Data rows
        for (const row of token.rows) {
          const rowStr = row
            .map((cell, i) => {
              const width = finalWidths[i] || 10;
              return cell.slice(0, width).padEnd(width);
            })
            .join('│');
          const rowText = new TextRenderable(renderer, {
            content: '│' + rowStr + '│',
          });
          rowText.fg = MarkdownColors.text;
          tableBox.add(rowText);
        }

        // Bottom border
        const bottomBorder = finalWidths.map((w) => '─'.repeat(w)).join('┴');
        const bottomText = new TextRenderable(renderer, {
          content: '└' + bottomBorder + '┘',
        });
        bottomText.fg = MarkdownColors.tableBorder;
        tableBox.add(bottomText);

        container.add(tableBox);
        break;
      }
    }
  }
}

// Convenience function to render markdown in chat pane
export function addMarkdownMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  role: 'user' | 'assistant',
  markdown: string
): BoxRenderable {
  const messageBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const roleLabel = new TextRenderable(renderer, {
    content: role === 'user' ? 'You:' : 'Agent:',
  });
  roleLabel.fg = role === 'user' ? RGBA.fromHex('#7dd3fc') : RGBA.fromHex('#a5d6a7');
  roleLabel.attributes = 1; // Bold

  messageBox.add(roleLabel);

  // Create a content box for the markdown
  const contentBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    paddingLeft: 1,
  });

  renderMarkdown(renderer, contentBox, markdown, 60);
  messageBox.add(contentBox);
  chatPane.add(messageBox);

  return messageBox;
}
