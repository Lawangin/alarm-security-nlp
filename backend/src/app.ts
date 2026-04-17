import express, { type Express } from 'express';
import cors from 'cors';
import { config } from './shared/config.js';
import { correlationId } from './shared/middleware/correlationId.js';
import { requestLogger } from './shared/middleware/requestLogger.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFoundHandler } from './shared/middleware/notFoundHandler.js';
import { getSystemState } from './modules/system/system.service.js';
import { getUserCount } from './modules/users/users.service.js';
import { systemRouter } from './modules/system/system.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { commandsRouter } from './modules/commands/commands.routes.js';
import type { NlpStrategy } from './nlp/nlpStrategy.js';
import { createNlpStrategy } from './nlp/nlpFactory.js';
import { logger } from './shared/logger.js';

const VALID_STRATEGIES = ['rule-based', 'llm', 'hybrid'] as const;
type StrategyName = (typeof VALID_STRATEGIES)[number];

// Exported so commands.routes.ts can read it (live binding) and tests can set it
export let nlpStrategy: NlpStrategy;
export let currentNlpStrategyName: StrategyName = config.NLP_STRATEGY;

export function setNlpStrategy(strategy: NlpStrategy, name?: StrategyName): void {
  nlpStrategy = strategy;
  if (name) currentNlpStrategyName = name;
}

export const app: Express = express();

// 1. CORS
app.use(cors({ origin: config.CORS_ORIGIN }));

// 2. Correlation ID (must come before request logger)
app.use(correlationId);

// 3. Request logger
app.use(requestLogger);

// 4. Body parser with size limit
app.use(express.json({ limit: '10kb' }));

// 5. Routes
app.use('/api', systemRouter);
app.use('/api', usersRouter);
app.use('/nl', commandsRouter);

app.get('/healthz', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
      nlpStrategy: currentNlpStrategyName,
      nlpReady: nlpStrategy?.isReady() ?? false,
      llmAvailable: Boolean(config.LLM_API_KEY),
      ...getSystemState(),
      userCount: getUserCount(),
    },
    correlationId: req.correlationId,
  });
});

app.post('/api/nlp-strategy', async (req, res, next) => {
  const { strategy } = req.body as { strategy: unknown };
  if (!VALID_STRATEGIES.includes(strategy as StrategyName)) {
    res.status(400).json({
      success: false,
      error: { message: `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(', ')}`, errorCode: 'INVALID_STRATEGY' },
      correlationId: req.correlationId,
    });
    return;
  }
  if ((strategy === 'llm' || strategy === 'hybrid') && !config.LLM_API_KEY) {
    res.status(400).json({
      success: false,
      error: { message: `Strategy '${strategy}' requires LLM_API_KEY to be configured`, errorCode: 'LLM_NOT_CONFIGURED' },
      correlationId: req.correlationId,
    });
    return;
  }
  try {
    const newStrategy = createNlpStrategy(strategy as StrategyName);
    await newStrategy.initialize();
    setNlpStrategy(newStrategy, strategy as StrategyName);
    logger.info({ nlpStrategy: strategy }, 'NLP strategy changed at runtime');
    res.json({ success: true, data: { nlpStrategy: strategy }, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

// 6. 404 handler
app.use(notFoundHandler);

// 7. Error handler (must be last, 4-arg signature required)
app.use(errorHandler);
