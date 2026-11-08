(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
  };
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') || store.get('vv_lang') || 'fr'; // français = langue de base
  if (!I18N[lang]) lang = 'fr';
  const t = (k) => I18N[lang][k] ?? I18N.fr[k] ?? k;
  const cname = (c) => (COUNTRY_NAMES[lang] || COUNTRY_NAMES.en)[c];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : '#';
  const state = { country: '', q: '', verified: '0', me: { premium: false }, cfg: {}, stats: {} };
  const API = window.VV_CONFIG?.api;

  async function api(a, opts = {}, qs = '') {
    if (!API) throw new Error('offline');
    const headers = { 'Content-Type': 'application/json' };
    const s = store.get('vv_session'); if (s) headers['x-vv-session'] = s;
    const r = await fetch(`${API}?a=${a}${qs}`, { ...opts, headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = t(el.dataset.i); });
    document.querySelectorAll('[data-ph]').forEach((el) => { el.placeholder = t(el.dataset.ph); });
    $('#accessBtn').textContent = state.me.premium ? '★ Premium' : t('nav_login');
    if (state.cfg.PRICE_MONTHLY) $('#priceM').firstChild.textContent = state.cfg.PRICE_MONTHLY;
    if (state.cfg.PRICE_QUARTERLY) $('#priceQ').firstChild.textContent = state.cfg.PRICE_QUARTERLY;
  }

  function langSelect() {
    const s = $('#lang');
    s.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === lang ? ' selected' : ''}>${v}</option>`).join('');
    s.onchange = () => { lang = s.value; store.set('vv_lang', lang); applyI18n(); renderChips(); load(); };
  }

  function renderChips() {
    const stats = state.stats || {};
    const codes = Object.keys(FLAGS);
    const n = (c) => (stats[c]?.verified || 0) + (stats[c]?.probable || 0);
    const total = codes.reduce((s, c) => s + n(c), 0);
    $('#chips').innerHTML = [`<button class="chip" data-c="" aria-pressed="${!state.country}">🌍 ${esc(t('all_countries'))}<small>${total || ''}</small></button>`]
      .concat(codes.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${state.country === c}">${FLAGS[c]} ${esc(cname(c))}<small>${n(c) || ''}</small></button>`)).join('');
  }
  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; state.country = b.dataset.c; renderChips(); load(); });

  function card(j) {
    const days = j.posted_at ? Math.max(0, Math.round((Date.now() - new Date(j.posted_at)) / 864e5)) : null;
    return `<article class="card">
      <div class="badges">
        <span class="badge ${j.status === 'verified' ? 'ok' : 'warn'}">${j.status === 'verified' ? '✓ ' + esc(t('b_verified')) : esc(t('b_probable'))}</span>
        ${j.registry_match ? `<span class="badge ok" title="${esc(j.registry_match)}">🏛 ${esc(t('b_registry'))}</span>` : ''}
        <span class="badge">${esc(t('score'))} ${Number(j.verification_score) || 0}/100</span>
        ${j.remote ? `<span class="badge">${esc(t('remote'))}</span>` : ''}
      </div>
      <h3>${esc(j.title)}</h3>
      <div class="co">${esc(j.company)} · ${FLAGS[j.country] || ''} ${esc(j.city || cname(j.country))}${days !== null ? ` · ${days} ${esc(t('days'))}` : ''}${j.salary ? ` · ${esc(j.salary)}` : ''}</div>
      ${j.sponsorship_evidence ? `<p class="evidence">« ${esc(j.sponsorship_evidence)} »</p>` : ''}
      <div class="row">
        <a class="btn primary small" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer nofollow">${esc(t('apply'))} ↗</a>
        <button class="btn small" data-report="${esc(j.id)}">${esc(t('report'))}</button>
      </div></article>`;
  }

  async function load() {
    const qs = `&country=${encodeURIComponent(state.country)}&q=${encodeURIComponent(state.q)}&verified=${state.verified}`;
    let d;
    try { d = await api('jobs', {}, qs); }
    catch { d = window.VV_DEMO ? window.VV_DEMO(state) : { jobs: [], total: 0, locked: 0 }; }
    $('#list').innerHTML = d.jobs.length ? d.jobs.map(card).join('') : `<p class="lead">${esc(t('empty'))}</p>`;
    $('#meta').textContent = `${d.total ?? d.jobs.length} ${t('results')}${state.lastSync ? ` · ${t('last_sync')} : ${new Date(state.lastSync).toLocaleDateString(lang)}` : ''}`;
    $('#lockedBox').innerHTML = !d.premium && d.locked > 0
      ? `<div class="locked">🔒 <b>${d.locked}</b> ${esc(t('locked'))} <a class="btn primary small" href="#pricing">${esc(t('unlock'))}</a></div>` : '';
  }

  // ---- Turnstile (anti-bot) ----
  function mountTurnstile(dlg) {
    const box = $('.ts', dlg);
    if (!box || !state.cfg.TURNSTILE_SITE_KEY || !window.turnstile || box.dataset.done) return;
    box.dataset.done = '1';
    window.turnstile.render(box, { sitekey: state.cfg.TURNSTILE_SITE_KEY, size: 'flexible', callback: (tok) => { dlg.dataset.ts = tok; } });
  }
  function openDlg(id) { const d = $(id); d.showModal(); mountTurnstile(d); }
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });

  // ---- Paiement Polar ----
  let plan = 'monthly';
  document.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => { plan = b.dataset.plan; $('#buyMsg').textContent = ''; openDlg('#buyDlg'); }));
  $('#buyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const link = plan === 'quarterly' ? state.cfg.POLAR_LINK_QUARTERLY : state.cfg.POLAR_LINK_MONTHLY;
    if (!link || !/^https:\/\//.test(link)) { $('#buyMsg').textContent = t('pay_soon'); return; }
    const u = new URL(link);
    u.searchParams.set('customer_email', String(f.get('email') || ''));
    location.href = u.toString();
  });

  // Retour de paiement : ?checkout_id=...
  async function claimCheckout(id) {
    try {
      const r = await api('claim', { method: 'POST', body: JSON.stringify({ checkout_id: id }) });
      store.set('vv_session', r.session);
      history.replaceState(null, '', location.pathname);
      $('#codeVal').textContent = r.code;
      openDlg('#codeDlg');
      state.me = await api('me');
      applyI18n(); load();
    } catch (err) { alertBox(err.message); }
  }
  $('#copyCode').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText($('#codeVal').textContent); e.target.textContent = t('copied'); }
    catch { const r = document.createRange(); r.selectNodeContents($('#codeVal')); getSelection().removeAllRanges(); getSelection().addRange(r); }
  });

  // ---- Accès abonné (email + code) ----
  $('#accessBtn').addEventListener('click', () => {
    if (state.me.premium) { $('#premiumInfo').textContent = `${state.me.email || ''}${state.me.until ? ` · ${new Date(state.me.until).toLocaleDateString(lang)}` : ''}`; openDlg('#accountDlg'); return; }
    openDlg('#loginDlg');
  });
  $('#logoutBtn').addEventListener('click', () => { store.set('vv_session', null); location.reload(); });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('restore', { method: 'POST', body: JSON.stringify({ email: f.get('email'), code: f.get('code'), website: f.get('website'), turnstile: $('#loginDlg').dataset.ts }) });
      store.set('vv_session', r.session); location.reload();
    } catch (err) { $('#loginMsg').textContent = err.message; }
  });

  // ---- Signalement ----
  $('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-report]'); if (!b) return;
    $('#reportDlg').dataset.job = b.dataset.report; $('#reportMsg').textContent = ''; openDlg('#reportDlg');
  });
  $('#reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('report', { method: 'POST', body: JSON.stringify({ jobId: $('#reportDlg').dataset.job, reason: new FormData(e.target).get('reason') }) }); $('#reportMsg').textContent = t('report_ok'); e.target.reset(); }
    catch (err) { $('#reportMsg').textContent = err.message; }
  });

  // ---- Chatbot ----
  const msgs = $('#msgs');
  const push = (txt, me, ai) => {
    const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.textContent = txt;
    if (ai) { const s = document.createElement('small'); s.className = 'ai'; s.textContent = t('ai_badge'); d.appendChild(s); }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  };
  $('#chatFab').onclick = () => { $('#chat').classList.toggle('open'); if (!msgs.children.length) push(t('chat_hello')); };
  $('#chatClose').onclick = () => $('#chat').classList.remove('open');
  $('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const m = String(f.get('m') || '').trim(); if (!m) return;
    push(m, true); e.target.reset();
    try { const r = await api('chat', { method: 'POST', body: JSON.stringify({ message: m, lang, website: f.get('website') }) }); push(r.reply, false, r.ai); }
    catch (err) { push(window.VV_DEMO_CHAT ? window.VV_DEMO_CHAT(m, lang) : err.message); }
  });

  function alertBox(msg) { $('#banner').innerHTML = `<div class="notice">${esc(msg)}</div>`; scrollTo({ top: 0, behavior: 'smooth' }); }

  // ---- Cookies : uniquement essentiels → simple information ----
  if (!store.get('vv_cookie')) $('#cookie').hidden = false;
  $('#cookieOk').onclick = () => { store.set('vv_cookie', '1'); $('#cookie').hidden = true; };

  // ---- Init ----
  $('#yr').textContent = new Date().getFullYear();
  $('#go').onclick = () => { state.q = $('#q').value.trim(); state.verified = $('#level').value; load(); };
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#go').click(); });
  $('#level').onchange = () => $('#go').click();
  langSelect(); applyI18n(); renderChips();
  (async () => {
    try { state.cfg = await api('config'); } catch {}
    try { state.me = await api('me'); } catch {}
    try { const s = await api('stats'); state.lastSync = s.lastSync; state.stats = s.byCountry; } catch { if (window.VV_DEMO_STATS) state.stats = window.VV_DEMO_STATS; }
    if (state.cfg.TURNSTILE_SITE_KEY) { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; document.head.appendChild(s); }
    applyI18n(); renderChips();
    const co = params.get('checkout_id');
    if (co) claimCheckout(co);
    load();
  })();
})();
