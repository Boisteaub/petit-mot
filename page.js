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

  // ---------------------------------------------------------------- le lien d'invitation

  function lireLien() {
    const brut = location.hash.slice(1);
    if (brut) {
      try {
        const infos = JSON.parse(new TextDecoder().decode(Chiffre.depuisBase64(brut)));
        if (infos.s && infos.k && infos.r) {
          garder('dernier', brut);
          return infos;
        }
      } catch (e) { /* lien abîmé */ }
    }
    const dernier = lire('dernier');      // ouvert depuis l'écran d'accueil, sans le « # »
    if (dernier) {
      try {
        return JSON.parse(new TextDecoder().decode(Chiffre.depuisBase64(dernier)));
      } catch (e) { /* rien */ }
    }
    return null;
  }

  function lire(cle) { try { return localStorage.getItem('petit-mot:' + cle); } catch (e) { return null; } }
  function garder(cle, valeur) { try { localStorage.setItem('petit-mot:' + cle, valeur); } catch (e) { /* stockage refusé */ } }

  const L = lireLien();
  if (!L) {
    $('titre').textContent = 'Lien incomplet';
    $('sous-titre').textContent = 'Demande un nouveau lien aux parents.';
    return;
  }
  const relais = L.r.replace(/\/$/, '') + '/' + L.s;
  const enfant = L.a || 'l\'enfant';

  document.title = `Un petit mot pour ${enfant}`;
  $('titre').textContent = `Écrire à ${enfant}`;
  $('sous-titre').textContent = `Bonjour ${L.c || ''} ! Tes messages sont lus par ses parents avant d'arriver sur sa télé.`;
  $('texte').placeholder = `Écris ton message à ${enfant}…`;
  $('note').textContent = `Garde ce lien pour toi : il sert à écrire à ${enfant}.`;
  $('saisie').hidden = false;

  // ---------------------------------------------------------------- l'historique (gardé sur ce téléphone)

  // Le relais ne garde les messages que quelques heures : la conversation est aussi rangée sur ce téléphone.
  const memoire = (() => {
    try { return JSON.parse(lire('fil:' + L.s)) || { messages: [], depuis: 0 }; } catch (e) { return { messages: [], depuis: 0 }; }
  })();
  const sauver = () => garder('fil:' + L.s, JSON.stringify({ messages: memoire.messages.slice(-200), depuis: memoire.depuis }));

  function heure(ts) {
    const d = new Date(ts * 1000);
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    if (d.toDateString() === new Date().toDateString()) return h;
    return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${h}`;
  }

  function etatDe(m) {
    if (m.etat === 'lu') return h('span', { class: 'remis' }, `Lu par ${enfant} ✓✓`);
    if (m.etat === 'remis') return h('span', { class: 'remis' }, `Remis à ${enfant} ✓`);
    if (m.etat === 'erreur') return h('span', { class: 'erreur' }, 'Pas parti : touche pour réessayer');
    if (m.etat === 'envoi') return 'Envoi…';
    return 'Envoyé · ses parents vont le lire';
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

  function dessiner() {
    const fil = $('fil');
    fil.replaceChildren(...(memoire.messages.length ? memoire.messages.map((m) => h('div', {
      class: 'bulle ' + (m.moi ? 'moi' : 'elle'),
      onclick: m.moi && m.etat === 'erreur' ? () => envoyer(m) : null,
    }, h('p', {}, m.texte), h('small', {}, heure(m.cree), m.moi ? ' · ' : '', m.moi ? etatDe(m) : '')))
      : [h('p', { class: 'vide' }, `Pas encore de message. Écris le premier petit mot pour ${enfant} !`)]));
    fil.scrollTop = fil.scrollHeight;
  }

  // ---------------------------------------------------------------- le relais

  async function recevoir(evenement) {
    if (evenement.event !== 'message') return;
    memoire.depuis = Math.max(memoire.depuis, evenement.time || 0);
    const texte = await Chiffre.ouvrir(L.k, evenement.message || '');
    if (!texte) return;
    let p;
    try { p = JSON.parse(texte); } catch (e) { return; }
    if (p.type === 'message' && p.de === 'enfant') {
      if (!memoire.messages.some((m) => !m.moi && m.id === p.id)) {
        memoire.messages.push({ moi: false, id: p.id, texte: p.texte, cree: p.cree || evenement.time });
      }
    } else if (p.type === 'message' && p.de === 'contact') {
      const m = memoire.messages.find((x) => x.moi && x.n === p.n);
      if (m && m.etat === 'envoi') m.etat = 'envoye';
      else if (!m) memoire.messages.push({ moi: true, n: p.n, texte: p.texte, cree: p.cree || evenement.time, etat: 'envoye' });
    } else if (p.type === 'remis' || p.type === 'lu') {
      const m = memoire.messages.find((x) => x.moi && x.n === p.ref);
      if (m && m.etat !== 'lu') m.etat = p.type;
    }
    memoire.messages.sort((x, y) => x.cree - y.cree);
    sauver();
    dessiner();
  }

  async function rattraper() {
    try {
      const depuis = memoire.depuis ? memoire.depuis + 1 : '12h';
      const r = await fetch(`${relais}/json?poll=1&since=${depuis}`);
      const lignes = (await r.text()).split('\n').filter(Boolean);
      for (const l of lignes) await recevoir(JSON.parse(l));
    } catch (e) { /* hors ligne : on réessaiera */ }
  }

  function ecouter() {
    const source = new EventSource(`${relais}/sse?since=${memoire.depuis ? memoire.depuis + 1 : 'all'}`);
    source.onmessage = (e) => {
      try { recevoir(JSON.parse(e.data)); } catch (err) { /* message illisible */ }
    };
  }

  async function envoyer(m) {
    m.etat = 'envoi';
    dessiner();
    try {
      const enveloppe = await Chiffre.sceller(L.k, JSON.stringify({ type: 'message', de: 'contact', n: m.n, texte: m.texte, cree: m.cree }));
      const r = await fetch(relais, { method: 'POST', body: enveloppe });
      if (!r.ok) throw new Error(r.status);
      if (m.etat === 'envoi') m.etat = 'envoye';
    } catch (e) {
      m.etat = 'erreur';
    }
    sauver();
    dessiner();
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
    const texte = champ.value.trim().replace(/\s+/g, ' ');
    if (!texte) return;
    champ.value = '';
    champ.style.height = 'auto';
    const m = { moi: true, n: Math.random().toString(36).slice(2, 12), texte, cree: Math.floor(Date.now() / 1000), etat: 'envoi' };
    memoire.messages.push(m);
    envoyer(m);
  });

  // Les anciens messages de plus de 60 jours sont oubliés sur ce téléphone
  memoire.messages = memoire.messages.filter((m) => Date.now() / 1000 - m.cree < 60 * JOUR);
  dessiner();
  rattraper().then(ecouter);
})();
