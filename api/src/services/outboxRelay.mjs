import { logger } from '../lib/logger.mjs';

const BATCH_SIZE = 50;

// Moves messages from the outbox table to the broker. Started right after every registration
// (kick) and every OUTBOX_POLL_INTERVAL_MS by server.mjs, which also picks up rows that were
// left behind by a crash or while RabbitMQ was down.
export function createOutboxRelay({ outbox, broker }) {
  let current = null; // the run in progress, so two runs never publish the same row
  let runAgain = false;

  async function publishPending() {
    const messages = await outbox.findUnsent(BATCH_SIZE);
    for (const message of messages) {
      // Throws when the broker is down: we stop, and the rows wait for the next run.
      await broker.publish(message.topic, message.payload);
      // If this delete fails, the next run publishes the row again: the mail may arrive twice,
      // but it is never lost ("at-least-once delivery").
      await outbox.remove(message.id);
    }
    return messages.length;
  }

  async function runUntilEmpty() {
    let published = 0;
    try {
      do {
        runAgain = false;
        published += await publishPending();
      } while (runAgain);
      return published;
    } finally {
      current = null;
    }
  }

  // Resolves with the number of published messages. A call during a run makes that run go
  // round once more (a row committed just now must not wait for the next poll).
  function run() {
    if (current) {
      runAgain = true;
      return current;
    }
    current = runUntilEmpty();
    return current;
  }

  // Fire and forget, for callers that must not wait for (or fail because of) the broker.
  function kick() {
    run().catch((err) => logger.warn('outbox: broker unavailable, will retry', { error: err.message }));
  }

  return { run, kick };
}
