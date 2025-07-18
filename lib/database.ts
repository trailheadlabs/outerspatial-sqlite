import { Client } from 'pg';

/**
 * Minimal database client for SQLite export service
 * Creates PostgreSQL clients for different schemas
 */

export async function getClient(schema = 'public'): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const client = new Client({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  if (schema !== 'public') {
    await client.query(`SET search_path TO ${schema}, public`);
  }

  return client;
}

export async function getEventsClient(): Promise<Client> {
  const connectionString = process.env.EVENTS_DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('EVENTS_DATABASE_URL environment variable is not set');
  }

  const client = new Client({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  return client;
}