// Fête de la Musique — carte Google Maps (vue 3D inclinée + marqueurs live).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import type { Stage, GeoPoint } from './types';
import type { Peer } from './presence';
import { buildPin, type PinData } from './pin';
import { loadGoogleMaps } from './maps';

export function FeteMap({ apiKey, stages, pinData, userPos, focusId, onSelect, others = [] }: {
  apiKey: string;
  stages: Stage[];
  pinData: Record<string, PinData>;
  userPos?: GeoPoint;
  focusId?: string | null;
  onSelect: (id: string) => void;
  others?: Peer[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const userMarkerRef = useRef<any>(null);
  const peerMarkersRef = useRef<Record<string, any>>({});
  const gmapsRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // init carte
  useEffect(() => {
    if (!apiKey || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !ref.current) return;
      gmapsRef.current = maps;
      mapRef.current = new maps.Map(ref.current, {
        center: stages[0] ? { lat: stages[0].lat, lng: stages[0].lng } : { lat: 47.3216, lng: 5.0415 },
        zoom: 15, tilt: 47.5, heading: 0,
        mapId: 'DEMO_MAP_ID',                 // carte vectorielle (3D) + AdvancedMarkers
        disableDefaultUI: false, clickableIcons: false,
        gestureHandling: 'greedy',
      });
      setReady(true);
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // marqueurs des scènes
  useEffect(() => {
    const maps = gmapsRef.current; const map = mapRef.current;
    if (!maps || !map || !ready) return;
    const AdvancedMarker = maps.marker?.AdvancedMarkerElement;
    const seen = new Set<string>();
    for (const s of stages) {
      const d = pinData[s.id]; if (!d) continue;
      seen.add(s.id);
      const content = buildPin(d);
      let m = markersRef.current[s.id];
      if (!m) {
        m = AdvancedMarker
          ? new AdvancedMarker({ map, position: { lat: s.lat, lng: s.lng }, content, title: s.name })
          : new maps.Marker({ map, position: { lat: s.lat, lng: s.lng }, title: s.name });
        m.addListener?.('click', () => onSelect(s.id));
        markersRef.current[s.id] = m;
      } else if (AdvancedMarker) {
        m.content = content;
        m.position = { lat: s.lat, lng: s.lng };
      }
    }
    // retirer les marqueurs disparus
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) { const m = markersRef.current[id]; if (m) m.map = null; delete markersRef.current[id]; }
    }
  }, [stages, pinData, ready, onSelect]);

  // position utilisateur
  useEffect(() => {
    const maps = gmapsRef.current; const map = mapRef.current;
    if (!maps || !map || !ready) return;
    if (!userPos) { if (userMarkerRef.current) { userMarkerRef.current.map = null; userMarkerRef.current = null; } return; }
    const dot = document.createElement('div');
    dot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.35);';
    if (userMarkerRef.current) userMarkerRef.current.map = null;
    const AdvancedMarker = maps.marker?.AdvancedMarkerElement;
    userMarkerRef.current = AdvancedMarker
      ? new AdvancedMarker({ map, position: userPos, content: dot, title: 'Ma position', zIndex: 999 })
      : new maps.Marker({ map, position: userPos, title: 'Ma position' });
  }, [userPos, ready]);

  // autres participants (positions partagées)
  useEffect(() => {
    const maps = gmapsRef.current; const map = mapRef.current;
    if (!maps || !map || !ready) return;
    const AdvancedMarker = maps.marker?.AdvancedMarkerElement;
    for (const m of Object.values(peerMarkersRef.current)) { if (m) m.map = null; }
    peerMarkersRef.current = {};
    for (const p of others) {
      if (p.lat === undefined || p.lng === undefined) continue;
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
      el.innerHTML = `<div style="background:rgba(0,0,0,.7);color:${p.color};font:700 10px/1.1 system-ui;padding:2px 6px;border-radius:6px;white-space:nowrap;">${p.name}</div><div style="width:14px;height:14px;border-radius:50%;background:${p.color};border:2px solid #fff;margin-top:2px;"></div>`;
      peerMarkersRef.current[p.id] = AdvancedMarker
        ? new AdvancedMarker({ map, position: { lat: p.lat, lng: p.lng }, content: el, title: p.name, zIndex: 800 })
        : new maps.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.name });
    }
  }, [others, ready]);

  // focus sur une scène
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusId) return;
    const s = stages.find(x => x.id === focusId);
    if (s) { map.panTo({ lat: s.lat, lng: s.lng }); map.setZoom(17); }
  }, [focusId, ready, stages]);

  const tilt = (delta: number) => { const m = mapRef.current; if (m) m.setTilt(Math.max(0, Math.min(67.5, (m.getTilt?.() ?? 0) + delta))); };
  const rotate = (delta: number) => { const m = mapRef.current; if (m) m.setHeading?.(((m.getHeading?.() ?? 0) + delta + 360) % 360); };

  if (!apiKey) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/30 p-6 text-center">
        <div className="text-3xl">🗺️</div>
        <p className="text-sm font-semibold text-white">Carte 3D Google Maps</p>
        <p className="max-w-xs text-xs text-slate-400">Ajoute ta <b>clé API Google Maps</b> dans les réglages ci-dessus pour afficher la carte interactive. En attendant, tout le reste (live, distances, itinéraires) fonctionne.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <p className="text-sm font-semibold text-rose-300">Carte indisponible</p>
        <p className="max-w-xs text-xs text-slate-400">{error}</p>
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border border-white/10">
      <div ref={ref} className="h-full w-full" />
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[['⤢ +', () => tilt(15)], ['⤡ −', () => tilt(-15)], ['⟲', () => rotate(-30)], ['⟳', () => rotate(30)]].map(([lbl, fn], i) => (
          <button key={i} onClick={fn as () => void}
            className="h-8 w-8 rounded-lg bg-black/70 text-xs font-bold text-white hover:bg-black/90">{lbl as string}</button>
        ))}
      </div>
    </div>
  );
}
