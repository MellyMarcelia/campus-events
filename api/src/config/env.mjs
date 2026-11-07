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
  dbStorage: process.env.DB_STORAGE || './data/events.sqlite',

  // Mail: without SMTP_URL, mails are only written to the log (handy in development).
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'Campus Events <no-reply@campus-events.local>',
  // Kept short on purpose: a slow mail server must never hold on to resources for minutes.
  mailTimeoutMs: toNumber(process.env.MAIL_TIMEOUT_MS, 10_000),

  // Cache: how long a cached GET response may live, as a safety net next to explicit invalidation.
  cacheTtlSeconds: toNumber(process.env.CACHE_TTL_SECONDS, 60)
});
