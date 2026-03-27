import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  HandHeart, PackageOpen, Truck, Home, BadgeCheck,
  Building2, MapPin, ShieldCheck, Eye, Clock3, Fingerprint,
  ArrowRight, ChevronLeft, ChevronRight, Link2, Users, Package,
} from 'lucide-react';

/* ── DATA ─────────────────────────────────────────────────────────── */

const HERO_SLIDES = [
  {
    tag: 'Transparencia que se puede ver',
    title: 'Acción del Sur',
    subtitle: 'Trazabilidad Solidaria',
    body: 'Cada donación deja un rastro claro desde el origen hasta quien la recibe. Nada se pierde, nada se borra.',
    accent: '#E34E26',
    image: '/assets/images/image1.jpg',
  },
  {
    tag: 'Más de 12.000 donaciones registradas',
    title: 'La ayuda que \nllega de verdad',
    subtitle: 'Verificada y visible',
    body: 'Seguí cada movimiento en tiempo real. El sistema registra de forma permanente cada paso, sin intermediarios ocultos.',
    accent: '#2E4053',
    image: '/assets/images/image2.jpg',
  },
  {
    tag: '94 centros activos en todo el país',
    title: 'Una red que \ncrece junta',
    subtitle: 'De norte a sur',
    body: 'Centros de donación, comunidades y familias conectados en un mismo sistema que garantiza que la ayuda llegue a destino.',
    accent: '#D5DBDB',
    image: '/assets/images/image3.jpg',

  },
];

const SUMMARY_STATS = [
  { label: 'Donaciones registradas', value: '12.480', icon: Link2 },
  { label: 'Beneficiarios alcanzados', value: '38.200', icon: Users },
  { label: 'Centros activos', value: '94', icon: Building2 },
  { label: 'Volumen total entregado', value: '524.000 kg', icon: Package },
];

const CATEGORY_BREAKDOWN = [
  { name: 'Alimentos', value: 42, color: '#E34E26' },
  { name: 'Ropa', value: 24, color: '#2E4053' },
  { name: 'Medicamentos', value: 18, color: '#1B2631' },
  { name: 'Útiles escolares', value: 16, color: '#D5DBDB' },
];

const FLOW_STEPS = [
  { title: 'Una persona dona', description: 'La donación se carga con datos simples: qué es, cuánta cantidad y desde dónde sale.', icon: HandHeart },
  { title: 'Se prepara y clasifica', description: 'El centro revisa y ordena la ayuda para que llegue en buen estado al lugar correcto.', icon: PackageOpen },
  { title: 'Viaja a su destino', description: 'Durante el recorrido se actualiza el estado para que cualquier persona pueda seguirlo.', icon: Truck },
  { title: 'Llega y se confirma', description: 'La entrega se marca como completada y queda guardada para siempre como una huella digital.', icon: Home },
];

const IN_PROGRESS_DONATIONS = [
  { id: 'D-1208', type: 'Alimentos secos', quantity: '1.200 kg', route: 'Córdoba → Villa María', status: 'En tránsito', progress: 68 },
  { id: 'D-1212', type: 'Ropa de abrigo', quantity: '850 prendas', route: 'Tucumán → Tafí Viejo', status: 'En verificación', progress: 36 },
  { id: 'D-1215', type: 'Kits escolares', quantity: '420 kits', route: 'Rosario → Santa Fe Capital', status: 'Entregada', progress: 100 },
  { id: 'D-1219', type: 'Medicamentos esenciales', quantity: '260 cajas', route: 'Mendoza → San Rafael', status: 'En tránsito', progress: 74 },
];

const TOP_CENTERS = [
  { name: 'Centro Solidario Norte', city: 'Salta Capital', processed: 1420, categories: ['Alimentos', 'Medicamentos'] },
  { name: 'Red Comunitaria Oeste', city: 'Mendoza Capital', processed: 1160, categories: ['Ropa', 'Útiles escolares'] },
  { name: 'Nodo Esperanza Litoral', city: 'Corrientes Capital', processed: 980, categories: ['Alimentos', 'Ropa'] },
  { name: 'Puente Solidario Sur', city: 'Bahía Blanca', processed: 860, categories: ['Medicamentos', 'Alimentos'] },
];

