// This is an example of a migration file.
// It is recommended to use the following format:


import { connect } from '../config/connect.js'; 

export async function up(next) {
  const db = await connect();
  await db.execute(`
    // QUERY_HERE
  `);
  await db.end();
  next();
}

export async function down(next) {
  const db = await connect();
  await db.execute(`QUERY_HERE`);
  await db.end();
  next();
}
