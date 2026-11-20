<script setup>
import { useToasts } from '../composables/useToasts.js';

const { toasts, dismiss } = useToasts();
</script>

<template>
  <!-- aria-live: screen readers read new toasts aloud without moving the focus -->
  <div class="toast-stack" role="status" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast">
      <span>{{ toast.text }}</span>
      <button type="button" class="toast__close" aria-label="Dismiss notification" @click="dismiss(toast.id)">×</button>
    </div>
  </div>
</template>
