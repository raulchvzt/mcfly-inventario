const { sql, getPool } = require('../config/db');
const ErrorHttp = require('../utils/errorHttp');
const { redondear, bloquearStock, stockActual, costoPromedio } = require('./inventario');

async function crearTransferencia({ origenId, destinoId, usuarioId, notas, items }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const consulta = () => new sql.Request(tx);

    // 1) Sucursales existentes y activas
    for (const [id, etiqueta] of [[origenId, 'origen'], [destinoId, 'destino']]) {
      const r = await consulta()
        .input('id', sql.Int, id)
        .query('SELECT id FROM sucursales WHERE id = @id AND activa = 1');
      if (!r.recordset[0]) {
        throw new ErrorHttp(404, `Sucursal de ${etiqueta} no encontrada o inactiva`);
      }
    }

    // 2) Productos existentes y activos
    const productos = new Map();
    for (const item of items) {
      const r = await consulta()
        .input('id', sql.Int, item.productoId)
        .query('SELECT nombre, presentacion, activo FROM productos WHERE id = @id');
      const p = r.recordset[0];
      if (!p) throw new ErrorHttp(404, `Producto ${item.productoId} no encontrado`);
      if (!p.activo) {
        throw new ErrorHttp(409, `El producto "${p.nombre} ${p.presentacion}" está inactivo`);
      }
      productos.set(item.productoId, p);
    }

    // 3) Encabezado (nace como 'pendiente')
    const enc = await consulta()
      .input('origen', sql.Int, origenId)
      .input('destino', sql.Int, destinoId)
      .input('usuario', sql.Int, usuarioId)
      .input('notas', sql.NVarChar(255), notas ?? null)
      .query(
        `INSERT INTO transferencias (sucursal_origen_id, sucursal_destino_id, creada_por, notas)
         OUTPUT INSERTED.id
         VALUES (@origen, @destino, @usuario, @notas)`
      );
    const transferenciaId = enc.recordset[0].id;

    // 4) Por cada línea, en orden ascendente de producto: bloqueo, validación y salida
    const ordenados = [...items].sort((a, b) => a.productoId - b.productoId);
    for (const item of ordenados) {
      await bloquearStock(tx, item.productoId, origenId);
      const disponible = await stockActual(tx, item.productoId, origenId);

      if (redondear(disponible - item.cantidad) < 0) {
        const p = productos.get(item.productoId);
        throw new ErrorHttp(
          409,
          `Stock insuficiente de "${p.nombre} ${p.presentacion}" en la sucursal de origen`,
          { productoId: item.productoId, disponible }
        );
      }

      const costo = await costoPromedio(tx, item.productoId);

      await consulta()
        .input('t', sql.Int, transferenciaId)
        .input('p', sql.Int, item.productoId)
        .input('cantidad', sql.Decimal(10, 2), item.cantidad)
        .query(
          `INSERT INTO transferencia_detalle (transferencia_id, producto_id, cantidad)
           VALUES (@t, @p, @cantidad)`
        );

      await consulta()
        .input('t', sql.Int, transferenciaId)
        .input('p', sql.Int, item.productoId)
        .input('s', sql.Int, origenId)
        .input('cantidad', sql.Decimal(10, 2), -item.cantidad)
        .input('costo', sql.Decimal(10, 2), costo)
        .input('usuario', sql.Int, usuarioId)
        .query(
          `INSERT INTO movimientos
             (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, transferencia_id)
           VALUES (@p, @s, 'transferencia_salida', @cantidad, @costo, @usuario, @t)`
        );
    }

    await tx.commit();
    return transferenciaId;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw err;
  }
}

async function confirmarTransferencia({ id, usuario }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const consulta = () => new sql.Request(tx);

    const t = await consulta()
      .input('id', sql.Int, id)
      .query('SELECT sucursal_destino_id FROM transferencias WHERE id = @id');
    if (!t.recordset[0]) throw new ErrorHttp(404, 'Transferencia no encontrada');

    // Solo la sucursal destino confirma (el dueño puede confirmar cualquiera)
    if (usuario.rol !== 'dueno' && usuario.sucursalId !== t.recordset[0].sucursal_destino_id) {
      throw new ErrorHttp(403, 'Solo la sucursal que recibe puede confirmar la transferencia');
    }

    // El UPDATE condicionado es atómico: si dos personas confirman a la vez,
    // la segunda no afecta ninguna fila y recibe el 409
    const upd = await consulta()
      .input('id', sql.Int, id)
      .input('usuario', sql.Int, usuario.id)
      .query(
        `UPDATE transferencias
         SET estado = 'confirmada', confirmada_por = @usuario, confirmada_en = SYSDATETIME()
         WHERE id = @id AND estado = 'pendiente'`
      );
    if (upd.rowsAffected[0] === 0) {
      throw new ErrorHttp(409, 'La transferencia ya fue confirmada');
    }

    // Una entrada en el destino por cada línea, con el mismo costo con que salió del origen
    const lineas = await consulta()
      .input('id', sql.Int, id)
      .query(
        `SELECT d.producto_id AS productoId, d.cantidad, m.costo_unitario AS costo
         FROM transferencia_detalle d
         LEFT JOIN movimientos m
           ON m.transferencia_id = d.transferencia_id
          AND m.producto_id = d.producto_id
          AND m.tipo = 'transferencia_salida'
         WHERE d.transferencia_id = @id`
      );

    for (const l of lineas.recordset) {
      await consulta()
        .input('t', sql.Int, id)
        .input('p', sql.Int, l.productoId)
        .input('s', sql.Int, t.recordset[0].sucursal_destino_id)
        .input('cantidad', sql.Decimal(10, 2), l.cantidad)
        .input('costo', sql.Decimal(10, 2), l.costo)
        .input('usuario', sql.Int, usuario.id)
        .query(
          `INSERT INTO movimientos
             (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, transferencia_id)
           VALUES (@p, @s, 'transferencia_entrada', @cantidad, @costo, @usuario, @t)`
        );
    }

    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw err;
  }
}

async function obtenerTransferencia(id) {
  const pool = await getPool();

  const enc = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT t.id, t.estado, t.notas, t.creada_en AS creadaEn, t.confirmada_en AS confirmadaEn,
              o.id AS origenId, o.nombre AS origen,
              d.id AS destinoId, d.nombre AS destino,
              c.id AS creadaPorId, c.nombre AS creadaPor,
              f.id AS confirmadaPorId, f.nombre AS confirmadaPor
       FROM transferencias t
       JOIN sucursales o ON o.id = t.sucursal_origen_id
       JOIN sucursales d ON d.id = t.sucursal_destino_id
       JOIN usuarios c ON c.id = t.creada_por
       LEFT JOIN usuarios f ON f.id = t.confirmada_por
       WHERE t.id = @id`
    );
  if (!enc.recordset[0]) return null;

  const det = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT td.id, p.id AS productoId, p.nombre AS producto, p.presentacion,
              p.unidad_medida AS unidadMedida, td.cantidad
       FROM transferencia_detalle td
       JOIN productos p ON p.id = td.producto_id
       WHERE td.transferencia_id = @id
       ORDER BY td.id`
    );

  return { ...enc.recordset[0], items: det.recordset };
}

module.exports = { crearTransferencia, confirmarTransferencia, obtenerTransferencia };