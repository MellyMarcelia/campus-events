import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';

describe('Caching of GET endpoints', () => {
  let app;
  let db;
  let id;

  beforeEach(async () => {
    ({ app, db } = await createTestApp());
    const created = await request(app).post('/api/events').send(validEvent({ title: 'Original', capacity: 3 }));
    id = created.body.id;
  });

  // Changing a row behind the API's back is invisible while the response is cached:
  // that proves the second GET did not go to the database.
  it('serves a repeated GET from the cache', async () => {
    await request(app).get(`/api/events/${id}`);
    await db.Event.update({ title: 'Changed directly in the DB' }, { where: { id } });

    const res = await request(app).get(`/api/events/${id}`);

    assert.equal(res.body.title, 'Original');
  });

  it('returns exactly the same body on a cache hit as on a miss', async () => {
    for (const url of ['/api/events', `/api/events/${id}`, `/api/events/${id}/registrations`, '/api/stats']) {
      const miss = await request(app).get(url);
      const hit = await request(app).get(url);
      assert.deepEqual(hit.body, miss.body, url);
    }
  });

  it('does not cache a 404', async () => {
    await request(app).get('/api/events/999');
    await db.Event.create({ ...validEvent(), id: 999 });

    const res = await request(app).get('/api/events/999');

    assert.equal(res.status, 200);
  });

  describe('stays correct after changes through the API', () => {
    const warmUp = () =>
      Promise.all(['/api/events', `/api/events/${id}`, `/api/events/${id}/registrations`, '/api/stats'].map((url) => request(app).get(url)));

    it('POST /events shows up in the list and stats', async () => {
      await warmUp();
      await request(app).post('/api/events').send(validEvent({ title: 'New one' }));

      const list = await request(app).get('/api/events');
      const stats = await request(app).get('/api/stats');

      assert.ok(list.body.some((e) => e.title === 'New one'));
      assert.ok(stats.body.some((e) => e.title === 'New one'));
    });

    it('PATCH /events/:id shows up in the detail, list and stats', async () => {
      await warmUp();
      await request(app).patch(`/api/events/${id}`).send({ title: 'Renamed', capacity: 4 });

      const detail = await request(app).get(`/api/events/${id}`);
      const list = await request(app).get('/api/events');
      const stats = await request(app).get('/api/stats');

      assert.equal(detail.body.title, 'Renamed');
      assert.equal(detail.body.spotsLeft, 4);
      assert.equal(list.body[0].title, 'Renamed');
      assert.equal(stats.body[0].capacity, 4);
    });

    it('DELETE /events/:id removes it everywhere', async () => {
      await warmUp();
      await request(app).delete(`/api/events/${id}`);

      assert.equal((await request(app).get(`/api/events/${id}`)).status, 404);
      assert.equal((await request(app).get(`/api/events/${id}/registrations`)).status, 404);
      assert.deepEqual((await request(app).get('/api/events')).body, []);
      assert.deepEqual((await request(app).get('/api/stats')).body, []);
    });

    it('a new registration updates spotsLeft, the registration list and stats', async () => {
      await warmUp();
      await request(app).post(`/api/events/${id}/registrations`).send({ name: 'Ada', email: 'ada@example.com' });

      const detail = await request(app).get(`/api/events/${id}`);
      const registrations = await request(app).get(`/api/events/${id}/registrations`);
      const stats = await request(app).get('/api/stats');

      assert.equal(detail.body.spotsLeft, 2);
      assert.deepEqual(registrations.body.map((r) => r.name), ['Ada']);
      assert.equal(stats.body[0].registered, 1);
    });
  });
});
