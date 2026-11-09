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
});

Event.hasMany(Registration, { foreignKey: { name: 'eventId', allowNull: false }, onDelete: 'CASCADE' });
Registration.belongsTo(Event, { foreignKey: 'eventId' });

// A confirmation mail that failed. Only failed mails get a row: the hourly retry job
// (services/mailRetryService.mjs) tries again and deletes the row once the mail is out.
// A separate table instead of columns on Registration: sync() creates it in an existing database,
// and the registrations API keeps returning exactly the same fields.
export const PendingMail = sequelize.define('PendingMail', {
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  lastError: { type: DataTypes.TEXT, allowNull: true }
});

Registration.hasOne(PendingMail, { foreignKey: { name: 'registrationId', allowNull: false, unique: true }, onDelete: 'CASCADE' });
PendingMail.belongsTo(Registration, { foreignKey: 'registrationId' });

export { sequelize };
