// src/lib/miCine.ts
// "Mi cine": el perfil del usuario, sus entradas y sus experiencias en cada
// cine. Todo se guarda solo en el móvil (localStorage de la app); se puede
// exportar como texto para hacer una copia de seguridad o cambiar de móvil.

import { useSyncExternalStore } from "react";

// Valoración personal de 1 a 5. Solo la ve el propio usuario.
export interface Valoracion {
  pantalla?: number;
  sonido?: number;
  comodidad?: number;
}

export interface EntradaCine {
  id: string;
  pelicula: string;
  poster?: string | null;
  cineId: string;
  cineNombre: string;
  fecha: string; // AAAA-MM-DD
  hora?: string; // HH:MM
  sala?: string;
  butaca?: string;
  formato?: string;
  duracion?: number; // minutos (para "Tu año en el cine")
  genero?: string;
  valoracion?: Valoracion;
  nota?: string;
  tieneFoto?: boolean; // foto de la entrada guardada en src/lib/fotos.ts
  creadaEn: string;
}

// Película de la lista "Quiero verla" (la app avisa cuando entra en cartelera)
export interface Deseo {
  clave: string; // título normalizado (src/lib/titulos.ts)
  titulo: string;
  poster?: string | null;
  anadidaEn: string;
}

export interface DatosMiCine {
  version: 1;
  nombre: string;
  entradas: EntradaCine[];
  deseos: Deseo[];
}

const CLAVE = "cinevalencia-mi-cine";
const VACIO: DatosMiCine = { version: 1, nombre: "", entradas: [], deseos: [] };

let cache: DatosMiCine | null = null;
const oyentes = new Set<() => void>();

// Más recientes primero
function ordenar(entradas: EntradaCine[]): EntradaCine[] {
  return [...entradas].sort((a, b) =>
    `${b.fecha} ${b.hora ?? ""}`.localeCompare(`${a.fecha} ${a.hora ?? ""}`),
  );
}

function validar(datos: unknown): DatosMiCine {
  const d = datos as Partial<DatosMiCine> | null;
  if (!d || !Array.isArray(d.entradas)) throw new Error("Formato no válido");
  const entradas = d.entradas.filter(
    (e): e is EntradaCine =>
      !!e && typeof e.id === "string" && typeof e.pelicula === "string" &&
      typeof e.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha),
  );
  const deseos = (Array.isArray(d.deseos) ? d.deseos : []).filter(
    (x): x is Deseo => !!x && typeof x.clave === "string" && typeof x.titulo === "string",
  );
  return {
    version: 1,
    nombre: typeof d.nombre === "string" ? d.nombre : "",
    entradas: ordenar(entradas),
    deseos,
  };
}

function leer(): DatosMiCine {
  if (cache) return cache;
  try {
    const texto = localStorage.getItem(CLAVE);
    cache = texto ? validar(JSON.parse(texto)) : VACIO;
  } catch {
    cache = VACIO;
  }
  return cache;
}

function escribir(datos: DatosMiCine) {
  cache = datos;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Almacenamiento lleno o bloqueado: se mantiene en memoria
  }
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

export function nuevoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function guardarEntrada(entrada: EntradaCine) {
  const datos = leer();
  const resto = datos.entradas.filter((e) => e.id !== entrada.id);
  escribir({ ...datos, entradas: ordenar([...resto, entrada]) });
}

export function borrarEntrada(id: string) {
  const datos = leer();
  escribir({ ...datos, entradas: datos.entradas.filter((e) => e.id !== id) });
}

export function cambiarNombre(nombre: string) {
  escribir({ ...leer(), nombre });
}

/** Añade o quita una película de "Quiero verla" */
export function alternarDeseo(deseo: Omit<Deseo, "anadidaEn">) {
  const datos = leer();
  const existe = datos.deseos.some((x) => x.clave === deseo.clave);
  escribir({
    ...datos,
    deseos: existe
      ? datos.deseos.filter((x) => x.clave !== deseo.clave)
      : [{ ...deseo, anadidaEn: new Date().toISOString() }, ...datos.deseos],
  });
}

/** Copia de seguridad en texto (JSON) */
export function exportarMiCine(): string {
  return JSON.stringify(leer());
}

/** Añade las entradas de una copia de seguridad. Devuelve cuántas eran nuevas. */
export function importarMiCine(texto: string): number {
  const importado = validar(JSON.parse(texto));
  const datos = leer();
  const ids = new Set(datos.entradas.map((e) => e.id));
  const nuevas = importado.entradas.filter((e) => !ids.has(e.id));
  const claves = new Set(datos.deseos.map((x) => x.clave));
  escribir({
    version: 1,
    nombre: datos.nombre || importado.nombre,
    entradas: ordenar([...datos.entradas, ...nuevas]),
    deseos: [...datos.deseos, ...importado.deseos.filter((x) => !claves.has(x.clave))],
  });
  return nuevas.length;
}

export function useMiCine(): DatosMiCine {
  return useSyncExternalStore(suscribir, leer, () => VACIO);
}
