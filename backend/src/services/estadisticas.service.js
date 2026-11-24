const { sql, getPool } = require('../config/db');
const { inventario } = require('./reportes.service');

const num = (n) => Number(n ?? 0);
const redondear = (n) => Math.round(n * 100) / 100;

const MS_DIA = 24 * 60 * 60 * 1000;
const aUtc = (s) => new Date(`${s}T00:00:00Z`);
const aTexto = (d) => d.toISOString().slice(0, 10);

// Periodo inmediatamente anterior y de la misma duración, para comparar ("vs. periodo anterior")
function periodoAnterior(desde, hasta) {
  const dias = Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA) + 1;
  const finAnterior = new Date(aUtc(desde).getTime() - MS_DIA);
  const inicioAnterior = new Date(finAnterior.getTime() - (dias - 1) * MS_DIA);
  return { dias, desde: aTexto(inicioAnterior), hasta: aTexto(finAnterior) };
}

function solicitud(pool, { sucursalId, desde, hasta, pdesde }) {
  const r = pool.request();
  if (sucursalId) r.input('sucursalId', sql.Int, sucursalId);
  if (desde) r.input('desde', sql.VarChar(10), desde);
  if (hasta) r.input('hasta', sql.VarChar(10), hasta);
  if (pdesde) r.input('pdesde', sql.VarChar(10), pdesde);
  return r;
}

// Los movimientos guardan fecha y hora; "hasta" incluye todo ese día
const EN_PERIODO = `m.fecha >= CONVERT(date, @desde, 23)
  AND m.fecha < DATEADD(DAY, 1, CONVERT(date, @hasta, 23))`;

