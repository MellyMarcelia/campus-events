import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createNotificationController } from '../../src/controllers/notificationController.mjs';

// Just enough of Express' req/res to see which headers the stream sends.
function fakeHttp() {
  const req = new EventEmitter();
  const res = { headers: {}, set(name, value) { Object.assign(this.headers, typeof name === 'string' ? { [name]: value } : name); }, flushHeaders() {}, write() {} };
  return { req, res };
}

const service = { subscribe: () => () => {} };

describe('notificationController', () => {
  it('lets the configured frontend open the stream cross-origin', () => {
    const { req, res } = fakeHttp();
    createNotificationController(service, { allowedOrigin: 'https://web.example' }).stream(req, res);
    req.emit('close'); // stop the heartbeat timer

    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://web.example');
    assert.equal(res.headers['Content-Type'], 'text/event-stream');
  });

  it('allows no other origin when none is configured', () => {
    const { req, res } = fakeHttp();
    createNotificationController(service).stream(req, res);
    req.emit('close');

    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  });
});
