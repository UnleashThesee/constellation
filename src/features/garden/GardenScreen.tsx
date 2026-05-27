import { useEffect, useState } from 'react';
import { CitizenMasthead, CitizenFooter } from '../../components/ui/CitizenShell';
import { getAdoptedConcepts, getConceptsByVerdict } from '../../stores/db';
import { GardenCanvas } from './GardenCanvas';
import type { Concept } from '../../types';

interface Props { onTabChange?: (id: string) => void }

export default function GardenScreen({ onTabChange }: Props) {
  const [adopted, setAdopted] = useState<Concept[]>([]);
  const [rejected, setRejected] = useState<Concept[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    getAdoptedConcepts().then(setAdopted).catch(() => {});
    getConceptsByVerdict('reject').then(setRejected).catch(() => {});
  }, []);

  const count = showRejected ? rejected.length : adopted.length;

  return (
    <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CitizenMasthead
        kicker={showRejected ? 'Le monde des' : 'Votre'}
        title={showRejected ? 'REJETÉS' : 'JARDIN'}
        active="garden"
        onTabChange={onTabChange}
        right={<>
          <button onClick={() => setShowRejected(v => !v)} style={{
            background: showRejected ? 'var(--cit-navy-dk)' : 'transparent',
            color: showRejected ? 'var(--cit-cream)' : 'var(--cit-navy-dk)',
            border: '2.5px solid var(--cit-navy-dk)', padding: '6px 14px', cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
            boxShadow: '2px 2px 0 var(--cit-navy-dk)',
          }}>{showRejected ? '🌱 Voir le jardin' : '🌫️ Monde des rejetés'}</button>
        </>}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <GardenCanvas concepts={showRejected ? rejected : adopted} rejected={showRejected} interactive zoom={0.7}/>
        {count === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', padding: 24, textAlign: 'center',
            fontFamily: "'Special Elite', monospace", fontSize: 14, color: '#fff', textShadow: '1px 1px 0 #000',
          }}>
            {showRejected ? 'Aucun concept rejeté pour l’instant.' : 'Votre jardin est vide — adoptez des concepts dans le Swipe pour le peupler.'}
          </div>
        )}
        <div style={{
          position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
          background: 'oklch(0% 0 0 / 0.5)', color: 'var(--cit-cream)', padding: '4px 10px',
          fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '.08em',
        }}>
          {count} concept{count > 1 ? 's' : ''} · glissez pour explorer · molette pour zoomer
        </div>
      </div>
      <CitizenFooter right="★ JARDIN (v2) · DÉCOR : TUXEMON (CC BY-SA) · SPRITES DE CONCEPTS IA À VENIR"/>
    </div>
  );
}
