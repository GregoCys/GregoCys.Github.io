document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.navlinks');
  if (!button || !nav) return;
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) button.setAttribute('aria-label','Close navigation');
    else button.setAttribute('aria-label','Open navigation');
  };
  button.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      button.focus();
    }
  });
});