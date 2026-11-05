import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BotonFoto, FotoProducto } from '../components/FotoProducto';
import { moneda, numero, UNIDAD } from '../utils/formato';
import './Inventario.css';

const UNIDADES = [
  { valor: 'litro', texto: 'Litro (L)' },
  { valor: 'mililitro', texto: 'Mililitro (ml)' },
  { valor: 'galon', texto: 'Galón (gal)' },
  { valor: 'pieza', texto: 'Pieza (pz)' },
];
const CATEGORIAS_BASE = ['Lavado', 'Detallado', 'Limpieza', 'Accesorios'];

// Unifica la respuesta de /stock: el dueño recibe totales con desglose y el encargado una lista plana
function normalizarStock(filas) {
  const mapa = new Map();
  for (const f of filas) {
    if (f.sucursales) {
      mapa.set(f.productoId, { total: f.total, sucursales: f.sucursales });
    } else {
      const previo = mapa.get(f.productoId) || { total: 0, sucursales: [] };
      previo.total += f.stock;
      previo.sucursales.push({
        sucursalId: f.sucursalId,
        sucursal: f.sucursal,
        stock: f.stock,
        stockMinimo: f.stockMinimo,
        estado: f.estado,
      });
      mapa.set(f.productoId, previo);
    }
  }
  return mapa;
}

function Estado({ estado, stock }) {
  if (stock <= 0) {
    return (
      <span className="inv__est inv__est--ag">
        <IconAlertTriangle size={13} aria-hidden="true" /> Agotado
      </span>
    );
  }
  if (estado === 'bajo') {
    return (
      <span className="inv__est inv__est--lo">
        <IconAlertTriangle size={13} aria-hidden="true" /> Bajo
      </span>
    );
  }
  return (
    <span className="inv__est inv__est--ok">
      <IconCheck size={13} aria-hidden="true" /> Bien
    </span>
  );
}

