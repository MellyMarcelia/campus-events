import { cacheKeys } from '../cache/cacheKeys.mjs';
import { eventNotFound } from '../errors/AppError.mjs';

// Business rules for events. Dependencies are passed in, so tests can swap them.
// Reads go through the cache; every write invalidates exactly the keys whose data it changes,
// and always AFTER the database write, so the next read reloads fresh data.
export function createEventService({ events, registrations, cache }) {
  async function getById(id) {
    const event = await events.findById(id);
    if (!event) throw eventNotFound(id);
    return event;
  }

  async function loadDetail(id) {
    const event = await getById(id);
    const registered = await registrations.countByEvent(id);
    return { ...event, registered, spotsLeft: Math.max(event.capacity - registered, 0) };
  }

  function list() {
    return cache.remember(cacheKeys.eventList, () => events.findAll());
  }

  // Same rule as 'past' in statsService: an event is past once its start time has gone by.
  // Filtered from the cached list (sorted soonest first), so no extra queries.
  const hasStarted = (event, now) => new Date(event.startsAt) < now;

  return {
    // Uncached on purpose: used by other services right before a write, where stale data is not OK.
    getById,

    list,

    async listUpcoming(now = new Date()) {
      return (await list()).filter((event) => !hasStarted(event, now));
    },

    // Most recent first: "what happened lately" is what people ask about.
    async listPast(now = new Date()) {
      return (await list()).filter((event) => hasStarted(event, now)).reverse();
    },

    getDetail(id) {
      return cache.remember(cacheKeys.event(id), () => loadDetail(id));
    },

    async create(data) {
      const event = await events.create(data);
      await cache.delete(cacheKeys.eventList, cacheKeys.stats);
      return event;
    },

    async update(id, changes) {
      const event = await events.update(id, changes);
      if (!event) throw eventNotFound(id);
      await cache.delete(cacheKeys.eventList, cacheKeys.event(id), cacheKeys.stats);
      return event;
    },

    async remove(id) {
      const deleted = await events.remove(id);
      if (!deleted) throw eventNotFound(id);
      // Its registrations were deleted too (ON DELETE CASCADE).
      await cache.delete(cacheKeys.eventList, cacheKeys.event(id), cacheKeys.registrations(id), cacheKeys.stats);
    }
  };
}
