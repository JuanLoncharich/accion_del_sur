import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  HandHeart, PackageOpen, Truck, Home, BadgeCheck,
  Building2, MapPin, ShieldCheck, Eye, Clock3, Fingerprint,
  ArrowRight, ChevronLeft, ChevronRight, Link2, Users, Package,
  TrendingUp, Send, Activity, ChevronDown,
} from 'lucide-react';
import {
  getLandingSummary,
  getLandingCentersRanking,
  getLandingRecentMovements,
} from '../services/landingService';

/* ── DATA ─────────────────────────────────────────────────────────── */

const HERO_TEMPLATES = [
  {
    tag: () => 'Transparencia que se puede ver',
    title: 'Acción del Sur',
    subtitle: 'Trazabilidad Solidaria',
    body: 'Cada donación deja un rastro claro desde el origen hasta quien la recibe. Nada se pierde, nada se borra.',
    accent: '#E34E26',
    image: '/assets/images/image1.png',
  },
  {
    tag: (summary) => summary ? `Más de ${Number(summary.totalDonations || 0).toLocaleString('es-AR')} donaciones registradas` : 'Donaciones registradas en tiempo real',
    title: 'La ayuda que \nllega de verdad',
    subtitle: 'Verificada y visible',
    body: 'Seguí cada movimiento en tiempo real. El sistema registra de forma permanente cada paso, sin intermediarios ocultos.',
    accent: '#2E4053',
    image: '/assets/images/image2.png',
  },
  {
    tag: (summary) => summary ? `${Number(summary.activeCenters || 0).toLocaleString('es-AR')} centros activos en la red` : 'Centros activos en la red',
    title: 'Una red que \ncrece junta',
    subtitle: 'De norte a sur',
    body: 'Centros de donación, comunidades y familias conectados en un mismo sistema que garantiza que la ayuda llegue a destino.',
    accent: '#D5DBDB',
    image: '/assets/images/image3.png',

  },
];

const FLOW_STEPS = [
  { title: 'Una persona dona', description: 'La donación se carga con datos simples: qué es, cuánta cantidad y desde dónde sale.', icon: HandHeart },
  { title: 'Se prepara y clasifica', description: 'El centro revisa y ordena la ayuda para que llegue en buen estado al lugar correcto.', icon: PackageOpen },
  { title: 'Viaja a su destino', description: 'Durante el recorrido se actualiza el estado para que cualquier persona pueda seguirlo.', icon: Truck },
  { title: 'Llega y se confirma', description: 'La entrega se marca como completada y queda guardada para siempre como una huella digital.', icon: Home },
];

const buildHeroSlides = (summary) => HERO_TEMPLATES.map((slide) => ({
  ...slide,
  tag: slide.tag(summary),
}));

const TRUST_POINTS = [
  { title: 'Registro inamovible', text: 'Cada movimiento queda guardado de forma permanente, como una huella digital que nadie puede borrar.', icon: Fingerprint },
  { title: 'Visibilidad pública', text: 'Cualquier persona puede ver el recorrido de la ayuda sin pedir permisos especiales.', icon: Eye },
  { title: 'Actualización constante', text: 'Los estados se muestran en tiempo real para saber dónde está cada donación.', icon: Clock3 },
  { title: 'Sin pasos ocultos', text: 'El proceso es claro de principio a fin, sin intermediarios que tapen información.', icon: ShieldCheck },
];

/* ── HERO SLIDER ──────────────────────────────────────────────────── */

