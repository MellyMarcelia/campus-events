// Composition root: the only place that knows which concrete pieces are plugged together.
// createApp() builds a fresh app every call, so tests can pass their own fakes (see tests/helpers).
import express from 'express';
import { createMemoryCache } from './cache/memoryCache.mjs';
import { env } from './config/env.mjs';
import { createEventController } from './controllers/eventController.mjs';
import { createHealthController } from './controllers/healthController.mjs';
import { createMcpController } from './controllers/mcpController.mjs';
import { createRegistrationController } from './controllers/registrationController.mjs';
import { createStatsController } from './controllers/statsController.mjs';
import { logger } from './lib/logger.mjs';
import { createLogMailer } from './mail/logMailer.mjs';
import { createSmtpMailer } from './mail/smtpMailer.mjs';
import { errorHandler, notFoundHandler } from './middleware/errorHandlers.mjs';
import { requestLogger } from './middleware/requestLogger.mjs';
import { eventRepository } from './repositories/eventRepository.mjs';
import { healthRepository } from './repositories/healthRepository.mjs';
import { createMemoryBroker } from './messaging/memoryBroker.mjs';
import { createRabbitBroker } from './messaging/rabbitBroker.mjs';
import { outboxRepository } from './repositories/outboxRepository.mjs';
import { registrationRepository } from './repositories/registrationRepository.mjs';
import { transactions } from './repositories/transactions.mjs';
import { createRouter } from './routes/index.mjs';
import { createEventService } from './services/eventService.mjs';
import { createHealthService } from './services/healthService.mjs';
import { createMailWorker } from './services/mailWorker.mjs';
import { createOutboxRelay } from './services/outboxRelay.mjs';
import { createRegistrationService } from './services/registrationService.mjs';
import { createStatsService } from './services/statsService.mjs';

export function createDefaultMailer() {
  if (!env.smtpUrl) return createLogMailer(logger);
  return createSmtpMailer({ url: env.smtpUrl, from: env.mailFrom, timeoutMs: env.mailTimeoutMs });
}

export function createDefaultBroker() {
  if (env.amqpUrl) return createRabbitBroker({ url: env.amqpUrl, retryDelayMs: env.mailRetryDelayMs });
  if (!env.isTest) logger.warn('no AMQP_URL: using an in-process broker, unsent mails are lost on restart');
  return createMemoryBroker({ retryDelayMs: env.mailRetryDelayMs });
}

function createServices({ cache, outboxRelay }) {
  const repos = { events: eventRepository, registrations: registrationRepository, cache };
  const eventService = createEventService(repos);

  return {
    health: createHealthService({ health: healthRepository }),
    events: eventService,
    registrations: createRegistrationService({ ...repos, transactions, outbox: outboxRepository, outboxRelay, eventService }),
    stats: createStatsService(repos)
  };
}

// Every dependency can be overridden, e.g. createApp({ mailer: fakeMailer }) in tests.
// Each app gets its own cache, so tests never see each other's cached data.
export function createApp({
  mailer = createDefaultMailer(),
  broker = createDefaultBroker(),
  cache = createMemoryCache({ ttlSeconds: env.cacheTtlSeconds })
} = {}) {
  // Mail path: registration + outbox row (one transaction) → relay → broker → worker → mailer.
  const outboxRelay = createOutboxRelay({ outbox: outboxRepository, broker });
  createMailWorker({ broker, mailer }).start().catch((err) => logger.error('mail worker did not start', { error: err.message }));
  const services = createServices({ cache, outboxRelay });
  const controllers = {
    health: createHealthController(services.health),
    events: createEventController(services.events),
    registrations: createRegistrationController(services.registrations),
    stats: createStatsController(services.stats),
    mcp: createMcpController({ events: services.events, registrations: services.registrations })
  };

  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use('/api', createRouter(controllers));
  app.use(notFoundHandler);
  app.use(errorHandler);
  // server.mjs starts the relay's polling; tests call run() to publish without waiting for a timer.
  app.locals.outboxRelay = outboxRelay;
  return app;
}
