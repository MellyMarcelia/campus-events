import { eventNotFound } from '../errors/AppError.mjs';

// Business rules for events. Dependencies are passed in, so tests can swap them.
export function createEventService({ events, registrations }) {
  async function getById(id) {
    const event = await events.findById(id);
    if (!event) throw eventNotFound(id);
    return event;
  }

  return {
    getById,

    list() {
      return events.findAll();
    },

    async getDetail(id) {
      const event = await getById(id);
      const registered = await registrations.countByEvent(id);
      return { ...event, registered, spotsLeft: Math.max(event.capacity - registered, 0) };
    },

    create(data) {
      return events.create(data);
    },

    async update(id, changes) {
      const event = await events.update(id, changes);
      if (!event) throw eventNotFound(id);
      return event;
    },

    async remove(id) {
      const deleted = await events.remove(id);
      if (!deleted) throw eventNotFound(id);
    }
  };
}
