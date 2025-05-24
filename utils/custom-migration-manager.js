import dotenv from 'dotenv'
dotenv.config();

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import chalk from 'chalk';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR;
const TRACKING_TABLE = process.env.TRACKING_TABLE;

if (!MIGRATIONS_DIR || !TRACKING_TABLE) {
    console.error('MIGRATIONS_DIR and TRACKING_TABLE environment variables must be set.');
    process.exit(1);
}
const DB_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  multipleStatements: true,
  connectionLimit: 10,
  waitForConnections: true,
};

if (!DB_CONFIG.host || !DB_CONFIG.user || !DB_CONFIG.password || !DB_CONFIG.database || !DB_CONFIG.port) {
  // Check if all required DB_CONFIG properties are set
  console.error('Database configuration is incomplete. Please set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT environment variables.\n');
  process.exit(1);
}


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
      console.error(chalk.red('Please specify a migration name.\nUsage: npm run db:migrate create <name>'));
      console.log(chalk.cyan('\nExample: npm run db:migrate create add_users_table'));
      console.log(chalk.yellow('This will create two files: <timestamp>-<name>-up.sql and <timestamp>-<name>-down.sql in the migrations directory.'));
      console.log(chalk.green('You can then edit these files to define your migration logic.\n'));
      process.exit(1);
    }
    await createMigration(version);
  } else if (cmd === 'list') {
    const appliedMigrations = await getAppliedMigrations(connection);

    const tableData = Array.from(appliedMigrations.entries())
      .sort(([, a], [, b]) => new Date(a.applied_at) - new Date(b.applied_at)) // Sort by date ascending
      .map(([name, { hash, applied_at }]) => ({
        Name: name,
        Hash: hash,
        'Applied At': applied_at,
      }));

    console.log('Applied migrations:');
    console.table(tableData);
  }
  else {
    console.error(chalk.red("\nUsage: npm run db:migrate [apply|rollback|create|list]"));

    console.log(chalk.green(`
       npm run db:migrate apply               # Apply all pending migrations
       npm run db:migrate rollback            # Rollback last migration
       npm run db:migrate rollback <name>     # Rollback to specific version
       npm run db:migrate list                # List all applied migrations
       npm run db:migrate create <name>       # Create new migration with <name>\n`));

  }

  await connection.end();
}

main().catch(console.error);