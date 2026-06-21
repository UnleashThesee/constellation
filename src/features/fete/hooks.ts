// Fête de la Musique — hooks live (horloge + géolocalisation).
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from './types';

/** Renvoie l'horodatage courant, mis à jour chaque `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; point: GeoPoint; accuracy: number }
  | { status: 'error'; message: string };

/** Suit la position de l'utilisateur (watchPosition) une fois activé. */
export function useGeolocation(): { state: GeoState; enable: () => void } {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const watchId = useRef<number | null>(null);

  const enable = () => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', message: 'La géolocalisation n\'est pas disponible sur cet appareil.' });
      return;
    }
    setState({ status: 'loading' });
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => setState({ status: 'ok', point: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy }),
      (err) => setState({ status: 'error', message: err.message || 'Position indisponible.' }),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  };

  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);
  return { state, enable };
}
