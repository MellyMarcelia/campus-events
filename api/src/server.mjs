import { createApp, createDefaultMailer, createMailRetry } from './app.mjs';
import { env } from './config/env.mjs';
import { seedDemoData } from './db/demoData.mjs';
import { logger } from './lib/logger.mjs';
import { Event, sequelize } from './models/index.mjs';

await sequelize.sync();

// First start on a fresh clone: fill the empty database so the UI has something to show.
if ((await Event.count()) === 0) {
  await seedDemoData();
  console.log('Empty database – demo data added');
}

// Retries failed confirmation mails: once at startup (mails may have failed just before a restart),
// then every MAIL_RETRY_INTERVAL_MS. Lives in the API process: no extra worker to deploy.
function startMailRetryJob(mailRetry) {
  const run = () => mailRetry.runOnce().catch((err) => logger.error('mail retry job failed', { error: err.message }));
  run();
  setInterval(run, env.mailRetryIntervalMs);
}

const mailer = createDefaultMailer();

createApp({ mailer }).listen(env.port, () => {
  console.log(`Campus Events API running on http://localhost:${env.port}/api`);
});

startMailRetryJob(createMailRetry({ mailer }));
