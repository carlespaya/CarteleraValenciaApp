// src/lib/scrapers/yelmo.ts
// Yelmo pasó a ser "Cine Yelmo" (grupo Cinépolis) y su web es ahora
// cineyelmo.com. La antigua API de yelmocines.es ya no responde.
//
// Cargamos con Chromium las páginas públicas, igual que un visitante, y leemos
// los datos que la propia página recibe:
//  - La portada recibe la lista de películas (título, póster, duración…).
//  - La página de horarios de cada cine recibe su programación de TODOS los
//    días en una sola respuesta, así que una carga sirve para los 7 días.

import { abrirPagina } from "./browser";
import { fechaISO } from "@/lib/fechas";
import { memoizar } from "@/lib/memo";
import type { Cine, Pelicula, Sesion, CartelCine } from "@/types";
import type { Page, Response } from "playwright";

const WEB = "https://cineyelmo.com/es";
const MINUTO = 60_000;

const CONTEXTO = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  locale: "es-ES",
};

// Identificador de cada cine en cineyelmo.com
const ID_WEB: Record<string, string> = {
  "yelmo-campanar": "mercado-de-campanar-valencia",
  "yelmo-vidanova": "vidanova-parc-valencia",
};

function urlHorarios(idWeb: string) {
  return `${WEB}/horarios?city=valencia&cinema=${idWeb}`;
}

export const CINES_YELMO: Cine[] = [
  {
    id: "yelmo-campanar",
    nombre: "Yelmo Cines Campanar",
    slug: "yelmo-campanar",
    ciudad: "Valencia",
    direccion: "C/ Menorca, 19, Valencia",
    url: urlHorarios(ID_WEB["yelmo-campanar"]),
    fuente: "yelmo",
    activo: true,
  },
  {
    id: "yelmo-vidanova",
    nombre: "Yelmo Cines VidaNova Parc",
    slug: "yelmo-vidanova",
    ciudad: "Valencia",
    direccion: "Av. de les Corts Valencianes, 58, Valencia",
    url: urlHorarios(ID_WEB["yelmo-vidanova"]),
    fuente: "yelmo",
    activo: true,
  },
];

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/&/g, "y")
    .replace(/\s+/g, "")
    .replace(/\b(the|a|an|star|wars|&amp;)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+$/, "")
    .replace(/&/g, "y")
    .replace(/monstruos/g, "monsters");
}

// ─── Lectura de las respuestas que recibe la página ──────────────────────────

// ¿Es esta respuesta la consulta GraphQL `operacion` que hace la página?
function esConsulta(
  respuesta: Response,
  operacion: string,
  variables: Record<string, string> = {},
): boolean {
  if (!respuesta.url().includes("api-g.cinepolis.com")) return false;
  try {
    const peticion = respuesta.request().postDataJSON();
    if (peticion?.operationName !== operacion) return false;
    return Object.entries(variables).every(
      ([clave, valor]) => peticion.variables?.[clave] === valor,
    );
  } catch {
    return false;
  }
}

async function esperarConsulta(
  page: Page,
  operacion: string,
  variables: Record<string, string> = {},
) {
  const respuesta = await page.waitForResponse(
    (r) => esConsulta(r, operacion, variables),
    { timeout: 30000 },
  );
  return (await respuesta.json())?.data;
}

// Películas en cartelera y en preventa (todas las de España), por id
async function cargarPeliculas(): Promise<Map<string, any>> {
  const { page, cerrar } = await abrirPagina({
    contexto: CONTEXTO,
    bloquearRecursos: true,
  });
  try {
    const enCartelera = esperarConsulta(page, "Movies", {
      category: "now-playing",
    });
    const proximamente = esperarConsulta(page, "Movies", {
      category: "coming-soon",
    }).catch(() => null);

    await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 30000 });
    const respuestas = await Promise.all([enCartelera, proximamente]);

    const peliculas = new Map<string, any>();
    for (const datos of respuestas) {
      for (const { node } of datos?.movies?.edges ?? []) {
        if (node?.id && !peliculas.has(node.id)) peliculas.set(node.id, node);
      }
    }
    if (peliculas.size === 0) throw new Error("Cine Yelmo: sin películas");
    return peliculas;
  } finally {
    await cerrar();
  }
}

