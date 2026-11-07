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
});
