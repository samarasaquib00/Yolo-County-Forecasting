(async () => {
  const placeholder = document.querySelector('[data-site-header-placeholder]');
  if (!placeholder) {
    return;
  }

  const isInPagesFolder = window.location.pathname.includes('/Pages/');
  const siteRootPrefix = isInPagesFolder ? '../' : '';
  const pagesRootPrefix = isInPagesFolder ? '' : 'Pages/';
  const response = await fetch(`${siteRootPrefix}header.html`, { cache: 'no-store' });
  const template = await response.text();
  placeholder.innerHTML = template
    .replaceAll('__SITE_ROOT__', siteRootPrefix)
    .replaceAll('__PAGES_ROOT__', pagesRootPrefix);

  const primaryNav = document.querySelector('.top-nav');
  const updatePrimaryNavHeight = () => {
    if (primaryNav) {
      document.documentElement.style.setProperty('--primary-nav-height', `${primaryNav.offsetHeight}px`);
    }
  };
  updatePrimaryNavHeight();
  if (primaryNav && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updatePrimaryNavHeight).observe(primaryNav);
  }

  const currentPage = decodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
  const currentSection = document.body.dataset.siteSection || '';

  document.querySelectorAll('[data-section-nav]').forEach((nav) => {
    nav.hidden = nav.dataset.sectionNav !== currentSection;
  });

  document.querySelectorAll('.nav-btn, .section-nav-link').forEach((link) => {
    const target = link.getAttribute('data-nav-target');
    const section = link.getAttribute('data-nav-section');
    if (target && target === currentPage) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    } else if (section && section === currentSection) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'location');
    }
  });

  if (typeof window.applyWyPlaceholders === 'function') {
    window.applyWyPlaceholders();
  }
})();
