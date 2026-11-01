require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../src/config/db');
const { registrarCompra } = require('../src/services/compras.service');
const { crearTransferencia } = require('../src/services/transferencias.service');

const PASSWORD_DEMO = 'Demo12345';
const PROVEEDORES = [
  'Distribuidora Automotriz Colima',
  'Químicos Industriales del Pacífico',
  'Compras varias',
];

// minimo y consumo: [Centro, Villa]. El consumo va de hace 6 días a ayer
const PRODUCTOS = [
  { clave: 'shampoo', nombre: 'Shampoo para autos', categoria: 'Lavado', presentacion: 'Garrafón 20 L', unidad: 'litro', costo: 35, minimo: [60, 20], consumo: [[12, 14, 9, 15, 18, 11], [4, 6, 5, 7, 8, 5]] },
  { clave: 'cera', nombre: 'Cera líquida', categoria: 'Detallado', presentacion: 'Botella 1 L', unidad: 'litro', costo: 80, minimo: [10, 6], consumo: [[2, 3, 1, 2, 4, 2], [1, 2, 1, 2, 2, 1]] },
  { clave: 'abrillantador', nombre: 'Abrillantador de llantas', categoria: 'Detallado', presentacion: 'Galón', unidad: 'galon', costo: 210, minimo: [3, 3], consumo: [[0, 1, 0, 1, 1, 0], [1, 0, 1, 0, 1, 0]] },
  { clave: 'desengrasante', nombre: 'Desengrasante', categoria: 'Limpieza', presentacion: 'Garrafón 20 L', unidad: 'litro', costo: 28, minimo: [30, 20], consumo: [[12, 15, 10, 14, 16, 13], [6, 8, 5, 7, 9, 5]] },
  { clave: 'interiores', nombre: 'Limpiador de interiores', categoria: 'Limpieza', presentacion: 'Botella 1 L', unidad: 'litro', costo: 45, minimo: [12, 8], consumo: [[3, 4, 2, 3, 5, 3], [2, 3, 2, 3, 3, 2]] },
  { clave: 'microfibras', nombre: 'Microfibras', categoria: 'Accesorios', presentacion: 'Pieza', unidad: 'pieza', costo: 18, minimo: [20, 20], consumo: [[4, 3, 5, 2, 6, 4], [3, 4, 2, 5, 4, 3]] },
];

// suc: 0 Centro, 1 Villa. prov: índice de PROVEEDORES
const COMPRAS = [
  { suc: 0, prov: 0, pago: 'credito', ticket: 'DEMO-001', quien: 'dueno', items: { shampoo: 120, cera: 40, abrillantador: 8 } },
  { suc: 0, prov: 1, pago: 'contado', ticket: 'DEMO-002', quien: 'dueno', items: { desengrasante: 130, interiores: 36 } },
  { suc: 0, prov: 2, pago: 'caja_chica', ticket: 'DEMO-003', quien: 'ana', items: { microfibras: 60 } },
  { suc: 1, prov: 0, pago: 'contado', ticket: 'DEMO-004', quien: 'mario', items: { shampoo: 60, cera: 20, abrillantador: 4 } },
  { suc: 1, prov: 1, pago: 'credito', ticket: 'DEMO-005', quien: 'mario', items: { desengrasante: 40, interiores: 24 } },
  { suc: 1, prov: 2, pago: 'caja_chica', ticket: 'DEMO-006', quien: 'mario', items: { microfibras: 30 } },
];

