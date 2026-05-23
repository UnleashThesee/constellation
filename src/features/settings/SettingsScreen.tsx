import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster, FileSeal } from '../../components/ui/atoms';
import { ColorPickerModal } from '../../components/ui/ColorPickerModal';
import { CATEGORIES, CATEGORY_LIST, applyPaletteOverrides } from '../../lib/categories';
import { db, getSettings, saveSettings, saveProfile, exportAllAsCsv, importFromJson, cleanupExpiredCaches, cleanupOrphanTags, cleanupDanglingRefs } from '../../stores/db';
import { testLlmKey } from '../../services/llm';
import { useToast } from '../../lib/toast';
import { playSound, setSoundsEnabled, setMasterVolume } from '../../lib/sounds';
import { applyThemeClass } from '../../App';
import type { Category, AppSettings } from '../../types';

interface Props { onTabChange?: (id: string) => void }

// ---- Atoms ----

function FormRow({ label, hint, children, span = 1 }: {
  label: string; hint?: string; children: React.ReactNode; span?: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>★ {label}</label>
      {children}
      {hint && (
        <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>{hint}</div>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={{
      padding: '8px 12px',
      border: '2.5px solid var(--cit-navy-dk)',
      background: 'var(--cit-paper)',
      fontFamily: "'Special Elite', monospace", fontSize: 13, color: 'var(--cit-navy-dk)',
      boxShadow: 'inset 0 2px 0 oklch(0% 0 0 / 0.1), 3px 3px 0 var(--cit-navy-dk)',
      width: '100%', boxSizing: 'border-box',
    }}/>
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: '8px 12px',
      border: '2.5px solid var(--cit-navy-dk)',
      background: 'var(--cit-cream)',
      fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
      letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cit-navy-dk)',
      boxShadow: '3px 3px 0 var(--cit-navy-dk)', cursor: 'pointer', width: '100%',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SwitchRow({ label, sub, on, onToggle }: {
  label: string; sub?: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px',
      background: on ? 'var(--cit-butter)' : 'var(--cit-cream)',
      border: '2px solid var(--cit-navy-dk)',
      boxShadow: on ? '3px 3px 0 var(--cit-navy-dk)' : 'none',
      cursor: 'pointer',
    }} onClick={onToggle}>
      <div>
        <div className="cit-condensed" style={{ fontSize: 13, color: 'var(--cit-navy-dk)' }}>{label}</div>
        {sub && <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>{sub}</div>}
      </div>
      <span style={{
        width: 44, height: 22, border: '2.5px solid var(--cit-navy-dk)',
        background: on ? 'var(--cit-navy-dk)' : 'var(--cit-paper-dk)',
        position: 'relative', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', left: on ? 20 : 0, top: -2, width: 20, height: 22,
          background: on ? 'var(--cit-butter)' : 'var(--cit-cream)',
          border: '2.5px solid var(--cit-navy-dk)', transition: 'left .15s',
        }}/>
      </span>
    </div>
  );
}

function Slider({ value, onChange, min = 0, max = 100, unit = '%' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string;
}) {
  return (
    <div style={{
      border: '2.5px solid var(--cit-navy-dk)',
      background: 'var(--cit-paper)',
      padding: '10px 12px',
      boxShadow: '3px 3px 0 var(--cit-navy-dk)',
    }}>
      <div style={{ height: 14, background: 'var(--cit-cream)', border: '2px solid var(--cit-navy-dk)', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${((value - min) / (max - min)) * 100}%`,
          background: 'var(--cit-brick)', borderRight: '2px solid var(--cit-navy-dk)',
        }}/>
        <input type="range" min={min} max={max} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>{min}{unit}</span>
        <span className="cit-h1" style={{ fontSize: 18, color: 'var(--cit-brick)', lineHeight: 1, textShadow: 'none' }}>{value}{unit}</span>
        <span className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>{max}{unit}</span>
      </div>
    </div>
  );
}

// ---- Profile header ----

function ProfileCard({ name, stats }: { name: string; stats: { adopted: number; rejected: number; skipped: number; days: number } }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'JC';
  return (
    <div style={{
      background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      padding: '16px 20px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18,
      alignItems: 'center', position: 'relative', overflow: 'hidden', marginBottom: 22,
    }}>
      <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
      <div style={{
        width: 110, height: 110, background: 'var(--cit-butter)',
        border: '3px solid var(--cit-butter)', boxShadow: '4px 4px 0 oklch(0% 0 0)',
        position: 'relative', zIndex: 1, display: 'grid', placeItems: 'center',
      }}>
        <div style={{
          width: '65%', height: '65%', borderRadius: '50%',
          background: 'var(--cit-brick)', border: '3px solid var(--cit-navy-dk)',
          display: 'grid', placeItems: 'center',
          fontFamily: "'Alfa Slab One', serif", fontSize: 32, color: 'var(--cit-cream)',
          textShadow: '2px 2px 0 var(--cit-navy-dk)',
        }}>{initials}</div>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>★ OPÉRATEUR EN POSTE</div>
        <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 38, lineHeight: 0.9, margin: '2px 0' }}>
          {name.toUpperCase()}<span style={{ color: 'var(--cit-butter)' }}>!</span>
        </h2>
        <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-cream)' }}>
          Matricule <strong>0117-Φ</strong> · Bureau 4-N
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          <Stat label="ADOPTÉS" value={String(stats.adopted).padStart(2, '0')}/>
          <Stat label="RECYCLÉS" value={String(stats.rejected).padStart(2, '0')}/>
          <Stat label="PASSÉS" value={String(stats.skipped).padStart(2, '0')}/>
          <Stat label="JOURS" value={String(stats.days).padStart(2, '0')}/>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Stamp tone="brick" rotate={-4}>★ AGENT SUPÉRIEUR ★</Stamp>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 22, lineHeight: 0.9, textShadow: '1.5px 1.5px 0 var(--cit-brick)' }}>{value}</div>
      <div className="cit-condensed" style={{ fontSize: 9, color: 'var(--cit-butter)' }}>{label}</div>
    </div>
  );
}

// ---- Theme swatches ----

const THEMES = [
  { id: 'citizen', name: 'Citoyen !',       sub: 'Pulp 1957',      preview: { background: 'linear-gradient(135deg, oklch(20% 0.07 250) 0%, oklch(20% 0.07 250) 50%, oklch(80% 0.15 88) 50%, oklch(48% 0.18 28) 100%)' } },
  { id: 'phos',    name: 'Phosphore Vert',  sub: 'Terminal 1979',  preview: { background: 'linear-gradient(135deg, oklch(15% 0.04 145), oklch(70% 0.18 140))' } },
  { id: 'amber',   name: 'Phosphore Ambré', sub: 'IBM 5151, 1981', preview: { background: 'linear-gradient(135deg, oklch(15% 0.06 60), oklch(65% 0.16 75))' } },
  { id: 'dossier', name: 'Dossier Kraft',   sub: 'Archive 1962',   preview: { background: 'linear-gradient(135deg, oklch(78% 0.06 75), oklch(28% 0.06 50))' } },
  { id: 'bristol', name: 'Bibliothèque',    sub: 'Cartothèque 62', preview: { background: 'linear-gradient(135deg, oklch(94% 0.02 85), oklch(25% 0.10 240))' } },
];

function ThemeSwatch({ name, sub, preview, active, onClick }: {
  name: string; sub: string; preview: React.CSSProperties; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--cit-cream)',
      border: active ? '3px solid var(--cit-brick)' : '3px solid var(--cit-navy-dk)',
      boxShadow: active ? '5px 5px 0 var(--cit-brick)' : '3px 3px 0 var(--cit-navy-dk)',
      padding: 0, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ height: 78, ...preview, borderBottom: '3px solid var(--cit-navy-dk)' }}/>
      <div style={{ padding: '6px 10px 8px' }}>
        <div className="cit-h1" style={{ fontSize: 14, lineHeight: 1, color: 'var(--cit-navy-dk)', textShadow: 'none' }}>{name}</div>
        <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>{sub}</div>
      </div>
      {active && (
        <span style={{ position: 'absolute', top: -8, right: -8 }}>
          <Aster size={26} rotate={15}/>
        </span>
      )}
    </button>
  );
}

// ---- Algorithm sliders ----

// ---- Demolish modal ----

function DemolishModal({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [text, setText] = useState('');
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'oklch(20% 0.05 50 / 0.7)', zIndex: 100,
      display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--cit-brick)', color: 'var(--cit-cream)',
        border: '4px solid var(--cit-navy-dk)',
        boxShadow: '8px 8px 0 var(--cit-navy-dk)',
        padding: '24px 28px', maxWidth: 520, width: '100%',
      }}>
        <div className="cit-h1 cit-h1--reverse" style={{ fontSize: 36, lineHeight: 0.95, marginBottom: 8 }}>
          DÉMOLIR L'UNIVERS<span style={{ color: 'var(--cit-butter)' }}>?</span>
        </div>
        <p className="cit-typed" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--cit-cream)' }}>
          Cette action efface tous vos concepts adoptés, vos interactions et votre profil.
          Tapez <strong style={{ color: 'var(--cit-butter)' }}>DÉMOLIR</strong> pour confirmer.
        </p>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="DÉMOLIR" style={{
          width: '100%', boxSizing: 'border-box', marginTop: 12,
          padding: '10px 14px',
          border: '2.5px solid var(--cit-cream)',
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 18, letterSpacing: '.04em',
        }}/>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <CitButton tone="navy" onClick={onCancel}>Annuler</CitButton>
          <button disabled={text !== 'DÉMOLIR'} onClick={onConfirm} style={{
            background: text === 'DÉMOLIR' ? 'var(--cit-cream)' : 'var(--cit-paper-dk)',
            color: 'var(--cit-brick)',
            border: '3px solid var(--cit-navy-dk)',
            padding: '10px 18px',
            fontFamily: "'Alfa Slab One', serif", fontSize: 16,
            cursor: text === 'DÉMOLIR' ? 'pointer' : 'not-allowed',
            opacity: text === 'DÉMOLIR' ? 1 : 0.5,
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>★ DÉMOLIR</button>
        </div>
      </div>
    </div>
  );
}

// ---- Main ----

export function SettingsScreen({ onTabChange }: Props) {
  const [name, setName] = useState('J. Calais');
  const [email, setEmail] = useState('citoyen@constellation.bureau');
  const [llmProvider, setLlmProvider] = useState('claude');
  const [llmKey, setLlmKey] = useState('');
  const [defaultMode, setDefaultMode] = useState('explore');
  const [autoLink, setAutoLink] = useState(true);
  const [theme, setTheme] = useState('citizen');
  const [notifs, setNotifs] = useState({ daily: true, weekly: false, contrast: true, idea: true });
  const [demolishOpen, setDemolishOpen] = useState(false);
  const [colorPickerCat, setColorPickerCat] = useState<Category | null>(null);
  const [stats, setStats] = useState({ adopted: 0, rejected: 0, skipped: 0, days: 1 });
  const [catColors, setCatColors] = useState<Record<string, string>>({});
  const [soundsOn, setSoundsOn] = useState(true);
  const [volume, setVolume] = useState(40);
  const [chromaticOn, setChromaticOn] = useState(true);
  const [skipDelay, setSkipDelay] = useState(30);
  const toast = useToast();

  useEffect(() => {
    getSettings().then(s => {
      if (s) {
        setTheme(s.theme as string);
        if (s.llmProvider) setLlmProvider(s.llmProvider);
        if (s.llmKey) setLlmKey(s.llmKey);
        if (s.paletteOverrides) setCatColors(s.paletteOverrides);
        if (typeof s.soundsEnabled === 'boolean') setSoundsOn(s.soundsEnabled);
        if (typeof s.masterVolume === 'number') setVolume(Math.round(s.masterVolume * 100));
        if (typeof s.chromaticEnabled === 'boolean') setChromaticOn(s.chromaticEnabled);
        if (typeof s.skipDelayDays === 'number') setSkipDelay(s.skipDelayDays);
      }
    });
    getSettings().then(s => { if (s?.operatorName) setName(s.operatorName); });
    db.interactions.toArray().then(ints => {
      setStats({
        adopted:  ints.filter(i => i.verdict === 'valid').length,
        rejected: ints.filter(i => i.verdict === 'reject').length,
        skipped:  ints.filter(i => i.verdict === 'skip').length,
        days: 1,
      });
    });
  }, []);

  useEffect(() => { saveSettings({ theme }).catch(() => {}); applyThemeClass(theme); }, [theme]);
  useEffect(() => { saveSettings({ llmProvider: llmProvider as 'claude' | 'openai', llmKey }).catch(() => {}); }, [llmProvider, llmKey]);
  useEffect(() => { saveSettings({ operatorName: name }).catch(() => {}); }, [name]);
  useEffect(() => { saveSettings({ skipDelayDays: skipDelay }).catch(() => {}); }, [skipDelay]);
  useEffect(() => {
    saveSettings({ chromaticEnabled: chromaticOn }).catch(() => {});
    if (!chromaticOn) {
      CATEGORY_LIST.forEach(c => { CATEGORIES[c.key].oklch = 'oklch(45% 0.04 250)'; });
    } else {
      applyPaletteOverrides(catColors);
    }
  }, [chromaticOn, catColors]);

  const handleTestKey = async () => {
    if (!llmKey.trim()) {
      toast.show({ tone: 'warning', title: 'Clé requise', body: 'Saisissez d\'abord votre clé API.' });
      return;
    }
    toast.show({ tone: 'info', title: 'Test en cours…', body: 'Le Bureau interroge le LLM.' });
    const result = await testLlmKey({
      theme: 'phosphore', swipeMode: 'random',
      llmProvider: llmProvider as 'claude' | 'openai',
      llmKey,
    });
    if (result.ok) {
      toast.show({ tone: 'success', title: 'Clé valide', body: 'Le LLM a répondu correctement.' });
    } else {
      toast.show({ tone: 'warning', title: 'Clé invalide', body: result.error });
    }
  };

  const handleExport = async () => {
    const dump: Record<string, unknown> = {};
    const tables = ['concepts', 'interactions', 'profile', 'settings', 'tags', 'conceptTags', 'personalCategories', 'conceptPersonalCategories', 'annotations', 'combinations', 'ideas'];
    for (const t of tables) {
      dump[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray();
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constellation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show({ tone: 'success', title: 'Export terminé', body: 'Votre univers a été téléchargé en JSON.' });
  };

  const handleImport = async (file: File) => {
    if (!confirm('Importer va ÉCRASER votre univers existant. Continuer ?')) return;
    const text = await file.text();
    const report = await importFromJson(text);
    if (!report.ok) {
      toast.show({ tone: 'warning', title: 'Import refusé', body: report.error ?? 'Fichier invalide. Aucune donnée écrasée.' });
      return;
    }
    const totalRows = report.imported.reduce((s, t) => s + t.rows, 0);
    toast.show({
      tone: 'success',
      title: 'Import réussi',
      body: `${report.imported.length} tables · ${totalRows} entrées${report.skipped.length ? ` · ${report.skipped.length} clés ignorées` : ''}. Rechargement…`,
    });
    setTimeout(() => location.reload(), 1000);
  };

  const handleCleanup = async () => {
    const [caches, tagsRemoved, dangling] = await Promise.all([
      cleanupExpiredCaches(),
      cleanupOrphanTags(),
      cleanupDanglingRefs(),
    ]);
    toast.show({
      tone: 'success',
      title: 'Base nettoyée',
      body: `${caches} caches expirés · ${tagsRemoved} tags orphelins · ${dangling} références mortes supprimées.`,
    });
  };

  const handleDemolish = async () => {
    await db.delete();
    await db.open();
    await saveProfile({ onboardingDone: false });
    location.reload();
  };

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="RÉGLAGES"
        active="settings"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="navy" rotate={-3}>FORMULAIRE AB-1957</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, padding: '22px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        <ProfileCard name={name} stats={stats}/>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 22 }}>
          <CitPanel title="Profil de l'opérateur" style={{ alignSelf: 'start' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormRow label="Nom déclaré au Bureau" span={2}>
                <TextInput value={name} onChange={setName}/>
              </FormRow>
              <FormRow label="Adresse télégraphique" span={2}>
                <TextInput value={email} onChange={setEmail}/>
              </FormRow>
              <FormRow label="Fuseau horaire">
                <SelectInput value="paris" onChange={() => {}} options={[
                  { value: 'paris', label: 'PARIS · GMT+1' },
                  { value: 'ny', label: 'NEW YORK · GMT-5' },
                  { value: 'tok', label: 'TOKYO · GMT+9' },
                ]}/>
              </FormRow>
              <FormRow label="Langue">
                <SelectInput value="fr" onChange={() => {}} options={[
                  { value: 'fr', label: 'FRANÇAIS · OFFICIEL' },
                  { value: 'en', label: 'ANGLAIS · EXPÉRIMENTAL' },
                ]}/>
              </FormRow>
            </div>
          </CitPanel>

          <CitPanel title="Procédure & comportement">
            <FormRow label="Procédure d'examen par défaut">
              <SelectInput value={defaultMode} onChange={setDefaultMode} options={[
                { value: 'random', label: '★ ALÉATOIRE' },
                { value: 'themed', label: 'THÉMATIQUE' },
                { value: 'explore', label: 'EXPLORATION' },
                { value: 'contrast', label: 'CONTRASTE' },
                { value: 'cross', label: 'CROISEMENT' },
              ]}/>
            </FormRow>
            <div style={{ marginTop: 12 }}>
              <FormRow label={`Délai avant ré-apparition d'un « passé » · ${skipDelay} jours`} hint="Plus court = vous reverrez vite les concepts mis de côté.">
                <Slider value={skipDelay} onChange={setSkipDelay} min={1} max={90} unit=" j"/>
              </FormRow>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SwitchRow label="Liaisons automatiques"
                sub="Le Bureau relie les concepts adjacents."
                on={autoLink} onToggle={() => setAutoLink(v => !v)}/>
            </div>
          </CitPanel>
        </div>

        <CitPanel title="Bureau LLM · clé API" style={{ marginBottom: 22 }}>
          <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginBottom: 12 }}>
            La clé est stockée <strong>uniquement</strong> dans votre navigateur (IndexedDB local). Le Bureau ne la voit jamais et elle n'est envoyée qu'au fournisseur LLM que vous avez choisi.
          </div>
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: 'var(--cit-brick)', color: 'var(--cit-cream)',
            border: '2px solid var(--cit-navy-dk)',
            fontFamily: "'Special Elite', monospace", fontSize: 11, lineHeight: 1.5,
          }}>
            ⚠ <strong>Avertissement sécurité</strong> : comme l'application est 100% côté navigateur,
            les appels au LLM partent directement depuis votre machine. Votre clé est donc
            <strong> visible dans l'onglet Réseau des outils développeur</strong>. N'utilisez pas cette
            fonction sur un ordinateur partagé/public, et ne partagez pas votre écran pendant la saisie.
            Pensez à révoquer/régénérer votre clé si vous avez un doute.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <FormRow label="Fournisseur">
              <SelectInput value={llmProvider} onChange={setLlmProvider} options={[
                { value: 'claude', label: 'CLAUDE (ANTHROPIC)' },
                { value: 'openai', label: 'OPENAI' },
              ]}/>
            </FormRow>
            <FormRow label="Clé d'accès">
              <TextInput value={llmKey} onChange={setLlmKey} placeholder="sk-… ou sk-ant-…" type="password"/>
            </FormRow>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <CitButton tone="navy" onClick={handleTestKey}>★ Tester la clé</CitButton>
          </div>
        </CitPanel>


        <CitPanel title="Système chromatique des catégories" style={{ marginBottom: 22 }}>
          <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginBottom: 14 }}>
            Les fiches multi-catégories interpolent en OKLCH.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {CATEGORY_LIST.map(c => {
              const color = catColors[c.key] ?? c.oklch;
              return (
                <button key={c.key} onClick={() => setColorPickerCat(c)} style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'center',
                  padding: '8px 10px',
                  background: 'var(--cit-cream)',
                  border: '2.5px solid var(--cit-navy-dk)',
                  boxShadow: '3px 3px 0 var(--cit-navy-dk)',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{
                    width: 32, height: 32, background: color,
                    border: '2px solid var(--cit-navy-dk)',
                    boxShadow: 'inset 0 0 0 2px var(--cit-cream), inset 0 0 0 3px var(--cit-navy-dk)',
                  }}/>
                  <div>
                    <div className="cit-condensed" style={{ fontSize: 11, fontWeight: 700, color: 'var(--cit-navy-dk)' }}>{c.label}</div>
                    <div className="cit-typed" style={{ fontSize: 9, color: 'var(--cit-navy-lt)' }}>
                      {color.replace(/oklch\(|\)/g, '').slice(0, 24)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CitPanel>

        <CitPanel title="Thème visuel du terminal" style={{ marginBottom: 22 }}>
          <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', marginBottom: 10 }}>
            5 directions disponibles. Vous pouvez en changer à tout moment.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
            {THEMES.map(t => (
              <ThemeSwatch key={t.id} {...t} active={theme === t.id} onClick={() => setTheme(t.id)}/>
            ))}
          </div>
        </CitPanel>

        <CitPanel title="Sons & animations" style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SwitchRow
              label="Activer les sons"
              sub="Catalogue rétro vintage généré en temps réel."
              on={soundsOn}
              onToggle={async () => {
                const next = !soundsOn;
                setSoundsOn(next);
                await setSoundsEnabled(next);
                if (next) playSound('toastSuccess');
              }}/>
            <SwitchRow
              label="Système chromatique actif"
              sub="Désactiver pour un mode neutre uniforme."
              on={chromaticOn}
              onToggle={() => setChromaticOn(v => !v)}/>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormRow label={`Volume principal · ${volume}%`} hint="0% = muet · ajustez selon votre environnement.">
              <Slider value={volume} onChange={async v => {
                setVolume(v);
                await setMasterVolume(v / 100);
              }}/>
            </FormRow>
          </div>
          <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-lt)', marginTop: 10, fontStyle: 'italic' }}>
            ★ Les animations respectent automatiquement <code>prefers-reduced-motion</code> de votre système.
          </div>
        </CitPanel>

        <CitPanel title="Notifications du Bureau" style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SwitchRow label="Rapport quotidien (20h)" sub="Vos 5 fiches à examiner du soir."
              on={notifs.daily} onToggle={() => setNotifs(p => ({ ...p, daily: !p.daily }))}/>
            <SwitchRow label="Bilan hebdomadaire" sub="Tous les dimanches."
              on={notifs.weekly} onToggle={() => setNotifs(p => ({ ...p, weekly: !p.weekly }))}/>
            <SwitchRow label="Alerte bulle" sub="Si une catégorie dépasse 60% de saturation."
              on={notifs.contrast} onToggle={() => setNotifs(p => ({ ...p, contrast: !p.contrast }))}/>
            <SwitchRow label="Nouvelle idée prête" sub="Quand un croisement génère un score > 80."
              on={notifs.idea} onToggle={() => setNotifs(p => ({ ...p, idea: !p.idea }))}/>
          </div>
        </CitPanel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 22 }}>
          <CitPanel title="Données">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CitButton onClick={handleExport} style={{ justifyContent: 'space-between', width: '100%' }}>
                <span>Exporter mon univers</span>
                <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>.JSON</span>
              </CitButton>
              <CitButton onClick={async () => {
                const results = await exportAllAsCsv();
                if (results.length === 0) {
                  toast.show({ tone: 'info', title: 'Rien à exporter', body: 'Aucune table ne contient de données.' });
                } else {
                  toast.show({ tone: 'success', title: 'Export CSV terminé', body: `${results.length} fichier${results.length > 1 ? 's' : ''} téléchargé${results.length > 1 ? 's' : ''}.` });
                }
              }} style={{ justifyContent: 'space-between', width: '100%' }}>
                <span>Exporter en CSV (par table)</span>
                <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>.CSV ×N</span>
              </CitButton>
              <label style={{ display: 'block' }}>
                <input type="file" accept="application/json" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = '';
                }} style={{ display: 'none' }}/>
                <span style={{ display: 'block' }}>
                  <CitButton style={{ justifyContent: 'space-between', width: '100%', pointerEvents: 'none' }}>
                    <span>Importer un univers</span>
                    <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>.JSON</span>
                  </CitButton>
                </span>
              </label>
              <CitButton onClick={handleCleanup} style={{ justifyContent: 'space-between', width: '100%' }}>
                <span>Nettoyer la base</span>
                <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>caches · orphelins</span>
              </CitButton>
            </div>
          </CitPanel>

          <div style={{
            background: 'var(--cit-brick)', color: 'var(--cit-cream)',
            border: '3px solid var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
            padding: '10px 14px',
          }}>
            <div style={{
              background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
              fontFamily: "'Alfa Slab One', serif", fontSize: 14,
              padding: '5px 12px', letterSpacing: '.04em',
              textTransform: 'uppercase', margin: '-10px -14px 10px',
            }}>★ ZONE DANGEREUSE ★</div>
            <p className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-cream)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Le Bureau décline toute responsabilité quant à votre soif de savoir. Ces actions sont irréversibles.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setDemolishOpen(true)} style={{
                background: 'var(--cit-cream)', color: 'var(--cit-brick)',
                border: '2.5px solid var(--cit-cream)',
                padding: '8px', fontFamily: "'Alfa Slab One', serif",
                fontSize: 13, letterSpacing: '.06em', cursor: 'pointer',
                boxShadow: '3px 3px 0 var(--cit-navy-dk)',
                width: '100%', textTransform: 'uppercase',
              }}>★ Démolir mon univers ★</button>
            </div>
          </div>
        </div>

        <CitPanel title="Plus d'écrans" style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <CitButton tone="navy" onClick={() => onTabChange?.('stats')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ Statistiques</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton tone="butter" onClick={() => onTabChange?.('about')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ À propos & Aide</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton onClick={() => onTabChange?.('search')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>⌕ Recherche manuelle</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton onClick={() => onTabChange?.('perso')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ Étiquettes & Tags</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton onClick={() => onTabChange?.('combos')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ Bibliothèque combinaisons</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton onClick={() => onTabChange?.('constraints')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ Bibliothèque contraintes</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
            <CitButton onClick={() => onTabChange?.('ideas')} style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>★ Idées sauvegardées</span>
              <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, opacity: 0.7 }}>↗</span>
            </CitButton>
          </div>
        </CitPanel>

        <div style={{
          padding: '12px 18px', background: 'var(--cit-paper-dk)',
          border: '2.5px dashed var(--cit-navy-dk)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18,
        }}>
          <FileSeal size={48}/>
          <div className="cit-typed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', flex: 1, lineHeight: 1.5 }}>
            CONSTELLATION v0.1.0-φ · Bureau de l'Exploration Cognitive · Phase 1
          </div>
          <span className="cit-script" style={{ fontSize: 22, color: 'var(--cit-navy)', lineHeight: 1 }}>
            Au plaisir !
          </span>
        </div>
      </div>

      <CitizenFooter right="★ TOUTES LES MODIFICATIONS SONT SAUVÉES AUTOMATIQUEMENT"/>

      <DemolishModal open={demolishOpen} onCancel={() => setDemolishOpen(false)} onConfirm={handleDemolish}/>

      <ColorPickerModal
        category={colorPickerCat}
        open={!!colorPickerCat}
        onClose={() => setColorPickerCat(null)}
        onApply={async (oklch) => {
          if (!colorPickerCat) return;
          const next = { ...catColors, [colorPickerCat.key]: oklch };
          setCatColors(next);
          applyPaletteOverrides(next);
          await saveSettings({ paletteOverrides: next });
          toast.show({ tone: 'success', title: 'Couleur appliquée', body: `${colorPickerCat.label} → ${oklch}` });
        }}
      />
    </div>
  );
}
