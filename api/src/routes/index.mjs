import { Router } from 'express';
import { validate } from '../middleware/validate.mjs';
import { createEventSchema, idParamsSchema, registrationSchema, updateEventSchema } from '../validation/schemas.mjs';

// Routes only wire URL + validation → controller. Read this file to see the whole API at a glance.
export function createRouter({ health, events, registrations, stats }) {
  const router = Router();
  const withId = validate({ params: idParamsSchema });

  router.get('/health', health.get);

  router.get('/events', events.list);
  router.post('/events', validate({ body: createEventSchema }), events.create);
  router.get('/events/:id', withId, events.get);
  router.patch('/events/:id', validate({ params: idParamsSchema, body: updateEventSchema }), events.update);
  router.delete('/events/:id', withId, events.remove);

  router.get('/events/:id/registrations', withId, registrations.list);
  router.post('/events/:id/registrations', validate({ params: idParamsSchema, body: registrationSchema }), registrations.create);

  router.get('/stats', stats.get);

  return router;
}
