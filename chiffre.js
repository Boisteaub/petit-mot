/*
 * Chiffrement des petits mots : exactement le même que sceller() / ouvrir() du serveur de la maison
 * (flux HMAC-SHA256 + sceau HMAC-SHA256, clé de 32 octets en hexadécimal, enveloppe en base64 « url »).
 * La clé n'est connue que de la maison et de la personne invitée : elle est dans son lien, après le « # ».
 */
(function (racine) {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function hex(h) {
    return Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
  }

  function concat(...morceaux) {
    const total = morceaux.reduce((n, m) => n + m.length, 0);
    const r = new Uint8Array(total);
    let i = 0;
    for (const m of morceaux) {
      r.set(m, i);
      i += m.length;
    }
    return r;
  }

  async function hmac(cle, donnees) {
    const k = await racine.crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await racine.crypto.subtle.sign('HMAC', k, donnees));
  }

  async function flux(kFlux, nonce, longueur) {
    const blocs = [];
    for (let i = 0; i <= Math.floor(longueur / 32); i++) {
      const compteur = new Uint8Array(4);
      new DataView(compteur.buffer).setUint32(0, i);
      blocs.push(await hmac(kFlux, concat(nonce, compteur)));
    }
    return concat(...blocs);
  }

  function versBase64(octets) {
    let s = '';
    for (const o of octets) s += String.fromCharCode(o);
    return racine.btoa(s).replace(/\+/g, '-').replace(/\//g, '_');
  }

  function depuisBase64(texte) {
    const t = texte.replace(/-/g, '+').replace(/_/g, '/');
    const s = racine.atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  async function sceller(cleHex, texte) {
    const cle = hex(cleHex);
    const kFlux = await hmac(cle, enc.encode('chiffrer'));
    const kSceau = await hmac(cle, enc.encode('sceller'));
    const nonce = racine.crypto.getRandomValues(new Uint8Array(16));
    const clair = enc.encode(texte);
    const f = await flux(kFlux, nonce, clair.length);
    const chiffre = clair.map((o, i) => o ^ f[i]);
    const sceau = await hmac(kSceau, concat(nonce, chiffre));
    return versBase64(concat(nonce, chiffre, sceau));
  }

  /** Renvoie le texte, ou null si l'enveloppe n'a pas été fermée avec cette clé. */
  async function ouvrir(cleHex, enveloppe) {
    let brut;
    try {
      brut = depuisBase64(enveloppe);
    } catch (e) {
      return null;
    }
    if (brut.length < 48) return null;
    const nonce = brut.slice(0, 16);
    const chiffre = brut.slice(16, brut.length - 32);
    const sceau = brut.slice(brut.length - 32);
    const cle = hex(cleHex);
    const kFlux = await hmac(cle, enc.encode('chiffrer'));
    const kSceau = await hmac(cle, enc.encode('sceller'));
    const attendu = await hmac(kSceau, concat(nonce, chiffre));
    let ecart = 0;
    for (let i = 0; i < 32; i++) ecart |= attendu[i] ^ sceau[i];
    if (ecart !== 0) return null;
    const f = await flux(kFlux, nonce, chiffre.length);
    return dec.decode(chiffre.map((o, i) => o ^ f[i]));
  }

  // ---------------------------------------------------------------- fichiers (photos, GIF, vidéos)
  //
  // Comme ouvrir_fichier() du serveur : nonce (16) + chiffré + sceau (32), sans base64. Le flux est
  // SHA-256(clé « fichier », nonce, numéro du bloc) : calculé ici directement (une vidéo de 15 Mo = 470 000 blocs,
  // bien trop d'appels pour crypto.subtle), le sceau HMAC-SHA256 par crypto.subtle en une fois.

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** SHA-256 d'un message de 52 octets (clé 32 + nonce 16 + numéro 4) : un seul bloc de 64 octets une fois complété. */
  function blocFlux(entete, numero, sortie) {
    const w = new Uint32Array(64);
    w.set(entete);                  // 12 mots : clé et nonce
    w[12] = numero;
    w[13] = 0x80000000;             // fin du message
    w[15] = 52 * 8;                 // longueur en bits
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H0;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    const r = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) sortie[i] = (H0[i] + r[i]) | 0;
  }

  /** Chiffre un fichier (Uint8Array) pour la maison ; « avance(fraction) » suit le travail, la page reste vivante. */
  async function scellerFichier(cleHex, clair, avance) {
    const cle = hex(cleHex);
    const kFlux = await hmac(cle, enc.encode('fichier'));
    const kSceau = await hmac(cle, enc.encode('sceller-fichier'));
    const nonce = racine.crypto.getRandomValues(new Uint8Array(16));
    const entete = new Uint32Array(12);
    const vue = new DataView(concat(kFlux, nonce).buffer);
    for (let i = 0; i < 12; i++) entete[i] = vue.getUint32(i * 4);
    const resultat = new Uint8Array(16 + clair.length + 32);
    resultat.set(nonce, 0);
    resultat.set(clair, 16);
    const chiffre = resultat.subarray(16, 16 + clair.length);
    const mots = new Uint32Array(8);
    const blocs = Math.ceil(clair.length / 32);
    for (let i = 0; i < blocs; i++) {
      blocFlux(entete, i, mots);
      const debut = i * 32;
      for (let j = 0; j < 32 && debut + j < chiffre.length; j++) {
        chiffre[debut + j] ^= (mots[j >> 2] >>> (24 - 8 * (j & 3))) & 0xff;
      }
      if (i % 32768 === 32767) {              // tous les Mo : on rend la main (barre qui avance)
        if (avance) avance(i / blocs);
        await new Promise((fin) => setTimeout(fin, 0));
      }
    }
    resultat.set(await hmac(kSceau, resultat.subarray(0, 16 + clair.length)), 16 + clair.length);
    return resultat;
  }

  racine.Chiffre = { sceller, ouvrir, depuisBase64, scellerFichier };
})(typeof window !== 'undefined' ? window : globalThis);
