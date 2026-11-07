import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryCache } from '../../src/cache/memoryCache.mjs';

// A clock we control, so TTL tests don't have to wait for real time to pass.
const fakeClock = () => {
  let time = 0;
  return { now: () => time, advance: (ms) => (time += ms) };
};

describe('memoryCache', () => {
  it('returns the cached value until the TTL expires', async () => {
    const clock = fakeClock();
    const cache = createMemoryCache({ ttlSeconds: 60, now: clock.now });
    await cache.set('key', { a: 1 });

    clock.advance(59_999);
    assert.deepEqual(await cache.get('key'), { a: 1 });
    clock.advance(1);
    assert.equal(await cache.get('key'), undefined);
  });

  it('remember() calls the loader only on a miss', async () => {
    const cache = createMemoryCache({ ttlSeconds: 60 });
    let calls = 0;
    const loader = async () => ++calls;

    await cache.remember('key', loader);
    const second = await cache.remember('key', loader);

    assert.equal(calls, 1);
    assert.equal(second, 1);
  });

  it('returns a copy, so callers cannot change what is cached', async () => {
    const cache = createMemoryCache({ ttlSeconds: 60 });
    const first = await cache.remember('key', async () => ({ list: [1] }));
    first.list.push(2);

    assert.deepEqual(await cache.get('key'), { list: [1] });
  });

  it('does not cache a result when an invalidation happened while loading', async () => {
    const cache = createMemoryCache({ ttlSeconds: 60 });
    // Simulates: a slow read starts, a write invalidates meanwhile, then the read finishes with old data.
    const staleRead = cache.remember('key', async () => {
      await cache.delete('key');
      return 'stale';
    });

    assert.equal(await staleRead, 'stale');
    assert.equal(await cache.get('key'), undefined);
  });

  it('does not cache errors', async () => {
    const cache = createMemoryCache({ ttlSeconds: 60 });

    await assert.rejects(cache.remember('key', async () => { throw new Error('boom'); }));
    assert.equal(await cache.get('key'), undefined);
  });
});
