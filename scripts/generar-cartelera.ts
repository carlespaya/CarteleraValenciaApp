// scripts/generar-cartelera.ts
// Genera la cartelera de los próximos 7 días como archivos estáticos:
//   public/datos/AAAA-MM-DD.json → { fecha, cines, actualizado_en }
//   public/datos/indice.json     → { fechas, actualizado_en }
// La web y la app Android leen esos archivos. GitHub Actions lo ejecuta cada
// 2 horas (.github/workflows/publicar.yml). En local: npm run cartelera
//
// Si ya existen los JSON de la ejecución anterior, se usan para conservar los
// cines que fallen esta vez. La caché de OMDb se guarda en .cache/omdb.json.

import fs from "node:fs";
import path from "node:path";
import { construirCartelera } from "@/lib/cartelera";
import { DIAS_CARTELERA, proximosDias } from "@/lib/fechas";
import {
  exportarCacheOmdb,
  importarCacheOmdb,
  type EntradaCacheOmdb,
} from "@/lib/omdb";
import { cerrarNavegador } from "@/lib/scrapers/browser";
import type { CarteleraDia } from "@/types";

const DIR_DATOS = path.join(process.cwd(), "public", "datos");
const CACHE_OMDB = path.join(process.cwd(), ".cache", "omdb.json");

// Variables de .env.local (en GitHub Actions llegan como secretos)
function cargarEnvLocal() {
  const archivo = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function leerJson<T>(archivo: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8")) as T;
  } catch {
    return null;
  }
}

function escribirJson(archivo: string, datos: unknown) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos));
}

async function main() {
  cargarEnvLocal();
  const inicio = Date.now();
  const fechas = proximosDias(DIAS_CARTELERA);
  importarCacheOmdb(
    leerJson<Record<string, EntradaCacheOmdb>>(CACHE_OMDB) ?? {},
  );

  let totalPeliculas = 0;
  let diasIncompletos = 0;
  // Un día detrás de otro: las descargas que sirven para todos los días
  // (fichas, FilmAffinity, Yelmo, Ocine…) se hacen solo en el primero
  for (const fecha of fechas) {
    const archivo = path.join(DIR_DATOS, `${fecha}.json`);
    const { data, incompleta } = await construirCartelera(
      fecha,
      leerJson<CarteleraDia>(archivo),
    );
    escribirJson(archivo, data);
    totalPeliculas += data.cines.reduce((n, c) => n + c.peliculas.length, 0);
    if (incompleta) diasIncompletos++;
  }

  // Los días que ya han pasado se borran
  for (const nombre of fs.readdirSync(DIR_DATOS)) {
    const fecha = nombre.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
    if (fecha && !fechas.includes(fecha)) {
      fs.unlinkSync(path.join(DIR_DATOS, nombre));
    }
  }

  escribirJson(path.join(DIR_DATOS, "indice.json"), {
    fechas,
    actualizado_en: new Date().toISOString(),
  });
  escribirJson(CACHE_OMDB, exportarCacheOmdb());

  const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
  if (totalPeliculas === 0) {
    // Mejor no publicar que publicar una cartelera vacía
    throw new Error("No se ha obtenido ninguna película");
  }
  console.log(
    `✅ Cartelera generada en ${segundos} s: ${fechas.length} días` +
      (diasIncompletos ? ` (${diasIncompletos} con algún cine fallido)` : ""),
  );
}

main()
  .then(async () => {
    await cerrarNavegador();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("❌", error instanceof Error ? error.message : error);
    await cerrarNavegador();
    process.exit(1);
  });
