import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowRightLeft, Boxes, ExternalLink, FileSpreadsheet, History, LifeBuoy, LogIn,
  PackageCheck, QrCode, ShieldCheck, Truck, Users,
} from 'lucide-react';
import axios from 'axios';

// Landing pública del proyecto Acción del Sur. Paleta tomada del logo; colores explícitos porque
// la app redefine la escala slate de Tailwind (src/index.css).
const C = {
  carbon: '#22272B',
  naranja: '#E9541C',
  niebla: '#EEF1F2',
  pizarra: '#56616B',
  verde: '#17866A',
};

const ANCHO = { fontVariationSettings: '"wdth" 125' };

const MOVIMIENTO = {
  ingreso: { icon: ArrowDownToLine, verbo: 'ingresó a', signo: '+' },
  transferencia: { icon: ArrowRightLeft, verbo: 'se movió de', signo: '' },
  envio: { icon: Truck, verbo: 'se envió a', signo: '−' },
};

const PASOS = [
  {
    titulo: 'Se recibe la donación',
    texto: 'El equipo registra qué llegó, cuánto y a qué centro. En las recepciones con QR, quien dona recibe un link para ver qué se aceptó de su donación y qué no, y por qué.',
    cadena: 'Queda registrado el ingreso al centro.',
    icon: QrCode,
  },
  {
    titulo: 'Se clasifica',
    texto: 'Cada insumo pasa por recibido, preparado y disponible. Solo lo que está disponible puede salir: así no se promete lo que todavía no está listo.',
    cadena: 'Sin cambios en la blockchain: el insumo sigue en el mismo centro.',
    icon: Boxes,
  },
  {
    titulo: 'Se redistribuye',
    texto: 'Si un centro tiene de más y otro de menos, se transfiere. El sistema no deja mover lo que no está en el centro de origen.',
    cadena: 'Queda registrado el traspaso entre los dos centros.',
    icon: ArrowRightLeft,
  },
  {
    titulo: 'Se envía a destino',
    texto: 'Se arma el envío al punto donde se entrega la ayuda. Al confirmarlo, el stock se descuenta en una sola operación y no se puede confirmar dos veces.',
    cadena: 'Queda registrada la salida del inventario.',
    icon: Truck,
  },
];

const FUNCIONES = [
  { icon: LifeBuoy, titulo: 'Panel de apoyo', texto: 'Qué insumos faltan y qué centros están recibiendo.' },
  { icon: Boxes, titulo: 'Inventario por centro', texto: 'Búsqueda, filtros por categoría y estado, y la historia de cada insumo.' },
  { icon: QrCode, titulo: 'Recepciones con QR', texto: 'El donante sigue y verifica su donación sin crear una cuenta.' },
  { icon: History, titulo: 'Historial', texto: 'Donaciones, transferencias y envíos en una sola línea de tiempo.' },
  { icon: Users, titulo: 'Roles', texto: 'Voluntarios operan; la coordinación administra centros, categorías y usuarios.' },
  { icon: FileSpreadsheet, titulo: 'Exportación', texto: 'El inventario se descarga en CSV para informes.' },
];

const EQUIPO = [
  { foto: 'martina-blanco', nombre: 'Martina Blanco', rol: 'Liderazgo de proyecto' },
  { foto: 'carolina-ochoa', nombre: 'Carolina Ochoa', rol: 'Gestión y comunicación territorial' },
  { foto: 'julian-fernandez', nombre: 'Julián Fernández', rol: 'Coordinación y estrategia' },
  { foto: 'rocio-baggio', nombre: 'Rocío Baggio', rol: 'Diseño y comunicación digital' },
  { foto: 'diego-forni', nombre: 'Diego Forni', rol: 'Desarrollo, IA y soporte técnico' },
  { foto: 'juan-loncharich', nombre: 'Juan Loncharich', rol: 'Datos e implementación tecnológica' },
];

const explorer = (red, tipo, id) => `https://stellar.expert/explorer/${red || 'testnet'}/${tipo}/${id}`;
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v))
  .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

