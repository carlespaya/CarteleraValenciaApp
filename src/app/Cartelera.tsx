"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin,
  Clock,
  Film,
  Search,
  RefreshCw,
  Ticket,
  X,
  Star,
  ChevronDown,
  ArrowLeft,
  Navigation,
  LocateFixed,
  Sun,
  Moon,
  Calendar,
} from "lucide-react";
import type { CartelCine, Sesion } from "@/types";
import { obtenerPrecioSesion } from "@/lib/obtenerPrecioSesion";
import {
  DIAS_CARTELERA,
  fechaISO,
  horaActual,
  momentoSesion,
  proximosDias,
} from "@/lib/fechas";

// Dónde están los JSON de la cartelera (uno por día): en la web, junto a la
// propia página; en la app Android, en la web publicada.
const URL_DATOS =
  process.env.NEXT_PUBLIC_DATOS_URL ||
  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/datos`;

type Tema = "oscuro" | "claro";

// ─── Coordenadas de cada cine (fijas, no dependen del scraper) ────────────────
// Usadas solo para calcular la distancia al usuario y ordenar/mostrar "cerca de ti".
const COORDENADAS_CINE: Record<string, { lat: number; lng: number }> = {
  "cineslys-valencia": { lat: 39.4686948, lng: -0.3751891 },
  "abcpark-valencia": { lat: 39.4692855, lng: -0.3728573 },
  "cinesbabel-valencia": { lat: 39.4697628, lng: -0.3572612 },
  "alucine-valencia": { lat: 39.6570395, lng: -0.2207468 },
  "cinestudio-dor-valencia": { lat: 39.4640889, lng: -0.3670555 },
  "cines-axion-xativa": { lat: 39.003865, lng: -0.526597 },
  "cines-axion-premium-gandia": { lat: 38.9727076, lng: -0.1701798 },
  "cines-mn4-alfafar": { lat: 39.4161682, lng: -0.3803651 },
  "abc-gran-turia": { lat: 39.4649198, lng: -0.415964 },
  "abc-saler": { lat: 39.4533532, lng: -0.3547327 },
  "abc-gandia": { lat: 38.9686579, lng: -0.1685971 },
  "yelmo-campanar": { lat: 39.4775213, lng: -0.3955859 },
  "yelmo-vidanova": { lat: 39.6713665, lng: -0.2666327 },
  "ocine-aqua": { lat: 39.4564727, lng: -0.3462646 },
  "cinesa-bonaire": { lat: 39.4711452, lng: -0.4893709 },
  "kinepolis-valencia": { lat: 39.513224, lng: -0.424361 },
};

interface Coords {
  lat: number;
  lng: number;
}

// Distancia entre dos puntos geográficos en km (fórmula de Haversine)
function distanciaKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function formatearDistancia(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

interface PeliculaEnriquecida {
  id: string;
  titulo: string;
  genero?: string;
  duracion?: number;
  clasificacion?: string;
  poster?: string | null;
  sinopsis?: string | null;
  director?: string | null;
  actores?: string | null;
  imdb?: string | null;
  rottenTomatoes?: string | null;
  metacritic?: string | null;
}

interface CartelEnriquecido {
  cine: CartelCine["cine"];
  peliculas: { pelicula: PeliculaEnriquecida; sesiones: Sesion[] }[];
  actualizado_en: string;
}

// ─── Utilidades para unificar la misma película cuando aparece con títulos
// distintos según el cine/fuente de datos (mayúsculas, coletillas de
// formato, entidades HTML sin decodificar, prefijos de saga, traducciones) ──

// Diccionario de alias/traducciones conocidas entre fuentes (ES/EN, etc.).
// Si detectas otra película duplicada por usar una palabra distinta en cada
// cine, añade aquí una entrada nueva: "palabra_en_una_fuente": "palabra_en_otra".
const ALIAS_TRADUCCION: Record<string, string> = {
  monstruos: "monsters",
};

// Longitud mínima (ya normalizada) que debe tener el título más corto para
// fusionarlo dentro de otro que lo contenga por completo. Evita falsos
// positivos entre películas distintas con nombres cortos (ej. "Alien" no se
// fusiona con "Alien: Romulus" porque "alien" es demasiado corto).
const UMBRAL_CONTENCION = 12;

function decodificarEntidadesHtml(texto: string): string {
  if (!texto) return texto;
  const entidades: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };
  return texto.replace(
    /&amp;|&quot;|&#39;|&apos;|&lt;|&gt;|&nbsp;/g,
    (m) => entidades[m] ?? m,
  );
}

function normalizarTitulo(tituloOriginal: string): string {
  let t = decodificarEntidadesHtml(tituloOriginal)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Quitar acentos

  // Quitar contenido entre paréntesis o corchetes: (2026), [3D], etc.
  t = t.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "");

  // Quitar coletillas de formato/versión que no forman parte del título real
  const palabrasSucias = [
    "3d",
    "4dx",
    "imax",
    "atmos",
    "vose",
    "vosi",
    "vo",
    "ve",
    "hd",
    "live action",
    "live-action",
    "digital",
    "screenx",
    "laser",
  ];
  palabrasSucias.forEach((palabra) => {
    const regex = new RegExp(`\\b${palabra}\\b`, "gi");
    t = t.replace(regex, "");
  });

  t = t.replace(/&/g, "y").replace(/[^a-z0-9]/g, "");

  // Aplicar alias de traducción conocidos para unificar variantes ES/EN
  for (const [origen, destino] of Object.entries(ALIAS_TRADUCCION)) {
    t = t.split(origen).join(destino);
  }

  return t.trim();
}

function tieneColetilla(titulo: string): boolean {
  const t = titulo.toLowerCase();
  return t.includes("live action") || t.includes("3d");
}

function esTodoMayusculas(titulo: string): boolean {
  const letras = titulo.replace(/[^a-zA-Z]/g, "");
  return letras.length > 0 && letras === letras.toUpperCase();
}

// Entre dos variantes del mismo título, elige la más "limpia" para mostrar:
// preferimos sin coletilla de formato, luego sin estar todo en mayúsculas,
// y en caso de empate la más corta.
function elegirMejorTitulo(actual: string, candidato: string): string {
  const actualLimpio = decodificarEntidadesHtml(actual);
  const candidatoLimpio = decodificarEntidadesHtml(candidato);

  const actualColetilla = tieneColetilla(actualLimpio);
  const candidatoColetilla = tieneColetilla(candidatoLimpio);
  if (actualColetilla && !candidatoColetilla) return candidatoLimpio;
  if (candidatoColetilla && !actualColetilla) return actualLimpio;

  const actualMayus = esTodoMayusculas(actualLimpio);
  const candidatoMayus = esTodoMayusculas(candidatoLimpio);
  if (actualMayus && !candidatoMayus) return candidatoLimpio;
  if (candidatoMayus && !actualMayus) return actualLimpio;

  return candidatoLimpio.length < actualLimpio.length
    ? candidatoLimpio
    : actualLimpio;
}

// Combina los metadatos de dos variantes de la misma película sin perder datos
function elegirMejorPelicula(
  a: PeliculaEnriquecida,
  b: PeliculaEnriquecida,
): PeliculaEnriquecida {
  const resultado: PeliculaEnriquecida = { ...a };
  if (!resultado.poster && b.poster) resultado.poster = b.poster;
  if (!resultado.imdb && b.imdb) resultado.imdb = b.imdb;
  if (!resultado.rottenTomatoes && b.rottenTomatoes)
    resultado.rottenTomatoes = b.rottenTomatoes;
  if (!resultado.duracion && b.duracion) resultado.duracion = b.duracion;
  if (!resultado.genero && b.genero) resultado.genero = b.genero;
  if (!resultado.clasificacion && b.clasificacion)
    resultado.clasificacion = b.clasificacion;
  if (!resultado.sinopsis && b.sinopsis) resultado.sinopsis = b.sinopsis;
  if (!resultado.director && b.director) resultado.director = b.director;
  if (!resultado.actores && b.actores) resultado.actores = b.actores;
  if (!resultado.metacritic && b.metacritic)
    resultado.metacritic = b.metacritic;

  resultado.titulo = elegirMejorTitulo(resultado.titulo, b.titulo);
  return resultado;
}

// Fusiona dos listas de "cine + sesiones" combinando sesiones por cine y
// descartando solo duplicados exactos (mismo id de sesión), sin perder nada.
function fusionarListasDeCines(
  a: { cine: CartelEnriquecido["cine"]; sesiones: Sesion[] }[],
  b: { cine: CartelEnriquecido["cine"]; sesiones: Sesion[] }[],
): { cine: CartelEnriquecido["cine"]; sesiones: Sesion[] }[] {
  const resultado = a.map((item) => ({
    cine: item.cine,
    sesiones: [...item.sesiones],
  }));

  for (const item of b) {
    const existente = resultado.find((r) => r.cine.id === item.cine.id);
    if (existente) {
      const idsExistentes = new Set(existente.sesiones.map((s) => s.id));
      for (const sesion of item.sesiones) {
        if (!idsExistentes.has(sesion.id)) {
          existente.sesiones.push(sesion);
          idsExistentes.add(sesion.id);
        }
      }
    } else {
      resultado.push({ cine: item.cine, sesiones: [...item.sesiones] });
    }
  }

  return resultado;
}

const DATOS_EJEMPLO: CartelEnriquecido[] = [
  {
    cine: {
      id: "cineslys-valencia",
      nombre: "Cines Lys",
      slug: "cineslys",
      ciudad: "Valencia",
      direccion: "C/ Dr. Serrano, 6, Valencia",
      url: "",
      fuente: "reservaentradas",
      activo: true,
    },
    peliculas: [
      {
        pelicula: {
          id: "ej1",
          titulo: "Backrooms",
          genero: "Terror",
          duracion: 110,
          clasificacion: "+16",
          imdb: "6.2",
          rottenTomatoes: "71%",
        },
        sesiones: [
          {
            id: "s1",
            cine_id: "cineslys-valencia",
            pelicula_id: "ej1",
            fecha: new Date().toISOString().split("T")[0],
            hora: "17:00",
            formato: "VOSE",
            url_compra: "#",
            disponible: true,
            actualizado_en: "",
          },
          {
            id: "s2",
            cine_id: "cineslys-valencia",
            pelicula_id: "ej1",
            fecha: new Date().toISOString().split("T")[0],
            hora: "22:35",
            formato: "VOSE",
            url_compra: "#",
            disponible: true,
            actualizado_en: "",
          },
        ],
      },
    ],
    actualizado_en: new Date().toISOString(),
  },
  {
    cine: {
      id: "abcpark-valencia",
      nombre: "Cines ABC Park",
      slug: "abcpark",
      ciudad: "Valencia",
      direccion: "C/ Joan Verdeguer, 5, Valencia",
      url: "",
      fuente: "reservaentradas",
      activo: true,
    },
    peliculas: [
      {
        pelicula: {
          id: "ej2",
          titulo: "Misión Imposible 8",
          genero: "Acción",
          duracion: 169,
          clasificacion: "+12",
          imdb: "7.8",
          rottenTomatoes: "88%",
        },
        sesiones: [
          {
            id: "s3",
            cine_id: "abcpark-valencia",
            pelicula_id: "ej2",
            fecha: new Date().toISOString().split("T")[0],
            hora: "16:00",
            formato: "VE",
            url_compra: "#",
            disponible: true,
            actualizado_en: "",
          },
        ],
      },
    ],
    actualizado_en: new Date().toISOString(),
  },
];

// ─── Utilidades de fechas ─────────────────────────────────────────────────────

const DIAS_SEMANA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_CORTO = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Convierte "2026-08-26" → { diaSemana: "Mar", dia: 26, mes: "Ago", esHoy: true } */
function parsearFechaISO(iso: string) {
  // Parsear sin zona horaria para evitar desfase de día
  const [anyo, mes, dia] = iso.split("-").map(Number);
  const d = new Date(anyo, mes - 1, dia);
  const esHoy = iso === fechaISO();
  return {
    diaSemana: DIAS_SEMANA_CORTO[d.getDay()],
    dia,
    mes: MESES_CORTO[d.getMonth()],
    esHoy,
  };
}

// ─── Hook de geolocalización ───────────────────────────────────────────────────

type EstadoUbicacion =
  | "inactivo"
  | "cargando"
  | "concedido"
  | "denegado"
  | "no_soportado";

function useUbicacionUsuario() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [estado, setEstado] = useState<EstadoUbicacion>("inactivo");

  function pedirUbicacion() {
    if (!("geolocation" in navigator)) {
      setEstado("no_soportado");
      return;
    }
    setEstado("cargando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setEstado("concedido");
      },
      () => {
        setEstado("denegado");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  return { coords, estado, pedirUbicacion };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function FormatoBadge({ formato, tema }: { formato?: string; tema: Tema }) {
  const coloresOscuro: Record<string, string> = {
    VOSE: "bg-amber-500/20 text-amber-300 border border-amber-400/30",
    VE: "bg-slate-500/20 text-slate-200 border border-slate-400/20",
    "3D": "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30",
    IMAX: "bg-purple-500/20 text-purple-300 border border-purple-400/30",
    "4DX": "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
  };

  const coloresClaro: Record<string, string> = {
    VOSE: "bg-amber-100 text-amber-700 border border-amber-300",
    VE: "bg-slate-100 text-slate-600 border border-slate-300",
    "3D": "bg-cyan-100 text-cyan-700 border border-cyan-300",
    IMAX: "bg-purple-100 text-purple-700 border border-purple-300",
    "4DX": "bg-emerald-100 text-emerald-700 border border-emerald-300",
  };

  const colores = tema === "oscuro" ? coloresOscuro : coloresClaro;
  const fmt = formato ?? "VO";

  let clase =
    tema === "oscuro"
      ? "bg-zinc-800/80 text-zinc-400 border border-zinc-700"
      : "bg-zinc-100 text-zinc-500 border border-zinc-300";

  for (const [k, v] of Object.entries(colores)) {
    if (fmt.includes(k)) {
      clase = v;
      break;
    }
  }

  return (
    <span
      className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide backdrop-blur ${clase}`}
    >
      {fmt}
    </span>
  );
}

