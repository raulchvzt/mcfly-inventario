const { sql, getPool } = require('../config/db');
const ErrorHttp = require('../utils/errorHttp');
const { redondear, bloquearStock, stockActual, costoPromedio } = require('./inventario');

async function registrarMovimiento({ productoId, sucursalId, tipo, cantidad, motivo, usuarioId }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const consulta = () => new sql.Request(tx);

    const producto = await consulta()
      .input('id', sql.Int, productoId)
      .query('SELECT activo FROM productos WHERE id = @id');
    if (!producto.recordset[0]) {
      throw new ErrorHttp(404, 'Producto no encontrado');
    }
    if (!producto.recordset[0].activo && tipo !== 'ajuste') {
      throw new ErrorHttp(409, 'El producto está inactivo');
    }

    const sucursal = await consulta()
      .input('id', sql.Int, sucursalId)
      .query('SELECT id FROM sucursales WHERE id = @id AND activa = 1');
    if (!sucursal.recordset[0]) {
      throw new ErrorHttp(404, 'Sucursal no encontrada o inactiva');
    }

    await bloquearStock(tx, productoId, sucursalId);
    const stockAnterior = await stockActual(tx, productoId, sucursalId);
    const nuevoStock = redondear(stockAnterior + cantidad);

    // RN2: no se puede sacar más de lo que hay
    if (nuevoStock < 0) {
      throw new ErrorHttp(409, 'Stock insuficiente', { disponible: stockAnterior });
    }

    const costo = await costoPromedio(tx, productoId);

    const insertado = await consulta()
      .input('p', sql.Int, productoId)
      .input('s', sql.Int, sucursalId)
      .input('tipo', sql.VarChar(25), tipo)
      .input('cantidad', sql.Decimal(10, 2), cantidad)
      .input('costo', sql.Decimal(10, 2), costo)
      .input('usuario', sql.Int, usuarioId)
      .input('motivo', sql.NVarChar(255), motivo)
      .query(`
        INSERT INTO movimientos (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
        VALUES (@p, @s, @tipo, @cantidad, @costo, @usuario, @motivo);

        SELECT id, producto_id AS productoId, sucursal_id AS sucursalId, tipo, cantidad,
               costo_unitario AS costoUnitario, usuario_id AS usuarioId, fecha, motivo
        FROM movimientos WHERE id = SCOPE_IDENTITY();
      `);

    await tx.commit();
    return { movimiento: insertado.recordset[0], stockAnterior, stockActual: nuevoStock };
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