function ModalProducto({ producto, categorias, onCerrar, onGuardado, onFotoCambio }) {
  const nuevo = !producto;
  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    categoria: producto?.categoria ?? categorias[0] ?? '',
    presentacion: producto?.presentacion ?? '',
    unidadMedida: producto?.unidadMedida ?? 'litro',
    ultimoCosto: producto?.ultimoCosto ?? 0,
  });
  const [minimos, setMinimos] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [imagenV, setImagenV] = useState(producto?.imagenVersion ?? null);

  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  useEffect(() => {
    if (nuevo) return;
    api(`/productos/${producto.id}/stock-minimo`)
      .then((r) => setMinimos(r.map((m) => ({ ...m, valor: String(m.stockMinimo) }))))
      .catch((e) => setError(e.message));
  }, [nuevo, producto]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setAviso('');
    const costo = Number(form.ultimoCosto);
    if (!Number.isFinite(costo) || costo < 0) {
      setError('El costo debe ser un número igual o mayor a cero.');
      return;
    }
    for (const m of minimos) {
      const v = Number(m.valor);
      if (m.valor.trim() === '' || !Number.isFinite(v) || v < 0) {
        setError(`El stock mínimo de ${m.sucursal} debe ser un número igual o mayor a cero.`);
        return;
      }
    }
    setGuardando(true);
    try {
      const body = { ...form, ultimoCosto: costo };
      const guardado = nuevo
        ? await api('/productos', { method: 'POST', body })
        : await api(`/productos/${producto.id}`, { method: 'PUT', body });

      for (const m of minimos) {
        if (Number(m.valor) !== m.stockMinimo) {
          await api(`/productos/${producto.id}/stock-minimo/${m.sucursalId}`, {
            method: 'PUT',
            body: { stockMinimo: Number(m.valor) },
          });
        }
      }
      onGuardado({ ...guardado, imagenVersion: imagenV }, nuevo);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function quitarFoto() {
    setError('');
    try {
      await api(`/productos/${producto.id}/imagen`, { method: 'DELETE' });
      setImagenV(null);
      onFotoCambio(producto.id, null);
    } catch (err) {
      setError(err.message);
    }
  }

  const vista = { productoId: producto?.id, imagenV, categoria: form.categoria, nombre: form.nombre };

  return (
    <div className="inv__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="inv__modal" role="dialog" aria-modal="true" aria-labelledby="inv-titulo" onSubmit={guardar}>
        <header className="inv__modal-cab">
          <h2 id="inv-titulo">{nuevo ? 'Nuevo producto' : 'Editar producto'}</h2>
          <button type="button" className="inv__x" onClick={onCerrar} aria-label="Cerrar">
            <IconX size={20} aria-hidden="true" />
          </button>
        </header>

        {!nuevo && (
          <div className="inv__foto-fila">
            <div className="inv__fotowrap">
              <FotoProducto producto={vista} tamano={72} />
              <BotonFoto
                producto={vista}
                onCambio={(_, v) => {
                  setImagenV(v);
                  onFotoCambio(producto.id, v);
                }}
                onError={setError}
              />
            </div>
            <div>
              <p className="inv__foto-txt">Foto del producto</p>
              {imagenV ? (
                <button type="button" className="inv__link" onClick={quitarFoto}>
                  <IconTrash size={15} aria-hidden="true" /> Quitar foto
                </button>
              ) : (
                <p className="inv__ayuda">Sin foto: se muestra el ícono de la categoría.</p>
              )}
            </div>
          </div>
        )}

        <div className="inv__grid">
          <label className="inv__campo inv__campo--ancho">
            Nombre
            <input value={form.nombre} onChange={cambiar('nombre')} maxLength={120} required />
          </label>
          <label className="inv__campo">
            Categoría
            <input list="inv-categorias" value={form.categoria} onChange={cambiar('categoria')} maxLength={50} required />
            <datalist id="inv-categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="inv__campo">
            Presentación
            <input value={form.presentacion} onChange={cambiar('presentacion')} maxLength={80} placeholder="Garrafa 20 L" required />
          </label>
          <label className="inv__campo">
            Unidad de medida
            <select value={form.unidadMedida} onChange={cambiar('unidadMedida')}>
              {UNIDADES.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.texto}
                </option>
              ))}
            </select>
          </label>
          <label className="inv__campo">
            Último costo (MXN)
            <input type="number" min="0" step="0.01" value={form.ultimoCosto} onChange={cambiar('ultimoCosto')} />
          </label>
        </div>

        {!nuevo && minimos.length > 0 && (
          <fieldset className="inv__minimos">
            <legend>Stock mínimo (avisa cuando baje de aquí)</legend>
            <div className="inv__grid">
              {minimos.map((m) => (
                <label className="inv__campo" key={m.sucursalId}>
                  {m.sucursal}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={m.valor}
                    onChange={(e) =>
                      setMinimos((lista) =>
                        lista.map((x) => (x.sucursalId === m.sucursalId ? { ...x, valor: e.target.value } : x))
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {nuevo && <p className="inv__ayuda">Al guardar podrás agregar la foto y fijar los mínimos por sucursal.</p>}
        {aviso && <p className="inv__ayuda">{aviso}</p>}
        {error && (
          <p className="inv__error" role="alert">
            {error}
          </p>
        )}

        <footer className="inv__modal-pie">
          <button type="button" className="inv__btn inv__btn--sec" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="inv__btn" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Inventario() {
  const { usuario } = useAuth();
  const esDueno = usuario.rol === 'dueno';
  const [productos, setProductos] = useState([]);
  const [stock, setStock] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [modal, setModal] = useState(null); // null | 'nuevo' | producto

  const cargar = useCallback(async () => {
    try {
      const [prods, filas] = await Promise.all([api('/productos?activo=todos'), api('/stock')]);
      setProductos(prods);
      setStock(normalizarStock(filas));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categorias = useMemo(
    () => [...new Set([...CATEGORIAS_BASE, ...productos.map((p) => p.categoria)])].sort(),
    [productos]
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (verInactivos || p.activo) &&
        (!categoria || p.categoria === categoria) &&
        (!q || `${p.nombre} ${p.presentacion}`.toLowerCase().includes(q))
    );
  }, [productos, buscar, categoria, verInactivos]);

  const hayInactivos = productos.some((p) => !p.activo);

  async function alternarActivo(p) {
    setError('');
    try {
      await api(`/productos/${p.id}/estado`, { method: 'PATCH', body: { activo: !p.activo } });
      setProductos((lista) => lista.map((x) => (x.id === p.id ? { ...x, activo: !p.activo } : x)));
    } catch (e) {
      setError(e.message);
    }
  }

  function alGuardar(guardado, eraNuevo) {
    setProductos((lista) =>
      eraNuevo
        ? [...lista, guardado].sort((a, b) => a.nombre.localeCompare(b.nombre))
        : lista.map((x) => (x.id === guardado.id ? { ...x, ...guardado } : x))
    );
    cargar();
    // Un producto recién creado se reabre para poder ponerle foto y mínimos
    setModal(eraNuevo ? guardado : null);
  }

  function alCambiarFoto(id, imagenVersion) {
    setProductos((lista) => lista.map((x) => (x.id === id ? { ...x, imagenVersion } : x)));
  }

  return (
    <div className="inv">
      <header className="inv__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Inventario</h1>
          <p className="inv__sub">
            {esDueno ? 'Catálogo y existencias de todas las sucursales' : 'Existencias de tu sucursal'}
          </p>
        </div>
        {esDueno && (
          <button type="button" className="inv__btn" onClick={() => setModal('nuevo')}>
            <IconPlus size={18} aria-hidden="true" /> Nuevo producto
          </button>
        )}
      </header>

      <section className="inv__tarjeta entra" style={{ '--i': 1 }}>
        <div className="inv__filtros">
          <label className="inv__buscar">
            <IconSearch size={18} aria-hidden="true" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
            />
          </label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {hayInactivos && (
            <label className="inv__check">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Mostrar desactivados
            </label>
          )}
        </div>

        {error && (
          <p className="inv__error" role="alert">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="inv__vacio">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="inv__vacio">No hay productos que coincidan con la búsqueda.</p>
        ) : (
          <div className="inv__scroll">
            <table className="inv__tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="der">Existencias</th>
                  <th>Por sucursal</th>
                  {esDueno && <th className="der">Costo</th>}
                  {esDueno && <th className="der">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const s = stock.get(p.id);
                  const u = UNIDAD[p.unidadMedida];
                  return (
                    <tr key={p.id} className={p.activo ? '' : 'inv__fila--off'}>
                      <td>
                        <div className="inv__prod">
                          <FotoProducto
                            producto={{ productoId: p.id, imagenV: p.imagenVersion, categoria: p.categoria }}
                            tamano={44}
                          />
                          <span>
                            <b>{p.nombre}</b>
                            <small>
                              {p.presentacion}
                              {!p.activo && ' · Desactivado'}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{p.categoria}</td>
                      <td className="der">{s ? `${numero(s.total)} ${u}` : '—'}</td>
                      <td>
                        {s ? (
                          <ul className="inv__suc">
                            {s.sucursales.map((x) => (
                              <li key={x.sucursalId}>
                                <span className="inv__suc-nombre">{x.sucursal}</span>
                                <span className="inv__suc-num">
                                  {numero(x.stock)} {u}
                                </span>
                                <Estado estado={x.estado} stock={x.stock} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="inv__mu">Sin existencias registradas</span>
                        )}
                      </td>
                      {esDueno && <td className="der">{moneda(p.ultimoCosto)}</td>}
                      {esDueno && (
                        <td className="der">
                          <div className="inv__acciones">
                            <button type="button" className="inv__icono" onClick={() => setModal(p)} aria-label={`Editar ${p.nombre}`} title="Editar">
                              <IconPencil size={18} aria-hidden="true" />
                            </button>
                            <button type="button" className="inv__link" onClick={() => alternarActivo(p)}>
                              {p.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <ModalProducto
          key={modal === 'nuevo' ? 'nuevo' : modal.id}
          producto={modal === 'nuevo' ? null : modal}
          categorias={categorias}
          onCerrar={() => setModal(null)}
          onGuardado={alGuardar}
          onFotoCambio={alCambiarFoto}
        />
      )}
    </div>
  );
}