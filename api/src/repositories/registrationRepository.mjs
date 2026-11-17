import { UniqueConstraintError } from 'sequelize';
import { Registration } from '../models/index.mjs';

const plain = (row) => (row ? row.toJSON() : null);

export const registrationRepository = {
  async findByEvent(eventId) {
    const rows = await Registration.findAll({ where: { eventId }, order: [['createdAt', 'ASC']] });
    return rows.map(plain);
  },

  // `tx` is optional everywhere: pass it to read or write inside a transaction (see transactions.mjs).
  async findByEventAndEmail(eventId, email, tx) {
    return plain(await Registration.findOne({ where: { eventId, email }, transaction: tx }));
  },

  async countByEvent(eventId, tx) {
    return Registration.count({ where: { eventId }, transaction: tx });
  },

  // One GROUP BY query instead of one query per event (the old stats endpoint did N+1 queries).
  // Returns a Map eventId → count; events without registrations are simply missing.
  // Number(): Postgres returns a grouped COUNT(*) as a string ('2'), SQLite as a number.
  async countPerEvent() {
    const rows = await Registration.count({ group: ['eventId'] });
    return new Map(rows.map((row) => [row.eventId, Number(row.count)]));
  },

  // Returns null when this email is already registered for the event. The unique index catches
  // what the service's own check can miss (e.g. a database without the row lock).
  async create({ eventId, name, email }, tx) {
    try {
      return plain(await Registration.create({ eventId, name, email }, { transaction: tx }));
    } catch (err) {
      if (err instanceof UniqueConstraintError) return null;
      throw err;
    }
  }
};
