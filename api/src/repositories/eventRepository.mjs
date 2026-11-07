import { Event } from '../models/index.mjs';

// Repositories return plain objects, never Sequelize instances: the layers above
// must not be able to call .save() or lazy-load relations behind our back.
const plain = (row) => (row ? row.toJSON() : null);

export const eventRepository = {
  async findAll({ orderBy = 'startsAt' } = {}) {
    const rows = await Event.findAll({ order: [[orderBy, 'ASC']] });
    return rows.map(plain);
  },

  async findById(id) {
    return plain(await Event.findByPk(id));
  },

  async create(data) {
    return plain(await Event.create(data));
  },

  // Returns the updated event, or null when it does not exist.
  async update(id, changes) {
    const event = await Event.findByPk(id);
    if (!event) return null;
    await event.update(changes);
    return plain(event);
  },

  // Returns true when an event was deleted. Registrations go with it (ON DELETE CASCADE).
  async remove(id) {
    const deleted = await Event.destroy({ where: { id } });
    return deleted > 0;
  }
};
