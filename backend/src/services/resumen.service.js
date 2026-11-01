const { sql, getPool } = require('../config/db');
const { consultarStock } = require('./stock.service');
const { obtenerTransferencia } = require('./transferencias.service');

const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const redondear = (n) => Math.round(n * 100) / 100;

async function obtenerResumen({ sucursalId, usuario }) {
  const pool = await getPool();

  const solicitud = () => {
    const r = pool.request();
    if (sucursalId) r.input('sucursalId', sql.Int, sucursalId);
    return r;
  };
  const en = (columna) => (sucursalId ? `AND ${columna} = @sucursalId` : '');

  const [disponibles, valor, todas, compras, consumo, movimientos, pendientes] = await Promise.all([
    pool.request().query('SELECT id, nombre FROM sucursales WHERE activa = 1 ORDER BY nombre'),

    // Valor del inventario: stock x costo promedio ponderado de las compras
    solicitud().query(`
      WITH costo AS (
        SELECT p.id AS producto_id,
               ISNULL((SELECT SUM(cd.cantidad * cd.costo_unitario) / NULLIF(SUM(cd.cantidad), 0)
                       FROM compra_detalle cd WHERE cd.producto_id = p.id), p.ultimo_costo) AS costo
        FROM productos p
      )
      SELECT s.id AS sucursalId, s.nombre AS sucursal,
             CAST(ISNULL(SUM(v.stock * c.costo), 0) AS DECIMAL(14,2)) AS valor
      FROM sucursales s
      LEFT JOIN v_stock v ON v.sucursal_id = s.id
      LEFT JOIN costo c ON c.producto_id = v.producto_id
      WHERE s.activa = 1 ${en('s.id')}
      GROUP BY s.id, s.nombre
      ORDER BY s.nombre`),

    consultarStock({}),

    // Compras del mes en curso, por forma de pago
    solicitud().query(`
      SELECT c.forma_pago AS formaPago,
             CAST(SUM(d.cantidad * d.costo_unitario) AS DECIMAL(14,2)) AS total
      FROM compras c
      JOIN compra_detalle d ON d.compra_id = c.id
      WHERE c.fecha >= DATEFROMPARTS(YEAR(SYSDATETIME()), MONTH(SYSDATETIME()), 1)
        AND c.fecha < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(SYSDATETIME()), MONTH(SYSDATETIME()), 1))
        ${en('c.sucursal_id')}
      GROUP BY c.forma_pago`),

    // Consumo de los últimos 7 días, valorizado con el costo de cada movimiento
    solicitud().query(`
      SELECT CONVERT(VARCHAR(10), CAST(m.fecha AS DATE), 23) AS dia, m.sucursal_id AS sucursalId,
             CAST(SUM(-m.cantidad * ISNULL(m.costo_unitario, 0)) AS DECIMAL(14,2)) AS valor
      FROM movimientos m
      WHERE m.tipo = 'consumo'
        AND m.fecha >= DATEADD(DAY, -6, CAST(SYSDATETIME() AS DATE))
        ${en('m.sucursal_id')}
      GROUP BY CAST(m.fecha AS DATE), m.sucursal_id`),

    solicitud().query(`
      SELECT TOP 6 m.id, m.fecha, m.tipo, m.cantidad, p.nombre AS producto, p.presentacion,
             p.unidad_medida AS unidadMedida, s.nombre AS sucursal, u.nombre AS usuario
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      JOIN sucursales s ON s.id = m.sucursal_id
      JOIN usuarios u ON u.id = m.usuario_id
      WHERE 1 = 1 ${en('m.sucursal_id')}
      ORDER BY m.fecha DESC, m.id DESC`),

    solicitud().query(`
      SELECT TOP 3 t.id FROM transferencias t
      WHERE t.estado = 'pendiente'
        ${sucursalId ? 'AND (t.sucursal_origen_id = @sucursalId OR t.sucursal_destino_id = @sucursalId)' : ''}
      ORDER BY t.creada_en DESC, t.id DESC`),
  ]);

  // Valor del inventario
  const porSucursal = valor.recordset.map((r) => ({ ...r, valor: Number(r.valor) }));
  const valorInventario = {
    total: redondear(porSucursal.reduce((acc, r) => acc + r.valor, 0)),
    porSucursal,
  };

  // Alertas: agotados primero y luego los más cercanos a cero
  const ratio = (r) => (r.stockMinimo > 0 ? r.stock / r.stockMinimo : 1);
  const filas = todas
    .filter((r) => r.estado !== 'ok' && (!sucursalId || r.sucursalId === sucursalId))
    .sort(
      (a, b) =>
        (a.estado === 'agotado' ? 0 : 1) - (b.estado === 'agotado' ? 0 : 1) || ratio(a) - ratio(b)
    );

  const items = filas.slice(0, 5).map((a) => {
    const sobrante =
      todas
        .filter((o) => o.productoId === a.productoId && o.sucursalId !== a.sucursalId)
        .map((o) => ({
          sucursalId: o.sucursalId,
          sucursal: o.sucursal,
          excedente: redondear(o.stock - o.stockMinimo),
        }))
        .filter((o) => o.excedente > 0)
        .sort((x, y) => y.excedente - x.excedente)[0] || null;

    return {
      productoId: a.productoId,
      nombre: a.nombre,
      presentacion: a.presentacion,
      unidadMedida: a.unidadMedida,
      sucursal: a.sucursal,
      stock: a.stock,
      stockMinimo: a.stockMinimo,
      estado: a.estado,
      sobrante,
    };
  });

  const alertas = {
    total: filas.length,
    agotados: filas.filter((r) => r.estado === 'agotado').length,
    bajos: filas.filter((r) => r.estado === 'bajo').length,
    items,
  };

  // Compras del mes
  const porFormaPago = { contado: 0, credito: 0, caja_chica: 0 };
  for (const r of compras.recordset) porFormaPago[r.formaPago] = Number(r.total);
  const comprasMes = {
    total: redondear(Object.values(porFormaPago).reduce((a, b) => a + b, 0)),
    porFormaPago,
  };

  // Consumo de la semana: siempre 7 días, aunque no haya movimientos
  const sucursales = porSucursal.map((s) => ({ id: s.sucursalId, nombre: s.sucursal }));
  const mapa = new Map(consumo.recordset.map((r) => [`${r.dia}:${r.sucursalId}`, Number(r.valor)]));
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const fecha = fechaLocal(d);
    const porSuc = {};
    let total = 0;
    for (const s of sucursales) {
      const v = mapa.get(`${fecha}:${s.id}`) || 0;
      porSuc[s.id] = v;
      total += v;
    }
    dias.push({ fecha, porSucursal: porSuc, total: redondear(total) });
  }

  const transferenciasPendientes = (
    await Promise.all(pendientes.recordset.map((r) => obtenerTransferencia(r.id)))
  ).map((t) => ({
    ...t,
    puedeConfirmar: usuario.rol === 'dueno' || usuario.sucursalId === t.destinoId,
  }));

  return {
    sucursalesDisponibles: disponibles.recordset,
    valorInventario,
    alertas,
    comprasMes,
    consumoSemana: { sucursales, dias },
    movimientosRecientes: movimientos.recordset,
    transferenciasPendientes,
  };
}

module.exports = { obtenerResumen };