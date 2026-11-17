import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.mjs';

export const Event = sequelize.define('Event', {
  title: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  location: { type: DataTypes.STRING(120), allowNull: false },
  startsAt: { type: DataTypes.DATE, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } }
});

export const Registration = sequelize.define('Registration', {
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false }
}, {
  // Last line of defence against double registrations. sync() only adds it to new tables,
  // so an existing local SQLite file needs `npm run seed` to get it.
  indexes: [{ unique: true, fields: ['eventId', 'email'] }]
});

Event.hasMany(Registration, { foreignKey: { name: 'eventId', allowNull: false }, onDelete: 'CASCADE' });
Registration.belongsTo(Event, { foreignKey: 'eventId' });

// Transactional outbox: a message that still has to go to the broker. It is written in the SAME
// transaction as the registration, so "registered but no mail owed" can never exist. The outbox
// relay publishes it to RabbitMQ and deletes the row once the broker has confirmed it.
export const OutboxMessage = sequelize.define('OutboxMessage', {
  topic: { type: DataTypes.STRING(100), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false }
});

export { sequelize };
