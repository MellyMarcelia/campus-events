import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.mjs';
import { createMemoryBroker } from '../../src/messaging/memoryBroker.mjs';
import { OutboxMessage } from '../../src/models/index.mjs';
import { createTestApp, fakeMailer, validEvent } from '../helpers/testApp.mjs';

// A broker we can switch off, like RabbitMQ being unreachable.
function switchableBroker({ up = true } = {}) {
  const inner = createMemoryBroker({ retryDelayMs: 5 });
  const broker = {
    up,
    publish: (topic, message) => (broker.up ? inner.publish(topic, message) : Promise.reject(new Error('ECONNREFUSED'))),
    consume: inner.consume,
    broadcast: inner.broadcast,
    subscribe: inner.subscribe
  };
  return broker;
}

// Background work (relay, worker) finishes a moment after the 201.
async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function createEvent(app, overrides) {
  const created = await request(app).post('/api/events').send(validEvent({ title: 'Outbox Workshop', ...overrides }));
  return `/api/events/${created.body.id}/registrations`;
}

describe('Confirmation mail via outbox and broker', () => {
  it('stores the registration and the mail it owes together, and the API response is unchanged', async () => {
    const { app } = await createTestApp({ broker: switchableBroker({ up: false }) });
    const url = await createEvent(app);

    const res = await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body).sort(), ['createdAt', 'email', 'eventId', 'id', 'name', 'updatedAt']);
    const [owed] = await OutboxMessage.findAll();
    assert.equal(owed.topic, 'mail.confirmation');
    assert.equal(owed.payload.registrationId, res.body.id);
    assert.equal(owed.payload.mail.to, 'ada@example.com');
    assert.match(owed.payload.mail.subject, /Outbox Workshop/);
  });

  it('owes no mail for a refused registration', async () => {
    const { app } = await createTestApp({ broker: switchableBroker({ up: false }) });
    const url = await createEvent(app, { capacity: 1 });

    await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });
    const refused = await request(app).post(url).send({ name: 'Grace', email: 'grace@example.com' });

    assert.equal(refused.status, 409);
    assert.equal(await OutboxMessage.count(), 1, 'only Ada\'s mail');
  });

  it('publishes the waiting mail once the broker is back, then forgets it', async () => {
    const broker = switchableBroker({ up: false });
    const mailer = fakeMailer();
    const { app } = await createTestApp({ broker, mailer });
    await request(app).post(await createEvent(app)).send({ name: 'Ada', email: 'ada@example.com' });
    assert.equal(mailer.sent.length, 0, 'broker down: nothing sent yet');

    broker.up = true;
    await app.locals.outboxRelay.run(); // what the poll in server.mjs does every few seconds

    await waitFor(() => mailer.sent.length === 1);
    assert.equal(mailer.sent[0].to, 'ada@example.com');
    assert.equal(await OutboxMessage.count(), 0);
  });

  it('loses no mail when the API restarts before the mail went out', async () => {
    const { app } = await createTestApp({ broker: switchableBroker({ up: false }) });
    await request(app).post(await createEvent(app)).send({ name: 'Ada', email: 'ada@example.com' });

    // "Restart": a brand-new app on the same database; only the outbox row connects the two.
    const mailer = fakeMailer();
    const restarted = createApp({ mailer, broker: switchableBroker() });
    await restarted.locals.outboxRelay.run();

    await waitFor(() => mailer.sent.length === 1);
    assert.equal(mailer.sent[0].to, 'ada@example.com');
  });

  it('keeps retrying while the mail provider is down, and sends once it works again', async () => {
    let attempts = 0;
    const sent = [];
    const flakyMailer = {
      async send(mail) {
        attempts += 1;
        if (attempts <= 3) throw new Error('SMTP 421 try again later');
        sent.push(mail);
      }
    };
    const { app } = await createTestApp({ mailer: flakyMailer, broker: switchableBroker() });

    const res = await request(app).post(await createEvent(app)).send({ name: 'Ada', email: 'ada@example.com' });

    assert.equal(res.status, 201, 'the failing provider never affects the registration');
    await waitFor(() => sent.length === 1);
    assert.equal(attempts, 4);
  });

  it('publishes each waiting mail only once, even when relay runs overlap', async () => {
    const broker = switchableBroker({ up: false });
    const mailer = fakeMailer();
    const { app } = await createTestApp({ broker, mailer });
    await request(app).post(await createEvent(app)).send({ name: 'Ada', email: 'ada@example.com' });

    broker.up = true;
    const { outboxRelay } = app.locals;
    await Promise.all([outboxRelay.run(), outboxRelay.run(), outboxRelay.run()]);

    await waitFor(() => mailer.sent.length >= 1);
    await new Promise((resolve) => setTimeout(resolve, 20)); // room for a wrong second mail to arrive
    assert.equal(mailer.sent.length, 1);
  });
});
