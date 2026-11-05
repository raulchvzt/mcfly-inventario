import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconMinus,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BotonFoto, FotoProducto } from '../components/FotoProducto';
import { horaMovimiento, numero, UNIDAD } from '../utils/formato';
import './css/Consumo.css';

// Cuánto suben o bajan los botones + y − según la unidad del producto
const PASO = { litro: 1, galon: 1, pieza: 1, mililitro: 100 };

const corto = (nombre) => nombre.replace(/^McFly\s+/i, '');
const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const redondear = (n) => Math.round(n * 100) / 100;
const aNumero = (txt) => {
  const n = Number(String(txt).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function Estado({ estado }) {
  if (estado === 'agotado') {
    return (
      <span className="cn__badge cn__badge--ag">
        <IconCircleX size={14} aria-hidden="true" />
        Sin existencias
      </span>
    );
  }
  if (estado === 'bajo') {
    return (
      <span className="cn__badge cn__badge--lo">
        <IconAlertTriangle size={14} aria-hidden="true" />
        Quedan pocas
      </span>
    );
  }
  return null;
}

export default function Consumo() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';

  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState(esDueno ? null : usuario.sucursalId);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const [cantidad, setCantidad] = useState('1');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [registrados, setRegistrados] = useState([]);
  const accionRef = useRef(null);

  // Sucursales (el dueño elige en cuál registra; los demás usan la suya)
  useEffect(() => {
    api('/sucursales')
      .then((lista) => {
        setSucursales(lista);
        if (esDueno) setSucursalId((actual) => actual ?? lista[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [esDueno]);

  // Stock de la sucursal elegida
  useEffect(() => {
    if (sucursalId == null) return;
    let vigente = true;
    api(`/stock?sucursalId=${sucursalId}`)
      .then((d) => {
        if (vigente) {
          setItems(d);
          setError('');
        }
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      });
    return () => {
      vigente = false;
    };
  }, [sucursalId]);

  const refrescar = useCallback(
    () =>
      api(`/stock?sucursalId=${sucursalId}`)
        .then(setItems)
        .catch(() => {}),
    [sucursalId]
  );

  const lista = useMemo(() => {
    if (!items) return [];
    const q = sinAcentos(busqueda.trim());
    if (!q) return items;
    return items.filter((i) => sinAcentos(`${i.nombre} ${i.presentacion} ${i.categoria}`).includes(q));
  }, [items, busqueda]);

  if (!esDueno && usuario.sucursalId == null) {
    return (
      <div className="cn">
        <p className="cn__error" role="alert">
          Tu usuario no tiene una sucursal asignada. Avísale al dueño.
        </p>
      </div>
    );
  }

  const producto = items?.find((i) => i.productoId === elegido) || null;
  const unidad = producto ? UNIDAD[producto.unidadMedida] : '';
  const paso = producto ? PASO[producto.unidadMedida] || 1 : 1;
  const cant = aNumero(cantidad);
  const nombreSucursal = sucursales.find((s) => s.id === sucursalId)?.nombre;

  let problema = '';
  if (producto) {
    if (!(cant > 0)) problema = 'Escribe una cantidad mayor a 0.';
    else if (redondear(cant) !== cant) problema = 'Usa máximo 2 decimales.';
    else if (cant > producto.stock) {
      problema = `Solo hay ${numero(producto.stock)} ${unidad} disponibles.`;
    }
  }

  function cambiarFoto(productoId, imagenV) {
    setItems((prev) => prev.map((i) => (i.productoId === productoId ? { ...i, imagenV } : i)));
  }

  function elegir(item) {
    if (item.stock <= 0) return;
    setElegido(item.productoId);
    setCantidad('1');
    setAviso(null);
    requestAnimationFrame(() =>
      accionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  }

  function mover(delta) {
    const base = Number.isFinite(cant) ? cant : 0;
    setCantidad(String(Math.max(0, redondear(base + delta))));
  }

  function cambiarSucursal(id) {
    if (id === sucursalId) return;
    setSucursalId(id);
    setItems(null);
    setElegido(null);
    setAviso(null);
    setBusqueda('');
    setRegistrados([]);
  }

  async function registrar(e) {
    e.preventDefault();
    if (!producto || problema || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const body = { productoId: producto.productoId, cantidad: cant };
      if (esDueno) body.sucursalId = sucursalId;
      const r = await api('/movimientos/consumo', { method: 'POST', body });

      setAviso({
        tipo: 'ok',
        texto: `Registrado: ${numero(cant)} ${unidad} de ${producto.nombre}.`,
        detalle: `Quedan ${numero(r.stockActual)} ${unidad}.`,
        bajo: producto.stockMinimo > 0 && r.stockActual <= producto.stockMinimo,
      });
      setRegistrados((prev) =>
        [
          {
            id: r.movimiento.id,
            nombre: `${producto.nombre} ${producto.presentacion}`,
            cantidad: cant,
            unidad,
            hora: new Date(),
          },
          ...prev,
        ].slice(0, 5)
      );
      setElegido(null);
      setCantidad('1');
      await refrescar();
    } catch (err) {
      setAviso({
        tipo: 'error',
        texto: err.message,
        detalle:
          err.status === 409 && err.data?.disponible != null
            ? `Disponible: ${numero(err.data.disponible)} ${unidad}.`
            : '',
      });
      await refrescar();
    } finally {
      setEnviando(false);
    }
  }

  const etiquetaBoton =
    Number.isFinite(cant) && cant > 0 ? `Registrar ${numero(cant)} ${unidad}` : 'Registrar consumo';

  return (
    <div className="cn">
      <header className="cn__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Registrar consumo</h1>
          <p className="cn__sub">
            {nombreSucursal ? `${corto(nombreSucursal)} · ` : ''}Elige el producto y la cantidad que sacaste.
          </p>
        </div>
        {esDueno && sucursales.length > 1 && (
          <div className="cn__seg" role="group" aria-label="Sucursal">
            {sucursales.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={sucursalId === s.id}
                className={sucursalId === s.id ? 'on' : ''}
                onClick={() => cambiarSucursal(s.id)}
              >
                {corto(s.nombre)}
              </button>
            ))}
          </div>
        )}
      </header>

      {error && (
        <p className="cn__error" role="alert">
          {error}
        </p>
      )}

      <div className="cn__grid">
        <section className="cn__card entra" style={{ '--i': 1 }} aria-label="Productos">
          <label className="cn__buscar">
            <IconSearch size={20} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar producto"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar producto"
            />
          </label>

          {items === null ? (
            <p className="cn__vacio">Cargando productos…</p>
          ) : lista.length === 0 ? (
            <p className="cn__vacio">No se encontró ningún producto.</p>
          ) : (
            <ul className="cn__lista">
              {lista.map((i) => {
                const u = UNIDAD[i.unidadMedida];
                const seleccionado = i.productoId === elegido;
                const estado = i.stock <= 0 ? 'agotado' : i.estado;
                return (
                  <li key={i.productoId} className="cn__fila">
                    <button
                      type="button"
                      className={`cn__item${seleccionado ? ' on' : ''}`}
                      aria-pressed={seleccionado}
                      disabled={i.stock <= 0}
                      onClick={() => elegir(i)}
                    >
                      <FotoProducto producto={i} tamano={48} />
                      <span className="cn__item-nom">
                        <b>{i.nombre}</b>
                        <small>{i.presentacion}</small>
                      </span>
                      <span className="cn__item-stock">
                        <b>
                          {numero(i.stock)} {u}
                        </b>
                        <Estado estado={estado} />
                      </span>
                    </button>
                    {esDueno && <BotonFoto producto={i} onCambio={cambiarFoto} onError={setError} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="cn__card cn__accion entra"
          style={{ '--i': 2 }}
          ref={accionRef}
          aria-live="polite"
        >
          {aviso && (
            <div
              className={`cn__aviso cn__aviso--${aviso.tipo}`}
              role={aviso.tipo === 'error' ? 'alert' : 'status'}
            >
              {aviso.tipo === 'ok' ? (
                <IconCircleCheck size={22} aria-hidden="true" />
              ) : (
                <IconCircleX size={22} aria-hidden="true" />
              )}
              <div>
                <b>{aviso.texto}</b>
                {aviso.detalle && <span>{aviso.detalle}</span>}
                {aviso.bajo && <span>Ya está por debajo del mínimo: avisa a tu encargado.</span>}
              </div>
            </div>
          )}

          {producto ? (
            <form className="cn__form" onSubmit={registrar}>
              <p className="cn__etq">Producto elegido</p>
              <div className="cn__elegido">
                <FotoProducto producto={producto} tamano={72} />
                <div>
                  <h2>{producto.nombre}</h2>
                  <p className="cn__mu">
                    {producto.presentacion} · Disponible:{' '}
                    <b>
                      {numero(producto.stock)} {unidad}
                    </b>
                  </p>
                </div>
              </div>

              <label htmlFor="cantidad" className="cn__etq">
                Cantidad ({unidad})
              </label>
              <div className="cn__cant">
                <button
                  type="button"
                  className="cn__paso"
                  onClick={() => mover(-paso)}
                  aria-label="Quitar cantidad"
                >
                  <IconMinus size={26} aria-hidden="true" />
                </button>
                <input
                  id="cantidad"
                  inputMode="decimal"
                  autoComplete="off"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
                <button
                  type="button"
                  className="cn__paso"
                  onClick={() => mover(paso)}
                  aria-label="Agregar cantidad"
                >
                  <IconPlus size={26} aria-hidden="true" />
                </button>
              </div>

              {problema && (
                <p className="cn__error" role="alert">
                  {problema}
                </p>
              )}

              <button className="cn__btn" type="submit" disabled={Boolean(problema) || enviando}>
                {enviando ? 'Registrando…' : etiquetaBoton}
              </button>
              <button type="button" className="cn__cancelar" onClick={() => setElegido(null)}>
                Cancelar
              </button>
              <p className="cn__nota">
                Si te equivocas, avísale a tu encargado: los registros no se borran, se corrigen con un
                ajuste.
              </p>
            </form>
          ) : (
            !aviso && <p className="cn__vacio">Elige un producto de la lista para empezar.</p>
          )}

          {!producto && aviso?.tipo === 'ok' && (
            <button type="button" className="cn__btn cn__btn--sec" onClick={() => setAviso(null)}>
              Registrar otro
            </button>
          )}
        </section>
      </div>

      {registrados.length > 0 && (
        <section className="cn__card entra" style={{ '--i': 3 }} aria-label="Registrado en esta sesión">
          <h2 className="cn__tit">Registrado en esta sesión</h2>
          <ul className="cn__reg">
            {registrados.map((r) => (
              <li key={r.id}>
                <span>{r.nombre}</span>
                <span className="cn__reg-cant">
                  −{numero(r.cantidad)} {r.unidad}
                </span>
                <span className="cn__mu">{horaMovimiento(r.hora)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}