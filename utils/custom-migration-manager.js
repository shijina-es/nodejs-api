import dotenv from 'dotenv'
dotenv.config();

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR;
const TRACKING_TABLE = process.env.TRACKING_TABLE;

if (!MIGRATIONS_DIR || !TRACKING_TABLE) {
    console.error('MIGRATIONS_DIR and TRACKING_TABLE environment variables must be set.');
    process.exit(1);
}
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'test_db',
  port: process.env.DB_PORT || 3306,
};

async function calculateHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function ensureMigrationsTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      hash VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.execute(`SELECT name, hash, applied_at FROM ${TRACKING_TABLE}`);
  return new Map(rows.map(row => [row.name, { hash: row.hash, applied_at: row.applied_at }]));
}

async function applyMigrations(connection) {
  await ensureMigrationsTable(connection);
  const appliedMigrations = await getAppliedMigrations(connection);

  const files = await fs.readdir(MIGRATIONS_DIR);
  const upMigrations = files.filter(f => f.endsWith('-up.sql')).sort();

  for (const file of upMigrations) {
    const name = file.replace(/-up\.sql$/, '');
    if (appliedMigrations.has(name)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const hash = await calculateHash(sql);

    console.log(`Applying migration: ${name}`);
    await connection.query(sql);
    await connection.execute(`INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`, [name, hash]);
  }
}

async function rollbackMigration(connection, targetName = null) {
  await ensureMigrationsTable(connection);
  const [rows] = await connection.query(`
    SELECT name FROM ${TRACKING_TABLE}
    ${targetName ? 'WHERE name = ?' : ''}
    ORDER BY applied_at DESC LIMIT 1
  `, targetName ? [targetName] : []);

  if (rows.length === 0) {
    console.log('No migration found to rollback.');
    return;
  }

  const { name } = rows[0];
  const downFile = path.join(MIGRATIONS_DIR, `${name}-down.sql`);

  try {
    const sql = await fs.readFile(downFile, 'utf-8');
    console.log(`Rolling back migration: ${name}`);
    await connection.query(sql);
    await connection.execute(`DELETE FROM ${TRACKING_TABLE} WHERE name = ?`, [name]);
  } catch (err) {
    console.error(`Failed to rollback ${name}:`, err.message);
  }
}

async function createMigration(name) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const base = `${timestamp}-${name}`;
  const upPath = path.join(MIGRATIONS_DIR, `${base}-up.sql`);
  const downPath = path.join(MIGRATIONS_DIR, `${base}-down.sql`);

  await fs.writeFile(upPath, '-- Write your UP migration here\n');
  await fs.writeFile(downPath, '-- Write your DOWN migration here\n');

  console.log(`Created migration files:\n  ${upPath}\n  ${downPath}`);
}

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  const [cmd, version] = process.argv.slice(2);

  if (cmd === 'apply') {
    await applyMigrations(connection);
  } else if (cmd === 'rollback') {
    await rollbackMigration(connection, version);
  } else if (cmd === 'create') {
    if (!version) {
      console.error('Please specify a migration name.');
      process.exit(1);
    }
    await createMigration(version);
  }
  else {
    console.log("\nUsage: npm run db:migrate [apply|rollback|create]");

    console.log(`
       npm run db:migrate apply               # Apply all pending migrations
       npm run db:migrate rollback            # Rollback last migration
       npm run db:migrate rollback <name>     # Rollback to specific version
       npm run db:migrate create <name>       # Create new migration with <name>\n`);

  }

  await connection.end();
}

main().catch(console.error);