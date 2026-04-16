import { app, setNlpStrategy } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createNlpStrategy } from './nlp/nlpFactory.js';

async function start(): Promise<void> {
  const strategy = createNlpStrategy();
  logger.info({ nlpStrategy: config.NLP_STRATEGY }, 'training NLP model...');
  await strategy.initialize();
  setNlpStrategy(strategy);
  logger.info('NLP model ready');

  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, nlpStrategy: config.NLP_STRATEGY }, 'backend listening');
  });
}

start().catch((err) => {
  logger.error(err, 'failed to start server');
  process.exit(1);
});
