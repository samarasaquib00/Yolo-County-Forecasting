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

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-btn').forEach((link) => {
    const target = link.getAttribute('data-nav-target');
    if (target && target === currentPage) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  if (typeof window.applyWyPlaceholders === 'function') {
    window.applyWyPlaceholders();
  }
})();
