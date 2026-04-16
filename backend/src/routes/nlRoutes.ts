import express, { Request, Response, NextFunction } from 'express';
import { validateTextInput } from '../middleware/inputValidation.js';
import { routeCommand } from '../services/commandRouter.js';
import { nlpStrategy } from '../app.js';

const router: express.Router = express.Router();

// POST /nl/execute — parse natural-language text and execute the resulting command
router.post('/execute', validateTextInput, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body as { text: string };

    const parsed = await nlpStrategy.parse(text);
    const { apiCall, result } = routeCommand(parsed);

    res.json({
      success: true,
      data: {
        input: text,
        interpretation: {
          intent: parsed.intent,
          confidence: parsed.confidence,
          entities: parsed.entities,
          source: parsed.source,
        },
        apiCall,
        result,
      },
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

export const nlRouter: express.Router = router;
