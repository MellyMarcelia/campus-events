import { Sequelize } from 'sequelize';
import { env } from '../config/env.mjs';

function createPostgres() {
  return new Sequelize(env.databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: env.databaseSsl ? { ssl: { require: true, rejectUnauthorized: true } } : {}
  });
}

function createSqlite() {
  return new Sequelize({ dialect: 'sqlite', storage: env.dbStorage, logging: false });
}

export const sequelize = env.databaseUrl ? createPostgres() : createSqlite();
