import { useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconTable,
} from '@tabler/icons-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { moneda, numero, UNIDAD } from '../utils/formato';
import './css/Estadisticas.css';

/* ---------- Colores ----------
   Paleta categórica validada (separación para daltonismo y contraste). Se asignan siempre
   a la misma entidad: Centro es azul y Villa naranja en todas las gráficas. */
const AZUL = '#1d9bd8';
const NARANJA = '#eb6834';
const AQUA = '#1baf7a';
const AMARILLO = '#eda100';
const VIOLETA = '#6250d6';
const GRIS = '#c8d0da';
const CRITICO = '#d03b3b';

const TINTA = '#667085'; // texto de ejes (var(--mu))
const LINEA = '#e6eaf0'; // rejilla y ejes (var(--ln))

const COLOR_SUCURSAL = { Centro: AZUL, Villa: NARANJA };
const COLOR_CATEGORIA = { Lavado: AZUL, Limpieza: NARANJA, Detallado: AQUA, Accesorios: AMARILLO };
const COLORES_EXTRA = [VIOLETA, '#e87ba4', GRIS];
const FORMAS = {
  contado: { texto: 'Contado', color: AZUL },
  credito: { texto: 'Crédito', color: NARANJA },
  caja_chica: { texto: 'Caja chica', color: AQUA },
};

const colorDe = (mapa, clave, extras) => {
  if (mapa[clave]) return mapa[clave];
  const usados = Object.keys(extras);
  if (!extras[clave]) extras[clave] = COLORES_EXTRA[usados.length % COLORES_EXTRA.length];
  return extras[clave];
};

const ANIMAR =
  typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- Fechas y formato ---------- */
const dos = (n) => String(n).padStart(2, '0');
const aFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return aFecha(d);
};
const PERIODOS = [
  { id: '30', texto: '30 días', dias: 30 },
  { id: '90', texto: '90 días', dias: 90 },
  { id: '180', texto: '6 meses', dias: 180 },
];
const rangoDe = (dias) => [haceDias(dias - 1), aFecha(new Date())];

const aDate = (f) => new Date(`${f}T12:00:00`);
const fechaCorta = (f) => aDate(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const fechaLarga = (f) =>
  aDate(f).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

function listaDias(desde, hasta) {
  const salida = [];
  const d = aDate(desde);
  const fin = aDate(hasta);
  while (d <= fin) {
    salida.push(aFecha(d));
    d.setDate(d.getDate() + 1);
  }
  return salida;
}

const moneda2 = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n ?? 0);
const compacto = (n) =>
  `$${new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`.replace(/\s+/g, '');
const porcentaje = (n) => `${numero(Math.round(n))}%`;
const corto = (nombre) => nombre.replace(/^McFly\s+/i, '');
const recortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
const suma = (lista, f) => lista.reduce((a, x) => a + f(x), 0);

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// En pantallas angostas los nombres del eje ocupan menos lugar
function useAngosto() {
  const [angosto, setAngosto] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)');
    const alCambiar = () => setAngosto(m.matches);
    m.addEventListener('change', alCambiar);
    return () => m.removeEventListener('change', alCambiar);
  }, []);
  return angosto;
}

/* ---------- Piezas reutilizables ---------- */

