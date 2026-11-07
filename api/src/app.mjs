// Composition root: the only place that knows which concrete pieces are plugged together.
// createApp() builds a fresh app every call, so tests can pass their own fakes (see tests/helpers).
import express from 'express';
import { createEventController } from './controllers/eventController.mjs';
import { createHealthController } from './controllers/healthController.mjs';
import { createRegistrationController } from './controllers/registrationController.mjs';
import { createStatsController } from './controllers/statsController.mjs';
import { errorHandler, notFoundHandler } from './middleware/errorHandlers.mjs';
import { requestLogger } from './middleware/requestLogger.mjs';
import { eventRepository } from './repositories/eventRepository.mjs';
import { healthRepository } from './repositories/healthRepository.mjs';
import { registrationRepository } from './repositories/registrationRepository.mjs';
import { createRouter } from './routes/index.mjs';
import { createEventService } from './services/eventService.mjs';
import { createHealthService } from './services/healthService.mjs';
import { createRegistrationService } from './services/registrationService.mjs';
import { createStatsService } from './services/statsService.mjs';

function createServices() {
  const repos = { events: eventRepository, registrations: registrationRepository };
  const eventService = createEventService(repos);

  return {
    health: createHealthService({ health: healthRepository }),
    events: eventService,
    registrations: createRegistrationService({ ...repos, eventService }),
    stats: createStatsService(repos)
  };
}

export function createApp() {
  const services = createServices();
  const controllers = {
    health: createHealthController(services.health),
    events: createEventController(services.events),
    registrations: createRegistrationController(services.registrations),
    stats: createStatsController(services.stats)
  };

  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use('/api', createRouter(controllers));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
