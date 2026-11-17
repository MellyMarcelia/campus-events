import { sequelize } from '../models/index.mjs';

// Lets a service run several repository calls as one all-or-nothing unit, without knowing Sequelize:
// the service gets an opaque `tx` and passes it on to the repositories.

// SQLite has no row locks, and with ':memory:' (the tests) every transaction shares one connection,
// so two at once would clash. Queueing them in this process makes them run one after the other.
// Fine for tests and local development; production runs on Postgres, which locks rows itself.
let sqliteQueue = Promise.resolve();

function runOneAtATime(work) {
  const result = sqliteQueue.then(work);
  sqliteQueue = result.catch(() => {}); // a failed transaction must not block the next one
  return result;
}

export const transactions = {
  // Commits when `work` resolves, rolls back when it throws (the error is passed on).
  run(work) {
    const inTransaction = () => sequelize.transaction((tx) => work(tx));
    return sequelize.getDialect() === 'sqlite' ? runOneAtATime(inTransaction) : inTransaction();
  }
};
