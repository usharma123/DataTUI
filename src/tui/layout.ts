import {
  BoxRenderable,
  type CliRenderer,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable,
  InputRenderable,
} from '@opentui/core';
import { renderMarkdown } from './components/markdown';

// Color palette
export const Colors = {
  background: RGBA.fromHex('#0a0a0f'),
  paneBg: RGBA.fromHex('#12121a'),
  border: RGBA.fromHex('#2a2a3a'),
  borderFocused: RGBA.fromHex('#4a4a6a'),
  text: RGBA.fromHex('#e0e0e0'),
  textDim: RGBA.fromHex('#808080'),
  accent: RGBA.fromHex('#6b8afd'),
  user: RGBA.fromHex('#7dd3fc'),
  assistant: RGBA.fromHex('#a5d6a7'),
  statusBg: RGBA.fromHex('#1a1a24'),
  warning: RGBA.fromHex('#fbbf24'),
  error: RGBA.fromHex('#ef4444'),
  success: RGBA.fromHex('#22c55e'),
  toolRunning: RGBA.fromHex('#f59e0b'),
};

export interface LayoutComponents {
  root: BoxRenderable;
  chatPane: ScrollBoxRenderable;
  chatInput: InputRenderable;
  artifactPane: ScrollBoxRenderable;
  artifactContainer: BoxRenderable;
  statusBar: BoxRenderable;
  statusText: TextRenderable;
}

export function createLayout(renderer: CliRenderer): LayoutComponents {
  // Main container - horizontal split
  const root = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    backgroundColor: Colors.background,
  });

  // Top section: chat + artifacts
  const topSection = new BoxRenderable(renderer, {
    flexDirection: 'row',
    flexGrow: 1,
    width: '100%',
  });

  // Left pane: Chat
  const chatContainer = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '50%',
    height: '100%',
    border: true,
    borderColor: Colors.border,
    borderStyle: 'single',
    backgroundColor: Colors.paneBg,
    title: ' Chat ',
    titleAlignment: 'left',
  });

  // Chat messages scroll area
  const chatPane = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    width: '100%',
    scrollY: true,
    scrollX: false,
    stickyScroll: true,
    stickyStart: 'bottom',
    contentOptions: {
      flexDirection: 'column',
      padding: 1,
      gap: 1,
    },
  });

  // Chat input at bottom
  const chatInputContainer = new BoxRenderable(renderer, {
    height: 3,
    width: '100%',
    padding: 1,
    paddingTop: 0,
  });

  const chatInput = new InputRenderable(renderer, {
    width: '100%',
    height: 1,
    placeholder: 'Type your message...',
    backgroundColor: Colors.background,
    textColor: Colors.text,
    focusedBackgroundColor: Colors.background,
    focusedTextColor: Colors.text,
    placeholderColor: Colors.textDim,
    cursorColor: Colors.accent,
  });

  chatInputContainer.add(chatInput);
  chatContainer.add(chatPane);
  chatContainer.add(chatInputContainer);

  // Right pane: Artifacts
  const artifactContainer = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '50%',
    height: '100%',
    border: true,
    borderColor: Colors.border,
    borderStyle: 'single',
    backgroundColor: Colors.paneBg,
    title: ' Artifacts ',
    titleAlignment: 'left',
  });

  const artifactPane = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    width: '100%',
    scrollY: true,
    scrollX: true,
    contentOptions: {
      flexDirection: 'column',
      padding: 1,
    },
  });

  // Placeholder text for artifacts
  const artifactPlaceholder = new TextRenderable(renderer, {
    content: 'No artifacts yet. Load a dataset to get started.',
    width: '100%',
  });
  artifactPlaceholder.fg = Colors.textDim;

  artifactPane.add(artifactPlaceholder);
  artifactContainer.add(artifactPane);

  // Assemble top section
  topSection.add(chatContainer);
  topSection.add(artifactContainer);

  // Status bar at bottom
  const statusBar = new BoxRenderable(renderer, {
    height: 1,
    width: '100%',
    flexDirection: 'row',
    backgroundColor: Colors.statusBg,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const statusText = new TextRenderable(renderer, {
    content: 'Datasets: 0 | Ready',
    flexGrow: 1,
  });
  statusText.fg = Colors.textDim;

  statusBar.add(statusText);

  // Assemble root
  root.add(topSection);
  root.add(statusBar);

  // Add to renderer
  renderer.root.add(root);

  // Focus input by default
  chatInput.focus();

  return {
    root,
    chatPane,
    chatInput,
    artifactPane,
    artifactContainer,
    statusBar,
    statusText,
  };
}

export function addChatMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  role: 'user' | 'assistant',
  content: string
): BoxRenderable {
  const messageBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const roleLabel = new TextRenderable(renderer, {
    content: role === 'user' ? 'You:' : 'Agent:',
  });
  roleLabel.fg = role === 'user' ? Colors.user : Colors.assistant;
  roleLabel.attributes = 1; // Bold

  const messageText = new TextRenderable(renderer, {
    content: content,
    width: '100%',
  });
  messageText.fg = Colors.text;

  messageBox.add(roleLabel);
  messageBox.add(messageText);
  chatPane.add(messageBox);

  return messageBox;
}

