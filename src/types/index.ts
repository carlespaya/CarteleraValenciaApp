// src/types/index.ts

export interface Cine {
  id: string;
  nombre: string;
  slug: string;
  ciudad: string;
  direccion: string;
  url: string;
  fuente:
    | "reservaentradas"
    | "kinepolis"
    | "ocine"
    | "cinesa"
    | "yelmo"
    | "filmaffinity"
    | "manual";
  activo: boolean;
}

export interface Pelicula {
  id: string;
  titulo: string;
  titulo_original?: string;
  duracion?: number; // minutos
  genero?: string;
  clasificacion?: string; // +7, +12, etc.
  sinopsis?: string | null;
  poster?: string | null;
  trailer?: string;
  // Puntuaciones (se añaden al enriquecer con OMDb)
  imdb?: string | null;
  rottenTomatoes?: string | null;
  metacritic?: string | null;
}

export interface Sesion {
  id: string;
  cine_id: string;
  pelicula_id: string;
  fecha: string; // ISO date string
  hora: string; // "17:00"
  sala?: string;
  formato?: string; // "VOSE", "VE", "3D", "IMAX"
  url_compra: string; // enlace directo a la compra en el cine
  disponible: boolean;
  actualizado_en: string;
}

export interface SesionCompleta extends Sesion {
  pelicula: Pelicula;
  cine: Cine;
}

export interface CartelCine {
  cine: Cine;
  peliculas: {
    pelicula: Pelicula;
    sesiones: Sesion[];
  }[];
  actualizado_en: string;
  // Presente si el scraping de este cine falló (el cartel viene vacío)
  error?: string;
}

// Cartelera completa de un día, tal y como se guarda en caché
export interface CarteleraDia {
  fecha: string;
  cines: CartelCine[];
  actualizado_en: string;
}

export interface FiltrosSesiones {
  ciudad?: string;
  cine_id?: string;
  pelicula_id?: string;
  fecha?: string;
  formato?: string;
}
