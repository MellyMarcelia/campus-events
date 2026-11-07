// Composition root: the only place that knows which concrete pieces are plugged together.
// createApp() builds a fresh app every call, so tests can pass their own fakes (see tests/helpers).
import express from 'express';
import { createMemoryCache } from './cache/memoryCache.mjs';
import { env } from './config/env.mjs';
import { createEventController } from './controllers/eventController.mjs';
import { createHealthController } from './controllers/healthController.mjs';
import { createRegistrationController } from './controllers/registrationController.mjs';
import { createStatsController } from './controllers/statsController.mjs';
import { logger } from './lib/logger.mjs';
import { createLogMailer } from './mail/logMailer.mjs';
import { createSmtpMailer } from './mail/smtpMailer.mjs';
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

function createDefaultMailer() {
  if (!env.smtpUrl) return createLogMailer(logger);
  return createSmtpMailer({ url: env.smtpUrl, from: env.mailFrom, timeoutMs: env.mailTimeoutMs });
}

function createServices({ mailer, cache }) {
  const repos = { events: eventRepository, registrations: registrationRepository, cache };
  const eventService = createEventService(repos);

  return {
    health: createHealthService({ health: healthRepository }),
    events: eventService,
    registrations: createRegistrationService({ ...repos, eventService, mailer }),
    stats: createStatsService(repos)
  };
}

// Every dependency can be overridden, e.g. createApp({ mailer: fakeMailer }) in tests.
// Each app gets its own cache, so tests never see each other's cached data.
export function createApp({ mailer = createDefaultMailer(), cache = createMemoryCache({ ttlSeconds: env.cacheTtlSeconds }) } = {}) {
  const services = createServices({ mailer, cache });
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
