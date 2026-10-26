import express from 'express';
import cors from 'cors';
import {
  badRequest,
  taskId,
  validateBody,
  validateStatus,
  validateTask,
} from './validation.js';

function found(task, res) {
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  return res.json(task);
}

export function createApp(database, { logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await database.ping();
      res.json({ status: 'ready', database: 'connected' });
    } catch {
      res
        .set('Retry-After', '5')
        .status(503)
        .json({ status: 'not_ready', database: 'unavailable' });
    }
  });

  app.get('/api/tasks', async (_req, res) => res.json(await database.list()));
  app.get('/api/tasks/:id', async (req, res) =>
    found(await database.get(taskId(req.params.id)), res),
  );

  app.post('/api/tasks', async (req, res) => {
    const task = await database.create(
      validateTask(req.body, { creating: true }),
    );
    res.location(`/api/tasks/${task.id}`).status(201).json(task);
  });

  app.put('/api/tasks/:id', async (req, res) => {
    const id = taskId(req.params.id);
    const task = validateTask(req.body);
    return found(await database.update(id, task), res);
  });

  app.patch('/api/tasks/:id/status', async (req, res) => {
    const id = taskId(req.params.id);
    validateBody(req.body, ['status']);
    return found(
      await database.setStatus(id, validateStatus(req.body.status)),
      res,
    );
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    const removed = await database.remove(taskId(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Task not found.' });
    return res.status(204).end();
  });

  app.use((_req, res) =>
    res.status(404).json({ error: 'Endpoint not found.' }),
  );

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed')
      error = badRequest('Request body must be valid JSON.');
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (error.databaseError) {
      logger.error('Database request failed:', error.cause?.code ?? 'UNKNOWN');
      return res.set('Retry-After', '5').status(503).json({
        error: 'Database is unavailable. Check MySQL and try again shortly.',
      });
    }
    if (error.status === 400)
      return res.status(400).json({ error: error.message });
    logger.error('Unexpected API error:', error.name);
    return res
      .status(500)
      .json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
