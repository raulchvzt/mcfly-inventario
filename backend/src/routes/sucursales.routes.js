const router = require('express').Router();
const { getPool } = require('../config/db');
const { autenticar } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get(
  '/',
  autenticar,
  asyncHandler(async (req, res) => {
    const result = await (await getPool())
      .request()
      .query('SELECT id, nombre FROM sucursales WHERE activa = 1 ORDER BY nombre');
    res.json(result.recordset);
  })
);

module.exports = router;