const CITY_EXPLORER_DATA = {
  'Córdoba Capital': {
    received: 318, sent: 274, activeCenters: 9,
    frequentCategories: ['Alimentos', 'Útiles escolares', 'Ropa'],
    recent: ['98 kg de harina hacia Alta Gracia', '140 kits escolares recibidos', '52 cajas de medicamentos enviadas'],
  },
  'Rosario': {
    received: 286, sent: 241, activeCenters: 7,
    frequentCategories: ['Ropa', 'Alimentos', 'Medicamentos'],
    recent: ['220 prendas hacia Villa Gobernador Gálvez', '80 cajas de leche en polvo recibidas', '31 botiquines entregados'],
  },
  'San Miguel de Tucumán': {
    received: 248, sent: 203, activeCenters: 6,
    frequentCategories: ['Alimentos', 'Medicamentos', 'Ropa'],
    recent: ['95 cajas de medicamentos hacia Tafí Viejo', '160 kg de arroz recibidos', '73 frazadas enviadas'],
  },
  'Mar del Plata': {
    received: 193, sent: 177, activeCenters: 5,
    frequentCategories: ['Ropa', 'Útiles escolares', 'Alimentos'],
    recent: ['180 kits escolares enviados', '67 kg de alimentos recibidos', '210 prendas clasificadas'],
  },
  'Neuquén Capital': {
    received: 164, sent: 149, activeCenters: 4,
    frequentCategories: ['Medicamentos', 'Alimentos', 'Ropa'],
    recent: ['24 cajas de insumos médicos entregadas', '120 kg de alimentos enviados', '45 camperas recibidas'],
  },
};

const TRUST_POINTS = [
  { title: 'Registro inamovible', text: 'Cada movimiento queda guardado de forma permanente, como una huella digital que nadie puede borrar.', icon: Fingerprint },
  { title: 'Visibilidad pública', text: 'Cualquier persona puede ver el recorrido de la ayuda sin pedir permisos especiales.', icon: Eye },
  { title: 'Actualización constante', text: 'Los estados se muestran en tiempo real para saber dónde está cada donación.', icon: Clock3 },
  { title: 'Sin pasos ocultos', text: 'El proceso es claro de principio a fin, sin intermediarios que tapen información.', icon: ShieldCheck },
];

/* ── HERO SLIDER ──────────────────────────────────────────────────── */

