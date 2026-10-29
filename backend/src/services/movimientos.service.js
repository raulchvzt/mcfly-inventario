const { sql, getPool } = require('../config/db');
const ErrorHttp = require('../utils/errorHttp');

const redondear = (n) => Math.round(n * 100) / 100;

async function registrarMovimiento({ productoId, sucursalId, tipo, cantidad, motivo, usuarioId }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const consulta = () => new sql.Request(tx);

    // 1) El producto existe (y está activo, salvo para ajustes)
    const producto = await consulta()
      .input('id', sql.Int, productoId)
      .query('SELECT activo FROM productos WHERE id = @id');
    if (!producto.recordset[0]) {
      throw new ErrorHttp(404, 'Producto no encontrado');
    }
    if (!producto.recordset[0].activo && tipo !== 'ajuste') {
      throw new ErrorHttp(409, 'El producto está inactivo');
    }

    // 2) La sucursal existe y está activa
    const sucursal = await consulta()
      .input('id', sql.Int, sucursalId)
      .query('SELECT id FROM sucursales WHERE id = @id AND activa = 1');
    if (!sucursal.recordset[0]) {
      throw new ErrorHttp(404, 'Sucursal no encontrada o inactiva');
    }

    // 3) Bloqueo por producto y sucursal: dos registros simultáneos se hacen en fila
    const bloqueo = await consulta()
      .input('recurso', sql.NVarChar(255), `stock:${productoId}:${sucursalId}`)
      .query(`DECLARE @r INT;
              EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive',
                   @LockOwner = 'Transaction', @LockTimeout = 5000;
              SELECT @r AS resultado;`);
    if (bloqueo.recordset[0].resultado < 0) {
      throw new ErrorHttp(503, 'El sistema está ocupado, intenta de nuevo');
    }

    // 4) Stock actual (ya con el bloqueo tomado)
    const stockRes = await consulta()
      .input('p', sql.Int, productoId)
      .input('s', sql.Int, sucursalId)
      .query(`SELECT ISNULL(SUM(cantidad), 0) AS stock
              FROM movimientos WHERE producto_id = @p AND sucursal_id = @s`);
    const stockAnterior = redondear(stockRes.recordset[0].stock);
    const stockActual = redondear(stockAnterior + cantidad);

    // 5) RN2: no se puede sacar más de lo que hay
    if (stockActual < 0) {
      throw new ErrorHttp(409, 'Stock insuficiente', { disponible: stockAnterior });
    }

    // 6) Insertar con el costo promedio ponderado de las compras
    //    (si aún no hay compras, se usa el último costo del producto)
    const insertado = await consulta()
      .input('p', sql.Int, productoId)
      .input('s', sql.Int, sucursalId)
      .input('tipo', sql.VarChar(25), tipo)
      .input('cantidad', sql.Decimal(10, 2), cantidad)
      .input('usuario', sql.Int, usuarioId)
      .input('motivo', sql.NVarChar(255), motivo)
      .query(`
        DECLARE @costo DECIMAL(10,2) = (
          SELECT CAST(SUM(cantidad * costo_unitario) / NULLIF(SUM(cantidad), 0) AS DECIMAL(10,2))
          FROM compra_detalle WHERE producto_id = @p
        );
        IF @costo IS NULL SELECT @costo = ultimo_costo FROM productos WHERE id = @p;

        INSERT INTO movimientos (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
        VALUES (@p, @s, @tipo, @cantidad, @costo, @usuario, @motivo);

        SELECT id, producto_id AS productoId, sucursal_id AS sucursalId, tipo, cantidad,
               costo_unitario AS costoUnitario, usuario_id AS usuarioId, fecha, motivo
        FROM movimientos WHERE id = SCOPE_IDENTITY();
      `);

    await tx.commit();
    return { movimiento: insertado.recordset[0], stockAnterior, stockActual };
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw err;
  }
}

module.exports = { registrarMovimiento };