const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { autenticar } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('email', sql.NVarChar(150), email.trim().toLowerCase())
      .query(`SELECT id, nombre, email, password_hash, rol, sucursal_id, activo
              FROM usuarios WHERE email = @email`);

    const u = result.recordset[0];
    const valido = u && u.activo && (await bcrypt.compare(password, u.password_hash));

    // Mismo mensaje en ambos casos, para no revelar si el email existe
    if (!valido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { sub: String(u.id), rol: u.rol, sucursalId: u.sucursal_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: u.sucursal_id },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/me', autenticar, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.usuario.id)
      .query(`SELECT id, nombre, email, rol, sucursal_id, activo FROM usuarios WHERE id = @id`);

    const u = result.recordset[0];
    if (!u || !u.activo) {
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: u.sucursal_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;