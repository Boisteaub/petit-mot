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
  const deNom = (nom) => (/^[aeiouyhàâéèêëîïôûù]/i.test(nom) ? `d'${nom}` : `de ${nom}`);     // « d'Alice », « de Léa »

  document.title = `Un petit mot pour ${enfant}`;
  $('titre').textContent = `Écrire à ${enfant}`;
  $('sous-titre').textContent = `${contact ? `Bonjour ${contact}` : 'Bonjour'}${FINE}! Tes messages arrivent sur sa télé, et ses parents les voient aussi.`;
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

  const NOMS_MEDIA = { photo: '📷 Photo', gif: '🎞️ GIF', video: '🎬 Vidéo', vocal: '🎙️ Message vocal' };
  const minutes = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function bulle(m) {
    // une photo ou une vidéo ne repart que si ce téléphone l'a encore (pas après avoir fermé la page)
    const perdu = m.media && m.etat === 'erreur' && !fichiersPrets.has(m.n);
    const aRenvoyer = m.moi && m.etat === 'erreur' && !revoque && !perdu;
    const relancer = () => (m.media ? envoyerMedia(m) : envoyer(m));
    const contenu = !m.moi && m.media === 'vocal'
      ? [h('button', { type: 'button', class: 'ecouter', onclick: () => ecouterVoix(m) },
          voixEnCours === m.id ? '⏸ Arrêter' : `▶ Écouter${m.duree ? `${NBSP}· ${minutes(m.duree)}` : ''}`),
        m.attente ? h('p', { class: 'attente-voix' }, 'Je la redemande à la maison…') : null]
      : m.media
      ? [m.apercu ? h('img', { class: 'apercu', src: m.apercu, alt: NOMS_MEDIA[m.media] }) : h('p', { class: 'media' }, NOMS_MEDIA[m.media]
          + (m.duree ? `${NBSP}· ${minutes(m.duree)}` : '')),
        m.texte ? h('p', {}, m.texte) : null]
      : [h('p', {}, m.texte)];
    return h('div', {
      class: 'bulle ' + (m.moi ? 'moi' : 'elle'),
      'data-n': m.n || null,
      onclick: aRenvoyer ? relancer : null,
    }, ...contenu,
    h('small', {}, heure(m.cree), m.moi ? `${NBSP}· ` : '',
      m.moi ? (perdu ? h('span', { class: 'erreur' }, 'Pas parti : choisis-le à nouveau')
        : m.media && m.etat === 'envoi' ? h('span', { class: 'progres' }, `Envoi… ${Math.round((m.progres || 0) * 100)}${NBSP}%`)
          : etatDe(m)) : ''),
    aRenvoyer ? h('button', { type: 'button', class: 'reessayer', onclick: (e) => { e.stopPropagation(); relancer(); } }, 'Réessayer') : null);
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
    $('ma-photo').disabled = true;
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
      const piece = evenement.attachment || null;      // sa voix : le fichier chiffré est la pièce jointe du relais
      let m = memoire.messages.find((x) => !x.moi && x.id === p.id);    // déjà là si la maison le renvoie
      if (!m) {
        m = { moi: false, id: p.id, texte: p.texte, cree: p.cree || evenement.time };
        memoire.messages.push(m);
      }
      if (p.media === 'vocal') {
        Object.assign(m, { media: 'vocal', duree: p.duree || 0 });
        if (piece && piece.url) {
          Object.assign(m, { url: piece.url, expire: piece.expires || 0 });
          if (m.attente) { delete m.attente; setTimeout(() => ecouterVoix(m), 0); }     // elle l'avait redemandée
        }
      }
    } else if (p.type === 'message' && p.de === 'contact') {
      const m = memoire.messages.find((x) => x.moi && x.n === p.n);
      if (m) avancer(m, 'envoye');
      else memoire.messages.push({ moi: true, n: p.n, texte: p.texte, cree: p.cree || evenement.time, etat: 'envoye' });
    } else if (p.type === 'media' && p.de === 'contact') {
      const m = memoire.messages.find((x) => x.moi && x.n === p.n);
      if (m && (p.i || 0) === (p.total || 1) - 1 && !enVol.has(m.n)) avancer(m, 'envoye');     // le dernier morceau
    } else if (p.type === 'photo' && p.de !== 'contact') {
      if (photo && photo.n === p.n && ['recue', 'acceptee', 'refusee'].includes(p.etat)) {
        photo.etat = p.etat;
        garder('photo:' + L.s, JSON.stringify(photo));
        dessinerPhoto();
      }
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
    for (const m of memoire.messages.filter((x) => x.moi && x.etat === 'erreur' && (!x.media || fichiersPrets.has(x.n)))) {
      await (m.media ? envoyerMedia(m) : envoyer(m));
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

  // ---------------------------------------------------------------- images (12/10)

  function avis(texte) {
    const a = $('avis');
    a.textContent = texte;
    a.hidden = !texte;
    clearTimeout(avis.minuteur);
    if (texte) avis.minuteur = setTimeout(() => { a.hidden = true; }, 7000);
  }

  // L'image est lue en « data: » (la règle de sécurité de la page refuse les « blob: » pour les images).
  function lireImage(fichier) {
    return new Promise((fin, echec) => {
      const lecteur = new FileReader();
      lecteur.onload = () => {
        const img = new Image();
        img.onload = () => (img.width && img.height ? fin(img) : echec(new Error('vide')));
        img.onerror = echec;
        img.src = lecteur.result;
      };
      lecteur.onerror = echec;
      lecteur.readAsDataURL(fichier);
    });
  }

  /** Image redessinée : « carre » recadre au centre (photo de profil), sinon tout tient dans max × max. */
  function redessiner(img, max, carre, qualite) {
    const k = carre ? Math.max(max / img.width, max / img.height) : Math.min(1, max / Math.max(img.width, img.height));
    const toile = document.createElement('canvas');
    toile.width = carre ? max : Math.round(img.width * k);
    toile.height = carre ? max : Math.round(img.height * k);
    const g = toile.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (toile.width - img.width * k) / 2, (toile.height - img.height * k) / 2, img.width * k, img.height * k);
    return toile.toDataURL('image/jpeg', qualite);
  }

  const octetsDe = (dataUrl) => Chiffre.depuisBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));

  // ---------------------------------------------------------------- ma photo
  //
  // La personne choisit sa photo : réduite ici (192 × 192), envoyée en petits morceaux chiffrés par le relais
  // (4 Ko au plus par message) ; un parent l'accepte avant qu'elle remplace son initiale sur la télé de l'enfant.

  let photo = (() => { try { return JSON.parse(lire('photo:' + L.s)); } catch (e) { return null; } })();   // {n, image, etat}
  let photoEnVol = false;

  function dessinerPhoto() {
    const bouton = $('ma-photo');
    const montre = photo && photo.etat !== 'refusee';
    bouton.replaceChildren(montre ? h('img', { src: photo.image, alt: '' }) : '✉️');
    bouton.setAttribute('aria-label', montre ? 'Changer ma photo' : 'Choisir ma photo');
    const etat = $('photo-etat');
    const textes = {
      envoi: 'Ta photo part…',
      envoyee: `Ta photo est partie${NBSP}: les parents ${deNom(enfant)} vont la regarder.`,
      recue: `Ta photo attend l'accord des parents ${deNom(enfant)}.`,
      acceptee: `Ta photo est sur la télé ${deNom(enfant)}${NBSP}✓`,
      refusee: 'Ta photo n\'a pas été acceptée. Tu peux en choisir une autre.',
      erreur: 'Ta photo n\'est pas partie. Touche ton rond pour réessayer.',
    };
    etat.textContent = photo ? textes[photo.etat] || '' : `Touche le rond pour choisir ta photo${NBSP}: ${enfant} la verra sur sa télé.`;
    etat.classList.toggle('non', !!photo && ['refusee', 'erreur'].includes(photo.etat));
    etat.hidden = revoque;
  }

  async function envoyerPhoto(fichier) {
    if (revoque || photoEnVol) return;
    let image;
    try {
      const img = await lireImage(fichier);
      for (const q of [0.75, 0.55, 0.4]) {                 // au plus 16 morceaux de 2 400 caractères
        image = redessiner(img, 192, true, q);
        if (image.length - image.indexOf(',') - 1 <= 16 * 2400) break;
      }
    } catch (e) {
      return avis('Cette photo ne peut pas être lue. Choisis-en une autre (JPEG ou PNG).');
    }
    const b64 = image.slice(image.indexOf(',') + 1);
    const n = Math.random().toString(36).slice(2, 12);
    const morceaux = b64.match(/.{1,2400}/g);
    const precedente = photo;
    photo = { n, image, etat: 'envoi' };
    photoEnVol = true;
    dessinerPhoto();
    try {
      for (const [i, morceau] of morceaux.entries()) {
        await publier({ type: 'photo', de: 'contact', n, i, total: morceaux.length, morceau });
      }
      if (photo.etat === 'envoi') photo.etat = 'envoyee';      // la maison a peut-être déjà répondu « reçue »
    } catch (e) {
      photo.etat = 'erreur';
      if (precedente && precedente.etat === 'acceptee') avis('Ta photo n\'est pas partie : celle d\'avant reste sur la télé.');
    }
    photoEnVol = false;
    garder('photo:' + L.s, JSON.stringify(photo));
    dessinerPhoto();
  }

  // ---------------------------------------------------------------- photos, GIF et vidéos pour l'enfant
  //
  // Le fichier est chiffré ici avec la clé du lien, puis déposé en pièce jointe sur le relais (15 Mo au plus,
  // gardé 3 h) avec une petite enveloppe chiffrée qui dit ce que c'est. La maison le récupère, ses parents
  // l'acceptent, puis il arrive sur la télé.

  const OCTETS_MAX = 15000000;
  const MORCEAU = 2000000;              // sans compte, le relais n'accepte pas plus de 2 Mo par fichier : on découpe
  const fichiersPrets = new Map();      // n → octets du fichier (pour « Réessayer » tant que la page est ouverte)

  function dureeVideo(fichier) {
    return new Promise((fin) => {
      const url = URL.createObjectURL(fichier);
      const v = document.createElement('video');
      let fini = false;
      const partir = (s) => { if (fini) return; fini = true; clearTimeout(secours); URL.revokeObjectURL(url); fin(s); };
      const secours = setTimeout(() => partir(0), 5000);
      v.preload = 'metadata';
      v.onloadedmetadata = () => partir(Number.isFinite(v.duration) ? Math.round(v.duration) : 0);
      v.onerror = () => partir(0);
      v.src = url;
    });
  }

  async function preparerMedia(fichier) {
    if (fichier.type === 'image/gif') {
      return { media: 'gif', octets: new Uint8Array(await fichier.arrayBuffer()), apercu: null };
    }
    if (fichier.type.startsWith('image/')) {
      const img = await lireImage(fichier);
      const photo_ = redessiner(img, 1280, false, 0.82);
      return { media: 'photo', octets: octetsDe(photo_), apercu: redessiner(img, 240, false, 0.6) };
    }
    if (fichier.type.startsWith('video/')) {
      return { media: 'video', octets: new Uint8Array(await fichier.arrayBuffer()), duree: await dureeVideo(fichier), apercu: null };
    }
    throw new Error('type');
  }

  function deposer(chiffre, enveloppe, avance) {
    return new Promise((fin, echec) => {
      const x = new XMLHttpRequest();
      // sans en-tête particulier : le relais accepte l'envoi directement depuis la page
      x.open('POST', `${relais}?filename=m.bin&message=${encodeURIComponent(enveloppe)}`);
      x.timeout = 300000;
      x.upload.onprogress = (e) => { if (e.lengthComputable) avance(e.loaded / e.total); };
      x.onload = () => (x.status >= 200 && x.status < 300 ? fin() : echec(new Error(String(x.status))));
      x.onerror = () => echec(new Error('réseau'));
      x.ontimeout = () => echec(new Error('trop long'));
      x.send(new Blob([chiffre]));
    });
  }

  function montrerProgres(m) {
    const p = document.querySelector(`.bulle[data-n="${m.n}"] .progres`);
    if (p) p.textContent = `Envoi… ${Math.round((m.progres || 0) * 100)}${NBSP}%`;
  }

  async function envoyerMedia(m) {
    const octets = fichiersPrets.get(m.n);
    if (revoque || !octets || enVol.has(m.n)) return;
    enVol.add(m.n);
    m.etat = 'envoi';
    m.progres = 0;
    sauver();
    dessiner();
    try {
      const chiffre = await Chiffre.scellerFichier(L.k, octets, (f) => { m.progres = f * 0.1; montrerProgres(m); });
      const total = Math.ceil(chiffre.length / MORCEAU);
      for (let i = 0; i < total; i++) {
        const enveloppe = await Chiffre.sceller(L.k, JSON.stringify({
          type: 'media', de: 'contact', n: m.n, genre: m.media, legende: m.texte || '', duree: m.duree || 0, cree: m.cree, i, total,
        }));
        await deposer(chiffre.subarray(i * MORCEAU, (i + 1) * MORCEAU), enveloppe,
          (f) => { m.progres = 0.1 + (0.9 * (i + f)) / total; montrerProgres(m); });
      }
      relaisRepond(true);
      avancer(m, 'envoye');
      fichiersPrets.delete(m.n);
    } catch (e) {
      if (m.etat === 'envoi') m.etat = 'erreur';
      if (e.message === '413') avis('Le relais a reçu beaucoup d\'envois : réessaie dans quelques heures.');
      if (navigator.onLine === false) relaisRepond(false);
    }
    enVol.delete(m.n);
    sauver();
    dessiner();
  }

  async function joindre(fichier) {
    if (revoque) return;
    if (fichier.size > (fichier.type.startsWith('video/') || fichier.type === 'image/gif' ? OCTETS_MAX : 40000000)) {
      return avis(fichier.type.startsWith('video/')
        ? 'Vidéo trop lourde : 15 Mo au plus (environ 30 secondes filmées au téléphone).'
        : 'Fichier trop lourd : 15 Mo au plus.');
    }
    let pret;
    try {
      pret = await preparerMedia(fichier);
    } catch (e) {
      return avis('Ce fichier ne peut pas être lu. Choisis une photo, un GIF ou une vidéo.');
    }
    const texte = champ.value.trim().replace(/\s+/g, ' ').slice(0, 200);     // ce qui est écrit devient la légende
    champ.value = '';
    champ.style.height = 'auto';
    const m = {
      moi: true, n: Math.random().toString(36).slice(2, 12), media: pret.media, texte, duree: pret.duree || 0,
      apercu: pret.apercu, cree: Math.floor(Date.now() / 1000), etat: 'envoi',
    };
    fichiersPrets.set(m.n, pret.octets);
    memoire.messages.push(m);
    envoyerMedia(m);
  }

  // ---------------------------------------------------------------- messages vocaux
  //
  // Sa voix, enregistrée ici (2 min au plus), part comme une photo : chiffrée, en pièce jointe du relais,
  // acceptée par les parents. La voix de l'enfant arrive de la même façon ; le relais ne la garde que 3 h :
  // plus tard, la page la redemande à la maison.

  let enregistreur = null;
  let debutVoix = 0;
  let minuteurVoix = null;
  let garderVoix = false;

  const formatVoix = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
    .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';

  async function commencerVoix() {
    if (revoque || enregistreur) return;
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return avis('Le micro n\'est pas autorisé. Autorise-le dans ton navigateur, puis réessaie.');
    }
    const format = formatVoix();
    let r;
    try {
      r = format ? new MediaRecorder(flux, { mimeType: format }) : new MediaRecorder(flux);
    } catch (e) {
      flux.getTracks().forEach((t) => t.stop());
      return avis('Ce téléphone ne sait pas enregistrer la voix ici.');
    }
    const morceaux = [];
    r.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
    r.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      clearInterval(minuteurVoix);
      $('enregistrement').hidden = true;
      $('saisie').hidden = revoque;
      enregistreur = null;
      const duree = Math.round((Date.now() - debutVoix) / 1000);
      if (!garderVoix) return;
      if (duree < 1 || !morceaux.length) return avis('Je n\'ai rien entendu. Touche 🎤, parle, puis « Envoyer ».');
      const octets = new Uint8Array(await new Blob(morceaux).arrayBuffer());
      const m = {
        moi: true, n: Math.random().toString(36).slice(2, 12), media: 'vocal', texte: '', duree,
        apercu: null, cree: Math.floor(Date.now() / 1000), etat: 'envoi',
      };
      fichiersPrets.set(m.n, octets);
      memoire.messages.push(m);
      envoyerMedia(m);
    };
    enregistreur = r;
    garderVoix = false;
    debutVoix = Date.now();
    r.start();
    $('saisie').hidden = true;
    $('enregistrement').hidden = false;
    $('duree-voix').textContent = '0:00';
    minuteurVoix = setInterval(() => {
      const s = Math.round((Date.now() - debutVoix) / 1000);
      $('duree-voix').textContent = minutes(s);
      if (s >= 120) finirVoix(true);                 // 2 min au plus
    }, 250);
  }

  function finirVoix(envoyer) {
    if (!enregistreur || enregistreur.state === 'inactive') return;
    garderVoix = envoyer;
    enregistreur.stop();
  }

  let voixEnCours = null;           // id de la voix de l'enfant en train d'être écoutée
  let lecteur = null;
  const voixPretes = new Map();     // id → adresse « blob: » déjà déchiffrée (réécouter sans retélécharger)

  async function ecouterVoix(m) {
    if (lecteur) {
      lecteur.pause();
      const meme = voixEnCours === m.id;
      lecteur = null;
      voixEnCours = null;
      dessiner();
      if (meme) return;
    }
    let adresse = voixPretes.get(m.id);
    if (!adresse) {
      let clair = null;
      if (m.url && (!m.expire || m.expire > Date.now() / 1000 + 30)) {
        try {
          const r = await fetch(m.url);
          if (r.ok) clair = await Chiffre.ouvrirFichier(L.k, new Uint8Array(await r.arrayBuffer()));
        } catch (e) { /* plus sur le relais, ou pas de réseau */ }
      }
      if (!clair) {
        if (revoque) return avis('Ce message n\'est plus disponible.');
        m.attente = true;
        dessiner();
        try {
          await publier({ type: 'renvoyer', de: 'contact', id: m.id });
        } catch (e) {
          delete m.attente;
          dessiner();
          return avis('Pas de connexion : réessaie dans un moment.');
        }
        return;
      }
      adresse = URL.createObjectURL(new Blob([clair], { type: 'audio/wav' }));
      voixPretes.set(m.id, adresse);
    }
    lecteur = new Audio(adresse);
    voixEnCours = m.id;
    lecteur.onended = () => { lecteur = null; voixEnCours = null; dessiner(); };
    dessiner();
    try {
      await lecteur.play();
    } catch (e) {
      lecteur = null;
      voixEnCours = null;
      dessiner();
    }
  }

  $('micro').addEventListener('click', commencerVoix);
  $('voix-annuler').addEventListener('click', () => finirVoix(false));
  $('voix-envoyer').addEventListener('click', () => finirVoix(true));

  $('ma-photo').addEventListener('click', () => { if (!revoque && !photoEnVol) $('choix-photo').click(); });
  $('choix-photo').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) envoyerPhoto(f); });
  $('choix-fichier').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) joindre(f); });

  // ---------------------------------------------------------------- au démarrage

  // Les anciens messages de plus de 60 jours sont oubliés sur ce téléphone ;
  // un message resté « Envoi… » (page fermée trop tôt) repartira tout seul.
  memoire.messages = memoire.messages.filter((m) => Date.now() / 1000 - m.cree < 60 * JOUR);
  for (const m of memoire.messages) if (m.moi && m.etat === 'envoi') m.etat = 'erreur';
  for (const m of memoire.messages) delete m.attente;        // une voix redemandée avant de fermer la page
  if (photo && photo.etat === 'envoi') photo.etat = 'erreur';

  if (revoque) montrerRevoque();
  else {
    $('saisie').hidden = false;
    $('ma-photo').disabled = false;
  }
  dessinerPhoto();
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
