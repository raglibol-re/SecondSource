// Remembers a light or dark choice (handy on projectors); otherwise follows the system. ?theme=light also works.
(() => {
  const root = document.documentElement;
  let t = new URLSearchParams(location.search).get('theme');
  try { t = t || localStorage.getItem('secondsource:theme'); } catch {}
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  const current = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  addEventListener('DOMContentLoaded', () => {
    const b = document.querySelector('.theme-toggle');
    if (!b) return;
    const label = () => (b.textContent = current() === 'dark' ? 'Light mode' : 'Dark mode');
    label();
    b.onclick = () => {
      root.dataset.theme = current() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('secondsource:theme', root.dataset.theme); } catch {}
      label();
    };
  });
})();
