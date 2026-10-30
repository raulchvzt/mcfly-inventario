const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorHttp = require('../utils/errorHttp');
const { resolverSucursal } = require('../utils/sucursal');
const { registrarCompra, obtenerCompra } = require('../services/compras.service');

const idPositivo = z.coerce.number().int().positive();

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Fecha inválida');

function hoyLocal() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const itemSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().positive('Debe ser mayor a 0').max(99999999.99).multipleOf(0.01, 'Máximo 2 decimales'),
  costoUnitario: z.number().min(0).max(99999999.99).multipleOf(0.01, 'Máximo 2 decimales'),
});

const compraSchema = z.object({
  proveedorId: z.number().int().positive(),
  sucursalId: z.number().int().positive().optional(),
  formaPago: z.enum(['contado', 'credito', 'caja_chica']),
  numeroTicket: z.string().trim().min(1, 'El número de ticket o factura es obligatorio').max(50),
  fecha: fechaSchema.refine((s) => s <= hoyLocal(), 'La fecha no puede ser futura').optional(),
  notas: z.string().trim().max(255).optional(),
  items: z
    .array(itemSchema)
    .min(1, 'La compra debe tener al menos un producto')
    .max(50, 'Máximo 50 productos por compra')
    .refine(
      (items) => new Set(items.map((i) => i.productoId)).size === items.length,
      'No repitas el mismo producto en una compra; suma las cantidades'
    ),
});

const idSchema = z.object({ id: idPositivo });

const listaSchema = z.object({
  sucursalId: idPositivo.optional(),
  proveedorId: idPositivo.optional(),
  formaPago: z.enum(['contado', 'credito', 'caja_chica']).optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
});

// Registrar compra (dueño y encargado)
router.post(
  '/',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ body: compraSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;
    const sucursalId = resolverSucursal(req.usuario, b.sucursalId);

    const compraId = await registrarCompra({
      proveedorId: b.proveedorId,
      sucursalId,
      usuarioId: req.usuario.id,
      fecha: b.fecha,
      formaPago: b.formaPago,
      numeroTicket: b.numeroTicket,
      notas: b.notas,
      items: b.items,
    });

    res.status(201).json(await obtenerCompra(compraId));
  })
);

// Listar compras
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
      condiciones.push('c.sucursal_id = @sucursalId');
      request.input('sucursalId', sql.Int, sucursalId);
    }
    if (q.proveedorId) {
      condiciones.push('c.proveedor_id = @proveedorId');
      request.input('proveedorId', sql.Int, q.proveedorId);
    }
    if (q.formaPago) {
      condiciones.push('c.forma_pago = @formaPago');
      request.input('formaPago', sql.VarChar(20), q.formaPago);
    }
    if (q.desde) {
      condiciones.push('c.fecha >= CONVERT(date, @desde, 23)');
      request.input('desde', sql.VarChar(10), q.desde);
    }
    if (q.hasta) {
      condiciones.push('c.fecha <= CONVERT(date, @hasta, 23)');
      request.input('hasta', sql.VarChar(10), q.hasta);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    request.input('offset', sql.Int, (q.pagina - 1) * q.limite);
    request.input('limite', sql.Int, q.limite);

    const total = await request.query(`SELECT COUNT(*) AS total FROM compras c ${where}`);
    const lista = await request.query(
      `SELECT c.id, c.fecha, c.forma_pago AS formaPago, c.numero_ticket AS numeroTicket,
              v.id AS proveedorId, v.nombre AS proveedor,
              s.id AS sucursalId, s.nombre AS sucursal,
              u.nombre AS usuario,
              (SELECT CAST(SUM(d.cantidad * d.costo_unitario) AS DECIMAL(12,2))
               FROM compra_detalle d WHERE d.compra_id = c.id) AS total
       FROM compras c
       JOIN proveedores v ON v.id = c.proveedor_id
       JOIN sucursales s ON s.id = c.sucursal_id
       JOIN usuarios u ON u.id = c.usuario_id
       ${where}
       ORDER BY c.fecha DESC, c.id DESC
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

// Detalle de una compra
router.get(
  '/:id',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ params: idSchema }),
  asyncHandler(async (req, res) => {
    const compra = await obtenerCompra(req.datos.params.id);
    if (!compra) throw new ErrorHttp(404, 'Compra no encontrada');

    if (req.usuario.rol === 'encargado' && compra.sucursalId !== req.usuario.sucursalId) {
      throw new ErrorHttp(403, 'Solo puedes consultar compras de tu sucursal');
    }
    res.json(compra);
  })
);

module.exports = router;