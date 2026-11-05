import { useEffect, useMemo, useState } from 'react';
import { IconPencil, IconPhone, IconPlus, IconSearch, IconUser, IconX } from '@tabler/icons-react';
import { api } from '../api/client';
import './css/Proveedores.css';

function ModalProveedor({ proveedor, onCerrar, onGuardado }) {
  const nuevo = !proveedor;
  const [form, setForm] = useState({
    nombre: proveedor?.nombre ?? '',
    telefono: proveedor?.telefono ?? '',
    contacto: proveedor?.contacto ?? '',
    notas: proveedor?.notas ?? '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    // Los campos opcionales vacíos se guardan como "sin dato", no como texto vacío
    const body = {
      nombre: form.nombre,
      telefono: form.telefono.trim() || null,
      contacto: form.contacto.trim() || null,
      notas: form.notas.trim() || null,
    };
    try {
      const r = nuevo
        ? await api('/proveedores', { method: 'POST', body })
        : await api(`/proveedores/${proveedor.id}`, { method: 'PUT', body });
      onGuardado(r, nuevo);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <div className="pv__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="pv__modal" role="dialog" aria-modal="true" aria-labelledby="pv-titulo" onSubmit={guardar}>
        <header className="pv__modal-cab">
          <h2 id="pv-titulo">{nuevo ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
          <button type="button" className="pv__x" onClick={onCerrar} aria-label="Cerrar">
            <IconX size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="pv__grid">
          <label className="pv__campo pv__campo--ancho">
            Nombre
            <input value={form.nombre} onChange={cambiar('nombre')} maxLength={120} required autoFocus />
          </label>
          <label className="pv__campo">
            Teléfono
            <input type="tel" value={form.telefono} onChange={cambiar('telefono')} maxLength={30} />
          </label>
          <label className="pv__campo">
            Persona de contacto
            <input value={form.contacto} onChange={cambiar('contacto')} maxLength={100} />
          </label>
          <label className="pv__campo pv__campo--ancho">
            Notas (días de entrega, condiciones, etc.)
            <input value={form.notas} onChange={cambiar('notas')} maxLength={255} />
          </label>
        </div>

        {error && (
          <p className="pv__error" role="alert">
            {error}
          </p>
        )}

        <footer className="pv__modal-pie">
          <button type="button" className="pv__btn pv__btn--sec" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="pv__btn" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Proveedores() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [buscar, setBuscar] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [modal, setModal] = useState(null); // null | 'nuevo' | proveedor

  useEffect(() => {
    api('/proveedores?activo=todos')
      .then(setLista)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return lista.filter(
      (p) =>
        (verInactivos || p.activo) &&
        (!q || `${p.nombre} ${p.contacto ?? ''} ${p.telefono ?? ''}`.toLowerCase().includes(q))
    );
  }, [lista, buscar, verInactivos]);
  const hayInactivos = lista.some((p) => !p.activo);

  async function alternar(p) {
    setError('');
    setExito('');
    try {
      await api(`/proveedores/${p.id}/estado`, { method: 'PATCH', body: { activo: !p.activo } });
      setLista((l) => l.map((x) => (x.id === p.id ? { ...x, activo: !p.activo } : x)));
      setExito(
        p.activo
          ? `${p.nombre} ya no aparece al registrar compras. Sus compras anteriores se conservan.`
          : `${p.nombre} vuelve a estar disponible.`
      );
    } catch (e) {
      setError(e.message);
    }
  }

  function alGuardar(guardado, eraNuevo) {
    setLista((l) =>
      (eraNuevo ? [...l, guardado] : l.map((x) => (x.id === guardado.id ? guardado : x))).sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      )
    );
    setExito(eraNuevo ? `${guardado.nombre} agregado.` : `Datos de ${guardado.nombre} actualizados.`);
    setModal(null);
  }

  return (
    <div className="pv">
      <header className="pv__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Proveedores</h1>
          <p className="pv__sub">A quién le compras y cómo contactarlo</p>
        </div>
        <button type="button" className="pv__btn" onClick={() => setModal('nuevo')}>
          <IconPlus size={18} aria-hidden="true" /> Nuevo proveedor
        </button>
      </header>

      {exito && (
        <p className="pv__exito" role="status">
          {exito}
        </p>
      )}

      <section className="pv__tarjeta entra" style={{ '--i': 1 }}>
        <div className="pv__filtros">
          <label className="pv__buscar">
            <IconSearch size={18} aria-hidden="true" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar proveedor"
              aria-label="Buscar proveedor"
            />
          </label>
          {hayInactivos && (
            <label className="pv__check">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Mostrar desactivados
            </label>
          )}
        </div>

        {error && (
          <p className="pv__error" role="alert">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="pv__vacio">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="pv__vacio">
            {lista.length === 0 ? 'Todavía no hay proveedores. Agrega el primero.' : 'No hay proveedores que coincidan.'}
          </p>
        ) : (
          <ul className="pv__lista">
            {visibles.map((p) => (
              <li key={p.id} className={`pv__item${p.activo ? '' : ' pv__item--off'}`}>
                <div className="pv__datos">
                  <b>
                    {p.nombre}
                    {!p.activo && <em> · Desactivado</em>}
                  </b>
                  <span className="pv__meta">
                    {p.contacto && (
                      <span>
                        <IconUser size={14} aria-hidden="true" /> {p.contacto}
                      </span>
                    )}
                    {p.telefono && (
                      <span>
                        <IconPhone size={14} aria-hidden="true" /> {p.telefono}
                      </span>
                    )}
                  </span>
                  {p.notas && <small>{p.notas}</small>}
                </div>
                <div className="pv__acciones">
                  <button type="button" className="pv__icono" onClick={() => setModal(p)} aria-label={`Editar ${p.nombre}`} title="Editar">
                    <IconPencil size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="pv__link" onClick={() => alternar(p)}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal && (
        <ModalProveedor
          key={modal === 'nuevo' ? 'nuevo' : modal.id}
          proveedor={modal === 'nuevo' ? null : modal}
          onCerrar={() => setModal(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}