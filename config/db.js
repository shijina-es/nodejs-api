import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

export default {
  registerUser: async (username, passwordHash, user_id, mail_id) => {
    return await db.execute(
      'INSERT INTO users (username, password, user_id, mail_id) VALUES (?, ?, ?, ?)',
      [username, passwordHash, user_id, mail_id]
    );
  },

  getUserByMail: async (mail_id) => {
    //const [rows] = await db.execute(
      let [response] = await db.query(
      'SELECT * FROM users WHERE mail_id = ?',
      [mail_id]
    );
    //return rows[0];
    if (response.length > 0 ) {
      //return response[0];
      return response?.map((record) =>{ // // using optional chaining character ? here no value it will return null
          return{
              user_id:record.user_id,
              username:record.username,
              mail_id:record.mail_id,
              password:record.password
          }
      })
    }
  },


  deleteUser: async (user_id) => {
    let [response] = await db.execute(
      'DELETE FROM users WHERE user_id = ?',
      [user_id]
    );

    if (response.affectedRows > 0) {
      return true;
    } else {
      return false;
    }
  },

  getAllUsers: async () => {
    let [response] = await db.query('SELECT * FROM users');
    return response;
  }

};