import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconFilterOff } from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { moneda, numero, UNIDAD } from '../utils/formato';
import './Historial.css';

const LIMITE = 25;

const TIPOS = {
  entrada: { texto: 'Entrada', clase: 'ent' },
  consumo: { texto: 'Consumo', clase: 'con' },
  merma: { texto: 'Merma', clase: 'mer' },
  transferencia_salida: { texto: 'Envío', clase: 'tra' },
  transferencia_entrada: { texto: 'Recepción', clase: 'tra' },
  ajuste: { texto: 'Ajuste', clase: 'aju' },
};

const VACIOS = { sucursalId: '', tipo: '', productoId: '', usuarioId: '', desde: '', hasta: '' };

const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const haceDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return fechaLocal(d);
};
const corto = (nombre) => nombre.replace(/^McFly\s+/i, '');
const cuando = (fecha) =>
  new Date(fecha)
    .toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .replace('.', '');

function detalle(m) {
  if (m.motivo) return m.motivo;
  if (m.transferenciaId) return `Transferencia n.º ${m.transferenciaId}`;
  if (m.compraDetalleId) return 'Compra';
  return '';
}

function Campo({ id, etiqueta, children }) {
  return (
    <div className="hs__campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
    </div>
  );
}

export default function Historial() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';

  const [sucursales, setSucursales] = useState([]);
  const [opciones, setOpciones] = useState({ productos: [], usuarios: [] });
  const [filtros, setFiltros] = useState(VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/movimientos/filtros')
      .then(setOpciones)
      .catch(() => {});
    if (esDueno) {
      api('/sucursales')
        .then(setSucursales)
        .catch(() => {});
    }
  }, [esDueno]);

  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);

  useEffect(() => {
    if (rangoInvalido) return;
    let vigente = true;
    const q = new URLSearchParams({ pagina, limite: LIMITE });
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) q.set(clave, valor);
    }
    setCargando(true);
    api(`/movimientos?${q}`)
      .then((d) => {
        if (vigente) {
          setDatos(d);
          setError('');
        }
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, pagina, rangoInvalido]);

  function cambiar(campo, valor) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }
  function periodo(desde, hasta) {
    setFiltros((f) => ({ ...f, desde, hasta }));
    setPagina(1);
  }
  function limpiar() {
    setFiltros(VACIOS);
    setPagina(1);
  }

  const hoy = fechaLocal(new Date());
  const rapidos = [
    { texto: 'Hoy', desde: hoy, hasta: hoy },
    { texto: '7 días', desde: haceDias(6), hasta: hoy },
    { texto: '30 días', desde: haceDias(29), hasta: hoy },
  ];
  const hayFiltros = Object.values(filtros).some(Boolean);

  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / LIMITE));
  const desdeFila = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const hastaFila = Math.min(pagina * LIMITE, total);

  return (
    <div className="hs">
      <header className="hs__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Movimientos</h1>
          <p className="hs__sub">Quién hizo cada movimiento, cuándo y de qué producto.</p>
        </div>
        {esDueno && sucursales.length > 1 && (
          <div className="hs__seg" role="group" aria-label="Sucursal">
            {[{ id: '', nombre: 'Todas' }, ...sucursales].map((s) => {
              const activo = filtros.sucursalId === String(s.id);
              return (
                <button
                  key={s.id || 'todas'}
                  type="button"
                  aria-pressed={activo}
                  className={activo ? 'on' : ''}
                  onClick={() => cambiar('sucursalId', String(s.id))}
                >
                  {s.id ? corto(s.nombre) : s.nombre}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <section className="hs__card entra" style={{ '--i': 1 }} aria-label="Filtros">
        <div className="hs__filtros">
          <Campo id="f-tipo" etiqueta="Tipo">
            <select id="f-tipo" value={filtros.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([valor, t]) => (
                <option key={valor} value={valor}>
                  {t.texto}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="f-producto" etiqueta="Producto">
            <select
              id="f-producto"
              value={filtros.productoId}
              onChange={(e) => cambiar('productoId', e.target.value)}
            >
              <option value="">Todos</option>
              {opciones.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.presentacion}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="f-usuario" etiqueta="Usuario">
            <select
              id="f-usuario"
              value={filtros.usuarioId}
              onChange={(e) => cambiar('usuarioId', e.target.value)}
            >
              <option value="">Todos</option>
              {opciones.usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="f-desde" etiqueta="Desde">
            <input
              id="f-desde"
              type="date"
              value={filtros.desde}
              max={filtros.hasta || undefined}
              onChange={(e) => cambiar('desde', e.target.value)}
            />
          </Campo>
          <Campo id="f-hasta" etiqueta="Hasta">
            <input
              id="f-hasta"
              type="date"
              value={filtros.hasta}
              min={filtros.desde || undefined}
              onChange={(e) => cambiar('hasta', e.target.value)}
            />
          </Campo>
        </div>

        <div className="hs__rapidos">
          <span>Periodo</span>
          {rapidos.map((r) => {
            const activo = filtros.desde === r.desde && filtros.hasta === r.hasta;
            return (
              <button
                key={r.texto}
                type="button"
                aria-pressed={activo}
                className={activo ? 'on' : ''}
                onClick={() => periodo(r.desde, r.hasta)}
              >
                {r.texto}
              </button>
            );
          })}
          {hayFiltros && (
            <button type="button" className="hs__limpiar" onClick={limpiar}>
              <IconFilterOff size={16} aria-hidden="true" />
              Limpiar filtros
            </button>
          )}
        </div>

        {rangoInvalido && (
          <p className="hs__error" role="alert">
            La fecha inicial es posterior a la final.
          </p>
        )}
      </section>

      {error && (
        <p className="hs__error" role="alert">
          {error}
        </p>
      )}

      <section className="hs__card entra" style={{ '--i': 2 }} aria-busy={cargando}>
        {!datos ? (
          <p className="hs__vacio">{cargando ? 'Cargando movimientos…' : 'No se pudo cargar el historial.'}</p>
        ) : datos.datos.length === 0 ? (
          <div className="hs__vacio">
            <p>No hay movimientos con estos filtros.</p>
            {hayFiltros && (
              <button type="button" className="hs__limpiar" onClick={limpiar}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="hs__total" aria-live="polite">
              {desdeFila}–{hastaFila} de {numero(total)} movimientos
            </p>
            <div className={`hs__scroll${cargando ? ' hs__scroll--carga' : ''}`}>
              <table className="hs__tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th className="der">Cantidad</th>
                    <th className="der">Valor</th>
                    <th>Usuario</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.datos.map((m) => {
                    const c = Number(m.cantidad);
                    const tipo = TIPOS[m.tipo];
                    return (
                      <tr key={m.id}>
                        <td className="nowrap">{cuando(m.fecha)}</td>
                        <td>
                          <span className={`hs__tipo hs__tipo--${tipo.clase}`}>{tipo.texto}</span>
                        </td>
                        <td>
                          {m.producto}
                          <small>{m.presentacion}</small>
                        </td>
                        <td className={`der nowrap${c > 0 ? ' pos' : ''}`}>
                          {c > 0 ? '+' : '−'}
                          {numero(Math.abs(c))} {UNIDAD[m.unidadMedida]}
                        </td>
                        <td className="der nowrap">{moneda(Math.abs(c) * Number(m.costoUnitario ?? 0))}</td>
                        <td>
                          {m.usuario}
                          <small>{corto(m.sucursal)}</small>
                        </td>
                        <td className="hs__detalle">{detalle(m)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {paginas > 1 && (
              <nav className="hs__pags" aria-label="Paginación">
                <button
                  type="button"
                  onClick={() => setPagina((p) => p - 1)}
                  disabled={pagina <= 1 || cargando}
                  aria-label="Página anterior"
                >
                  <IconChevronLeft size={18} aria-hidden="true" />
                  Anterior
                </button>
                <span>
                  Página {pagina} de {paginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={pagina >= paginas || cargando}
                  aria-label="Página siguiente"
                >
                  Siguiente
                  <IconChevronRight size={18} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}