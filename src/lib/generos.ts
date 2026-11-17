// src/lib/generos.ts
// Cada cine escribe el género a su manera ("DRAMA, DEPORTE", "Comedia-Drama",
// "Drama romántica", "Ciencia ficción"…). Aquí se traducen a una lista fija
// para poder filtrar igual vengan de donde vengan.

// Orden en el que aparecen los filtros
export const GENEROS = [
  "Drama",
  "Comedia",
  "Acción",
  "Thriller",
  "Terror",
  "Animación",
  "Familiar",
  "Aventura",
  "Ciencia ficción",
  "Fantasía",
  "Romance",
  "Documental",
  "Biografía",
  "Historia",
  "Música",
  "Deporte",
] as const;

export type Genero = (typeof GENEROS)[number];

// Palabras (sin tildes, en minúsculas) que delatan cada género
const PISTAS: [Genero, string[]][] = [
  ["Drama", ["drama"]],
  ["Comedia", ["comedia", "humor"]],
  ["Acción", ["accion"]],
  ["Thriller", ["thriller", "suspens", "intriga", "misterio", "policiac", "crimen", "negro"]],
  ["Terror", ["terror", "horror"]],
  ["Animación", ["animacion", "animada"]],
  ["Familiar", ["familiar", "infantil", "familia"]],
  ["Aventura", ["aventura"]],
  ["Ciencia ficción", ["ciencia ficcion", "sci-fi", "ficcion cientifica"]],
  ["Fantasía", ["fantasia", "fantastic"]],
  ["Romance", ["romanc", "romantic"]],
  ["Documental", ["documental"]],
  ["Biografía", ["biograf", "biopic"]],
  ["Historia", ["historic", "historia", "epica", "belic", "guerra"]],
  ["Música", ["musical", "musica", "concierto", "opera", "ballet", "en vivo"]],
  ["Deporte", ["deporte"]],
];

/** "Comedia-Drama" → ["Drama", "Comedia"] */
export function generosDe(texto?: string | null): Genero[] {
  if (!texto) return [];
  const limpio = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return PISTAS.filter(([, pistas]) => pistas.some((p) => limpio.includes(p))).map(
    ([genero]) => genero,
  );
}
