import { getDb, runMigrations } from './client';
import { accounts, transactions, users } from './schema';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function seed() {
  const db = getDb();
  runMigrations(db);

  db.delete(transactions).run();
  db.delete(accounts).run();
  db.delete(users).run();

  db.insert(users)
    .values([
      { email: 'reviewer@example.com', role: 'reviewer' },
      { email: 'senior@example.com', role: 'senior' },
    ])
    .run();

  const seeded = db
    .insert(accounts)
    .values([
      { externalRef: 'ACC-1001', status: 'clear' },
      { externalRef: 'ACC-1002', status: 'flagged' },
      { externalRef: 'ACC-1003', status: 'under_review' },
    ])
    .returning()
    .all();

  const [low, high, mid] = seeded;
  const base = Date.now() - 2 * HOUR;

  db.insert(transactions)
    .values([
      // Low-risk: small amounts, same device, same city.
      {
        accountId: low.id,
        amount: 24.5,
        timestamp: new Date(base),
        latitude: 40.7128,
        longitude: -74.006,
        deviceId: 'device-low-1',
      },
      {
        accountId: low.id,
        amount: 61.0,
        timestamp: new Date(base + 45 * MINUTE),
        latitude: 40.7135,
        longitude: -74.0021,
        deviceId: 'device-low-1',
      },

      // High-risk: high amount, impossible travel, burst velocity, new device.
      {
        accountId: high.id,
        amount: 120.0,
        timestamp: new Date(base),
        latitude: 51.5072,
        longitude: -0.1276,
        deviceId: 'device-high-1',
      },
      {
        accountId: high.id,
        amount: 9800.0,
        timestamp: new Date(base + 5 * MINUTE),
        latitude: 51.5099,
        longitude: -0.1337,
        deviceId: 'device-high-1',
      },
      {
        accountId: high.id,
        amount: 4300.0,
        timestamp: new Date(base + 12 * MINUTE),
        latitude: 35.6762,
        longitude: 139.6503,
        deviceId: 'device-high-2',
      },

      // Mid: moderate amount, single device.
      {
        accountId: mid.id,
        amount: 780.0,
        timestamp: new Date(base + 30 * MINUTE),
        latitude: 48.8566,
        longitude: 2.3522,
        deviceId: 'device-mid-1',
      },
    ])
    .run();

  console.log('Seeded users, accounts and transactions.');
}

seed();
