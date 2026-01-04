import { z } from 'zod';

const configSchema = z.object({
  openrouterApiKey: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  model: z.string().default('minimax/minimax-m2.1'),
  dataDir: z.string().default('./data'),
  outputDir: z.string().default('./outputs'),
  maxResultRows: z.coerce.number().default(1000),
  previewRows: z.coerce.number().default(200),
  pyTimeout: z.coerce.number().default(10000),
  temperature: z.coerce.number().default(0.2),
  maxIterations: z.coerce.number().default(5),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    openrouterApiKey: Bun.env.OPENROUTER_API_KEY,
    model: Bun.env.DATATUI_MODEL,
    dataDir: Bun.env.DATATUI_DATA_DIR,
    outputDir: Bun.env.DATATUI_OUTPUT_DIR,
    maxResultRows: Bun.env.DATATUI_MAX_RESULT_ROWS,
    previewRows: Bun.env.DATATUI_PREVIEW_ROWS,
    pyTimeout: Bun.env.DATATUI_PY_TIMEOUT,
    temperature: Bun.env.DATATUI_TEMPERATURE,
    maxIterations: Bun.env.DATATUI_MAX_ITERATIONS,
  });
}

// Lazy-loaded config singleton
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
