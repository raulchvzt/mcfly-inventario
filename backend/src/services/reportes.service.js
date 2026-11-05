const { sql, getPool } = require('../config/db');

// Costo promedio ponderado de las compras; si un producto no tiene compras, su último costo.
// Es la misma regla que usa el panel para valorar el inventario.
const CTE_COSTO = `
  WITH costo AS (
    SELECT p.id AS producto_id,
           ISNULL((SELECT SUM(cd.cantidad * cd.costo_unitario) / NULLIF(SUM(cd.cantidad), 0)
                   FROM compra_detalle cd WHERE cd.producto_id = p.id), p.ultimo_costo) AS costo
    FROM productos p
  )`;

const num = (n) => Number(n ?? 0);

function solicitud(pool, { sucursalId, desde, hasta }) {
  const r = pool.request();
  if (sucursalId) r.input('sucursalId', sql.Int, sucursalId);
  if (desde) r.input('desde', sql.VarChar(10), desde);
  if (hasta) r.input('hasta', sql.VarChar(10), hasta);
  return r;
}

// Rango del periodo sobre movimientos.fecha (DATETIME2): incluye todo el día "hasta"
const RANGO_MOV = `m.fecha >= CONVERT(date, @desde, 23)
  AND m.fecha < DATEADD(DAY, 1, CONVERT(date, @hasta, 23))`;

// Consumo por producto, valorizado con el costo que tenía cada movimiento
async function consumo(filtros) {
  const pool = await getPool();
  const en = filtros.sucursalId ? 'AND m.sucursal_id = @sucursalId' : '';
  const r = await solicitud(pool, filtros).query(`
    SELECT p.id AS productoId, p.nombre AS producto, p.presentacion, p.categoria,
           p.unidad_medida AS unidadMedida,
           CAST(SUM(-m.cantidad) AS DECIMAL(14,2)) AS cantidad,
           CAST(SUM(-m.cantidad * ISNULL(m.costo_unitario, 0)) AS DECIMAL(14,2)) AS valor
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    WHERE m.tipo = 'consumo' AND ${RANGO_MOV} ${en}
    GROUP BY p.id, p.nombre, p.presentacion, p.categoria, p.unidad_medida
    ORDER BY valor DESC, p.nombre`);
  const filas = r.recordset.map((f) => ({ ...f, cantidad: num(f.cantidad), valor: num(f.valor) }));
  return { filas, total: Math.round(filas.reduce((a, f) => a + f.valor, 0) * 100) / 100 };
}

// Mermas: cada pérdida con quién la registró y por qué
async function mermas(filtros) {
  const pool = await getPool();
  const en = filtros.sucursalId ? 'AND m.sucursal_id = @sucursalId' : '';
  const r = await solicitud(pool, filtros).query(`
    SELECT m.id, m.fecha, p.nombre AS producto, p.presentacion, p.unidad_medida AS unidadMedida,
           s.nombre AS sucursal, u.nombre AS usuario, m.motivo,
           CAST(-m.cantidad AS DECIMAL(14,2)) AS cantidad,
           CAST(-m.cantidad * ISNULL(m.costo_unitario, 0) AS DECIMAL(14,2)) AS valor
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    JOIN sucursales s ON s.id = m.sucursal_id
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.tipo = 'merma' AND ${RANGO_MOV} ${en}
    ORDER BY m.fecha DESC, m.id DESC`);
  const filas = r.recordset.map((f) => ({ ...f, cantidad: num(f.cantidad), valor: num(f.valor) }));
  return { filas, total: Math.round(filas.reduce((a, f) => a + f.valor, 0) * 100) / 100 };
}

// Compras agrupadas por proveedor
async function compras(filtros) {
  const pool = await getPool();
  const en = filtros.sucursalId ? 'AND c.sucursal_id = @sucursalId' : '';
  const r = await solicitud(pool, filtros).query(`
    SELECT v.id AS proveedorId, v.nombre AS proveedor,
           COUNT(DISTINCT c.id) AS compras,
           CAST(SUM(d.cantidad * d.costo_unitario) AS DECIMAL(14,2)) AS total,
           CAST(SUM(CASE WHEN c.forma_pago = 'credito' THEN d.cantidad * d.costo_unitario ELSE 0 END)
                AS DECIMAL(14,2)) AS aCredito
    FROM compras c
    JOIN proveedores v ON v.id = c.proveedor_id
    JOIN compra_detalle d ON d.compra_id = c.id
    WHERE c.fecha >= CONVERT(date, @desde, 23) AND c.fecha <= CONVERT(date, @hasta, 23) ${en}
    GROUP BY v.id, v.nombre
    ORDER BY total DESC, v.nombre`);
  const filas = r.recordset.map((f) => ({ ...f, total: num(f.total), aCredito: num(f.aCredito) }));
  return { filas, total: Math.round(filas.reduce((a, f) => a + f.total, 0) * 100) / 100 };
}

// Valor del inventario hoy, por categoría y sucursal (no depende del periodo)
async function inventario(filtros) {
  const pool = await getPool();
  const en = filtros.sucursalId ? 'AND s.id = @sucursalId' : '';
  const r = await solicitud(pool, filtros).query(`
    ${CTE_COSTO}
    SELECT p.categoria, s.id AS sucursalId, s.nombre AS sucursal,
           CAST(SUM(v.stock) AS DECIMAL(14,2)) AS unidades,
           CAST(SUM(v.stock * c.costo) AS DECIMAL(14,2)) AS valor
    FROM v_stock v
    JOIN productos p ON p.id = v.producto_id
    JOIN sucursales s ON s.id = v.sucursal_id
    JOIN costo c ON c.producto_id = v.producto_id
    WHERE s.activa = 1 AND v.stock > 0 ${en}
    GROUP BY p.categoria, s.id, s.nombre
    ORDER BY valor DESC`);
  const filas = r.recordset.map((f) => ({ ...f, unidades: num(f.unidades), valor: num(f.valor) }));
  return { filas, total: Math.round(filas.reduce((a, f) => a + f.valor, 0) * 100) / 100 };
}

module.exports = { consumo, mermas, compras, inventario };