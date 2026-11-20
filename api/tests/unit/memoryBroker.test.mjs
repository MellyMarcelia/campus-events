import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryBroker } from '../../src/messaging/memoryBroker.mjs';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('memoryBroker', () => {
  it('keeps messages published before anyone consumes them', async () => {
    const broker = createMemoryBroker({ retryDelayMs: 5 });
    const received = [];

    await broker.publish('mail.confirmation', { n: 1 });
    await broker.consume('mail.confirmation', async (message) => void received.push(message));
    await tick();

    assert.deepEqual(received, [{ n: 1 }]);
  });

  it('hands out one message at a time, in order', async () => {
    const broker = createMemoryBroker({ retryDelayMs: 5 });
    const log = [];
    await broker.consume('t', async ({ n }) => {
      log.push(`start ${n}`);
      await tick(5);
      log.push(`end ${n}`);
    });

    await broker.publish('t', { n: 1 });
    await broker.publish('t', { n: 2 });
    await tick(30);

    assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('redelivers a message whose handler failed, after the retry delay', async () => {
    const broker = createMemoryBroker({ retryDelayMs: 5 });
    let calls = 0;
    await broker.consume('t', async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider down');
    });

    await broker.publish('t', { n: 1 });
    await tick();
    assert.equal(calls, 1);
    await tick(20);

    assert.equal(calls, 2);
  });

  it('broadcasts to every matching subscriber once, and to nobody else', async () => {
    const broker = createMemoryBroker({ retryDelayMs: 5 });
    const a = [];
    const b = [];
    const other = [];
    await broker.subscribe('notify.#', (message) => a.push(message));
    await broker.subscribe('notify.#', (message) => b.push(message));
    await broker.subscribe('mail.#', (message) => other.push(message));

    await broker.broadcast('notify.event-created', { id: 1 });

    assert.deepEqual(a, [{ id: 1 }]);
    assert.deepEqual(b, [{ id: 1 }]);
    assert.deepEqual(other, []);
  });

  it('gives the consumer a copy, not the published object', async () => {
    const broker = createMemoryBroker({ retryDelayMs: 5 });
    const original = { mail: { to: 'ada@example.com' } };
    let received;
    await broker.consume('t', async (message) => { received = message; });

    await broker.publish('t', original);
    await tick();

    assert.deepEqual(received, original);
    assert.notEqual(received, original);
  });
});
