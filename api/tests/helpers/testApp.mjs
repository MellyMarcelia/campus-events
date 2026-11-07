import { createApp } from '../../src/app.mjs';
import { Event, Registration, sequelize } from '../../src/models/index.mjs';

// .env.test sets DB_STORAGE=:memory:, so the tests never touch your real data.
// Every call empties all tables and builds a fresh app: tests never share state.
// Pass overrides to swap a dependency, e.g. createTestApp({ mailer: failingMailer }).
export async function createTestApp(overrides = {}) {
  await sequelize.sync({ force: true });
  return { app: createApp({ mailer: fakeMailer(), ...overrides }), db: { sequelize, Event, Registration } };
}

// Records mails instead of sending them, so tests never need a mail server.
export function fakeMailer() {
  const sent = [];
  return { sent, send: async (mail) => void sent.push(mail) };
}

export const validEvent = (overrides = {}) => ({
  title: 'Backend Bootcamp',
  location: 'Room C101',
  startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  capacity: 10,
  ...overrides
});
