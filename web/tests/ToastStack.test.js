import { mount, RouterLinkStub } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

// App.vue must not open a real connection in a test: replace the API module with a spy.
let pushNotification;
const unsubscribe = vi.fn();
vi.mock('../src/api/notifications.js', () => ({
  subscribeToNotifications: vi.fn((onNotification) => {
    pushNotification = onNotification;
    return unsubscribe;
  })
}));

const { subscribeToNotifications } = await import('../src/api/notifications.js');
const { default: App } = await import('../src/App.vue');
const { default: ToastStack } = await import('../src/components/ToastStack.vue');
const { useToasts } = await import('../src/composables/useToasts.js');

const mountApp = () => mount(App, { global: { stubs: { RouterLink: RouterLinkStub, RouterView: true } } });

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const { toasts } = useToasts();
    toasts.value = []; // shared state: start every test empty
  });

  afterEach(() => vi.useRealTimers());

  it('ToastStack shows a toast, and the close button removes it', async () => {
    const wrapper = mount(ToastStack);
    useToasts().show('New event: Game Night');
    await nextTick();

    expect(wrapper.text()).toContain('New event: Game Night');
    await wrapper.find('.toast__close').trigger('click');
    expect(wrapper.find('.toast').exists()).toBe(false);
  });

  it('a toast disappears by itself after 5 seconds', async () => {
    const wrapper = mount(ToastStack);
    useToasts().show('Hello');
    await nextTick();

    vi.advanceTimersByTime(5000);
    await nextTick();

    expect(wrapper.find('.toast').exists()).toBe(false);
  });

  it('App opens ONE subscription, shows one toast per notification, and closes it on unmount', async () => {
    const wrapper = mountApp();

    pushNotification({ type: 'registration-created', eventId: 3, title: 'Game Night' });
    await nextTick();

    expect(subscribeToNotifications).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('.toast')).toHaveLength(1);
    expect(wrapper.find('.toast').text()).toContain('Someone just registered for Game Night');

    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
