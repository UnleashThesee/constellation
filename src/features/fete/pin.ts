// Fête de la Musique — construit le marqueur HTML d'une scène (utilisé par les
// deux cartes). Tailwind est global, donc ses classes marchent sur ces éléments.
export interface PinData {
  color: string;   // couleur du genre
  emoji: string;   // emoji du genre
  name: string;    // nom de la scène
  sub: string;     // ligne d'infos : horaires + distance à pied
  live: boolean;   // en cours → halo pulsé
  dim: boolean;    // terminé → estompé
  selected?: boolean;
}

export function buildPin(d: PinData): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex cursor-pointer flex-col items-center';
  wrap.style.opacity = d.dim ? '0.45' : '1';
  if (d.selected) wrap.style.zIndex = '50';

  const pill = document.createElement('div');
  pill.className = 'relative flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-extrabold shadow-lg';
  pill.style.background = d.color;
  pill.style.color = '#0b0b0b';
  pill.style.border = d.selected ? '2px solid #fff' : `2px solid ${d.dim ? 'transparent' : 'rgba(255,255,255,.45)'}`;
  if (d.live) {
    const ring = document.createElement('span');
    ring.className = 'absolute -inset-1 rounded-xl animate-ping';
    ring.style.background = d.color; ring.style.opacity = '0.4';
    pill.appendChild(ring);
  }
  const content = document.createElement('span');
  content.className = 'relative flex items-center gap-1';
  content.innerHTML = `<span>${d.emoji}</span><span style="max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name}</span>`;
  pill.appendChild(content);
  wrap.appendChild(pill);

  if (d.sub) {
    const sub = document.createElement('div');
    sub.className = 'mt-0.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white';
    sub.textContent = d.sub;
    wrap.appendChild(sub);
  }

  const tail = document.createElement('div');
  tail.style.cssText = `width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${d.color};margin-top:1px;`;
  wrap.appendChild(tail);
  return wrap;
}