function HeroSlider({ slides }) {
  const accentColor = '#E34E26';
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [brokenImages, setBrokenImages] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    if (current >= slides.length) setCurrent(0);
  }, [slides.length, current]);

  const go = (idx) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent((idx + slides.length) % slides.length);
      setAnimating(false);
    }, 320);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => go(current + 1), 5500);
    return () => clearInterval(timerRef.current);
  }, [current, animating]);

  const slide = slides[current];
  const canShowSlideImage = slide.image && !brokenImages[slide.image];

  useEffect(() => {
    if (!slide.image) return;
    const img = new Image();
    img.onload = () => setBrokenImages((prev) => ({ ...prev, [slide.image]: false }));
    img.onerror = () => setBrokenImages((prev) => ({ ...prev, [slide.image]: true }));
    img.src = slide.image;
  }, [slide.image]);

  return (
    <section
      id="inicio"
      className="relative min-h-screen flex flex-col"
    >
      {/* Background layers */}
      {!canShowSlideImage && <div className="absolute inset-0 bg-[#1B2631]" />}
      <div
        className="absolute inset-0 bg-center bg-cover transition-opacity duration-700"
        style={{
          backgroundImage: canShowSlideImage ? `url(${slide.image})` : 'none',
          opacity: canShowSlideImage ? 1 : 0,
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 lg:px-16 pt-7">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E34E26] to-[#2E4053] flex items-center justify-center">
            <HandHeart size={15} className="text-white" />
          </div>
          <span className="text-white font-semibold tracking-wide text-lg">Acción del Sur</span>
        </div>
        <div className="hidden md:flex items-center gap-7 text-lg text-white">
          {['#impacto', '#como-funciona'].map((href, i) => (
            <a key={href} href={href} className="hover:text-white transition-colors">
              {['Impacto', 'Cómo funciona'][i]}
            </a>
          ))}
          <Link
            to="/login"
            className="inline-flex items-center rounded-xl px-5 py-2.5 text-white font-extrabold border-2 border-white/70 hover:bg-white/10 transition-all"
          >
            Iniciar sesión
          </Link>
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
              className="inline-flex items-center gap-2 text-base font-bold tracking-widest uppercase mb-6 px-3.5 py-2 rounded-full border text-white"
              style={{ borderColor: `${accentColor}AA`, background: accentColor }}
            >
              <BadgeCheck size={13} /> {slide.tag}
            </span>

            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold text-white leading-[1.0] tracking-tight whitespace-pre-line">
              {slide.title}
            </h1>
            <p
              className="inline-block text-2xl sm:text-3xl font-extrabold mt-3 px-3 py-1 rounded-md text-white"
              style={{ background: accentColor }}
            >
              {slide.subtitle}
            </p>
            <p className="text-2xl mt-6 max-w-2xl leading-relaxed text-white font-bold">
              {slide.body}
            </p>

            <div className="flex flex-wrap gap-3 mt-9">
              <a
                href="#impacto"
                className="inline-flex items-center gap-2 text-white font-extrabold px-6 py-3.5 rounded-xl text-lg border-2 border-white/40 transition-all hover:brightness-90"
                style={{ background: accentColor }}
              >
                Explorar donaciones <ArrowRight size={15} />
              </a>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-white font-extrabold border-2 border-white/70 px-6 py-3.5 rounded-xl text-lg hover:bg-white/10 transition-all"
              >
                Iniciar sesión
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 text-white font-extrabold border-2 border-white/70 px-6 py-3.5 rounded-xl text-lg hover:bg-white/5 transition-all"
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
          className="w-9 h-9 rounded-full border-2 border-white/60 flex items-center justify-center text-white/80 hover:text-white hover:border-white transition-all"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className="transition-all duration-300 rounded-full h-1.5"
              style={{
                width: i === current ? 28 : 8,
                background: i === current ? accentColor : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => go(current + 1)}
          className="w-9 h-9 rounded-full border-2 border-white/60 flex items-center justify-center text-white/80 hover:text-white hover:border-white transition-all"
        >
          <ChevronRight size={16} />
        </button>

        {/* Slide counter */}
        <span className="ml-auto text-white/40 text-base tabular-nums">
          {String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
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
          <p className="text-sm text-stone-400 font-mono">{donation.id}</p>
          <h3 className="text-lg font-semibold text-stone-800 mt-0.5">{donation.type}</h3>
          <p className="text-base text-stone-500 mt-0.5">{donation.quantity}</p>
        </div>
        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${st.bg} ${st.text}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
          {donation.status}
        </span>
      </div>
      <p className="text-base text-stone-500 mt-4 flex items-center gap-1.5">
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
      <p className="text-sm text-stone-400 mt-2">{donation.progress}% completado</p>
    </article>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-base font-bold tracking-[0.2em] uppercase text-stone-400 mb-3">{children}</p>
  );
}

/* ── DONATION JOURNEY ─────────────────────────────────────────────── */

function DonationJourney() {
  const sectionRef = useRef(null);
  const [visibleSteps, setVisibleSteps] = useState(new Set());

  useEffect(() => {
    const cards = sectionRef.current?.querySelectorAll('[data-step]');
    if (!cards) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSteps((prev) => new Set([...prev, entry.target.dataset.step]));
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const stepNums = ['01', '02', '03', '04'];

  return (
    <section id="como-funciona" ref={sectionRef} className="relative overflow-hidden">
      {/* Subtle dot-grid background texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #1B2631 0.7px, transparent 0.7px)',
          backgroundSize: '26px 26px',
          opacity: 0.025,
        }}
      />

      <div className="relative z-10">
        <SectionLabel>El proceso</SectionLabel>
        <h2 className="text-4xl sm:text-5xl font-bold text-[#E34E26] max-w-xl leading-tight">
          ¿Cómo funciona una donación?
        </h2>
        <p className="text-xl text-[#2E4053]/60 mt-3 max-w-xl font-bold">
          Un recorrido simple, de principio a fin, visible para cualquier persona.
        </p>

        {/* ═══ DESKTOP: Alternating Winding Timeline ═══ */}
        <div className="hidden md:block mt-20 relative">
          {/* Decorative winding SVG path */}
          <svg
            className="absolute left-0 top-0 w-full h-full pointer-events-none"
            viewBox="0 0 200 1000"
            preserveAspectRatio="none"
            style={{ opacity: 0.05 }}
          >
            <path
              d="M100 0 C50 125,150 125,100 250 C50 375,150 375,100 500 C50 625,150 625,100 750 C50 875,150 875,100 1000"
              stroke="#E34E26"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="8 6"
            />
          </svg>

          {/* Central vertical gradient line */}
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2">
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[2px] h-full"
              style={{
                background: 'linear-gradient(180deg, #E34E26 0%, #2E4053 45%, #1B2631 100%)',
                maskImage: 'linear-gradient(180deg, transparent, black 2%, black 98%, transparent)',
                WebkitMaskImage: 'linear-gradient(180deg, transparent, black 2%, black 98%, transparent)',
              }}
            />
            {/* Animated traveling dots */}
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="journey-dot absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#E34E26]"
                style={{ boxShadow: '0 0 12px 3px rgba(227,78,38,0.5)' }}
              />
              <div
                className="journey-dot-delayed absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#E34E26]/60"
                style={{ boxShadow: '0 0 8px 2px rgba(227,78,38,0.3)' }}
              />
            </div>
          </div>

          {/* Start marker */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 flex flex-col items-center z-20">
            <div className="w-5 h-5 rounded-full bg-[#E34E26] border-[3px] border-[#F4F6F7] shadow-md" />
            <span className="mt-2 text-xs font-extrabold tracking-[0.3em] text-[#E34E26] uppercase">Inicio</span>
          </div>

          {/* Steps */}
          <div className="space-y-16 pt-14 pb-16">
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isLeft = i % 2 === 0;
              const isVis = visibleSteps.has(String(i));
              const delay = `${i * 120}ms`;

              const cardContent = (align) => (
                <div
                  className={`${align === 'right' ? 'pr-6' : 'pl-6'} transition-all duration-700 ease-out`}
                  style={{
                    transitionDelay: delay,
                    opacity: isVis ? 1 : 0,
                    transform: isVis ? 'translateX(0)' : `translateX(${align === 'right' ? '-50px' : '50px'})`,
                  }}
                >
                  <div className={`relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[#D5DBDB]/60 shadow-sm ${align === 'right' ? 'ml-auto' : ''} max-w-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden`}>
                    {/* Giant background numeral */}
                    <span
                      className={`absolute -top-5 ${align === 'right' ? 'right-3' : 'left-3'} text-[100px] font-black leading-none select-none pointer-events-none`}
                      style={{ color: 'rgba(227,78,38,0.16)' }}
                    >
                      {stepNums[i]}
                    </span>
                    {/* Accent bar toward center */}
                    <div
                      className={`absolute top-4 ${align === 'right' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'} w-1 h-12 bg-gradient-to-b from-[#E34E26] to-[#E34E26]/10`}
                    />
                    <div className="relative z-10">
                      <span className="inline-block text-sm font-extrabold tracking-[0.25em] text-[#E34E26] uppercase mb-2">
                        Paso {i + 1}
                      </span>
                      <h3 className="text-2xl font-bold text-[#1B2631] group-hover:text-[#E34E26] transition-colors duration-300">
                        {step.title}
                      </h3>
                      <p className="text-[#2E4053]/60 mt-2 leading-relaxed text-lg font-bold">
                        {step.description}
                      </p>
                    </div>
                    {/* Connector arm toward center */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-[2px] w-6 ${align === 'right' ? '-right-6' : '-left-6'}`}
                      style={{
                        background: align === 'right'
                          ? 'linear-gradient(90deg, transparent, #D5DBDB)'
                          : 'linear-gradient(270deg, transparent, #D5DBDB)',
                      }}
                    />
                  </div>
                </div>
              );

              return (
                <div key={step.title} data-step={i} className="grid grid-cols-[1fr_72px_1fr] items-center">
                  {isLeft ? cardContent('right') : <div />}

                  {/* Center diamond node */}
                  <div className="flex justify-center relative z-10">
                    <div
                      className="transition-all duration-500"
                      style={{ transitionDelay: delay, opacity: isVis ? 1 : 0, transform: isVis ? 'scale(1) rotate(45deg)' : 'scale(0.4) rotate(45deg)' }}
                    >
                      <div className="w-14 h-14 rounded-xl bg-[#1B2631] flex items-center justify-center shadow-xl relative overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(27,38,49,0.3)' }}>
                        <div className="absolute inset-0 bg-gradient-to-br from-[#E34E26]/25 to-transparent" />
                        <Icon size={22} className="text-[#E34E26] -rotate-45 relative z-10" />
                      </div>
                    </div>
                    {/* Pulse ring */}
                    {isVis && (
                      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
                        <div className="w-14 h-14 rounded-xl rotate-45 border-2 border-[#E34E26]/20 animate-ping" style={{ animationDuration: '3s' }} />
                      </div>
                    )}
                  </div>

                  {!isLeft ? cardContent('left') : <div />}
                </div>
              );
            })}
          </div>

          {/* End marker */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 flex flex-col items-center z-20">
            <div className="w-8 h-8 rounded-full bg-[#1B2631] flex items-center justify-center border-[3px] border-[#F4F6F7] shadow-md">
              <BadgeCheck size={14} className="text-[#E34E26]" />
            </div>
            <span className="mt-2 text-xs font-extrabold tracking-[0.3em] text-[#1B2631]/60 uppercase">Confirmado</span>
          </div>
        </div>

        {/* ═══ MOBILE: Vertical Journey ═══ */}
        <div className="md:hidden mt-12 relative pl-16">
          {/* Left vertical path */}
          <div className="absolute left-[22px] top-2 bottom-2 w-[2px]" style={{
            background: 'linear-gradient(180deg, #E34E26, #2E4053, #1B2631)',
          }} />
          {/* Mobile traveling dot */}
          <div
            className="absolute left-[16px] journey-dot w-3 h-3 rounded-full bg-[#E34E26]"
            style={{ boxShadow: '0 0 10px rgba(227,78,38,0.5)' }}
          />

          <div className="space-y-8">
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative" data-step={i}>
                  {/* Node on the line */}
                  <div className="absolute -left-16 top-1 w-11 h-11 rounded-lg bg-[#1B2631] flex items-center justify-center shadow-lg rotate-45">
                    <Icon size={18} className="text-[#E34E26] -rotate-45" />
                  </div>
                  {/* Horizontal connector */}
                  <div className="absolute -left-5 top-5 w-5 h-[2px] bg-gradient-to-r from-[#D5DBDB] to-transparent" />
                  {/* Card */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-[#D5DBDB]/60 shadow-sm relative overflow-hidden">
                    <span
                      className="absolute -top-3 right-2 text-[80px] font-black leading-none select-none pointer-events-none"
                      style={{ color: 'rgba(227,78,38,0.16)' }}
                    >
                      {stepNums[i]}
                    </span>
                    <span className="relative z-10 inline-block text-sm font-extrabold tracking-[0.25em] text-[#E34E26] uppercase mb-1">
                      Paso {i + 1}
                    </span>
                    <h3 className="text-xl font-bold text-[#1B2631] relative z-10">{step.title}</h3>
                    <p className="text-[#2E4053]/60 mt-2 text-lg leading-relaxed relative z-10 font-bold">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Animated Counter Hook ──────────────────────────────────────── */
function useCountUp(target, isVisible, duration = 1800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isVisible) { setCount(0); return; }
    let start = 0;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      start = Math.round(ease * target);
      setCount(start);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [isVisible, target, duration]);
  return count;
}

/* ── CATEGORY ICONS (inline SVGs for editorial feel) ───────────── */
const CATEGORY_ICONS = {
  'Alimentos': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/>
    </svg>
  ),
  'Ropa': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M16 3h5v5M8 3H3v5M21 8l-5 3v10H8V11L3 8"/>
    </svg>
  ),
  'Medicamentos': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  'Útiles escolares': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
};

function ImpactStory({ categoryBreakdown, topCenters, loading }) {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const maxProcessed = topCenters.length > 0 ? topCenters[0].processed || 1 : 1;
  const totalMovements = topCenters.reduce((s, c) => s + (c.processed || 0), 0);
  const totalCategoryQuantity = categoryBreakdown.reduce((s, c) => s + (c.quantity || 0), 0);

  const animatedTotal = useCountUp(totalMovements, isVisible, 2200);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="impacto" ref={sectionRef} className="relative overflow-hidden">
      {/* ─── Hero heading block ─── */}
      <div className="relative rounded-t-[2rem] bg-[#1B2631] px-6 py-14 sm:px-10 sm:py-20 lg:px-16 lg:py-24 overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute top-0 left-0 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, #E34E26, transparent 70%)', transform: 'translate(-30%, -40%)' }} />
        <div className="pointer-events-none absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #B9A48E, transparent 70%)', transform: 'translate(30%, 40%)' }} />
        {/* Subtle grid texture */}
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 max-w-6xl">
          <p
            className="text-base font-bold tracking-[0.25em] uppercase text-[#E34E26] mb-5"
            style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)' }}
          >
            Impacto real · datos verificados
          </p>
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] max-w-4xl"
            style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s' }}
          >
            Cuando una red se mueve,{' '}
            <span className="text-[#E34E26]">los números cuentan historias reales.</span>
          </h2>
          <div
            className="mt-8 flex flex-wrap items-end gap-6 sm:gap-10"
            style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(16px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s' }}
          >
            <div>
              <p className="text-6xl sm:text-7xl lg:text-8xl font-black tabular-nums text-white leading-none tracking-tight">
                {animatedTotal.toLocaleString()}
              </p>
              <p className="mt-2 text-lg sm:text-xl text-white/50 font-medium">movimientos registrados en {topCenters.length} centros activos</p>
            </div>
            <div className="h-14 w-px bg-white/15 hidden sm:block" />
            <div className="hidden sm:block">
              <p className="text-2xl font-black text-[#E34E26]">{categoryBreakdown.length}</p>
              <p className="text-lg text-white/50 font-medium">categorías de ayuda</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Full-width category spectrum bar ─── */}
      <div className="relative bg-[#1B2631]">
        <div className="px-6 sm:px-10 lg:px-14 pb-1">
          <p
            className="text-sm font-bold uppercase tracking-[0.25em] text-white/40 mb-3"
            style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 0.5s 0.4s' }}
          >
            Distribución por tipo de ayuda
          </p>
        </div>
        <div className="relative h-20 sm:h-24 flex overflow-hidden">
          {categoryBreakdown.map((cat, idx) => {
            // Calculate font sizes based on percentage width
            const percentageFontSize = cat.value < 12 ? 'text-sm' : cat.value < 15 ? 'text-base' : 'text-lg sm:text-xl';
            const categoryFontSize = cat.value < 12 ? 'text-[8px]' : cat.value < 15 ? 'text-[9px]' : 'text-[10px] sm:text-xs';
            const gapSize = cat.value < 12 ? 'gap-0.5' : 'gap-1';

            return (
              <div
                key={cat.name}
                className="relative h-full flex flex-col items-center justify-center group cursor-default transition-all duration-1000 ease-out overflow-hidden px-0.5"
                style={{
                  width: isVisible ? `${cat.value}%` : '0%',
                  background: cat.color,
                  transitionDelay: `${400 + idx * 150}ms`,
                }}
              >
                {/* Floating label - stack vertically */}
                <div
                  className={`flex flex-col items-center justify-center text-white/90 select-none transition-all duration-700 ${gapSize}`}
                  style={{ opacity: isVisible ? 1 : 0, transitionDelay: `${800 + idx * 150}ms` }}
                >
                  <span className={`font-black tabular-nums leading-tight ${percentageFontSize}`}>{cat.value}%</span>
                  <span className={`font-bold uppercase tracking-tight leading-tight text-center w-full ${categoryFontSize}`}>
                    {cat.name}
                  </span>
                </div>

                {/* Tooltip on hover - always show category name on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 hidden sm:block">
                  <div className="bg-[#1B2631] text-white text-xs font-semibold px-2 py-1 rounded whitespace-nowrap">
                    {cat.name}: {cat.value}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Mobile category labels below the bar */}
        <div className="sm:hidden flex px-2 py-2 gap-1 bg-[#1B2631]">
          {categoryBreakdown.map((cat) => (
            <div key={cat.name} className="flex items-center gap-1 flex-1 justify-center">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
              <span className="text-xs text-white/60 font-medium truncate">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Main content: Centers + Category detail ─── */}
      <div className="rounded-b-[2rem] border border-t-0 border-[#1B2631]/8 bg-[#F7F1EA] relative overflow-hidden">
        {/* Warm radial accent */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(227,78,38,0.08), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(27,38,49,0.05), transparent 50%)' }} />

        <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          {/* ─── Centers ranked list ─── */}
          <div className="mb-14 lg:mb-16">
            <p
              className="text-base font-extrabold uppercase tracking-[0.25em] text-[#1B2631]/45 mb-6"
              style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.5s 0.5s' }}
            >
              Centros más activos - según movimientos registrados
            </p>

            <div className="space-y-4">
              {topCenters.map((center, i) => {
                const fill = (center.processed / maxProcessed) * 100;
                const delay = 600 + i * 140;
                return (
                  <CenterRankCard
                    key={center.name}
                    center={center}
                    rank={i + 1}
                    fill={fill}
                    isVisible={isVisible}
                    delay={delay}
                  />
                );
              })}
              {!loading && topCenters.length === 0 && (
                <p className="text-lg text-[#1B2631]/60">Sin datos de actividad de centros.</p>
              )}
            </div>
          </div>

          {/* ─── Category detail cards ─── */}
          <div>
            <p
              className="text-base font-extrabold uppercase tracking-[0.25em] text-[#1B2631]/45 mb-6"
              style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.5s 0.9s' }}
            >
              ¿Qué se dona?
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {categoryBreakdown.map((cat, i) => (
                <CategoryDetailCard
                  key={cat.name}
                  category={cat}
                  isVisible={isVisible}
                  delay={1000 + i * 130}
                  totalQuantity={totalCategoryQuantity}
                />
              ))}
            </div>
            {!loading && categoryBreakdown.length === 0 && (
              <p className="text-lg text-[#1B2631]/60">Sin categorias con datos reales disponibles.</p>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Center Rank Card ──────────────────────────────────────────── */
function CenterRankCard({ center, rank, fill, isVisible, delay }) {
  const animatedCount = useCountUp(center.processed, isVisible, 1600 + rank * 200);
  
  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-[#1B2631]/8 bg-white/80 backdrop-blur-sm shadow-[0_2px_16px_rgba(27,38,49,0.04)] hover:shadow-[0_8px_32px_rgba(27,38,49,0.1)] hover:-translate-y-0.5 transition-all duration-500"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
        transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {/* Giant rank number — decorative watermark */}
      <span
        className="pointer-events-none absolute -top-6 -left-2 select-none font-black leading-none text-[#1B2631] sm:-top-8"
        style={{ fontSize: 'clamp(6rem, 12vw, 10rem)', opacity: 0.03 }}
      >
        {rank}
      </span>

      {/* Progress fill bar — absolute behind content */}
      <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[#E34E26] to-[#E34E26]/60 transition-all duration-[1800ms] ease-out rounded-br-2xl"
        style={{ width: isVisible ? `${fill}%` : '0%', transitionDelay: `${delay + 300}ms` }}
      />

      <div className="relative z-10 flex items-center gap-4 px-5 py-5 sm:px-7 sm:py-6">
        {/* Rank badge */}
        <div className="shrink-0 w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-[#1B2631] flex items-center justify-center shadow-lg">
          <span className="text-lg sm:text-xl font-black text-[#E34E26]">#{rank}</span>
        </div>

        {/* Center info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-xl font-extrabold text-[#1B2631] leading-snug group-hover:text-[#E34E26] transition-colors duration-300 truncate">
            {center.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-lg font-medium text-[#1B2631]/50">
            <MapPin size={13} className="shrink-0 text-[#E34E26]/60" /> {center.locationLabel || 'Ubicacion no disponible'}
          </p>
        </div>

        {/* Donation count — the hero number */}
        <div className="shrink-0 text-right">
          <p className="text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums text-[#E34E26] leading-none tracking-tight">
            {animatedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-sm sm:text-base font-bold uppercase tracking-[0.2em] text-[#1B2631]/40">
            donaciones
          </p>
        </div>
      </div>
    </article>
  );
}

/* ── Category Detail Card ──────────────────────────────────────── */
function CategoryDetailCard({ category, isVisible, delay, totalQuantity }) {
  const estimatedCount = Math.round((category.value / 100) * totalQuantity);
  const animatedPercent = useCountUp(category.value, isVisible, 1400);
  const Icon = CATEGORY_ICONS[category.name] || <Package size={16} />;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-[#1B2631]/8 bg-white/70 backdrop-blur-sm p-5 sm:p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-500"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {/* Color accent strip at top */}
      <div className="absolute top-0 left-0 right-0 h-1 transition-all duration-1000" style={{ background: category.color, opacity: isVisible ? 1 : 0, transitionDelay: `${delay + 200}ms` }} />
      
      {/* Background percentage watermark */}
      <span className="pointer-events-none absolute -bottom-3 -right-1 select-none text-7xl sm:text-8xl font-black leading-none" style={{ color: category.color, opacity: 0.2 }}>
        {category.value}
      </span>

      <div className="relative z-10">
        {/* Icon + label */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${category.color}18` }}>
            <span style={{ color: category.color }}>{Icon}</span>
          </div>
          <p className="text-lg font-bold uppercase tracking-wider text-[#1B2631]/60">{category.name}</p>
        </div>

        {/* Big percentage */}
        <p className="text-4xl sm:text-5xl font-black tabular-nums leading-none" style={{ color: category.color }}>
          {animatedPercent}
          <span className="text-lg sm:text-xl font-bold ml-0.5" style={{ color: `${category.color}99` }}>%</span>
        </p>

        {/* Estimated count */}
        <p className="mt-2 text-base font-semibold text-[#1B2631]/40">
          ~{estimatedCount.toLocaleString()} unidades
        </p>

        {/* Mini fill bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-[#1B2631]/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-[1600ms] ease-out"
            style={{
              width: isVisible ? `${category.value}%` : '0%',
              background: category.color,
              transitionDelay: `${delay + 400}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── MAIN ─────────────────────────────────────────────────────────── */

export default function AccionDelSur() {
  const [loadingLanding, setLoadingLanding] = useState(true);
  const [landingError, setLandingError] = useState('');
  const [landingSummary, setLandingSummary] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [topCenters, setTopCenters] = useState([]);
  const [tickerFacts, setTickerFacts] = useState(['Datos publicos conectando con la base de datos']);

  useEffect(() => {
    let mounted = true;

    const loadLandingData = async () => {
      try {
        const [summaryPayload, centersPayload] = await Promise.all([
          getLandingSummary(),
          getLandingCentersRanking(),
          getLandingRecentMovements(),
        ]);

        if (!mounted) return;

        setLandingSummary(summaryPayload.summary || null);
        setCategoryBreakdown(
          (summaryPayload.categoryBreakdown || []).filter(
            (cat) => String(cat?.name || '').toLowerCase() !== 'medicamentos'
          )
        );
        setTickerFacts((summaryPayload.tickerFacts && summaryPayload.tickerFacts.length > 0)
          ? summaryPayload.tickerFacts
          : ['Datos publicos conectando con la base de datos']);
        setTopCenters(centersPayload.data || []);
      } catch (error) {
        if (!mounted) return;
        setLandingError('No se pudieron cargar los datos publicos del sistema.');
      } finally {
        if (mounted) setLoadingLanding(false);
      }
    };

    loadLandingData();
    return () => { mounted = false; };
  }, []);

  const slides = buildHeroSlides(landingSummary);

  return (
    <div className="bg-stone-50 text-stone-800">
      <style>{`
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        @keyframes journeyTravel {
          0% { top: -4%; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { top: 104%; opacity: 0; }
        }
        .journey-dot { animation: journeyTravel 4s ease-in-out infinite; }
        .journey-dot-delayed { animation: journeyTravel 4s ease-in-out infinite 2s; }

      `}</style>

      <HeroSlider slides={slides} />

      {landingError && (
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="max-w-7xl mx-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm sm:text-base">
            {landingError}
          </div>
        </div>
      )}


      {/* ── Live ticker strip ──────────────────────────────────────── */}
      <div className="bg-[#1B2631] border-y border-white/5 overflow-hidden py-3">
        <div className="flex gap-12 animate-[marquee_18s_linear_infinite] whitespace-nowrap w-max">
          {[...Array(3)].flatMap(() =>
            tickerFacts
              .map((t, i) => (
                <span key={`${t}-${i}`} className="text-base text-white font-bold tracking-wider uppercase flex items-center gap-3">
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

      {/* ── Impacto (full-width) ─────────────────────────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-20 py-20">
        <ImpactStory
          categoryBreakdown={categoryBreakdown}
          topCenters={topCenters}
          loading={loadingLanding}
        />
      </div>

      {/* ── Trust / Por qué confiar (full-width) ──────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-20 pb-20">
        <section id="confianza" className="bg-[#1B2631] rounded-3xl p-8 sm:p-12 lg:p-16 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#E34E26] opacity-[0.04] blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #B9A48E, transparent 70%)', transform: 'translate(-20%, 30%)' }} />
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          <div className="relative z-10">
            <SectionLabel><span className="text-white text-xl font-bold">Transparencia</span></SectionLabel>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white max-w-3xl leading-tight">
              ¿Por qué confiar en{' '}
              <span className="text-[#E34E26]">este sistema?</span>
            </h2>
            <p className="text-2xl text-white mt-5 max-w-2xl font-bold leading-relaxed">
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
                    <h3 className="text-xl font-extrabold text-[#E34E26]">{point.title}</h3>
                    <p className="text-xl text-white font-bold mt-2 leading-relaxed">{point.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-28">
        {/* ── Cómo funciona ─────────────────────────────────────── */}
        <DonationJourney />
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B2631] flex items-center justify-center">
              <HandHeart size={14} className="text-[#E34E26]" />
            </div>
            <div>
              <p className="text-lg font-semibold text-stone-800">Acción del Sur</p>
              <p className="text-base text-stone-400">Trazabilidad Solidaria</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-5 text-base text-stone-400">
            {[['#inicio', 'Inicio'], ['#impacto', 'Impacto'], ['#como-funciona', 'Proceso'], ['#confianza', 'Transparencia'], ['#', 'Instagram'], ['#', 'LinkedIn']].map(([href, label]) => (
              <a key={label} href={href} className="hover:text-stone-700 transition-colors">{label}</a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}