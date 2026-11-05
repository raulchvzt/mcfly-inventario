const { sql, getPool } = require('../config/db');
const ErrorHttp = require('../utils/errorHttp');

const redondear = (n) => Math.round(n * 100) / 100;

async function registrarCompra({
  proveedorId, sucursalId, usuarioId, fecha, formaPago, numeroTicket, notas, items,
}) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const consulta = () => new sql.Request(tx);

    // 1) Proveedor existente y activo
    const prov = await consulta()
      .input('id', sql.Int, proveedorId)
      .query('SELECT activo FROM proveedores WHERE id = @id');
    if (!prov.recordset[0]) throw new ErrorHttp(404, 'Proveedor no encontrado');
    if (!prov.recordset[0].activo) throw new ErrorHttp(409, 'El proveedor está inactivo');

    // 2) Sucursal existente y activa
    const suc = await consulta()
      .input('id', sql.Int, sucursalId)
      .query('SELECT id FROM sucursales WHERE id = @id AND activa = 1');
    if (!suc.recordset[0]) throw new ErrorHttp(404, 'Sucursal no encontrada o inactiva');

    // 3) Todos los productos existen y están activos
    for (const item of items) {
      const r = await consulta()
        .input('id', sql.Int, item.productoId)
        .query('SELECT nombre, presentacion, activo FROM productos WHERE id = @id');
      const p = r.recordset[0];
      if (!p) throw new ErrorHttp(404, `Producto ${item.productoId} no encontrado`);
      if (!p.activo) {
        throw new ErrorHttp(409, `El producto "${p.nombre} ${p.presentacion}" está inactivo`);
      }
    }

    // 4) Encabezado
    const enc = await consulta()
      .input('proveedor', sql.Int, proveedorId)
      .input('sucursal', sql.Int, sucursalId)
      .input('usuario', sql.Int, usuarioId)
      .input('fecha', sql.VarChar(10), fecha ?? null)
      .input('pago', sql.VarChar(20), formaPago)
      .input('ticket', sql.NVarChar(50), numeroTicket)
      .input('notas', sql.NVarChar(255), notas ?? null)
      .query(
        `INSERT INTO compras (proveedor_id, sucursal_id, usuario_id, fecha, forma_pago, numero_ticket, notas)
         OUTPUT INSERTED.id
         VALUES (@proveedor, @sucursal, @usuario,
                 CASE WHEN @fecha IS NULL THEN CAST(SYSDATETIME() AS DATE)
                      ELSE CONVERT(date, @fecha, 23) END,
                 @pago, @ticket, @notas)`
      );
    const compraId = enc.recordset[0].id;

    // 5) Por cada línea: detalle, movimiento de entrada, costo y precio del proveedor
    for (const item of items) {
      const det = await consulta()
        .input('compra', sql.Int, compraId)
        .input('producto', sql.Int, item.productoId)
        .input('cantidad', sql.Decimal(10, 2), item.cantidad)
        .input('costo', sql.Decimal(10, 2), item.costoUnitario)
        .query(
          `INSERT INTO compra_detalle (compra_id, producto_id, cantidad, costo_unitario)
           OUTPUT INSERTED.id
           VALUES (@compra, @producto, @cantidad, @costo)`
        );
      const detalleId = det.recordset[0].id;

      await consulta()
        .input('producto', sql.Int, item.productoId)
        .input('sucursal', sql.Int, sucursalId)
        .input('cantidad', sql.Decimal(10, 2), item.cantidad)
        .input('costo', sql.Decimal(10, 2), item.costoUnitario)
        .input('usuario', sql.Int, usuarioId)
        .input('detalle', sql.Int, detalleId)
        .query(
          `INSERT INTO movimientos
             (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, compra_detalle_id)
           VALUES (@producto, @sucursal, 'entrada', @cantidad, @costo, @usuario, @detalle)`
        );

      await consulta()
        .input('producto', sql.Int, item.productoId)
        .input('proveedor', sql.Int, proveedorId)
        .input('costo', sql.Decimal(10, 2), item.costoUnitario)
        .query(
          `UPDATE productos SET ultimo_costo = @costo WHERE id = @producto;

           UPDATE producto_proveedor
           SET ultimo_precio = @costo, actualizado_en = SYSDATETIME()
           WHERE producto_id = @producto AND proveedor_id = @proveedor;
           IF @@ROWCOUNT = 0
             INSERT INTO producto_proveedor (producto_id, proveedor_id, ultimo_precio)
             VALUES (@producto, @proveedor, @costo);`
        );
    }

    await tx.commit();
    return compraId;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw err;
  }
}

async function obtenerCompra(id) {
  const pool = await getPool();

  const enc = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT c.id, c.fecha, c.forma_pago AS formaPago, c.numero_ticket AS numeroTicket,
              c.notas, c.creada_en AS creadaEn,
              v.id AS proveedorId, v.nombre AS proveedor,
              s.id AS sucursalId, s.nombre AS sucursal,
              u.id AS usuarioId, u.nombre AS usuario
       FROM compras c
       JOIN proveedores v ON v.id = c.proveedor_id
       JOIN sucursales s ON s.id = c.sucursal_id
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = @id`
    );
  if (!enc.recordset[0]) return null;

  const det = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT d.id, p.id AS productoId, p.nombre AS producto, p.presentacion,
              p.unidad_medida AS unidadMedida, d.cantidad, d.costo_unitario AS costoUnitario,
              CAST(d.cantidad * d.costo_unitario AS DECIMAL(12,2)) AS subtotal
       FROM compra_detalle d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.compra_id = @id
       ORDER BY d.id`
    );

  const items = det.recordset;
  const total = redondear(items.reduce((acc, i) => acc + Number(i.subtotal), 0));
  return { ...enc.recordset[0], items, total };
}

module.exports = { registrarCompra, obtenerCompra };