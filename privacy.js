(() => {
  const f = document.getElementById('gdprForm');
  fetch(`${window.VV_CONFIG.api}?a=config`).then((r) => r.json()).then((c) => {
    if (!c.TURNSTILE_SITE_KEY) return;
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true;
    s.onload = () => setTimeout(() => window.turnstile?.render(f.querySelector('.ts'), { sitekey: c.TURNSTILE_SITE_KEY, callback: (t) => { f.dataset.ts = t; } }), 300);
    document.head.appendChild(s);
  }).catch(() => {});
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const r = await fetch(`${window.VV_CONFIG.api}?a=gdpr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, turnstile: f.dataset.ts }) });
    const j = await r.json().catch(() => ({}));
    document.getElementById('gdprMsg').textContent = r.ok ? 'Demande enregistrée. Nous vous répondons par email sous 30 jours maximum, après vérification de votre identité.' : (j.error || 'Erreur');
  });
})();
