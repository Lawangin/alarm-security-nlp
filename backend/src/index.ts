import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { correlationId } from './middleware/correlationId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { getSystemStatus } from './services/securityService.js';
import { apiRouter } from './routes/apiRoutes.js';

const app = express();

// 1. CORS
app.use(cors({ origin: config.CORS_ORIGIN }));

// 2. Correlation ID (must come before request logger)
app.use(correlationId);

// 3. Request logger
app.use(requestLogger);

// 4. Body parser with size limit
app.use(express.json({ limit: '10kb' }));

// 5. Routes
app.use('/api', apiRouter);

app.get('/healthz', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
      nlpStrategy: config.NLP_STRATEGY,
      nlpReady: false, // updated in Phase 5 after NLP init
      ...getSystemStatus(),
    },
    correlationId: req.correlationId,
  });
});

// 6. 404 handler
app.use(notFoundHandler);

// 7. Error handler (must be last, 4-arg signature required)
app.use(errorHandler);

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, nlpStrategy: config.NLP_STRATEGY }, 'backend listening');
});
