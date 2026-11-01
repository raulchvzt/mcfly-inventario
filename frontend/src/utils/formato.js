const mx = (opciones) => new Intl.NumberFormat('es-MX', opciones);

export const moneda = (n) =>
  mx({ style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
export const numero = (n) => mx({ maximumFractionDigits: 2 }).format(n ?? 0);
export const UNIDAD = { litro: 'L', mililitro: 'ml', galon: 'gal', pieza: 'pz' };

export function haceCuanto(fecha) {
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function horaMovimiento(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}