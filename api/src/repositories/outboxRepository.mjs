import { OutboxMessage } from '../models/index.mjs';

const plain = (row) => row.toJSON();

export const outboxRepository = {
  // Always called with the transaction of the change it belongs to (see registrationService).
  async add(topic, payload, tx) {
    await OutboxMessage.create({ topic, payload }, { transaction: tx });
  },

  // Oldest first, so messages leave in the order they were written.
  async findUnsent(limit) {
    const rows = await OutboxMessage.findAll({ order: [['id', 'ASC']], limit });
    return rows.map(plain);
  },

  async remove(id) {
    await OutboxMessage.destroy({ where: { id } });
  }
};
