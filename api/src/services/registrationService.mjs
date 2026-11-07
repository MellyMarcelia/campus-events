import { conflict } from '../errors/AppError.mjs';
import { logger } from '../lib/logger.mjs';

export function confirmationMail(event, registration) {
  const when = new Date(event.startsAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Brussels' });
  return {
    to: registration.email,
    subject: `You are registered for ${event.title}`,
    text: `Hi ${registration.name},\n\nYou are registered for "${event.title}".\nWhen: ${when}\nWhere: ${event.location}\n\nSee you there!\nCampus Events`
  };
}

export function createRegistrationService({ eventService, registrations, mailer }) {
  async function assertNotRegistered(eventId, email) {
    const existing = await registrations.findByEventAndEmail(eventId, email);
    if (existing) throw conflict(`${email} is already registered for this event`);
  }

  async function assertHasSeats(event) {
    const count = await registrations.countByEvent(event.id);
    if (count >= event.capacity) throw conflict('Event is full');
  }

  // Deliberately NOT awaited by register(): the registration is already stored, and a slow or
  // offline mail provider must neither fail it nor delay the response. Failures are logged instead.
  // Promise.resolve().then(...) also catches a mailer that throws synchronously.
  function sendConfirmationInBackground(event, registration) {
    return Promise.resolve()
      .then(() => mailer.send(confirmationMail(event, registration)))
      .then(() => logger.info('confirmation mail sent', { registrationId: registration.id }))
      .catch((err) => logger.warn('confirmation mail failed, registration is kept', { registrationId: registration.id, error: err.message }));
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

      sendConfirmationInBackground(event, registration);
      return registration;
    }
  };
}
