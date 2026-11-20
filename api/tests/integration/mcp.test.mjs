import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { createTestApp, fakeMailer, validEvent } from '../helpers/testApp.mjs';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days) => new Date(Date.now() + days * DAY).toISOString();

// A real MCP client over real HTTP, exactly how an AI assistant talks to the API.
async function connectClient(app) {
  const server = app.listen(0);
  const url = new URL(`http://127.0.0.1:${server.address().port}/api/mcp`);
  const client = new Client({ name: 'test-assistant', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(url));
  return { client, url, close: async () => { await client.close(); server.close(); } };
}

const parse = (result) => JSON.parse(result.content[0].text);

describe('MCP server', () => {
  let app, mailer, mcp;

  beforeEach(async () => {
    await mcp?.close();
    mailer = fakeMailer();
    ({ app } = await createTestApp({ mailer }));
    mcp = await connectClient(app);
  });

  after(() => mcp?.close());

  async function createEvent(overrides) {
    return (await request(app).post('/api/events').send(validEvent(overrides))).body;
  }

  it('offers the list_events and register_for_event tools', async () => {
    const { tools } = await mcp.client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['list_events', 'register_for_event']);
  });

  describe('list_events', () => {
    beforeEach(async () => {
      await createEvent({ title: 'Last month', startsAt: inDays(-30) });
      await createEvent({ title: 'Yesterday', startsAt: inDays(-1) });
      await createEvent({ title: 'Next week', startsAt: inDays(7) });
      await createEvent({ title: 'Tomorrow', startsAt: inDays(1) });
    });

    it('"get me all upcoming events": soonest first', async () => {
      const events = parse(await mcp.client.callTool({ name: 'list_events', arguments: { when: 'upcoming' } }));
      assert.deepEqual(events.map((e) => e.title), ['Tomorrow', 'Next week']);
      assert.ok(events.every((e) => Number.isInteger(e.id)), 'ids are included, needed to register');
    });

    it('"get me all past events": most recent first', async () => {
      const events = parse(await mcp.client.callTool({ name: 'list_events', arguments: { when: 'past' } }));
      assert.deepEqual(events.map((e) => e.title), ['Yesterday', 'Last month']);
    });

    it('shows upcoming events when nothing is specified, and can search on the title', async () => {
      assert.equal(parse(await mcp.client.callTool({ name: 'list_events', arguments: {} })).length, 2);
      const found = parse(await mcp.client.callTool({ name: 'list_events', arguments: { when: 'all', search: 'WEEK' } }));
      assert.deepEqual(found.map((e) => e.title), ['Next week']);
    });
  });

  describe('register_for_event', () => {
    it('"register me with Sam at event X": one call per person, both registered and mailed', async () => {
      const event = await createEvent({ title: 'Hackathon' });

      for (const person of [{ name: 'Melly', email: 'melly@example.com' }, { name: 'Sam', email: 'sam@example.com' }]) {
        const result = await mcp.client.callTool({ name: 'register_for_event', arguments: { eventId: event.id, ...person } });
        assert.equal(result.isError, undefined);
        assert.match(result.content[0].text, new RegExp(`Registered ${person.name} .* for "Hackathon"`));
      }

      const list = await request(app).get(`/api/events/${event.id}/registrations`);
      assert.deepEqual(list.body.map((r) => r.email), ['melly@example.com', 'sam@example.com']);
      await waitFor(() => mailer.sent.length === 2);
    });

    it('explains a full event, an unknown event and a double registration as tool errors', async () => {
      const event = await createEvent({ capacity: 1 });
      const register = (args) => mcp.client.callTool({ name: 'register_for_event', arguments: args });

      await register({ eventId: event.id, name: 'Ada', email: 'ada@example.com' });
      const duplicate = await register({ eventId: event.id, name: 'Ada', email: 'ada@example.com' });
      const full = await register({ eventId: event.id, name: 'Grace', email: 'grace@example.com' });
      const unknown = await register({ eventId: 9999, name: 'Grace', email: 'grace@example.com' });

      assert.equal(duplicate.isError, true);
      assert.match(duplicate.content[0].text, /already registered/);
      assert.equal(full.isError, true);
      assert.equal(full.content[0].text, 'Event is full');
      assert.equal(unknown.isError, true);
      assert.match(unknown.content[0].text, /not found/);
    });

    it('rejects an invalid email with the same rule as the website', async () => {
      const event = await createEvent();

      const result = await mcp.client.callTool({ name: 'register_for_event', arguments: { eventId: event.id, name: 'Ada', email: 'not-an-email' } });

      assert.equal(result.isError, true);
      const list = await request(app).get(`/api/events/${event.id}/registrations`);
      assert.equal(list.body.length, 0);
    });
  });

  it('answers GET with 405, because this stateless server has no stream to open', async () => {
    const res = await request(app).get('/api/mcp');
    assert.equal(res.status, 405);
  });
});

async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
