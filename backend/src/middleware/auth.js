const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');

async function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    // Se confía en la base de datos, no en lo que dice el token
    const result = await (await getPool())
      .request()
      .input('id', sql.Int, Number(payload.sub))
      .query('SELECT id, rol, sucursal_id, activo FROM usuarios WHERE id = @id');

    const u = result.recordset[0];
    if (!u || !u.activo) {
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }

    req.usuario = { id: u.id, rol: u.rol, sucursalId: u.sucursal_id };
    next();
  } catch (err) {
    next(err);
  }
}

function permitirRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { autenticar, permitirRoles };