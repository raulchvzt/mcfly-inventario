import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
  IconTruck,
  IconX,
} from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { numero, UNIDAD } from '../utils/formato';
import './css/Transferencias.css';

const LIMITE = 25;

const fechaHora = (f) =>
  f
    ? new Date(f).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

const dosDecimales = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

let contador = 0;
const lineaVacia = () => ({ clave: ++contador, productoId: '', cantidad: '' });

function EstadoPill({ estado }) {
  if (estado === 'pendiente') {
    return (
      <span className="tr__pill tr__pill--pend">
        <IconTruck size={13} aria-hidden="true" /> En tránsito
      </span>
    );
  }
  return (
    <span className="tr__pill tr__pill--ok">
      <IconCheck size={13} aria-hidden="true" /> Recibida
    </span>
  );
}

function FormularioTransferencia({ esDueno, usuario, sucursales, onCancelar, onCreada }) {
  const [origenId, setOrigenId] = useState(esDueno ? (sucursales[0]?.id ?? '') : usuario.sucursalId);
  const [destinoId, setDestinoId] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [disponibles, setDisponibles] = useState([]);
  const [cargandoStock, setCargandoStock] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Solo se puede enviar lo que hay en la sucursal de origen
  useEffect(() => {
    if (!origenId) return;
    let vigente = true;
    setCargandoStock(true);
    api(`/stock?sucursalId=${origenId}`)
      .then((filas) => {
        if (vigente) setDisponibles(filas.filter((f) => f.stock > 0));
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargandoStock(false));
    return () => {
      vigente = false;
    };
  }, [origenId]);

  const porId = new Map(disponibles.map((d) => [String(d.productoId), d]));
  const usados = new Set(lineas.map((l) => l.productoId).filter(Boolean));
  const destinos = sucursales.filter((s) => s.id !== Number(origenId));

  function cambiarOrigen(valor) {
    setOrigenId(valor);
    setLineas([lineaVacia()]);
    if (Number(destinoId) === Number(valor)) setDestinoId('');
  }

  const cambiarLinea = (clave, cambios) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  async function crear(e) {
    e.preventDefault();
    setError('');
    if (!destinoId) return setError('Elige la sucursal que recibe.');

    const items = [];
    for (const [i, l] of lineas.entries()) {
      const n = i + 1;
      const d = porId.get(l.productoId);
      const cantidad = Number(l.cantidad);
      if (!d) return setError(`Elige el producto en la línea ${n}.`);
      if (l.cantidad === '' || !(cantidad > 0)) return setError(`La cantidad de la línea ${n} debe ser mayor a 0.`);
      if (!dosDecimales(cantidad)) return setError(`La línea ${n} admite máximo 2 decimales.`);
      if (cantidad > d.stock) {
        return setError(`Solo hay ${numero(d.stock)} ${UNIDAD[d.unidadMedida]} de ${d.nombre} en el origen (línea ${n}).`);
      }
      items.push({ productoId: d.productoId, cantidad });
    }

    const body = { sucursalDestinoId: Number(destinoId), items };
    if (esDueno) body.sucursalOrigenId = Number(origenId);
    if (notas.trim()) body.notas = notas.trim();

    setGuardando(true);
    try {
      const t = await api('/transferencias', { method: 'POST', body });
      onCreada(`Transferencia n.º ${t.id} enviada a ${t.destino}. Queda en tránsito hasta que la confirmen.`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <form className="tr__tarjeta tr__form entra" onSubmit={crear}>
      <div className="tr__form-cab">
        <h2>Nueva transferencia</h2>
        <button type="button" className="tr__x" onClick={onCancelar} aria-label="Cancelar">
          <IconX size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="tr__grid">
        {esDueno ? (
          <label className="tr__campo">
            Sale de
            <select value={origenId} onChange={(e) => cambiarOrigen(Number(e.target.value))}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="tr__campo">
            Sale de
            <p className="tr__fijo">{sucursales.find((s) => s.id === usuario.sucursalId)?.nombre ?? 'Tu sucursal'}</p>
          </div>
        )}
        <label className="tr__campo">
          Llega a
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
            <option value="">Elige la sucursal</option>
            {destinos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="tr__campo">
          Notas (opcional)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={255} />
        </label>
      </div>

      <h3 className="tr__sub">Productos a enviar</h3>
      {!cargandoStock && disponibles.length === 0 ? (
        <p className="tr__vacio">La sucursal de origen no tiene existencias para enviar.</p>
      ) : (
        <ul className="tr__lineas">
          {lineas.map((l, i) => {
            const d = porId.get(l.productoId);
            const u = d ? UNIDAD[d.unidadMedida] : '';
            return (
              <li key={l.clave} className="tr__linea">
                <label className="tr__campo tr__campo--prod">
                  {i === 0 ? 'Producto' : <span className="tr__oculto">Producto</span>}
                  <select
                    value={l.productoId}
                    onChange={(e) => cambiarLinea(l.clave, { productoId: e.target.value, cantidad: '' })}
                    disabled={cargandoStock}
                  >
                    <option value="">{cargandoStock ? 'Cargando…' : 'Elige un producto'}</option>
                    {disponibles.map((x) => (
                      <option
                        key={x.productoId}
                        value={x.productoId}
                        disabled={usados.has(String(x.productoId)) && String(x.productoId) !== l.productoId}
                      >
                        {x.nombre} · {x.presentacion} (hay {numero(x.stock)} {UNIDAD[x.unidadMedida]})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tr__campo">
                  {i === 0 ? `Cantidad${u ? ` (${u})` : ''}` : <span className="tr__oculto">Cantidad</span>}
                  <input
                    type="number"
                    min="0"
                    max={d?.stock}
                    step="0.01"
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="tr__icono"
                  onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : ls))}
                  disabled={lineas.length === 1}
                  aria-label={`Quitar línea ${i + 1}`}
                  title="Quitar línea"
                >
                  <IconTrash size={18} aria-hidden="true" />
                </button>
                {d && Number(l.cantidad) > d.stock && (
                  <p className="tr__aviso">
                    <IconAlertTriangle size={14} aria-hidden="true" /> Solo hay {numero(d.stock)} {u} disponibles.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="tr__link"
        onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
        disabled={lineas.length >= 50 || lineas.length >= disponibles.length}
      >
        <IconPlus size={16} aria-hidden="true" /> Agregar producto
      </button>

      <p className="tr__nota">
        Al enviar, la mercancía sale del inventario de origen. Llega al destino cuando esa sucursal confirme la recepción.
      </p>

      {error && (
        <p className="tr__error" role="alert">
          {error}
        </p>
      )}

      <div className="tr__pie">
        <button type="button" className="tr__btn tr__btn--sec" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="tr__btn" disabled={guardando || cargandoStock}>
          {guardando ? 'Enviando…' : 'Enviar transferencia'}
        </button>
      </div>
    </form>
  );
}

function Detalle({ id, puedeConfirmar, onConfirmada }) {
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [preguntando, setPreguntando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    api(`/transferencias/${id}`)
      .then(setT)
      .catch((e) => setError(e.message));
  }, [id]);

  async function confirmar() {
    setConfirmando(true);
    setError('');
    try {
      const nueva = await api(`/transferencias/${id}/confirmar`, { method: 'POST' });
      setT(nueva);
      setPreguntando(false);
      onConfirmada(nueva);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirmando(false);
    }
  }

  if (!t && !error) return <p className="tr__mu">Cargando detalle…</p>;

  return (
    <div className="tr__detalle">
      {t && (
        <>
          <ul className="tr__items">
            {t.items.map((i) => (
              <li key={i.id}>
                <span>
                  {i.producto} <small>{i.presentacion}</small>
                </span>
                <b>
                  {numero(i.cantidad)} {UNIDAD[i.unidadMedida]}
                </b>
              </li>
            ))}
          </ul>
          {t.notas && <p className="tr__mu">Notas: {t.notas}</p>}
          <p className="tr__mu">
            Enviada por {t.creadaPor} el {fechaHora(t.creadaEn)}
            {t.estado === 'confirmada' && ` · Recibida por ${t.confirmadaPor} el ${fechaHora(t.confirmadaEn)}`}
          </p>

          {t.estado === 'pendiente' && puedeConfirmar && (
            <div className="tr__confirmar">
              {preguntando ? (
                <>
                  <span>¿Ya recibiste todos estos productos en {t.destino}?</span>
                  <button type="button" className="tr__btn" onClick={confirmar} disabled={confirmando}>
                    {confirmando ? 'Confirmando…' : 'Sí, confirmar recepción'}
                  </button>
                  <button type="button" className="tr__btn tr__btn--sec" onClick={() => setPreguntando(false)} disabled={confirmando}>
                    Todavía no
                  </button>
                </>
              ) : (
                <button type="button" className="tr__btn" onClick={() => setPreguntando(true)}>
                  <IconCheck size={18} aria-hidden="true" /> Confirmar recepción
                </button>
              )}
            </div>
          )}
          {t.estado === 'pendiente' && !puedeConfirmar && (
            <p className="tr__mu">Solo la sucursal {t.destino} puede confirmar la recepción.</p>
          )}
        </>
      )}
      {error && (
        <p className="tr__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Transferencias() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';

  const [vista, setVista] = useState('lista');
  const [sucursales, setSucursales] = useState([]);
  const [filtros, setFiltros] = useState({ estado: '', sucursalId: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ datos: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    api('/sucursales')
      .then(setSucursales)
      .catch((e) => setError(e.message));
  }, []);

  const rangoInvalido = filtros.desde && filtros.hasta && filtros.desde > filtros.hasta;

  const cargar = useCallback(async () => {
    if (rangoInvalido) return;
    setCargando(true);
    try {
      const q = new URLSearchParams({ pagina, limite: LIMITE });
      for (const [k, v] of Object.entries(filtros)) if (v) q.set(k, v);
      setDatos(await api(`/transferencias?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [filtros, pagina, rangoInvalido]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarFiltro = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
    setAbierta(null);
  };

  const hayFiltros = Object.values(filtros).some(Boolean);
  const paginas = Math.max(1, Math.ceil(datos.total / LIMITE));
  const puedeConfirmar = (t) => esDueno || usuario.sucursalId === t.destinoId;

  function alCrear(mensaje) {
    setVista('lista');
    setExito(mensaje);
    setPagina(1);
    setAbierta(null);
    cargar();
  }

  function alConfirmar(t) {
    setExito(`Transferencia n.º ${t.id} recibida en ${t.destino}. El inventario ya se actualizó.`);
    setDatos((d) => ({
      ...d,
      datos: d.datos.map((x) =>
        x.id === t.id
          ? { ...x, estado: t.estado, confirmadaPor: t.confirmadaPor, confirmadaEn: t.confirmadaEn }
          : x
      ),
    }));
  }

  return (
    <div className="tr">
      <header className="tr__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Transferencias</h1>
          <p className="tr__subt">Mercancía que viaja entre sucursales, con confirmación de quien la recibe</p>
        </div>
        {vista === 'lista' && (
          <button
            type="button"
            className="tr__btn"
            onClick={() => {
              setExito('');
              setVista('nueva');
            }}
          >
            <IconPlus size={18} aria-hidden="true" /> Nueva transferencia
          </button>
        )}
      </header>

      {exito && (
        <p className="tr__exito" role="status">
          <IconCheck size={18} aria-hidden="true" /> {exito}
        </p>
      )}

      {vista === 'nueva' ? (
        <FormularioTransferencia
          esDueno={esDueno}
          usuario={usuario}
          sucursales={sucursales}
          onCancelar={() => setVista('lista')}
          onCreada={alCrear}
        />
      ) : (
        <section className="tr__tarjeta entra" style={{ '--i': 1 }}>
          <div className="tr__filtros">
            <label className="tr__campo">
              Estado
              <select value={filtros.estado} onChange={cambiarFiltro('estado')}>
                <option value="">Todas</option>
                <option value="pendiente">En tránsito</option>
                <option value="confirmada">Recibidas</option>
              </select>
            </label>
            {esDueno && (
              <label className="tr__campo">
                Sucursal
                <select value={filtros.sucursalId} onChange={cambiarFiltro('sucursalId')}>
                  <option value="">Todas</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="tr__campo">
              Desde
              <input type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} />
            </label>
            <label className="tr__campo">
              Hasta
              <input type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} />
            </label>
          </div>
          {hayFiltros && (
            <button
              type="button"
              className="tr__link"
              onClick={() => {
                setFiltros({ estado: '', sucursalId: '', desde: '', hasta: '' });
                setPagina(1);
              }}
            >
              <IconX size={16} aria-hidden="true" /> Limpiar filtros
            </button>
          )}

          {rangoInvalido && (
            <p className="tr__error" role="alert">
              <IconAlertTriangle size={16} aria-hidden="true" /> La fecha "desde" no puede ser posterior a "hasta".
            </p>
          )}
          {error && (
            <p className="tr__error" role="alert">
              {error}
            </p>
          )}

          {cargando && datos.datos.length === 0 ? (
            <p className="tr__vacio">Cargando…</p>
          ) : datos.datos.length === 0 ? (
            <p className="tr__vacio">
              {hayFiltros ? 'No hay transferencias con esos filtros.' : 'Todavía no hay transferencias.'}
            </p>
          ) : (
            <>
              <p className="tr__conteo">
                {numero(datos.total)} {datos.total === 1 ? 'transferencia' : 'transferencias'}
              </p>
              <div className={`tr__scroll${cargando ? ' tr__scroll--carga' : ''}`}>
                <table className="tr__tabla">
                  <thead>
                    <tr>
                      <th>N.º</th>
                      <th>Ruta</th>
                      <th>Enviada</th>
                      <th>Productos</th>
                      <th>Estado</th>
                      <th className="der">
                        <span className="tr__oculto">Detalle</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.datos.map((t) => {
                      const abierto = abierta === t.id;
                      return (
                        <Fragment key={t.id}>
                          <tr className={abierto ? 'tr__fila--abierta' : ''}>
                            <td>{t.id}</td>
                            <td>
                              <span className="tr__ruta">
                                {t.origen} <IconArrowRight size={15} aria-hidden="true" /> {t.destino}
                              </span>
                            </td>
                            <td>
                              {fechaHora(t.creadaEn)}
                              <small>{t.creadaPor}</small>
                            </td>
                            <td>{t.productos}</td>
                            <td>
                              <EstadoPill estado={t.estado} />
                              {t.estado === 'pendiente' && puedeConfirmar(t) && (
                                <small className="tr__espera">Esperando tu confirmación</small>
                              )}
                            </td>
                            <td className="der">
                              <button
                                type="button"
                                className="tr__link"
                                onClick={() => setAbierta(abierto ? null : t.id)}
                                aria-expanded={abierto}
                              >
                                {abierto ? 'Ocultar' : 'Ver detalle'}
                                {abierto ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
                              </button>
                            </td>
                          </tr>
                          {abierto && (
                            <tr className="tr__fila-detalle">
                              <td colSpan={6}>
                                <Detalle id={t.id} puedeConfirmar={puedeConfirmar(t)} onConfirmada={alConfirmar} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {paginas > 1 && (
                <nav className="tr__pag" aria-label="Paginación">
                  <button type="button" className="tr__btn tr__btn--sec" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                    Anterior
                  </button>
                  <span>
                    Página {pagina} de {paginas}
                  </span>
                  <button type="button" className="tr__btn tr__btn--sec" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
                    Siguiente
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}