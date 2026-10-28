const express = require('express');
const cors = require('cors');
const { getPool } = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT COUNT(*) AS sucursales FROM sucursales');
    res.json({ ok: true, sucursales: result.recordset[0].sucursales });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'No se pudo conectar a la base de datos' });
  }
});

module.exports = app;