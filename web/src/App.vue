<script setup>
import { onMounted, onUnmounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { subscribeToNotifications } from './api/notifications.js';
import ToastStack from './components/ToastStack.vue';
import { useToasts } from './composables/useToasts.js';
import { notificationText } from './utils/notificationText.js';

// One connection for the whole app (App never unmounts while you navigate): one toast per
// notification. Subscribing in a page component would open a new connection on every visit.
const { show } = useToasts();
let unsubscribe = () => {};

onMounted(() => {
  unsubscribe = subscribeToNotifications((notification) => {
    const text = notificationText(notification);
    if (text) show(text);
  });
});
onUnmounted(() => unsubscribe());
</script>

<template>
  <header class="site-header">
    <RouterLink to="/" class="brand">Campus Events</RouterLink>
    <nav>
      <RouterLink to="/">Events</RouterLink>
      <RouterLink to="/stats">Occupancy</RouterLink>
      <RouterLink to="/events/new" class="button button--small">New event</RouterLink>
    </nav>
  </header>
  <main class="page">
    <RouterView />
  </main>
  <ToastStack />
</template>
