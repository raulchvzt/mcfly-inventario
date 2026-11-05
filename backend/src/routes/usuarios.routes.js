const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');

// Todo este módulo es solo para el dueño
router.use(autenticar, permitirRoles('dueno'));

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres'); // límite de bcrypt

const crearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  email: z.string().trim().toLowerCase().max(150).email('Correo inválido'),
  password: passwordSchema,
  rol: z.enum(['encargado', 'empleado']),
  sucursalId: z.number().int().positive(),
});

const editarSchema = crearSchema.omit({ password: true });
const passwordBodySchema = z.object({ password: passwordSchema });
const estadoSchema = z.object({ activo: z.boolean() });

const listaSchema = z.object({
  activo: z.enum(['true', 'false', 'todos']).default('true'),
  rol: z.enum(['dueno', 'encargado', 'empleado']).optional(),
  sucursalId: z.coerce.number().int().positive().optional(),
});

const OUTPUT = `INSERTED.id, INSERTED.nombre, INSERTED.email, INSERTED.rol,
  INSERTED.sucursal_id AS sucursalId, INSERTED.activo`;

async function sucursalActiva(pool, id) {
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT id FROM sucursales WHERE id = @id AND activa = 1');
  return r.recordset.length > 0;
}

// Listar
router.get(
  '/',
  validar({ query: listaSchema }),
  asyncHandler(async (req, res) => {
    const { activo, rol, sucursalId } = req.datos.query;
    const request = (await getPool()).request();
    const condiciones = [];

    if (activo !== 'todos') {
      condiciones.push('u.activo = @activo');
      request.input('activo', sql.Bit, activo === 'true');
    }
    if (rol) {
      condiciones.push('u.rol = @rol');
      request.input('rol', sql.VarChar(20), rol);
    }
    if (sucursalId) {
      condiciones.push('u.sucursal_id = @sucursalId');
      request.input('sucursalId', sql.Int, sucursalId);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const result = await request.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.sucursal_id AS sucursalId,
              s.nombre AS sucursal, u.activo, u.creado_en AS creadoEn
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       ${where}
       ORDER BY u.nombre`
    );
    res.json(result.recordset);
  })
);

// Crear (encargados y empleados; el dueño se crea con el script)
router.post(
  '/',
  validar({ body: crearSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;
    const pool = await getPool();

    if (!(await sucursalActiva(pool, b.sucursalId))) {
      return res.status(400).json({ error: 'La sucursal no existe o está inactiva' });
    }

    const hash = await bcrypt.hash(b.password, 10);
    const result = await pool
      .request()
      .input('nombre', sql.NVarChar(100), b.nombre)
      .input('email', sql.NVarChar(150), b.email)
      .input('hash', sql.VarChar(255), hash)
      .input('rol', sql.VarChar(20), b.rol)
      .input('sucursalId', sql.Int, b.sucursalId)
      .query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id)
         OUTPUT ${OUTPUT}
         VALUES (@nombre, @email, @hash, @rol, @sucursalId)`
      );
    res.status(201).json(result.recordset[0]);
  })
);

// Editar datos, rol y sucursal
router.put(
  '/:id',
  validar({ params: idSchema, body: editarSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.datos.params;
    const b = req.datos.body;
    const pool = await getPool();

    const actual = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT rol FROM usuarios WHERE id = @id');

    if (!actual.recordset[0]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (actual.recordset[0].rol === 'dueno') {
      return res.status(403).json({ error: 'Un dueño no se modifica desde la API' });
    }
    if (!(await sucursalActiva(pool, b.sucursalId))) {
      return res.status(400).json({ error: 'La sucursal no existe o está inactiva' });
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(100), b.nombre)
      .input('email', sql.NVarChar(150), b.email)
      .input('rol', sql.VarChar(20), b.rol)
      .input('sucursalId', sql.Int, b.sucursalId)
      .query(
        `UPDATE usuarios
         SET nombre = @nombre, email = @email, rol = @rol, sucursal_id = @sucursalId
         OUTPUT ${OUTPUT}
         WHERE id = @id`
      );
    res.json(result.recordset[0]);
  })
);

// Restablecer contraseña
router.patch(
  '/:id/password',
  validar({ params: idSchema, body: passwordBodySchema }),
  asyncHandler(async (req, res) => {
    const hash = await bcrypt.hash(req.datos.body.password, 10);
    const result = await (await getPool())
      .request()
      .input('id', sql.Int, req.datos.params.id)
      .input('hash', sql.VarChar(255), hash)
      .query('UPDATE usuarios SET password_hash = @hash WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ ok: true });
  })
);

// Activar o desactivar. Nunca se borra (RN6)
router.patch(
  '/:id/estado',
  validar({ params: idSchema, body: estadoSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.datos.params;
    const { activo } = req.datos.body;

    if (id === req.usuario.id && !activo) {
      return res.status(409).json({ error: 'No puedes desactivarte a ti mismo' });
    }

    const result = await (await getPool())
      .request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo)
      .query(`UPDATE usuarios SET activo = @activo OUTPUT ${OUTPUT} WHERE id = @id`);

    if (!result.recordset[0]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(result.recordset[0]);
  })
);

module.exports = router;