import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconKey, IconPencil, IconPlus, IconRefresh, IconX } from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './css/Usuarios.css';

const ROLES = [
  { valor: 'encargado', texto: 'Encargado' },
  { valor: 'empleado', texto: 'Empleado' },
];
const TEXTO_ROL = { dueno: 'Dueño', encargado: 'Encargado', empleado: 'Empleado' };

const fechaCorta = (f) =>
  new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

// Contraseña legible de 10 caracteres, sin símbolos que se confundan (0/O, 1/l)
function generarPassword() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

function ModalUsuario({ modo, usuario, sucursales, onCerrar, onListo }) {
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    rol: usuario?.rol ?? 'empleado',
    sucursalId: usuario?.sucursalId ?? sucursales[0]?.id ?? '',
    password: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const titulo =
    modo === 'crear' ? 'Nuevo usuario' : modo === 'editar' ? 'Editar usuario' : `Nueva contraseña para ${usuario.nombre}`;

  async function enviar(e) {
    e.preventDefault();
    setError('');

    if (modo !== 'editar' && (form.password.length < 8 || form.password.length > 72)) {
      return setError('La contraseña debe tener entre 8 y 72 caracteres.');
    }

    setGuardando(true);
    try {
      if (modo === 'password') {
        await api(`/usuarios/${usuario.id}/password`, { method: 'PATCH', body: { password: form.password } });
        onListo(`Contraseña de ${usuario.nombre} actualizada.`, null);
      } else {
        const base = {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
          sucursalId: Number(form.sucursalId),
        };
        if (modo === 'crear') {
          const nuevo = await api('/usuarios', { method: 'POST', body: { ...base, password: form.password } });
          onListo(`Usuario ${nuevo.nombre} creado.`, nuevo);
        } else {
          const editado = await api(`/usuarios/${usuario.id}`, { method: 'PUT', body: base });
          onListo(`Datos de ${editado.nombre} actualizados.`, editado);
        }
      }
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <div className="us__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="us__modal" role="dialog" aria-modal="true" aria-labelledby="us-titulo" onSubmit={enviar}>
        <header className="us__modal-cab">
          <h2 id="us-titulo">{titulo}</h2>
          <button type="button" className="us__x" onClick={onCerrar} aria-label="Cerrar">
            <IconX size={20} aria-hidden="true" />
          </button>
        </header>

        {modo !== 'password' && (
          <div className="us__grid">
            <label className="us__campo us__campo--ancho">
              Nombre
              <input value={form.nombre} onChange={cambiar('nombre')} maxLength={100} required autoFocus />
            </label>
            <label className="us__campo us__campo--ancho">
              Correo (con el que inicia sesión)
              <input type="email" value={form.email} onChange={cambiar('email')} maxLength={150} required />
            </label>
            <label className="us__campo">
              Rol
              <select value={form.rol} onChange={cambiar('rol')}>
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.texto}
                  </option>
                ))}
              </select>
            </label>
            <label className="us__campo">
              Sucursal
              <select value={form.sucursalId} onChange={cambiar('sucursalId')} required>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {modo !== 'editar' && (
          <div className="us__campo">
            <label htmlFor="us-pass">{modo === 'crear' ? 'Contraseña inicial' : 'Nueva contraseña'}</label>
            <div className="us__pass">
              <input
                id="us-pass"
                type="text"
                value={form.password}
                onChange={cambiar('password')}
                autoComplete="off"
                autoFocus={modo === 'password'}
                minLength={8}
                maxLength={72}
                required
              />
              <button
                type="button"
                className="us__btn us__btn--sec"
                onClick={() => setForm((f) => ({ ...f, password: generarPassword() }))}
              >
                <IconRefresh size={16} aria-hidden="true" /> Generar
              </button>
            </div>
            <small>Mínimo 8 caracteres. Anótala y entrégasela a la persona: después no se puede volver a ver.</small>
          </div>
        )}

        {modo === 'editar' && (
          <p className="us__ayuda">
            Si cambias la sucursal o el rol, los movimientos anteriores se conservan a nombre de la persona.
          </p>
        )}

        {error && (
          <p className="us__error" role="alert">
            {error}
          </p>
        )}

        <footer className="us__modal-pie">
          <button type="button" className="us__btn us__btn--sec" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="us__btn" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Usuarios() {
  const { usuario: yo } = useAuth();
  const [lista, setLista] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [filtros, setFiltros] = useState({ rol: '', sucursalId: '', inactivos: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [modal, setModal] = useState(null); // { modo, usuario }

  const cargar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ activo: 'todos' });
      setLista(await api(`/usuarios?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    api('/sucursales')
      .then(setSucursales)
      .catch((e) => setError(e.message));
  }, [cargar]);

  const visibles = useMemo(
    () =>
      lista.filter(
        (u) =>
          (filtros.inactivos || u.activo) &&
          (!filtros.rol || u.rol === filtros.rol) &&
          (!filtros.sucursalId || u.sucursalId === Number(filtros.sucursalId))
      ),
    [lista, filtros]
  );
  const hayInactivos = lista.some((u) => !u.activo);

  async function alternar(u) {
    setError('');
    setExito('');
    try {
      await api(`/usuarios/${u.id}/estado`, { method: 'PATCH', body: { activo: !u.activo } });
      setLista((l) => l.map((x) => (x.id === u.id ? { ...x, activo: !u.activo } : x)));
      setExito(
        u.activo
          ? `${u.nombre} ya no puede entrar al sistema. Su historial se conserva.`
          : `${u.nombre} puede volver a entrar.`
      );
    } catch (e) {
      setError(e.message);
    }
  }

  function alTerminar(mensaje) {
    setModal(null);
    setExito(mensaje);
    cargar();
  }

  const cambiarFiltro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="us">
      <header className="us__cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Usuarios</h1>
          <p className="us__sub">Quién puede entrar al sistema y a qué sucursal pertenece</p>
        </div>
        <button type="button" className="us__btn" onClick={() => setModal({ modo: 'crear' })} disabled={sucursales.length === 0}>
          <IconPlus size={18} aria-hidden="true" /> Nuevo usuario
        </button>
      </header>

      {exito && (
        <p className="us__exito" role="status">
          {exito}
        </p>
      )}

      <section className="us__tarjeta entra" style={{ '--i': 1 }}>
        <div className="us__filtros">
          <label className="us__campo">
            Rol
            <select value={filtros.rol} onChange={cambiarFiltro('rol')}>
              <option value="">Todos</option>
              <option value="dueno">Dueño</option>
              <option value="encargado">Encargado</option>
              <option value="empleado">Empleado</option>
            </select>
          </label>
          <label className="us__campo">
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
          {hayInactivos && (
            <label className="us__check">
              <input
                type="checkbox"
                checked={filtros.inactivos}
                onChange={(e) => setFiltros((f) => ({ ...f, inactivos: e.target.checked }))}
              />
              Mostrar desactivados
            </label>
          )}
        </div>

        {error && (
          <p className="us__error" role="alert">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="us__vacio">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="us__vacio">No hay usuarios con esos filtros.</p>
        ) : (
          <div className="us__scroll">
            <table className="us__tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Sucursal</th>
                  <th>Alta</th>
                  <th className="der">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => {
                  const esDueno = u.rol === 'dueno';
                  return (
                    <tr key={u.id} className={u.activo ? '' : 'us__fila--off'}>
                      <td>
                        <div className="us__persona">
                          <span className="us__avatar" aria-hidden="true">
                            {u.nombre.charAt(0).toUpperCase()}
                          </span>
                          <span>
                            <b>
                              {u.nombre}
                              {u.id === yo.id && <em className="us__tu"> (tú)</em>}
                            </b>
                            <small>
                              {u.email}
                              {!u.activo && ' · Desactivado'}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`us__rol us__rol--${u.rol}`}>{TEXTO_ROL[u.rol]}</span>
                      </td>
                      <td>{u.sucursal ?? 'Todas'}</td>
                      <td>{fechaCorta(u.creadoEn)}</td>
                      <td className="der">
                        {esDueno ? (
                          <span className="us__mu">Se administra desde el servidor</span>
                        ) : (
                          <div className="us__acciones">
                            <button type="button" className="us__icono" onClick={() => setModal({ modo: 'editar', usuario: u })} aria-label={`Editar a ${u.nombre}`} title="Editar">
                              <IconPencil size={18} aria-hidden="true" />
                            </button>
                            <button type="button" className="us__icono" onClick={() => setModal({ modo: 'password', usuario: u })} aria-label={`Cambiar contraseña de ${u.nombre}`} title="Cambiar contraseña">
                              <IconKey size={18} aria-hidden="true" />
                            </button>
                            <button type="button" className="us__link" onClick={() => alternar(u)}>
                              {u.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <ModalUsuario
          key={`${modal.modo}-${modal.usuario?.id ?? 'nuevo'}`}
          modo={modal.modo}
          usuario={modal.usuario}
          sucursales={sucursales}
          onCerrar={() => setModal(null)}
          onListo={alTerminar}
        />
      )}
    </div>
  );
}