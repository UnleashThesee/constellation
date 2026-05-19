import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitPanel } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp } from '../../components/ui/atoms';
import { CATEGORIES, CATEGORY_LIST } from '../../lib/categories';
import { db, getAdoptedConcepts } from '../../stores/db';
import type { CategoryKey, Interaction, Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

interface DayStats { d: string; v: number; r: number; s: number; date: string }

function computeDailyStats(ints: Interaction[]): DayStats[] {
  const days: DayStats[] = [];
  const now = new Date();
  const labels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      d: labels[d.getDay()],
      v: ints.filter(x => x.verdict === 'valid'  && x.timestamp.toISOString().slice(0, 10) === key).length,
      r: ints.filter(x => x.verdict === 'reject' && x.timestamp.toISOString().slice(0, 10) === key).length,
      s: ints.filter(x => x.verdict === 'skip'   && x.timestamp.toISOString().slice(0, 10) === key).length,
      date: key,
    });
  }
  return days;
}

export function StatsScreen({ onTabChange }: Props) {
  const [ints, setInts] = useState<Interaction[]>([]);
  const [adopted, setAdopted] = useState<Concept[]>([]);

  useEffect(() => {
    db.interactions.toArray().then(arr => setInts(arr.map(i => ({ ...i, timestamp: new Date(i.timestamp) }))));
    getAdoptedConcepts().then(setAdopted);
  }, []);

  const total = ints.length;
  const adopt = ints.filter(i => i.verdict === 'valid').length;
  const reject = ints.filter(i => i.verdict === 'reject').length;
  const skip = ints.filter(i => i.verdict === 'skip').length;

  const days = computeDailyStats(ints);
  const maxDay = Math.max(...days.map(d => d.v + d.r + d.s), 1);

  // Top categories (from adopted concepts)
  const catTotals: Record<string, number> = {};
  adopted.forEach(c => c.cats.forEach(([k, w]) => { catTotals[k] = (catTotals[k] ?? 0) + w; }));
  const topCats = (Object.entries(catTotals) as Array<[CategoryKey, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCat = Math.max(...topCats.map(([, v]) => v), 1);

  const adoptPct = total > 0 ? (adopt / total) * 100 : 0;
  const rejectPct = total > 0 ? (reject / total) * 100 : 0;
  const skipPct = total > 0 ? (skip / total) * 100 : 0;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="STATISTIQUES"
        active="settings"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-3}>★ DEPUIS LE DÉBUT</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      <div style={{
        flex: 1, padding: '22px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 22 }}>
          {[
            { label: 'DOSSIERS EXAMINÉS', v: String(total).padStart(3, '0'), color: 'var(--cit-navy)', trend: '7 derniers jours' },
            { label: 'ADOPTÉS',  v: String(adopt).padStart(3, '0'),  color: 'var(--cit-navy)',    trend: total > 0 ? `${adoptPct.toFixed(1)}% du total` : '—' },
            { label: 'RECYCLÉS', v: String(reject).padStart(3, '0'), color: 'var(--cit-brick)',   trend: total > 0 ? `${rejectPct.toFixed(1)}% du total` : '—' },
            { label: 'PLUS TARD', v: String(skip).padStart(3, '0'),  color: 'var(--cit-mustard)', trend: total > 0 ? `${skipPct.toFixed(1)}% du total` : '—' },
            { label: 'FAVORIS',   v: '—',  color: 'var(--cit-rust)',    trend: 'À venir' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)',
              boxShadow: '5px 5px 0 var(--cit-navy-dk)',
              padding: '10px 14px',
            }}>
              <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>★ {s.label}</div>
              <div className="cit-h1" style={{ fontSize: 44, lineHeight: 0.9, color: s.color, textShadow: 'none', marginTop: 4 }}>{s.v}</div>
              <div className="cit-typed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)', marginTop: 4 }}>{s.trend}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
          <CitPanel title="Frise des verdicts · 7 derniers jours">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, padding: '8px 6px 0', borderBottom: '2.5px solid var(--cit-navy-dk)' }}>
              {days.map((d, i) => {
                const sum = d.v + d.r + d.s;
                if (sum === 0) return (
                  <div key={i} style={{ flex: 1, height: 180, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{
                      width: '100%', height: 4, background: 'var(--cit-paper-dk)',
                      border: '1.5px dashed var(--cit-navy-lt)',
                    }}/>
                  </div>
                );
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', height: 180, justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: `${(sum / maxDay) * 100}%`, border: '2px solid var(--cit-navy-dk)', boxShadow: '3px 3px 0 var(--cit-navy-dk)' }}>
                      <div style={{ height: `${(d.v / sum) * 100}%`, background: 'var(--cit-navy)' }}/>
                      <div style={{ height: `${(d.s / sum) * 100}%`, background: 'var(--cit-mustard)' }}/>
                      <div style={{ height: `${(d.r / sum) * 100}%`, background: 'var(--cit-brick)' }}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {days.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: "'Alfa Slab One', serif", fontSize: 14, color: 'var(--cit-navy-dk)' }}>{d.d}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
              {[
                { c: 'var(--cit-navy)',    l: 'Adoptés' },
                { c: 'var(--cit-mustard)', l: 'Plus tard' },
                { c: 'var(--cit-brick)',   l: 'Recyclés' },
              ].map((x, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, background: x.c, border: '1.5px solid var(--cit-navy-dk)' }}/>
                  <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-dk)' }}>{x.l}</span>
                </div>
              ))}
            </div>
          </CitPanel>

          <CitPanel title="Camembert de l'amour">
            <div style={{ position: 'relative', aspectRatio: '1/1', maxWidth: 240, margin: '0 auto' }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: total > 0
                  ? `conic-gradient(from -90deg, var(--cit-navy) 0% ${adoptPct}%, var(--cit-mustard) ${adoptPct}% ${adoptPct + skipPct}%, var(--cit-brick) ${adoptPct + skipPct}% 100%)`
                  : 'var(--cit-paper-dk)',
                border: '4px solid var(--cit-navy-dk)',
                boxShadow: 'inset 0 0 0 3px var(--cit-cream), inset 0 0 0 4px var(--cit-navy-dk), 6px 6px 0 var(--cit-navy-dk)',
              }}/>
              <div style={{
                position: 'absolute', inset: '30%',
                background: 'var(--cit-cream)',
                border: '4px solid var(--cit-navy-dk)',
                borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                fontFamily: "'Alfa Slab One', serif", fontSize: 26,
                color: 'var(--cit-navy-dk)', textAlign: 'center', lineHeight: 0.9,
              }}>{total}<br/><span style={{ fontSize: 10, fontFamily: "'Oswald', sans-serif", color: 'var(--cit-navy-lt)' }}>DOSSIERS</span></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {[
                { c: 'var(--cit-navy)',    l: `Adoptés ${adoptPct.toFixed(1)}%` },
                { c: 'var(--cit-mustard)', l: `Plus tard ${skipPct.toFixed(1)}%` },
                { c: 'var(--cit-brick)',   l: `Recyclés ${rejectPct.toFixed(1)}%` },
              ].map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: x.c, border: '1.5px solid var(--cit-navy-dk)' }}/>
                  <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)' }}>{x.l}</span>
                </div>
              ))}
            </div>
          </CitPanel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <CitPanel title="Top catégories de votre univers">
            {topCats.length === 0 ? (
              <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                Adoptez des concepts pour voir vos catégories émerger.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topCats.map(([k, v]) => {
                  const cat = CATEGORIES[k];
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 12, height: 12, background: cat.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
                      <span className="cit-condensed" style={{ fontSize: 12, fontWeight: 700, width: 130, color: 'var(--cit-navy-dk)' }}>{cat.label}</span>
                      <div style={{ flex: 1, height: 14, background: 'var(--cit-paper)', border: '1.5px solid var(--cit-navy-dk)' }}>
                        <div style={{ width: `${(v / maxCat) * 100}%`, height: '100%', background: cat.oklch, borderRight: '1.5px solid var(--cit-navy-dk)' }}/>
                      </div>
                      <span className="cit-h1" style={{ fontSize: 18, color: cat.oklch, textShadow: 'none', minWidth: 40, textAlign: 'right' }}>
                        {v.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CitPanel>

          <CitPanel title="Concepts adoptés récemment">
            {adopted.length === 0 ? (
              <div className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-lt)', fontStyle: 'italic' }}>
                Aucun concept adopté pour l'instant.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {adopted.slice(0, 6).map((c, i) => {
                  const cat = CATEGORIES[c.cats[0]?.[0] ?? 'personnages'];
                  return (
                    <div key={c.id} style={{
                      display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center',
                      padding: '5px 8px', background: 'var(--cit-paper)',
                      border: '2px solid var(--cit-navy-dk)',
                    }}>
                      <span style={{
                        width: 24, height: 24, background: cat.oklch, borderRadius: '50%',
                        border: '1.5px solid var(--cit-navy-dk)',
                        display: 'grid', placeItems: 'center',
                        fontFamily: "'Alfa Slab One', serif", fontSize: 11, color: 'var(--cit-cream)',
                        textShadow: '1px 1px 0 var(--cit-navy-dk)',
                      }}>{i + 1}</span>
                      <span className="cit-h1" style={{ fontSize: 16, lineHeight: 1 }}>{c.name}</span>
                      <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>{cat.short}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CitPanel>
        </div>

        <CitPanel title="Légende des catégories">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {CATEGORY_LIST.map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, background: c.oklch, border: '1.5px solid var(--cit-navy-dk)' }}/>
                <span className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-dk)' }}>{c.label}</span>
              </div>
            ))}
          </div>
        </CitPanel>
      </div>

      <CitizenFooter right="★ EXPORTABLE EN .JSON DEPUIS LES RÉGLAGES"/>
    </div>
  );
}
