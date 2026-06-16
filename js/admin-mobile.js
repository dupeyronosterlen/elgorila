(function (global) {
  'use strict';

  const MQ = global.matchMedia('(max-width: 900px)');
  let _taquillaMode = false;
  let _stickyCanje = null;

  function $(id) { return document.getElementById(id); }

  function isMobile() { return MQ.matches; }

  function closeSidebar() {
    $('sidebar')?.classList.remove('open');
    $('sidebar-backdrop')?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }

  function openSidebar() {
    if (!isMobile()) return;
    $('sidebar')?.classList.add('open');
    $('sidebar-backdrop')?.classList.add('open');
    document.body.classList.add('sidebar-open');
  }

  function toggleSidebar() {
    if ($('sidebar')?.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  function syncBottomNav(view) {
    document.querySelectorAll('.mob-nav-item[data-mob-nav]').forEach(el => {
      el.classList.toggle('active', el.dataset.mobNav === view);
    });
  }

  function mobNavGo(view) {
    closeSidebar();
    if (view === 'menu') {
      openSidebar();
      return;
    }
    const navEl = document.querySelector(`.nav-item[data-nav="${view}"]`);
    if (typeof global.navGo === 'function') {
      global.navGo(navEl, view);
    }
    syncBottomNav(view);
  }

  function configureBottomNav(usuario) {
    const bar = $('mobile-bottom-nav');
    if (!bar) return;

    _taquillaMode = !!(usuario?.viaEmail);
    bar.classList.remove('hidden');

    bar.querySelectorAll('.mob-nav-item').forEach(el => {
      const nav = el.dataset.mobNav;
      if (!nav) return;
      if (_taquillaMode) {
        el.classList.toggle('hidden', nav !== 'boletera' && nav !== 'verificar');
      } else if (nav === 'menu') {
        el.classList.remove('hidden');
      }
    });
  }

  function syncUserTopbar(usuario) {
    const mobileUser = $('topbar-user-mobile');
    const desktopUser = document.querySelector('.topbar-user:not(.topbar-user-mobile)');
    if (!mobileUser) return;
    if (isMobile()) {
      desktopUser?.classList.add('hidden');
      mobileUser.classList.remove('hidden');
      const u = $('usuario-actual-mobile');
      const r = $('rol-actual-mobile');
      if (u && usuario) {
        const label = usuario.viaEmail && (usuario.email || usuario.telefono)
          ? usuario.nombre || 'Taquilla'
          : (usuario.nombre || usuario.usuarioId || '—');
        u.textContent = label;
      }
      if (r) {
        r.textContent = usuario?.viaEmail ? 'TAQUILLA' : (usuario?.rol || 'admin').toUpperCase();
      }
    } else {
      mobileUser.classList.add('hidden');
      desktopUser?.classList.remove('hidden');
    }
  }

  function setupStickyCanje() {
    if (_stickyCanje) return;
    const btn = $('btn-marcar-usado');
    if (!btn) return;

    _stickyCanje = document.createElement('div');
    _stickyCanje.id = 'mob-sticky-canje';
    _stickyCanje.className = 'mob-sticky-canje hidden';
    const clone = btn.cloneNode(true);
    clone.id = 'btn-marcar-usado-sticky';
    clone.addEventListener('click', () => btn.click());
    _stickyCanje.appendChild(clone);
    document.body.appendChild(_stickyCanje);

    const obs = new MutationObserver(() => {
      if (!isMobile()) {
        _stickyCanje.classList.add('hidden');
        return;
      }
      const viewVer = $('view-verificar');
      const valido = $('resultado-valido');
      const show = viewVer && !viewVer.classList.contains('hidden')
        && valido && !valido.classList.contains('hidden')
        && !btn.classList.contains('hidden')
        && !btn.disabled;
      _stickyCanje.classList.toggle('hidden', !show);
    });
    obs.observe(btn, { attributes: true, attributeFilter: ['class', 'disabled', 'hidden'] });
    ['view-verificar', 'resultado-valido', 'resultado-verificacion'].forEach(id => {
      const el = $(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function bind() {
    $('btn-mobile-menu')?.addEventListener('click', toggleSidebar);
    $('sidebar-backdrop')?.addEventListener('click', closeSidebar);

    document.querySelectorAll('.mob-nav-item[data-mob-nav]').forEach(el => {
      el.addEventListener('click', () => mobNavGo(el.dataset.mobNav));
    });

    document.querySelectorAll('.sidebar .nav-item').forEach(el => {
      el.addEventListener('click', () => {
        if (isMobile()) closeSidebar();
      });
    });

    MQ.addEventListener('change', () => {
      if (!isMobile()) closeSidebar();
    });

    setupStickyCanje();
  }

  global.AdminMobile = {
    configure(usuario) {
      configureBottomNav(usuario);
      syncUserTopbar(usuario);
    },
    onNav(view) {
      syncBottomNav(view);
      if (view === 'verificar' || view === 'boletera') closeSidebar();
    },
    closeSidebar,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(window);
