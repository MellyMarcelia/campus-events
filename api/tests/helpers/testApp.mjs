import { createApp } from '../../src/app.mjs';
import { Event, Registration, sequelize } from '../../src/models/index.mjs';

// .env.test sets DB_STORAGE=:memory:, so the tests never touch your real data.
// Every call empties all tables and builds a fresh app: tests never share state.
export async function createTestApp() {
  await sequelize.sync({ force: true });
  return { app: createApp(), db: { sequelize, Event, Registration } };
}

export const validEvent = (overrides = {}) => ({
  title: 'Backend Bootcamp',
  location: 'Room C101',
  startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  capacity: 10,
  ...overrides
});
