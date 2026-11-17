import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';

describe('Event capacity', () => {
  let app;

  beforeEach(async () => {
    ({ app } = await createTestApp());
  });

  it('returns 409 once every seat is taken', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ capacity: 1 }));
    const url = `/api/events/${created.body.id}/registrations`;

    const first = await request(app).post(url).send({ name: 'Ada', email: 'ada@example.com' });
    const second = await request(app).post(url).send({ name: 'Grace', email: 'grace@example.com' });

    assert.equal(first.status, 201);
    assert.equal(second.status, 409);
    assert.equal(second.body.error.message, 'Event is full');
  });

  // The bug from the review: requests that arrive at the same moment all saw a free seat.
  it('sells the last seat only once when people register at the same moment', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ capacity: 1 }));
    const url = `/api/events/${created.body.id}/registrations`;

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => request(app).post(url).send({ name: `Student ${i}`, email: `student${i}@example.com` }))
    );

    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409]);
    const list = await request(app).get(url);
    assert.equal(list.body.length, 1);
  });

  it('registers the same email only once when it is sent twice at the same moment', async () => {
    const created = await request(app).post('/api/events').send(validEvent({ capacity: 10 }));
    const url = `/api/events/${created.body.id}/registrations`;
    const ada = { name: 'Ada', email: 'ada@example.com' };

    const responses = await Promise.all([request(app).post(url).send(ada), request(app).post(url).send(ada)]);

    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  });
});