function Puntuaciones({
  imdb,
  rottenTomatoes,
  tema,
}: {
  imdb?: string | null;
  rottenTomatoes?: string | null;
  tema: Tema;
}) {
  if (!imdb && !rottenTomatoes) return null;

  const rt = rottenTomatoes && parseInt(rottenTomatoes);

  return (
    <div className="flex items-center gap-3">
      {imdb && (
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
            tema === "oscuro"
              ? "bg-zinc-800/70 border-white/5"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <Star size={12} className="fill-yellow-400 text-yellow-400" />

          <span
            className={`text-xs font-semibold ${
              tema === "oscuro" ? "text-yellow-300" : "text-yellow-700"
            }`}
          >
            {imdb}
          </span>
        </div>
      )}

      {rottenTomatoes && (
        <div
          className={`px-2 py-1 rounded-full text-xs font-bold border ${
            Number(rt) >= 75
              ? tema === "oscuro"
                ? "bg-green-500/15 text-green-400 border-green-500/20"
                : "bg-green-50 text-green-700 border-green-300"
              : Number(rt) >= 50
                ? tema === "oscuro"
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
                  : "bg-amber-50 text-amber-700 border-amber-300"
                : tema === "oscuro"
                  ? "bg-red-500/15 text-red-400 border-red-500/20"
                  : "bg-red-50 text-red-700 border-red-300"
          }`}
        >
          🍅 {rottenTomatoes}
        </div>
      )}
    </div>
  );
}