// Etiqueta emergente: el valor manda y el nombre acompaña
function Tip({ active, payload, label, formato = moneda, titulo, ocultarCeros = false }) {
  if (!active || !payload?.length) return null;
  const filas = payload.filter((p) => p.value != null && p.dataKey !== 'cola' && !(ocultarCeros && p.value === 0));
  if (!filas.length) return null;
  return (
    <div className="es__tip">
      <span className="es__tip-t">{titulo ? titulo(label, payload) : label}</span>
      {filas.map((p) => (
        <div key={`${p.dataKey}-${p.name}`} className="es__tip-f">
          <i style={{ background: p.color ?? p.stroke ?? p.payload?.color }} />
          <b>{formato(p.value, p)}</b>
          <span>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

function Leyenda({ partes }) {
  return (
    <ul className="es__leyenda">
      {partes.map((p) => (
        <li key={p.nombre}>
          <i style={{ background: p.color }} />
          {p.nombre}
        </li>
      ))}
    </ul>
  );
}

function TablaDatos({ columnas, filas }) {
  return (
    <div className="es__scroll">
      <table className="es__tabla">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c} className={i > 0 ? 'der' : ''}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {f.map((celda, j) => (
                <td key={j} className={j > 0 ? 'der' : ''}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Tarjeta de una gráfica: título, lectura rápida, leyenda y la misma información en tabla
function Grafica({ titulo, ayuda, ancha, orden, leyenda, tabla, vacio, children }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={`es__tarjeta entra${ancha ? ' es__ancha' : ''}`} style={{ '--i': orden }}>
      <header className="es__tarjeta-cab">
        <div>
          <h2>{titulo}</h2>
          {ayuda && <p>{ayuda}</p>}
        </div>
        {tabla && !vacio && (
          <button
            type="button"
            className="es__alterna"
            aria-pressed={verTabla}
            title={verTabla ? 'Ver la gráfica' : 'Ver los datos en tabla'}
            onClick={() => setVerTabla((v) => !v)}
          >
            {verTabla ? <IconChartBar size={18} aria-hidden="true" /> : <IconTable size={18} aria-hidden="true" />}
            <span>{verTabla ? 'Gráfica' : 'Tabla'}</span>
          </button>
        )}
      </header>
      {vacio ? (
        <p className="es__vacio">No hay datos en este periodo.</p>
      ) : verTabla ? (
        <TablaDatos {...tabla} />
      ) : (
        <>
          {leyenda && <Leyenda partes={leyenda} />}
          {children}
        </>
      )}
    </section>
  );
}

function Kpi({ titulo, valor, extra, delta, subeEsMalo, orden }) {
  let pie = null;
  if (delta != null) {
    const sube = delta > 0;
    const igual = Math.abs(delta) < 0.5;
    const Flecha = sube ? IconArrowUpRight : IconArrowDownRight;
    const clase = igual || subeEsMalo == null ? '' : sube === subeEsMalo ? ' mal' : ' bien';
    pie = (
      <span className={`es__delta${clase}`}>
        {!igual && <Flecha size={16} aria-hidden="true" />}
        {igual ? 'Sin cambios' : `${sube ? '+' : ''}${numero(Math.round(delta))}%`} <small>vs. periodo anterior</small>
      </span>
    );
  } else if (extra) {
    pie = <span className="es__delta">{extra}</span>;
  }
  return (
    <article className="es__kpi entra" style={{ '--i': orden }}>
      <span className="es__kpi-t">{titulo}</span>
      <b>{valor}</b>
      {pie}
      {delta != null && extra && <small className="es__kpi-x">{extra}</small>}
    </article>
  );
}

const variacion = (actual, previo) => (previo > 0 ? ((actual - previo) / previo) * 100 : null);

// Punto final de cada mini gráfica de precios
function PuntoFinal({ cx, cy, index, total }) {
  if (index !== total - 1 || cx == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill={AZUL} stroke="#fff" strokeWidth={2} />;
}

/* ---------- Página ---------- */
export default function Estadisticas() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';
  const angosto = useAngosto();
  const anchoEje = angosto ? 124 : 190;
  const letrasEje = angosto ? 17 : 28;

  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [periodo, setPeriodo] = useState('90');
  const [[desde, hasta], setRango] = useState(() => rangoDe(90));
  const [errorSucursales, setErrorSucursales] = useState('');
  // La respuesta guarda con qué filtros se pidió: mientras no coincida con los actuales,
  // se sigue mostrando lo anterior (atenuado) en vez de vaciar la pantalla
  const [respuesta, setRespuesta] = useState(null);

  const clave = `${sucursalId}|${desde}|${hasta}`;
  const cargando = respuesta?.clave !== clave;
  const datos = respuesta?.datos ?? null;
  const error = errorSucursales || (respuesta?.clave === clave ? (respuesta.error ?? '') : '');

  useEffect(() => {
    if (!esDueno) return;
    api('/sucursales')
      .then(setSucursales)
      .catch((e) => setErrorSucursales(e.message));
  }, [esDueno]);

  useEffect(() => {
    let vigente = true;
    const q = new URLSearchParams({ desde, hasta });
    if (sucursalId) q.set('sucursalId', sucursalId);
    api(`/estadisticas?${q}`)
      .then((r) => vigente && setRespuesta({ clave, datos: r }))
      .catch((e) => vigente && setRespuesta((previa) => ({ clave, datos: previa?.datos ?? null, error: e.message })));
    return () => {
      vigente = false;
    };
  }, [clave, sucursalId, desde, hasta]);

  function elegirPeriodo(p) {
    setPeriodo(p.id);
    setRango(rangoDe(p.dias));
  }

  // Todo lo que se grafica se calcula una sola vez por respuesta
  const g = useMemo(() => (datos ? preparar(datos) : null), [datos]);

  return (
    <div className="es">
      <header className="es__cab entra" style={{ '--i': 0 }}>
        <h1>Estadísticas</h1>
        <p className="es__sub">
          {esDueno ? 'Para ver cómo se mueve el negocio, de un vistazo' : 'Cómo se mueve tu sucursal, de un vistazo'}
        </p>
      </header>

      <div className="es__filtros entra" style={{ '--i': 1 }}>
        {esDueno && (
          <label className="es__campo">
            Sucursal
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="es__rapidos" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" className={periodo === p.id ? 'on' : ''} onClick={() => elegirPeriodo(p)}>
              {p.texto}
            </button>
          ))}
        </div>
        <span className="es__rango">
          {fechaCorta(desde)} – {fechaCorta(hasta)}
        </span>
      </div>

      {error && (
        <p className="es__error" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" /> {error}
        </p>
      )}

      {!g ? (
        !error && <p className="es__vacio">Cargando…</p>
      ) : (
        <div className={`es__contenido${cargando ? ' es__contenido--carga' : ''}`}>
          <div className="es__kpis">
            <Kpi
              orden={2}
              titulo="Consumo"
              valor={moneda(g.kpis.consumo.actual)}
              delta={variacion(g.kpis.consumo.actual, g.kpis.consumo.previo)}
              extra={`${moneda(g.kpis.consumo.actual / datos.dias)} por día`}
            />
            <Kpi
              orden={3}
              titulo="Compras"
              valor={moneda(g.kpis.compras.actual)}
              delta={variacion(g.kpis.compras.actual, g.kpis.compras.previo)}
            />
            <Kpi
              orden={4}
              titulo="Mermas"
              valor={moneda(g.kpis.mermas.actual)}
              delta={variacion(g.kpis.mermas.actual, g.kpis.mermas.previo)}
              subeEsMalo
              extra={
                g.kpis.consumo.actual > 0
                  ? `${(Math.round((g.kpis.mermas.actual / g.kpis.consumo.actual) * 1000) / 10).toLocaleString('es-MX')}% de lo que se consume`
                  : undefined
              }
            />
            <Kpi orden={5} titulo="Valor del inventario" valor={moneda(g.kpis.inventario)} extra="Hoy, a costo promedio" />
          </div>

          <div className="es__grid">
            {/* 1. Tendencia: área apilada por sucursal */}
            <Grafica
              ancha
              orden={6}
              titulo="Consumo por día"
              ayuda={g.diario.ayuda}
              vacio={g.diario.vacio}
              leyenda={g.sucursales.length > 1 ? g.sucursales.map((s) => ({ nombre: s.nombre, color: s.color })) : null}
              tabla={g.diario.tabla}
            >
              <div role="img" aria-label="Gráfica de áreas: consumo diario en pesos por sucursal" className="es__lienzo">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={g.diario.datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={LINEA} />
                    <XAxis
                      dataKey="dia"
                      tickFormatter={fechaCorta}
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                      minTickGap={36}
                    />
                    <YAxis
                      tickFormatter={compacto}
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ stroke: '#98a2b3', strokeWidth: 1 }}
                      content={<Tip titulo={(d) => fechaLarga(d)} />}
                    />
                    {g.sucursales.map((s) => (
                      <Area
                        key={s.nombre}
                        type="monotone"
                        dataKey={s.nombre}
                        name={s.nombre}
                        stackId="consumo"
                        stroke={s.color}
                        strokeWidth={2}
                        fill={s.color}
                        fillOpacity={0.14}
                        dot={false}
                        activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={ANIMAR}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 2. Parte de un todo: dona por categoría */}
            <Grafica
              orden={7}
              titulo="Consumo por categoría"
              ayuda={g.categorias.ayuda}
              vacio={g.categorias.vacio}
              tabla={g.categorias.tabla}
            >
              <div className="es__dona">
                <div
                  role="img"
                  aria-label="Gráfica de dona: porcentaje del consumo por categoría"
                  className="es__dona-graf"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Tooltip content={<Tip formato={(v, p) => `${moneda(v)} · ${porcentaje(p.payload.pct)}`} />} />
                      <Pie
                        data={g.categorias.datos}
                        dataKey="valor"
                        nameKey="nombre"
                        innerRadius="64%"
                        outerRadius="94%"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={ANIMAR}
                      >
                        {g.categorias.datos.map((c) => (
                          <Cell key={c.nombre} fill={c.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="es__dona-centro">
                    <b>{moneda(g.categorias.total)}</b>
                    <span>consumo</span>
                  </div>
                </div>
                <ul className="es__dona-lista">
                  {g.categorias.datos.map((c) => (
                    <li key={c.nombre}>
                      <i style={{ background: c.color }} />
                      <span>{c.nombre}</span>
                      <b>{porcentaje(c.pct)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </Grafica>

            {/* 3. Ranking: barras horizontales */}
            <Grafica
              orden={8}
              titulo="Lo que más se consume"
              ayuda={g.productos.ayuda}
              vacio={g.productos.vacio}
              tabla={g.productos.tabla}
            >
              <div role="img" aria-label="Gráfica de barras: productos con más gasto en consumo" className="es__lienzo">
                <ResponsiveContainer width="100%" height={Math.max(240, g.productos.datos.length * 36 + 24)}>
                  <BarChart data={g.productos.datos} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={LINEA} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={anchoEje}
                      tick={{ fill: '#101828', fontSize: 13 }}
                      tickFormatter={(v) => recortar(v, letrasEje)}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                    />
                    <Tooltip cursor={{ fill: 'rgba(15,42,68,0.04)' }} content={<Tip formato={moneda} />} />
                    <Bar
                      dataKey="valor"
                      name="Consumo"
                      fill={AZUL}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={22}
                      isAnimationActive={ANIMAR}
                    >
                      <LabelList
                        dataKey="valor"
                        position="right"
                        formatter={(v) => moneda(v)}
                        fill="#101828"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 4. Patrón semanal: columnas con énfasis */}
            <Grafica
              orden={9}
              titulo="¿Qué días se consume más?"
              ayuda={g.semana.ayuda}
              vacio={g.semana.vacio}
              tabla={g.semana.tabla}
            >
              <div role="img" aria-label="Gráfica de columnas: consumo promedio por día de la semana" className="es__lienzo">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={g.semana.datos} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={LINEA} />
                    <XAxis
                      dataKey="corto"
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={compacto}
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15,42,68,0.04)' }}
                      content={<Tip titulo={(_, p) => p[0]?.payload?.nombre} formato={(v) => `${moneda(v)} en promedio`} />}
                    />
                    <Bar dataKey="promedio" name="Consumo" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={ANIMAR}>
                      {g.semana.datos.map((d) => (
                        <Cell key={d.nombre} fill={d.destacado ? AZUL : GRIS} />
                      ))}
                      <LabelList
                        dataKey="promedio"
                        position="top"
                        content={({ x, y, width, value, index }) =>
                          g.semana.datos[index]?.destacado ? (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="#101828" fontSize={12} fontWeight={500}>
                              {moneda(value)}
                            </text>
                          ) : null
                        }
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 5. Compras contra consumo: barras + línea en un solo eje */}
            <Grafica
              orden={10}
              titulo="Compras contra consumo, por semana"
              ayuda={g.semanal.ayuda}
              vacio={g.semanal.vacio}
              leyenda={[
                { nombre: 'Compras', color: AZUL },
                { nombre: 'Consumo', color: NARANJA },
              ]}
              tabla={g.semanal.tabla}
            >
              <div role="img" aria-label="Gráfica combinada: compras y consumo semanal en pesos" className="es__lienzo">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={g.semanal.datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={LINEA} />
                    <XAxis
                      dataKey="etiqueta"
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      tickFormatter={compacto}
                      tick={{ fill: TINTA, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15,42,68,0.04)' }}
                      content={<Tip titulo={(_, p) => p[0]?.payload?.rango} />}
                    />
                    <Bar dataKey="compras" name="Compras" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={ANIMAR} />
                    <Line
                      type="monotone"
                      dataKey="consumo"
                      name="Consumo"
                      stroke={NARANJA}
                      strokeWidth={2}
                      dot={{ r: 4, fill: NARANJA, stroke: '#fff', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: NARANJA, stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={ANIMAR}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 6. Proveedores: barras apiladas por forma de pago */}
            <Grafica
              orden={11}
              titulo="Compras por proveedor"
              ayuda={g.proveedores.ayuda}
              vacio={g.proveedores.vacio}
              leyenda={g.proveedores.leyenda}
              tabla={g.proveedores.tabla}
            >
              <div role="img" aria-label="Gráfica de barras apiladas: compras por proveedor y forma de pago" className="es__lienzo">
                <ResponsiveContainer width="100%" height={Math.max(280, g.proveedores.datos.length * 64 + 36)}>
                  <BarChart data={g.proveedores.datos} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={LINEA} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="proveedor"
                      width={anchoEje}
                      tick={{ fill: '#101828', fontSize: 13 }}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                    />
                    <Tooltip cursor={{ fill: 'rgba(15,42,68,0.04)' }} content={<Tip ocultarCeros titulo={(_, p) => p[0]?.payload?.proveedor} />} />
                    {g.proveedores.formas.map((f) => (
                      <Bar
                        key={f.id}
                        dataKey={f.id}
                        name={f.texto}
                        stackId="pago"
                        fill={f.color}
                        stroke="#fff"
                        strokeWidth={2}
                        maxBarSize={24}
                        isAnimationActive={ANIMAR}
                      />
                    ))}
                    {/* Serie invisible al final de la pila: solo sirve para escribir el total */}
                    <Bar dataKey="cola" name="Total" stackId="pago" fill="transparent" stroke="none" maxBarSize={24} isAnimationActive={false}>
                      <LabelList dataKey="total" position="right" formatter={(v) => moneda(v)} fill="#101828" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 7. Comparación de sucursales: barras agrupadas */}
            {g.sucursales.length > 1 && (
              <Grafica
                orden={12}
                titulo="Centro contra Villa, por categoría"
                ayuda={g.comparacion.ayuda}
                vacio={g.comparacion.vacio}
                leyenda={g.sucursales.map((s) => ({ nombre: s.nombre, color: s.color }))}
                tabla={g.comparacion.tabla}
              >
                <div role="img" aria-label="Gráfica de barras agrupadas: consumo por categoría en cada sucursal" className="es__lienzo">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={g.comparacion.datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke={LINEA} />
                      <XAxis
                        dataKey="categoria"
                        tick={{ fill: TINTA, fontSize: 12 }}
                        axisLine={{ stroke: LINEA }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={compacto}
                        tick={{ fill: TINTA, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                      />
                      <Tooltip cursor={{ fill: 'rgba(15,42,68,0.04)' }} content={<Tip />} />
                      {g.sucursales.map((s) => (
                        <Bar
                          key={s.nombre}
                          dataKey={s.nombre}
                          name={s.nombre}
                          fill={s.color}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={24}
                          isAnimationActive={ANIMAR}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Grafica>
            )}

            {/* 8. Alcance de las existencias: barras con umbral */}
            <Grafica
              orden={13}
              titulo="¿Para cuántos días alcanza?"
              ayuda={g.cobertura.ayuda}
              vacio={g.cobertura.vacio}
              leyenda={[
                { nombre: 'Menos de 7 días', color: CRITICO },
                { nombre: '7 días o más', color: AZUL },
              ]}
              tabla={g.cobertura.tabla}
            >
              <div role="img" aria-label="Gráfica de barras: días que alcanzan las existencias de cada producto" className="es__lienzo">
                <ResponsiveContainer width="100%" height={Math.max(260, g.cobertura.datos.length * 44 + 46)}>
                  <BarChart data={g.cobertura.datos} layout="vertical" margin={{ top: 22, right: 56, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={LINEA} />
                    <XAxis type="number" hide domain={[0, 'dataMax']} />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={anchoEje}
                      tick={{ fill: '#101828', fontSize: 13 }}
                      tickFormatter={(v) => recortar(v, letrasEje)}
                      axisLine={{ stroke: LINEA }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15,42,68,0.04)' }}
                      content={
                        <Tip
                          titulo={(_, p) => `${p[0]?.payload?.nombre} · ${p[0]?.payload?.presentacion}`}
                          formato={(v, p) => `${numero(v)} días (hay ${p.payload.stockTexto})`}
                        />
                      }
                    />
                    <ReferenceLine
                      x={7}
                      stroke="#98a2b3"
                      strokeWidth={1}
                      label={{ value: '7 días', position: 'top', fill: TINTA, fontSize: 12 }}
                    />
                    <Bar dataKey="dias" name="Alcanza para" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={ANIMAR}>
                      {g.cobertura.datos.map((d) => (
                        <Cell key={d.id} fill={d.dias < 7 ? CRITICO : AZUL} />
                      ))}
                      <LabelList dataKey="dias" position="right" formatter={(v) => `${numero(v)} d`} fill="#101828" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Grafica>

            {/* 9. Precios: miniaturas, una por producto */}
            <Grafica
              ancha={g.sucursales.length < 2}
              orden={14}
              titulo="Cómo cambió el costo de cada producto"
              ayuda={g.precios.ayuda}
              vacio={g.precios.vacio}
              tabla={g.precios.tabla}
            >
              <div className={`es__minis${g.sucursales.length < 2 ? ' es__minis--ancha' : ''}`}>
                {g.precios.datos.map((p) => (
                  <article key={p.id} className="es__mini">
                    <div className="es__mini-cab">
                      <b>{p.nombre}</b>
                      <small>{p.presentacion}</small>
                    </div>
                    <div role="img" aria-label={`Evolución del costo de ${p.nombre}`}>
                      <ResponsiveContainer width="100%" height={64}>
                        <LineChart data={p.serie} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                          <YAxis hide domain={[(min) => min * 0.96, (max) => max * 1.04]} />
                          <Tooltip
                            cursor={{ stroke: '#98a2b3', strokeWidth: 1 }}
                            content={<Tip titulo={(d) => fechaCorta(d)} formato={moneda2} />}
                          />
                          <Line
                            type="monotone"
                            dataKey="costo"
                            name="Costo"
                            stroke={AZUL}
                            strokeWidth={2}
                            dot={<PuntoFinal total={p.serie.length} />}
                            activeDot={{ r: 4, fill: AZUL, stroke: '#fff', strokeWidth: 2 }}
                            isAnimationActive={ANIMAR}
                          />
                          <XAxis dataKey="dia" hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="es__mini-pie">
                      <span className={`es__delta${Math.abs(p.cambio) < 0.5 ? '' : p.cambio > 0 ? ' mal' : ' bien'}`}>
                        {Math.abs(p.cambio) < 0.5 ? (
                          'Estable'
                        ) : (
                          <>
                            {p.cambio > 0 ? <IconArrowUpRight size={16} aria-hidden="true" /> : <IconArrowDownRight size={16} aria-hidden="true" />}
                            {p.cambio > 0 ? '+' : ''}
                            {numero(Math.round(p.cambio * 10) / 10)}%
                          </>
                        )}
                      </span>
                      <span>
                        {moneda2(p.primero)} → <b>{moneda2(p.ultimo)}</b>
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            </Grafica>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Preparación de los datos de cada gráfica ---------- */
function preparar(d) {
  const dias = listaDias(d.desde, d.hasta);
  const extras = {};

  // Sucursales presentes, con color fijo por nombre
  const nombres = [...new Set([...d.consumoDiario, ...d.consumoProductos].map((f) => corto(f.sucursal)))].sort();
  const sucursales = nombres.map((nombre) => ({ nombre, color: colorDe(COLOR_SUCURSAL, nombre, extras) }));

  /* Consumo por día */
  const porDia = new Map(dias.map((dia) => [dia, { dia }]));
  for (const f of d.consumoDiario) {
    const fila = porDia.get(f.dia);
    if (fila) fila[corto(f.sucursal)] = (fila[corto(f.sucursal)] ?? 0) + f.valor;
  }
  const serieDiaria = dias.map((dia) => {
    const fila = porDia.get(dia);
    const total = suma(sucursales, (s) => fila[s.nombre] ?? 0);
    for (const s of sucursales) fila[s.nombre] ??= 0;
    return { ...fila, total };
  });
  const totalConsumo = suma(serieDiaria, (f) => f.total);
  const diaMasAlto = serieDiaria.reduce((a, f) => (f.total > a.total ? f : a), serieDiaria[0] ?? { total: 0 });
  const diario = {
    vacio: totalConsumo === 0,
    datos: serieDiaria,
    ayuda:
      totalConsumo > 0
        ? `El día más fuerte fue el ${fechaLarga(diaMasAlto.dia)}: ${moneda(diaMasAlto.total)}.`
        : undefined,
    tabla: {
      columnas: ['Día', ...sucursales.map((s) => s.nombre), 'Total'],
      filas: [...serieDiaria].reverse().map((f) => [fechaLarga(f.dia), ...sucursales.map((s) => moneda(f[s.nombre])), moneda(f.total)]),
    },
  };

  /* Por categoría (dona) */
  const porCategoria = new Map();
  for (const f of d.consumoProductos) porCategoria.set(f.categoria, (porCategoria.get(f.categoria) ?? 0) + f.valor);
  const totalCat = suma([...porCategoria.values()], (v) => v);
  const categoriasOrdenadas = [...porCategoria.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, valor]) => ({
      nombre,
      valor,
      pct: totalCat > 0 ? (valor / totalCat) * 100 : 0,
      color: colorDe(COLOR_CATEGORIA, nombre, extras),
    }));
  const categorias = {
    vacio: categoriasOrdenadas.length === 0,
    datos: categoriasOrdenadas,
    total: totalCat,
    ayuda: categoriasOrdenadas[0]
      ? `${categoriasOrdenadas[0].nombre} se lleva ${porcentaje(categoriasOrdenadas[0].pct)} del gasto.`
      : undefined,
    tabla: {
      columnas: ['Categoría', 'Consumo', '% del total'],
      filas: categoriasOrdenadas.map((c) => [c.nombre, moneda(c.valor), porcentaje(c.pct)]),
    },
  };

  /* Productos más consumidos */
  const porProducto = new Map();
  for (const f of d.consumoProductos) {
    const x = porProducto.get(f.productoId) ?? { id: f.productoId, nombre: f.producto, presentacion: f.presentacion, valor: 0 };
    x.valor += f.valor;
    porProducto.set(f.productoId, x);
  }
  const rankingCompleto = [...porProducto.values()].filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor);
  const top = rankingCompleto.slice(0, 8);
  const productos = {
    vacio: top.length === 0,
    datos: top,
    ayuda: top[0] ? `${top[0].nombre} es el que más se gasta: ${porcentaje((top[0].valor / totalCat) * 100)} del total.` : undefined,
    tabla: {
      columnas: ['Producto', 'Consumo', '% del total'],
      filas: rankingCompleto.map((p) => [`${p.nombre} · ${p.presentacion}`, moneda(p.valor), porcentaje((p.valor / totalCat) * 100)]),
    },
  };

  /* Promedio por día de la semana */
  const acumulado = DIAS_SEMANA.map(() => ({ suma: 0, dias: 0 }));
  for (const f of serieDiaria) {
    const i = (aDate(f.dia).getDay() + 6) % 7;
    acumulado[i].suma += f.total;
    acumulado[i].dias += 1;
  }
  const promedios = acumulado.map((a, i) => ({
    nombre: DIAS_SEMANA[i],
    corto: DIAS_SEMANA[i].slice(0, 3),
    promedio: a.dias ? Math.round((a.suma / a.dias) * 100) / 100 : 0,
  }));
  const maxProm = Math.max(0, ...promedios.map((p) => p.promedio));
  const semanaDatos = promedios.map((p) => ({ ...p, destacado: maxProm > 0 && p.promedio === maxProm }));
  const mejor = semanaDatos.find((p) => p.destacado);
  const finde = (promedios[5].promedio + promedios[6].promedio) / 2;
  const entre = suma(promedios.slice(0, 5), (p) => p.promedio) / 5;
  const semana = {
    vacio: maxProm === 0,
    datos: semanaDatos,
    ayuda: mejor
      ? entre > 0 && finde > entre * 1.15
        ? `El fin de semana se consume ${numero(Math.round((finde / entre) * 10) / 10)} veces lo de un día entre semana.`
        : `El ${mejor.nombre.toLowerCase()} es el día más fuerte.`
      : undefined,
    tabla: {
      columnas: ['Día de la semana', 'Consumo promedio'],
      filas: promedios.map((p) => [p.nombre, moneda(p.promedio)]),
    },
  };

  /* Compras contra consumo, en semanas de 7 días que terminan en la fecha final */
  const comprasPorDia = new Map(d.comprasDiarias.map((f) => [f.dia, f.valor]));
  const nSemanas = Math.floor(dias.length / 7);
  const semanal = [];
  for (let b = nSemanas - 1; b >= 0; b -= 1) {
    const tramo = dias.slice(dias.length - 7 * (b + 1), dias.length - 7 * b);
    const porDiaConsumo = new Map(serieDiaria.map((f) => [f.dia, f.total]));
    semanal.push({
      etiqueta: fechaCorta(tramo[0]),
      rango: `Del ${fechaCorta(tramo[0])} al ${fechaCorta(tramo[6])}`,
      compras: Math.round(suma(tramo, (x) => comprasPorDia.get(x) ?? 0) * 100) / 100,
      consumo: Math.round(suma(tramo, (x) => porDiaConsumo.get(x) ?? 0) * 100) / 100,
    });
  }
  const totalComprasSem = suma(semanal, (s) => s.compras);
  const totalConsumoSem = suma(semanal, (s) => s.consumo);
  const semanalObj = {
    vacio: semanal.length < 2 || (totalComprasSem === 0 && totalConsumoSem === 0),
    datos: semanal,
    ayuda:
      totalConsumoSem > 0
        ? totalComprasSem > totalConsumoSem * 1.1
          ? 'Se compró más de lo que se consumió: el inventario está creciendo.'
          : totalComprasSem < totalConsumoSem * 0.9
            ? 'Se consumió más de lo que se compró: el inventario está bajando.'
            : 'Lo que se compra y lo que se consume van parejos.'
        : undefined,
    tabla: {
      columnas: ['Semana', 'Compras', 'Consumo'],
      filas: [...semanal].reverse().map((s) => [s.rango, moneda(s.compras), moneda(s.consumo)]),
    },
  };

  /* Proveedores por forma de pago */
  const provMapa = new Map();
  for (const f of d.comprasProveedor) {
    const x = provMapa.get(f.proveedorId) ?? { proveedor: f.proveedor, total: 0 };
    x[f.formaPago] = (x[f.formaPago] ?? 0) + f.total;
    x.total += f.total;
    provMapa.set(f.proveedorId, x);
  }
  const provDatos = [...provMapa.values()].sort((a, b) => b.total - a.total);
  const formasUsadas = Object.entries(FORMAS)
    .filter(([id]) => provDatos.some((p) => p[id] > 0))
    .map(([id, f]) => ({ id, ...f }));
  for (const p of provDatos) {
    for (const f of formasUsadas) p[f.id] ??= 0;
    p.cola = Math.max(1, p.total * 0.001); // ver la serie invisible del gráfico
  }
  const totalProv = suma(provDatos, (p) => p.total);
  const proveedores = {
    vacio: provDatos.length === 0,
    datos: provDatos,
    formas: formasUsadas,
    leyenda: formasUsadas.map((f) => ({ nombre: f.texto, color: f.color })),
    ayuda: provDatos[0]
      ? `${provDatos[0].proveedor} concentra ${porcentaje((provDatos[0].total / totalProv) * 100)} de las compras.`
      : undefined,
    tabla: {
      columnas: ['Proveedor', ...formasUsadas.map((f) => f.texto), 'Total'],
      filas: provDatos.map((p) => [p.proveedor, ...formasUsadas.map((f) => moneda(p[f.id] ?? 0)), moneda(p.total)]),
    },
  };

  /* Centro contra Villa por categoría */
  const catSuc = new Map();
  for (const f of d.consumoProductos) {
    const x = catSuc.get(f.categoria) ?? { categoria: f.categoria };
    x[corto(f.sucursal)] = (x[corto(f.sucursal)] ?? 0) + f.valor;
    catSuc.set(f.categoria, x);
  }
  const comparacionDatos = [...catSuc.values()]
    .map((x) => {
      for (const s of sucursales) x[s.nombre] ??= 0;
      return x;
    })
    .sort((a, b) => suma(sucursales, (s) => b[s.nombre]) - suma(sucursales, (s) => a[s.nombre]));
  const totalPorSuc = sucursales.map((s) => ({ ...s, total: suma(comparacionDatos, (x) => x[s.nombre]) }));
  const mayor = [...totalPorSuc].sort((a, b) => b.total - a.total)[0];
  const menor = [...totalPorSuc].sort((a, b) => a.total - b.total)[0];
  const comparacion = {
    vacio: comparacionDatos.length === 0,
    datos: comparacionDatos,
    ayuda:
      mayor && menor && menor.total > 0 && mayor.nombre !== menor.nombre
        ? `${mayor.nombre} consume ${numero(Math.round((mayor.total / menor.total) * 10) / 10)} veces lo que ${menor.nombre}.`
        : undefined,
    tabla: {
      columnas: ['Categoría', ...sucursales.map((s) => s.nombre)],
      filas: comparacionDatos.map((x) => [x.categoria, ...sucursales.map((s) => moneda(x[s.nombre]))]),
    },
  };

  /* Cuántos días alcanza cada producto con el consumo diario del periodo */
  const filasCob = d.cobertura.map((p) => {
    const diario = p.consumo / d.dias;
    const dias = diario > 0 ? Math.max(0, p.stock) / diario : null;
    return {
      id: p.productoId,
      nombre: p.producto,
      presentacion: p.presentacion,
      stockTexto: `${numero(p.stock)} ${UNIDAD[p.unidadMedida] ?? ''}`.trim(),
      dias: dias == null ? null : Math.round(Math.min(dias, 365) * 10) / 10,
    };
  });
  const conConsumo = filasCob.filter((p) => p.dias != null).sort((a, b) => a.dias - b.dias);
  const urgentes = conConsumo.filter((p) => p.dias < 7).length;
  const cobertura = {
    vacio: conConsumo.length === 0,
    datos: conConsumo,
    ayuda:
      urgentes > 0
        ? `${urgentes} ${urgentes === 1 ? 'producto alcanza' : 'productos alcanzan'} para menos de una semana, a este ritmo de consumo.`
        : 'Todos los productos alcanzan para una semana o más, a este ritmo de consumo.',
    tabla: {
      columnas: ['Producto', 'Existencias', 'Alcanza para'],
      filas: filasCob
        .slice()
        .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity))
        .map((p) => [`${p.nombre} · ${p.presentacion}`, p.stockTexto, p.dias == null ? 'Sin consumo' : `${numero(p.dias)} días`]),
    },
  };

  /* Costo de cada producto: una miniatura por producto con al menos dos compras */
  const preciosMapa = new Map();
  for (const f of d.precios) {
    const x = preciosMapa.get(f.productoId) ?? { id: f.productoId, nombre: f.producto, presentacion: f.presentacion, serie: [] };
    x.serie.push({ dia: f.dia, costo: f.costo });
    preciosMapa.set(f.productoId, x);
  }
  const preciosDatos = [...preciosMapa.values()]
    .filter((p) => p.serie.length >= 2)
    .map((p) => {
      const primero = p.serie[0].costo;
      const ultimo = p.serie[p.serie.length - 1].costo;
      return { ...p, primero, ultimo, cambio: primero > 0 ? ((ultimo - primero) / primero) * 100 : 0 };
    })
    .sort((a, b) => b.cambio - a.cambio);
  const subieron = preciosDatos.filter((p) => p.cambio >= 0.5).length;
  const precios = {
    vacio: preciosDatos.length === 0,
    datos: preciosDatos,
    ayuda: preciosDatos.length
      ? `${subieron} de ${preciosDatos.length} productos subieron de precio en el periodo. Del que más subió al que menos.`
      : undefined,
    tabla: {
      columnas: ['Producto', 'Primer costo', 'Último costo', 'Cambio'],
      filas: preciosDatos.map((p) => [
        `${p.nombre} · ${p.presentacion}`,
        moneda2(p.primero),
        moneda2(p.ultimo),
        `${p.cambio > 0 ? '+' : ''}${numero(Math.round(p.cambio * 10) / 10)}%`,
      ]),
    },
  };

  return { kpis: d.kpis, sucursales, diario, categorias, productos, semana, semanal: semanalObj, proveedores, comparacion, cobertura, precios };
}
