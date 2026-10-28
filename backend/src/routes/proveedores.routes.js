const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  telefono: z.string().trim().max(30).nullish(),
  contacto: z.string().trim().max(100).nullish(),
  notas: z.string().trim().max(255).nullish(),
});

const estadoSchema = z.object({ activo: z.boolean() });

const listaSchema = z.object({
  activo: z.enum(['true', 'false', 'todos']).default('true'),
});

const OUTPUT = `INSERTED.id, INSERTED.nombre, INSERTED.telefono,
  INSERTED.contacto, INSERTED.notas, INSERTED.activo`;

// Listar (dueño y encargado)
router.get(
  '/',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ query: listaSchema }),
  asyncHandler(async (req, res) => {
    const { activo } = req.datos.query;
    const request = (await getPool()).request();
    let where = '';
    if (activo !== 'todos') {
      where = 'WHERE activo = @activo';
      request.input('activo', sql.Bit, activo === 'true');
    }
    const result = await request.query(
      `SELECT id, nombre, telefono, contacto, notas, activo
       FROM proveedores ${where} ORDER BY nombre`
    );
    res.json(result.recordset);
  })
);

// Crear (solo dueño)
router.post(
  '/',
  autenticar,
  permitirRoles('dueno'),
  validar({ body: proveedorSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;
    const result = await (await getPool())
      .request()
      .input('nombre', sql.NVarChar(120), b.nombre)
      .input('telefono', sql.VarChar(30), b.telefono ?? null)
      .input('contacto', sql.NVarChar(100), b.contacto ?? null)
      .input('notas', sql.NVarChar(255), b.notas ?? null)
      .query(
        `INSERT INTO proveedores (nombre, telefono, contacto, notas)
         OUTPUT ${OUTPUT}
         VALUES (@nombre, @telefono, @contacto, @notas)`
      );
    res.status(201).json(result.recordset[0]);
  })
);

// Editar (solo dueño)
router.put(
  '/:id',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: idSchema, body: proveedorSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;
    const result = await (await getPool())
      .request()
      .input('id', sql.Int, req.datos.params.id)
      .input('nombre', sql.NVarChar(120), b.nombre)
      .input('telefono', sql.VarChar(30), b.telefono ?? null)
      .input('contacto', sql.NVarChar(100), b.contacto ?? null)
      .input('notas', sql.NVarChar(255), b.notas ?? null)
      .query(
        `UPDATE proveedores
         SET nombre = @nombre, telefono = @telefono, contacto = @contacto, notas = @notas
         OUTPUT ${OUTPUT}
         WHERE id = @id`
      );
    if (!result.recordset[0]) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(result.recordset[0]);
  })
);

// Activar o desactivar (solo dueño). Nunca se borra (RN6)
router.patch(
  '/:id/estado',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: idSchema, body: estadoSchema }),
  asyncHandler(async (req, res) => {
    const result = await (await getPool())
      .request()
      .input('id', sql.Int, req.datos.params.id)
      .input('activo', sql.Bit, req.datos.body.activo)
      .query(
        `UPDATE proveedores SET activo = @activo
         OUTPUT ${OUTPUT}
         WHERE id = @id`
      );
    if (!result.recordset[0]) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(result.recordset[0]);
  })
);

module.exports = router;