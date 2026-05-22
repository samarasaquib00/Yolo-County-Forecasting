(async () => {
  const placeholder = document.querySelector('[data-site-header-placeholder]');
  if (!placeholder) {
    return;
  }

  const isInPagesFolder = window.location.pathname.includes('/Pages/');
  const rootPrefix = isInPagesFolder ? '../' : '';
  const response = await fetch(`${rootPrefix}header.html`, { cache: 'no-store' });
  const template = await response.text();
  placeholder.innerHTML = template.replaceAll('__ROOT__', rootPrefix);

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-btn').forEach((link) => {
    const target = link.getAttribute('data-nav-target');
    if (target && target === currentPage) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
})();
