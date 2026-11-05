require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../src/config/db');

async function main() {
  const [nombre, email, password] = process.argv.slice(2);

  if (!nombre || !email || !password) {
    console.log('Uso: node scripts/crear-dueno.js "Nombre" correo@ejemplo.com "contraseña"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  const pool = await getPool();
  const correo = email.trim().toLowerCase();

  const existe = await pool.request()
    .input('email', sql.NVarChar(150), correo)
    .query('SELECT id FROM usuarios WHERE email = @email');

  if (existe.recordset.length > 0) {
    console.log('Ya existe un usuario con ese correo');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  await pool.request()
    .input('nombre', sql.NVarChar(100), nombre)
    .input('email', sql.NVarChar(150), correo)
    .input('hash', sql.VarChar(255), hash)
    .query(`INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id)
            VALUES (@nombre, @email, @hash, 'dueno', NULL)`);

  console.log('Dueño creado correctamente');
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});