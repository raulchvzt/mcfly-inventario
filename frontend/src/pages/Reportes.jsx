import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconDownload } from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { moneda, numero, UNIDAD } from '../utils/formato';
import './Reportes.css';

const dos = (n) => String(n).padStart(2, '0');
const aFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const hoy = () => aFecha(new Date());
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return aFecha(d);
};
const inicioMes = () => {
  const d = new Date();
  return aFecha(new Date(d.getFullYear(), d.getMonth(), 1));
};

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const PERIODOS = [
  { id: 'mes', texto: 'Este mes', rango: () => [inicioMes(), hoy()] },
  { id: '7', texto: '7 días', rango: () => [haceDias(6), hoy()] },
  { id: '30', texto: '30 días', rango: () => [haceDias(29), hoy()] },
];

// Cada reporte define sus columnas una sola vez: sirven para la tabla y para el CSV
const REPORTES = {
  consumo: {
    texto: 'Consumo',
    ayuda: 'Lo que se gastó en servicio, valorizado con el costo de cada movimiento.',
    total: 'Gasto en consumo',
    usaPeriodo: true,
    peso: (f) => f.valor,
    columnas: [
      { t: 'Producto', v: (f) => `${f.producto} · ${f.presentacion}` },
      { t: 'Categoría', v: (f) => f.categoria },
      { t: 'Cantidad', der: true, v: (f) => `${numero(f.cantidad)} ${UNIDAD[f.unidadMedida]}`, csv: (f) => f.cantidad },
      { t: 'Valor', der: true, v: (f) => moneda(f.valor), csv: (f) => f.valor },
    ],
    csvExtra: [{ t: 'Unidad', csv: (f) => UNIDAD[f.unidadMedida] }],
    clave: (f) => f.productoId,
  },
  mermas: {
    texto: 'Mermas',
    ayuda: 'Producto perdido o desperdiciado, con quién lo registró y por qué.',
    total: 'Pérdida por mermas',
    usaPeriodo: true,
    columnas: [
      { t: 'Fecha', v: (f) => fechaHora(f.fecha), csv: (f) => f.fecha },
      { t: 'Producto', v: (f) => `${f.producto} · ${f.presentacion}` },
      { t: 'Sucursal', v: (f) => f.sucursal },
      { t: 'Registró', v: (f) => f.usuario },
      { t: 'Motivo', v: (f) => f.motivo || '—', csv: (f) => f.motivo || '' },
      { t: 'Cantidad', der: true, v: (f) => `${numero(f.cantidad)} ${UNIDAD[f.unidadMedida]}`, csv: (f) => f.cantidad },
      { t: 'Valor', der: true, v: (f) => moneda(f.valor), csv: (f) => f.valor },
    ],
    clave: (f) => f.id,
  },
  compras: {
    texto: 'Compras',
    ayuda: 'Cuánto se compró a cada proveedor en el periodo.',
    total: 'Total comprado',
    usaPeriodo: true,
    peso: (f) => f.total,
    columnas: [
      { t: 'Proveedor', v: (f) => f.proveedor },
      { t: 'Compras', der: true, v: (f) => numero(f.compras), csv: (f) => f.compras },
      { t: 'A crédito', der: true, v: (f) => moneda(f.aCredito), csv: (f) => f.aCredito },
      { t: 'Total', der: true, v: (f) => moneda(f.total), csv: (f) => f.total },
    ],
    clave: (f) => f.proveedorId,
  },
  inventario: {
    texto: 'Valor del inventario',
    ayuda: 'Dinero que hay en existencias hoy, por categoría y sucursal.',
    total: 'Valor en existencias',
    usaPeriodo: false,
    peso: (f) => f.valor,
    columnas: [
      { t: 'Categoría', v: (f) => f.categoria },
      { t: 'Sucursal', v: (f) => f.sucursal },
      { t: 'Unidades', der: true, v: (f) => numero(f.unidades), csv: (f) => f.unidades },
      { t: 'Valor', der: true, v: (f) => moneda(f.valor), csv: (f) => f.valor },
    ],
    clave: (f) => `${f.categoria}:${f.sucursalId}`,
  },
};

