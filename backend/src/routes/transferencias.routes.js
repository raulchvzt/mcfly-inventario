const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorHttp = require('../utils/errorHttp');
const { resolverSucursal } = require('../utils/sucursal');
const { idPositivo, fechaSchema } = require('../utils/esquemas');
const {
  crearTransferencia,
  confirmarTransferencia,
  obtenerTransferencia,
} = require('../services/transferencias.service');

const itemSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().positive('Debe ser mayor a 0').max(99999999.99).multipleOf(0.01, 'Máximo 2 decimales'),
});

const crearSchema = z.object({
  sucursalOrigenId: z.number().int().positive().optional(),
  sucursalDestinoId: z.number().int().positive(),
  notas: z.string().trim().max(255).optional(),
  items: z
    .array(itemSchema)
    .min(1, 'La transferencia debe tener al menos un producto')
    .max(50, 'Máximo 50 productos por transferencia')
    .refine(
      (items) => new Set(items.map((i) => i.productoId)).size === items.length,
      'No repitas el mismo producto; suma las cantidades'
    ),
});

const idSchema = z.object({ id: idPositivo });

const listaSchema = z.object({
  estado: z.enum(['pendiente', 'confirmada']).optional(),
  sucursalId: idPositivo.optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
});

// Crear (dueño y encargado). El producto sale del origen y queda en tránsito
router.post(
  '/',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ body: crearSchema }),
  asyncHandler(async (req, res) => {
    const b = req.datos.body;

    if (req.usuario.rol === 'dueno' && b.sucursalOrigenId == null) {
      throw new ErrorHttp(400, 'Indica la sucursal de origen (sucursalOrigenId)');
    }
    const origenId = resolverSucursal(req.usuario, b.sucursalOrigenId);

    if (origenId === b.sucursalDestinoId) {
      throw new ErrorHttp(400, 'El origen y el destino deben ser sucursales distintas');
    }

    const id = await crearTransferencia({
      origenId,
      destinoId: b.sucursalDestinoId,
      usuarioId: req.usuario.id,
      notas: b.notas,
      items: b.items,
    });

    res.status(201).json(await obtenerTransferencia(id));
  })
);

// Listar. El encargado ve las que envía o recibe su sucursal
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
      condiciones.push('(t.sucursal_origen_id = @sucursalId OR t.sucursal_destino_id = @sucursalId)');
      request.input('sucursalId', sql.Int, sucursalId);
    }
    if (q.estado) {
      condiciones.push('t.estado = @estado');
      request.input('estado', sql.VarChar(20), q.estado);
    }
    if (q.desde) {
      condiciones.push('t.creada_en >= CONVERT(date, @desde, 23)');
      request.input('desde', sql.VarChar(10), q.desde);
    }
    if (q.hasta) {
      condiciones.push('t.creada_en < DATEADD(DAY, 1, CONVERT(date, @hasta, 23))');
      request.input('hasta', sql.VarChar(10), q.hasta);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    request.input('offset', sql.Int, (q.pagina - 1) * q.limite);
    request.input('limite', sql.Int, q.limite);

    const total = await request.query(`SELECT COUNT(*) AS total FROM transferencias t ${where}`);
    const lista = await request.query(
      `SELECT t.id, t.estado, t.creada_en AS creadaEn, t.confirmada_en AS confirmadaEn,
              o.id AS origenId, o.nombre AS origen,
              d.id AS destinoId, d.nombre AS destino,
              c.nombre AS creadaPor, f.nombre AS confirmadaPor,
              (SELECT COUNT(*) FROM transferencia_detalle td WHERE td.transferencia_id = t.id) AS productos
       FROM transferencias t
       JOIN sucursales o ON o.id = t.sucursal_origen_id
       JOIN sucursales d ON d.id = t.sucursal_destino_id
       JOIN usuarios c ON c.id = t.creada_por
       LEFT JOIN usuarios f ON f.id = t.confirmada_por
       ${where}
       ORDER BY t.creada_en DESC, t.id DESC
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

// Detalle
router.get(
  '/:id',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ params: idSchema }),
  asyncHandler(async (req, res) => {
    const t = await obtenerTransferencia(req.datos.params.id);
    if (!t) throw new ErrorHttp(404, 'Transferencia no encontrada');

    if (
      req.usuario.rol === 'encargado' &&
      t.origenId !== req.usuario.sucursalId &&
      t.destinoId !== req.usuario.sucursalId
    ) {
      throw new ErrorHttp(403, 'Solo puedes consultar transferencias de tu sucursal');
    }
    res.json(t);
  })
);

// Confirmar recepción (encargado de la sucursal destino, o el dueño)
router.post(
  '/:id/confirmar',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ params: idSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.datos.params;
    await confirmarTransferencia({ id, usuario: req.usuario });
    res.json(await obtenerTransferencia(id));
  })
);

module.exports = router;