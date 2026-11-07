import { conflict } from '../errors/AppError.mjs';
import { logger } from '../lib/logger.mjs';

export function createRegistrationService({ eventService, registrations }) {
  async function assertNotRegistered(eventId, email) {
    const existing = await registrations.findByEventAndEmail(eventId, email);
    if (existing) throw conflict(`${email} is already registered for this event`);
  }

  async function assertHasSeats(event) {
    const count = await registrations.countByEvent(event.id);
    if (count >= event.capacity) throw conflict('Event is full');
  }

  return {
    async listForEvent(eventId) {
      await eventService.getById(eventId); // 404 for an unknown event
      return registrations.findByEvent(eventId);
    },

    async register(eventId, { name, email }) {
      const event = await eventService.getById(eventId);
      await assertNotRegistered(event.id, email);
      await assertHasSeats(event);

      const registration = await registrations.create({ eventId: event.id, name, email });
      logger.info('new registration', { eventId: event.id, registrationId: registration.id });
      return registration;
    }
  };
}
