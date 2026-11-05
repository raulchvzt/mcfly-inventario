const { sql } = require('../config/db');
const ErrorHttp = require('../utils/errorHttp');

const redondear = (n) => Math.round(n * 100) / 100;

// Bloqueo por producto y sucursal: las operaciones que restan stock se hacen en fila.
// Si una operación bloquea varios productos, debe hacerlo en orden ascendente de productoId
// para evitar interbloqueos.
async function bloquearStock(tx, productoId, sucursalId) {
  const r = await new sql.Request(tx)
    .input('recurso', sql.NVarChar(255), `stock:${productoId}:${sucursalId}`)
    .query(`DECLARE @r INT;
            EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive',
                 @LockOwner = 'Transaction', @LockTimeout = 5000;
            SELECT @r AS resultado;`);
  if (r.recordset[0].resultado < 0) {
    throw new ErrorHttp(503, 'El sistema está ocupado, intenta de nuevo');
  }
}

async function stockActual(tx, productoId, sucursalId) {
  const r = await new sql.Request(tx)
    .input('p', sql.Int, productoId)
    .input('s', sql.Int, sucursalId)
    .query(`SELECT ISNULL(SUM(cantidad), 0) AS stock
            FROM movimientos WHERE producto_id = @p AND sucursal_id = @s`);
  return redondear(r.recordset[0].stock);
}

// Costo promedio ponderado de las compras; si no hay compras, el último costo del producto
async function costoPromedio(tx, productoId) {
  const r = await new sql.Request(tx)
    .input('p', sql.Int, productoId)
    .query(`SELECT ISNULL(
              (SELECT CAST(SUM(cantidad * costo_unitario) / NULLIF(SUM(cantidad), 0) AS DECIMAL(10,2))
               FROM compra_detalle WHERE producto_id = @p),
              (SELECT ultimo_costo FROM productos WHERE id = @p)) AS costo`);
  return r.recordset[0].costo;
}

module.exports = { redondear, bloquearStock, stockActual, costoPromedio };