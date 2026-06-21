// Fête de la Musique — positions partagées en temps réel, SANS compte ni clé.
// Canal public MQTT (sur WebSocket). Chacun publie sa position sur le topic du
// « code de groupe » ; tout le monde sur le même code se voit. Module chargé à
// la demande (seulement si activé) pour ne pas alourdir le reste du site.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from './types';
import type { PresenceConfig } from './store';

export interface Peer { id: string; name: string; color: string; lat?: number; lng?: number; ts: number }

// Broker public gratuit (best-effort, pas de compte). Surcouche WebSocket sécurisée.
const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC = (room: string) => `fete-musique-dijon/${room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'public'}`;
const STALE_MS = 25000; // on oublie un ami sans nouvelles depuis 25 s

export function usePresence(cfg: PresenceConfig, me: { id: string }, pos?: GeoPoint): { peers: Peer[]; connected: boolean } {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<any>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const meta = useRef({ name: cfg.name, color: cfg.color, lat: pos?.lat, lng: pos?.lng });
  meta.current = { name: cfg.name, color: cfg.color, lat: pos?.lat, lng: pos?.lng };

  const active = cfg.enabled && !!cfg.name.trim() && !!cfg.room.trim();

  // connexion / reconnexion
  useEffect(() => {
    setConnected(false); peersRef.current.clear(); setPeers([]);
    if (!active) return;
    let cancelled = false;
    let client: any;
    let pubTimer: any; let pruneTimer: any;
    const topic = TOPIC(cfg.room);

    const publish = () => {
      if (!client?.connected) return;
      const m = meta.current;
      client.publish(topic, JSON.stringify({ t: 'pos', id: me.id, name: m.name, color: m.color, lat: m.lat, lng: m.lng, ts: Date.now() }), { qos: 0 });
    };

    (async () => {
      try {
        const mqtt = (await import('mqtt')).default as any;
        if (cancelled) return;
        client = mqtt.connect(BROKER, { clientId: `fete_${me.id.slice(0, 8)}_${Math.random().toString(16).slice(2, 6)}`, reconnectPeriod: 4000, connectTimeout: 8000, clean: true });
        clientRef.current = client;
        client.on('connect', () => { if (cancelled) return; setConnected(true); client.subscribe(topic, { qos: 0 }); publish(); });
        client.on('reconnect', () => { if (!cancelled) setConnected(false); });
        client.on('close', () => { if (!cancelled) setConnected(false); });
        client.on('error', () => { /* best-effort */ });
        client.on('message', (_t: string, payload: Uint8Array) => {
          if (cancelled) return;
          try {
            const d = JSON.parse(new TextDecoder().decode(payload));
            if (d.t === 'bye' && d.id) { peersRef.current.delete(d.id); setPeers([...peersRef.current.values()]); return; }
            if (d.t === 'pos' && d.id && d.id !== me.id) {
              peersRef.current.set(d.id, { id: d.id, name: d.name ?? '—', color: d.color ?? '#fff', lat: d.lat, lng: d.lng, ts: d.ts ?? Date.now() });
              setPeers([...peersRef.current.values()]);
            }
          } catch { /* ignore */ }
        });
        pubTimer = setInterval(publish, 6000);
        pruneTimer = setInterval(() => {
          const cut = Date.now() - STALE_MS; let changed = false;
          for (const [id, p] of peersRef.current) if (p.ts < cut) { peersRef.current.delete(id); changed = true; }
          if (changed) setPeers([...peersRef.current.values()]);
        }, 5000);
      } catch { if (!cancelled) setConnected(false); }
    })();

    return () => {
      cancelled = true;
      clearInterval(pubTimer); clearInterval(pruneTimer);
      try { client?.publish(topic, JSON.stringify({ t: 'bye', id: me.id }), { qos: 0 }); } catch { /* ignore */ }
      try { client?.end(true); } catch { /* ignore */ }
      clientRef.current = null;
    };
  }, [active, cfg.room, me.id]);

  // republie immédiatement quand la position / le nom / la couleur changent
  useEffect(() => {
    const c = clientRef.current;
    if (c?.connected) {
      const m = meta.current;
      c.publish(TOPIC(cfg.room), JSON.stringify({ t: 'pos', id: me.id, name: m.name, color: m.color, lat: m.lat, lng: m.lng, ts: Date.now() }), { qos: 0 });
    }
  }, [pos?.lat, pos?.lng, cfg.name, cfg.color, cfg.room, me.id]);

  return { peers, connected };
}
