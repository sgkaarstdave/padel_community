const MOBILE_BREAKPOINT = 1024;
const MOBILE_OVERLAY_BREAKPOINT = 1024;

const isMobileNavigationViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

const isSmallMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${MOBILE_OVERLAY_BREAKPOINT}px)`).matches;
  }
  return window.innerWidth <= MOBILE_OVERLAY_BREAKPOINT;
};

const setupSidebarNavigationToggle = () => {
  const sidebar = document.querySelector('.sidebar');
  const nav = document.getElementById('sidebarNav');
  const toggleButtons = Array.from(
    document.querySelectorAll('[data-nav-toggle]')
  );
  const closeButtons = Array.from(document.querySelectorAll('[data-nav-close]'));
  const overlay = document.getElementById('sidebarOverlay');
  const body = document.body;

  if (!sidebar || !nav || toggleButtons.length === 0) {
    return () => {};
  }

  const setMenuState = (isOpen) => {
    const shouldHideNav =
      isMobileNavigationViewport() && !isSmallMobileViewport();
    const isMobileMenuOpen = isOpen && shouldHideNav;

    sidebar.classList.toggle('is-open', isMobileMenuOpen);
    toggleButtons.forEach((button) => {
      button.setAttribute('aria-expanded', String(isMobileMenuOpen));
    });
    if (overlay) {
      overlay.hidden = !isMobileMenuOpen;
      overlay.classList.toggle('is-visible', isMobileMenuOpen);
      overlay.setAttribute('aria-hidden', String(!isMobileMenuOpen));
    }
    nav.setAttribute('aria-hidden', shouldHideNav ? String(!isOpen) : 'false');
    if (body) {
      body.classList.toggle('sidebar-open', isMobileMenuOpen);
      body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    }
  };

  const closeMenu = () => {
    setMenuState(false);
  };

  const openMenu = () => {
    if (isMobileNavigationViewport() && !isSmallMobileViewport()) {
      setMenuState(true);
    }
  };

  const toggleMenu = () => {
    if (sidebar.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  toggleButtons.forEach((button) => {
    button.addEventListener('click', toggleMenu);
  });

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeMenu);
  });

  nav.addEventListener('click', (event) => {
    if (!isMobileNavigationViewport()) {
      return;
    }
    if (event.target === nav) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!isMobileNavigationViewport() || isSmallMobileViewport()) {
        setMenuState(false);
      }
    });
  }

  setMenuState(false);

  return () => {
    closeMenu();
  };
};

const setupFullscreenMobileNavigation = () => {
  const navOverlay = document.getElementById('mobileNav');
  const openButton = document.getElementById('mobileNavToggle');
  const closeButton = document.getElementById('mobileNavClose');
  const body = document.body;

  if (!navOverlay || !openButton) {
    return () => {};
  }

  const setMenuState = (isOpen) => {
    const shouldOpen = isOpen && isSmallMobileViewport();
    navOverlay.classList.toggle('is-visible', shouldOpen);
    navOverlay.setAttribute('aria-hidden', String(!shouldOpen));
    openButton.setAttribute('aria-expanded', String(shouldOpen));
    if (body) {
      body.classList.toggle('mobile-nav-open', shouldOpen);
    }
  };

  const closeMenu = () => {
    setMenuState(false);
  };

  const openMenu = () => {
    if (isSmallMobileViewport()) {
      setMenuState(true);
    }
  };

  const toggleMenu = () => {
    if (navOverlay.classList.contains('is-visible')) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  openButton.addEventListener('click', toggleMenu);

  if (closeButton) {
    closeButton.addEventListener('click', closeMenu);
  }

  navOverlay.addEventListener('click', (event) => {
    if (event.target === navOverlay) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!isSmallMobileViewport()) {
        setMenuState(false);
      }
    });
  }

  setMenuState(false);

  return () => {
    closeMenu();
  };
};

const switchView = (target) => {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `${target}-view`);
  });
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.target === target);
  });
  const titles = {
    dashboard: 'Community Dashboard',
    'my-sessions': 'Meine Sessions',
    'my-appointments': 'Meine Termine',
    discover: 'Padel-Spots entdecken',
  };
  const subtitles = {
    dashboard:
      'Behalte offene Plätze, Zusagen und Trends der Community im Blick.',
    'my-sessions':
      'Hier findest du alle Termine, denen du aktuell zugesagt hast.',
    'my-appointments':
      'Verwalte deine erstellten Matches, passe Details an und behalte alle Zusagen im Blick.',
    discover:
      'Entdecke beliebte Locations und buche direkt über den jeweiligen Anbieter.',
  };
  const titleElement = document.getElementById('view-title');
  if (titleElement) {
    titleElement.textContent = titles[target] || 'Meine Termine';
  }
  const subtitleElement = document.getElementById('view-description');
  if (subtitleElement) {
    subtitleElement.textContent =
      subtitles[target] ||
      'Verwalte deine erstellten Matches, passe Details an und behalte alle Zusagen im Blick.';
  }
};

const setupNavigation = (onNavigate) => {
  const closeSidebarMenu = setupSidebarNavigationToggle();
  const closeMobileOverlay = setupFullscreenMobileNavigation();
  const closeMobileMenus = () => {
    closeSidebarMenu();
    closeMobileOverlay();
  };
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      switchView(target);
      if (typeof onNavigate === 'function') {
        onNavigate(target);
      }
      closeMobileMenus();
    });
  });
};

export { switchView, setupNavigation };
