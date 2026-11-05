const router = require('express').Router();
const { z } = require('zod');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorHttp = require('../utils/errorHttp');
const { resolverSucursal } = require('../utils/sucursal');
const { idPositivo, fechaSchema } = require('../utils/esquemas');
const servicio = require('../services/reportes.service');

const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// Si no se indica periodo, se usan los últimos 30 días
function periodoPorDefecto() {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 29);
  return { desde: fechaLocal(desde), hasta: fechaLocal(hasta) };
}

const querySchema = z.object({
  sucursalId: idPositivo.optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
});

// Reportes: dueño (todo o una sucursal) y encargado (solo la suya)
router.use(autenticar, permitirRoles('dueno', 'encargado'));

function reporte(consulta) {
  return [
    validar({ query: querySchema }),
    asyncHandler(async (req, res) => {
      const defecto = periodoPorDefecto();
      const desde = req.datos.query.desde ?? defecto.desde;
      const hasta = req.datos.query.hasta ?? defecto.hasta;
      if (desde > hasta) {
        throw new ErrorHttp(400, 'La fecha "desde" no puede ser posterior a "hasta"');
      }
      const sucursalId = resolverSucursal(req.usuario, req.datos.query.sucursalId, {
        obligatoriaParaDueno: false,
      });
      const datos = await consulta({ sucursalId, desde, hasta });
      res.json({ desde, hasta, ...datos });
    }),
  ];
}

router.get('/consumo', ...reporte(servicio.consumo));
router.get('/mermas', ...reporte(servicio.mermas));
router.get('/compras', ...reporte(servicio.compras));
router.get('/inventario', ...reporte(servicio.inventario));

module.exports = router;