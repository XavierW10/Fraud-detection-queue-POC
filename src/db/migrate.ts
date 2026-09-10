import { db, runMigrations } from './client';

runMigrations(db);
console.log('Migrations applied.');
