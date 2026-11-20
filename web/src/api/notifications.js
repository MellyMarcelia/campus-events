// Live notifications from the API, via Server-Sent Events: one long-lived GET that the server
// writes into. EventSource reconnects by itself after a dropped connection.
// In development Vite forwards /api to the API, streams included. In production Render's /api
// rewrite holds a response back until it ends, and this one never ends, so the build points
// straight at the API instead (VITE_NOTIFICATIONS_URL, set at build time).
const URL = import.meta.env.VITE_NOTIFICATIONS_URL || '/api/notifications';
const TYPES = ['event-created', 'registration-created'];

// Calls onNotification({ type, eventId, title, ... }) for every notification.
// Returns a function that closes the connection. EventSourceImpl is swappable for tests.
export function subscribeToNotifications(onNotification, { EventSourceImpl = globalThis.EventSource } = {}) {
  if (!EventSourceImpl) return () => {}; // no SSE support (e.g. some test environments): just no toasts

  const source = new EventSourceImpl(URL);
  for (const type of TYPES) {
    source.addEventListener(type, (message) => onNotification(JSON.parse(message.data)));
  }
  return () => source.close();
}
