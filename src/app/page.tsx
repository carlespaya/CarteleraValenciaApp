// src/app/page.tsx
// Se genera al compilar (la web es estática). En la web incluye ya la
// cartelera de hoy para que se vea al instante, sin esperar a otra descarga.
// En la app Android no: esos datos se quedarían viejos dentro del APK.

import fs from "node:fs";
import path from "node:path";
import Cartelera from "./Cartelera";
import { fechaISO } from "@/lib/fechas";
import type { CarteleraDia } from "@/types";

function carteleraDeHoy(): CarteleraDia | null {
  if (process.env.NEXT_PUBLIC_DATOS_URL) return null;
  try {
    const archivo = path.join(process.cwd(), "public", "datos", `${fechaISO()}.json`);
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch {
    return null;
  }
}

export default function HomePage() {
  const cartelera = carteleraDeHoy();
  const hayDatos = cartelera?.cines.some((c) => c.peliculas.length > 0);

  return (
    <Cartelera
      datosIniciales={
        hayDatos ? { fecha: cartelera!.fecha, cines: cartelera!.cines } : null
      }
    />
  );
}
