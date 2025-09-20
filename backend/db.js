const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', // Empty password
    database: process.env.DB_NAME || 'neural_planner',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL database successfully!');
        connection.release();
    })
    .catch(error => {
        console.error('❌ MySQL connection failed:', error.message);
    });

module.exports = pool;