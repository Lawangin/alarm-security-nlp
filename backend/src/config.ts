import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NLP_STRATEGY: z.enum(['rule-based', 'llm', 'hybrid']).default('rule-based'),
  CORS_ORIGIN: z.string().default('*'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-sonnet-4-6'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
