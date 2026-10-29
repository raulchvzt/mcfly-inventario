const router = require('express').Router();
const { z } = require('zod');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const { resolverSucursal } = require('../utils/sucursal');
const { consultarStock } = require('../services/stock.service');

const consultaSchema = z.object({
  sucursalId: z.coerce.number().int().positive().optional(),
  categoria: z.string().trim().max(50).optional(),
  buscar: z.string().trim().max(120).optional(),
});

const alertasSchema = z.object({
  sucursalId: z.coerce.number().int().positive().optional(),
});

const redondear = (n) => Math.round(n * 100) / 100;

// Stock. Una sucursal: lista plana. Dueño sin sucursal: total del negocio con desglose
router.get(
  '/',
  autenticar,
  validar({ query: consultaSchema }),
  asyncHandler(async (req, res) => {
    const { sucursalId, categoria, buscar } = req.datos.query;
    const sucursal = resolverSucursal(req.usuario, sucursalId, { obligatoriaParaDueno: false });
    const filas = await consultarStock({ sucursalId: sucursal, categoria, buscar });

    if (sucursal) {
      return res.json(filas);
    }

    const porProducto = new Map();
    for (const f of filas) {
      if (!porProducto.has(f.productoId)) {
        porProducto.set(f.productoId, {
          productoId: f.productoId,
          nombre: f.nombre,
          categoria: f.categoria,
          presentacion: f.presentacion,
          unidadMedida: f.unidadMedida,
          total: 0,
          sucursales: [],
        });
      }
      const p = porProducto.get(f.productoId);
      p.total = redondear(p.total + f.stock);
      p.sucursales.push({
        sucursalId: f.sucursalId,
        sucursal: f.sucursal,
        stock: f.stock,
        stockMinimo: f.stockMinimo,
        estado: f.estado,
      });
    }
    res.json([...porProducto.values()]);
  })
);

// Alertas de stock bajo o agotado
router.get(
  '/alertas',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ query: alertasSchema }),
  asyncHandler(async (req, res) => {
    const sucursal = resolverSucursal(req.usuario, req.datos.query.sucursalId, {
      obligatoriaParaDueno: false,
    });
    const alertas = await consultarStock({ sucursalId: sucursal, soloAlertas: true });
    res.json(alertas);
  })
);

module.exports = router;