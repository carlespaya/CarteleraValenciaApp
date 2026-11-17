// src/lib/titulos.ts
// Unificar la misma película cuando cada cine la llama de una forma distinta
// (mayúsculas, coletillas de formato, entidades HTML, ciclos, subtítulos…).

// Diccionario de alias/traducciones conocidas entre fuentes (ES/EN, etc.).
// Si detectas otra película duplicada por usar una palabra distinta en cada
// cine, añade aquí una entrada nueva: "palabra_en_una_fuente": "palabra_en_otra".
const ALIAS_TRADUCCION: Record<string, string> = {
  monstruos: "monsters",
};

// Longitud mínima (ya normalizada) que debe tener el título más corto para
// fusionarlo dentro de otro que lo contenga por completo. Evita falsos
// positivos entre películas distintas con nombres cortos (ej. "Alien" no se
// fusiona con "Alien: Romulus" porque "alien" es demasiado corto).
const UMBRAL_CONTENCION = 12;

/**
 * ¿Son la misma película dos títulos ya normalizados (`corta` ⊆ `larga`)?
 * - Si el corto es largo y está contenido en el otro: sí.
 *   "themandalorianandgrogu" ⊂ "starwarsthemandalorianandgrogu"
 * - Si el corto es el principio o el final del otro y además duran lo mismo
 *   (±5 min): sí. Cubre ciclos y subtítulos que solo pone algún cine:
 *   "naza" = "clubrosebudnaza", "wildwood" = "wildwoodelbosquesalvaje".
 *   La duración evita unir "Alien" con "Alien: Romulus".
 */
export function esMismaPelicula(
  corta: string,
  larga: string,
  duracionA?: number,
  duracionB?: number,
): boolean {
  if (corta.length >= UMBRAL_CONTENCION && larga.includes(corta)) return true;
  const enUnExtremo = larga.startsWith(corta) || larga.endsWith(corta);
  const mismaDuracion =
    !!duracionA && !!duracionB && Math.abs(duracionA - duracionB) <= 5;
  return corta.length >= 4 && enUnExtremo && mismaDuracion;
}

export function decodificarEntidadesHtml(texto: string): string {
  if (!texto) return texto;
  const entidades: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };
  return texto.replace(
    /&amp;|&quot;|&#39;|&apos;|&lt;|&gt;|&nbsp;/g,
    (m) => entidades[m] ?? m,
  );
}

export function normalizarTitulo(tituloOriginal: string): string {
  let t = decodificarEntidadesHtml(tituloOriginal)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Quitar acentos

  // Quitar contenido entre paréntesis o corchetes: (2026), [3D], etc.
  t = t.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "");

  // Quitar coletillas de formato/versión que no forman parte del título real
  const palabrasSucias = [
    "3d",
    "4dx",
    "imax",
    "atmos",
    "vose",
    "vosi",
    "vo",
    "ve",
    "hd",
    "live action",
    "live-action",
    "digital",
    "screenx",
    "laser",
  ];
  palabrasSucias.forEach((palabra) => {
    const regex = new RegExp(`\\b${palabra}\\b`, "gi");
    t = t.replace(regex, "");
  });

  t = t.replace(/&/g, "y").replace(/[^a-z0-9]/g, "");

  // Aplicar alias de traducción conocidos para unificar variantes ES/EN
  for (const [origen, destino] of Object.entries(ALIAS_TRADUCCION)) {
    t = t.split(origen).join(destino);
  }

  return t.trim();
}
