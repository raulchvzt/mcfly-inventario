const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const { resolverSucursal } = require('../utils/sucursal');
const { registrarMovimiento } = require('../services/movimientos.service');

const idPositivo = z.coerce.number().int().positive();

const cantidadPositiva = z
  .number()
  .positive('Debe ser mayor a 0')
  .max(99999999.99)
  .multipleOf(0.01, 'Máximo 2 decimales');

const consumoSchema = z.object({
  productoId: idPositivo,
  sucursalId: idPositivo.optional(),
  cantidad: cantidadPositiva,
  motivo: z.string().trim().max(255).optional(),
});

const mermaSchema = consumoSchema.extend({
  motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(255),
});

const ajusteSchema = z.object({
  productoId: idPositivo,
  sucursalId: idPositivo.optional(),
  cantidad: z
    .number()
    .min(-99999999.99)
    .max(99999999.99)
    .multipleOf(0.01, 'Máximo 2 decimales')
    .refine((n) => n !== 0, 'La cantidad no puede ser 0'),
  motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(255),
});

// Crea la ruta de registro de un tipo de movimiento.
// Consumo y merma reciben la cantidad en positivo y se guardan en negativo.
function rutaRegistro(tipo, roles, schema, esSalida) {
  return [
    autenticar,
    permitirRoles(...roles),
    validar({ body: schema }),
    asyncHandler(async (req, res) => {
      const b = req.datos.body;
      const sucursalId = resolverSucursal(req.usuario, b.sucursalId);
      const resultado = await registrarMovimiento({
        productoId: b.productoId,
        sucursalId,
        tipo,
        cantidad: esSalida ? -b.cantidad : b.cantidad,
        motivo: b.motivo || null,
        usuarioId: req.usuario.id,
      });
      res.status(201).json(resultado);
    }),
  ];
}

router.post('/consumo', ...rutaRegistro('consumo', ['dueno', 'encargado', 'empleado'], consumoSchema, true));
router.post('/merma', ...rutaRegistro('merma', ['dueno', 'encargado'], mermaSchema, true));
router.post('/ajuste', ...rutaRegistro('ajuste', ['dueno', 'encargado'], ajusteSchema, false));

// ---------- Historial (RF7) ----------

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Fecha inválida');

const listaSchema = z.object({
  sucursalId: idPositivo.optional(),
  productoId: idPositivo.optional(),
  usuarioId: idPositivo.optional(),
  tipo: z
    .enum(['entrada', 'consumo', 'merma', 'transferencia_salida', 'transferencia_entrada', 'ajuste'])
    .optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
});

router.get(
  '/',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ query: listaSchema }),
  asyncHandler(async (req, res) => {
    const q = req.datos.query;
    const sucursalId = resolverSucursal(req.usuario, q.sucursalId, { obligatoriaParaDueno: false });

    const request = (await getPool()).request();
    const condiciones = [];

    if (sucursalId) {
      condiciones.push('m.sucursal_id = @sucursalId');
      request.input('sucursalId', sql.Int, sucursalId);
    }
    if (q.productoId) {
      condiciones.push('m.producto_id = @productoId');
      request.input('productoId', sql.Int, q.productoId);
    }
    if (q.usuarioId) {
      condiciones.push('m.usuario_id = @usuarioId');
      request.input('usuarioId', sql.Int, q.usuarioId);
    }
    if (q.tipo) {
      condiciones.push('m.tipo = @tipo');
      request.input('tipo', sql.VarChar(25), q.tipo);
    }
    if (q.desde) {
      condiciones.push('m.fecha >= CONVERT(date, @desde, 23)');
      request.input('desde', sql.VarChar(10), q.desde);
    }
    if (q.hasta) {
      condiciones.push('m.fecha < DATEADD(DAY, 1, CONVERT(date, @hasta, 23))');
      request.input('hasta', sql.VarChar(10), q.hasta);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    request.input('offset', sql.Int, (q.pagina - 1) * q.limite);
    request.input('limite', sql.Int, q.limite);

    const total = await request.query(`SELECT COUNT(*) AS total FROM movimientos m ${where}`);
    const lista = await request.query(
      `SELECT m.id, m.fecha, m.tipo, m.cantidad, m.costo_unitario AS costoUnitario, m.motivo,
              p.id AS productoId, p.nombre AS producto, p.presentacion, p.unidad_medida AS unidadMedida,
              s.id AS sucursalId, s.nombre AS sucursal,
              u.id AS usuarioId, u.nombre AS usuario,
              m.transferencia_id AS transferenciaId, m.compra_detalle_id AS compraDetalleId
       FROM movimientos m
       JOIN productos p ON p.id = m.producto_id
       JOIN sucursales s ON s.id = m.sucursal_id
       JOIN usuarios u ON u.id = m.usuario_id
       ${where}
       ORDER BY m.fecha DESC, m.id DESC
       OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY`
    );

    res.json({
      datos: lista.recordset,
      pagina: q.pagina,
      limite: q.limite,
      total: total.recordset[0].total,
    });
  })
);

router.get(
  '/filtros',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const reqUsuarios = pool.request();
    let filtroUsuarios = '';
    if (req.usuario.rol === 'encargado') {
      filtroUsuarios = `WHERE sucursal_id = @sucursal
        OR id IN (SELECT usuario_id FROM movimientos WHERE sucursal_id = @sucursal)`;
      reqUsuarios.input('sucursal', sql.Int, req.usuario.sucursalId);
    }
    const [productos, usuarios] = await Promise.all([
      pool.request().query('SELECT id, nombre, presentacion FROM productos ORDER BY nombre, presentacion'),
      reqUsuarios.query(`SELECT id, nombre FROM usuarios ${filtroUsuarios} ORDER BY nombre`),
    ]);
    res.json({ productos: productos.recordset, usuarios: usuarios.recordset });
  })
);


module.exports = router;