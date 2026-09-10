import { getDb, runMigrations } from './client';

runMigrations(getDb());
console.log('Migrations applied.');
