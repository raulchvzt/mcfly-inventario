// Agrega ~4 meses de historial a la demo para que el sistema se vea con uso real:
// consumos diarios, compras periódicas con precios que suben poco a poco, mermas,
// transferencias entre sucursales y 6 productos más en el catálogo.
//
// Se corre DESPUÉS de seed-demo.js, sobre los mismos datos:
//   node scripts/seed-historial.js
//
// No cambia el stock actual de los productos que ya existen: cada compra del historial
// cubre exactamente lo que se consumió, así que las alertas y el valor del inventario
// siguen contando la misma historia. Los productos nuevos terminan con el stock indicado
// abajo (algunos bajos y uno agotado, para que el Panel tenga alertas).
//
//   node scripts/seed-historial.js --simular   Prueba la lógica sin tocar la base de datos.

const SIMULAR = process.argv.includes('--simular');
const DIAS = 120;

// ---------- Datos del catálogo ----------

const PROVEEDORES = [
  'Distribuidora Automotriz Colima',
  'Químicos Industriales del Pacífico',
  'Compras varias',
];
const PREFIJO_TICKET = ['DAC', 'QIP', 'VAR'];
const TICKET_INICIAL = [1180, 3420, 40];
const INTERVALO_COMPRA = [[12, 17], [14, 20], [25, 35]]; // días entre compras, por proveedor
const PAGOS = [
  [['credito', 0.5], ['contado', 0.5]],
  [['contado', 0.6], ['credito', 0.4]],
  [['caja_chica', 1]],
];

// Productos que crea seed-demo.js. "diario" es el consumo promedio por día [Centro, Villa]
const EXISTENTES = [
  { nombre: 'Shampoo para autos', presentacion: 'Garrafón 20 L', prov: 0, diario: [13.2, 5.8] },
  { nombre: 'Cera líquida', presentacion: 'Botella 1 L', prov: 0, diario: [2.3, 1.5] },
  { nombre: 'Abrillantador de llantas', presentacion: 'Galón', prov: 0, diario: [0.5, 0.5] },
  { nombre: 'Desengrasante', presentacion: 'Garrafón 20 L', prov: 1, diario: [13.3, 6.7] },
  { nombre: 'Limpiador de interiores', presentacion: 'Botella 1 L', prov: 1, diario: [3.3, 2.5] },
  { nombre: 'Microfibras', presentacion: 'Pieza', prov: 2, diario: [4, 3.5] },
];

// Productos nuevos. "final" es el stock con el que terminan [Centro, Villa]
const NUEVOS = [
  { nombre: 'Cera en pasta', categoria: 'Detallado', presentacion: 'Lata 400 g', unidad: 'pieza', costo: 95, minimo: [6, 4], diario: [1.4, 0.9], prov: 0, final: [9, 0] },
  { nombre: 'Aromatizante para auto', categoria: 'Detallado', presentacion: 'Pieza', unidad: 'pieza', costo: 22, minimo: [24, 16], diario: [6.5, 4.2], prov: 2, final: [42, 9] },
  { nombre: 'Silicón para tablero', categoria: 'Detallado', presentacion: 'Botella 1 L', unidad: 'litro', costo: 120, minimo: [4, 3], diario: [0.9, 0.6], prov: 0, final: [7, 5] },
  { nombre: 'Limpiavidrios', categoria: 'Limpieza', presentacion: 'Garrafón 20 L', unidad: 'litro', costo: 32, minimo: [20, 12], diario: [4.8, 2.9], prov: 1, final: [34, 22] },
  { nombre: 'Shampoo con cera', categoria: 'Lavado', presentacion: 'Garrafón 20 L', unidad: 'litro', costo: 48, minimo: [40, 25], diario: [7.5, 4.6], prov: 0, final: [63, 31] },
  { nombre: 'Esponjas', categoria: 'Accesorios', presentacion: 'Pieza', unidad: 'pieza', costo: 14, minimo: [15, 10], diario: [3.2, 2.1], prov: 2, final: [30, 19] },
];

const MOTIVOS_MERMA = [
  'Derrame al rellenar el envase',
  'Envase dañado en bodega',
  'Producto caducado',
  'Se contaminó con agua',
  'Botella rota al acomodar',
  'Extraviado en el área de lavado',
];
const NOTAS_TRANSFERENCIA = ['Reposición semanal', 'Faltante en sucursal', 'Balanceo de inventario'];

