// One place for every cache key, so reads and invalidations can't drift apart through a typo.
export const cacheKeys = {
  eventList: 'events:list',
  event: (id) => `events:${id}`,
  registrations: (eventId) => `events:${eventId}:registrations`,
  stats: 'stats'
};
