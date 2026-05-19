/** "il y a 3 jours" / "il y a 2h" / etc. */
export function relativeDate(date: Date | number): string {
  const d = typeof date === 'number' ? date : +date;
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `il y a ${day} j`;
  const week = Math.round(day / 7);
  if (week < 5) return `il y a ${week} sem.`;
  const month = Math.round(day / 30);
  if (month < 12) return `il y a ${month} mois`;
  const year = Math.round(day / 365);
  return `il y a ${year} an${year > 1 ? 's' : ''}`;
}

/** Short absolute date "12 mar 2026" */
export function shortDate(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
