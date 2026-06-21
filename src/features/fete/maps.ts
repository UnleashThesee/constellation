// Fête de la Musique — chargement de l'API Google Maps (avec la clé de l'utilisateur).
// On type en `any` : pas de @types/google.maps (évite une dépendance lourde).
/* eslint-disable @typescript-eslint/no-explicit-any */

let loadPromise: Promise<any> | null = null;

/** Charge l'API Google Maps une seule fois et résout avec `google.maps`. */
export function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const cbName = '__feteGmapsReady';
    w[cbName] = () => resolve(w.google.maps);
    const s = document.createElement('script');
    // v=weekly + bibliothèques marker (AdvancedMarker) ; carte vectorielle via mapId.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker&loading=async&callback=${cbName}`;
    s.async = true;
    s.onerror = () => { loadPromise = null; reject(new Error('Échec du chargement de Google Maps (clé invalide ou réseau ?).')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** Lien Google Maps « itinéraire à pied » vers un point (ouvre l'app Maps, sans clé). */
export function directionsUrl(lat: number, lng: number, label?: string): string {
  const dest = label ? `${lat},${lng} (${encodeURIComponent(label)})` : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
}
