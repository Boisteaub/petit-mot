/*
 * « Un petit mot » : la page où les grands-parents, la famille et les amis écrivent à l'enfant.
 * Tout ce qui est personnel (prénoms, canal, clé) est dans le lien d'invitation, après le « # » :
 * le site qui héberge cette page ne le reçoit jamais. Les messages passent chiffrés par le relais ntfy ;
 * les parents les lisent et les acceptent sur leur téléphone avant qu'ils arrivent sur la télé.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const JOUR = 86400;
  const RELAIS = 'https://ntfy.sh';     // le seul relais accepté (le même que dans la règle CSP de index.html)
  const NBSP = ' ';                // espace insécable, avant « : » et « · »
  const FINE = ' ';                // espace fine insécable, avant « ! » et « ? »

  // ---------------------------------------------------------------- le lien d'invitation

  function lire(cle) { try { return localStorage.getItem('petit-mot:' + cle); } catch (e) { return null; } }
  function garder(cle, valeur) { try { localStorage.setItem('petit-mot:' + cle, valeur); } catch (e) { /* stockage refusé */ } }

  function decoder(brut) {
    try { return JSON.parse(new TextDecoder().decode(Chiffre.depuisBase64(brut))); } catch (e) { return null; }
  }

  // Un lien n'est accepté que complet, et seulement s'il passe par le relais ntfy.sh.
  function valide(infos) {
    return !!infos && typeof infos.s === 'string' && /^[\w-]{1,64}$/.test(infos.s)
      && typeof infos.k === 'string' && /^[0-9a-f]{64}$/i.test(infos.k)
      && (infos.r === RELAIS || infos.r === RELAIS + '/');
  }

  function lireLien() {
    const brut = location.hash.slice(1);
    const infos = brut ? decoder(brut) : null;
    if (valide(infos)) {
      garder('dernier', brut);
      return infos;
    }
    const dernier = decoder(lire('dernier') || '');    // ouvert depuis l'écran d'accueil, sans le « # »
    return valide(dernier) ? dernier : null;
  }

  const L = lireLien();
  if (!L) {
    $('titre').textContent = 'Lien incomplet';
    $('sous-titre').textContent = 'Demande un nouveau lien aux parents.';
    return;
  }
  const relais = RELAIS + '/' + L.s;
  const enfant = (typeof L.a === 'string' && L.a.trim()) || 'l\'enfant';
  const contact = typeof L.c === 'string' ? L.c.trim() : '';

  document.title = `Un petit mot pour ${enfant}`;
  $('titre').textContent = `Écrire à ${enfant}`;
  $('sous-titre').textContent = `${contact ? `Bonjour ${contact}` : 'Bonjour'}${FINE}! Tes messages sont lus par ses parents avant d'arriver sur sa télé.`;
  $('texte').placeholder = `Écris ton message à ${enfant}…`;
  $('note').textContent = `Garde ce lien pour toi${NBSP}: il sert à écrire à ${enfant}.`;

  // Les parents ont retiré ce contact : le lien ne sert plus, ce téléphone s'en souvient.
  let revoque = lire('revoque:' + L.s) === '1';

  // ---------------------------------------------------------------- l'historique (gardé sur ce téléphone)

  // Le relais ne garde les messages que quelques heures : la conversation est aussi rangée sur ce téléphone.
  const memoire = (() => {
    try { return JSON.parse(lire('fil:' + L.s)) || { messages: [], depuis: 0 }; } catch (e) { return { messages: [], depuis: 0 }; }
  })();
  const sauver = () => garder('fil:' + L.s, JSON.stringify({ messages: memoire.messages.slice(-200), depuis: memoire.depuis }));

  // Un état n'avance jamais en arrière : envoyé → reçu par la maison → remis à l'enfant → lu.
  // « Pas transmis » (les parents ne l'ont pas donné) est définitif ; il ne remplace pas un message déjà remis ou lu.
  const RANG = { envoi: 0, erreur: 0, envoye: 1, recu: 2, remis: 3, lu: 4 };
  const rang = (etat) => RANG[etat] || 0;
  const parti = (m) => m.etat !== 'envoi' && m.etat !== 'erreur';

  function avancer(m, etat) {
    if (m.etat === 'refuse') return;
    if (etat === 'refuse' ? rang(m.etat) < RANG.remis : rang(etat) > rang(m.etat)) m.etat = etat;
  }

  function heure(ts) {
    const d = new Date(ts * 1000);
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', `${NBSP}h${NBSP}`);
    if (d.toDateString() === new Date().toDateString()) return h;
    return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${h}`;
  }

  function etatDe(m) {
    if (m.etat === 'lu') return h('span', { class: 'remis' }, `Lu par ${enfant}${NBSP}✓✓`);
    if (m.etat === 'remis') return h('span', { class: 'remis' }, `Remis à ${enfant}${NBSP}✓`);
    if (m.etat === 'recu') return `Reçu${NBSP}· ses parents vont le lire`;
    if (m.etat === 'refuse') return `Pas transmis à ${enfant}`;
    if (m.etat === 'erreur') return h('span', { class: 'erreur' }, revoque ? 'Pas parti' : 'Pas encore parti');
    if (m.etat === 'envoi') return 'Envoi…';
    return `Envoyé${NBSP}· en route vers la maison`;
  }

  function h(tag, props, ...enfants) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const e of enfants.flat()) if (e !== null && e !== undefined) el.append(e);
    return el;
  }

  function bulle(m) {
    const aRenvoyer = m.moi && m.etat === 'erreur' && !revoque;
    return h('div', {
      class: 'bulle ' + (m.moi ? 'moi' : 'elle'),
      onclick: aRenvoyer ? () => envoyer(m) : null,
    }, h('p', {}, m.texte),
    h('small', {}, heure(m.cree), m.moi ? `${NBSP}· ` : '', m.moi ? etatDe(m) : ''),
    aRenvoyer ? h('button', { type: 'button', class: 'reessayer', onclick: (e) => { e.stopPropagation(); envoyer(m); } }, 'Réessayer') : null);
  }

  function dessiner() {
    const fil = $('fil');
    fil.replaceChildren(...(memoire.messages.length ? memoire.messages.map((m) => bulle(m))
      : revoque ? [] : [h('p', { class: 'vide' }, `Pas encore de message. Écris le premier petit mot pour ${enfant}${FINE}!`)]));
    fil.scrollTop = fil.scrollHeight;
  }

  function montrerRevoque() {
    $('saisie').hidden = true;
    $('note').hidden = true;
    $('plus-valable').hidden = false;
  }

  // ---------------------------------------------------------------- le relais
  //
  // Ce que la maison envoie (chiffré) : « message » de l'enfant, puis pour chacun de nos messages
  // « recu » (arrivé à la maison), « remis » (accepté, sur la télé), « lu », ou « refuse » (pas transmis),
  // et « revoque » quand les parents retirent ce contact.
  // Ce que la page envoie : ses « message », et « sync » à l'ouverture et au retour du réseau,
  // pour que la maison renvoie ce que le relais a oublié (il ne garde rien plus de 12 h).

  let source = null;                // l'écoute en direct du relais
  let relaisMuet = false;           // le relais n'a pas répondu à la dernière tentative
  let file = Promise.resolve();     // les messages reçus sont traités un par un, dans l'ordre d'arrivée
  let enCours = false;              // un rattrapage est déjà en route
  const enVol = new Set();          // messages en train de partir (pour ne pas les envoyer deux fois)

  function bandeau() {
    $('hors-ligne').hidden = revoque || (navigator.onLine !== false && !relaisMuet);
  }

  function relaisRepond(oui) {
    const revenu = oui && relaisMuet;
    relaisMuet = !oui;
    bandeau();
    if (revenu) auRetour();         // le relais répond de nouveau : on rattrape et les messages en attente repartent
  }

  function retirer() {
    if (revoque) return;
    revoque = true;
    garder('revoque:' + L.s, '1');
    if (source) source.close();
    montrerRevoque();
    bandeau();
  }

  async function recevoir(evenement) {
    if (evenement.event !== 'message') return;
    memoire.depuis = Math.max(memoire.depuis, evenement.time || 0);
    const texte = await Chiffre.ouvrir(L.k, evenement.message || '');
    if (!texte) return;
    let p;
    try { p = JSON.parse(texte); } catch (e) { return; }
    if (p.type === 'message' && p.de === 'enfant') {
      if (!memoire.messages.some((m) => !m.moi && m.id === p.id)) {      // déjà là si la maison le renvoie
        memoire.messages.push({ moi: false, id: p.id, texte: p.texte, cree: p.cree || evenement.time });
      }
    } else if (p.type === 'message' && p.de === 'contact') {
      const m = memoire.messages.find((x) => x.moi && x.n === p.n);
      if (m) avancer(m, 'envoye');
      else memoire.messages.push({ moi: true, n: p.n, texte: p.texte, cree: p.cree || evenement.time, etat: 'envoye' });
    } else if (['recu', 'remis', 'lu', 'refuse'].includes(p.type)) {
      const m = memoire.messages.find((x) => x.moi && x.n === p.ref);
      if (m) avancer(m, p.type);
    } else if (p.type === 'revoque') {
      retirer();
    }
    memoire.messages.sort((x, y) => x.cree - y.cree);
    sauver();
    dessiner();
  }

  function traiter(evenement) {
    file = file.then(() => recevoir(evenement)).catch(() => { /* message illisible */ });
    return file;
  }

  async function rattraper() {
    let lignes;
    try {
      const r = await fetch(`${relais}/json?poll=1&since=${memoire.depuis || '12h'}`);
      if (!r.ok) throw new Error(r.status);
      lignes = (await r.text()).split('\n').filter(Boolean);
    } catch (e) {
      relaisRepond(false);          // hors ligne : on réessaiera au retour du réseau
      return;
    }
    relaisRepond(true);
    for (const l of lignes) {
      try { await traiter(JSON.parse(l)); } catch (e) { /* ligne illisible */ }
    }
  }

  function ecouter() {
    if (revoque || (source && source.readyState !== EventSource.CLOSED)) return;
    const s = new EventSource(`${relais}/sse?since=${memoire.depuis || 'all'}`);
    source = s;
    s.onopen = () => relaisRepond(true);
    s.onmessage = (e) => {
      try { traiter(JSON.parse(e.data)); } catch (err) { /* message illisible */ }
    };
    s.onerror = () => {
      if (revoque) return;
      relaisRepond(false);
      if (s.readyState === EventSource.CLOSED) setTimeout(ecouter, 30000);   // le navigateur a abandonné : on relance
    };
  }

  async function publier(contenu) {
    try {
      const enveloppe = await Chiffre.sceller(L.k, JSON.stringify(contenu));
      const r = await fetch(relais, { method: 'POST', body: enveloppe });
      if (!r.ok) throw new Error(r.status);
    } catch (e) {
      relaisRepond(false);
      throw e;
    }
    relaisRepond(true);
  }

  // Demande à la maison de renvoyer ce que ce téléphone n'a pas encore vu
  // (pas plus d'une fois par 30 s, si la connexion va et vient).
  let derniereSync = 0;
  async function synchroniser() {
    if (Date.now() - derniereSync < 30000) return;
    const depuis = memoire.messages
      .filter((m) => !m.moi || parti(m))
      .reduce((t, m) => Math.max(t, Math.floor(m.cree) || 0), 0);
    try {
      await publier({ type: 'sync', de: 'contact', depuis });
      derniereSync = Date.now();
    } catch (e) { /* on réessaiera au retour du réseau */ }
  }

  async function envoyer(m) {
    if (revoque || enVol.has(m.n) || rang(m.etat) > 0 || m.etat === 'refuse') return;
    enVol.add(m.n);
    m.etat = 'envoi';
    sauver();
    dessiner();
    try {
      await publier({ type: 'message', de: 'contact', n: m.n, texte: m.texte, cree: m.cree });
      avancer(m, 'envoye');
    } catch (e) {
      if (m.etat === 'envoi') m.etat = 'erreur';
    }
    enVol.delete(m.n);
    sauver();
    dessiner();
  }

  // Les messages qui ne sont pas partis repartent, dans l'ordre ; on s'arrête au premier échec.
  async function renvoyer() {
    for (const m of memoire.messages.filter((x) => x.moi && x.etat === 'erreur')) {
      await envoyer(m);
      if (m.etat === 'erreur') break;
    }
  }

  // À l'ouverture, au retour du réseau ou du relais : rattraper, demander la suite à la maison, renvoyer.
  async function auRetour() {
    if (enCours || revoque) return;
    enCours = true;
    try {
      await rattraper();
      ecouter();
      await synchroniser();
      await renvoyer();
    } finally {
      enCours = false;
    }
  }

  // ---------------------------------------------------------------- écrire

  const champ = $('texte');
  champ.addEventListener('input', () => {
    champ.style.height = 'auto';
    champ.style.height = `${Math.min(champ.scrollHeight, 140)}px`;
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      $('saisie').requestSubmit();
    }
  });
  $('saisie').addEventListener('submit', (e) => {
    e.preventDefault();
    if (revoque) return;
    const texte = champ.value.trim().replace(/\s+/g, ' ');
    if (!texte) return;
    champ.value = '';
    champ.style.height = 'auto';
    const m = { moi: true, n: Math.random().toString(36).slice(2, 12), texte, cree: Math.floor(Date.now() / 1000), etat: 'envoi' };
    memoire.messages.push(m);
    envoyer(m);
  });

  // ---------------------------------------------------------------- au démarrage

  // Les anciens messages de plus de 60 jours sont oubliés sur ce téléphone ;
  // un message resté « Envoi… » (page fermée trop tôt) repartira tout seul.
  memoire.messages = memoire.messages.filter((m) => Date.now() / 1000 - m.cree < 60 * JOUR);
  for (const m of memoire.messages) if (m.moi && m.etat === 'envoi') m.etat = 'erreur';

  if (revoque) montrerRevoque();
  else $('saisie').hidden = false;
  dessiner();
  bandeau();

  let reveil = null;
  window.addEventListener('offline', bandeau);
  window.addEventListener('online', () => {
    bandeau();
    clearTimeout(reveil);
    reveil = setTimeout(auRetour, 1500);      // on laisse le réseau se remettre en route
  });
  auRetour();
})();