// Create a streaming message that can be appended to
export interface StreamingMessage {
  box: BoxRenderable;
  textRef: TextRenderable;
  currentContent: string;
}

export function createStreamingMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer
): StreamingMessage {
  const messageBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const roleLabel = new TextRenderable(renderer, {
    content: 'Agent:',
  });
  roleLabel.fg = Colors.assistant;
  roleLabel.attributes = 1; // Bold

  const messageText = new TextRenderable(renderer, {
    content: '',
    width: '100%',
  });
  messageText.fg = Colors.text;

  messageBox.add(roleLabel);
  messageBox.add(messageText);
  chatPane.add(messageBox);

  return {
    box: messageBox,
    textRef: messageText,
    currentContent: '',
  };
}

export function appendToStreamingMessage(streamingMsg: StreamingMessage, content: string): void {
  streamingMsg.currentContent += content;
  streamingMsg.textRef.content = streamingMsg.currentContent;
}

// Tool execution indicator
export function addToolIndicator(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  toolName: string,
  status: 'running' | 'success' | 'error',
  verbose: boolean = false,
  args?: Record<string, unknown>
): BoxRenderable {
  const indicatorBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 0,
  });

  const statusIcon = status === 'running' ? '\u25B6' : status === 'success' ? '\u2714' : '\u2718';
  const statusColor =
    status === 'running' ? Colors.toolRunning : status === 'success' ? Colors.success : Colors.error;

  let indicatorText = `[${statusIcon} ${toolName}]`;
  if (verbose && args) {
    const argStr = JSON.stringify(args);
    indicatorText += ` ${argStr.length > 50 ? argStr.slice(0, 47) + '...' : argStr}`;
  }

  const text = new TextRenderable(renderer, {
    content: indicatorText,
  });
  text.fg = statusColor;

  indicatorBox.add(text);
  chatPane.add(indicatorBox);

  return indicatorBox;
}

export function updateToolIndicator(
  indicatorBox: BoxRenderable,
  renderer: CliRenderer,
  toolName: string,
  status: 'success' | 'error'
): void {
  // Remove old content
  const children = indicatorBox.getChildren();
  for (const child of children) {
    indicatorBox.remove(child.id);
  }

  const statusIcon = status === 'success' ? '\u2714' : '\u2718';
  const statusColor = status === 'success' ? Colors.success : Colors.error;

  const text = new TextRenderable(renderer, {
    content: `[${statusIcon} ${toolName}]`,
  });
  text.fg = statusColor;

  indicatorBox.add(text);
}

// Error message display
export function addErrorMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  error: string
): BoxRenderable {
  const errorBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const errorLabel = new TextRenderable(renderer, {
    content: 'Error:',
  });
  errorLabel.fg = Colors.error;
  errorLabel.attributes = 1; // Bold

  const errorText = new TextRenderable(renderer, {
    content: error,
    width: '100%',
  });
  errorText.fg = Colors.error;

  errorBox.add(errorLabel);
  errorBox.add(errorText);
  chatPane.add(errorBox);

  return errorBox;
}

// Status bar update
export interface StatusInfo {
  datasetCount: number;
  artifactId?: string;
  pageInfo?: string;
  processing?: boolean;
}

export function updateStatusBar(statusText: TextRenderable, info: StatusInfo): void {
  const parts: string[] = [];

  parts.push(`Datasets: ${info.datasetCount}`);

  if (info.artifactId) {
    parts.push(`Artifact: ${info.artifactId}`);
  }

  if (info.pageInfo) {
    parts.push(`Page: ${info.pageInfo}`);
  }

  if (info.processing) {
    parts.push('Processing...');
  } else {
    parts.push('Ready');
  }

  statusText.content = parts.join(' | ');
}

// Update artifact pane title
export function updateArtifactTitle(artifactContainer: BoxRenderable, title: string): void {
  artifactContainer.title = ` ${title} `;
}

// Add markdown-formatted chat message (for assistant responses)
export function addMarkdownChatMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  role: 'user' | 'assistant',
  content: string
): BoxRenderable {
  const messageBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const roleLabel = new TextRenderable(renderer, {
    content: role === 'user' ? 'You:' : 'Agent:',
  });
  roleLabel.fg = role === 'user' ? Colors.user : Colors.assistant;
  roleLabel.attributes = 1; // Bold

  messageBox.add(roleLabel);

  // For assistant messages, render as markdown
  if (role === 'assistant') {
    const contentBox = new BoxRenderable(renderer, {
      width: '100%',
      flexDirection: 'column',
      paddingLeft: 1,
    });
    renderMarkdown(renderer, contentBox, content, 50);
    messageBox.add(contentBox);
  } else {
    const messageText = new TextRenderable(renderer, {
      content: content,
      width: '100%',
    });
    messageText.fg = Colors.text;
    messageBox.add(messageText);
  }

  chatPane.add(messageBox);
  return messageBox;
}
