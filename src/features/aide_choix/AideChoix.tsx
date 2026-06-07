// Aide au choix — racine : liste des sessions + shell d'étapes.
import { useEffect, useState } from 'react';
import type { ACSession } from './types';
import { listSessions, createSession, deleteSession, getSession, setStage } from './db';
import { Btn, Card, Stepper, STAGE_LABEL } from './ui';
import { SetupScreen } from './SetupScreen';
import { TriScreen } from './TriScreen';
import { TriResultsScreen } from './TriResultsScreen';
import { NotationScreen } from './NotationScreen';
import { NotationResultsScreen } from './NotationResultsScreen';
import { DuelScreen } from './DuelScreen';
import { FinalScreen } from './FinalScreen';

export function AideChoix() {
  const [sessions, setSessions] = useState<ACSession[]>([]);
  const [active, setActive] = useState<ACSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [names, setNames] = useState(['', '', '']);

  const reloadList = () => listSessions().then(setSessions);
  useEffect(() => { reloadList(); }, []);

  const refreshActive = async () => {
    if (!active) return;
    const s = await getSession(active.id);
    if (s) setActive(s);
    reloadList();
  };

  const create = async () => {
    const s = await createSession({ name, participantNames: names });
    setCreating(false); setName(''); setNames(['', '', '']);
    setActive(s); reloadList();
  };

  // ── Vue liste ──────────────────────────────────────────────────────────────
  if (!active) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white">Aide au choix</h1>
              <p className="text-sm text-slate-400">Trier, noter, départager ~50 projets à plusieurs.</p>
            </div>
            <Btn variant="primary" onClick={() => setCreating(c => !c)}>+ Nouvelle session</Btn>
          </div>

          {creating && (
            <Card className="space-y-3 p-5">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la session (ex. Projets 2026)"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[#F58F20]" />
              <div className="grid grid-cols-3 gap-2">
                {names.map((n, i) => (
                  <input key={i} value={n} onChange={e => { const nx = [...names]; nx[i] = e.target.value; setNames(nx); }}
                    placeholder={`Personne ${i + 1}`}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[#F58F20]" />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => setCreating(false)}>Annuler</Btn>
                <Btn variant="primary" onClick={create}>Créer</Btn>
              </div>
            </Card>
          )}

          {sessions.length === 0 && !creating && (
            <Card className="p-10 text-center text-slate-400">Aucune session. Crée-en une pour commencer.</Card>
          )}

          <div className="space-y-2">
            {sessions.map(s => (
              <Card key={s.id} className="flex items-center gap-3 p-3">
                <button onClick={() => setActive(s)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-bold text-white">{s.name}</div>
                  <div className="text-xs text-slate-400">{STAGE_LABEL[s.stage]} · {s.participants.map(p => p.name).join(', ')}</div>
                </button>
                <Btn variant="ghost" onClick={() => setActive(s)}>Ouvrir →</Btn>
                <Btn variant="ghost" className="text-rose-300" onClick={async () => { if (confirm(`Supprimer « ${s.name} » ?`)) { await deleteSession(s.id); reloadList(); } }}>Suppr.</Btn>
              </Card>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // ── Vue session ──────────────────────────────────────────────────────────────
  const screen = (() => {
    switch (active.stage) {
      case 'setup': return <SetupScreen session={active} onChanged={refreshActive} />;
      case 'tri': return <TriScreen session={active} onChanged={refreshActive} />;
      case 'triResults': return <TriResultsScreen session={active} onChanged={refreshActive} />;
      case 'notation': return <NotationScreen session={active} onChanged={refreshActive} />;
      case 'notationResults': return <NotationResultsScreen session={active} onChanged={refreshActive} />;
      case 'duels': return <DuelScreen session={active} onChanged={refreshActive} />;
      case 'final': return <FinalScreen session={active} onChanged={refreshActive} />;
    }
  })();

  return (
    <Shell>
      <div className="mx-auto mb-5 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Btn variant="ghost" onClick={() => setActive(null)}>← Sessions</Btn>
          <span className="font-bold text-white">{active.name}</span>
        </div>
        <Stepper stage={active.stage} onJump={async (s) => { await setStage(active.id, s); refreshActive(); }} />
      </div>
      {screen}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#262626] px-4 py-6 text-slate-100" style={{ colorScheme: 'dark' }}>
      {children}
    </div>
  );
}
