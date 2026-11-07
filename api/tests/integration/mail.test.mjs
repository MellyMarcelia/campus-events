import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createSmtpMailer } from '../../src/mail/smtpMailer.mjs';
import { createTestApp, fakeMailer, validEvent } from '../helpers/testApp.mjs';

async function registerAda(app) {
  const created = await request(app).post('/api/events').send(validEvent({ title: 'Mail Workshop' }));
  const url = `/api/events/${created.body.id}/registrations`;
  const res = await request(app).post(url).send({ name: 'Ada', email: 'ADA@example.com' });
  const list = await request(app).get(url);
  return { res, list };
}

describe('Confirmation mail', () => {
  it('sends a confirmation to the participant after registering', async () => {
    const mailer = fakeMailer();
    const { app } = await createTestApp({ mailer });

    const { res } = await registerAda(app);

    assert.equal(res.status, 201);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, 'ada@example.com');
    assert.match(mailer.sent[0].subject, /Mail Workshop/);
  });

  it('sends no mail when the registration is refused', async () => {
    const mailer = fakeMailer();
    const { app } = await createTestApp({ mailer });
    const created = await request(app).post('/api/events').send(validEvent());
    const url = `/api/events/${created.body.id}/registrations`;

    await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });
    const duplicate = await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });

    assert.equal(duplicate.status, 409);
    assert.equal(mailer.sent.length, 1);
  });

  describe('when the mail provider fails, the registration is still stored', () => {
    const brokenMailers = {
      'rejects': { send: async () => { throw new Error('SMTP 554 rejected'); } },
      'throws synchronously': { send: () => { throw new Error('bad config'); } },
      'never answers': { send: () => new Promise(() => {}) },
      // A real nodemailer transport pointed at a port where nothing listens: the provider is offline.
      'is offline': createSmtpMailer({ url: 'smtp://127.0.0.1:1', from: 'test@example.com', timeoutMs: 500 })
    };

    for (const [problem, mailer] of Object.entries(brokenMailers)) {
      it(`provider ${problem}`, async () => {
        const { app } = await createTestApp({ mailer });

        const { res, list } = await registerAda(app);

        assert.equal(res.status, 201);
        assert.deepEqual(list.body.map((r) => r.email), ['ada@example.com']);
      });
    }
  });
});
