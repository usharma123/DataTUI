import { createCliRenderer, type CliRenderer, type CliRendererConfig } from '@opentui/core';

export interface RendererOptions {
  exitOnCtrlC?: boolean;
  useMouse?: boolean;
  useAlternateScreen?: boolean;
}

export async function initRenderer(options: RendererOptions = {}): Promise<CliRenderer> {
  const config: CliRendererConfig = {
    exitOnCtrlC: options.exitOnCtrlC ?? true,
    useMouse: options.useMouse ?? true,
    useAlternateScreen: options.useAlternateScreen ?? true,
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
      events: true,
    },
  };

  const renderer = await createCliRenderer(config);
  return renderer;
}
