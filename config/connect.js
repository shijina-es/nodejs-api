// config/connect.js for migrations
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export async function connect() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  });
}