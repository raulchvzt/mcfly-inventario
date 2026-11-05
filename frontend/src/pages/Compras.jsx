import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { moneda, numero, UNIDAD } from '../utils/formato';
import './Compras.css';

const LIMITE = 25;
const FORMAS = [
  { valor: 'contado', texto: 'Contado' },
  { valor: 'credito', texto: 'Crédito' },
  { valor: 'caja_chica', texto: 'Caja chica' },
];
const TEXTO_FORMA = Object.fromEntries(FORMAS.map((f) => [f.valor, f.texto]));

function hoyLocal() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const fechaCorta = (f) =>
  new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const dosDecimales = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

let contador = 0;
const lineaVacia = () => ({ clave: ++contador, productoId: '', cantidad: '', costo: '', sugerido: null });

function FormularioCompra({ esDueno, sucursales, proveedores, productos, onCancelar, onRegistrada }) {
  const [proveedorId, setProveedorId] = useState('');
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? '');
  const [formaPago, setFormaPago] = useState('contado');
  const [ticket, setTicket] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const total = lineas.reduce((s, l) => {
    const c = Number(l.cantidad);
    const k = Number(l.costo);
    return s + (c > 0 && k >= 0 ? c * k : 0);
  }, 0);

  const cambiarLinea = (clave, cambios) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  // Al elegir un producto se sugiere el último precio de ese proveedor, o el último costo conocido
  async function elegirProducto(clave, valor) {
    const id = Number(valor);
    cambiarLinea(clave, { productoId: valor, sugerido: null });
    if (!id) return;
    const p = porId.get(id);
    let precio = p?.ultimoCosto ?? null;
    let deProveedor = false;
    if (proveedorId) {
      try {
        const lista = await api(`/productos/${id}/proveedores`);
        const v = lista.find((x) => x.id === Number(proveedorId));
        if (v && v.ultimoPrecio != null) {
          precio = v.ultimoPrecio;
          deProveedor = true;
        }
      } catch {
        /* la sugerencia es opcional */
      }
    }
    if (precio != null && precio > 0) {
      setLineas((ls) =>
        ls.map((l) =>
          l.clave === clave && l.productoId === valor
            ? { ...l, sugerido: { precio, deProveedor }, costo: l.costo === '' ? String(precio) : l.costo }
            : l
        )
      );
    }
  }

  async function registrar(e) {
    e.preventDefault();
    setError('');

    if (!proveedorId) return setError('Elige el proveedor.');
    if (!ticket.trim()) return setError('Escribe el número de ticket o factura.');
    if (fecha > hoyLocal()) return setError('La fecha no puede ser futura.');

    const items = [];
    for (const [i, l] of lineas.entries()) {
      const n = i + 1;
      const cantidad = Number(l.cantidad);
      const costoUnitario = Number(l.costo);
      if (!l.productoId) return setError(`Elige el producto en la línea ${n}.`);
      if (l.cantidad === '' || !(cantidad > 0)) return setError(`La cantidad de la línea ${n} debe ser mayor a 0.`);
      if (l.costo === '' || !(costoUnitario >= 0)) return setError(`El costo de la línea ${n} no es válido.`);
      if (!dosDecimales(cantidad) || !dosDecimales(costoUnitario)) {
        return setError(`La línea ${n} admite máximo 2 decimales.`);
      }
      items.push({ productoId: Number(l.productoId), cantidad, costoUnitario });
    }

    const body = {
      proveedorId: Number(proveedorId),
      formaPago,
      numeroTicket: ticket.trim(),
      fecha,
      items,
    };
    if (esDueno) body.sucursalId = Number(sucursalId);
    if (notas.trim()) body.notas = notas.trim();

    setGuardando(true);
    try {
      await api('/compras', { method: 'POST', body });
      onRegistrada(`Compra registrada: ticket ${body.numeroTicket} por ${moneda(total)}.`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  const usados = new Set(lineas.map((l) => l.productoId).filter(Boolean));

  return (
    <form className="cp__tarjeta cp__form entra" onSubmit={registrar}>
      <div className="cp__form-cab">
        <h2>Registrar compra</h2>
        <button type="button" className="cp__x" onClick={onCancelar} aria-label="Cancelar">
          <IconX size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="cp__grid">
        <label className="cp__campo">
          Proveedor
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required>
            <option value="">Elige un proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        {esDueno && (
          <label className="cp__campo">
            Sucursal que recibe
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="cp__campo">
          Forma de pago
          <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {FORMAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="cp__campo">
          Ticket o factura
          <input value={ticket} onChange={(e) => setTicket(e.target.value)} maxLength={50} required />
        </label>
        <label className="cp__campo">
          Fecha de la compra
          <input type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label className="cp__campo">
          Notas (opcional)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={255} />
        </label>
      </div>

      <h3 className="cp__sub">Productos</h3>
      <ul className="cp__lineas">
        {lineas.map((l, i) => {
          const p = porId.get(Number(l.productoId));
          const u = p ? UNIDAD[p.unidadMedida] : '';
          const sub = Number(l.cantidad) > 0 && Number(l.costo) >= 0 ? Number(l.cantidad) * Number(l.costo) : 0;
          return (
            <li key={l.clave} className="cp__linea">
              <label className="cp__campo cp__campo--prod">
                {i === 0 ? 'Producto' : <span className="cp__oculto">Producto</span>}
                <select value={l.productoId} onChange={(e) => elegirProducto(l.clave, e.target.value)}>
                  <option value="">Elige un producto</option>
                  {productos.map((x) => (
                    <option key={x.id} value={x.id} disabled={usados.has(String(x.id)) && String(x.id) !== l.productoId}>
                      {x.nombre} · {x.presentacion}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cp__campo">
                {i === 0 ? `Cantidad${u ? ` (${u})` : ''}` : <span className="cp__oculto">Cantidad</span>}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={l.cantidad}
                  onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                />
              </label>
              <label className="cp__campo">
                {i === 0 ? 'Costo unitario' : <span className="cp__oculto">Costo unitario</span>}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={l.costo}
                  onChange={(e) => cambiarLinea(l.clave, { costo: e.target.value })}
                />
              </label>
              <div className="cp__subtotal">
                {i === 0 && <span className="cp__etq">Subtotal</span>}
                <b>{moneda(sub)}</b>
              </div>
              <button
                type="button"
                className="cp__icono"
                onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : ls))}
                disabled={lineas.length === 1}
                aria-label={`Quitar línea ${i + 1}`}
                title="Quitar línea"
              >
                <IconTrash size={18} aria-hidden="true" />
              </button>
              {l.sugerido && (
                <p className="cp__sug">
                  {l.sugerido.deProveedor ? 'Último precio con este proveedor' : 'Último costo conocido'}:{' '}
                  {moneda(l.sugerido.precio)}
                  {l.sugerido.precio !== Number(l.costo) && l.costo !== '' && ' · tu costo es distinto'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="cp__link"
        onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
        disabled={lineas.length >= 50}
      >
        <IconPlus size={16} aria-hidden="true" /> Agregar producto
      </button>

      <div className="cp__total">
        <span>Total de la compra</span>
        <b>{moneda(total)}</b>
      </div>

      {error && (
        <p className="cp__error" role="alert">
          {error}
        </p>
      )}

      <div className="cp__pie">
        <button type="button" className="cp__btn cp__btn--sec" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="cp__btn" disabled={guardando}>
          {guardando ? 'Registrando…' : 'Registrar compra'}
        </button>
      </div>
    </form>
  );
}

export default function Compras() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';

  const [vista, setVista] = useState('lista'); // 'lista' | 'nueva'
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [filtros, setFiltros] = useState({ sucursalId: '', proveedorId: '', formaPago: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ datos: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  useEffect(() => {
    const pedidos = [api('/proveedores'), api('/productos')];
    if (esDueno) pedidos.push(api('/sucursales'));
    Promise.all(pedidos)
      .then(([prov, prod, suc]) => {
        setProveedores(prov);
        setProductos(prod);
        if (suc) setSucursales(suc);
      })
      .catch((e) => setError(e.message));
  }, [esDueno]);

  const rangoInvalido = filtros.desde && filtros.hasta && filtros.desde > filtros.hasta;

  const cargar = useCallback(async () => {
    if (rangoInvalido) return;
    setCargando(true);
    try {
      const q = new URLSearchParams({ pagina, limite: LIMITE });
      for (const [k, v] of Object.entries(filtros)) if (v) q.set(k, v);
      setDatos(await api(`/compras?${q}`));
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
  };

  const hayFiltros = Object.values(filtros).some(Boolean);
  const paginas = Math.max(1, Math.ceil(datos.total / LIMITE));

  function registrada(mensaje) {
    setVista('lista');
    setExito(mensaje);
    setPagina(1);
    cargar();
  }

  return (
    <div className="cp">
      <header className="cp__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Compras</h1>
          <p className="cp__subt">
            {esDueno ? 'Entradas de mercancía de todas las sucursales' : 'Entradas de mercancía de tu sucursal'}
          </p>
        </div>
        {vista === 'lista' && (
          <button
            type="button"
            className="cp__btn"
            onClick={() => {
              setExito('');
              setVista('nueva');
            }}
          >
            <IconPlus size={18} aria-hidden="true" /> Registrar compra
          </button>
        )}
      </header>

      {exito && (
        <p className="cp__exito" role="status">
          <IconCheck size={18} aria-hidden="true" /> {exito}
        </p>
      )}

      {vista === 'nueva' ? (
        <FormularioCompra
          esDueno={esDueno}
          sucursales={sucursales}
          proveedores={proveedores.filter((p) => p.activo)}
          productos={productos.filter((p) => p.activo)}
          onCancelar={() => setVista('lista')}
          onRegistrada={registrada}
        />
      ) : (
        <section className="cp__tarjeta entra" style={{ '--i': 1 }}>
          <div className="cp__filtros">
            {esDueno && (
              <label className="cp__campo">
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
            <label className="cp__campo">
              Proveedor
              <select value={filtros.proveedorId} onChange={cambiarFiltro('proveedorId')}>
                <option value="">Todos</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="cp__campo">
              Forma de pago
              <select value={filtros.formaPago} onChange={cambiarFiltro('formaPago')}>
                <option value="">Todas</option>
                {FORMAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.texto}
                  </option>
                ))}
              </select>
            </label>
            <label className="cp__campo">
              Desde
              <input type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} />
            </label>
            <label className="cp__campo">
              Hasta
              <input type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} />
            </label>
          </div>
          {hayFiltros && (
            <button
              type="button"
              className="cp__link"
              onClick={() => {
                setFiltros({ sucursalId: '', proveedorId: '', formaPago: '', desde: '', hasta: '' });
                setPagina(1);
              }}
            >
              <IconX size={16} aria-hidden="true" /> Limpiar filtros
            </button>
          )}

          {rangoInvalido && (
            <p className="cp__error" role="alert">
              <IconAlertTriangle size={16} aria-hidden="true" /> La fecha "desde" no puede ser posterior a "hasta".
            </p>
          )}
          {error && (
            <p className="cp__error" role="alert">
              {error}
            </p>
          )}

          {cargando && datos.datos.length === 0 ? (
            <p className="cp__vacio">Cargando…</p>
          ) : datos.datos.length === 0 ? (
            <p className="cp__vacio">
              {hayFiltros ? 'No hay compras con esos filtros.' : 'Todavía no hay compras registradas.'}
            </p>
          ) : (
            <>
              <p className="cp__conteo">
                {numero(datos.total)} {datos.total === 1 ? 'compra' : 'compras'}
              </p>
              <div className={`cp__scroll${cargando ? ' cp__scroll--carga' : ''}`}>
                <table className="cp__tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Ticket</th>
                      <th>Proveedor</th>
                      <th>Sucursal</th>
                      <th>Pago</th>
                      <th>Registró</th>
                      <th className="der">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.datos.map((c) => (
                      <tr key={c.id}>
                        <td>{fechaCorta(c.fecha)}</td>
                        <td>{c.numeroTicket}</td>
                        <td>{c.proveedor}</td>
                        <td>{c.sucursal}</td>
                        <td>{TEXTO_FORMA[c.formaPago] ?? c.formaPago}</td>
                        <td>{c.usuario}</td>
                        <td className="der">{moneda(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paginas > 1 && (
                <nav className="cp__pag" aria-label="Paginación">
                  <button type="button" className="cp__btn cp__btn--sec" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                    Anterior
                  </button>
                  <span>
                    Página {pagina} de {paginas}
                  </span>
                  <button type="button" className="cp__btn cp__btn--sec" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
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