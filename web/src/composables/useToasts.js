import { ref } from 'vue';

// Shared by every component (module-level state): App.vue adds toasts, ToastStack.vue shows them.
const toasts = ref([]);
let nextId = 1;

const MAX_VISIBLE = 4; // a burst of registrations must not cover the whole screen

export function useToasts({ durationMs = 5000 } = {}) {
  function dismiss(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function show(text) {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, text }].slice(-MAX_VISIBLE);
    setTimeout(() => dismiss(id), durationMs);
  }

  return { toasts, show, dismiss };
}
