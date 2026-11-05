import { NavLink, Outlet } from 'react-router-dom';
import {
  IconArrowsExchange,
  IconChartBar,
  IconDroplet,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconSettings,
  IconShoppingCart,
  IconTruck,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import './Layout.css';

const GESTION = ['dueno', 'encargado'];

// Los elementos sin "to" todavía no tienen pantalla y se muestran apagados
const PRINCIPAL = [
  { to: '/', texto: 'Panel', Icono: IconLayoutDashboard, roles: GESTION },
  { to: '/', texto: 'Consumo', Icono: IconDroplet, roles: ['empleado'] },
  { to: '/consumo', texto: 'Consumo', Icono: IconDroplet, roles: GESTION },
  { texto: 'Inventario', Icono: IconPackage, roles: GESTION },
  { to: '/movimientos', texto: 'Movimientos', Icono: IconArrowsExchange, roles: GESTION },
  { texto: 'Compras', Icono: IconShoppingCart, roles: GESTION },
  { texto: 'Transferencias', Icono: IconTruck, roles: GESTION },
  { texto: 'Reportes', Icono: IconChartBar, roles: GESTION },
];
const CUENTA = [
  { texto: 'Usuarios', Icono: IconUsers, roles: ['dueno'] },
  { texto: 'Ajustes', Icono: IconSettings, roles: ['dueno'] },
];
const ROL = { dueno: 'Dueño', encargado: 'Encargado', empleado: 'Empleado' };

function Item({ to, texto, Icono }) {
  const contenido = (
    <>
      <Icono size={20} stroke={1.75} aria-hidden="true" />
      <span className="nav__txt">{texto}</span>
    </>
  );
  if (!to) {
    return (
      <span className="nav__item nav__item--off" aria-disabled="true" title={`${texto}: próximamente`}>
        {contenido}
      </span>
    );
  }
  return (
    <NavLink to={to} end title={texto} className={({ isActive }) => `nav__item${isActive ? ' on' : ''}`}>
      {contenido}
    </NavLink>
  );
}

export default function Layout() {
  const { usuario, cerrarSesion } = useAuth();
  const visible = (i) => i.roles.includes(usuario.rol);

  return (
    <div className="app">
      <aside className="side">
        <img className="side__logo" src={logo} alt="McFly" />
        <nav className="side__nav" aria-label="Principal">
          {PRINCIPAL.filter(visible).map((i) => (
            <Item key={i.texto} {...i} />
          ))}
        </nav>
        <nav className="side__nav side__nav--pie" aria-label="Cuenta">
          {CUENTA.filter(visible).map((i) => (
            <Item key={i.texto} {...i} />
          ))}
          <div className="usuario">
            <span className="usuario__avatar" aria-hidden="true">
              {usuario.nombre.charAt(0).toUpperCase()}
            </span>
            <span className="nav__txt usuario__datos">
              <b>{usuario.nombre}</b>
              <small>{ROL[usuario.rol]}</small>
            </span>
          </div>
          <button type="button" className="nav__item" onClick={cerrarSesion} title="Cerrar sesión">
            <IconLogout size={20} stroke={1.75} aria-hidden="true" />
            <span className="nav__txt">Cerrar sesión</span>
          </button>
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}