// Programación completa (todos los días) de un cine
async function cargarProgramacion(idWeb: string): Promise<any> {
  const { page, cerrar } = await abrirPagina({
    contexto: CONTEXTO,
    bloquearRecursos: true,
  });
  try {
    const programacion = esperarConsulta(page, "Billboard", {
      cinemaId: idWeb,
    });
    await page.goto(urlHorarios(idWeb), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const datos = await programacion;
    if (!datos?.billboardByCinema) {
      throw new Error(`Cine Yelmo ${idWeb}: respuesta sin programación`);
    }
    return datos.billboardByCinema;
  } finally {
    await cerrar();
  }
}

// ─── Conversión al formato de la app ─────────────────────────────────────────

// Idioma de la sesión → etiqueta habitual (VE, VOSE, VO)
function etiquetaIdioma(idioma: any): string {
  const codigo = String(idioma?.language ?? "").toUpperCase();
  if (codigo === "ESP") return "VE";
  if (codigo === "SUB ESP") return "VOSE";
  if (codigo === "NO SUB" || codigo === "ING") return "VO";
  return idioma?.displayLanguage || codigo;
}

function formatoSesion(showtime: any, idioma: any): string {
  return [
    showtime.format?.name ?? "2D",
    etiquetaIdioma(idioma),
    showtime.experience?.name,
  ]
    .filter(Boolean)
    .join(" ");
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

function datosPelicula(id: string, titulo: string, meta: any): Pelicula {
  const poster = (meta?.media ?? []).find((m: any) => m.code === "poster")
    ?.sizes;
  const generos: string[] = Array.isArray(meta?.genre) ? meta.genre : [];
  return {
    id,
    titulo,
    duracion: parseInt(meta?.length) || undefined,
    clasificacion: meta?.rating || undefined,
    genero: generos.length ? generos.map(capitalizar).join(", ") : undefined,
    poster: poster?.large || poster?.medium || undefined,
    sinopsis: meta?.synopsis || undefined,
  };
}

function parsearCine(
  programacion: any,
  peliculas: Map<string, any>,
  cine: Cine,
  fecha: string,
): CartelCine {
  const ahora = new Date().toISOString();
  const resultado: CartelCine["peliculas"] = [];

  for (const programa of programacion.schedules ?? []) {
    const dia = (programa.dates ?? []).find((d: any) => d.date === fecha);
    if (!dia) continue;

    const meta = peliculas.get(programa.movieId);
    const titulo: string = meta?.name ?? programa.movieId;
    const peliculaId = slugify(titulo);

    const sesiones: Sesion[] = [];
    for (const idioma of dia.languages ?? []) {
      for (const showtime of idioma.showtimes ?? []) {
        sesiones.push({
          id: `yelmo-${showtime.cinemaVistaId}-${showtime.sessionId}`,
          cine_id: cine.id,
          pelicula_id: peliculaId,
          fecha,
          hora: String(showtime.datetime).slice(11, 16),
          sala: showtime.screen ?? undefined,
          formato: formatoSesion(showtime, idioma),
          url_compra: cine.url,
          disponible: true,
          actualizado_en: ahora,
        });
      }
    }
    if (sesiones.length === 0) continue;

    sesiones.sort((a, b) => a.hora.localeCompare(b.hora));
    resultado.push({
      pelicula: datosPelicula(peliculaId, titulo, meta),
      sesiones,
    });
  }

  console.log(`✅ ${cine.nombre} [${fecha}]: ${resultado.length} películas`);
  return { cine, peliculas: resultado, actualizado_en: ahora };
}

// Un reintento: con mucha carga (arranque en frío) la web a veces no responde
async function conReintento<T>(tarea: () => Promise<T>): Promise<T> {
  try {
    return await tarea();
  } catch {
    return tarea();
  }
}

export async function scrapearYelmo(
  fechaObjetivo?: string,
): Promise<CartelCine[]> {
  const fecha = fechaObjetivo ?? fechaISO();
  const peliculas = await memoizar("yelmo:peliculas", 30 * MINUTO, () =>
    conReintento(cargarPeliculas),
  );

  // Un cine detrás de otro, para no saturar la web con páginas simultáneas
  const carteles: CartelCine[] = [];
  for (const cine of CINES_YELMO) {
    const idWeb = ID_WEB[cine.id];
    try {
      const programacion = await memoizar(
        `yelmo:programacion:${idWeb}`,
        10 * MINUTO,
        () => conReintento(() => cargarProgramacion(idWeb)),
      );
      carteles.push(parsearCine(programacion, peliculas, cine, fecha));
    } catch (error) {
      console.error(`❌ Error scrapeando ${cine.nombre}:`, error);
      carteles.push({
        cine,
        peliculas: [],
        actualizado_en: new Date().toISOString(),
        error: String(error),
      });
    }
  }
  return carteles;
}
