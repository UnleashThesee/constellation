import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter, CitButton } from '../../components/ui/CitizenShell';
import { Sunburst, Stamp, Aster } from '../../components/ui/atoms';
import { CATEGORIES, CATEGORY_LIST, gradientForWeights } from '../../lib/categories';
import { getAdoptedConcepts } from '../../stores/db';
import type { Concept, CategoryKey } from '../../types';

interface Props { onTabChange?: (id: string) => void }

function FavTile({ fav }: { fav: Concept }) {
  const portrait = fav.name.split(' ').slice(0, 2).join(' ').toUpperCase();
  return (
    <div style={{
      background: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', top: -10, right: -10, zIndex: 3 }}>
        <Aster size={28} rotate={12}/>
      </span>

      <div style={{
        height: 140, background: 'var(--cit-butter)',
        position: 'relative', borderBottom: '3px solid var(--cit-navy-dk)', overflow: 'hidden',
      }}>
        {fav.portrait?.startsWith('http') ? (
          <img src={fav.portrait} alt={fav.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <>
            <div style={{
              position: 'absolute', inset: '12% 22% 22% 22%',
              background: 'var(--cit-brick)', borderRadius: '50%',
              border: '3px solid var(--cit-navy-dk)',
            }}/>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Alfa Slab One', serif",
              fontSize: 18, lineHeight: 0.95, color: 'var(--cit-cream)',
              textAlign: 'center', textShadow: '2px 2px 0 var(--cit-navy-dk)',
              padding: 8, letterSpacing: '.02em', zIndex: 1,
            }}>{portrait}</div>
          </>
        )}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'var(--cit-navy-dk)', color: 'var(--cit-butter)',
          fontFamily: "'Alfa Slab One', serif", fontSize: 12,
          padding: '3px 8px', textAlign: 'center',
          letterSpacing: '.06em', borderTop: '2px solid var(--cit-butter)',
        }}>{fav.years ?? '—'}</div>
      </div>

      <div style={{ height: 7, background: gradientForWeights(fav.cats), borderBottom: '3px solid var(--cit-navy-dk)' }}/>

      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="cit-condensed" style={{ fontSize: 10, color: 'var(--cit-navy-lt)' }}>
          ★ {fav.kind}
        </div>
        <h3 className="cit-h1" style={{ margin: 0, fontSize: 22, lineHeight: 0.95 }}>
          {fav.name}
        </h3>
        <p className="cit-typed" style={{ fontSize: 12, color: 'var(--cit-navy-dk)', lineHeight: 1.4, margin: 0, maxHeight: 50, overflow: 'hidden' }}>
          {fav.blurb}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 'auto' }}>
          {fav.cats.map(([k]) => {
            const c = CATEGORIES[k];
            return (
              <span key={k} className="cit-condensed" style={{
                fontSize: 9.5, padding: '2px 6px',
                background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)',
                border: '1.5px solid var(--cit-navy-dk)',
                display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, background: c.oklch, border: '1px solid var(--cit-navy-dk)' }}/>
                {c.short}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FeaturedCover({ fav }: { fav: Concept }) {
  const portrait = fav.name.split(' ').slice(0, 2).join(' ').toUpperCase();
  return (
    <div style={{
      background: 'var(--cit-navy-dk)', color: 'var(--cit-cream)',
      border: '3px solid var(--cit-navy-dk)',
      boxShadow: '5px 5px 0 var(--cit-navy-dk)',
      display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0,
      position: 'relative', overflow: 'hidden', marginBottom: 22,
    }}>
      <div className="cit-halftone" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}/>
      <div style={{ padding: '22px 26px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-butter)' }}>
            ★ COUP DE CŒUR DE LA SEMAINE ★
          </div>
          <h2 className="cit-h1 cit-h1--reverse" style={{ fontSize: 56, lineHeight: 0.88, margin: '4px 0' }}>
            {fav.name.toUpperCase()}<span style={{ color: 'var(--cit-butter)' }}>!</span>
          </h2>
          <div className="cit-script" style={{ fontSize: 22, color: 'var(--cit-butter)', lineHeight: 1 }}>
            {fav.kind.toLowerCase()}{fav.years ? `, ${fav.years}` : ''}
          </div>
        </div>
        <div className="cit-typed" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--cit-cream)', marginTop: 10 }}>
          « {fav.blurb} »
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <CitButton tone="butter">★ Examiner la fiche</CitButton>
          <CitButton tone="brick">Croiser avec…</CitButton>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--cit-brick)' }}>
        <Sunburst size={240} color="var(--cit-butter)"/>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{
            background: 'var(--cit-butter)',
            border: '4px solid var(--cit-navy-dk)',
            boxShadow: '6px 6px 0 var(--cit-navy-dk)',
            padding: '14px 24px',
            fontFamily: "'Alfa Slab One', serif",
            fontSize: 24, lineHeight: 0.95,
            color: 'var(--cit-navy-dk)',
            transform: 'rotate(-3deg)', textAlign: 'center',
          }}>
            {portrait.split(' ').map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
        <span style={{ position: 'absolute', top: 16, right: 16 }}>
          <Aster size={36} rotate={15}/>
        </span>
      </div>
    </div>
  );
}

