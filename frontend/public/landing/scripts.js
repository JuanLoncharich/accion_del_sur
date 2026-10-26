/* ============================================
   CGIC — Centro de Gestión Integral de Crisis
   v2 — Multi-page Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Preloader ──
  const preloader = document.querySelector('.preloader');
  let preloaderDismissed = false;

  const dismiss = (delay = 0) => {
    if (preloaderDismissed) return;
    preloaderDismissed = true;
    setTimeout(() => preloader?.classList.add('hidden'), delay);
  };

  // Mejora de percepción: ocultamos el preloader cuando el DOM ya es interactivo.
  requestAnimationFrame(() => dismiss(120));
  // Fallback por si el primer frame tarda.
  setTimeout(() => dismiss(250), 600);
  // Respaldo para navegadores/dispositivos lentos.
  window.addEventListener('load', () => dismiss(0), { once: true });

  // ── Navbar scroll ──
  const navbar = document.getElementById('navbar');
  // On sub-pages the navbar starts with .scrolled; on index it toggles
  const isIndex = !navbar?.classList.contains('scrolled');

  function handleScroll() {
    if (!navbar || !isIndex) return;
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ── Mobile menu ──
  const toggle  = document.getElementById('nav-toggle');
  const links   = document.getElementById('nav-links');
  const overlay = document.getElementById('mobile-overlay');

  function closeMenu() {
    toggle?.classList.remove('active');
    links?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  toggle?.addEventListener('click', () => {
    const open = links?.classList.toggle('active');
    toggle.classList.toggle('active', open);
    overlay?.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  overlay?.addEventListener('click', closeMenu);

  document.querySelectorAll('.navbar__link').forEach(a => {
    a.addEventListener('click', () => {
      if (links?.classList.contains('active')) closeMenu();
    });
  });

  // ── Smooth scroll (only for in-page anchors) ──
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        closeMenu();
        el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Scroll-reveal (IntersectionObserver) ──
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .stagger-children');

  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  revealEls.forEach(el => revealObs.observe(el));

  // ── Values interactive cards (index) ──
  const valueCards = document.querySelectorAll('#valores .value-card');
  if (valueCards.length) {
    valueCards.forEach(card => {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-expanded', 'false');

      const toggleCard = () => {
        const wasOpen = card.classList.contains('is-open');

        valueCards.forEach(other => {
          other.classList.remove('is-open');
          other.setAttribute('aria-expanded', 'false');
        });

        if (!wasOpen) {
          card.classList.add('is-open');
          card.setAttribute('aria-expanded', 'true');
        }
      };

      card.addEventListener('click', toggleCard);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCard();
        }
      });
    });
  }

  // ── Animated counters ──
  const counts = document.querySelectorAll('.count-up');

  function animate(el) {
    const raw    = el.dataset.target;
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const target = parseFloat(raw);
    const dur    = 1600;
    const start  = performance.now();

    (function step(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + Math.round(ease * target).toLocaleString('es-AR') + suffix;
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  const cntObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { animate(e.target); cntObs.unobserve(e.target); }
    });
  }, { threshold: 0.5 });

  counts.forEach(el => cntObs.observe(el));

  // ── Back to top ──
  const btt = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    btt?.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });

  btt?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // ── Prefetch de navegación interna ──
  const prefetchedUrls = new Set();

  function prefetchPage(url) {
    if (!url || prefetchedUrls.has(url)) return;

    const isSameOrigin = url.origin === window.location.origin;
    const isHtml = url.pathname.endsWith('.html') || url.pathname === '/' || /\/$/.test(url.pathname);
    if (!isSameOrigin || !isHtml || url.pathname === window.location.pathname) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = url.href;
    document.head.appendChild(link);
    prefetchedUrls.add(url.href);
  }

  document.querySelectorAll('a[href]').forEach(anchor => {
    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#')) return;

    let targetUrl;
    try {
      targetUrl = new URL(rawHref, window.location.href);
    } catch {
      return;
    }

    const prefetch = () => prefetchPage(targetUrl);
    anchor.addEventListener('mouseenter', prefetch, { passive: true, once: true });
    anchor.addEventListener('focus', prefetch, { passive: true, once: true });
    anchor.addEventListener('touchstart', prefetch, { passive: true, once: true });
  });

  // Carga anticipada suave de las páginas principales durante idle time.
  const navCandidates = ['index.html', 'proyectos.html', 'equipo.html', 'trayectoria.html'];
  const prefetchMainNav = () => {
    navCandidates.forEach(path => {
      prefetchPage(new URL(path, window.location.origin + window.location.pathname));
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchMainNav, { timeout: 2000 });
  } else {
    setTimeout(prefetchMainNav, 1200);
  }

  // ── WhatsApp floating button ──
  if (!document.querySelector('.whatsapp-float')) {
    const waBtn = document.createElement('a');
    waBtn.className = 'whatsapp-float';
    waBtn.href = 'https://wa.me/5492616327027';
    waBtn.target = '_blank';
    waBtn.rel = 'noopener';
    waBtn.setAttribute('aria-label', 'Abrir WhatsApp');
    waBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.48 0 .12 5.36.12 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 0 0 5.79 1.48h.01c6.58 0 11.94-5.36 11.94-11.94 0-3.19-1.24-6.19-3.49-8.42zm-8.46 18.32h-.01a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-3.72.97 1-3.62-.23-.37a9.9 9.9 0 0 1-1.52-5.27c0-5.47 4.45-9.92 9.92-9.92 2.65 0 5.14 1.03 7.01 2.91a9.86 9.86 0 0 1 2.9 7.01c0 5.47-4.45 9.92-9.92 9.92zm5.44-7.43c-.3-.15-1.78-.88-2.06-.98-.27-.1-.46-.15-.66.15-.19.3-.76.98-.93 1.18-.17.2-.34.22-.63.07-.3-.15-1.25-.46-2.38-1.46-.88-.78-1.47-1.74-1.64-2.04-.17-.3-.02-.46.12-.61.13-.13.3-.34.44-.51.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.52.08-.79.37-.27.3-1.03 1-1.03 2.45s1.05 2.85 1.19 3.05c.15.2 2.06 3.15 4.99 4.41.7.3 1.25.48 1.68.61.7.22 1.34.19 1.84.12.56-.08 1.78-.73 2.03-1.44.25-.71.25-1.32.17-1.44-.07-.12-.27-.2-.56-.34z"/>
      </svg>
    `;
    document.body.appendChild(waBtn);
  }

  // ── Hero parallax (index only) ──
  const mesh = document.querySelector('.hero__mesh');
  if (mesh) {
    window.addEventListener('mousemove', e => {
      const x = (e.clientX / innerWidth - .5) * 18;
      const y = (e.clientY / innerHeight - .5) * 18;
      mesh.style.transform = `translate(${x}px, ${y}px)`;
    }, { passive: true });
  }

  // ── Contact form → mailto ──
  const form = document.getElementById('contact-form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const subj = encodeURIComponent(`Contacto CGIC - ${d.type || 'General'}`);
    const body = encodeURIComponent(
      `Nombre: ${d.name}\nEmail: ${d.email}\nOrg: ${d.org || '-'}\nMotivo: ${d.type}\n\n${d.message}`
    );
    window.location.href = `mailto:cgic.argentina@gmail.com?subject=${subj}&body=${body}`;
  });

  // ── ESC closes mobile menu ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  // ── Hero Slider ──
  const slides  = document.querySelectorAll('.hero__slide');
  const dots    = document.querySelectorAll('.hero__slider-dot');
  const btnPrev = document.getElementById('slider-prev');
  const btnNext = document.getElementById('slider-next');

  if (slides.length > 1) {
    let current = 0;
    let timer   = null;
    const DELAY = 5000;

    function goTo(idx) {
      slides[current].classList.remove('hero__slide--active');
      dots[current]?.classList.remove('hero__slider-dot--active');
      current = (idx + slides.length) % slides.length;
      slides[current].classList.add('hero__slide--active');
      dots[current]?.classList.add('hero__slider-dot--active');
    }

    function start() {
      clearInterval(timer);
      timer = setInterval(() => goTo(current + 1), DELAY);
    }

    function pause() { clearInterval(timer); }

    btnNext?.addEventListener('click', () => { goTo(current + 1); start(); });
    btnPrev?.addEventListener('click', () => { goTo(current - 1); start(); });

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        goTo(Number(dot.dataset.index));
        start();
      });
    });

    // Pausa al hover sobre el slider
    const sliderEl = document.getElementById('hero-slider');
    const touchSurface = document.getElementById('hero') || sliderEl;
    sliderEl?.addEventListener('mouseenter', pause);
    sliderEl?.addEventListener('mouseleave', start);

    // Swipe táctil con bloqueo por eje para evitar arrastrar la página
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let touchAxis = null;

    touchSurface?.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
      touchAxis = null;
    }, { passive: true });

    touchSurface?.addEventListener('touchmove', e => {
      touchEndX = e.touches[0].clientX;
      touchEndY = e.touches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      // Define el eje del gesto cuando supera una distancia mínima
      if (!touchAxis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      // Si el gesto es horizontal, evitamos que la página se desplace
      if (touchAxis === 'x') {
        e.preventDefault();
      }
    }, { passive: false });

    touchSurface?.addEventListener('touchend', () => {
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const isHorizontalSwipe = touchAxis === 'x' && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy);

      if (isHorizontalSwipe) {
        goTo(dx < 0 ? current + 1 : current - 1);
        start();
      }

      touchAxis = null;
    }, { passive: true });

    start();
  }

  // ── Lightbox ──
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.querySelector('.lightbox__close');

  if (lightbox && lightboxImg) {
    document.querySelectorAll('.timeline__gallery img, .project-modal__images img').forEach(img => {
      img.addEventListener('click', () => {
        if (!img.src) return;
        lightbox.classList.add('show');
        lightboxImg.src = img.src;
      });
    });

    lightboxClose?.addEventListener('click', () => {
      lightbox.classList.remove('show');
      setTimeout(() => { lightboxImg.src = ''; }, 300); // clear after animation
    });

    lightbox.addEventListener('click', (e) => {
      if (e.target !== lightboxImg) {
        lightbox.classList.remove('show');
        setTimeout(() => { lightboxImg.src = ''; }, 300);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('show')) {
        lightbox.classList.remove('show');
        setTimeout(() => { lightboxImg.src = ''; }, 300);
      }
    });
  }

});

