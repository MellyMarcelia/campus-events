import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.mjs';

// JSON logs: easy to search in the Render log viewer. Silent during tests to keep the output readable.
export const logger = createLogger({
  level: env.logLevel,
  silent: env.isTest,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()]
});
