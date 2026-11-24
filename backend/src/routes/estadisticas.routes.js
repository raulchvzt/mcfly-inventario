const router = require('express').Router();
const { z } = require('zod');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorHttp = require('../utils/errorHttp');
const { resolverSucursal } = require('../utils/sucursal');
const { idPositivo, fechaSchema } = require('../utils/esquemas');
const { obtenerEstadisticas } = require('../services/estadisticas.service');

const MAX_DIAS = 366;
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// Si no se indica periodo, se usan los últimos 90 días
function periodoPorDefecto() {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 89);
  return { desde: fechaLocal(desde), hasta: fechaLocal(hasta) };
}

const querySchema = z.object({
  sucursalId: idPositivo.optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
});

// Estadísticas: dueño (todo o una sucursal) y encargado (solo la suya), igual que los reportes
router.use(autenticar, permitirRoles('dueno', 'encargado'));

router.get(
  '/',
  validar({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const defecto = periodoPorDefecto();
    const desde = req.datos.query.desde ?? defecto.desde;
    const hasta = req.datos.query.hasta ?? defecto.hasta;

    if (desde > hasta) {
      throw new ErrorHttp(400, 'La fecha "desde" no puede ser posterior a "hasta"');
    }
    const dias = Math.round((new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000) + 1;
    if (dias > MAX_DIAS) {
      throw new ErrorHttp(400, `El periodo no puede ser mayor a ${MAX_DIAS} días`);
    }

    const sucursalId = resolverSucursal(req.usuario, req.datos.query.sucursalId, {
      obligatoriaParaDueno: false,
    });
    res.json(await obtenerEstadisticas({ sucursalId, desde, hasta }));
  })
);

module.exports = router;
