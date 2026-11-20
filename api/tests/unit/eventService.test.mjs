import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryCache } from '../../src/cache/memoryCache.mjs';
import { createEventService } from '../../src/services/eventService.mjs';

const now = new Date('2026-11-20T12:00:00Z');
const event = (id, startsAt) => ({ id, title: `Event ${id}`, startsAt });

// Sorted soonest first, like eventRepository.findAll().
const allEvents = [
  event(1, '2026-11-01T10:00:00Z'),
  event(2, '2026-11-19T10:00:00Z'),
  event(3, '2026-11-20T12:00:00Z'), // starts exactly now: not past yet
  event(4, '2026-12-01T10:00:00Z')
];

function createService() {
  const events = { findAll: async () => allEvents };
  return createEventService({ events, registrations: {}, cache: createMemoryCache({ ttlSeconds: 60 }) });
}

describe('eventService upcoming / past', () => {
  it('lists upcoming events soonest first, including one that starts right now', async () => {
    const upcoming = await createService().listUpcoming(now);
    assert.deepEqual(upcoming.map((e) => e.id), [3, 4]);
  });

  it('lists past events most recent first', async () => {
    const past = await createService().listPast(now);
    assert.deepEqual(past.map((e) => e.id), [2, 1]);
  });
});
