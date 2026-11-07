import { Registration } from '../models/index.mjs';

const plain = (row) => (row ? row.toJSON() : null);

export const registrationRepository = {
  async findByEvent(eventId) {
    const rows = await Registration.findAll({ where: { eventId }, order: [['createdAt', 'ASC']] });
    return rows.map(plain);
  },

  async findByEventAndEmail(eventId, email) {
    return plain(await Registration.findOne({ where: { eventId, email } }));
  },

  async countByEvent(eventId) {
    return Registration.count({ where: { eventId } });
  },

  // One GROUP BY query instead of one query per event (the old stats endpoint did N+1 queries).
  // Returns a Map eventId → count; events without registrations are simply missing.
  async countPerEvent() {
    const rows = await Registration.count({ group: ['eventId'] });
    return new Map(rows.map((row) => [row.eventId, row.count]));
  },

  async create({ eventId, name, email }) {
    return plain(await Registration.create({ eventId, name, email }));
  }
};
