import { initRenderer } from './tui/renderer';
import { createLayout, addChatMessage, Colors } from './tui/layout';
import { InputRenderableEvents, TextRenderable } from '@opentui/core';

async function main() {
  console.log('Starting DataTUI...');

  // Initialize renderer
  const renderer = await initRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    useAlternateScreen: true,
  });

  // Create the layout
  const layout = createLayout(renderer);

  // Add welcome message
  addChatMessage(
    layout.chatPane,
    renderer,
    'assistant',
    'Welcome to DataTUI! I can help you analyze data.\n\nTo get started:\n• Load a dataset: "Load sales.csv"\n• Query data: "Show top 10 customers by revenue"\n• Export results: "Export to results.csv"'
  );

  // Handle input submission
  layout.chatInput.on(InputRenderableEvents.ENTER, () => {
    const message = layout.chatInput.value.trim();
    if (!message) return;

    // Add user message
    addChatMessage(layout.chatPane, renderer, 'user', message);

    // Clear input
    layout.chatInput.value = '';

    // Simulate agent response (placeholder)
    setTimeout(() => {
      addChatMessage(
        layout.chatPane,
        renderer,
        'assistant',
        `I received your message: "${message}"\n\n(LLM integration coming soon)`
      );
    }, 100);
  });

  // Handle Ctrl+C for clean exit
  renderer.keyInput.on('key', (event) => {
    if (event.key === 'c' && event.ctrlKey) {
      renderer.destroy();
      process.exit(0);
    }
  });

  // Start rendering
  renderer.start();

  // Log that we're running
  renderer.console.log('DataTUI started. Press Ctrl+C to exit.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
