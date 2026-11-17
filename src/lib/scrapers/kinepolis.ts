// src/lib/scrapers/kinepolis.ts
import { abrirPagina } from "./browser";
import { diaSemana, fechaISO, sumarDias } from "@/lib/fechas";
import { memoizar } from "@/lib/memo";
import type { Cine, CartelCine, Pelicula, Sesion } from "@/types";

const URL_FILMAFFINITY =
  "https://www.filmaffinity.com/es/theater-showtimes.php?id=295";

export const CINE_KINEPOLIS: Cine = {
  id: "kinepolis-valencia",
  nombre: "Kinépolis Valencia",
  slug: "kinepolis-valencia",
  ciudad: "Paterna",
  direccion: "Av. de Francisco Tomás y Valiente, s/n, 46980 Paterna, Valencia",
  url: URL_FILMAFFINITY,
  fuente: "filmaffinity",
  activo: true,
};

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/&/g, "y")
    .replace(/\s+/g, "")
    .replace(/\b(the|a|an|star|wars|&amp;)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+$/, "")
    .replace(/&/g, "y")
    .replace(/monstruos/g, "monsters");
}

function esSesionFutura(horaSesion: string, horaActual: string): boolean {
  const parseHora = (h: string) => {
    const [horas, mins] = h.split(":").map(Number);
    return horas < 4 ? (horas + 24) * 60 + mins : horas * 60 + mins;
  };
  return parseHora(horaSesion) >= parseHora(horaActual);
}

// ─── Mapeo de nombres de días ES → índice (0=lunes, 6=domingo) ───────────────
const DIAS_ES: Record<string, number> = {
  lunes: 0,
  martes: 1,
  miércoles: 2,
  miercoles: 2,
  mié: 2,
  mie: 2,
  jueves: 3,
  viernes: 4,
  sábado: 5,
  sabado: 5,
  sáb: 5,
  sab: 5,
  domingo: 6,
  dom: 6,
};

const MESES_ES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

/**
 * Intenta deducir la fecha ISO (YYYY-MM-DD) a partir del texto que aparece
 * en el HTML de FilmAffinity antes de cada bloque de horarios.
 * Ejemplos de texto que puede recibir:
 *   "hoy", "mañana", "lunes", "martes 27 agosto", "27 agosto"
 */
