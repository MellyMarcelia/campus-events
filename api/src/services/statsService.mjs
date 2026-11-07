import { cacheKeys } from '../cache/cacheKeys.mjs';

// Pure function: easy to unit test, no database needed.
export function eventStatus(event, registered, now) {
  if (registered >= event.capacity) return 'full';
  if (new Date(event.startsAt) < now) return 'past';
  return 'open';
}

const occupancy = (registered, capacity) => `${capacity > 0 ? Math.round((registered / capacity) * 100) : 0}%`;

// 'past' depends on the clock, not only on writes: a cached row can say 'open' for at most
// CACHE_TTL_SECONDS after an event started. Acceptable for a dashboard.
export function createStatsService({ events, registrations, cache }) {
  async function loadStats(now) {
    const [allEvents, counts] = await Promise.all([events.findAll({ orderBy: 'id' }), registrations.countPerEvent()]);

    return allEvents.map((event) => {
      const registered = counts.get(event.id) ?? 0;
      return {
        id: event.id,
        title: event.title,
        registered,
        capacity: event.capacity,
        occupancy: occupancy(registered, event.capacity),
        status: eventStatus(event, registered, now)
      };
    });
  }

  return {
    getStats(now = new Date()) {
      return cache.remember(cacheKeys.stats, () => loadStats(now));
    }
  };
}
