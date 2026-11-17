import { cacheKeys } from '../cache/cacheKeys.mjs';
import { conflict, eventNotFound } from '../errors/AppError.mjs';
import { logger } from '../lib/logger.mjs';

export function confirmationMail(event, registration) {
  const when = new Date(event.startsAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Brussels' });
  return {
    to: registration.email,
    subject: `You are registered for ${event.title}`,
    text: `Hi ${registration.name},\n\nYou are registered for "${event.title}".\nWhen: ${when}\nWhere: ${event.location}\n\nSee you there!\nCampus Events`
  };
}

const alreadyRegistered = (email) => conflict(`${email} is already registered for this event`);

export function createRegistrationService({ eventService, events, registrations, transactions, pendingMails, mailer, cache }) {
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
      return { event, registration };
    });
  }

  // Deliberately NOT awaited by register(): the registration is already stored, and a slow or
  // offline mail provider must neither fail it nor delay the response. A failed mail is stored,
  // so the hourly retry job (mailRetryService) sends it later.
  // Promise.resolve().then(...) also catches a mailer that throws synchronously.
  function sendConfirmationInBackground(event, registration) {
    const context = { registrationId: registration.id };
    return Promise.resolve()
      .then(() => mailer.send(confirmationMail(event, registration)))
      .then(() => logger.info('confirmation mail sent', context))
      .catch(async (err) => {
        logger.warn('confirmation mail failed, registration is kept, will retry later', { ...context, error: err.message });
        await pendingMails.add(registration.id, err.message);
      })
      .catch((err) => logger.error('could not store the failed mail for a retry', { ...context, error: err.message }));
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

      sendConfirmationInBackground(event, registration);
      return registration;
    }
  };
}
