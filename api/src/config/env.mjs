// The only file that reads process.env. Everything else imports `env` from here,
// so all settings and their defaults are visible in one place.

// Tests get their settings from .env.test (via `node --env-file`); a developer's
// local .env must never leak into them.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile();
  } catch {
    // no .env: the defaults below are fine for local development
  }
}

const toNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' ? number : fallback;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: toNumber(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  // Production: a managed Postgres (DATABASE_URL), because the hosting disk is wiped on every restart.
  // Without DATABASE_URL: SQLite in DB_STORAGE, so tests and local development need no database server.
  databaseUrl: process.env.DATABASE_URL || '',
  // Hosted Postgres (Neon, Render) only accepts TLS. Set DATABASE_SSL=false for a local Postgres.
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  dbStorage: process.env.DB_STORAGE || './data/events.sqlite',

  // Mail: without SMTP_URL, mails are only written to the log (handy in development).
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'Campus Events <no-reply@campus-events.local>',
  // Kept short on purpose: a slow mail server must never hold on to resources for minutes.
  mailTimeoutMs: toNumber(process.env.MAIL_TIMEOUT_MS, 10_000),
  // A mail that failed waits this long in the retry queue before the worker tries it again.
  mailRetryDelayMs: toNumber(process.env.MAIL_RETRY_DELAY_MS, 60_000),

  // RabbitMQ (e.g. a free CloudAMQP instance). Without it, an in-process broker is used:
  // fine for development and tests, but messages in it are lost when the process stops.
  amqpUrl: process.env.AMQP_URL || '',
  // How often the outbox relay looks for messages that could not be published right away.
  outboxPollIntervalMs: toNumber(process.env.OUTBOX_POLL_INTERVAL_MS, 5000),

  // The frontend's origin (e.g. https://campus-events-web-6ogn.onrender.com), allowed to open the
  // live notification stream directly. Empty: same-origin only (local development via Vite).
  notificationsAllowedOrigin: process.env.NOTIFICATIONS_ALLOWED_ORIGIN || '',

  // Cache: how long a cached GET response may live, as a safety net next to explicit invalidation.
  cacheTtlSeconds: toNumber(process.env.CACHE_TTL_SECONDS, 60)
});
