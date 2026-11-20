import { describe, expect, it, vi } from 'vitest';
import { subscribeToNotifications } from '../src/api/notifications.js';
import { notificationText } from '../src/utils/notificationText.js';

// A stand-in for the browser's EventSource, so we can push messages ourselves.
class FakeEventSource {
  static last;
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.last = this;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  close() { this.closed = true; }
  emit(type, data) { this.listeners[type]?.({ data: JSON.stringify(data) }); }
}

describe('subscribeToNotifications', () => {
  it('listens on /api/notifications and passes each notification on, parsed', () => {
    const onNotification = vi.fn();
    subscribeToNotifications(onNotification, { EventSourceImpl: FakeEventSource });
    const source = FakeEventSource.last;

    source.emit('event-created', { type: 'event-created', eventId: 3, title: 'Game Night' });
    source.emit('registration-created', { type: 'registration-created', eventId: 3, title: 'Game Night' });

    expect(source.url).toBe('/api/notifications');
    expect(onNotification).toHaveBeenCalledTimes(2);
    expect(onNotification).toHaveBeenLastCalledWith({ type: 'registration-created', eventId: 3, title: 'Game Night' });
  });

  it('returns a function that closes the connection', () => {
    const close = subscribeToNotifications(() => {}, { EventSourceImpl: FakeEventSource });
    close();
    expect(FakeEventSource.last.closed).toBe(true);
  });
});

describe('notificationText', () => {
  it('describes a new event and an anonymous registration', () => {
    expect(notificationText({ type: 'event-created', title: 'Game Night' })).toBe('New event: Game Night');
    expect(notificationText({ type: 'registration-created', title: 'Game Night' })).toBe('Someone just registered for Game Night');
  });

  it('shows nothing for an unknown type', () => {
    expect(notificationText({ type: 'something-new', title: 'X' })).toBeNull();
  });
});
