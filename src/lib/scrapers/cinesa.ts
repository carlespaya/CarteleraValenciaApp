import { abrirPagina } from "./browser";
import { fechaISO } from "@/lib/fechas";
import { memoizar, olvidar } from "@/lib/memo";
import type { Cine, CartelCine, Pelicula, Sesion } from "@/types";

const API = "https://vwc.cinesa.es/WSVistaWebClient/ocapi/v1";
const SITE_ID = "028";

const TOKEN_TTL_MS = 20 * 60 * 1000;
const CLAVE_TOKEN = "cinesa:token";
const CLAVE_FILMS = "cinesa:films";

export const CINES_CINESA: Cine[] = [
  {
    id: "cinesa-bonaire",
    nombre: "Cinesa Bonaire",
    slug: "cinesa-bonaire",
    ciudad: "Aldaia",
    direccion: "Centro Comercial Bonaire, Aldaia",
    url: "https://www.cinesa.es/cines/bonaire",
    fuente: "manual",
    activo: true,
  },
];

const ATRIBUTOS: Record<string, string> = {
  "0000000068": "VOSE",
  "0000000071": "3D",
  "0000000086": "IMAX",
  "0000000088": "ScreenX",
  "0000000069": "iSense",
  "0000000074": "D-BOX",
  "0000000108": "XL",
  "0000000105": "Terror Y Suspense",
};

function resolverFormato(attributeIds: string[]): string {
  if (!attributeIds || attributeIds.length === 0) return "VE";
  const partes = attributeIds.map((id) => ATRIBUTOS[id] ?? id);
  return partes.join(" ");
}

async function obtenerTokenConNavegador(): Promise<string> {
  const { page, cerrar } = await abrirPagina({
    contexto: {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "es-ES",
    },
  });

  try {
    let token: string | null = null;

    page.on("request", (req) => {
      if (token) return;
      if (!req.url().includes("vwc.cinesa.es")) return;
      const auth = req.headers()["authorization"];
      if (auth?.startsWith("Bearer ")) {
        token = auth.slice("Bearer ".length);
      }
    });

    await page.goto("https://www.cinesa.es/cines/bonaire/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!token) {
      await page
        .waitForRequest((req) => req.url().includes("vwc.cinesa.es"), {
          timeout: 20000,
        })
        .catch(() => {});
    }
    if (!token) await page.waitForTimeout(1500);

    if (!token) {
      const title = await page.title().catch(() => "");
      throw new Error(
        `No se pudo capturar el authToken (título de página: "${title}").`,
      );
    }

    return token;
  } finally {
    await cerrar();
  }
}

function obtenerToken(): Promise<string> {
  return memoizar(CLAVE_TOKEN, TOKEN_TTL_MS, obtenerTokenConNavegador);
}

function invalidarTokenCache() {
  olvidar(CLAVE_TOKEN);
  olvidar(CLAVE_FILMS);
}

class CinesaApiError extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.status = status;
  }
}

async function fetchFilms(token: string) {
  const res = await fetch(`${API}/films`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new CinesaApiError(`Films: ${res.status}`, res.status);
  const json = await res.json();
  return (json.films ?? json.relatedData?.films ?? []) as any[];
}

async function fetchShowtimes(token: string, fechaObjetivo: string) {
  // La API de Cinesa permite filtrar por fecha de negocio directamente
  const res = await fetch(
    `${API}/showtimes/by-business-date/${fechaObjetivo}?siteIds=${SITE_ID}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  // Fallback al endpoint "first" si la fecha específica no existe
  if (!res.ok) {
    const fallback = await fetch(
      `${API}/showtimes/by-business-date/first?siteIds=${SITE_ID}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    if (!fallback.ok)
      throw new CinesaApiError(
        `Showtimes: ${fallback.status}`,
        fallback.status,
      );
    const json = await fallback.json();
    return json.showtimes ?? [];
  }

  const json = await res.json();
  return json.showtimes ?? [];
}

// La lista de películas no depende del día: se reutiliza para los 7
function obtenerFilms(token: string) {
  return memoizar(CLAVE_FILMS, 10 * 60_000, () => fetchFilms(token));
}

function posterUrl(id?: string) {
  if (!id) return undefined;
  return `https://film-cdn.moviexchange.com/api/cdn/release/${id}/media/Poster?width=400`;
}

function cartelVacio(error: unknown): CartelCine[] {
  return [
    {
      cine: CINES_CINESA[0],
      peliculas: [],
      actualizado_en: new Date().toISOString(),
      error: String(error),
    },
  ];
}

export async function scrapearCinesa(
  fechaObjetivo?: string,
): Promise<CartelCine[]> {
  const fecha = fechaObjetivo ?? fechaISO();

  let token: string;
  try {
    token = await obtenerToken();
  } catch (error) {
    console.error("❌ Cinesa: no se pudo obtener token", error);
    return cartelVacio(error);
  }

  let films: any[];
  let showtimes: any[];
  try {
    [films, showtimes] = await Promise.all([
      obtenerFilms(token),
      fetchShowtimes(token, fecha),
    ]);
  } catch (error) {
    if (error instanceof CinesaApiError && error.status === 401) {
      console.warn("⚠️ Cinesa: token caducado, reintentando con uno nuevo");
      invalidarTokenCache();
      try {
        token = await obtenerToken();
        [films, showtimes] = await Promise.all([
          obtenerFilms(token),
          fetchShowtimes(token, fecha),
        ]);
      } catch (retryError) {
        console.error(
          "❌ Cinesa: error al obtener datos tras reintento",
          retryError,
        );
        return cartelVacio(retryError);
      }
    } else {
      console.error("❌ Cinesa: error al obtener datos", error);
      return cartelVacio(error);
    }
  }

  console.log(
    `Cinesa — films: ${films.length}, showtimes [${fecha}]: ${showtimes.length}`,
  );

  const filmsById = new Map(films.map((f: any) => [f.id, f]));
  const mapa = new Map<string, { pelicula: Pelicula; sesiones: Sesion[] }>();

  for (const show of showtimes) {
    // Filtramos por la fecha objetivo
    if (show.schedule?.businessDate !== fecha) continue;

    const film = filmsById.get(show.filmId);
    if (!film) continue;

    if (!mapa.has(film.id)) {
      mapa.set(film.id, {
        pelicula: {
          id: film.id,
          titulo: film.title?.text ?? "Película",
          duracion: film.runtimeInMinutes,
          clasificacion: undefined,
          genero: undefined,
          poster: posterUrl(film.externalIds?.moviexchangeReleaseId),
          sinopsis: film.synopsis?.text,
          trailer: film.trailerUrl,
        },
        sesiones: [],
      });
    }

    mapa.get(film.id)!.sesiones.push({
      id: show.id,
      cine_id: "cinesa-bonaire",
      pelicula_id: film.id,
      fecha,
      hora: show.schedule.startsAt.substring(11, 16),
      sala: show.screenId?.split("-").pop(),
      formato: resolverFormato(show.attributeIds ?? []),
      url_compra: `https://www.cinesa.es/compra/butacas/?showtimeId=${show.id}`,
      disponible: !show.isSoldOut,
      actualizado_en: new Date().toISOString(),
    });
  }

  const peliculas = Array.from(mapa.values());
  peliculas.forEach((entry) => {
    entry.sesiones.sort((a, b) => a.hora.localeCompare(b.hora));
  });

  console.log(
    `✅ Cinesa Bonaire [${fecha}]: ${peliculas.length} películas con sesiones`,
  );

  return [
    {
      cine: CINES_CINESA[0],
      peliculas,
      actualizado_en: new Date().toISOString(),
    },
  ];
}
