(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—';
  const CN = { CA: '🇨🇦 Canada', US: '🇺🇸 USA', FR: '🇫🇷 France', BE: '🇧🇪 Belgique', GB: '🇬🇧 Royaume-Uni', CH: '🇨🇭 Suisse', AU: '🇦🇺 Australie', DE: '🇩🇪 Allemagne', LU: '🇱🇺 Luxembourg', DK: '🇩🇰 Danemark', NO: '🇳🇴 Norvège', NZ: '🇳🇿 Nouvelle-Zélande' };
  let ov = null;

  const C = window.VV_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, storage: window.sessionStorage } });
  async function api(a, body, qs = '') {
    const { data } = await sb.auth.getSession();
    const r = await fetch(`${C.api}?a=admin-${a}${qs}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { showLogin(); throw new Error('Session expirée'); }
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }

  function showLogin() { $('#app').hidden = true; $('#logout').hidden = true; $('#loginForm').hidden = false; }
  const lf = $('#loginForm');
  lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = lf.email.value.trim().toLowerCase();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) { $('#loginErr').textContent = error.message; return; }
    lf.otp.hidden = false; $('#verifyCode').hidden = false; $('#loginErr').textContent = 'Code envoyé. Consultez votre boîte email.';
  });
  $('#verifyCode').onclick = async () => {
    const { error } = await sb.auth.verifyOtp({ email: lf.email.value.trim().toLowerCase(), token: lf.otp.value.trim(), type: 'email' });
    if (error) { $('#loginErr').textContent = 'Code invalide ou expiré'; return; }
    start().catch((err) => { $('#loginErr').textContent = err.message; });
  };
  $('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

  async function start() {
    ov = await api('overview');
    $('#loginForm').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
    const s = ov.security;
    $('#kpis').innerHTML = [
      ['Offres vérifiées', ov.jobs.verified], ['Probables (à revoir)', ov.jobs.probable], ['Expirées', ov.jobs.expired],
      ['En file de vérification', ov.jobs.queued], ['Abonnés actifs', ov.subs.active], ['Demandes RGPD', ov.gdprPending],
      ['Attaques bloquées (7 j)', (s.bot_blocked || 0) + (s.login_fail || 0)]
    ].map(([k, v]) => `<div class="kpi"><small>${k}</small><b>${v}</b></div>`).join('');
    tab('overview');
  }

  const views = {
    overview() {
      const max = Math.max(1, ...Object.values(ov.byCountry));
      const runs = ov.runs.map((r) => `<tr><td>${fmt(r.started_at)}</td><td>${r.trigger}</td><td>${r.fetched}</td><td>${r.verified}</td><td>${r.probable}</td><td>${r.rejected}</td><td>${r.expired}</td><td>${r.finished_at ? '✓' : '…'}${(r.errors || []).length ? ` <span title="${esc(r.errors.join('\n'))}">⚠ ${r.errors.length}</span>` : ''}</td></tr>`).join('');
      return `<div class="two">
        <div class="panel"><h3>Offres en ligne par pays</h3><table>${Object.entries(ov.byCountry).map(([c, n]) => `<tr><td>${CN[c]}</td><td style="width:50%"><div class="bar" style="width:${(n / max) * 100}%"></div></td><td>${n}</td></tr>`).join('')}</table></div>
        <div class="panel"><h3>Agent hebdomadaire</h3><p class="lead">Collecte automatique chaque lundi à 03:20 UTC, puis vérification par lots de 20 offres toutes les 10 minutes. Hôtes malveillants bloqués : ${ov.malware}.</p>
          <button class="btn primary" id="syncNow">Lancer une collecte maintenant</button> <button class="btn" id="verifyNow">Vérifier un lot maintenant</button><p id="syncMsg" class="lead"></p>
          <h3 style="margin-top:14px">Méthode de score</h3><p class="lead">+50 mention explicite du parrainage (obligatoire) · +30 employeur dans un registre officiel · +10 lien actif et sûr · +10 publiée &lt; 14 j. Vérifiée ≥ 80, probable 45–79, sinon rejetée.</p></div>
      </div>
      <h3 style="margin:20px 0 8px">Historique des passages</h3>
      <div class="tbl"><table><tr><th>Date</th><th>Origine</th><th>Collectées</th><th>Vérifiées</th><th>Probables</th><th>Rejetées</th><th>Expirées</th><th>État</th></tr>${runs || '<tr><td colspan=8>Aucun passage</td></tr>'}</table></div>`;
    },
    async review() { return jobsTable('probable', true); },
    async verified() { return jobsTable('verified', false); },
    add() {
      return `<form class="panel" id="addForm" style="display:grid;gap:10px;max-width:640px">
        <h3>Ajouter manuellement une offre vérifiée</h3>
        <p class="lead">Le moteur exige la phrase de l'annonce prouvant le parrainage. Ex. pour Luxembourg, Norvège, Danemark (sources moins couvertes par les APIs).</p>
        <input name="title" placeholder="Intitulé du poste" required maxlength="200">
        <input name="company" placeholder="Entreprise" required maxlength="160">
        <select name="country" required>${Object.entries(CN).map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
        <input name="city" placeholder="Ville" maxlength="120">
        <input name="url" type="url" placeholder="https://… (annonce officielle)" required>
        <textarea name="evidence" rows="3" placeholder="Phrase exacte de l'annonce, ex. « Visa sponsorship is available for this role »" required maxlength="600"></textarea>
        <button class="btn primary">Publier</button><p id="addMsg" class="lead"></p></form>`;
    },
    registry() {
      const rows = Object.entries(ov.registries).map(([c, r]) => `<tr><td>${CN[c]}</td><td>${esc(r.name)}</td><td>${ov.registry[c] || 0}</td><td>${r.manual ? 'Import manuel' : `Automatique (hebdo) <button class="btn small" data-refresh="${c}">Actualiser</button>`}</td></tr>`).join('');
      return `<div class="tbl"><table><tr><th>Pays</th><th>Registre officiel</th><th>Employeurs chargés</th><th>Mode</th></tr>${rows}</table></div>
        <form class="panel" id="regForm" style="display:grid;gap:10px;margin-top:16px;max-width:640px">
          <h3>Importer une liste officielle (CSV ou un nom par ligne)</h3>
          <select name="country">${Object.entries(CN).map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
          <textarea name="text" rows="6" placeholder="Collez ici la liste officielle (ex. liste INZ des employeurs accrédités)"></textarea>
          <button class="btn primary">Importer</button><p id="regMsg" class="lead"></p></form>`;
    },
    async subs() {
      const { subscribers } = await api('subscribers');
      return `<div class="tbl"><table><tr><th>Email</th><th>Formule</th><th>Statut</th><th>Fin de période</th><th>Inscrit le</th></tr>${subscribers.map((s) => `<tr><td>${esc(s.email)}</td><td>${s.plan || '—'}</td><td>${s.status}</td><td>${fmt(s.current_period_end)}</td><td>${fmt(s.created_at)}</td></tr>`).join('') || '<tr><td colspan=5>Aucun abonné</td></tr>'}</table></div>`;
    },
    async settings() {
      const { values: v, secrets: k } = await api('settings');
      const sec = (name, label, help) => `<label class="fld"><span>${label} ${k[name] ? '<span class="badge ok">✓ enregistrée</span>' : '<span class="badge warn">manquante</span>'}</span><input type="password" name="${name}" placeholder="${k[name] ? '•••••••• (laisser vide pour conserver)' : 'Coller la clé'}" autocomplete="off"><small>${help}</small></label>`;
      const val = (name, label, help = '') => `<label class="fld"><span>${label}</span><input name="${name}" value="${esc(v[name])}" autocomplete="off"><small>${help}</small></label>`;
      return `<form class="panel settings" id="setForm">
        <h3>Liens de paiement Polar</h3>
        ${val('POLAR_LINK_MONTHLY', 'Lien d’abonnement mensuel', `https://buy.polar.sh/… — dans Polar, URL de succès : <code>${location.origin}${location.pathname.replace(/admin(\.html)?$/, '')}?checkout_id={CHECKOUT_ID}</code>`)}
        ${val('POLAR_LINK_QUARTERLY', 'Lien d’abonnement trimestriel')}
        ${val('PRICE_MONTHLY', 'Prix affiché mensuel')} ${val('PRICE_QUARTERLY', 'Prix affiché trimestriel')}
        ${sec('POLAR_ACCESS_TOKEN', 'Jeton d’accès Polar', 'Polar → Settings → Developers → New token (scopes : checkouts:read, subscriptions:read)')}
        ${sec('POLAR_WEBHOOK_SECRET', 'Secret webhook Polar', `Polar → Settings → Webhooks → URL : <code>${C.api}?a=polar-webhook</code>, format Raw, événements subscription.*`)}
        <h3>Offre gratuite</h3>
        ${val('FREE_PER_COUNTRY', 'Offres visibles par pays (gratuit)')}
        <h3>Chatbot IA (option)</h3>
        <label class="ck"><input type="checkbox" id="aiToggle" ${v.AI_ENABLED === 'true' ? 'checked' : ''}> Activer les réponses IA quand la FAQ ne suffit pas</label>
        ${sec('GEMINI_API_KEY', 'Clé Google Gemini', 'aistudio.google.com → Get API key (gratuit)')}
        ${sec('ANTHROPIC_API_KEY', 'Clé Anthropic (alternative)', 'console.anthropic.com (payant)')}
        <h3>Anti-robot & sources</h3>
        ${val('TURNSTILE_SITE_KEY', 'Clé de site Cloudflare Turnstile')}
        ${sec('TURNSTILE_SECRET', 'Clé secrète Turnstile', 'dash.cloudflare.com → Turnstile')}
        ${sec('ADZUNA_APP_ID', 'Adzuna App ID', 'developer.adzuna.com (gratuit)')} ${sec('ADZUNA_APP_KEY', 'Adzuna App Key', '')}
        ${val('REGISTRY_URL_CA', 'URL CSV registre Canada (LMIA)', 'open.canada.ca — Positive LMIA Employers List (CSV anglais du dernier trimestre)')}
        ${val('REGISTRY_URL_US', 'URL CSV registre USA (H-1B)', 'uscis.gov — H-1B Employer Data Hub, export CSV')}
        <button class="btn primary">Enregistrer</button><p id="setMsg" class="lead"></p></form>`;
    },
    async gdpr() {
      const { requests } = await api('gdpr');
      return `<p class="lead">Avant d’exécuter, vérifiez l’identité en répondant à la personne depuis l’email du compte. Délai légal : 1 mois.</p><div class="tbl"><table><tr><th>Date</th><th>Email</th><th>Demande</th><th>Statut</th><th>Action</th></tr>${requests.map((r) => `<tr><td>${fmt(r.created_at)}</td><td>${esc(r.email)}</td><td>${r.kind === 'delete' ? 'Suppression' : 'Export'}</td><td>${r.status}</td><td>${r.status === 'pending' ? `<button class="btn small" data-gdpr="${r.id}">Exécuter</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan=5>Aucune demande</td></tr>'}</table></div>`;
    },
    async security() {
      const { events } = await api('audit');
      const sum = Object.entries(ov.security).map(([k, v]) => `<span class="badge">${k} : ${v}</span>`).join(' ');
      return `<div class="panel"><h3>Protections actives</h3><p class="lead">Turnstile anti-bot · honeypot · limitation de débit par IP · anti brute-force sur les codes d’accès (5/h par IP, 10/h par email) · connexion admin par code email à usage unique (admin unique) · CSP stricte · contrôle d’origine · webhook Polar signé · liens d’offres contrôlés contre la liste URLhaus des sites malveillants · IP hachées (RGPD) · purge automatique.</p><div class="badges">${sum || '<span class="badge">Aucun événement sur 7 jours</span>'}</div></div>
        <div class="tbl" style="margin-top:14px"><table><tr><th>Date</th><th>Événement</th><th>Détail</th></tr>${events.map((e) => `<tr><td>${fmt(e.at)}</td><td>${esc(e.kind)}</td><td>${esc(JSON.stringify(e.detail))}</td></tr>`).join('')}</table></div>`;
    }
  };

  async function jobsTable(status, review) {
    const { jobs } = await api('jobs', null, `&status=${status}`);
    return `<div class="tbl"><table><tr><th>Offre</th><th>Pays</th><th>Score</th><th>Preuve</th><th>Registre</th><th>Actions</th></tr>${jobs.map((j) => `<tr>
      <td><a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a><br><small>${esc(j.company)} · ${esc(j.source)}</small></td>
      <td>${CN[j.country] || j.country}</td><td>${j.verification_score}</td><td><small>${esc(j.sponsorship_evidence || '—')}</small></td><td><small>${esc(j.registry_match || '—')}</small></td>
      <td>${review ? `<button class="btn small primary" data-set="verified" data-id="${j.id}">Valider</button> ` : ''}<button class="btn small" data-set="rejected" data-id="${j.id}">Retirer</button></td></tr>`).join('') || '<tr><td colspan=6>Rien à afficher</td></tr>'}</table></div>`;
  }

  async function tab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
    $('#view').innerHTML = '<p class="lead">Chargement…</p>';
    try { $('#view').innerHTML = await views[name](); } catch (e) { $('#view').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }
  document.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) tab(b.dataset.tab); };

  document.addEventListener('click', async (e) => {
    if (e.target.id === 'syncNow') {
      e.target.disabled = true; $('#syncMsg').textContent = 'Mise à jour en cours (jusqu’à 5 min)…';
      try { const r = await api('sync-now', {}); $('#syncMsg').textContent = `Collecte terminée : ${r.fetched} offres trouvées, ${r.queued} en file de vérification (traitées automatiquement toutes les 10 min).${r.errors?.length ? ' Alertes : ' + r.errors.join(' | ') : ''}`; start(); }
      catch (err) { $('#syncMsg').textContent = err.message; e.target.disabled = false; }
    }
    if (e.target.id === 'verifyNow') { try { const r = await api('verify-now', {}); $('#syncMsg').textContent = `Lot traité : ${r.processed} (${r.verified || 0} vérifiées, ${r.probable || 0} probables, ${r.rejected || 0} rejetées).`; } catch (err) { $('#syncMsg').textContent = err.message; } }
    if (e.target.dataset.refresh) { e.target.disabled = true; try { const r = await api('registry-refresh', {}, `&c=${e.target.dataset.refresh}`); e.target.textContent = `✓ ${r.imported}`; } catch (err) { e.target.textContent = err.message; } }
    if (e.target.dataset.gdpr) { try { const r = await api('gdpr-execute', { id: e.target.dataset.gdpr }); e.target.closest('td').innerHTML = r.data ? `<pre style="white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(r.data, null, 2))}</pre>` : 'Fait'; } catch (err) { alert(err.message); } }
    const b = e.target.closest('[data-set]');
    if (b) { await api('job-update', { id: b.dataset.id, status: b.dataset.set }); b.closest('tr').remove(); }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'addForm') { e.preventDefault(); try { await api('job-add', Object.fromEntries(new FormData(e.target))); $('#addMsg').textContent = '✓ Offre publiée'; e.target.reset(); } catch (err) { $('#addMsg').textContent = err.message; } }
    if (e.target.id === 'setForm') {
      e.preventDefault();
      const data = Object.fromEntries([...new FormData(e.target)].filter(([k, v]) => !(e.target[k].type === 'password' && !v)));
      data.AI_ENABLED = $('#aiToggle').checked ? 'true' : 'false';
      try { const r = await api('settings-set', data); $('#setMsg').textContent = `✓ Enregistré (${r.saved.length} paramètres)`; e.target.querySelectorAll('input[type=password]').forEach((i) => { i.value = ''; }); } catch (err) { $('#setMsg').textContent = err.message; }
    }
    if (e.target.id === 'regForm') { e.preventDefault(); try { const r = await api('registry-import', Object.fromEntries(new FormData(e.target))); $('#regMsg').textContent = `✓ ${r.imported} employeurs importés`; } catch (err) { $('#regMsg').textContent = err.message; } }
  });

  sb.auth.getSession().then(({ data }) => data.session ? start().catch(() => showLogin()) : showLogin());
})();
