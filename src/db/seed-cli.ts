import { getDb, runMigrations } from './client';
import { seedDatabase } from './seed';

const db = getDb();
runMigrations(db);
seedDatabase(db);
console.log('Seeded demo users, accounts, transactions, cases, approvals and audit trail.');
