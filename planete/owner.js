/* ============================================================================
   Outils réservés au propriétaire du site (réglages, placement des objets).
   Ouverts seulement :
   - en local (localhost, 127.0.0.1) pendant le développement ;
   - ou quand on est connecté à l'administration du site (admin.html) avec un
     compte administrateur : la session Supabase est gardée dans ce navigateur.
   Ces outils ne modifient que l'affichage de ce navigateur (rien n'est
   enregistré sur le serveur) : ce contrôle suffit à les cacher aux visiteurs.
   ============================================================================ */
const ADMINS = ['stephane.donchery@gmail.com'];   // (les mêmes que dans admin.html)

/** Vrai si la session gardée (stockage du navigateur) est celle d'un administrateur. */
export function ownerFrom(hostname, store) {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname || '')) return true;
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i); if (!/^sb-.+-auth-token$/.test(k)) continue;
      const s = JSON.parse(store.getItem(k) || 'null'), u = s && (s.user || (s.currentSession && s.currentSession.user));
      if (u && s.refresh_token !== undefined && ADMINS.includes(String(u.email || '').toLowerCase())) return true;
    }
  } catch (e) { /* rien */ }
  return false;
}

export const IS_OWNER = (() => { try { return ownerFrom(location.hostname, localStorage); } catch (e) { return false; } })();
