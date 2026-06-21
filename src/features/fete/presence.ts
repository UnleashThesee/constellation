// Fête de la Musique — positions partagées en temps réel (Supabase Realtime presence).
// Le module Supabase est chargé À LA DEMANDE (seulement si configuré) pour ne pas
// alourdir le reste du site. Sans configuration, la fonctionnalité est inactive.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from './types';
import type { PresenceConfig } from './store';

export interface Peer { id: string; name: string; color: string; lat?: number; lng?: number; ts: number }

export function usePresence(cfg: PresenceConfig, me: { id: string }, pos?: GeoPoint): { peers: Peer[]; connected: boolean } {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<any>(null);
  const clientRef = useRef<any>(null);
  // valeurs à jour pour le track sans relancer l'abonnement
  const meta = useRef({ name: cfg.name, color: cfg.color, lat: pos?.lat, lng: pos?.lng });
  meta.current = { name: cfg.name, color: cfg.color, lat: pos?.lat, lng: pos?.lng };

  // (re)connexion quand l'URL / la clé / la salle changent
  useEffect(() => {
    setConnected(false); setPeers([]);
    if (!cfg.url || !cfg.anonKey || !cfg.room) return;
    let cancelled = false;
    let channel: any;
    (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        if (cancelled) return;
        const client = createClient(cfg.url, cfg.anonKey, { realtime: { params: { eventsPerSecond: 4 } } });
        clientRef.current = client;
        channel = client.channel(`fete:${cfg.room}`, { config: { presence: { key: me.id } } });
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const list: Peer[] = [];
          for (const key of Object.keys(state)) {
            if (key === me.id) continue;
            const m = state[key]?.[0];
            if (m) list.push({ id: key, name: m.name ?? '—', color: m.color ?? '#fff', lat: m.lat, lng: m.lng, ts: m.ts ?? 0 });
          }
          if (!cancelled) setPeers(list);
        });
        channel.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            if (!cancelled) setConnected(true);
            await channel.track({ ...meta.current, ts: Date.now() });
          }
        });
        channelRef.current = channel;
      } catch { if (!cancelled) setConnected(false); }
    })();
    return () => {
      cancelled = true;
      try { channel?.unsubscribe(); } catch { /* ignore */ }
      try { clientRef.current?.removeAllChannels?.(); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [cfg.url, cfg.anonKey, cfg.room, me.id]);

  // mise à jour de sa propre position / nom / couleur
  useEffect(() => {
    const ch = channelRef.current;
    if (ch && connected) ch.track({ ...meta.current, ts: Date.now() }).catch(() => {});
  }, [pos?.lat, pos?.lng, cfg.name, cfg.color, connected]);

  return { peers, connected };
}
