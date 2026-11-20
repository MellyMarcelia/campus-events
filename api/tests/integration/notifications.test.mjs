import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';

// Opens GET /api/notifications like a browser's EventSource and collects the messages.
function openBrowser(port) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const req = http.get({ port, path: '/api/notifications' }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop(); // an unfinished message stays in the buffer
        for (const block of blocks) {
          const event = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (event && data) messages.push({ event, data: JSON.parse(data) });
        }
      });
      resolve({ res, messages, close: () => req.destroy() });
    });
    req.on('error', reject);
  });
}

async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50)); // room for a wrong extra message

describe('Live notifications (Server-Sent Events)', () => {
  let app, server, browsers;

  beforeEach(async () => {
    ({ app } = await createTestApp());
    server = app.listen(0);
    // Two open browsers: both must get every notification.
    browsers = [await openBrowser(server.address().port), await openBrowser(server.address().port)];
  });

  // Every test opens a server and two never-ending streams: close them all, or the test run hangs.
  afterEach(() => {
    browsers.forEach((b) => b.close());
    server.closeAllConnections();
    server.close();
  });

  it('opens an event stream', () => {
    assert.equal(browsers[0].res.statusCode, 200);
    assert.match(browsers[0].res.headers['content-type'], /text\/event-stream/);
  });

  it('tells every open browser once when a new event is created', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ title: 'Game Night' }));

    await waitFor(() => browsers.every((b) => b.messages.length === 1));
    await settle();
    for (const browser of browsers) {
      assert.equal(browser.messages.length, 1);
      assert.equal(browser.messages[0].event, 'event-created');
      assert.equal(browser.messages[0].data.eventId, created.body.id);
      assert.equal(browser.messages[0].data.title, 'Game Night');
    }
  });

  it('tells every open browser once per registration, without saying who registered', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ title: 'Game Night' }));
    await waitFor(() => browsers.every((b) => b.messages.length === 1));

    await request(app).post(`/api/events/${created.body.id}/registrations`).send({ name: 'Ada Lovelace', email: 'ada@example.com' });

    await waitFor(() => browsers.every((b) => b.messages.length === 2));
    await settle();
    for (const browser of browsers) {
      assert.equal(browser.messages.length, 2, 'exactly one notification for the registration');
      const { event, data } = browser.messages[1];
      assert.equal(event, 'registration-created');
      assert.deepEqual(data, { type: 'registration-created', eventId: created.body.id, title: 'Game Night' });
      const raw = JSON.stringify(data);
      assert.doesNotMatch(raw, /Ada|ada@example\.com/);
    }
  });

  it('sends nothing for a refused registration', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ capacity: 1 }));
    const url = `/api/events/${created.body.id}/registrations`;
    await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });
    await waitFor(() => browsers[0].messages.length === 2);

    const refused = await request(app).post(url).send({ name: 'Grace', email: 'grace@example.com' });

    assert.equal(refused.status, 409);
    await settle();
    assert.equal(browsers[0].messages.length, 2, 'event-created + Ada, nothing for Grace');
  });

  it('stops writing to a browser that went away', async () => {
    browsers[0].close();
    await settle();

    await request(app).post('/api/events').send(validEvent());

    await waitFor(() => browsers[1].messages.length === 1);
    assert.equal(browsers[0].messages.length, 0);
  });
});
