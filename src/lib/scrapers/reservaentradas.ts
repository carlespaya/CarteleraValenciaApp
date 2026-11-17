// src/lib/scrapers/reservaentradas.ts
// La página de cada cine solo muestra las sesiones de HOY (ignora ?fecha=).
// Las de los próximos días están en la ficha de cada película, con una
// pestaña por día. Las dos páginas llegan ya montadas desde el servidor, así
// que basta con fetch + cheerio (sin Chromium):
//  1. Página del cine → películas (título, duración, género, póster) y el
//     enlace a la ficha de cada una.
//  2. Ficha de cada película → sesiones de todos los días. Una descarga sirve
//     para los 7 días.

import { load } from "cheerio/slim";
import { fechaISO, horaActual, momentoSesion } from "@/lib/fechas";
import { memoizar } from "@/lib/memo";
import type { Cine, Pelicula, Sesion, CartelCine } from "@/types";

const BASE_URL = "https://www.reservaentradas.com";
const MINUTO = 60_000;

export const CINES_RESERVAENTRADAS: Cine[] = [
  {
    id: "cineslys-valencia",
    nombre: "Cines Lys",
    slug: "cineslys",
    ciudad: "Valencia",
    direccion: "C/ Dr. Serrano, 6, Valencia",
    url: `${BASE_URL}/cine/valencia/cineslys`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "abcpark-valencia",
    nombre: "Cines ABC Park",
    slug: "abcpark",
    ciudad: "Valencia",
    direccion: "C/ Joan Verdeguer, 5, Valencia",
    url: `${BASE_URL}/cine/valencia/abcpark`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "cinesbabel-valencia",
    nombre: "Cines Babel",
    slug: "cinesbabel",
    ciudad: "Valencia",
    direccion: "C/ Vicente Sancho Tello, 10, Valencia",
    url: `${BASE_URL}/cine/valencia/cinesbabel`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "alucine-valencia",
    nombre: "Alucine",
    slug: "cinealucine",
    ciudad: "Valencia",
    direccion: "Fundición, 76, 46520, Sagunto",
    url: `${BASE_URL}/cine/valencia/cinealucine`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "cinestudio-dor-valencia",
    nombre: "Cinestudio D'or",
    slug: "cinestudio-dor",
    ciudad: "Valencia",
    direccion: "C/ Doctor García Donato, 31, Valencia",
    url: `${BASE_URL}/cine/valencia/cinestudiodor`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "cines-axion-premium-gandia",
    nombre: "Cines Axion Premium Gandia",
    slug: "axion-gandia",
    ciudad: "Valencia",
    direccion: "Avenida Blasco Ibañez, 6, 46701, Gandía",
    url: `${BASE_URL}/cine/valencia/cinesaxionpremiumgandia`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "cines-mn4-alfafar",
    nombre: "Cines MN4",
    slug: "mn4",
    ciudad: "Valencia",
    direccion: "Calle Alcalde José Puertes, 5, 46910, Alfafar",
    url: `${BASE_URL}/cine/valencia/cinesmn4`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "abc-gran-turia",
    nombre: "ABC Gran Turia",
    slug: "abc-gran-turia",
    ciudad: "Valencia",
    direccion: "Plaza de Europa S/N 46950, Xirivella",
    url: `${BASE_URL}/cine/valencia/abcgranturia`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "abc-saler",
    nombre: "ABC Saler",
    slug: "abc-saler",
    ciudad: "Valencia",
    direccion: "Av Profesor López Piñero,16 46013, Valencia",
    url: `${BASE_URL}/cine/valencia/abcelsaler`,
    fuente: "reservaentradas",
    activo: true,
  },
  {
    id: "abc-gandia",
    nombre: "ABC Gandia",
    slug: "abc-gandia",
    ciudad: "Valencia",
    direccion: "Avenida La Vital, 10 46701, Gandia",
    url: `${BASE_URL}/cine/valencia/abcgandia`,
    fuente: "reservaentradas",
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

// ─── Descargas (con un máximo simultáneo para no saturar la web) ──────────────

const MAX_DESCARGAS = 4;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const g = globalThis as typeof globalThis & {
  __descargasReservaEntradas?: { activas: number; cola: (() => void)[] };
};
const descargas = (g.__descargasReservaEntradas ??= { activas: 0, cola: [] });

async function descargar(url: string): Promise<string> {
  if (descargas.activas < MAX_DESCARGAS) descargas.activas++;
  else await new Promise<void>((resolve) => descargas.cola.push(resolve));

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es-ES" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return await res.text();
  } finally {
    const siguiente = descargas.cola.shift();
    if (siguiente) siguiente();
    else descargas.activas--;
  }
}

// ─── Página del cine: lista de películas ─────────────────────────────────────

interface PeliculaCine {
  ficha: string;
  titulo: string;
  duracion?: number;
  genero?: string;
  clasificacion?: string;
  poster?: string;
}

// "No recomendado para menores de 12 años." → "+12"
function clasificacionDe(texto?: string): string | undefined {
  if (!texto?.trim()) return undefined;
  const edad = texto.match(/menores de (\d+)/i)?.[1];
  if (edad) return `+${edad}`;
  if (/todos los p[uú]blicos|infancia/i.test(texto)) return "TP";
  return texto.trim().replace(/\.$/, "");
}

async function listarPeliculas(cine: Cine): Promise<PeliculaCine[]> {
  const $ = load(await descargar(cine.url));
  const porFicha = new Map<string, PeliculaCine>();

  // Cada película aparece en un bloque .movie (a veces en varias pestañas)
  $(".movie").each((_, bloque) => {
    const $bloque = $(bloque);
    const ficha = $bloque.find('a[href*="/sesiones/"]').first().attr("href");
    if (!ficha || porFicha.has(ficha)) return;

    const titulo = $bloque.find(".title-movie-list").first().text().trim();
    // Duración y calificación: <div class="calificacion-list">108 min.
    // <span class="tip" title="No recomendado para menores de 16 años.">
    const $calificacion = $bloque.find(".calificacion-list").first();
    const duracion = $calificacion.text().match(/(\d{1,3})\s*min/)?.[1];
    // El género, cuando lo hay, va justo detrás: "108 min. Terror."
    const genero = $bloque
      .text()
      .replace(/\s+/g, " ")
      .match(/\d\s*min\.\s*([^.]{2,30})\./)?.[1]
      ?.trim();
    // Carga diferida: mientras la imagen no se carga, src es un pixel de
    // relleno y la URL real está en data-original
    const img = $bloque.find("img").first();
    const poster = [img.attr("data-original"), img.attr("src")].find(
      (url) => url && !url.startsWith("data:"),
    );

    porFicha.set(ficha, {
      ficha,
      titulo,
      duracion: duracion ? parseInt(duracion) : undefined,
      // Sin género, lo siguiente es "No hay sesiones disponibles para hoy."
      genero: genero && !/sesion|hoy/i.test(genero) ? genero : undefined,
      clasificacion: clasificacionDe(
        $calificacion.find(".tip").first().attr("title"),
      ),
      poster,
    });
  });

  // Por si cambia la maqueta: al menos los enlaces a las fichas
  if (porFicha.size === 0) {
    $('a[href*="/sesiones/valencia/"]').each((_, enlace) => {
      const ficha = $(enlace).attr("href");
      if (ficha && !porFicha.has(ficha)) {
        porFicha.set(ficha, { ficha, titulo: $(enlace).text().trim() });
      }
    });
  }

  return Array.from(porFicha.values());
}

// ─── Ficha de la película: sesiones de todos los días ────────────────────────

interface SesionFicha {
  idSesion: string;
  fecha: string;
  hora: string;
  formato: string;
  sala?: string;
  disponible: boolean;
  url: string;
}

interface Ficha {
  titulo: string;
  poster?: string;
  sesiones: SesionFicha[];
}

// "4 / 11" → "2026-11-04" (en diciembre, las de enero son del año siguiente)
function fechaDeDiaMes(dia: number, mes: number, hoy: string): string {
  const [anyoHoy, mesHoy] = hoy.split("-").map(Number);
  const anyo = mes < mesHoy - 6 ? anyoHoy + 1 : anyoHoy;
  return `${anyo}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Cabecera de formato de la ficha ("DIGITAL", "(VOSE)", "3D"…) → etiqueta
function formatoDeCabecera(cabecera: string): string {
  const texto = cabecera.toUpperCase();
  const version = /V\.?O\.?S\.?E/.test(texto)
    ? "VOSE"
    : /\bV\.?O\b|VERSI[OÓ]N ORIGINAL/.test(texto)
      ? "VO"
      : "VE";
  const extras = ["3D", "IMAX", "4DX", "ATMOS"].filter((x) =>
    texto.includes(x),
  );
  return [version, ...extras].join(" ");
}

async function leerFicha(url: string): Promise<Ficha> {
  const $ = load(await descargar(url));
  const hoy = fechaISO();
  const sesiones: SesionFicha[] = [];

  // Una pestaña por día: <a data-toggle="tab" href="#3">Vi <br> 6 / 11</a>
  $('a[data-toggle="tab"]').each((_, pestana) => {
    const destino = $(pestana).attr("href") ?? "";
    const diaMes = $(pestana)
      .text()
      .match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!destino.startsWith("#") || !diaMes) return;
    const fecha = fechaDeDiaMes(+diaMes[1], +diaMes[2], hoy);

    // Dentro del día, cada cabecera <p> indica el formato de las sesiones
    // que la siguen
    let formato = "VE";
    $(`[id="${destino.slice(1)}"]`)
      .find('p, a[href*="/entrada/"]')
      .each((_, el) => {
        const $el = $(el);
        if ($el.is("p")) {
          formato = formatoDeCabecera($el.text());
          return;
        }
        const hora = $el.text().trim();
        const href = $el.attr("href");
        const idSesion = href?.match(/\/(\d+)\/?(\?|$)/)?.[1];
        if (!href || !idSesion || !/^\d{1,2}:\d{2}$/.test(hora)) return;

        // Sala y plazas libres vienen en el texto del popover
        const info =
          $el.closest(".session-container").attr("popover-content") ?? "";
        const sala = info.match(/Sala:\s*<b>([^<]+)<\/b>/)?.[1]?.trim();
        const plazas = info.match(/Plazas disponibles:\s*<b>(\d+)<\/b>/)?.[1];

        sesiones.push({
          idSesion,
          fecha,
          hora: hora.padStart(5, "0"),
          formato,
          sala,
          disponible: plazas === undefined || Number(plazas) > 0,
          url: href,
        });
      });
  });

  return {
    titulo: $("h2").first().text().trim(),
    poster: $('meta[property="og:image"]').attr("content") || undefined,
    sesiones,
  };
}

// ─── Cartelera de un cine para un día ────────────────────────────────────────

export async function scrapearCine(
  cine: Cine,
  fechaObjetivo?: string,
): Promise<CartelCine> {
  const fecha = fechaObjetivo ?? fechaISO();
  const ahora = new Date().toISOString();

  try {
    const peliculasCine = await memoizar(
      `reservaentradas:cine:${cine.id}`,
      30 * MINUTO,
      () => listarPeliculas(cine),
    );

    let fallidas = 0;
    const fichas = await Promise.all(
      peliculasCine.map((p) =>
        memoizar(`reservaentradas:ficha:${p.ficha}`, 30 * MINUTO, () =>
          leerFicha(p.ficha),
        ).catch((error) => {
          fallidas++;
          console.error(`❌ ${cine.nombre}: ficha ${p.ficha}`, String(error));
          return null;
        }),
      ),
    );
    if (peliculasCine.length > 0 && fallidas === peliculasCine.length) {
      throw new Error("No se pudo leer ninguna ficha");
    }

    // Las sesiones que ya han empezado no se muestran
    const ya = `${fechaISO()} ${horaActual()}`;

    const peliculas: CartelCine["peliculas"] = [];
    peliculasCine.forEach((p, i) => {
      const ficha = fichas[i];
      if (!ficha) return;

      const titulo = p.titulo || ficha.titulo;
      const peliculaId = slugify(titulo);
      const sesiones: Sesion[] = ficha.sesiones
        .filter(
          (s) => s.fecha === fecha && momentoSesion(s.fecha, s.hora) >= ya,
        )
        .map((s) => ({
          id: `${cine.id}-${s.idSesion}`,
          cine_id: cine.id,
          pelicula_id: peliculaId,
          fecha,
          hora: s.hora,
          sala: s.sala,
          formato: s.formato,
          url_compra: s.url,
          disponible: s.disponible,
          actualizado_en: ahora,
        }))
        .sort((a, b) =>
          momentoSesion(fecha, a.hora).localeCompare(
            momentoSesion(fecha, b.hora),
          ),
        );
      if (sesiones.length === 0) return;

      const pelicula: Pelicula = {
        id: peliculaId,
        titulo,
        duracion: p.duracion,
        genero: p.genero,
        clasificacion: p.clasificacion,
        poster: p.poster ?? ficha.poster,
      };
      peliculas.push({ pelicula, sesiones });
    });

    console.log(
      `✅ ${cine.nombre} [${fecha}]: ${peliculas.length} películas scrapeadas`,
    );

    return { cine, peliculas, actualizado_en: ahora };
  } catch (error) {
    console.error(`❌ Error scrapeando ${cine.nombre}:`, error);
    return { cine, peliculas: [], actualizado_en: ahora, error: String(error) };
  }
}

export async function scrapearTodosCines(
  fechaObjetivo?: string,
): Promise<CartelCine[]> {
  const resultados = await Promise.allSettled(
    CINES_RESERVAENTRADAS.filter((c) => c.activo).map((cine) =>
      scrapearCine(cine, fechaObjetivo),
    ),
  );

  return resultados
    .filter(
      (r): r is PromiseFulfilledResult<CartelCine> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}
