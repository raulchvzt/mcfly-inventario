const router = require('express').Router();
const { z } = require('zod');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const { resolverSucursal } = require('../utils/sucursal');
const { idPositivo } = require('../utils/esquemas');
const { obtenerResumen } = require('../services/resumen.service');

const querySchema = z.object({ sucursalId: idPositivo.optional() });

// Panel: dueño (todo o una sucursal) y encargado (solo la suya)
router.get(
  '/',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const sucursalId = resolverSucursal(req.usuario, req.datos.query.sucursalId, {
      obligatoriaParaDueno: false,
    });
    res.json(await obtenerResumen({ sucursalId, usuario: req.usuario }));
  })
);

module.exports = router;