import { createApp } from './app.mjs';
import { env } from './config/env.mjs';
import { seedDemoData } from './db/demoData.mjs';
import { Event, sequelize } from './models/index.mjs';

await sequelize.sync();

// First start on a fresh clone: fill the empty database so the UI has something to show.
if ((await Event.count()) === 0) {
  await seedDemoData();
  console.log('Empty database – demo data added');
}

const app = createApp();

app.listen(env.port, () => {
  console.log(`Campus Events API running on http://localhost:${env.port}/api`);
});

// Registrations kick the outbox relay themselves. This poll catches what that missed: rows left
// behind by a crash, or written while RabbitMQ was down. Once now (a restart may have left some),
// then every OUTBOX_POLL_INTERVAL_MS.
const { outboxRelay } = app.locals;
outboxRelay.kick();
setInterval(outboxRelay.kick, env.outboxPollIntervalMs);
