import { useAuth } from '../context/AuthContext';

export default function Panel() {
  const { usuario, cerrarSesion } = useAuth();
  return (
    <main style={{ padding: 32 }}>
      <h1>Hola, {usuario.nombre}</h1>
      <p>Rol: {usuario.rol}</p>
      <button onClick={cerrarSesion}>Cerrar sesión</button>
    </main>
  );
}