async function obtenerEstadisticas({ sucursalId, desde, hasta }) {
  const pool = await getPool();
  const anterior = periodoAnterior(desde, hasta);
  const base = { sucursalId, desde, hasta };
  const conAnterior = { ...base, pdesde: anterior.desde };

  const enMov = sucursalId ? 'AND m.sucursal_id = @sucursalId' : '';
  const enCompra = sucursalId ? 'AND c.sucursal_id = @sucursalId' : '';

  const [totalesMov, consumoDiario, consumoProductos, totalesCompra, comprasDiarias, comprasProveedor, precios, cobertura, valor] =
    await Promise.all([
      // Consumo y mermas del periodo y del anterior (valorizados con el costo de cada movimiento)
      solicitud(pool, conAnterior).query(`
        SELECT m.tipo,
               CAST(SUM(CASE WHEN m.fecha >= CONVERT(date, @desde, 23)
                             THEN -m.cantidad * ISNULL(m.costo_unitario, 0) ELSE 0 END) AS DECIMAL(14,2)) AS actual,
               CAST(SUM(CASE WHEN m.fecha < CONVERT(date, @desde, 23)
                             THEN -m.cantidad * ISNULL(m.costo_unitario, 0) ELSE 0 END) AS DECIMAL(14,2)) AS previo
        FROM movimientos m
        WHERE m.tipo IN ('consumo', 'merma')
          AND m.fecha >= CONVERT(date, @pdesde, 23)
          AND m.fecha < DATEADD(DAY, 1, CONVERT(date, @hasta, 23)) ${enMov}
        GROUP BY m.tipo`),

      // Consumo por día y sucursal
      solicitud(pool, base).query(`
        SELECT CONVERT(VARCHAR(10), CAST(m.fecha AS DATE), 23) AS dia,
               s.id AS sucursalId, s.nombre AS sucursal,
               CAST(SUM(-m.cantidad * ISNULL(m.costo_unitario, 0)) AS DECIMAL(14,2)) AS valor
        FROM movimientos m
        JOIN sucursales s ON s.id = m.sucursal_id
        WHERE m.tipo = 'consumo' AND ${EN_PERIODO} ${enMov}
        GROUP BY CAST(m.fecha AS DATE), s.id, s.nombre
        ORDER BY dia`),

      // Consumo por producto y sucursal
      solicitud(pool, base).query(`
        SELECT p.id AS productoId, p.nombre AS producto, p.presentacion, p.categoria,
               s.id AS sucursalId, s.nombre AS sucursal,
               CAST(SUM(-m.cantidad * ISNULL(m.costo_unitario, 0)) AS DECIMAL(14,2)) AS valor
        FROM movimientos m
        JOIN productos p ON p.id = m.producto_id
        JOIN sucursales s ON s.id = m.sucursal_id
        WHERE m.tipo = 'consumo' AND ${EN_PERIODO} ${enMov}
        GROUP BY p.id, p.nombre, p.presentacion, p.categoria, s.id, s.nombre`),

      // Compras del periodo y del anterior
      solicitud(pool, conAnterior).query(`
        SELECT CAST(SUM(CASE WHEN c.fecha >= CONVERT(date, @desde, 23)
                             THEN d.cantidad * d.costo_unitario ELSE 0 END) AS DECIMAL(14,2)) AS actual,
               CAST(SUM(CASE WHEN c.fecha < CONVERT(date, @desde, 23)
                             THEN d.cantidad * d.costo_unitario ELSE 0 END) AS DECIMAL(14,2)) AS previo
        FROM compras c
        JOIN compra_detalle d ON d.compra_id = c.id
        WHERE c.fecha >= CONVERT(date, @pdesde, 23) AND c.fecha <= CONVERT(date, @hasta, 23) ${enCompra}`),

      // Compras por día
      solicitud(pool, base).query(`
        SELECT CONVERT(VARCHAR(10), c.fecha, 23) AS dia,
               CAST(SUM(d.cantidad * d.costo_unitario) AS DECIMAL(14,2)) AS valor
        FROM compras c
        JOIN compra_detalle d ON d.compra_id = c.id
        WHERE c.fecha >= CONVERT(date, @desde, 23) AND c.fecha <= CONVERT(date, @hasta, 23) ${enCompra}
        GROUP BY c.fecha
        ORDER BY dia`),

      // Compras por proveedor y forma de pago
      solicitud(pool, base).query(`
        SELECT v.id AS proveedorId, v.nombre AS proveedor, c.forma_pago AS formaPago,
               CAST(SUM(d.cantidad * d.costo_unitario) AS DECIMAL(14,2)) AS total
        FROM compras c
        JOIN proveedores v ON v.id = c.proveedor_id
        JOIN compra_detalle d ON d.compra_id = c.id
        WHERE c.fecha >= CONVERT(date, @desde, 23) AND c.fecha <= CONVERT(date, @hasta, 23) ${enCompra}
        GROUP BY v.id, v.nombre, c.forma_pago`),

      // Costo unitario de cada producto en cada día de compra (promedio ponderado del día)
      solicitud(pool, base).query(`
        SELECT p.id AS productoId, p.nombre AS producto, p.presentacion, p.unidad_medida AS unidadMedida,
               CONVERT(VARCHAR(10), c.fecha, 23) AS dia,
               CAST(SUM(d.cantidad * d.costo_unitario) / NULLIF(SUM(d.cantidad), 0) AS DECIMAL(12,2)) AS costo
        FROM compras c
        JOIN compra_detalle d ON d.compra_id = c.id
        JOIN productos p ON p.id = d.producto_id
        WHERE c.fecha >= CONVERT(date, @desde, 23) AND c.fecha <= CONVERT(date, @hasta, 23) ${enCompra}
        GROUP BY p.id, p.nombre, p.presentacion, p.unidad_medida, c.fecha
        ORDER BY p.nombre, p.presentacion, dia`),

      // Existencias de hoy y consumo del periodo, para calcular cuántos días alcanzan
      solicitud(pool, base).query(`
        SELECT p.id AS productoId, p.nombre AS producto, p.presentacion, p.unidad_medida AS unidadMedida,
               CAST(ISNULL((SELECT SUM(v.stock)
                            FROM v_stock v
                            JOIN sucursales s ON s.id = v.sucursal_id
                            WHERE v.producto_id = p.id AND s.activa = 1
                              ${sucursalId ? 'AND v.sucursal_id = @sucursalId' : ''}), 0) AS DECIMAL(14,2)) AS stock,
               CAST(ISNULL((SELECT SUM(-m.cantidad)
                            FROM movimientos m
                            WHERE m.producto_id = p.id AND m.tipo = 'consumo' AND ${EN_PERIODO} ${enMov}), 0)
                    AS DECIMAL(14,2)) AS consumo
        FROM productos p
        WHERE p.activo = 1
        ORDER BY p.nombre, p.presentacion`),

      // Valor del inventario hoy (misma regla que el panel y los reportes)
      inventario({ sucursalId }),
    ]);

  const porTipo = Object.fromEntries(totalesMov.recordset.map((r) => [r.tipo, r]));
  const par = (fila) => ({ actual: num(fila?.actual), previo: num(fila?.previo) });

  return {
    desde,
    hasta,
    dias: anterior.dias,
    anterior: { desde: anterior.desde, hasta: anterior.hasta },
    kpis: {
      consumo: par(porTipo.consumo),
      mermas: par(porTipo.merma),
      compras: par(totalesCompra.recordset[0]),
      inventario: redondear(valor.total),
    },
    consumoDiario: consumoDiario.recordset.map((f) => ({ ...f, valor: num(f.valor) })),
    consumoProductos: consumoProductos.recordset.map((f) => ({ ...f, valor: num(f.valor) })),
    comprasDiarias: comprasDiarias.recordset.map((f) => ({ ...f, valor: num(f.valor) })),
    comprasProveedor: comprasProveedor.recordset.map((f) => ({ ...f, total: num(f.total) })),
    precios: precios.recordset.map((f) => ({ ...f, costo: num(f.costo) })),
    cobertura: cobertura.recordset.map((f) => ({ ...f, stock: num(f.stock), consumo: num(f.consumo) })),
  };
}

module.exports = { obtenerEstadisticas };