function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);

  const go = (idx) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent((idx + HERO_SLIDES.length) % HERO_SLIDES.length);
      setAnimating(false);
    }, 320);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => go(current + 1), 5500);
    return () => clearInterval(timerRef.current);
  }, [current, animating]);

  const slide = HERO_SLIDES[current];

  return (
    <section
      id="inicio"
      style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
      className="relative min-h-screen flex flex-col"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-[#1B2631]" />
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 70% 50%, ${slide.accent}22 0%, transparent 70%)`,
        }}
      />
      {/* Subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '200px' }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 lg:px-16 pt-7">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E34E26] to-[#2E4053] flex items-center justify-center">
            <HandHeart size={15} className="text-white" />
          </div>
          <span className="text-white font-semibold tracking-wide text-sm">Acción del Sur</span>
        </div>
        <div className="hidden md:flex gap-7 text-sm text-white/60">
          {['#como-funciona', '#impacto', '#progreso', '#localidad'].map((href, i) => (
            <a key={href} href={href} className="hover:text-white transition-colors">
              {['Cómo funciona', 'Impacto', 'Donaciones', 'Tu ciudad'][i]}
            </a>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-10 lg:px-16">
        <div className="max-w-4xl w-full">
          <div
            className="transition-all duration-300"
            style={{ opacity: animating ? 0 : 1, transform: animating ? 'translateY(12px)' : 'translateY(0)' }}
          >
            <span
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase mb-6 px-3 py-1.5 rounded-full border"
              style={{ color: slide.accent, borderColor: `${slide.accent}44`, background: `${slide.accent}11` }}
            >
              <BadgeCheck size={13} /> {slide.tag}
            </span>

            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold text-white leading-[1.0] tracking-tight whitespace-pre-line">
              {slide.title}
            </h1>
            <p
              className="text-xl sm:text-2xl font-light mt-2"
              style={{ color: slide.accent }}
            >
              {slide.subtitle}
            </p>
            <p className="text-white/60 text-lg mt-6 max-w-xl leading-relaxed">
              {slide.body}
            </p>

            <div className="flex flex-wrap gap-3 mt-9">
              <a
                href="#progreso"
                className="inline-flex items-center gap-2 text-[#1B2631] font-semibold px-6 py-3 rounded-xl text-sm transition-all hover:brightness-90"
                style={{ background: slide.accent }}
              >
                Explorar donaciones <ArrowRight size={15} />
              </a>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 text-white/80 border border-white/20 px-6 py-3 rounded-xl text-sm hover:bg-white/5 transition-all"
              >
                ¿Cómo funciona?
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Slider controls */}
      <div className="relative z-10 flex items-center gap-4 px-6 sm:px-10 lg:px-16 pb-10">
        <button
          onClick={() => go(current - 1)}
          className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white/50 transition-all"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex gap-2">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className="transition-all duration-300 rounded-full h-1.5"
              style={{
                width: i === current ? 28 : 8,
                background: i === current ? slide.accent : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => go(current + 1)}
          className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white/50 transition-all"
        >
          <ChevronRight size={16} />
        </button>

        {/* Slide counter */}
        <span className="ml-auto text-white/30 text-xs tabular-nums">
          {String(current + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  );
}

/* ── SMALL COMPONENTS ─────────────────────────────────────────────── */

const STATUS_STYLES = {
  'En tránsito': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: '#E34E26' },
  'En verificación': { bg: 'bg-amber-50', text: 'text-amber-700', dot: '#2E4053' },
  'Entregada': { bg: 'bg-sky-50', text: 'text-sky-700', dot: '#1B2631' },
};

function ProgressCard({ donation }) {
  const st = STATUS_STYLES[donation.status] || { bg: 'bg-slate-50', text: 'text-slate-700', dot: '#D5DBDB' };
  return (
    <article className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-stone-400 font-mono">{donation.id}</p>
          <h3 className="text-base font-semibold text-stone-800 mt-0.5">{donation.type}</h3>
          <p className="text-sm text-stone-500 mt-0.5">{donation.quantity}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${st.bg} ${st.text}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
          {donation.status}
        </span>
      </div>
      <p className="text-sm text-stone-500 mt-4 flex items-center gap-1.5">
        <MapPin size={12} className="shrink-0" /> {donation.route}
      </p>
      <div className="mt-3 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${donation.progress}%`,
            background: donation.progress === 100
              ? 'linear-gradient(90deg,#2E4053,#1B2631)'
              : 'linear-gradient(90deg,#E34E26,#2E4053)',
          }}
        />
      </div>
      <p className="text-xs text-stone-400 mt-2">{donation.progress}% completado</p>
    </article>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-bold tracking-[0.2em] uppercase text-stone-400 mb-3">{children}</p>
  );
}

/* ── MAIN ─────────────────────────────────────────────────────────── */

