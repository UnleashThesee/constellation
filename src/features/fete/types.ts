// Fête de la Musique — types.
export interface Stage {
  id: string;
  name: string;          // nom du groupe / du concert
  genre?: string;        // rock, jazz, électro, fanfare…
  locationName: string;  // ex. « Place de la Libération »
  address?: string;
  lat: number;
  lng: number;
  start: string;         // ISO datetime (jour de l'événement)
  end: string;           // ISO datetime
  description?: string;
}

export interface FeteConfig {
  city: string;
  date: string;                 // 'YYYY-MM-DD'
  center: { lat: number; lng: number };
}

export interface GeoPoint { lat: number; lng: number }
