import {
  BoxRenderable,
  type CliRenderer,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable,
  InputRenderable,
} from '@opentui/core';

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
};

export interface LayoutComponents {
  root: BoxRenderable;
  chatPane: ScrollBoxRenderable;
  chatInput: InputRenderable;
  artifactPane: ScrollBoxRenderable;
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
  artifactPlaceholder.content.fg = Colors.textDim;

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
    content: 'Datasets: 0 │ SANDBOX: NO NETWORK │ Ready',
    flexGrow: 1,
  });
  statusText.content.fg = Colors.textDim;

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
    statusBar,
    statusText,
  };
}

export function addChatMessage(
  chatPane: ScrollBoxRenderable,
  renderer: CliRenderer,
  role: 'user' | 'assistant',
  content: string
): void {
  const messageBox = new BoxRenderable(renderer, {
    width: '100%',
    flexDirection: 'column',
    marginBottom: 1,
  });

  const roleLabel = new TextRenderable(renderer, {
    content: role === 'user' ? 'You:' : 'Agent:',
  });
  roleLabel.content.fg = role === 'user' ? Colors.user : Colors.assistant;
  roleLabel.content.attributes = 1; // Bold

  const messageText = new TextRenderable(renderer, {
    content: content,
    width: '100%',
  });
  messageText.content.fg = Colors.text;

  messageBox.add(roleLabel);
  messageBox.add(messageText);
  chatPane.add(messageBox);
}