export default function Landing() {
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState(null);

  useEffect(() => {
    axios.get('/api/landing/summary').then((r) => setResumen(r.data)).catch(() => setResumen(false));
    axios.get('/api/landing/recent-movements?limit=5').then((r) => setMovimientos(r.data)).catch(() => setMovimientos(false));
  }, []);

  const red = resumen?.blockchain?.network || movimientos?.network;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Archivo", system-ui, sans-serif', color: C.carbon }}>
      {/* Encabezado */}
      <header className="sticky top-0 z-30 border-b border-black/5 backdrop-blur" style={{ backgroundColor: 'rgba(238,241,242,.9)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <a href="#inicio" className="shrink-0" aria-label="Acción del Sur, inicio">
            <img src="/assets/proyecto/logo-accion-del-sur.png" alt="Acción del Sur" className="h-10 w-auto sm:h-11" />
          </a>
          <nav className="hidden items-center gap-7 text-[15px] font-medium md:flex" aria-label="Secciones">
            <a href="#como-funciona" className="hover:opacity-70">Cómo funciona</a>
            <a href="#transparencia" className="hover:opacity-70">Transparencia</a>
            <a href="#equipo" className="hover:opacity-70">Equipo</a>
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: C.carbon, outlineColor: C.naranja }}
          >
            <LogIn size={16} aria-hidden="true" /> Ingresar al sistema
          </Link>
        </div>
      </header>

      <main>
        {/* Hero: la promesa y la prueba, lado a lado */}
        <section id="inicio" style={{ backgroundColor: C.niebla }}>
          <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-20">
            <div>
              <p className="mb-6 max-w-md text-[15px] leading-relaxed" style={{ color: C.pizarra }}>
                Programa de extensión universitaria de CGIC para la respuesta humanitaria frente a crisis climáticas.
              </p>
              <h1 className="text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.02em] sm:text-5xl lg:text-6xl" style={ANCHO}>
                Cada donación deja un rastro que cualquiera puede seguir.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed" style={{ color: C.pizarra }}>
                Acción del Sur organiza la ayuda en emergencias: registra lo que llega, ordena el inventario de cada
                centro y coordina los envíos. Cada movimiento queda registrado en una blockchain pública, para que la
                transparencia no dependa de la palabra de nadie.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ backgroundColor: C.naranja, outlineColor: C.carbon }}
                >
                  <LogIn size={18} aria-hidden="true" /> Ingresar al sistema
                </Link>
                <a
                  href="#como-funciona"
                  className="inline-flex items-center rounded-full border-2 px-6 py-3 font-semibold hover:bg-white"
                  style={{ borderColor: C.carbon }}
                >
                  Ver cómo funciona
                </a>
              </div>
            </div>

            <Registro movimientos={movimientos} resumen={resumen} red={red} />
          </div>
        </section>

        {/* El problema */}
        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[.8fr_1.2fr] md:items-center">
          <img
            src="/assets/proyecto/voluntaria.webp"
            alt="Voluntaria de CGIC revisando el registro de donaciones"
            className="aspect-[4/5] w-full rounded-[28px] object-cover"
            loading="lazy"
          />
          <div>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-[2.6rem]" style={ANCHO}>
              En una emergencia, la ayuda llega de todos lados a la vez.
            </h2>
            <div className="mt-6 max-w-[62ch] space-y-4 text-lg leading-relaxed" style={{ color: C.pizarra }}>
              <p>
                Muchas donaciones, de muchas personas, a varios centros al mismo tiempo. Con planillas y mensajes
                sueltos es difícil saber qué hay, qué falta y si lo que se donó llegó a destino.
              </p>
              <p>
                Y quien dona necesita confianza. No alcanza con decir que la ayuda se usó bien: hay que poder mostrarlo.
                Acción del Sur reemplaza ese desorden por un único registro, compartido por todo el equipo y verificable
                desde afuera.
              </p>
            </div>
          </div>
        </section>

        {/* Cómo funciona: es una secuencia real, por eso va numerada */}
        <section id="como-funciona" className="scroll-mt-20" style={{ backgroundColor: C.niebla }}>
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-[2.6rem]" style={ANCHO}>
              Del centro de recepción al destino, en cuatro pasos.
            </h2>
            <ol className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-4">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className="relative border-t-2 pt-6" style={{ borderColor: C.carbon }}>
                  <span className="text-5xl font-extrabold leading-none" style={{ ...ANCHO, color: C.naranja }} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{p.titulo}</h3>
                  <p className="mt-3 leading-relaxed" style={{ color: C.pizarra }}>{p.texto}</p>
                  <p className="mt-4 flex gap-2 text-sm font-medium" style={{ color: C.verde }}>
                    <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {p.cadena}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Transparencia */}
        <section id="transparencia" className="scroll-mt-20 text-white" style={{ backgroundColor: C.carbon }}>
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold leading-tight sm:text-[2.6rem]" style={ANCHO}>
                Un libro de actas que nadie puede borrar.
              </h2>
              <div className="mt-6 max-w-[60ch] space-y-4 text-lg leading-relaxed text-white/75">
                <p>
                  La blockchain funciona como un libro de actas público, sellado y copiado en miles de computadoras.
                  Cada vez que un insumo entra, se mueve o sale, el sistema escribe una línea en ese libro. Nadie, ni
                  siquiera la propia organización, puede arrancar una hoja ni cambiar lo escrito.
                </p>
                <p>
                  Usamos Stellar, una red pública y de bajo costo. Si la red no responde, el trabajo del equipo no se
                  frena: la operación se guarda y se registra apenas vuelve la conexión.
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold">Cómo se comprueba</h3>
              <ul className="mt-6 space-y-6">
                {[
                  ['Cada insumo tiene su historia', 'Todos sus movimientos, con el link a cada transacción en el explorador público de Stellar.'],
                  ['El inventario se compara con la blockchain', 'El sistema consulta en vivo el saldo registrado para cada centro y avisa si no coincide con el stock.'],
                  ['El donante verifica su recepción', 'Desde el link del QR comprueba que el detalle que ve es exactamente el que quedó registrado.'],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-4">
                    <PackageCheck size={22} className="mt-0.5 shrink-0" style={{ color: C.naranja }} aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{t}</p>
                      <p className="mt-1 leading-relaxed text-white/70">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {resumen?.blockchain?.sftContract && (
                <a
                  href={explorer(red, 'contract', resumen.blockchain.sftContract)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold hover:bg-white/10"
                >
                  <ExternalLink size={15} aria-hidden="true" /> Ver el registro público del inventario
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Qué incluye */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-[2.6rem]" style={ANCHO}>
            Pensado para quien está en el centro, no para técnicos.
          </h2>
          <p className="mt-5 max-w-[62ch] text-lg leading-relaxed" style={{ color: C.pizarra }}>
            Lo usa el voluntariado en plena jornada: pocos pasos, lenguaje claro y el estado de cada cosa a la vista.
          </p>
          <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES.map((f) => (
              <div key={f.titulo} className="flex gap-4">
                <f.icon size={24} className="mt-0.5 shrink-0" style={{ color: C.naranja }} aria-hidden="true" />
                <div>
                  <dt className="font-bold">{f.titulo}</dt>
                  <dd className="mt-1 leading-relaxed" style={{ color: C.pizarra }}>{f.texto}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        {/* Reconocimiento */}
        <section style={{ backgroundColor: C.niebla }}>
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <img
              src="/assets/proyecto/vendimia-tech-2026.webp"
              alt="El equipo de Acción del Sur en el escenario de Vendimia Tech 2026, en Mendoza"
              className="w-full rounded-[28px] object-cover"
              loading="lazy"
            />
            <div>
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl" style={ANCHO}>
                Tercer puesto en Vendimia Tech 2026.
              </h2>
              <p className="mt-5 text-lg leading-relaxed" style={{ color: C.pizarra }}>
                Entre 16 proyectos, en Mendoza, con Acción del Sur Blockchain: la trazabilidad de donaciones para
                contextos de emergencia. El proyecto también se presentó en EmprendeU.
              </p>
            </div>
          </div>
        </section>

        {/* Equipo */}
        <section id="equipo" className="scroll-mt-20 mx-auto max-w-6xl px-5 py-24">
          <h2 className="text-3xl font-extrabold leading-tight sm:text-[2.6rem]" style={ANCHO}>
            Quiénes lo hacemos.
          </h2>
          <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {EQUIPO.map((p) => (
              <li key={p.nombre}>
                <img
                  src={`/assets/proyecto/equipo/${p.foto}.webp`}
                  alt={p.nombre}
                  width="144" height="144"
                  className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36"
                  loading="lazy"
                />
                <p className="mt-4 font-bold leading-snug">{p.nombre}</p>
                <p className="mt-1 text-sm leading-snug" style={{ color: C.pizarra }}>{p.rol}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Pie */}
      <footer className="text-white" style={{ backgroundColor: C.carbon }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-5">
              <img src="/assets/proyecto/logo-accion-del-sur.png" alt="Acción del Sur" className="h-11 w-auto" />
              <img src="/assets/images/logo-cgic.png" alt="CGIC — Centro de Gestión Integral de Crisis" className="h-11 w-auto" />
            </div>
            <p className="mt-5 max-w-sm text-white/65">
              Una iniciativa de CGIC, Centro de Gestión Integral de Crisis.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-white/80 md:items-end">
            <a href="https://cgic-argentina.org/" target="_blank" rel="noreferrer" className="hover:text-white">cgic-argentina.org</a>
            <a href="https://www.instagram.com/cgic.argentina/" target="_blank" rel="noreferrer" className="hover:text-white">Instagram @cgic.argentina</a>
            <a href="mailto:cgic.argentina@gmail.com" className="hover:text-white">cgic.argentina@gmail.com</a>
            <Link to="/login" className="mt-3 font-semibold" style={{ color: C.naranja }}>Ingresar al sistema</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Panel del hero: últimos movimientos anclados en Stellar, cada uno con su transacción.
function Registro({ movimientos, resumen, red }) {
  const lista = movimientos ? movimientos.data : [];
  const s = resumen?.summary;

  return (
    <div className="rounded-[28px] p-6 text-white shadow-[0_30px_60px_-30px_rgba(34,39,43,.6)] sm:p-7" style={{ backgroundColor: C.carbon }}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">Registrado en la blockchain</h2>
        <span className="inline-flex items-center gap-2 text-sm text-white/60">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lista.length ? '#3DD6A3' : '#8A949C' }} aria-hidden="true" />
          Stellar {red || 'testnet'}
        </span>
      </div>

      {movimientos === null && <p className="mt-6 text-white/60">Consultando el registro…</p>}
      {movimientos === false && <p className="mt-6 text-white/60">No se pudo consultar el registro en este momento.</p>}
      {movimientos && lista.length === 0 && (
        <p className="mt-6 text-white/60">Todavía no hay movimientos registrados. Aparecerán acá a medida que el equipo los cargue.</p>
      )}

      {lista.length > 0 && (
        <ol className="mt-5 divide-y divide-white/10">
          {lista.map((m, i) => {
            const meta = MOVIMIENTO[m.tipo];
            return (
              <li
                key={`${m.tx}-${i}`}
                className="registro-fila flex items-start gap-4 py-3.5"
                style={{ animationDelay: `${150 + i * 120}ms` }}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <meta.icon size={17} style={{ color: C.naranja }} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">
                    <span className="font-semibold">{meta.signo}{m.cantidad} {m.insumo}</span>{' '}
                    <span className="text-white/65">{meta.verbo} {m.lugar}</span>
                  </p>
                  <p className="mt-1 text-sm text-white/45">
                    {fecha(m.fecha)}
                    {m.tx && (
                      <>
                        {', '}
                        <a href={explorer(red, 'tx', m.tx)} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">
                          ver transacción
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {s && (
        <p className="mt-5 border-t border-white/10 pt-5 text-sm leading-relaxed text-white/60">
          {s.totalDonations} donaciones registradas, {s.unitsShipped.toLocaleString('es-AR')} unidades enviadas a{' '}
          {s.destinationsReached} destinos y {s.anchoredOperations} operaciones verificables en la blockchain.
        </p>
      )}
    </div>
  );
}
