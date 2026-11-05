import { useEffect, useRef, useState } from 'react';
import {
  IconBrush,
  IconCamera,
  IconDroplet,
  IconPackage,
  IconSparkles,
  IconSpray,
} from '@tabler/icons-react';
import { apiSubir } from '../api/client';
import { reducirImagen, urlImagen } from '../utils/imagen';
import './FotoProducto.css';

// Ícono fijo cuando el producto no tiene foto, según su categoría
const POR_CATEGORIA = {
  Lavado: { Icono: IconDroplet, fondo: '#e3f3fb', color: '#0e7ab5' },
  Detallado: { Icono: IconSparkles, fondo: '#fef3c7', color: '#92400e' },
  Limpieza: { Icono: IconSpray, fondo: '#e3f6ee', color: '#0b6b47' },
  Accesorios: { Icono: IconBrush, fondo: '#ece9fb', color: '#4b3fa6' },
};
const GENERICO = { Icono: IconPackage, fondo: '#f4f6f8', color: '#667085' };

export function FotoProducto({ producto, tamano = 48 }) {
  const url = urlImagen(producto.productoId, producto.imagenV);
  const [fallo, setFallo] = useState(false);

  useEffect(() => setFallo(false), [url]);

  const estilo = { width: tamano, height: tamano, borderRadius: Math.round(tamano * 0.25) };

  if (url && !fallo) {
    return <img className="foto" style={estilo} src={url} alt="" loading="lazy" onError={() => setFallo(true)} />;
  }

  const { Icono, fondo, color } = POR_CATEGORIA[producto.categoria] || GENERICO;
  return (
    <span className="foto foto--icono" style={{ ...estilo, background: fondo, color }} aria-hidden="true">
      <Icono size={Math.round(tamano * 0.5)} stroke={1.75} />
    </span>
  );
}

// Botón de cámara: el dueño elige una foto, se reduce en el navegador y se sube
export function BotonFoto({ producto, onCambio, onError }) {
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState(false);

  async function alElegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    try {
      const imagen = await reducirImagen(archivo);
      const r = await apiSubir(`/productos/${producto.productoId}/imagen`, imagen);
      onCambio(producto.productoId, r.imagenV);
    } catch (err) {
      onError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="foto-cam"
        onClick={() => entrada.current?.click()}
        disabled={subiendo}
        aria-label={`Cambiar la foto de ${producto.nombre}`}
        title="Cambiar foto"
      >
        <IconCamera size={15} aria-hidden="true" />
      </button>
      <input ref={entrada} type="file" accept="image/*" hidden onChange={alElegir} />
    </>
  );
}