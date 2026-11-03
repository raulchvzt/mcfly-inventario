import { useEffect, useState } from 'react';
import {
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconCircleX,
  IconCoin,
  IconShoppingCart,
  IconTruck,
} from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { haceCuanto, horaMovimiento, moneda, numero, UNIDAD } from '../utils/formato';
import './Panel.css'
import Consumo from './Consumo';;

const COLORES_SUC = ['var(--b1)', 'var(--b2)', '#cbd5e1'];
const TIPOS = {
  entrada: 'Entrada',
  consumo: 'Consumo',
  merma: 'Merma',
  transferencia_salida: 'Envío',
  transferencia_entrada: 'Recepción',
  ajuste: 'Ajuste',
};
const corto = (nombre) => nombre.replace(/^McFly\s+/i, '');
const etiquetaDia = (f) =>
  new Date(`${f}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');

function Barra({ partes }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  return (
    <div className="barra" aria-hidden="true">
      {total > 0 &&
        partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <span key={p.nombre} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} />
          ))}
    </div>
  );
}

function Leyenda({ partes, conTexto }) {
  return (
    <ul className="leyenda">
      {partes.map((p) => (
        <li key={p.nombre}>
          <i style={{ background: p.color }} />
          {p.nombre}
          {conTexto && <b>{p.texto}</b>}
        </li>
      ))}
    </ul>
  );
}

function Tarjeta({ Icono, titulo, valor, orden, children }) {
  return (
    <article className="tarjeta entra" style={{ '--i': orden }}>
      <p className="tarjeta__titulo">
        <Icono size={18} aria-hidden="true" />
        {titulo}
      </p>
      <p className="tarjeta__valor">{valor}</p>
      {children}
    </article>
  );
}

function Estado({ estado }) {
  if (estado === 'agotado') {
    return (
      <span className="badge badge--ag">
        <IconCircleX size={14} aria-hidden="true" />
        Agotado
      </span>
    );
  }
  return (
    <span className="badge badge--lo">
      <IconAlertTriangle size={14} aria-hidden="true" />
      Bajo
    </span>
  );
}

function GraficaConsumo({ consumo, orden }) {
  const { sucursales, dias } = consumo;
  const max = Math.max(1, ...dias.map((d) => d.total));
  const totalSemana = dias.reduce((a, d) => a + d.total, 0);
  const leyenda = sucursales.map((s, i) => ({
    nombre: corto(s.nombre),
    color: COLORES_SUC[i] || COLORES_SUC[2],
  }));

  return (
    <article className="tarjeta entra" style={{ '--i': orden }}>
      <div className="tarjeta__cab">
        <h2>Consumo de la semana</h2>
        <span className="mu">{moneda(totalSemana)}</span>
      </div>
      <div
        className="col"
        role="img"
        aria-label={`Consumo diario de los últimos 7 días: ${moneda(totalSemana)} en total`}
      >
        {dias.map((d, idx) => (
          <div
            className="col__dia"
            style={{ '--d': idx }}
            key={d.fecha}
            title={`${etiquetaDia(d.fecha)}: ${moneda(d.total)}`}
          >
            {sucursales.map(
              (s, i) =>
                d.porSucursal[s.id] > 0 && (
                  <span
                    key={s.id}
                    style={{
                      height: `${(d.porSucursal[s.id] / max) * 100}%`,
                      background: COLORES_SUC[i] || COLORES_SUC[2],
                    }}
                  />
                )
            )}
          </div>
        ))}
      </div>
      <div className="col__etq" aria-hidden="true">
        {dias.map((d) => (
          <span key={d.fecha}>{etiquetaDia(d.fecha)}</span>
        ))}
      </div>
      <Leyenda partes={leyenda} />
    </article>
  );
}

function Alertas({ alertas, orden }) {
  return (
    <article className="tarjeta entra" style={{ '--i': orden }}>
      <div className="tarjeta__cab">
        <h2>Alertas de stock</h2>
      </div>
      {alertas.items.length === 0 ? (
        <p className="vacio">
          <IconCircleCheck size={18} aria-hidden="true" />
          Todo en orden: ningún producto bajo su mínimo.
        </p>
      ) : (
        <ul className="alertas">
          {alertas.items.map((a) => {
            const unidad = UNIDAD[a.unidadMedida];
            const pct = a.stockMinimo > 0 ? Math.min(100, (a.stock / a.stockMinimo) * 100) : 0;
            return (
              <li key={`${a.productoId}-${a.sucursal}`}>
                <div className="fila">
                  <p className="nm">
                    {a.nombre} <span className="mu">{a.presentacion}</span>
                  </p>
                  <Estado estado={a.estado} />
                </div>
                <div className="pb" aria-hidden="true">
                  <span
                    style={{
                      width: `${pct}%`,
                      background: a.estado === 'agotado' ? 'var(--ag)' : 'var(--lo)',
                    }}
                  />
                </div>
                <p className="mu">
                  {corto(a.sucursal)} · {numero(a.stock)} de {numero(a.stockMinimo)} {unidad}
                </p>
                {a.sobrante && (
                  <p className="sobrante">
                    <IconTruck size={14} aria-hidden="true" />
                    {corto(a.sobrante.sucursal)} tiene {numero(a.sobrante.excedente)} {unidad} de sobra
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {alertas.total > alertas.items.length && (
        <p className="mu">y {alertas.total - alertas.items.length} más</p>
      )}
    </article>
  );
}

function Movimientos({ lista, orden }) {
  return (
    <article className="tarjeta entra" style={{ '--i': orden }}>
      <div className="tarjeta__cab">
        <h2>Últimos movimientos</h2>
      </div>
      {lista.length === 0 ? (
        <p className="vacio">Aún no hay movimientos.</p>
      ) : (
        <div className="scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Movimiento</th>
                <th className="der">Cantidad</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const c = Number(m.cantidad);
                return (
                  <tr key={m.id}>
                    <td>{horaMovimiento(m.fecha)}</td>
                    <td>
                      {TIPOS[m.tipo]}
                      <small>
                        {m.producto} {m.presentacion}
                      </small>
                    </td>
                    <td className={`der${c > 0 ? ' pos' : ''}`}>
                      {c > 0 ? '+' : '−'}
                      {numero(Math.abs(c))} {UNIDAD[m.unidadMedida]}
                    </td>
                    <td>
                      {m.usuario}
                      <small>{corto(m.sucursal)}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function Transferencias({ lista, confirmando, onConfirmar, aviso, orden }) {
  return (
    <article className="tarjeta entra" style={{ '--i': orden }}>
      <div className="tarjeta__cab">
        <h2>Transferencias en tránsito</h2>
      </div>
      {aviso && (
        <p className="panel-error" role="alert">
          {aviso}
        </p>
      )}
      {lista.length === 0 ? (
        <p className="vacio">No hay transferencias en tránsito.</p>
      ) : (
        lista.map((t) => (
          <div className="transf" key={t.id}>
            <div className="fila">
              <strong className="nm">
                {corto(t.origen)} → {corto(t.destino)}
              </strong>
              <span className="badge badge--tr">
                <IconTruck size={14} aria-hidden="true" />
                En tránsito
              </span>
            </div>
            <ul className="transf__items">
              {t.items.map((i) => (
                <li key={i.id}>
                  {i.producto} {i.presentacion} · {numero(i.cantidad)} {UNIDAD[i.unidadMedida]}
                </li>
              ))}
            </ul>
            <p className="mu">
              Enviada por {t.creadaPor}, {haceCuanto(t.creadaEn)}
            </p>
            {t.puedeConfirmar && (
              <button
                type="button"
                className="btn-pr"
                disabled={confirmando === t.id}
                onClick={() => onConfirmar(t.id)}
              >
                {confirmando === t.id ? 'Confirmando…' : 'Confirmar recepción'}
              </button>
            )}
          </div>
        ))
      )}
    </article>
  );
}

function PanelGestion() {
  const { usuario } = useAuth();
  const [sucursalId, setSucursalId] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    const q = sucursalId ? `?sucursalId=${sucursalId}` : '';
    api(`/resumen${q}`)
      .then((d) => {
        if (vigente) {
          setDatos(d);
          setError('');
        }
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      });
    return () => {
      vigente = false;
    };
  }, [sucursalId, recarga]);

  async function confirmar(id) {
    setConfirmando(id);
    setAviso('');
    try {
      await api(`/transferencias/${id}/confirmar`, { method: 'POST' });
      setRecarga((n) => n + 1);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setConfirmando(null);
    }
  }

  if (!datos) {
    return error ? (
      <div className="panel">
        <p className="panel-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn-pr" onClick={() => setRecarga((n) => n + 1)}>
          Reintentar
        </button>
      </div>
    ) : (
      <div className="pantalla-carga">Cargando…</div>
    );
  }

  const vi = datos.valorInventario;
  const al = datos.alertas;
  const cm = datos.comprasMes;

  const partesValor = vi.porSucursal.map((s, i) => ({
    nombre: corto(s.sucursal),
    valor: s.valor,
    texto: ` ${moneda(s.valor)}`,
    color: COLORES_SUC[i] || COLORES_SUC[2],
  }));
  const partesAlertas = [
    { nombre: 'Agotado', valor: al.agotados, texto: ` ${al.agotados}`, color: 'var(--ag)' },
    { nombre: 'Bajo', valor: al.bajos, texto: ` ${al.bajos}`, color: 'var(--lo)' },
  ];
  const partesCompras = [
    { nombre: 'Contado', valor: cm.porFormaPago.contado, texto: ` ${moneda(cm.porFormaPago.contado)}`, color: 'var(--b1)' },
    { nombre: 'Crédito', valor: cm.porFormaPago.credito, texto: ` ${moneda(cm.porFormaPago.credito)}`, color: 'var(--b2)' },
    { nombre: 'Caja chica', valor: cm.porFormaPago.caja_chica, texto: ` ${moneda(cm.porFormaPago.caja_chica)}`, color: '#cbd5e1' },
  ];

  const opciones = [
    { id: null, nombre: 'Todas' },
    ...datos.sucursalesDisponibles.map((s) => ({ id: s.id, nombre: corto(s.nombre) })),
  ];
  const miSucursal = datos.sucursalesDisponibles.find((s) => s.id === usuario.sucursalId);
  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="panel">
      <header className="cab entra" style={{ '--i': 0 }}>
        <div>
          <h1>Panel</h1>
          <p className="fecha">{fechaHoy}</p>
        </div>
        <div className="cab__der">
          {usuario.rol === 'dueno' ? (
            <div className="seg" role="group" aria-label="Sucursal">
              {opciones.map((o) => (
                <button
                  key={o.id ?? 'todas'}
                  type="button"
                  aria-pressed={sucursalId === o.id}
                  className={sucursalId === o.id ? 'on' : ''}
                  onClick={() => setSucursalId(o.id)}
                >
                  {o.nombre}
                </button>
              ))}
            </div>
          ) : (
            miSucursal && <span className="etiqueta">{corto(miSucursal.nombre)}</span>
          )}
          <span className="campana" role="status" aria-label={`${al.total} productos en alerta`}>
            <IconBell size={20} aria-hidden="true" />
            {al.total > 0 && <b>{al.total}</b>}
          </span>
        </div>
      </header>

      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}

      <section className="resumen" aria-label="Resumen">
        <Tarjeta Icono={IconCoin} titulo="Valor del inventario" valor={moneda(vi.total)} orden={1}>
          <Barra partes={partesValor} />
          <Leyenda partes={partesValor} conTexto />
        </Tarjeta>
        <Tarjeta Icono={IconAlertTriangle} titulo="Productos en alerta" valor={String(al.total)} orden={2}>
          <Barra partes={partesAlertas} />
          <Leyenda partes={partesAlertas} conTexto />
        </Tarjeta>
        <Tarjeta Icono={IconShoppingCart} titulo="Compras del mes" valor={moneda(cm.total)} orden={3}>
          <Barra partes={partesCompras} />
          <Leyenda partes={partesCompras} conTexto />
        </Tarjeta>
      </section>

      <div className="fila2">
        <GraficaConsumo consumo={datos.consumoSemana} orden={4} />
        <Alertas alertas={al} orden={5} />
      </div>

      <div className="fila2">
        <Movimientos lista={datos.movimientosRecientes} orden={6} />
        <Transferencias
          lista={datos.transferenciasPendientes}
          confirmando={confirmando}
          onConfirmar={confirmar}
          aviso={aviso}
          orden={7}
        />
      </div>
    </div>
  );
}


export default function Panel() {
  const { usuario } = useAuth();
  return usuario.rol === 'empleado' ? <Consumo /> : <PanelGestion />;
}