import amqp from 'amqplib';
import { logger } from '../lib/logger.mjs';

const RECONNECT_DELAY_MS = 5000;

// RabbitMQ behind the same two functions as memoryBroker.mjs: publish(topic, message) and
// consume(topic, handler). Everything goes through one topic exchange; each topic gets a durable
// queue with the same name, plus a "<topic>.retry" queue for messages whose handler failed.
//
//   publish ─► exchange ─► <topic> ─► handler ok?  ─► ack (RabbitMQ deletes it)
//                             ▲          failed?   ─► <topic>.retry ─(waits retryDelayMs)─┐
//                             └─────────────────────────────────────────────────────────┘
export function createRabbitBroker({ url, exchange = 'campus-events', retryDelayMs }) {
  const consumers = new Map(); // topic → handler, restored after a reconnect
  const subscribers = new Map(); // pattern → handler (broadcasts), restored after a reconnect
  let started = new Set(); // topics consuming on the current connection
  let declared = new Set(); // work queues known to exist on the current connection
  let channelPromise = null;

  async function open() {
    started = new Set();
    declared = new Set();
    const connection = await amqp.connect(url);
    // A confirm channel: the broker tells us when it has safely stored a published message.
    const channel = await connection.createConfirmChannel();
    connection.on('error', (err) => logger.warn('RabbitMQ connection error', { error: err.message }));
    connection.on('close', () => {
      channelPromise = null;
      logger.warn('RabbitMQ connection closed, reconnecting');
      reconnectSoon();
    });
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.prefetch(1); // at most one unfinished message per consumer, like lab/worker.mjs
    for (const [topic, handler] of consumers) await startConsumer(channel, topic, handler);
    for (const [pattern, handler] of subscribers) await startSubscriber(channel, pattern, handler);
    logger.info('connected to RabbitMQ');
    return channel;
  }

  // Shares one connection between all callers; after a failure the next call tries again.
  function connect() {
    channelPromise ??= open().catch((err) => {
      channelPromise = null;
      throw err;
    });
    return channelPromise;
  }

  // Only consumers and subscribers need a standing connection; publishers reconnect when they publish.
  function reconnectSoon() {
    if (consumers.size === 0 && subscribers.size === 0) return;
    setTimeout(() => connect().catch((err) => {
      logger.warn('RabbitMQ still unreachable', { error: err.message });
      reconnectSoon();
    }), RECONNECT_DELAY_MS).unref();
  }

  // A message for a topic without a queue is dropped by RabbitMQ. Publishers declare the queue
  // too, so a mail published before the worker ever started (first deploy) still waits for it.
  async function declareWorkQueue(channel, topic) {
    if (declared.has(topic)) return;
    await channel.assertQueue(topic, { durable: true });
    await channel.bindQueue(topic, exchange, topic);
    declared.add(topic);
  }

  // Publish/subscribe (like lab/rabbit.mjs): every subscriber gets its own temporary queue, so
  // every API instance receives every broadcast. The queue disappears with the connection.
  async function startSubscriber(channel, pattern, handler) {
    const key = `subscriber:${pattern}`;
    if (started.has(key)) return;
    started.add(key);
    const { queue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue, exchange, pattern);
    await channel.consume(queue, (msg) => {
      if (!msg) return;
      try {
        handler(JSON.parse(msg.content.toString()));
      } catch (err) {
        logger.warn('broadcast handler failed', { pattern, error: err.message });
      }
    }, { noAck: true }); // a missed broadcast is not worth redelivering
  }

  async function startConsumer(channel, topic, handler) {
    if (started.has(topic)) return;
    started.add(topic);
    const retryQueue = `${topic}.retry`;
    await declareWorkQueue(channel, topic);
    // Nobody consumes the retry queue: a message waits there retryDelayMs, then RabbitMQ
    // "dead-letters" it back to the exchange with the original topic, so it is tried again.
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: { 'x-message-ttl': retryDelayMs, 'x-dead-letter-exchange': exchange, 'x-dead-letter-routing-key': topic }
    });

    await channel.consume(topic, async (msg) => {
      if (!msg) return; // the broker cancelled this consumer (e.g. the queue was deleted)
      let message;
      try {
        message = JSON.parse(msg.content.toString());
      } catch {
        logger.error('dropping a message that is not JSON', { topic });
        return channel.ack(msg); // retrying would never fix it
      }
      try {
        await handler(message);
      } catch (err) {
        logger.warn('message handler failed, retrying later', { topic, retryDelayMs, error: err.message });
        channel.sendToQueue(retryQueue, msg.content, { persistent: true, contentType: 'application/json' });
        await channel.waitForConfirms(); // the retry copy is safe before we drop the original
      }
      // Ack only now: if the process dies before this line, RabbitMQ delivers the message again.
      channel.ack(msg);
    });
  }

  return {
    // Resolves once RabbitMQ has stored the message, so the caller may forget it (outbox relay).
    async publish(topic, message) {
      const channel = await connect();
      await declareWorkQueue(channel, topic);
      channel.publish(exchange, topic, Buffer.from(JSON.stringify(message)), { persistent: true, contentType: 'application/json' });
      await channel.waitForConfirms();
    },

    // To every subscriber whose pattern matches, at most once. Not stored: nobody listening = gone.
    async broadcast(topic, message) {
      const channel = await connect();
      channel.publish(exchange, topic, Buffer.from(JSON.stringify(message)), { contentType: 'application/json' });
    },

    // pattern: a RabbitMQ topic pattern, e.g. 'notify.#' for every topic starting with 'notify.'.
    async subscribe(pattern, handler) {
      subscribers.set(pattern, handler);
      try {
        // A brand-new connection already started it in open(); startSubscriber() skips it then.
        await startSubscriber(await connect(), pattern, handler);
      } catch (err) {
        logger.warn('RabbitMQ unreachable, will keep trying', { error: err.message });
        reconnectSoon();
      }
    },

    async consume(topic, handler) {
      consumers.set(topic, handler);
      try {
        // A brand-new connection already started it in open(); startConsumer() skips it then.
        await startConsumer(await connect(), topic, handler);
      } catch (err) {
        logger.warn('RabbitMQ unreachable, will keep trying', { error: err.message });
        reconnectSoon();
      }
    }
  };
}
