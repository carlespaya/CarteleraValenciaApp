// src/lib/cartelera.ts
// Construye la cartelera de un día juntando todas las fuentes y la enriquece
// con OMDb. La usa scripts/generar-cartelera.ts, que la guarda como JSON.

import { enriquecerPeliculas } from "@/lib/omdb";
import { scrapearTodosCines } from "@/lib/scrapers/reservaentradas";
import { scrapearYelmo } from "@/lib/scrapers/yelmo";
import { scrapearOcine } from "@/lib/scrapers/ocine";
import { scrapearCinesa } from "@/lib/scrapers/cinesa";
import { scrapearKinepolis } from "@/lib/scrapers/kinepolis";
import type { CartelCine, CarteleraDia } from "@/types";

/**
 * `anterior` es la cartelera que se generó la vez pasada para ese día: si un
 * cine falla ahora, se conserva lo último que teníamos de él.
 */
export async function construirCartelera(
  fecha: string,
  anterior: CarteleraDia | null,
): Promise<{ data: CarteleraDia; incompleta: boolean }> {
  const inicio = Date.now();
  let incompleta = false;

  const [reservaResult, yelmoResult, ocineResult, cinesaResult, kinepolisResult] =
    await Promise.allSettled([
      scrapearTodosCines(fecha),
      scrapearYelmo(fecha),
      scrapearOcine(fecha),
      scrapearCinesa(fecha),
      scrapearKinepolis(fecha),
    ]);

  const todos: CartelCine[] = [];
  const fallo = (fuente: string, motivo: unknown) => {
    incompleta = true;
    console.error(
      `❌ ${fuente} [${fecha}] falló:`,
      motivo instanceof Error ? motivo.message : motivo,
    );
  };

  if (reservaResult.status === "fulfilled") {
    todos.push(...reservaResult.value);
  } else {
    fallo("ReservaEntradas", reservaResult.reason);
  }

  if (yelmoResult.status === "fulfilled") {
    todos.push(...yelmoResult.value);
  } else {
    fallo("Yelmo", yelmoResult.reason);
  }

  if (ocineResult.status === "fulfilled") {
    const ocine = ocineResult.value;
    todos.push({
      cine: {
        id: ocine.cine.id,
        nombre: ocine.cine.nombre,
        slug: ocine.cine.id,
        ciudad: "Valencia",
        direccion: "Calle Menorca, 19, Valencia",
        url: "https://ocinepremiumaqua.es/",
        fuente: "ocine",
        activo: true,
      },
      peliculas: ocine.peliculas,
      actualizado_en: new Date().toISOString(),
    });
  } else {
    fallo("Ocine", ocineResult.reason);
  }

  if (cinesaResult.status === "fulfilled") {
    todos.push(...cinesaResult.value);
  } else {
    fallo("Cinesa", cinesaResult.reason);
  }

  if (kinepolisResult.status === "fulfilled") {
    todos.push(kinepolisResult.value);
  } else {
    fallo("Kinépolis", kinepolisResult.reason);
  }

  // Si un cine falla puntualmente, mantenemos lo último que teníamos de él
  const cines = todos.map((cartel) => {
    if (!cartel.error) return cartel;
    incompleta = true;
    return anterior?.cines.find((c) => c.cine.id === cartel.cine.id) ?? cartel;
  });
  for (const previo of anterior?.cines ?? []) {
    if (!cines.some((c) => c.cine.id === previo.cine.id)) cines.push(previo);
  }

  // Enriquecimiento con OMDb (puntuaciones y pósters que falten)
  const titulosUnicos = Array.from(
    new Set(cines.flatMap((c) => c.peliculas.map((p) => p.pelicula.titulo))),
  );
  const datosOmdb = await enriquecerPeliculas(titulosUnicos);

  const cinesEnriquecidos: CartelCine[] = cines.map((cartel) => ({
    ...cartel,
    peliculas: cartel.peliculas.map((entry) => {
      const omdb = datosOmdb.get(entry.pelicula.titulo);
      const { pelicula } = entry;
      return {
        ...entry,
        pelicula: {
          ...pelicula,
          poster: pelicula.poster || omdb?.poster || null,
          sinopsis: omdb?.sinopsis || pelicula.sinopsis || null,
          imdb: omdb?.imdb || pelicula.imdb || null,
          rottenTomatoes: omdb?.rottenTomatoes || pelicula.rottenTomatoes || null,
          metacritic: omdb?.metacritic || pelicula.metacritic || null,
        },
      };
    }),
  }));

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `🎬 Cartelera ${fecha}: ${cinesEnriquecidos.length} cines, ${titulosUnicos.length} películas (${segundos} s)${incompleta ? " — incompleta" : ""}`,
  );

  return {
    data: {
      fecha,
      cines: cinesEnriquecidos,
      actualizado_en: new Date().toISOString(),
    },
    incompleta,
  };
}
