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

  racine.Chiffre = { sceller, ouvrir, depuisBase64 };
})(typeof window !== 'undefined' ? window : globalThis);
