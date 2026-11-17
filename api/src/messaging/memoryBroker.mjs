// A broker inside this process, with the same interface as rabbitBroker.mjs.
// Used by the tests and by local development without AMQP_URL. NOT durable: messages that were
// published but not yet handled are lost when the process stops. Production uses RabbitMQ.
export function createMemoryBroker({ retryDelayMs }) {
  const queues = new Map(); // topic → { handler, waiting: [], busy }

  const queueFor = (topic) => {
    if (!queues.has(topic)) queues.set(topic, { handler: null, waiting: [], busy: false });
    return queues.get(topic);
  };

  // One message at a time per topic, like prefetch(1) on RabbitMQ.
  async function deliver(queue) {
    if (queue.busy || !queue.handler) return;
    queue.busy = true;
    while (queue.waiting.length > 0) {
      const message = queue.waiting.shift();
      try {
        await queue.handler(message);
      } catch {
        // Like the retry queue on RabbitMQ: try again after a delay, as often as needed.
        // unref(): a pending retry must not keep the process (or a test run) alive.
        setTimeout(() => enqueue(queue, message), retryDelayMs).unref();
      }
    }
    queue.busy = false;
  }

  function enqueue(queue, message) {
    queue.waiting.push(message);
    deliver(queue);
  }

  return {
    // structuredClone: the consumer gets a copy, just like it would after a trip through RabbitMQ.
    async publish(topic, message) {
      enqueue(queueFor(topic), structuredClone(message));
    },

    // The handler's promise decides: resolves = done, rejects = retry later.
    async consume(topic, handler) {
      const queue = queueFor(topic);
      queue.handler = handler;
      deliver(queue);
    }
  };
}
