// src/lib/omdb.ts
// Consulta la API de OMDb para obtener puntuaciones y datos de películas

export interface OmdbData {
  imdb: string | null;        // "7.4"
  rottenTomatoes: string | null; // "83%"
  metacritic: string | null;  // "71"
  poster: string | null;
  sinopsis: string | null;
  año: string | null;
  director: string | null;
  actores: string | null;
  genero: string | null;
  duracion: string | null;
}

const OMDB_BASE = 'https://www.omdbapi.com';

// Cache para no repetir llamadas a la misma película. El script de generación
// la carga y la guarda en disco entre ejecuciones, porque la clave gratuita de
// OMDb solo permite 1.000 consultas al día. Las puntuaciones se renuevan cada
// semana; las películas no encontradas se reintentan al día siguiente.
export interface EntradaCacheOmdb {
  data: OmdbData | null;
  guardado: number;
}

const DIA = 24 * 60 * 60 * 1000;
const cache = new Map<string, EntradaCacheOmdb>();

function guardar(titulo: string, data: OmdbData | null) {
  cache.set(titulo, { data, guardado: Date.now() });
}

function leerCache(titulo: string): OmdbData | null | undefined {
  const entrada = cache.get(titulo);
  if (!entrada) return undefined;
  const caducidad = entrada.data ? 7 * DIA : DIA;
  if (Date.now() - entrada.guardado > caducidad) return undefined;
  return entrada.data;
}

export function importarCacheOmdb(datos: Record<string, EntradaCacheOmdb>) {
  for (const [titulo, entrada] of Object.entries(datos)) {
    cache.set(titulo, entrada);
  }
}

export function exportarCacheOmdb(): Record<string, EntradaCacheOmdb> {
  return Object.fromEntries(
    Array.from(cache.entries()).filter(([titulo]) => leerCache(titulo) !== undefined),
  );
}

export async function buscarPelicula(titulo: string): Promise<OmdbData | null> {
  const enCache = leerCache(titulo);
  if (enCache !== undefined) return enCache;

  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    console.warn('OMDB_API_KEY no configurada');
    return null;
  }

  try {
    const url = `${OMDB_BASE}/?t=${encodeURIComponent(titulo)}&language=es&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    const data = await res.json();

    if (data.Response === 'False') {
      // Errores temporales (límite diario, clave inválida…): no se guardan
      // en caché para volver a intentarlo en el siguiente refresco.
      if (data.Error !== 'Movie not found!') {
        console.warn(`OMDb no disponible para "${titulo}": ${data.Error}`);
        return null;
      }
      // Intentar con título limpio (sin subtítulos tras ":")
      const tituloCorto = titulo.split(':')[0].trim();
      if (tituloCorto !== titulo) {
        const corta = await buscarPelicula(tituloCorto);
        guardar(titulo, corta);
        return corta;
      }
      guardar(titulo, null);
      return null;
    }

    // Extraer puntuaciones de los diferentes portales
    const ratings = data.Ratings || [];
    const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null;
    const rt = ratings.find((r: { Source: string; Value: string }) => r.Source === 'Rotten Tomatoes')?.Value || null;
    const mc = data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null;

    const resultado: OmdbData = {
      imdb,
      rottenTomatoes: rt,
      metacritic: mc,
      poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
      sinopsis: data.Plot && data.Plot !== 'N/A' ? data.Plot : null,
      año: data.Year && data.Year !== 'N/A' ? data.Year : null,
      director: data.Director && data.Director !== 'N/A' ? data.Director : null,
      actores: data.Actors && data.Actors !== 'N/A' ? data.Actors : null,
      genero: data.Genre && data.Genre !== 'N/A' ? data.Genre : null,
      duracion: data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : null,
    };

    guardar(titulo, resultado);
    return resultado;
  } catch (error) {
    console.error(`Error consultando OMDb para "${titulo}":`, error);
    return null;
  }
}

// Enriquecer múltiples películas en paralelo
export async function enriquecerPeliculas(titulos: string[]): Promise<Map<string, OmdbData>> {
  const resultados = await Promise.allSettled(
    titulos.map(async (titulo) => ({ titulo, data: await buscarPelicula(titulo) }))
  );

  const mapa = new Map<string, OmdbData>();
  for (const r of resultados) {
    if (r.status === 'fulfilled' && r.value.data) {
      mapa.set(r.value.titulo, r.value.data);
    }
  }
  return mapa;
}
