import { logger } from '../lib/logger.mjs';

const TOPIC_PREFIX = 'notify.';

// Live notifications for every open browser ("toasts").
//
//   service ─► broadcast 'notify.<type>' ─► RabbitMQ ─► EVERY API instance ─► its open browsers (SSE)
//
// Through the broker instead of straight to the browsers, so a registration handled by one API
// instance still reaches browsers connected to another one.
//
// At most once, on purpose: published right after the database commit, not via the outbox.
// A missed toast does no harm; the outbox could deliver twice, and that would mean two toasts.
export function createNotificationService({ broker }) {
  const listeners = new Set(); // one per open browser on THIS instance

  broker.subscribe(`${TOPIC_PREFIX}#`, (notification) => {
    for (const listener of listeners) listener(notification);
  }).catch((err) => logger.error('could not subscribe to notifications', { error: err.message }));

  // Fire and forget: a broker problem must never fail the request that caused the notification.
  function publish(type, data) {
    broker.broadcast(`${TOPIC_PREFIX}${type}`, { type, ...data })
      .catch((err) => logger.warn('notification not sent', { type, error: err.message }));
  }

  return {
    eventCreated(event) {
      publish('event-created', { eventId: event.id, title: event.title, startsAt: event.startsAt });
    },

    // Takes only the event, never the registration: a notification can't reveal WHO registered.
    registrationCreated(event) {
      publish('registration-created', { eventId: event.id, title: event.title });
    },

    // Returns a function that stops the listener (call it when the browser disconnects).
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
