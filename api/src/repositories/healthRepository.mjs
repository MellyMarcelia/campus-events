import { sequelize } from '../db/sequelize.mjs';

export const healthRepository = {
  // Throws when the database is unreachable, which turns the health check into a 500.
  async ping() {
    await sequelize.authenticate();
  }
};