async function main() {
  const pool = await getPool();

  const hay = await pool.request().query('SELECT COUNT(*) AS n FROM productos');
  if (hay.recordset[0].n > 0) {
    console.log('Ya hay productos en la base. Limpia los datos antes de cargar la demo.');
    process.exit(1);
  }

  const dueno = await pool
    .request()
    .query("SELECT TOP 1 id FROM usuarios WHERE rol = 'dueno' AND activo = 1 ORDER BY id");
  if (!dueno.recordset[0]) {
    console.log('No hay un dueño. Créalo con scripts/crear-dueno.js');
    process.exit(1);
  }
  const suc = await pool.request().query('SELECT TOP 2 id FROM sucursales WHERE activa = 1 ORDER BY id');
  if (suc.recordset.length < 2) {
    console.log('Se necesitan dos sucursales activas.');
    process.exit(1);
  }
  const sucIds = suc.recordset.map((r) => r.id);

  // Usuarios
  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const usuarios = { dueno: dueno.recordset[0].id };
  const nuevos = [
    ['ana', 'Ana', 'ana@mcfly.test', 'encargado', 0],
    ['luis', 'Luis', 'luis@mcfly.test', 'empleado', 0],
    ['mario', 'Mario', 'mario@mcfly.test', 'encargado', 1],
    ['paco', 'Paco', 'paco@mcfly.test', 'empleado', 1],
  ];
  for (const [clave, nombre, email, rol, s] of nuevos) {
    const r = await pool
      .request()
      .input('nombre', sql.NVarChar(100), nombre)
      .input('email', sql.NVarChar(150), email)
      .input('hash', sql.VarChar(255), hash)
      .input('rol', sql.VarChar(20), rol)
      .input('suc', sql.Int, sucIds[s])
      .query(`INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id)
              OUTPUT INSERTED.id VALUES (@nombre, @email, @hash, @rol, @suc)`);
    usuarios[clave] = r.recordset[0].id;
  }

  // Proveedores
  const provIds = [];
  for (const nombre of PROVEEDORES) {
    const r = await pool
      .request()
      .input('n', sql.NVarChar(120), nombre)
      .query('INSERT INTO proveedores (nombre) OUTPUT INSERTED.id VALUES (@n)');
    provIds.push(r.recordset[0].id);
  }

  // Productos y stock mínimo por sucursal
  const prod = {};
  for (const p of PRODUCTOS) {
    const r = await pool
      .request()
      .input('nombre', sql.NVarChar(120), p.nombre)
      .input('cat', sql.NVarChar(50), p.categoria)
      .input('pres', sql.NVarChar(80), p.presentacion)
      .input('uni', sql.VarChar(20), p.unidad)
      .input('costo', sql.Decimal(10, 2), p.costo)
      .query(`INSERT INTO productos (nombre, categoria, presentacion, unidad_medida, ultimo_costo)
              OUTPUT INSERTED.id VALUES (@nombre, @cat, @pres, @uni, @costo)`);
    prod[p.clave] = { ...p, id: r.recordset[0].id };
    for (let s = 0; s < 2; s++) {
      await pool
        .request()
        .input('p', sql.Int, r.recordset[0].id)
        .input('s', sql.Int, sucIds[s])
        .input('m', sql.Decimal(10, 2), p.minimo[s])
        .query('INSERT INTO producto_sucursal (producto_id, sucursal_id, stock_minimo) VALUES (@p, @s, @m)');
    }
  }

  // Compras (por el servicio, igual que la API)
  for (const c of COMPRAS) {
    await registrarCompra({
      proveedorId: provIds[c.prov],
      sucursalId: sucIds[c.suc],
      usuarioId: usuarios[c.quien],
      formaPago: c.pago,
      numeroTicket: c.ticket,
      items: Object.entries(c.items).map(([clave, cantidad]) => ({
        productoId: prod[clave].id,
        cantidad,
        costoUnitario: prod[clave].costo,
      })),
    });
  }

  // Consumos de los últimos 6 días, a las 9:00
  const empleados = [usuarios.luis, usuarios.paco];
  for (const p of Object.values(prod)) {
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 6; i++) {
        const cantidad = p.consumo[s][i];
        if (!cantidad) continue;
        await pool
          .request()
          .input('p', sql.Int, p.id)
          .input('s', sql.Int, sucIds[s])
          .input('u', sql.Int, empleados[s])
          .input('cant', sql.Decimal(10, 2), -cantidad)
          .input('costo', sql.Decimal(10, 2), p.costo)
          .input('dias', sql.Int, 6 - i)
          .query(`INSERT INTO movimientos (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, fecha)
                  VALUES (@p, @s, 'consumo', @cant, @costo, @u,
                          DATEADD(HOUR, 9, CAST(CAST(DATEADD(DAY, -@dias, SYSDATETIME()) AS DATE) AS DATETIME2)))`);
      }
    }
  }

  // Una merma
  await pool
    .request()
    .input('p', sql.Int, prod.microfibras.id)
    .input('s', sql.Int, sucIds[0])
    .input('u', sql.Int, usuarios.ana)
    .input('costo', sql.Decimal(10, 2), prod.microfibras.costo)
    .query(`INSERT INTO movimientos (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
            VALUES (@p, @s, 'merma', -3, @costo, @u, N'Microfibras extraviadas')`);

  // Una transferencia pendiente de Centro a Villa
  await crearTransferencia({
    origenId: sucIds[0],
    destinoId: sucIds[1],
    usuarioId: usuarios.ana,
    notas: 'Reposición semanal',
    items: [
      { productoId: prod.shampoo.id, cantidad: 10 },
      { productoId: prod.cera.id, cantidad: 4 },
    ],
  });

  console.log('Demo cargada.');
  console.log(`Usuarios: ana, luis, mario y paco @mcfly.test. Contraseña: ${PASSWORD_DEMO}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});