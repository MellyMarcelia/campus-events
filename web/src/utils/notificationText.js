// What a toast says. A registration never names the person: the API doesn't even send it.
const texts = {
  'event-created': ({ title }) => `New event: ${title}`,
  'registration-created': ({ title }) => `Someone just registered for ${title}`
};

// Returns null for a type this version of the frontend doesn't know (shown as no toast).
export function notificationText(notification) {
  return texts[notification.type]?.(notification) ?? null;
}
