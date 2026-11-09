import { Op } from 'sequelize';
import { Event, PendingMail, Registration } from '../models/index.mjs';

// Flattens a row with its registration and event into plain objects, so the service never sees Sequelize.
function toPendingMail(row) {
  const { Registration: registrationWithEvent, ...mail } = row.toJSON();
  const { Event: event, ...registration } = registrationWithEvent;
  return { ...mail, registration, event };
}

export const pendingMailRepository = {
  async add(registrationId, lastError) {
    await PendingMail.create({ registrationId, lastError });
  },

  // Mails that have attempts left. Rows that reached maxAttempts stay in the table, for a human to look at.
  async findRetryable(maxAttempts) {
    const rows = await PendingMail.findAll({
      where: { attempts: { [Op.lt]: maxAttempts } },
      include: { model: Registration, include: [Event] },
      order: [['createdAt', 'ASC']]
    });
    return rows.map(toPendingMail);
  },

  async update(id, { attempts, lastError }) {
    await PendingMail.update({ attempts, lastError }, { where: { id } });
  },

  async remove(id) {
    await PendingMail.destroy({ where: { id } });
  }
};