// Evita que Excel ejecute como fórmula un texto que empieza con = + - @
function celdaCsv(valor) {
  if (valor == null) return '';
  let s = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarCsv(nombre, columnas, filas) {
  const lineas = [
    columnas.map((c) => celdaCsv(c.t)).join(','),
    ...filas.map((f) => columnas.map((c) => celdaCsv((c.csv ?? c.v)(f))).join(',')),
  ];
  // El BOM hace que Excel respete los acentos
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reportes() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';

  const [tab, setTab] = useState('consumo');
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [periodo, setPeriodo] = useState('30');
  const [[desde, hasta], setRango] = useState(PERIODOS[2].rango());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const def = REPORTES[tab];
  const rangoInvalido = def.usaPeriodo && desde && hasta && desde > hasta;

  useEffect(() => {
    if (esDueno) {
      api('/sucursales')
        .then(setSucursales)
        .catch((e) => setError(e.message));
    }
  }, [esDueno]);

  useEffect(() => {
    if (rangoInvalido || !desde || !hasta) return;
    let vigente = true;
    setCargando(true);
    const q = new URLSearchParams();
    if (def.usaPeriodo) {
      q.set('desde', desde);
      q.set('hasta', hasta);
    }
    if (sucursalId) q.set('sucursalId', sucursalId);
    api(`/reportes/${tab}?${q}`)
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setError('');
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [tab, sucursalId, desde, hasta, rangoInvalido, def.usaPeriodo]);

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const maximo = useMemo(() => (def.peso ? Math.max(0, ...filas.map(def.peso)) : 0), [def, filas]);

  function elegirPeriodo(p) {
    setPeriodo(p.id);
    setRango(p.rango());
  }

  function exportar() {
    const columnas = [...def.columnas, ...(def.csvExtra ?? [])];
    const sufijo = def.usaPeriodo ? `${desde}_a_${hasta}` : hoy();
    descargarCsv(`mcfly-${tab}-${sufijo}.csv`, columnas, filas);
  }

  return (
    <div className="rp">
      <header className="rp__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Reportes</h1>
          <p className="rp__sub">{esDueno ? 'Para decidir con números, de todo el negocio' : 'De tu sucursal'}</p>
        </div>
        <button type="button" className="rp__btn" onClick={exportar} disabled={cargando || filas.length === 0}>
          <IconDownload size={18} aria-hidden="true" /> Descargar CSV
        </button>
      </header>

      <div className="rp__tabs entra" style={{ '--i': 1 }} role="tablist" aria-label="Tipo de reporte">
        {Object.entries(REPORTES).map(([id, r]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => {
              setDatos(null);
              setTab(id);
            }}
          >
            {r.texto}
          </button>
        ))}
      </div>

      <section className="rp__tarjeta entra" style={{ '--i': 2 }}>
        <p className="rp__ayuda">{def.ayuda}</p>

        <div className="rp__filtros">
          {esDueno && (
            <label className="rp__campo">
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
          {def.usaPeriodo && (
            <>
              <label className="rp__campo">
                Desde
                <input
                  type="date"
                  value={desde}
                  max={hasta || undefined}
                  onChange={(e) => {
                    setPeriodo('');
                    setRango([e.target.value, hasta]);
                  }}
                />
              </label>
              <label className="rp__campo">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => {
                    setPeriodo('');
                    setRango([desde, e.target.value]);
                  }}
                />
              </label>
              <div className="rp__rapidos" role="group" aria-label="Periodos rápidos">
                {PERIODOS.map((p) => (
                  <button key={p.id} type="button" className={periodo === p.id ? 'on' : ''} onClick={() => elegirPeriodo(p)}>
                    {p.texto}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {rangoInvalido && (
          <p className="rp__error" role="alert">
            <IconAlertTriangle size={16} aria-hidden="true" /> La fecha "desde" no puede ser posterior a "hasta".
          </p>
        )}
        {error && (
          <p className="rp__error" role="alert">
            {error}
          </p>
        )}

        {datos && !rangoInvalido && (
          <div className="rp__resumen">
            <div>
              <span>{def.total}</span>
              <b>{moneda(datos.total)}</b>
            </div>
            <div>
              <span>Registros</span>
              <b>{numero(filas.length)}</b>
            </div>
          </div>
        )}

        {cargando && !datos ? (
          <p className="rp__vacio">Cargando…</p>
        ) : rangoInvalido ? null : filas.length === 0 && !cargando ? (
          <p className="rp__vacio">No hay datos en este periodo.</p>
        ) : (
          <div className={`rp__scroll${cargando ? ' rp__scroll--carga' : ''}`}>
            <table className="rp__tabla">
              <thead>
                <tr>
                  {def.columnas.map((c) => (
                    <th key={c.t} className={c.der ? 'der' : ''}>
                      {c.t}
                    </th>
                  ))}
                  {def.peso && (
                    <th>
                      <span className="rp__oculto">Peso en el total</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={def.clave(f)}>
                    {def.columnas.map((c) => (
                      <td key={c.t} className={c.der ? 'der' : ''}>
                        {c.v(f)}
                      </td>
                    ))}
                    {def.peso && (
                      <td className="rp__peso">
                        <span className="rp__barra" aria-hidden="true">
                          <i style={{ width: `${maximo > 0 ? (def.peso(f) / maximo) * 100 : 0}%` }} />
                        </span>
                        <span className="rp__pct">
                          {datos.total > 0 ? Math.round((def.peso(f) / datos.total) * 100) : 0}%
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}