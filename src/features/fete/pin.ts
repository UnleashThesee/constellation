// Fête de la Musique — marqueur HTML d'une scène (utilisé par les deux cartes).
// Tailwind est global, donc ses classes marchent sur ces éléments.
// Pour éviter le fouillis : pastille ronde compacte par défaut ; étiquette
// complète seulement pour les concerts EN COURS ou la scène sélectionnée.
export interface PinData {
  color: string;   // couleur du genre
  emoji: string;   // emoji du genre
  name: string;    // nom de la scène
  sub: string;     // horaires + distance à pied
  live: boolean;   // en cours
  dim: boolean;    // terminé → estompé
  selected?: boolean;
}

export function buildPin(d: PinData): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex cursor-pointer flex-col items-center';
  wrap.style.opacity = d.dim && !d.selected ? '0.5' : '1';
  if (d.selected) wrap.style.zIndex = '60';
  else if (d.live) wrap.style.zIndex = '30';

  const expanded = d.live || d.selected;

  if (expanded) {
    const pill = document.createElement('div');
    pill.className = 'relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold shadow-lg';
    pill.style.background = d.color;
    pill.style.color = '#0b0b0b';
    pill.style.border = d.selected ? '2px solid #fff' : '2px solid rgba(255,255,255,.5)';
    if (d.live) {
      const ring = document.createElement('span');
      ring.className = 'absolute -inset-1 rounded-full animate-ping';
      ring.style.background = d.color; ring.style.opacity = '0.35';
      pill.appendChild(ring);
    }
    const content = document.createElement('span');
    content.className = 'relative flex items-center gap-1';
    content.innerHTML = `<span>${d.emoji}</span><span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name}</span>`;
    pill.appendChild(content);
    wrap.appendChild(pill);

    if (d.sub) {
      const sub = document.createElement('div');
      sub.className = 'mt-0.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white';
      sub.textContent = d.sub;
      wrap.appendChild(sub);
    }
    const tail = document.createElement('div');
    tail.style.cssText = `width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${d.color};margin-top:1px;`;
    wrap.appendChild(tail);
  } else {
    // pastille ronde compacte (peu d'encombrement)
    const dot = document.createElement('div');
    dot.className = 'grid place-items-center rounded-full text-[14px] shadow-md';
    dot.style.cssText += `width:30px;height:30px;background:${d.color};border:2px solid rgba(255,255,255,.85);`;
    dot.textContent = d.emoji;
    wrap.appendChild(dot);
  }
  return wrap;
}
