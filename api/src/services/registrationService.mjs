import { cacheKeys } from '../cache/cacheKeys.mjs';
import { conflict, eventNotFound } from '../errors/AppError.mjs';
import { logger } from '../lib/logger.mjs';
import { topics } from '../messaging/topics.mjs';

export function confirmationMail(event, registration) {
  const when = new Date(event.startsAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Brussels' });
  return {
    to: registration.email,
    subject: `You are registered for ${event.title}`,
    text: `Hi ${registration.name},\n\nYou are registered for "${event.title}".\nWhen: ${when}\nWhere: ${event.location}\n\nSee you there!\nCampus Events`
  };
}

const alreadyRegistered = (email) => conflict(`${email} is already registered for this event`);

export function createRegistrationService({ eventService, events, registrations, transactions, outbox, outboxRelay, notifications, cache }) {
  async function assertNotRegistered(eventId, email, tx) {
    const existing = await registrations.findByEventAndEmail(eventId, email, tx);
    if (existing) throw alreadyRegistered(email);
  }

  async function assertHasSeats(event, tx) {
    const count = await registrations.countByEvent(event.id, tx);
    if (count >= event.capacity) throw conflict('Event is full');
  }

  // Check and insert in ONE transaction that first locks the event row. Without the lock, requests
  // arriving at the same moment all counted a free seat before any of them inserted (the last
  // seat was sold several times). Now the second request waits, then counts the first one's seat.
  function claimSeat(eventId, { name, email }) {
    return transactions.run(async (tx) => {
      const event = await events.findByIdForUpdate(eventId, tx);
      if (!event) throw eventNotFound(eventId);
      await assertNotRegistered(event.id, email, tx);
      await assertHasSeats(event, tx);

      const registration = await registrations.create({ eventId: event.id, name, email }, tx);
      if (!registration) throw alreadyRegistered(email);
      // Same transaction (outbox pattern): the registration and the mail we owe are saved
      // together or not at all. Sending happens later, outside the request (outboxRelay → mailWorker).
      await outbox.add(topics.confirmationMail, { registrationId: registration.id, mail: confirmationMail(event, registration) }, tx);
      return { event, registration };
    });
  }

  return {
    listForEvent(eventId) {
      return cache.remember(cacheKeys.registrations(eventId), async () => {
        await eventService.getById(eventId); // 404 for an unknown event (errors are never cached)
        return registrations.findByEvent(eventId);
      });
    },

    async register(eventId, { name, email }) {
      const { event, registration } = await claimSeat(eventId, { name, email });
      logger.info('new registration', { eventId: event.id, registrationId: registration.id });
      // The event list holds no counts, so it stays valid; these three show registrations.
      await cache.delete(cacheKeys.event(event.id), cacheKeys.registrations(event.id), cacheKeys.stats);

      // Not awaited: neither a slow broker nor a slow mail provider may delay or fail the 201.
      // If this attempt fails, the relay's next poll publishes the row.
      outboxRelay.kick();
      // Only after the commit, and only once: a refused registration (409) never gets here.
      notifications.registrationCreated(event);
      return registration;
    }
  };
}
