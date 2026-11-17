// src/lib/scrapers/ocine.ts
// Scraper de OCine Premium Aqua (Valencia)
// La web se rehízo y ya no publica el JSON de cartelera. Estrategia en dos pasos:
//  1. Cargamos con Chromium la web de venta de entradas, que al abrirse recibe
//     la lista de películas en cartelera, y leemos esa respuesta.
//  2. Por cada película pedimos su ficha pública (/api/v1/pelicula/{id}), que
//     incluye las variantes (ATMOS, URBAN…) con las sesiones de todos los días.

import { abrirPagina } from "./browser";
import { fechaISO } from "@/lib/fechas";
import { memoizar } from "@/lib/memo";

const TICKETS = "https://tickets.ocinepremiumaqua.es";
const MINUTO = 60_000;

function tituloBase(titulo: string) {
  return titulo.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

interface SesionRaw {
  id: string;
  cine_id: string;
  pelicula_id: string;
  fecha: string;
  hora: string;
  sala: string;
  formato: string;
  url_compra: string;
  disponible: boolean;
  actualizado_en: string;
}

// Ids de las películas en cartelera, estrenos y preventas
async function cargarIdsPeliculas(): Promise<number[]> {
  const { page, cerrar } = await abrirPagina({ bloquearRecursos: true });
  try {
    const lista = page.waitForResponse(
      (r) => r.url().startsWith(`${TICKETS}/api/v1/sessions`),
      { timeout: 30000 },
    );
    await page.goto(`${TICKETS}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const json = await (await lista).json();

    const ids = new Set<number>();
    for (const grupo of [json.pelicules, json.estrenes, json.anticipades]) {
      for (const p of grupo ?? []) if (p?.id) ids.add(p.id);
    }
    if (ids.size === 0) throw new Error("Ocine: lista de películas vacía");
    return Array.from(ids);
  } finally {
    await cerrar();
  }
}

async function obtenerDetallePelicula(id: number) {
  try {
    return await memoizar(`ocine:pelicula:${id}`, 10 * MINUTO, async () => {
      const res = await fetch(`${TICKETS}/api/v1/pelicula/${id}?lang=es`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Ocine película ${id}: ${res.status}`);
      // El póster viene incrustado en base64 (decenas de KB): no lo guardamos
      const { poster, ...detalle } = await res.json();
      return detalle;
    });
  } catch {
    return null;
  }
}

// ["ATMOS", "2D"] → "ATMOS"; ["Versión VOSE", "2D"] → "VOSE"; ["2D"] → "2D"
function formatoVariante(variante: any): string {
  const etiquetas = (variante.propietatsDesc ?? [])
    .filter((d: string) => d && d !== "2D")
    .map((d: string) =>
      /vose/i.test(d) ? "VOSE" : /original/i.test(d) ? "VO" : d,
    );
  return etiquetas.length > 0 ? etiquetas.join(" ") : "2D";
}

export async function scrapearOcine(fechaFiltro?: string) {
  const hoy = fechaISO();
  const fechaObjetivo = fechaFiltro ?? hoy;
  const esHoy = fechaObjetivo === hoy;

  // La hora actual solo importa para filtrar sesiones pasadas cuando es HOY
  const horaActual = esHoy
    ? new Date().toLocaleTimeString("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "00:00";

  // Una sola carga de la lista y de cada ficha sirve para los 7 días
  const ids = await memoizar("ocine:ids", 10 * MINUTO, cargarIdsPeliculas);
  const detalles = await Promise.all(ids.map(obtenerDetallePelicula));

  const peliculas = detalles
    .filter((detalle) => detalle !== null)
    .map((detalle: any) => {
      const titulo = tituloBase(detalle.titol ?? "");
      const urlFicha = `${TICKETS}/#/DetallPelicula/${detalle.id}`;
      const sesiones: SesionRaw[] = [];
      const vistas = new Set<number>();

      // Las sesiones pueden venir en la propia película o en sus variantes
      for (const variante of [detalle, ...(detalle.subPelicules ?? [])]) {
        for (const s of variante.sessions ?? []) {
          const horaSesion = String(s.hora ?? "").slice(0, 5);

          // Filtramos por la fecha objetivo; si es hoy, también descartamos pasadas
          if (s.data !== fechaObjetivo) continue;
          if (esHoy && horaSesion < horaActual) continue;
          if (vistas.has(s.planificacio)) continue;
          vistas.add(s.planificacio);

          sesiones.push({
            id: `ocine-${detalle.id}-${s.planificacio}`,
            cine_id: "ocine-aqua",
            pelicula_id: String(detalle.id),
            fecha: fechaObjetivo,
            hora: horaSesion,
            sala: s.nomSala ?? s.sala,
            formato: formatoVariante(variante),
            url_compra: urlFicha,
            disponible: s.disponibles === undefined || s.disponibles > 0,
            actualizado_en: new Date().toISOString(),
          });
        }
      }

      sesiones.sort((a, b) => a.hora.localeCompare(b.hora));

      return {
        pelicula: {
          id: String(detalle.id),
          titulo,
          duracion: Number(detalle.durada) || undefined,
          clasificacion: detalle.classificacio || undefined,
          genero: detalle.genereComercial || undefined,
          poster: undefined,
          sinopsis: detalle.sinopsis ?? "",
          trailer: detalle.videoExtern || undefined,
        },
        sesiones,
      };
    })
    .filter((p) => p.sesiones.length > 0);

  console.log(
    `✅ Ocine Premium Aqua [${fechaObjetivo}]: ${peliculas.length} películas con sesiones`,
  );

  return {
    cine: {
      id: "ocine-aqua",
      nombre: "Ocine Premium Aqua",
    },
    peliculas,
  };
}
