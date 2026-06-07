// Étape 0 — Réglage : import des projets, participants, critères.
import { useEffect, useRef, useState } from 'react';
import type { ACProject, ACSession, Criterion, ProjectMeta } from './types';
import {
  listProjects, addProjectFromFile, addTextProject, deleteProject, patchProject,
  patchSession, setStage, CATEGORICAL_DIMS, capitalIntensity, DEFAULT_CRITERIA, makeCriteria,
} from './db';
import { Btn, Card, ProjectMedia } from './ui';
import { MetaChips, MetaEditor } from './meta';

export function SetupScreen({ session, onChanged }: { session: ACSession; onChanged: () => void }) {
  const [projects, setProjects] = useState<ACProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>(session.criteria);
  const [parts, setParts] = useState(session.participants.map(p => p.name));
  const [editing, setEditing] = useState<ACProject | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => listProjects(session.id).then(setProjects);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [session.id]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let order = projects.length;
    for (const f of Array.from(files)) {
      await addProjectFromFile(session.id, f, order++);
    }
    await reload();
    setBusy(false);
  };

  const saveCriteria = async (next: Criterion[]) => {
    setCriteria(next);
    await patchSession(session.id, { criteria: next });
  };
  const saveParticipants = async (names: string[]) => {
    setParts(names);
    const next = session.participants.map((p, i) => ({ ...p, name: names[i] ?? p.name }));
    await patchSession(session.id, { participants: next });
    onChanged();
  };

  const canStart = projects.length >= 2 && criteria.length >= 1 && parts.every(n => n.trim());

  const start = async () => {
    await setStage(session.id, 'tri');
    onChanged();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Participants */}
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold text-white">Les participants</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {parts.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 shrink-0 rounded-full" style={{ background: session.participants[i]?.color }} />
              <input value={name} onChange={e => {
                const next = [...parts]; next[i] = e.target.value; saveParticipants(next);
              }} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
            </div>
          ))}
        </div>
      </Card>

      {/* Critères */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Les 5 critères <span className="text-slate-400">(étape 2)</span></h2>
          <Btn variant="soft" className="text-xs" onClick={() => {
            if (confirm('Remplacer les critères actuels par les 5 méta-critères recommandés ? (les notes déjà saisies seraient à refaire)')) {
              saveCriteria(makeCriteria(DEFAULT_CRITERIA));
            }
          }}>↺ Recharger les 5 méta-critères recommandés</Btn>
        </div>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={c.id} className="rounded-lg bg-black/10 p-2">
              <div className="grid items-center gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input value={c.name} onChange={e => {
                  const next = [...criteria]; next[i] = { ...c, name: e.target.value }; saveCriteria(next);
                }} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-400" />
                <input value={c.definition} placeholder="Définition / barème…" onChange={e => {
                  const next = [...criteria]; next[i] = { ...c, definition: e.target.value }; saveCriteria(next);
                }} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300 outline-none focus:border-amber-400" />
                <div className="flex items-center gap-1">
                  <label className="text-[11px] text-slate-500">poids</label>
                  <input type="number" min={0} max={9} step={1} value={c.weight} onChange={e => {
                    const next = [...criteria]; next[i] = { ...c, weight: Math.max(0, +e.target.value) }; saveCriteria(next);
                  }} className="w-14 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-sm text-white outline-none focus:border-amber-400" />
                  <Btn variant="ghost" onClick={() => saveCriteria(criteria.filter((_, k) => k !== i))} title="Supprimer">✕</Btn>
                </div>
              </div>
              {c.checklist && c.checklist.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">absorbe :</span>
                  {c.checklist.map((s, k) => (
                    <span key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{s}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <Btn variant="ghost" className="mt-2" onClick={() => saveCriteria([...criteria, { id: crypto.randomUUID(), name: 'Nouveau critère', definition: '', weight: 1 }])}>+ Ajouter un critère</Btn>
      </Card>

      {/* Projets */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Les projets <span className="text-slate-400">({projects.length})</span></h2>
          <div className="flex gap-2">
            <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Import…' : '+ Importer images / PDF'}</Btn>
            <Btn variant="soft" onClick={async () => { await addTextProject(session.id, `Projet ${projects.length + 1}`, projects.length); reload(); }}>+ Projet texte</Btn>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => onFiles(e.target.files)} />

        {/* Filtres (regrouper par variable catégorielle / intensité capi.) */}
        {projects.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Filtrer&nbsp;:</span>
            {CATEGORICAL_DIMS.map(d => (
              <select key={d.key} value={filters[d.key] ?? ''} onChange={e => setFilters(f => ({ ...f, [d.key]: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-400">
                <option value="">{d.label}</option>
                {d.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            <select value={filters._capi ?? ''} onChange={e => setFilters(f => ({ ...f, _capi: e.target.value }))}
              className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-400">
              <option value="">Intensité capi.</option>
              <option value="1">≥ légère</option>
              <option value="2">≥ moyenne</option>
              <option value="3">forte</option>
            </select>
            {Object.values(filters).some(Boolean) && <Btn variant="ghost" className="px-2 py-1 text-xs" onClick={() => setFilters({})}>Réinitialiser</Btn>}
          </div>
        )}

        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          className="rounded-xl border-2 border-dashed border-white/10 p-4">
          {projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Glissez-déposez vos ~50 projets ici (images ou PDF), ou cliquez sur « Importer ».</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {projects.filter(p =>
                CATEGORICAL_DIMS.every(d => !filters[d.key] || (p.meta?.[d.key as keyof ProjectMeta] === filters[d.key]))
                && (!filters._capi || capitalIntensity(p.meta) >= +filters._capi),
              ).map(p => (
                <div key={p.id} className="group relative">
                  <ProjectMedia project={p} className="aspect-[4/3] w-full" />
                  <input value={p.title} onChange={e => { patchProject(p.id, { title: e.target.value }); setProjects(ps => ps.map(x => x.id === p.id ? { ...x, title: e.target.value } : x)); }}
                    className="mt-1 w-full rounded bg-black/20 px-2 py-1 text-xs text-white outline-none focus:bg-black/40" />
                  <div className="mt-1 min-h-[18px]"><MetaChips meta={p.meta} /></div>
                  <button onClick={() => setEditing(p)}
                    className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 opacity-0 transition group-hover:opacity-100">⚙ Variables</button>
                  <button onClick={async () => { await deleteProject(p.id); reload(); }}
                    className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 text-xs text-rose-300 group-hover:block">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {editing && (
        <MetaEditor project={editing} onClose={() => setEditing(null)}
          onSaved={(meta) => setProjects(ps => ps.map(x => x.id === editing.id ? { ...x, meta } : x))} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{canStart ? 'Prêt pour le grand tri.' : 'Ajoutez au moins 2 projets pour démarrer.'}</p>
        <Btn variant="primary" disabled={!canStart} onClick={start}>Lancer l'étape 1 — le tri →</Btn>
      </div>
    </div>
  );
}
