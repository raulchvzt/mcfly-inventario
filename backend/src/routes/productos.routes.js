const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  categoria: z.string().trim().min(1, 'La categoría es obligatoria').max(50),
  presentacion: z.string().trim().min(1, 'La presentación es obligatoria').max(80),
  unidadMedida: z.enum(['litro', 'mililitro', 'galon', 'pieza']),
  ultimoCosto: z.number().min(0).max(99999999.99).default(0),
});

const estadoSchema = z.object({ activo: z.boolean() });

const listaSchema = z.object({
  activo: z.enum(['true', 'false', 'todos']).default('true'),
  categoria: z.string().trim().max(50).optional(),
  buscar: z.string().trim().max(120).optional(),
});

const COLUMNAS = `id, nombre, categoria, presentacion,
  unidad_medida AS unidadMedida, ultimo_costo AS ultimoCosto, activo`;

const OUTPUT = `INSERTED.id, INSERTED.nombre, INSERTED.categoria, INSERTED.presentacion,
  INSERTED.unidad_medida AS unidadMedida, INSERTED.ultimo_costo AS ultimoCosto,
  INSERTED.activo`;

// Los empleados no ven los costos
function paraRol(producto, rol) {
  if (rol !== 'empleado') return producto;
  const { ultimoCosto, ...resto } = producto;
  return resto;
}

// Listar (cualquier usuario autenticado)
router.get(
  '/',
  autenticar,
  validar({ query: listaSchema }),
  asyncHandler(async (req, res) => {
    const { activo, categoria, buscar } = req.datos.query;
    const request = (await getPool()).request();
    const condiciones = [];

    if (activo !== 'todos') {
      condiciones.push('activo = @activo');
      request.input('activo', sql.Bit, activo === 'true');
    }
    if (categoria) {
      condiciones.push('categoria = @categoria');
      request.input('categoria', sql.NVarChar(50), categoria);
    }
    if (buscar) {
      condiciones.push('nombre LIKE @buscar');
      request.input('buscar', sql.NVarChar(130), `%${buscar}%`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const result = await request.query(
      `SELECT ${COLUMNAS} FROM productos ${where} ORDER BY nombre`
    );
    res.json(result.recordset.map((p) => paraRol(p, req.usuario.rol)));
  })
);

// Detalle (cualquier usuario autenticado)
router.get(
  '/:id',
  autenticar,
  validar({ params: idSchema }),
  asyncHandler(async (req, res) => {
    const result = await (await getPool())
      .request()
      .input('id', sql.Int, req.datos.params.id)
      .query(`SELECT ${COLUMNAS} FROM productos WHERE id = @id`);
    if (!result.recordset[0]) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(paraRol(result.recordset[0], req.usuario.rol));
  })
);

// Crear (solo dueño)
router.post(
  '/',
  autenticar,
  permitirRoles('dueno'),
  validar({ body: productoSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;
    const result = await (await getPool())
      .request()
      .input('nombre', sql.NVarChar(120), b.nombre)
      .input('categoria', sql.NVarChar(50), b.categoria)
      .input('presentacion', sql.NVarChar(80), b.presentacion)
      .input('unidad', sql.VarChar(20), b.unidadMedida)
      .input('costo', sql.Decimal(10, 2), b.ultimoCosto)
      .query(
        `INSERT INTO productos (nombre, categoria, presentacion, unidad_medida, ultimo_costo)
         OUTPUT ${OUTPUT}
         VALUES (@nombre, @categoria, @presentacion, @unidad, @costo)`
      );
    res.status(201).json(result.recordset[0]);
  })
);

// Editar (solo dueño)
router.put(
  '/:id',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: idSchema, body: productoSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { id } = req.datos.params;
    const b = req.datos.body;

    const actual = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT unidad_medida FROM productos WHERE id = @id');

    if (!actual.recordset[0]) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Cambiar la unidad de un producto con movimientos alteraría el sentido de su stock
    if (actual.recordset[0].unidad_medida !== b.unidadMedida) {
      const movs = await pool
        .request()
        .input('id', sql.Int, id)
        .query('SELECT TOP 1 id FROM movimientos WHERE producto_id = @id');
      if (movs.recordset.length > 0) {
        return res.status(409).json({
          error: 'No se puede cambiar la unidad de medida de un producto con movimientos',
        });
      }
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(120), b.nombre)
      .input('categoria', sql.NVarChar(50), b.categoria)
      .input('presentacion', sql.NVarChar(80), b.presentacion)
      .input('unidad', sql.VarChar(20), b.unidadMedida)
      .input('costo', sql.Decimal(10, 2), b.ultimoCosto)
      .query(
        `UPDATE productos
         SET nombre = @nombre, categoria = @categoria, presentacion = @presentacion,
             unidad_medida = @unidad, ultimo_costo = @costo
         OUTPUT ${OUTPUT}
         WHERE id = @id`
      );
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
        `UPDATE productos SET activo = @activo
         OUTPUT ${OUTPUT}
         WHERE id = @id`
      );
    if (!result.recordset[0]) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.recordset[0]);
  })
);

module.exports = router;