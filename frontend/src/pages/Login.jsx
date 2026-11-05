import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import './css/Login.css';

const INTERVALO = 6000; // milisegundos entre imágenes

// Las imágenes viven en frontend/public/login/
const SLIDES = [
  {
    imagen: '/header.jpg',
    titulo: 'Sabe qué tienes y dónde',
    texto: 'Consulta el inventario de Centro y Villa desde un solo lugar.',
  },
  {
    imagen: '/header-2.jpg',
    titulo: 'Antes de que se acabe',
    texto: 'Las alertas te avisan cuando un producto está por agotarse.',
  },
  {
    imagen: '/header-3.jpg',
    titulo: 'Cada movimiento, con nombre',
    texto: 'Consumos, mermas y transferencias quedan registrados con quién los hizo.',
  }
];

export default function Login() {
  const { usuario, iniciarSesion } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [indice, setIndice] = useState(0);

  // Precarga las imágenes para que el fundido no parpadee
  useEffect(() => {
    SLIDES.forEach((s) => {
      const img = new Image();
      img.src = s.imagen;
    });
  }, []);

  // Pasa a la siguiente imagen. Se reinicia si el usuario toca un punto
  useEffect(() => {
    const id = setTimeout(() => setIndice((i) => (i + 1) % SLIDES.length), INTERVALO);
    return () => clearTimeout(id);
  }, [indice]);

  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setError('');
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
    } catch (err) {
      setError(err.status === 401 ? 'Correo o contraseña incorrectos.' : err.message);
      setEnviando(false);
    }
  }

  const slide = SLIDES[indice];

  return (
    <main className="login">
      <section className="login__form">
        <div className="login__caja">
          <img className="login__logo" src={logo} alt="McFly, auto-lavado y detallado" />
          <h1>Bienvenido de vuelta</h1>
          <p className="login__sub">Entra para ver tu inventario.</p>

          <form onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="email">Correo</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="campo">
              <div className="campo__fila">
                <label htmlFor="password">Contraseña</label>
                <button type="button" className="enlace" onClick={() => setAyuda((v) => !v)}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="campo__password">
                <input
                  id="password"
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="ojo"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {verPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>

            {ayuda && (
              <p className="aviso">Pídele al dueño del negocio que restablezca tu contraseña.</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button className="btn-primario" type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>

      <aside className="login__hero">
        {SLIDES.map((s, i) => (
          <div
            key={s.imagen}
            className={`login__slide${i === indice ? ' on' : ''}`}
            style={{ backgroundImage: `url('${s.imagen}')` }}
            aria-hidden="true"
          />
        ))}
        <div className="login__hero-texto">
          <div className="puntos">
            {SLIDES.map((s, i) => (
              <button
                key={s.imagen}
                type="button"
                className={i === indice ? 'on' : ''}
                onClick={() => setIndice(i)}
                aria-label={`Ver mensaje ${i + 1} de ${SLIDES.length}`}
              />
            ))}
          </div>
          <h2>{slide.titulo}</h2>
          <p>{slide.texto}</p>
        </div>
      </aside>
    </main>
  );
}