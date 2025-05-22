import { connect } from '../config/connect.js'; 

export async function up(next) {
  const db = await connect();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL UNIQUE,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      mail_id VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await db.end();
  next();
}

export async function down(next) {
  const db = await connect();
  await db.execute(`DROP TABLE IF EXISTS users`);
  await db.end();
  next();
}