function SesionBtn({
  sesion,
  tema,
  cineNombre,
}: {
  sesion: Sesion;
  tema: Tema;
  cineNombre: string;
}) {
  const [mostrarTooltip, setMostrarTooltip] = useState(false);

  // 1. Detectar tipo de sala según el formato de la sesión
  let tipoSala: "normal" | "imax" | "4dx" = "normal";
  if (sesion.formato?.toLowerCase().includes("imax")) tipoSala = "imax";
  if (sesion.formato?.toLowerCase().includes("4dx")) tipoSala = "4dx";

  // 2. Normalizar el nombre del cine para que coincida con las llaves de tarifas.ts
  let claveTarifa = cineNombre;
  const nombreLower = cineNombre.toLowerCase();

  if (nombreLower.includes("lys")) {
    claveTarifa = "Cines Lys";
  } else if (nombreLower.includes("kinepolis")) {
    claveTarifa = "Kinepolis";
  } else if (nombreLower.includes("ocine")) {
    claveTarifa = "Ocine";
  } else if (nombreLower.includes("abc")) {
    // Desglosamos cada cine ABC según lo que contenga su nombre real
    if (nombreLower.includes("park")) claveTarifa = "ABC Park";
    else if (nombreLower.includes("saler")) claveTarifa = "ABC Saler";
    else if (
      nombreLower.includes("gran turia") ||
      nombreLower.includes("turia")
    )
      claveTarifa = "ABC Gran Turia";
    else if (nombreLower.includes("gandia")) claveTarifa = "ABC Gandía";
  }
  // 3. Obtener el objeto de precios dinámico
  const tarifasInfo = obtenerPrecioSesion({
    cine: claveTarifa,
    fecha: new Date(sesion.fecha),
    tipoSala,
  });

  const LABELS_TARIFAS: Record<string, string> = {
    general: "General",
    reducida: "Reducida",
    mayores65: "Mayores 65",
    socios: "Socios",
    menores14: "Menores 14",
    carnetJoven: "Carné Joven",
    estudiante: "Estudiante",
    familia: "Familia",
    suplemento3D: "Suplemento 3D",
    suplementoVIP: "Suplemento VIP",
  };

  const ahora = new Date();
  const [hora, minuto] = sesion.hora.split(":").map(Number);

  const esProxima =
    ahora.getHours() === hora &&
    minuto - ahora.getMinutes() > 0 &&
    minuto - ahora.getMinutes() <= 30;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setMostrarTooltip(true)}
      onMouseLeave={() => setMostrarTooltip(false)}
    >
      <a
        href={sesion.url_compra}
        target="_blank"
        rel="noopener noreferrer"
        className={`group relative block min-w-[72px] rounded-xl border backdrop-blur px-3 py-2 transition-all duration-200
        ${
          sesion.disponible
            ? tema === "oscuro"
              ? "border-white/10 bg-white/[0.03] hover:bg-amber-500/15 hover:border-amber-400/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-500/10"
              : "border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-400/60 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-500/10"
            : tema === "oscuro"
              ? "opacity-40 pointer-events-none border-zinc-700 bg-zinc-900"
              : "opacity-40 pointer-events-none border-zinc-300 bg-zinc-100"
        }`}
      >
        {/* Indicador de sesión inminente */}
        {esProxima && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        )}

        <div className="text-center">
          <div
            className={`font-black text-base tracking-wide transition-colors ${
              tema === "oscuro"
                ? "text-white group-hover:text-amber-300"
                : "text-zinc-900 group-hover:text-amber-600"
            }`}
          >
            {sesion.hora}
          </div>

          <div className="mt-1 flex justify-center">
            <FormatoBadge formato={sesion.formato} tema={tema} />
          </div>
        </div>
      </a>

      {/* Tooltip individual aislado */}
      {mostrarTooltip && tarifasInfo && (
        <div
          className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-44 p-3 rounded-xl shadow-2xl border text-xs animate-in fade-in zoom-in-95 duration-150
          ${
            tema === "oscuro"
              ? "bg-zinc-950 border-zinc-800 text-zinc-200 shadow-black"
              : "bg-white border-zinc-200 text-zinc-800 shadow-zinc-300"
          }`}
        >
          <div className="font-black text-amber-500 mb-1.5 border-b pb-1 border-zinc-800/50">
            Tarifas Previstas
          </div>
          <div className="space-y-1">
            {Object.entries(tarifasInfo).map(([key, val]) => {
              if (typeof val !== "number") return null; // Salta objetos anidados como 'matinal' en Kinepolis
              return (
                <div key={key} className="flex justify-between gap-2">
                  <span className="text-zinc-500">
                    {LABELS_TARIFAS[key] || key}
                  </span>
                  <span className="font-bold">{val.toFixed(2)}€</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaPelicula({
  pelicula,
  sesiones,
  tema,
  cineNombre,
}: {
  pelicula: PeliculaEnriquecida;
  sesiones: Sesion[];
  tema: Tema;
  cineNombre: string;
}) {
  return (
    <div
      className={`
      group
      rounded-2xl
      overflow-visible

      border

      transition-all
      duration-300

      hover:-translate-y-1
      hover:shadow-2xl

      ${
        tema === "oscuro"
          ? `
          bg-gradient-to-br
          from-zinc-900/95
          via-zinc-900
          to-black
          border-white/5
          hover:border-amber-500/30
          hover:shadow-black/40
          `
          : `
          bg-gradient-to-br
          from-white
          via-zinc-50
          to-zinc-100
          border-zinc-200
          hover:border-amber-400/50
          hover:shadow-zinc-300/50
          `
      }`}
    >
      <div className="p-5 flex gap-5">
        <div
          className={`
          w-24
          h-36
          rounded-xl
          overflow-hidden
          flex-shrink-0
          shadow-lg
          ${tema === "oscuro" ? "bg-zinc-800" : "bg-zinc-200"}
          `}
        >
          {pelicula.poster ? (
            <img
              src={pelicula.poster}
              alt={pelicula.titulo}
              loading="lazy"
              decoding="async"
              className="
              w-full
              h-full
              object-cover
              transition-transform
              duration-500
              group-hover:scale-105
              "
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film
                size={30}
                className={
                  tema === "oscuro" ? "text-zinc-600" : "text-zinc-400"
                }
              />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3
            className={`
            text-xl
            font-black
            leading-tight
            mb-3
            ${tema === "oscuro" ? "text-white" : "text-zinc-900"}
            `}
          >
            {decodificarEntidadesHtml(pelicula.titulo)}
          </h3>

          <div className="flex flex-wrap gap-2 mb-4">
            {pelicula.genero && (
              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  tema === "oscuro"
                    ? "bg-zinc-800 text-zinc-300"
                    : "bg-zinc-200 text-zinc-600"
                }`}
              >
                {pelicula.genero}
              </span>
            )}

            {pelicula.duracion && (
              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  tema === "oscuro"
                    ? "bg-zinc-800 text-zinc-300"
                    : "bg-zinc-200 text-zinc-600"
                }`}
              >
                {pelicula.duracion} min
              </span>
            )}

            {pelicula.clasificacion && (
              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  tema === "oscuro"
                    ? "bg-zinc-800 text-zinc-300"
                    : "bg-zinc-200 text-zinc-600"
                }`}
              >
                {pelicula.clasificacion}
              </span>
            )}
          </div>

          <Puntuaciones
            imdb={pelicula.imdb}
            rottenTomatoes={pelicula.rottenTomatoes}
            tema={tema}
          />

          <div className="mt-5 flex flex-wrap gap-2">
            {sesiones.map((s) => (
              <SesionBtn
                key={s.id}
                sesion={s}
                tema={tema}
                cineNombre={cineNombre}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dropdown selector de cine ────────────────────────────────────────────────

function SelectorCine({
  carteles,
  cineSeleccionado,
  onChange,
  ubicacionUsuario,
  tema,
}: {
  carteles: CartelEnriquecido[];
  cineSeleccionado: string;
  onChange: (id: string) => void;
  ubicacionUsuario: Coords | null;
  tema: Tema;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cartelesOrdenados = useMemo(() => {
    if (!ubicacionUsuario) return carteles;

    return [...carteles].sort((a, b) => {
      const coordA = COORDENADAS_CINE[a.cine.id];
      const coordB = COORDENADAS_CINE[b.cine.id];

      if (!coordA || !coordB) return 0;

      return (
        distanciaKm(ubicacionUsuario, coordA) -
        distanciaKm(ubicacionUsuario, coordB)
      );
    });
  }, [carteles, ubicacionUsuario]);

  const cineActual =
    cartelesOrdenados.find((c) => c.cine.id === cineSeleccionado) ??
    cartelesOrdenados[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative mb-6">
      <button
        onClick={() => setAbierto(!abierto)}
        className={`
        w-full

        rounded-2xl

        border

        backdrop-blur-xl

        px-5
        py-4

        transition-all
        duration-300

        ${
          tema === "oscuro"
            ? `
            border-white/10
            bg-gradient-to-br
            from-zinc-900/90
            to-black
            hover:border-amber-500/40
            hover:shadow-xl
            hover:shadow-black/40
            `
            : `
            border-zinc-200
            bg-gradient-to-br
            from-white
            to-zinc-50
            hover:border-amber-500/50
            hover:shadow-xl
            hover:shadow-zinc-300/40
            `
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`
              w-12
              h-12

              rounded-xl

              border

              flex
              items-center
              justify-center
              ${
                tema === "oscuro"
                  ? "bg-amber-500/15 border-amber-400/30"
                  : "bg-amber-100 border-amber-300"
              }
              `}
            >
              <Ticket
                size={18}
                className={
                  tema === "oscuro" ? "text-amber-400" : "text-amber-600"
                }
              />
            </div>

            <div className="text-left">
              <div
                className={`font-bold text-lg ${
                  tema === "oscuro" ? "text-white" : "text-zinc-900"
                }`}
              >
                {cineActual?.cine.nombre}
              </div>

              <div className="text-sm text-zinc-500 mt-1">
                {cineActual?.cine.direccion}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {ubicacionUsuario &&
              cineActual &&
              COORDENADAS_CINE[cineActual.cine.id] && (
                <div
                  className={`
                  rounded-full

                  border

                  px-3
                  py-1

                  text-xs
                  font-semibold
                  ${
                    tema === "oscuro"
                      ? "bg-blue-500/15 border-blue-400/20 text-blue-300"
                      : "bg-blue-50 border-blue-200 text-blue-700"
                  }
                  `}
                >
                  {formatearDistancia(
                    distanciaKm(
                      ubicacionUsuario,
                      COORDENADAS_CINE[cineActual.cine.id],
                    ),
                  )}
                </div>
              )}

            <ChevronDown
              size={20}
              className={`transition-transform duration-300 ${
                tema === "oscuro" ? "text-zinc-400" : "text-zinc-500"
              } ${abierto ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      {abierto && (
        <div
          className={`
          absolute

          left-0
          right-0
          top-full

          mt-3

          rounded-2xl

          border

          backdrop-blur-2xl

          shadow-2xl

          overflow-hidden

          z-50
          ${
            tema === "oscuro"
              ? "border-white/10 bg-zinc-900/95"
              : "border-zinc-200 bg-white/95"
          }
          `}
        >
          {cartelesOrdenados.map((cartel) => {
            const activo = cartel.cine.id === cineSeleccionado;

            const coord = COORDENADAS_CINE[cartel.cine.id];

            const distancia =
              ubicacionUsuario && coord
                ? distanciaKm(ubicacionUsuario, coord)
                : null;

            return (
              <button
                key={cartel.cine.id}
                onClick={() => {
                  onChange(cartel.cine.id);
                  setAbierto(false);
                }}
                className={`
                w-full

                px-5
                py-4

                flex
                items-center
                justify-between

                transition-all

                ${
                  activo
                    ? "bg-amber-500/10"
                    : tema === "oscuro"
                      ? "hover:bg-white/5"
                      : "hover:bg-zinc-100"
                }
                `}
              >
                <div>
                  <div
                    className={`
                    font-semibold

                    ${
                      activo
                        ? tema === "oscuro"
                          ? "text-amber-300"
                          : "text-amber-600"
                        : tema === "oscuro"
                          ? "text-white"
                          : "text-zinc-900"
                    }
                    `}
                  >
                    {cartel.cine.nombre}
                  </div>

                  <div className="text-sm text-zinc-500 mt-1">
                    {cartel.cine.direccion}
                  </div>
                </div>

                <div className="text-right">
                  {distancia !== null && (
                    <div
                      className={`text-sm font-semibold ${
                        tema === "oscuro" ? "text-blue-300" : "text-blue-600"
                      }`}
                    >
                      {formatearDistancia(distancia)}
                    </div>
                  )}

                  <div className="text-xs text-zinc-500 mt-1">
                    {cartel.peliculas.length} películas
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Vista por CINE ───────────────────────────────────────────────────────────

function VistaPorCine({
  carteles,
  cineSeleccionado,
  onCambiarCine,
  ubicacionUsuario,
  tema,
}: {
  carteles: CartelEnriquecido[];
  cineSeleccionado: string;
  onCambiarCine: (id: string) => void;
  ubicacionUsuario: Coords | null;
  tema: Tema;
}) {
  const cartel =
    carteles.find((c) => c.cine.id === cineSeleccionado) ?? carteles[0];
  if (!cartel) return null;

  return (
    <div>
      <SelectorCine
        carteles={carteles}
        cineSeleccionado={cartel.cine.id}
        onChange={onCambiarCine}
        ubicacionUsuario={ubicacionUsuario}
        tema={tema}
      />
      <div className="grid gap-3">
        {cartel.peliculas.length > 0 ? (
          cartel.peliculas.map((e) => (
            <TarjetaPelicula
              key={e.pelicula.id}
              pelicula={e.pelicula}
              sesiones={e.sesiones}
              tema={tema}
              cineNombre={cartel.cine.nombre}
            />
          ))
        ) : (
          <div
            className={`text-center py-10 text-sm border rounded-xl ${
              tema === "oscuro"
                ? "text-zinc-600 border-zinc-800"
                : "text-zinc-400 border-zinc-200"
            }`}
          >
            No hay sesiones disponibles hoy
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vista por PELÍCULA ───────────────────

function VistaPorPelicula({
  carteles,
  busqueda,
  ubicacionUsuario,
  tema,
}: {
  carteles: CartelEnriquecido[];
  busqueda: string;
  ubicacionUsuario: Coords | null;
  tema: Tema;
}) {
  // Estado para controlar qué película se está viendo en detalle
  const [peliculaSeleccionada, setPeliculaSeleccionada] = useState<
    string | null
  >(null);

  // Resetear la selección si el usuario realiza una nueva búsqueda global
  useEffect(() => {
    setPeliculaSeleccionada(null);
  }, [busqueda]);

  const peliculasAgrupadas = useMemo(() => {
    const mapa = new Map<
      string,
      {
        pelicula: PeliculaEnriquecida;
        cines: { cine: CartelEnriquecido["cine"]; sesiones: Sesion[] }[];
      }
    >();

    for (const cartel of carteles) {
      for (const entry of cartel.peliculas) {
        // Si el título normaliza a una cadena vacía (caso extremo), usamos un
        // fallback para no perder nunca sesiones por descartar la entrada.
        const clave =
          normalizarTitulo(entry.pelicula.titulo) ||
          entry.pelicula.titulo.trim().toLowerCase() ||
          entry.pelicula.id;

        const peliculaDecodificada: PeliculaEnriquecida = {
          ...entry.pelicula,
          titulo: decodificarEntidadesHtml(entry.pelicula.titulo),
        };

        if (!mapa.has(clave)) {
          mapa.set(clave, { pelicula: peliculaDecodificada, cines: [] });
        }

        const grupo = mapa.get(clave)!;
        grupo.pelicula = elegirMejorPelicula(
          grupo.pelicula,
          peliculaDecodificada,
        );

        const cineExistente = grupo.cines.find(
          (c) => c.cine.id === cartel.cine.id,
        );

        // ✅ Evita duplicar el mismo cine si la API lo devuelve fragmentado,
        // pero sin perder ninguna sesión (deduplicado solo por id exacto)
        if (cineExistente) {
          const idsExistentes = new Set(
            cineExistente.sesiones.map((s) => s.id),
          );
          for (const sesion of entry.sesiones) {
            if (!idsExistentes.has(sesion.id)) {
              cineExistente.sesiones.push(sesion);
              idsExistentes.add(sesion.id);
            }
          }
        } else {
          grupo.cines.push({
            cine: cartel.cine,
            sesiones: [...entry.sesiones],
          });
        }
      }
    }

    // ─── Segunda pasada: fusionar variantes cuando el título normalizado de
    // una está completamente contenido en el de la otra (ej. "STAR WARS: THE
    // MANDALORIAN AND GROGU" vs "THE MANDALORIAN AND GROGU"). Solo aplica si
    // el título más corto supera UMBRAL_CONTENCION, para no mezclar por error
    // películas distintas con nombres cortos.
    const claves = Array.from(mapa.keys());
    for (let i = 0; i < claves.length; i++) {
      const claveA = claves[i];
      if (!mapa.has(claveA)) continue;

      for (let j = i + 1; j < claves.length; j++) {
        const claveB = claves[j];
        if (!mapa.has(claveB)) continue;

        const [corta, larga] =
          claveA.length <= claveB.length ? [claveA, claveB] : [claveB, claveA];

        if (corta.length < UMBRAL_CONTENCION) continue;
        if (!larga.includes(corta)) continue;

        const grupoA = mapa.get(claveA)!;
        const grupoB = mapa.get(claveB)!;

        grupoA.pelicula = elegirMejorPelicula(grupoA.pelicula, grupoB.pelicula);
        grupoA.cines = fusionarListasDeCines(grupoA.cines, grupoB.cines);

        mapa.delete(claveB);
      }
    }

    const busquedaNormalizada = normalizarTitulo(busqueda);

    const agrupadas = Array.from(mapa.values()).filter(
      (p) =>
        !busqueda ||
        normalizarTitulo(p.pelicula.titulo).includes(busquedaNormalizada),
    );

    if (ubicacionUsuario) {
      for (const p of agrupadas) {
        p.cines.sort((a, b) => {
          const coordA = COORDENADAS_CINE[a.cine.id];
          const coordB = COORDENADAS_CINE[b.cine.id];
          if (!coordA || !coordB) return 0;
          return (
            distanciaKm(ubicacionUsuario, coordA) -
            distanciaKm(ubicacionUsuario, coordB)
          );
        });
      }
    }

    return agrupadas.sort((a, b) => {
      const sesionesA = a.cines.reduce((acc, c) => acc + c.sesiones.length, 0);
      const sesionesB = b.cines.reduce((acc, c) => acc + c.sesiones.length, 0);
      return sesionesB - sesionesA;
    });
  }, [carteles, busqueda, ubicacionUsuario]);

  // Si hay una película seleccionada, renderizamos su vista detallada
  const pDetalle = peliculasAgrupadas.find(
    (p) => p.pelicula.titulo === peliculaSeleccionada,
  );

  if (peliculaSeleccionada && pDetalle) {
    const { pelicula, cines } = pDetalle;
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <button
          onClick={() => setPeliculaSeleccionada(null)}
          className={`inline-flex items-center gap-2 text-xs font-semibold transition-colors px-3 py-1.5 rounded-lg border ${
            tema === "oscuro"
              ? "text-amber-400 hover:text-amber-300 bg-zinc-900/60 border-zinc-800"
              : "text-amber-600 hover:text-amber-700 bg-zinc-100 border-zinc-200"
          }`}
        >
          <ArrowLeft size={14} /> Volver a la cartelera
        </button>

        <div
          className={`rounded-xl overflow-visible border ${
            tema === "oscuro"
              ? "bg-zinc-900 border-zinc-800"
              : "bg-white border-zinc-200"
          }`}
        >
          {/* Cabecera del detalle */}
          <div
            className={`p-4 sm:p-5 flex flex-col sm:flex-row gap-4 border-b ${
              tema === "oscuro"
                ? "border-zinc-800 bg-zinc-900/40"
                : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div
              className={`w-24 h-36 mx-auto sm:mx-0 flex-shrink-0 rounded-xl flex items-center justify-center border overflow-hidden shadow-md ${
                tema === "oscuro"
                  ? "bg-zinc-800 border-zinc-700"
                  : "bg-zinc-200 border-zinc-300"
              }`}
            >
              {pelicula.poster ? (
                <img
                  src={pelicula.poster}
                  alt={pelicula.titulo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Film
                  size={24}
                  className={
                    tema === "oscuro" ? "text-zinc-600" : "text-zinc-400"
                  }
                />
              )}
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col justify-center">
              <h2
                className={`font-black text-xl leading-tight mb-2 ${
                  tema === "oscuro" ? "text-white" : "text-zinc-900"
                }`}
              >
                {pelicula.titulo}
              </h2>
              <div
                className={`flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1 text-xs ${
                  tema === "oscuro" ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {pelicula.genero && (
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      tema === "oscuro" ? "bg-zinc-800" : "bg-zinc-200"
                    }`}
                  >
                    {pelicula.genero}
                  </span>
                )}
                {pelicula.duracion && (
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
                      tema === "oscuro" ? "bg-zinc-800" : "bg-zinc-200"
                    }`}
                  >
                    <Clock size={11} /> {pelicula.duracion} min
                  </span>
                )}
                {pelicula.clasificacion && (
                  <span
                    className={`border px-1.5 py-0.5 rounded ${
                      tema === "oscuro"
                        ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                        : "bg-zinc-200 border-zinc-300 text-zinc-600"
                    }`}
                  >
                    {pelicula.clasificacion}
                  </span>
                )}
              </div>
              {(pelicula.imdb || pelicula.rottenTomatoes) && (
                <div className="mt-3 flex justify-center sm:justify-start">
                  <Puntuaciones
                    imdb={pelicula.imdb}
                    rottenTomatoes={pelicula.rottenTomatoes}
                    tema={tema}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Desglose por cines y horarios */}
          <div
            className={`divide-y ${
              tema === "oscuro" ? "divide-zinc-800/60" : "divide-zinc-200"
            }`}
          >
            {cines.map(({ cine, sesiones }) => {
              const coordCine = COORDENADAS_CINE[cine.id];
              const distancia =
                ubicacionUsuario && coordCine
                  ? distanciaKm(ubicacionUsuario, coordCine)
                  : null;
              return (
                <div
                  key={cine.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-start gap-3"
                >
                  <div className="flex-shrink-0 sm:w-40">
                    <p
                      className={`text-xs font-bold leading-tight ${
                        tema === "oscuro" ? "text-zinc-200" : "text-zinc-700"
                      }`}
                    >
                      {cine.nombre}
                    </p>
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={9} />{" "}
                      <span className="truncate">{cine.ciudad}</span>
                    </p>
                    {distancia !== null && (
                      <p
                        className={`text-[10px] font-semibold flex items-center gap-1 mt-1 ${
                          tema === "oscuro" ? "text-blue-400" : "text-blue-600"
                        }`}
                      >
                        <Navigation size={8} />
                        {formatearDistancia(distancia)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sesiones.map((s) => (
                      <SesionBtn
                        key={s.id}
                        sesion={s}
                        tema={tema}
                        cineNombre={cine.nombre}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (peliculasAgrupadas.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <Film size={32} className="mx-auto mb-3 opacity-30" />
        <p>
          No se encontraron películas{busqueda ? ` para "${busqueda}"` : ""}
        </p>
      </div>
    );
  }

  // Vista principal: Cuadrícula de pósters ordenados por mayor volumen de sesiones
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-in fade-in duration-300">
      {peliculasAgrupadas.map(({ pelicula, cines }) => {
        const totalSesiones = cines.reduce(
          (acc, c) => acc + c.sesiones.length,
          0,
        );

        return (
          <button
            key={pelicula.titulo}
            onClick={() => setPeliculaSeleccionada(pelicula.titulo)}
            className="group text-left"
          >
            <div
              className={`h-full overflow-hidden rounded-2xl backdrop-blur-md border transition-all duration-200 hover:shadow-2xl hover:-translate-y-2 ${
                tema === "oscuro"
                  ? "bg-zinc-900/40 border-white/10 hover:bg-zinc-800/60 hover:border-amber-400/30 hover:shadow-black/50"
                  : "bg-white border-zinc-200 hover:bg-zinc-50 hover:border-amber-400/40 hover:shadow-zinc-300/50"
              }`}
            >
              {/* Poster */}
              <div className="relative aspect-[2/3] overflow-hidden">
                {pelicula.poster ? (
                  <img
                    src={pelicula.poster}
                    alt={pelicula.titulo}
                    loading="lazy"
                    decoding="async"
                    className="
                      h-full
                      w-full
                      object-cover
                      transition-all
                      duration-700
                      group-hover:scale-110
                    "
                  />
                ) : (
                  <div
                    className={`flex h-full items-center justify-center ${
                      tema === "oscuro" ? "bg-zinc-800" : "bg-zinc-200"
                    }`}
                  >
                    <Film
                      size={36}
                      className={
                        tema === "oscuro" ? "text-zinc-600" : "text-zinc-400"
                      }
                    />
                  </div>
                )}

                {/* Oscurecer parte inferior */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

                {/* IMDB */}
                {pelicula.imdb && (
                  <div
                    className="
                      absolute
                      top-3
                      left-3
                      flex
                      items-center
                      gap-1
                      rounded-full
                      bg-yellow-400
                      px-2.5
                      py-1
                      text-[11px]
                      font-black
                      text-black
                      shadow-lg
                    "
                  >
                    <Star size={10} fill="black" />
                    {pelicula.imdb}
                  </div>
                )}

                {/* Rotten Tomatoes */}
                {pelicula.rottenTomatoes && (
                  <div
                    className="
                      absolute
                      top-3
                      right-3
                      rounded-full
                      bg-green-500/90
                      px-2
                      py-1
                      text-[10px]
                      font-bold
                      text-white
                      shadow-lg
                    "
                  >
                    🍅 {pelicula.rottenTomatoes}
                  </div>
                )}

                {/* Sesiones */}
                <div
                  className="
                    absolute
                    bottom-3
                    right-3
                    rounded-full
                    bg-black/80
                    backdrop-blur
                    border
                    border-white/10
                    px-3
                    py-1
                    text-xs
                    font-bold
                    text-white
                  "
                >
                  {totalSesiones} sesiones
                </div>
              </div>

              {/* Información */}
              <div className="flex flex-col gap-2 p-4">
                <h3
                  className={`line-clamp-2 text-base font-black leading-tight transition-colors ${
                    tema === "oscuro"
                      ? "text-white group-hover:text-amber-300"
                      : "text-zinc-900 group-hover:text-amber-600"
                  }`}
                >
                  {pelicula.titulo}
                </h3>

                {/* Género en su propia línea para que respire */}
                <span
                  className={`truncate text-sm ${
                    tema === "oscuro" ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  {pelicula.genero ?? "Sin género"}
                </span>

                {/* Footer de la tarjeta: Duración y Cines alineados */}
                <div className="mt-1 flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    {pelicula.duracion && (
                      <>
                        <Clock size={13} />
                        <span>{pelicula.duracion} min</span>
                      </>
                    )}
                  </div>

                  <span
                    className={`flex items-center gap-1 px-2 py-1 rounded-md ${
                      tema === "oscuro"
                        ? "text-amber-400/90 bg-amber-400/10"
                        : "text-amber-600 bg-amber-50"
                    }`}
                  >
                    <MapPin size={11} />
                    {cines.length} cine{cines.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
// ─── Página principal ─────────────────────────────────────────────────────────

type Vista = "cine" | "pelicula";

// Cartelera de hoy incluida en la página al compilar (null en la app)
interface DatosIniciales {
  fecha: string;
  cines: CartelEnriquecido[];
}

export default function Cartelera({
  datosIniciales,
}: {
  datosIniciales: DatosIniciales | null;
}) {
  // Los 7 días disponibles (hoy + 6 siguientes)
  const FECHAS_DISPONIBLES = useMemo(() => proximosDias(DIAS_CARTELERA), []);

  const [cartelesPorFecha, setCartelesPorFecha] = useState<
    Record<string, CartelEnriquecido[]>
  >(() =>
    datosIniciales ? { [datosIniciales.fecha]: datosIniciales.cines } : {},
  );
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(
    FECHAS_DISPONIBLES[0],
  );
  const [fechasCargadas, setFechasCargadas] = useState<Set<string>>(
    () => new Set(datosIniciales ? [datosIniciales.fecha] : []),
  );
  const [cargando, setCargando] = useState(false);
  const [scrapeando, setScrapeando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [desdeScraper, setDesdeScraper] = useState(datosIniciales !== null);

  // Hora actual, renovada cada minuto. Empieza en null para que la primera
  // pintada coincida con el HTML generado al compilar.
  const [ahora, setAhora] = useState<string | null>(null);
  useEffect(() => {
    const actualizar = () => setAhora(`${fechaISO()} ${horaActual()}`);
    actualizar();
    const intervalo = setInterval(actualizar, 60_000);
    return () => clearInterval(intervalo);
  }, []);

  // Los carteles que se muestran son los de la fecha seleccionada, sin las
  // sesiones que ya han empezado (los datos se generan cada 2 horas)
  const carteles: CartelEnriquecido[] = useMemo(() => {
    const delDia = cartelesPorFecha[fechaSeleccionada];
    if (!delDia) return DATOS_EJEMPLO;
    if (!ahora) return delDia;
    return delDia.map((cartel) => ({
      ...cartel,
      peliculas: cartel.peliculas
        .map((p) => ({
          ...p,
          sesiones: p.sesiones.filter(
            (s) => momentoSesion(s.fecha, s.hora) >= ahora,
          ),
        }))
        .filter((p) => p.sesiones.length > 0),
    }));
  }, [cartelesPorFecha, fechaSeleccionada, ahora]);

  // Vista por defecto al entrar es "pelicula" (la nueva cartelera visual)
  const [vista, setVista] = useState<Vista>("pelicula");
  const [cineSeleccionado, setCineSeleccionado] = useState(
    datosIniciales?.cines[0]?.cine.id ?? "",
  );

  // ─── Tema claro/oscuro ────────────────────────────────────────────────────
  const [tema, setTema] = useState<Tema>("oscuro");

  // Al montar: recuperamos la preferencia guardada, o si no hay ninguna,
  // respetamos la preferencia del sistema operativo/navegador.
  useEffect(() => {
    const guardado = localStorage.getItem("cinevalencia-tema");
    if (guardado === "claro" || guardado === "oscuro") {
      setTema(guardado);
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      setTema("claro");
    }
  }, []);

  // Cada vez que cambia el tema, lo persistimos
  useEffect(() => {
    localStorage.setItem("cinevalencia-tema", tema);
  }, [tema]);

  function alternarTema() {
    setTema((t) => (t === "oscuro" ? "claro" : "oscuro"));
  }

  const esOscuro = tema === "oscuro";

  const {
    coords: ubicacionUsuario,
    estado: estadoUbicacion,
    pedirUbicacion,
  } = useUbicacionUsuario();

  // Cuando obtenemos la ubicación por primera vez, seleccionamos automáticamente
  // el cine más cercano. Si el usuario elige otro cine después a mano, no lo pisamos.
  const autoSeleccionadoRef = useRef(false);
  useEffect(() => {
    if (!ubicacionUsuario || carteles.length === 0) return;
    if (autoSeleccionadoRef.current) return;

    let masCercano: string | null = null;
    let distanciaMin = Infinity;
    for (const cartel of carteles) {
      const coordCine = COORDENADAS_CINE[cartel.cine.id];
      if (!coordCine) continue;
      const d = distanciaKm(ubicacionUsuario, coordCine);
      if (d < distanciaMin) {
        distanciaMin = d;
        masCercano = cartel.cine.id;
      }
    }

    if (masCercano) {
      setCineSeleccionado(masCercano);
      autoSeleccionadoRef.current = true;
    }
  }, [ubicacionUsuario, carteles]);

  /** Carga los datos de una fecha concreta (si no los tenemos ya en memoria) */
  async function cargarDatosFecha(fecha: string, forzar = false) {
    if (!forzar && fechasCargadas.has(fecha)) return;
    setCargando(true);
    setError(null);
    try {
      // Al forzar ("Actualizar") nos saltamos la caché del navegador
      const res = await fetch(
        `${URL_DATOS}/${fecha}.json`,
        forzar ? { cache: "no-store" } : undefined,
      );
      if (res.status === 404) {
        setError("Todavía no hay cartelera para este día");
        return;
      }
      const data = await res.json();
      if (data.cines?.length > 0) {
        // Filtramos solo los carteles de esta fecha
        const cartelesEstafecha: CartelEnriquecido[] = data.cines.filter(
          (c: any) =>
            c.peliculas.some((p: any) =>
              p.sesiones.some((s: any) => s.fecha === fecha),
            ) || c.peliculas.length > 0,
        );
        setCartelesPorFecha((prev) => ({
          ...prev,
          [fecha]: cartelesEstafecha,
        }));
        setFechasCargadas((prev) => new Set([...prev, fecha]));
        setDesdeScraper(true);
        if (!cineSeleccionado && data.cines[0]?.cine.id) {
          setCineSeleccionado(data.cines[0].cine.id);
        }
      }
      if (data.error) setError(data.error);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  /** Recarga forzada de la fecha actual */
  async function lanzarScraper() {
    setScrapeando(true);
    setError(null);
    try {
      await cargarDatosFecha(fechaSeleccionada, true);
    } catch {
      setError("Error al actualizar la cartelera");
    } finally {
      setScrapeando(false);
    }
  }

  /** Cuando el usuario cambia de fecha, cargamos si hace falta */
  function seleccionarFecha(fecha: string) {
    setFechaSeleccionada(fecha);
    setBusqueda("");
    if (!fechasCargadas.has(fecha)) {
      cargarDatosFecha(fecha);
    }
  }

  // Carga inicial: solo la fecha de hoy (si la página no la trajo ya)
  useEffect(() => {
    cargarDatosFecha(FECHAS_DISPONIBLES[0]);
    if (!datosIniciales) setCineSeleccionado(DATOS_EJEMPLO[0]?.cine.id ?? "");
  }, []);

  // Título de la fecha seleccionada (largo, para el encabezado)
  const tituloFecha = useMemo(() => {
    const [anyo, mes, dia] = fechaSeleccionada.split("-").map(Number);
    const d = new Date(anyo, mes - 1, dia);
    return d.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [fechaSeleccionada]);

  const esHoySeleccionado = fechaSeleccionada === FECHAS_DISPONIBLES[0];

  const totalPeliculas = useMemo(
    () =>
      new Set(
        carteles.flatMap((c) => c.peliculas.map((p) => p.pelicula.titulo)),
      ).size,
    [carteles],
  );

  return (
    <div
      className={`min-h-screen selection:bg-amber-400 selection:text-black ${
        esOscuro ? "bg-black text-white" : "bg-zinc-50 text-zinc-900"
      }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-50">
        {/* Fondo desenfocado */}
        <div
          className={`absolute inset-0 backdrop-blur-2xl border-b ${
            esOscuro
              ? "bg-black/70 border-white/5"
              : "bg-white/70 border-zinc-200"
          }`}
        />

        {/* Brillo superior */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-blue-500/5" />

        <div className="relative max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div
                className="
                h-12
                w-12
                rounded-2xl
                bg-gradient-to-br
                from-amber-400
                to-orange-500
                flex
                items-center
                justify-center
                shadow-xl
                shadow-amber-500/30
                "
              >
                <Film size={22} className="text-black" />
              </div>

              <div>
                <h1
                  className={`
                  text-2xl
                  font-black
                  tracking-tight
                  ${esOscuro ? "text-white" : "text-zinc-900"}
                  `}
                >
                  Cine
                  <span
                    className={esOscuro ? "text-amber-400" : "text-amber-600"}
                  >
                    Valencia
                  </span>
                </h1>

                <p className="text-sm text-zinc-500">
                  Todos los cines en una sola aplicación
                </p>
              </div>
            </div>

            {/* Botones: actualizar + tema */}
            <div className="flex items-center gap-3">
              <button
                onClick={lanzarScraper}
                disabled={scrapeando || cargando}
                className={`
                rounded-xl
                border
                backdrop-blur
                px-4
                py-3
                flex
                items-center
                gap-2
                transition-all
                duration-300
                disabled:opacity-40
                ${
                  esOscuro
                    ? "border-white/10 bg-white/5 hover:border-amber-400/30 hover:bg-amber-500/10"
                    : "border-zinc-200 bg-zinc-100 hover:border-amber-400/40 hover:bg-amber-50"
                }
                `}
              >
                <RefreshCw
                  size={16}
                  className={scrapeando ? "animate-spin" : ""}
                />

                <span className="font-medium text-sm">
                  {scrapeando ? "Actualizando..." : "Actualizar"}
                </span>
              </button>

              <button
                onClick={alternarTema}
                aria-label={
                  esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
                }
                title={esOscuro ? "Modo claro" : "Modo oscuro"}
                className={`
                rounded-xl
                border
                backdrop-blur
                p-3
                flex
                items-center
                justify-center
                transition-all
                duration-300
                ${
                  esOscuro
                    ? "border-white/10 bg-white/5 hover:border-amber-400/30 hover:bg-amber-500/10"
                    : "border-zinc-200 bg-zinc-100 hover:border-amber-400/40 hover:bg-amber-50"
                }
                `}
              >
                {esOscuro ? (
                  <Sun size={16} className="text-amber-400" />
                ) : (
                  <Moon size={16} className="text-amber-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 -z-50 overflow-hidden ${
          esOscuro ? "bg-black" : "bg-zinc-50"
        }`}
      >
        {/* Gradientes desenfocados para dar profundidad */}
        <div
          className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[120px] rounded-full ${
            esOscuro ? "bg-amber-900/20" : "bg-amber-200/40"
          }`}
        />
        <div
          className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[120px] rounded-full ${
            esOscuro ? "bg-blue-900/20" : "bg-blue-200/40"
          }`}
        />
      </div>

      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16">
        {/* Título */}
        <div className="mb-5">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Calendar size={11} />
            {esHoySeleccionado ? "Cartelera de hoy" : "Cartelera"}
          </p>
          <h1
            className={`text-2xl font-black capitalize ${
              esOscuro ? "text-white" : "text-zinc-900"
            }`}
          >
            {tituloFecha}
          </h1>
          <p className="text-zinc-600 text-xs mt-1">
            {desdeScraper
              ? `${carteles.length} cines · ${totalPeliculas} películas en cartelera`
              : 'Datos de ejemplo · Pulsa "Actualizar" para cargar datos reales'}
          </p>
        </div>

        {/* CONTROLES FLOTANTES (Sticky) */}
        <div
          className={`sticky top-[88px] z-40 backdrop-blur-xl py-4 -mx-4 px-4 mb-6 border-b shadow-2xl ${
            esOscuro
              ? "bg-black/90 border-white/5 shadow-black"
              : "bg-white/90 border-zinc-200 shadow-zinc-300/40"
          }`}
        >
          <div className="max-w-7xl mx-auto">
            {/* Toggle vista + botón de ubicación */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div
                className={`flex gap-1 p-1 border rounded-xl w-fit ${
                  esOscuro
                    ? "bg-zinc-900 border-zinc-800"
                    : "bg-zinc-100 border-zinc-200"
                }`}
              >
                {(["pelicula", "cine"] as Vista[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVista(v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
                      ${
                        vista === v
                          ? esOscuro
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-amber-100 text-amber-700 border border-amber-400"
                          : esOscuro
                            ? "text-zinc-500 hover:text-zinc-300"
                            : "text-zinc-500 hover:text-zinc-700"
                      }`}
                  >
                    {v === "cine" ? (
                      <>
                        <Ticket size={13} /> Por cine
                      </>
                    ) : (
                      <>
                        <Film size={13} /> Películas
                      </>
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={pedirUbicacion}
                disabled={estadoUbicacion === "cargando"}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50
                  ${
                    estadoUbicacion === "concedido"
                      ? esOscuro
                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : "bg-blue-50 text-blue-700 border-blue-300"
                      : esOscuro
                        ? "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-blue-300 hover:border-blue-500/30"
                        : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:text-blue-600 hover:border-blue-400/50"
                  }`}
              >
                <LocateFixed
                  size={13}
                  className={
                    estadoUbicacion === "cargando" ? "animate-pulse" : ""
                  }
                />
                {estadoUbicacion === "concedido"
                  ? "Ordenado por cercanía"
                  : estadoUbicacion === "cargando"
                    ? "Localizando..."
                    : estadoUbicacion === "denegado"
                      ? "Permiso denegado"
                      : "Cines cerca de ti"}
              </button>
            </div>

            {/* ─── Barra de fechas ──────────────────────────────────────────── */}
            <div className="mt-4 -mx-1 overflow-x-auto scrollbar-none">
              <div className="flex gap-2 px-1 pb-1 min-w-max">
                {FECHAS_DISPONIBLES.map((fecha) => {
                  const { diaSemana, dia, mes, esHoy } = parsearFechaISO(fecha);
                  const activa = fecha === fechaSeleccionada;
                  const cargada = fechasCargadas.has(fecha);

                  return (
                    <button
                      key={fecha}
                      onClick={() => seleccionarFecha(fecha)}
                      className={`relative flex flex-col items-center gap-0.5 px-3.5 py-2.5 rounded-xl border text-center transition-all duration-200 min-w-[56px]
                        ${
                          activa
                            ? esOscuro
                              ? "bg-amber-500/20 border-amber-400/50 text-amber-300 shadow-lg shadow-amber-500/10"
                              : "bg-amber-100 border-amber-400 text-amber-700 shadow-lg shadow-amber-200/60"
                            : esOscuro
                              ? "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                              : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
                        }`}
                    >
                      {/* Punto indicador de datos cargados */}
                      {cargada && !activa && (
                        <span
                          className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                            esOscuro ? "bg-amber-500/60" : "bg-amber-400"
                          }`}
                        />
                      )}

                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                        {esHoy ? "Hoy" : diaSemana}
                      </span>
                      <span
                        className={`text-lg font-black leading-none ${
                          activa
                            ? ""
                            : esOscuro
                              ? "text-zinc-200"
                              : "text-zinc-700"
                        }`}
                      >
                        {dia}
                      </span>
                      <span className="text-[10px] opacity-60">{mes}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Buscador */}
            {vista === "pelicula" && (
              <div className="relative mt-4">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar película..."
                  className={`w-full border rounded-xl pl-9 pr-10 py-3 text-sm backdrop-blur-md transition-all focus:outline-none ${
                    esOscuro
                      ? "bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:border-amber-400/50 focus:bg-white/10"
                      : "bg-zinc-100 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-amber-400/60 focus:bg-zinc-50"
                  }`}
                />
                {busqueda && (
                  <button
                    onClick={() => setBusqueda("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Alertas de Ubicación */}
        {estadoUbicacion === "denegado" && (
          <div
            className={`mb-4 p-3 border rounded-lg text-xs ${
              esOscuro
                ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            No hemos podido acceder a tu ubicación. Actívala en los permisos del
            navegador para ver los cines más cercanos.
          </div>
        )}
        {estadoUbicacion === "no_soportado" && (
          <div
            className={`mb-4 p-3 border rounded-lg text-xs ${
              esOscuro
                ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            Tu navegador no soporta geolocalización.
          </div>
        )}
        {error && (
          <div
            className={`mb-4 p-3 border rounded-lg text-xs ${
              esOscuro
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {error}
          </div>
        )}

        {/* Renderizado de Vistas */}
        <div
          className={`transition-all duration-500 ${scrapeando ? "opacity-40 blur-[2px] pointer-events-none" : "opacity-100 blur-0"}`}
        >
          {cargando ? (
            <div className="flex items-center justify-center py-12 gap-2 text-zinc-500 text-sm">
              <RefreshCw size={16} className="animate-spin text-amber-400" />
              Cargando cartelera...
            </div>
          ) : vista === "cine" ? (
            <VistaPorCine
              carteles={carteles}
              cineSeleccionado={cineSeleccionado || carteles[0]?.cine.id || ""}
              onCambiarCine={setCineSeleccionado}
              ubicacionUsuario={ubicacionUsuario}
              tema={tema}
            />
          ) : (
            <VistaPorPelicula
              carteles={carteles}
              busqueda={busqueda}
              ubicacionUsuario={ubicacionUsuario}
              tema={tema}
            />
          )}
        </div>
      </main>

      <footer
        className={`border-t py-6 text-center text-xs ${
          esOscuro
            ? "border-zinc-800/50 text-zinc-700"
            : "border-zinc-200 text-zinc-400"
        }`}
      >
        cinevalencia · datos de{" "}
        <a
          href="https://reservaentradas.com"
          className={`transition-colors ${esOscuro ? "hover:text-zinc-500" : "hover:text-zinc-600"}`}
        >
          reservaentradas.com
        </a>{" "}
        y{" "}
        <a
          href="https://yelmocines.es"
          className={`transition-colors ${esOscuro ? "hover:text-zinc-500" : "hover:text-zinc-600"}`}
        >
          yelmocines.es
        </a>
      </footer>
    </div>
  );
}
