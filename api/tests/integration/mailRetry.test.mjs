import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createMailRetry } from '../../src/app.mjs';
import { PendingMail } from '../../src/models/index.mjs';
import { createTestApp, fakeMailer, validEvent } from '../helpers/testApp.mjs';

const failingMailer = () => ({ send: async () => { throw new Error('SMTP 554 rejected'); } });

// register() sends the mail in the background, so a failed mail is stored a moment after the 201.
async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Registers Ada while the mail provider is down, and waits until her mail is stored for a retry.
async function registerWhileProviderDown() {
  const { app } = await createTestApp({ mailer: failingMailer() });
  const created = await request(app).post('/api/events').send(validEvent({ title: 'Retry Workshop' }));
  const res = await request(app).post(`/api/events/${created.body.id}/registrations`).send({ name: 'Ada', email: 'ada@example.com' });
  await waitFor(async () => (await PendingMail.count()) === 1);
  return { app, res };
}

describe('Mail retry job', () => {
  it('stores a failed confirmation mail for a retry, and the registration API is unchanged', async () => {
    const { res } = await registerWhileProviderDown();

    const pending = await PendingMail.findOne();
    assert.equal(res.status, 201);
    assert.equal(pending.registrationId, res.body.id);
    assert.equal(pending.attempts, 1);
    assert.equal(pending.lastError, 'SMTP 554 rejected');
    assert.deepEqual(Object.keys(res.body).sort(), ['createdAt', 'email', 'eventId', 'id', 'name', 'updatedAt']);
  });

  it('stores nothing when the mail was sent the first time', async () => {
    const { app } = await createTestApp();
    const created = await request(app).post('/api/events').send(validEvent());
    await request(app).post(`/api/events/${created.body.id}/registrations`).send({ name: 'Ada', email: 'ada@example.com' });

    assert.deepEqual(await createMailRetry({ mailer: fakeMailer() }).runOnce(), { sent: 0, failed: 0 });
    assert.equal(await PendingMail.count(), 0);
  });

  it('sends the mail once the provider is back, and forgets it', async () => {
    await registerWhileProviderDown();
    const mailer = fakeMailer();

    const result = await createMailRetry({ mailer }).runOnce();

    assert.deepEqual(result, { sent: 1, failed: 0 });
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, 'ada@example.com');
    assert.match(mailer.sent[0].subject, /Retry Workshop/);
    assert.equal(await PendingMail.count(), 0);
  });

  it('counts every failed retry and gives up after maxAttempts', async () => {
    await registerWhileProviderDown();
    const retry = createMailRetry({ mailer: failingMailer(), maxAttempts: 2 });

    assert.deepEqual(await retry.runOnce(), { sent: 0, failed: 1 });
    assert.deepEqual(await retry.runOnce(), { sent: 0, failed: 0 }, 'no attempts left: not tried again');

    const pending = await PendingMail.findOne();
    assert.equal(pending.attempts, 2, 'kept for a human to inspect');
  });

  it('skips a run while the previous one is still busy', async () => {
    await registerWhileProviderDown();
    let finishSending;
    const slowMailer = { send: () => new Promise((resolve) => { finishSending = resolve; }) };
    const retry = createMailRetry({ mailer: slowMailer });

    const first = retry.runOnce();
    await waitFor(() => finishSending !== undefined);
    assert.deepEqual(await retry.runOnce(), { skipped: true });

    finishSending();
    assert.deepEqual(await first, { sent: 1, failed: 0 });
  });
});