export function FavsScreen({ onTabChange }: Props) {
  const [favs, setFavs] = useState<Concept[]>([]);
  const [catFilter, setCatFilter] = useState<'all' | CategoryKey>('all');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAdoptedConcepts().then(c => { setFavs(c); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const filtered = catFilter === 'all' ? favs : favs.filter(f => f.cats.some(([k]) => k === catFilter));
  const [featured, ...rest] = filtered;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker="Vos"
        title="FAVORIS"
        active="favs"
        onTabChange={onTabChange}
        right={<>
          <Stamp tone="brick" rotate={-4}>★ {favs.length} CONCEPT{favs.length > 1 ? 'S' : ''} ÉPINGLÉ{favs.length > 1 ? 'S' : ''}</Stamp>
          <Sunburst size={68} color="var(--cit-mustard)"/>
        </>}
      />

      {/* Filter strip */}
      <div style={{
        padding: '10px 32px',
        background: 'var(--cit-paper-dk)',
        borderBottom: '2px solid var(--cit-navy-dk)',
        display: 'flex', alignItems: 'center', gap: 12,
        zIndex: 3, position: 'relative', overflow: 'auto',
      }}>
        <span className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-navy-dk)', whiteSpace: 'nowrap' }}>★ Par catégorie ›</span>
        <button onClick={() => setCatFilter('all')} style={{
          background: catFilter === 'all' ? 'var(--cit-navy-dk)' : 'transparent',
          color: catFilter === 'all' ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
          border: '2px solid var(--cit-navy-dk)',
          padding: '4px 12px', cursor: 'pointer',
          fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
          letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>TOUS ({favs.length})</button>
        {CATEGORY_LIST.map(c => {
          const count = favs.filter(f => f.cats.some(([k]) => k === c.key)).length;
          if (count === 0) return null;
          return (
            <button key={c.key} onClick={() => setCatFilter(c.key)} style={{
              background: catFilter === c.key ? 'var(--cit-navy-dk)' : 'transparent',
              color: catFilter === c.key ? 'var(--cit-butter)' : 'var(--cit-navy-dk)',
              border: '2px solid var(--cit-navy-dk)',
              padding: '4px 10px', cursor: 'pointer',
              fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
              letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 10, height: 10, background: c.oklch, border: '1.5px solid currentColor' }}/>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      <div style={{
        flex: 1, padding: '20px 32px', overflow: 'auto',
        background: 'var(--cit-paper-2)', zIndex: 3, position: 'relative',
      }}>
        {loaded && favs.length === 0 && (
          <div style={{
            padding: '60px 40px', textAlign: 'center',
            background: 'var(--cit-cream)',
            border: '3px dashed var(--cit-navy-dk)',
            boxShadow: '5px 5px 0 var(--cit-navy-dk)',
          }}>
            <Sunburst size={80} color="var(--cit-mustard)"/>
            <h2 className="cit-h1" style={{ fontSize: 36, marginTop: 16 }}>Pas encore de favoris</h2>
            <p className="cit-typed" style={{ fontSize: 13, color: 'var(--cit-navy-lt)', marginTop: 8 }}>
              Adoptez des concepts via l'écran de swipe pour les retrouver ici.
            </p>
            <div style={{ marginTop: 18 }}>
              <CitButton tone="brick" onClick={() => onTabChange?.('swipe')}>★ ALLER AU SWIPE</CitButton>
            </div>
          </div>
        )}
        {featured && <FeaturedCover fav={featured}/>}
        {rest.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
            {rest.map(fav => <FavTile key={fav.id} fav={fav}/>)}
          </div>
        )}
      </div>

      <CitizenFooter right="★ MARQUEZ LES MEILLEURS · GLISSEZ POUR DÉSÉPINGLER"/>
    </div>
  );
}