export default function AccionDelSur() {
  const cities = Object.keys(CITY_EXPLORER_DATA);
  const [selectedCity, setSelectedCity] = useState(cities[0]);
  const cityData = CITY_EXPLORER_DATA[selectedCity];

  const centerChartData = useMemo(
    () => TOP_CENTERS.map((c) => ({ name: c.name.split(' ').slice(-1)[0], donaciones: c.processed })),
    []
  );

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }} className="bg-stone-50 text-stone-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap');
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
      `}</style>

      <HeroSlider />

      {/* ── Live ticker strip ──────────────────────────────────────── */}
      <div className="bg-[#1B2631] border-y border-white/5 overflow-hidden py-3">
        <div className="flex gap-12 animate-[marquee_18s_linear_infinite] whitespace-nowrap w-max">
          {[...Array(3)].flatMap(() =>
            ['12.480 donaciones registradas', '94 centros activos', '38.200 beneficiarios', '524.000 kg entregados', 'Transparencia total garantizada']
              .map((t, i) => (
                <span key={`${t}-${i}`} className="text-xs text-white/40 font-medium tracking-wider uppercase flex items-center gap-3">
                  <span className="w-1 h-1 rounded-full bg-[#E34E26] inline-block" />
                  {t}
                </span>
              ))
          )}
        </div>
      </div>
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }
      `}</style>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-28">

        {/* ── Cómo funciona ─────────────────────────────────────── */}
        <section id="como-funciona">
          <SectionLabel>El proceso</SectionLabel>
          <h2 className="text-4xl font-bold text-stone-800 max-w-xl leading-tight">¿Cómo funciona una donación?</h2>
          <p className="text-stone-500 mt-3 max-w-lg">Un recorrido simple, de principio a fin, visible para cualquier persona.</p>

          <div className="grid md:grid-cols-4 gap-0 mt-12 relative">
            {/* connector line */}
            <div className="hidden md:block absolute top-9 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent" />
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex flex-col items-center text-center px-4 relative">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-white border border-stone-200 shadow-sm flex items-center justify-center text-[#E34E26] mb-4 z-10 relative">
                      <Icon size={24} />
                    </div>
                    <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#1B2631] text-white text-[10px] font-bold flex items-center justify-center z-20">{i + 1}</span>
                  </div>
                  <h3 className="font-semibold text-stone-800 text-sm">{step.title}</h3>
                  <p className="text-stone-500 text-xs mt-2 leading-relaxed">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Impacto ───────────────────────────────────────────── */}
        <section id="impacto">
          <SectionLabel>Impacto global</SectionLabel>
          <h2 className="text-4xl font-bold text-stone-800">La ayuda en números</h2>
          <p className="text-stone-500 mt-3 max-w-lg">Una mirada general de todo lo que ya está en movimiento.</p>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {SUMMARY_STATS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <div className="w-9 h-9 rounded-xl bg-[#1B2631] flex items-center justify-center mb-4">
                    <Icon size={16} className="text-[#E34E26]" />
                  </div>
                  <p className="text-2xl font-bold text-stone-800">{s.value}</p>
                  <p className="text-xs text-stone-500 mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 mt-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <p className="text-sm font-semibold text-stone-700 mb-4">Centros con mayor actividad</p>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={centerChartData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#2E4053' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#2E4053' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                    cursor={{ fill: '#F4F6F7' }}
                  />
                  <Bar dataKey="donaciones" fill="#E34E26" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <p className="text-sm font-semibold text-stone-700 mb-4">Desglose por categoría</p>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={CATEGORY_BREAKDOWN} dataKey="value" nameKey="name" outerRadius={58} innerRadius={34} paddingAngle={3}>
                    {CATEGORY_BREAKDOWN.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-2">
                {CATEGORY_BREAKDOWN.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-stone-600">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                      {item.name}
                    </div>
                    <span className="text-xs font-semibold text-stone-700">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Donaciones en progreso ────────────────────────────── */}
        <section id="progreso">
          <SectionLabel>En movimiento</SectionLabel>
          <h2 className="text-4xl font-bold text-stone-800">Donaciones en progreso</h2>
          <p className="text-stone-500 mt-3">Seguí en tiempo real qué está en camino y qué ya fue entregado.</p>
          <div className="grid md:grid-cols-2 gap-4 mt-10">
            {IN_PROGRESS_DONATIONS.map((d) => <ProgressCard key={d.id} donation={d} />)}
          </div>
        </section>

        {/* ── Centros ───────────────────────────────────────────── */}
        <section id="centros">
          <SectionLabel>Red de centros</SectionLabel>
          <h2 className="text-4xl font-bold text-stone-800">Centros más activos</h2>
          <p className="text-stone-500 mt-3">Estos centros hoy están entre los que más ayuda mueven en el sistema.</p>
          <div className="grid md:grid-cols-2 gap-4 mt-10">
            {TOP_CENTERS.map((center, i) => (
              <article key={center.name} className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex gap-4">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 text-sm font-bold">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-stone-800 truncate">{center.name}</h3>
                  <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5"><MapPin size={10} />{center.city}</p>
                  <p className="text-sm text-stone-600 mt-2">
                    <span className="font-semibold text-stone-800">{center.processed.toLocaleString()}</span> donaciones procesadas
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {center.categories.map((c) => (
                      <span key={c} className="text-[11px] bg-[#F4F6F7] text-[#1B2631] px-2 py-0.5 rounded-full font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Explorador por ciudad ─────────────────────────────── */}
        <section id="localidad" className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
            <div>
              <SectionLabel>Explorador</SectionLabel>
              <h2 className="text-4xl font-bold text-stone-800">¿Qué pasa en tu ciudad?</h2>
              <p className="text-stone-500 mt-2 max-w-md">Elegí una localidad y mirá el movimiento de donaciones en esa zona.</p>
            </div>
            <div className="w-full lg:w-72">
              <label className="block text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Seleccionar localidad</label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#E34E26]/30 appearance-none"
              >
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Recibidas', value: cityData.received },
              { label: 'Enviadas', value: cityData.sent },
              { label: 'Centros activos', value: cityData.activeCenters },
            ].map((m) => (
              <div key={m.label} className="bg-stone-50 border border-stone-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-stone-800">{m.value}</p>
                <p className="text-xs text-stone-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Categorías frecuentes</p>
              <div className="flex flex-wrap gap-2">
                {cityData.frequentCategories.map((c) => (
                  <span key={c} className="text-sm bg-[#F4F6F7] text-[#1B2631] px-3 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            </div>
            <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Donaciones recientes</p>
              <ul className="space-y-2">
                {cityData.recent.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-stone-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#E34E26] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Trust / Por qué confiar ───────────────────────────── */}
        <section id="confianza" className="bg-[#1B2631] rounded-3xl p-8 sm:p-12 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#E34E26] opacity-[0.04] blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2" />
          <SectionLabel><span className="text-white/40">Transparencia</span></SectionLabel>
          <h2 className="text-4xl font-bold text-white max-w-xl leading-tight">
            ¿Por qué confiar en este sistema?
          </h2>
          <p className="text-white/50 mt-3 max-w-lg">
            La trazabilidad es la forma de ver con claridad por dónde pasó cada ayuda y confirmar que llegó a destino.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {TRUST_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.title} className="border border-white/10 rounded-2xl p-5 hover:border-white/20 hover:bg-white/5 transition-all duration-300">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    <Icon size={16} className="text-[#E34E26]" />
                  </div>
                  <h3 className="font-semibold text-sm text-white">{point.title}</h3>
                  <p className="text-xs text-white/50 mt-2 leading-relaxed">{point.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B2631] flex items-center justify-center">
              <HandHeart size={14} className="text-[#E34E26]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">Acción del Sur</p>
              <p className="text-xs text-stone-400">Trazabilidad Solidaria</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-5 text-xs text-stone-400">
            {[['#inicio', 'Inicio'], ['#impacto', 'Impacto'], ['#localidad', 'Tu ciudad'], ['#confianza', 'Transparencia'], ['#', 'Instagram'], ['#', 'LinkedIn']].map(([href, label]) => (
              <a key={label} href={href} className="hover:text-stone-700 transition-colors">{label}</a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}