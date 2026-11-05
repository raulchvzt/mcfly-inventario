const { sql, getPool } = require('../config/db');

// Estado: 'ok', 'bajo' (en o bajo el mínimo) o 'agotado' (sin existencias)
async function consultarStock({ sucursalId, categoria, buscar, soloAlertas = false }) {
  const request = (await getPool()).request();
  const condiciones = ['p.activo = 1', 's.activa = 1'];

  if (sucursalId) {
    condiciones.push('s.id = @sucursalId');
    request.input('sucursalId', sql.Int, sucursalId);
  }
  if (categoria) {
    condiciones.push('p.categoria = @categoria');
    request.input('categoria', sql.NVarChar(50), categoria);
  }
  if (buscar) {
    condiciones.push('p.nombre LIKE @buscar');
    request.input('buscar', sql.NVarChar(130), `%${buscar}%`);
  }

  const result = await request.query(
    `SELECT p.id AS productoId, p.nombre, p.categoria, p.presentacion,
            p.unidad_medida AS unidadMedida,
            CASE WHEN p.imagen_tipo IS NULL THEN NULL ELSE p.imagen_version END AS imagenV,
            s.id AS sucursalId, s.nombre AS sucursal,
            ISNULL(v.stock, 0) AS stock,
            ISNULL(ps.stock_minimo, 0) AS stockMinimo
     FROM productos p
     CROSS JOIN sucursales s
     LEFT JOIN v_stock v ON v.producto_id = p.id AND v.sucursal_id = s.id
     LEFT JOIN producto_sucursal ps ON ps.producto_id = p.id AND ps.sucursal_id = s.id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY p.nombre, p.presentacion, s.nombre`
  );

  return result.recordset
    .map((r) => {
      const bajo = r.stockMinimo > 0 && r.stock <= r.stockMinimo;
      const estado = !bajo ? 'ok' : r.stock <= 0 ? 'agotado' : 'bajo';
      return { ...r, estado };
    })
    .filter((r) => !soloAlertas || r.estado !== 'ok');
}

module.exports = { consultarStock };