// Domingo a sábado: un autolavado trabaja más los fines de semana
const FACTOR_DIA = [1.35, 0.75, 0.8, 0.9, 1.0, 1.2, 1.5];
const PASO = { litro: 0.5, mililitro: 0.5, galon: 1, pieza: 1 };
const MULTIPLO_COMPRA = { litro: 5, mililitro: 5, galon: 1, pieza: 5 };

// ---------- Utilidades ----------

// Generador pseudoaleatorio con semilla fija: la demo sale igual cada vez
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261113);
const entre = (a, b) => a + rng() * (b - a);
const entero = (a, b) => Math.floor(entre(a, b + 1));
const elegir = (lista) => lista[Math.floor(rng() * lista.length)];
const r2 = (n) => Math.round(n * 100) / 100;
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const ymdhms = (d) => `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

// Redondea al paso del producto de forma probabilística: 0.4 pieza al día son, en promedio, 0.4
function aPaso(x, paso) {
  const k = x / paso;
  const base = Math.floor(k);
  return r2((base + (rng() < k - base ? 1 : 0)) * paso);
}
const subirAMultiplo = (x, m) => Math.ceil(x / m - 1e-9) * m;

function ponderado(opciones) {
  let r = rng();
  for (const [valor, peso] of opciones) {
    if ((r -= peso) <= 0) return valor;
  }
  return opciones[opciones.length - 1][0];
}

// ---------- Planeación (no toca la base de datos) ----------

// productos: [{ clave, id, nombre, unidad, costo, diario:[c,v], prov, final:[c,v] }]
// usuarios: { dueno, encargado:[Centro, Villa], empleado:[Centro, Villa] }
function planificar({ productos, usuarios, sucIds, existentes, ahora }) {
  const hoy00 = new Date(ahora);
  hoy00.setHours(0, 0, 0, 0);

  const dia = (offset) => {
    const d = new Date(hoy00);
    d.setDate(d.getDate() - offset);
    return d;
  };
  const conHora = (d, hora) => {
    const x = new Date(d);
    const h = Math.floor(hora);
    x.setHours(h, Math.floor((hora - h) * 60), entero(0, 59), 0);
    return x;
  };
  // Los precios suben de a poco: hace 4 meses costaban ~10 % menos
  const inflacion = (off) => 1 - 0.1 * (off / DIAS);
  const precioMedio = (prod, off) => r2(prod.costo * inflacion(off));
  const precioCompra = (prod, off) => r2(prod.costo * inflacion(off) * entre(0.985, 1.015));

  // Eventos de stock por sucursal y producto: delta negativo = sale, positivo = entra
  const eventos = [0, 1].map(() => new Map(productos.map((p) => [p.clave, []])));
  const consumos = [];
  const mermas = [];
  const transferencias = [];

  // 1) Consumo diario, con más movimiento los fines de semana y un negocio que crece
  for (const prod of productos) {
    const paso = PASO[prod.unidad];
    for (let b = 0; b < 2; b++) {
      for (let off = DIAS; off >= 0; off--) {
        const d = dia(off);
        if (existentes.has(`${prod.id}|${sucIds[b]}|${ymd(d)}`)) continue;

        let horaMax = 19.5;
        let factor = FACTOR_DIA[d.getDay()] * (0.7 + 0.3 * (1 - off / DIAS)) * entre(0.75, 1.25);
        if (off === 0) {
          // Hoy solo hay movimientos hasta la hora actual
          const ahoraDec = ahora.getHours() + ahora.getMinutes() / 60 - 0.15;
          if (ahoraDec < 9.5) continue;
          horaMax = Math.min(19.5, ahoraDec);
          factor *= 0.5;
        }

        const cant = aPaso(prod.diario[b] * factor, paso);
        if (cant <= 0) continue;

        let partes = [{ cant, hora: entre(9, horaMax) }];
        if (cant >= paso * 6) {
          const primera = aPaso(cant * 0.6, paso);
          if (primera > 0 && primera < cant) {
            partes = [
              { cant: primera, hora: entre(9, Math.min(13, horaMax)) },
              { cant: r2(cant - primera), hora: entre(Math.min(14, horaMax), horaMax) },
            ];
          }
        }

        for (const parte of partes) {
          const usuario = rng() < 0.8 ? usuarios.empleado[b] : usuarios.encargado[b];
          const t = conHora(d, parte.hora);
          consumos.push({ prod, b, t, cant: parte.cant, costo: precioMedio(prod, off), usuario });
          eventos[b].get(prod.clave).push({ t, delta: -parte.cant });
        }
      }
    }
  }

  // 2) Mermas: unas pocas, con motivo
  for (let i = 0; i < 14; i++) {
    const prod = elegir(productos);
    const b = entero(0, 1);
    const off = entero(3, DIAS - 2);
    const cant = PASO[prod.unidad] === 0.5 ? r2(0.5 * entero(2, 6)) : entero(1, 3);
    const t = conHora(dia(off), entre(10, 18));
    const usuario = rng() < 0.6 ? usuarios.encargado[b] : usuarios.empleado[b];
    mermas.push({ prod, b, t, cant, costo: precioMedio(prod, off), usuario, motivo: elegir(MOTIVOS_MERMA) });
    eventos[b].get(prod.clave).push({ t, delta: -cant });
  }

  // 3) Transferencias entre sucursales: salen un día y las confirman al siguiente
  for (let i = 0; i < 14; i++) {
    const origen = entero(0, 1);
    const destino = 1 - origen;
    const off = entero(14, DIAS - 3);
    const elegidos = [...productos].sort(() => rng() - 0.5).slice(0, entero(2, 3));
    const items = [];
    for (const prod of elegidos) {
      const cant = aPaso(prod.diario[destino] * entre(3, 7), PASO[prod.unidad]);
      if (cant > 0) items.push({ prod, cant, costo: precioMedio(prod, off) });
    }
    if (!items.length) continue;
    const tSalida = conHora(dia(off), entre(11, 12.5));
    const tEntrada = conHora(dia(off - 1), entre(10, 11.5));
    transferencias.push({
      origen,
      destino,
      tSalida,
      tEntrada,
      creadaPor: usuarios.encargado[origen],
      confirmadaPor: usuarios.encargado[destino],
      notas: elegir(NOTAS_TRANSFERENCIA),
      items,
    });
    for (const it of items) {
      eventos[origen].get(it.prod.clave).push({ t: tSalida, delta: -it.cant });
      eventos[destino].get(it.prod.clave).push({ t: tEntrada, delta: it.cant });
    }
  }

  // 4) Compras: cada una cubre lo que se consume hasta la siguiente
  const compras = [];
  for (let b = 0; b < 2; b++) {
    for (let prov = 0; prov < PROVEEDORES.length; prov++) {
      const prods = productos.filter((p) => p.prov === prov);
      if (!prods.length) continue;

      // Última compra reciente y dentro del mes en curso (para que el Panel la muestre)
      let ultimo = entero(2, 6);
      if (ahora.getDate() >= 2) ultimo = Math.min(ultimo, ahora.getDate() - 1);
      ultimo = Math.max(1, ultimo);

      const [min, max] = INTERVALO_COMPRA[prov];
      const offs = [ultimo];
      for (let cur = ultimo; ; ) {
        cur += entero(min, max);
        if (cur > DIAS - 10) break;
        offs.unshift(cur);
      }
      offs.unshift(DIAS);
      const tiempos = offs.map((o) => conHora(dia(o), entre(8, 8.9)));
      const K = tiempos.length - 1;
      const lineas = tiempos.map(() => []);

      for (const prod of prods) {
        const evs = eventos[b].get(prod.clave).sort((a, c) => a.t - c.t);
        let sobrante = 0;
        for (let k = 0; k <= K; k++) {
          const hasta = k < K ? tiempos[k + 1] : Infinity;
          let acum = 0;
          let maximo = 0;
          for (const e of evs) {
            if (e.t >= tiempos[k] && e.t < hasta) {
              acum -= e.delta;
              if (acum > maximo) maximo = acum;
            }
          }
          let Q;
          if (k < K) {
            Q = Math.max(0, maximo - sobrante);
            if (Q > 0) Q = subirAMultiplo(Q, MULTIPLO_COMPRA[prod.unidad]);
          } else {
            // Última compra: deja exactamente el stock final que se busca
            Q = Math.max(0, maximo - sobrante, acum + prod.final[b] - sobrante);
          }
          Q = r2(Q);
          sobrante = r2(sobrante + Q - acum);
          if (Q > 0) lineas[k].push({ prod, cant: Q, costo: precioCompra(prod, offs[k]) });
        }
      }

      for (let k = 0; k <= K; k++) {
        if (!lineas[k].length) continue;
        compras.push({
          b,
          prov,
          t: tiempos[k],
          pago: ponderado(PAGOS[prov]),
          usuario: rng() < 0.4 ? usuarios.dueno : usuarios.encargado[b],
          lineas: lineas[k],
        });
      }
    }
  }

  compras.sort((a, c) => a.t - c.t);
  const contador = [...TICKET_INICIAL];
  for (const c of compras) {
    contador[c.prov] += entero(1, 6);
    c.ticket = `${PREFIJO_TICKET[c.prov]}-${String(contador[c.prov]).padStart(4, '0')}`;
  }

  // 5) Verificación: el stock nunca debe quedar negativo y debe terminar donde se espera
  const finales = [0, 1].map(() => new Map());
  for (let b = 0; b < 2; b++) {
    for (const prod of productos) {
      const linea = eventos[b].get(prod.clave).map((e) => ({ t: e.t, delta: e.delta }));
      for (const c of compras) {
        if (c.b !== b) continue;
        for (const l of c.lineas) if (l.prod === prod) linea.push({ t: c.t, delta: l.cant });
      }
      linea.sort((a, c) => a.t - c.t);
      let saldo = 0;
      for (const e of linea) {
        saldo = r2(saldo + e.delta);
        if (saldo < -1e-6) {
          throw new Error(`Stock negativo en la simulación: ${prod.nombre}, sucursal ${b}, ${ymdhms(e.t)}`);
        }
      }
      finales[b].set(prod.clave, saldo);
    }
  }

  return { consumos, mermas, transferencias, compras, finales, dia, hoy00 };
}

// ---------- Resumen en consola ----------

function resumir(plan, productos) {
  const mes = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
  const porMes = new Map();
  for (const c of plan.consumos) {
    const m = mes(c.t);
    porMes.set(m, (porMes.get(m) || 0) + c.cant * c.costo);
  }
  const gasto = plan.compras.reduce((s, c) => s + c.lineas.reduce((a, l) => a + l.cant * l.costo, 0), 0);
  console.log(`  Consumos:        ${plan.consumos.length}`);
  console.log(`  Mermas:          ${plan.mermas.length}`);
  console.log(`  Transferencias:  ${plan.transferencias.length}`);
  console.log(`  Compras:         ${plan.compras.length}  (total $${gasto.toFixed(2)})`);
  console.log('  Consumo valorizado por mes:');
  for (const [m, v] of [...porMes.entries()].sort()) console.log(`    ${m}  $${v.toFixed(2)}`);
  console.log('  Stock con el que terminan los productos nuevos [Centro, Villa]:');
  for (const p of productos.filter((x) => x.nuevo)) {
    console.log(`    ${p.nombre}: [${plan.finales[0].get(p.clave)}, ${plan.finales[1].get(p.clave)}]`);
  }
}

// ---------- Programa principal ----------

async function simular() {
  const productos = [
    ...EXISTENTES.map((p, i) => ({ ...p, clave: `e${i}`, id: i + 1, unidad: i === 2 ? 'galon' : i === 5 ? 'pieza' : 'litro', costo: [35, 80, 210, 28, 45, 18][i], final: [0, 0], nuevo: false })),
    ...NUEVOS.map((p, i) => ({ ...p, clave: `n${i}`, id: 100 + i, nuevo: true })),
  ];
  const plan = planificar({
    productos,
    usuarios: { dueno: 1, encargado: [2, 4], empleado: [3, 5] },
    sucIds: [1, 2],
    existentes: new Set(),
    ahora: new Date(),
  });
  console.log('Simulación correcta: el stock nunca queda negativo.');
  resumir(plan, productos);
  for (const p of productos.filter((x) => !x.nuevo)) {
    const f = [plan.finales[0].get(p.clave), plan.finales[1].get(p.clave)];
    if (f[0] !== 0 || f[1] !== 0) console.log(`  Sobrante en ${p.nombre}: [${f}] (se suma al stock actual)`);
  }
}

async function main() {
  if (SIMULAR) return simular();

  require('dotenv').config();
  const { sql, getPool } = require('../src/config/db');
  const pool = await getPool();

  // Comprobaciones previas
  const viejo = await pool
    .request()
    .query('SELECT COUNT(*) AS n FROM movimientos WHERE fecha < DATEADD(DAY, -30, SYSDATETIME())');
  if (viejo.recordset[0].n > 0) {
    console.log('Ya hay movimientos de hace más de 30 días: el historial ya está cargado.');
    process.exit(1);
  }

  const suc = await pool.request().query('SELECT TOP 2 id FROM sucursales WHERE activa = 1 ORDER BY id');
  if (suc.recordset.length < 2) {
    console.log('Se necesitan dos sucursales activas.');
    process.exit(1);
  }
  const sucIds = suc.recordset.map((r) => r.id);

  const us = await pool.request().query('SELECT id, email, rol FROM usuarios WHERE activo = 1');
  const porCorreo = Object.fromEntries(us.recordset.map((u) => [u.email, u.id]));
  const dueno = us.recordset.find((u) => u.rol === 'dueno');
  const faltan = ['ana', 'luis', 'mario', 'paco'].filter((n) => !porCorreo[`${n}@mcfly.test`]);
  if (!dueno || faltan.length) {
    console.log('Primero corre seed-demo.js: faltan el dueño o los usuarios ' + faltan.join(', '));
    process.exit(1);
  }
  const usuarios = {
    dueno: dueno.id,
    encargado: [porCorreo['ana@mcfly.test'], porCorreo['mario@mcfly.test']],
    empleado: [porCorreo['luis@mcfly.test'], porCorreo['paco@mcfly.test']],
  };

  const prodDB = await pool
    .request()
    .query('SELECT id, nombre, presentacion, unidad_medida AS unidad, ultimo_costo AS costo FROM productos');
  const buscar = (n, pr) => prodDB.recordset.find((p) => p.nombre === n && p.presentacion === pr);

  const productos = [];
  for (const e of EXISTENTES) {
    const p = buscar(e.nombre, e.presentacion);
    if (!p) {
      console.log(`Aviso: no existe "${e.nombre}"; se omite.`);
      continue;
    }
    productos.push({ ...e, clave: `e${p.id}`, id: p.id, unidad: p.unidad, costo: Number(p.costo) || 1, final: [0, 0], nuevo: false });
  }

  // Consumos que ya existen: esos días no se vuelven a generar
  const ya = await pool
    .request()
    .query("SELECT producto_id, sucursal_id, CONVERT(VARCHAR(10), CAST(fecha AS DATE), 23) AS dia FROM movimientos WHERE tipo = 'consumo'");
  const existentes = new Set(ya.recordset.map((r) => `${r.producto_id}|${r.sucursal_id}|${r.dia}`));

  const antes = await pool.request().query('SELECT producto_id, sucursal_id, stock FROM v_stock');
  const stockAntes = new Map(antes.recordset.map((r) => [`${r.producto_id}|${r.sucursal_id}`, Number(r.stock)]));

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const q = () => new sql.Request(tx);

  try {
    // Proveedores
    const provIds = [];
    for (const nombre of PROVEEDORES) {
      const r = await q().input('n', sql.NVarChar(120), nombre).query('SELECT id FROM proveedores WHERE nombre = @n');
      if (r.recordset[0]) {
        provIds.push(r.recordset[0].id);
      } else {
        const n = await q().input('n', sql.NVarChar(120), nombre).query('INSERT INTO proveedores (nombre) OUTPUT INSERTED.id VALUES (@n)');
        provIds.push(n.recordset[0].id);
      }
    }

    // Productos nuevos y su stock mínimo
    for (const n of NUEVOS) {
      let p = buscar(n.nombre, n.presentacion);
      let id;
      if (p) {
        id = p.id;
      } else {
        const r = await q()
          .input('nombre', sql.NVarChar(120), n.nombre)
          .input('cat', sql.NVarChar(50), n.categoria)
          .input('pres', sql.NVarChar(80), n.presentacion)
          .input('uni', sql.VarChar(20), n.unidad)
          .input('costo', sql.Decimal(10, 2), n.costo)
          .query(`INSERT INTO productos (nombre, categoria, presentacion, unidad_medida, ultimo_costo)
                  OUTPUT INSERTED.id VALUES (@nombre, @cat, @pres, @uni, @costo)`);
        id = r.recordset[0].id;
      }
      for (let b = 0; b < 2; b++) {
        await q()
          .input('p', sql.Int, id)
          .input('s', sql.Int, sucIds[b])
          .input('m', sql.Decimal(10, 2), n.minimo[b])
          .query(`IF NOT EXISTS (SELECT 1 FROM producto_sucursal WHERE producto_id = @p AND sucursal_id = @s)
                    INSERT INTO producto_sucursal (producto_id, sucursal_id, stock_minimo) VALUES (@p, @s, @m)`);
      }
      productos.push({ ...n, clave: `n${id}`, id, nuevo: true });
    }

    const plan = planificar({ productos, usuarios, sucIds, existentes, ahora: new Date() });

    const mov = (m) =>
      q()
        .input('p', sql.Int, m.p)
        .input('s', sql.Int, m.s)
        .input('tipo', sql.VarChar(25), m.tipo)
        .input('cant', sql.Decimal(10, 2), m.cant)
        .input('costo', sql.Decimal(10, 2), m.costo)
        .input('u', sql.Int, m.u)
        .input('f', sql.VarChar(19), ymdhms(m.t))
        .input('motivo', sql.NVarChar(255), m.motivo ?? null)
        .input('det', sql.Int, m.det ?? null)
        .input('tr', sql.Int, m.tr ?? null)
        .query(`INSERT INTO movimientos
                  (producto_id, sucursal_id, tipo, cantidad, costo_unitario, usuario_id, fecha, motivo, compra_detalle_id, transferencia_id)
                VALUES (@p, @s, @tipo, @cant, @costo, @u, CONVERT(datetime2, @f, 120), @motivo, @det, @tr)`);

    // Compras
    const ultimoPrecio = new Map(); // producto|proveedor -> [fecha, precio]
    for (const c of plan.compras) {
      const enc = await q()
        .input('prov', sql.Int, provIds[c.prov])
        .input('suc', sql.Int, sucIds[c.b])
        .input('usr', sql.Int, c.usuario)
        .input('fecha', sql.VarChar(10), ymd(c.t))
        .input('pago', sql.VarChar(20), c.pago)
        .input('ticket', sql.NVarChar(50), c.ticket)
        .input('creada', sql.VarChar(19), ymdhms(c.t))
        .query(`INSERT INTO compras (proveedor_id, sucursal_id, usuario_id, fecha, forma_pago, numero_ticket, creada_en)
                OUTPUT INSERTED.id
                VALUES (@prov, @suc, @usr, CONVERT(date, @fecha, 23), @pago, @ticket, CONVERT(datetime2, @creada, 120))`);
      const compraId = enc.recordset[0].id;
      for (const l of c.lineas) {
        const det = await q()
          .input('c', sql.Int, compraId)
          .input('p', sql.Int, l.prod.id)
          .input('cant', sql.Decimal(10, 2), l.cant)
          .input('costo', sql.Decimal(10, 2), l.costo)
          .query(`INSERT INTO compra_detalle (compra_id, producto_id, cantidad, costo_unitario)
                  OUTPUT INSERTED.id VALUES (@c, @p, @cant, @costo)`);
        await mov({ p: l.prod.id, s: sucIds[c.b], tipo: 'entrada', cant: l.cant, costo: l.costo, u: c.usuario, t: c.t, det: det.recordset[0].id });
        const k = `${l.prod.id}|${c.prov}`;
        if (!ultimoPrecio.has(k) || ultimoPrecio.get(k)[0] < c.t) ultimoPrecio.set(k, [c.t, l.costo]);
      }
    }

    // Vínculo producto-proveedor con el último precio (para que Compras sugiera el costo)
    for (const [k, [, precio]] of ultimoPrecio) {
      const [pid, prov] = k.split('|').map(Number);
      await q()
        .input('p', sql.Int, pid)
        .input('v', sql.Int, provIds[prov])
        .input('precio', sql.Decimal(10, 2), precio)
        .query(`UPDATE producto_proveedor SET ultimo_precio = @precio, actualizado_en = SYSDATETIME()
                WHERE producto_id = @p AND proveedor_id = @v;
                IF @@ROWCOUNT = 0
                  INSERT INTO producto_proveedor (producto_id, proveedor_id, ultimo_precio)
                  VALUES (@p, @v, @precio);`);
    }
    // El último costo de los productos nuevos es el de su compra más reciente
    for (const p of productos.filter((x) => x.nuevo)) {
      const compras = plan.compras.filter((c) => c.lineas.some((l) => l.prod === p));
      if (!compras.length) continue;
      const ult = compras[compras.length - 1].lineas.find((l) => l.prod === p);
      await q()
        .input('id', sql.Int, p.id)
        .input('costo', sql.Decimal(10, 2), ult.costo)
        .query('UPDATE productos SET ultimo_costo = @costo WHERE id = @id');
    }

    // Consumos y mermas
    for (const c of plan.consumos) {
      await mov({ p: c.prod.id, s: sucIds[c.b], tipo: 'consumo', cant: -c.cant, costo: c.costo, u: c.usuario, t: c.t });
    }
    for (const m of plan.mermas) {
      await mov({ p: m.prod.id, s: sucIds[m.b], tipo: 'merma', cant: -m.cant, costo: m.costo, u: m.usuario, t: m.t, motivo: m.motivo });
    }

    // Transferencias ya confirmadas
    for (const t of plan.transferencias) {
      const enc = await q()
        .input('o', sql.Int, sucIds[t.origen])
        .input('d', sql.Int, sucIds[t.destino])
        .input('c', sql.Int, t.creadaPor)
        .input('ce', sql.VarChar(19), ymdhms(t.tSalida))
        .input('f', sql.Int, t.confirmadaPor)
        .input('fe', sql.VarChar(19), ymdhms(t.tEntrada))
        .input('n', sql.NVarChar(255), t.notas)
        .query(`INSERT INTO transferencias
                  (sucursal_origen_id, sucursal_destino_id, estado, creada_por, creada_en, confirmada_por, confirmada_en, notas)
                OUTPUT INSERTED.id
                VALUES (@o, @d, 'confirmada', @c, CONVERT(datetime2, @ce, 120), @f, CONVERT(datetime2, @fe, 120), @n)`);
      const tid = enc.recordset[0].id;
      for (const it of t.items) {
        await q()
          .input('t', sql.Int, tid)
          .input('p', sql.Int, it.prod.id)
          .input('cant', sql.Decimal(10, 2), it.cant)
          .query('INSERT INTO transferencia_detalle (transferencia_id, producto_id, cantidad) VALUES (@t, @p, @cant)');
        await mov({ p: it.prod.id, s: sucIds[t.origen], tipo: 'transferencia_salida', cant: -it.cant, costo: it.costo, u: t.creadaPor, t: t.tSalida, tr: tid });
        await mov({ p: it.prod.id, s: sucIds[t.destino], tipo: 'transferencia_entrada', cant: it.cant, costo: it.costo, u: t.confirmadaPor, t: t.tEntrada, tr: tid });
      }
    }

    await tx.commit();

    console.log('Historial cargado.');
    resumir(plan, productos);

    // Comprobación: el stock de los productos que ya existían no debe haber cambiado
    const despues = await pool.request().query('SELECT producto_id, sucursal_id, stock FROM v_stock');
    const stockDespues = new Map(despues.recordset.map((r) => [`${r.producto_id}|${r.sucursal_id}`, Number(r.stock)]));
    let cambios = 0;
    for (const p of productos.filter((x) => !x.nuevo)) {
      for (const s of sucIds) {
        const a = stockAntes.get(`${p.id}|${s}`) ?? 0;
        const d = stockDespues.get(`${p.id}|${s}`) ?? 0;
        if (Math.abs(a - d) > 0.001) {
          cambios++;
          console.log(`  Stock de ${p.nombre} (sucursal ${s}): ${a} → ${d}`);
        }
      }
    }
    if (!cambios) console.log('  El stock de los productos que ya existían no cambió.');
    process.exit(0);
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