function parsearFechaTexto(
  texto: string,
  fechaReferencia: Date,
): string | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const hoy = fechaISO(fechaReferencia);

  if (t === "hoy") {
    return hoy;
  }

  if (t === "manana" || t === "mañana") {
    return sumarDias(hoy, 1);
  }

  // "lunes", "martes", etc. — día de la semana sin número
  for (const [nombre, idx] of Object.entries(DIAS_ES)) {
    if (t === nombre) {
      // Buscar el próximo día de la semana con ese índice (0=lunes … 6=domingo)
      const hoyIdx = (diaSemana(hoy) + 6) % 7; // convertimos de JS (0=dom) a (0=lun)
      let diff = idx - hoyIdx;
      if (diff <= 0) diff += 7;
      return sumarDias(hoy, diff);
    }
  }

  // "martes 27 agosto", "27 agosto", "27 de agosto", etc.
  const matchDiaMes = t.match(/(\d{1,2})\s+(?:de\s+)?([a-z]+)/);
  if (matchDiaMes) {
    const dia = parseInt(matchDiaMes[1]);
    const mesNombre = matchDiaMes[2];
    const mesIdx = MESES_ES[mesNombre];
    if (mesIdx !== undefined) {
      const [anyoRef, mesRef] = hoy.split("-").map(Number);
      const anyo = mesRef - 1 > mesIdx ? anyoRef + 1 : anyoRef;
      return `${anyo}-${String(mesIdx + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  }

  return null;
}

// La página de FilmAffinity trae los horarios de todos los días: se descarga
// una vez y se reutiliza durante 10 minutos para el resto de fechas.
function obtenerHtmlCartelera(): Promise<string> {
  return memoizar("kinepolis:html", 10 * 60_000, async () => {
    const { page, cerrar } = await abrirPagina({
      contexto: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        locale: "es-ES",
      },
      bloquearRecursos: true,
    });
    try {
      await page.goto(CINE_KINEPOLIS.url, {
        waitUntil: "networkidle",
        timeout: 35000,
      });
      return await page.content();
    } finally {
      await cerrar();
    }
  });
}

export async function scrapearKinepolis(
  fechaObjetivo?: string,
): Promise<CartelCine> {
  const ahora = new Date();
  const fechaFiltro = fechaObjetivo ?? fechaISO(ahora);
  const esHoy = fechaFiltro === fechaISO(ahora);

  const horaActualStr = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);

  try {
    console.log(`🚀 [Kinépolis] Scrapeando cartelera para ${fechaFiltro}...`);

    const html = await obtenerHtmlCartelera();

    const peliculasRaw: {
      titulo: string;
      poster?: string;
      sesiones: { hora: string; url: string }[];
    }[] = [];

    // Dividimos el HTML por cada enlace de película en FilmAffinity
    const chunks = html.split(/href=["'][^"']*(?:\/es)?\/film\d+\.html["']/i);
    let ultimoPosterDetectado: string | undefined = undefined;

    for (const chunk of chunks.slice(1)) {
      const matchPoster = chunk.match(
        /https:\/\/pics\.filmaffinity\.com\/[^"'\s]+-(?:large|mmed|msmall)\.jpg/i,
      );
      if (matchPoster) {
        ultimoPosterDetectado = matchPoster[0].replace(
          /-(?:msmall|mmed)\.jpg/i,
          "-large.jpg",
        );
      }

      const matchTitle = chunk.match(/^[^>]*>([^<]+)<\/a>/);
      if (!matchTitle) continue;

      const tituloBruto = matchTitle[1].trim();

      if (
        tituloBruto.length < 2 ||
        [
          "ficha",
          "critica",
          "crítica",
          "trailer",
          "tráiler",
          "imagenes",
          "imágenes",
          "cines",
          "ver más",
          "filmaffinity",
        ].includes(tituloBruto.toLowerCase())
      ) {
        continue;
      }

      const idxEnlaceTitulo = chunk.indexOf("</a>");
      if (idxEnlaceTitulo === -1) continue;

      const htmlSesiones = chunk.substring(idxEnlaceTitulo + 4);
      const posterFinalPelicula = ultimoPosterDetectado;
      ultimoPosterDetectado = undefined;

      // ── Parsear sesiones agrupadas por día ──────────────────────────────────
      // FilmAffinity estructura el HTML así:
      //   <etiqueta>hoy</etiqueta> ... <a href="...">17:30</a> <a>20:00</a> ...
      //   <etiqueta>mañana</etiqueta> ... <a href="...">16:00</a> ...
      //
      // Dividimos el bloque por los "separadores de día" (texto de día que
      // aparece en el HTML) para procesar cada día por separado.

      // Regex que detecta texto de día en el HTML (dentro de cualquier tag)
      const regexSeparadorDia =
        />\s*(hoy|ma[ñn]ana|\blunes\b|\bmartes\b|\bmi[eé]rcoles\b|\bjueves\b|\bviernes\b|\bs[aá]bado\b|\bdomingo\b|\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))\s*</i;

      const regexSesion =
        /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(\d{2}[:.]\d{2})<\/a>/gi;

      // Buscamos todos los separadores de día dentro del bloque de esta película
      const separadores: { index: number; textoFecha: string }[] = [];
      const regexSep =
        />\s*(hoy|ma[ñn]ana|\blunes\b|\bmartes\b|\bmi[eé]rcoles\b|\bjueves\b|\bviernes\b|\bs[aá]bado\b|\bdomingo\b(?:\s+\d{1,2}(?:\s+de)?\s+\w+)?|\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))\s*</gi;

      let mSep;
      while ((mSep = regexSep.exec(htmlSesiones)) !== null) {
        separadores.push({ index: mSep.index, textoFecha: mSep[1].trim() });
      }

      // Si no encontramos separadores, intentamos con la lógica original (solo hoy)
      if (separadores.length === 0) {
        // Fallback: buscar sesiones sin estructura de día; las asignamos a hoy
        let matchSesion;
        let esHoyBloque = false;
        let esPrimera = true;
        let ultimoIndice = 0;

        const regexSesionFallback =
          /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(\d{2}[:.]\d{2})<\/a>/gi;

        while (
          (matchSesion = regexSesionFallback.exec(htmlSesiones)) !== null
        ) {
          const textoIntermedio = htmlSesiones.substring(
            ultimoIndice,
            matchSesion.index,
          );
          ultimoIndice = regexSesionFallback.lastIndex;

          if (esPrimera) {
            esPrimera = false;
            esHoyBloque = /\bhoy\b/i.test(textoIntermedio);
            if (!esHoyBloque) break;
          }

          if (esHoyBloque && esHoy) {
            const hora = matchSesion[2].replace(".", ":");
            if (!esHoy || esSesionFutura(hora, horaActualStr)) {
              const existente = peliculasRaw.find(
                (p) => p.titulo === tituloBruto,
              );
              if (existente) {
                if (!existente.sesiones.some((s) => s.hora === hora)) {
                  existente.sesiones.push({ hora, url: CINE_KINEPOLIS.url });
                }
              } else {
                peliculasRaw.push({
                  titulo: tituloBruto,
                  poster: posterFinalPelicula,
                  sesiones: [{ hora, url: CINE_KINEPOLIS.url }],
                });
              }
            }
          }
        }
        continue;
      }

      // Procesamos cada bloque de día
      for (let si = 0; si < separadores.length; si++) {
        const sep = separadores[si];
        const inicio = sep.index;
        const fin =
          si + 1 < separadores.length
            ? separadores[si + 1].index
            : htmlSesiones.length;

        const bloqueDia = htmlSesiones.substring(inicio, fin);

        // Resolver a qué fecha ISO corresponde este separador
        const fechaResuelta = parsearFechaTexto(sep.textoFecha, ahora);

        // Solo procesamos si esta fecha coincide con la que queremos mostrar
        if (!fechaResuelta || fechaResuelta !== fechaFiltro) continue;

        // Extraer sesiones dentro de este bloque de día
        const regexS =
          /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(\d{2}[:.]\d{2})<\/a>/gi;
        let mS;

        while ((mS = regexS.exec(bloqueDia)) !== null) {
          let urlCompra = mS[1];
          if (
            urlCompra.startsWith("/") ||
            urlCompra.includes("filmaffinity.com")
          ) {
            urlCompra = CINE_KINEPOLIS.url;
          }

          const hora = mS[2].replace(".", ":");

          // Si es hoy, descartar sesiones pasadas
          if (esHoy && !esSesionFutura(hora, horaActualStr)) continue;

          const existente = peliculasRaw.find((p) => p.titulo === tituloBruto);
          if (existente) {
            if (!existente.sesiones.some((s) => s.hora === hora)) {
              existente.sesiones.push({ hora, url: urlCompra });
            }
            if (!existente.poster && posterFinalPelicula) {
              existente.poster = posterFinalPelicula;
            }
          } else {
            peliculasRaw.push({
              titulo: tituloBruto,
              poster: posterFinalPelicula,
              sesiones: [{ hora, url: urlCompra }],
            });
          }
        }
      }
    }

    const peliculasFinales = peliculasRaw
      .filter((p) => p.sesiones.length > 0)
      .map((p) => {
        const peliculaId = slugify(p.titulo);
        let formatoFinal = "VE";
        if (p.titulo.toUpperCase().includes("VOSE")) formatoFinal = "VOSE";
        if (p.titulo.toUpperCase().includes("3D")) formatoFinal += " 3D";

        const tituloLimpio = p.titulo
          .replace(/\(VOSE\)/gi, "")
          .replace(/\(3D\)/gi, "")
          .trim();

        const pelicula: Pelicula = {
          id: peliculaId,
          titulo: tituloLimpio,
          poster: p.poster,
        };

        const sesiones: Sesion[] = p.sesiones.map((s) => ({
          id: `${CINE_KINEPOLIS.id}-${peliculaId}-${fechaFiltro}-${s.hora.replace(":", "")}`,
          cine_id: CINE_KINEPOLIS.id,
          pelicula_id: peliculaId,
          fecha: fechaFiltro,
          hora: s.hora,
          formato: formatoFinal.trim(),
          url_compra: s.url,
          disponible: true,
          actualizado_en: ahora.toISOString(),
        }));

        sesiones.sort((a, b) => a.hora.localeCompare(b.hora));

        return { pelicula, sesiones };
      });

    console.log(
      `✅ ${CINE_KINEPOLIS.nombre} [${fechaFiltro}]: ${peliculasFinales.length} películas.`,
    );

    return {
      cine: CINE_KINEPOLIS,
      peliculas: peliculasFinales,
      actualizado_en: ahora.toISOString(),
    };
  } catch (error) {
    console.error(`❌ Error en el scraper de Kinépolis:`, error);
    return {
      cine: CINE_KINEPOLIS,
      peliculas: [],
      actualizado_en: ahora.toISOString(),
      error: String(error),
    };
  }
}
