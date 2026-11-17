import { tarifas } from "./tarifas";

interface OpcionesPrecio {
  cine: string;
  fecha: Date;
  tipoSala?: "normal" | "imax" | "4dx";
}

export function obtenerPrecioSesion({
  cine,
  fecha,
  tipoSala = "normal",
}: OpcionesPrecio) {
  const tarifaCine = tarifas[cine];

  if (!tarifaCine) return null;

  const dia = fecha.getDay(); // 0 domingo ... 6 sábado

  // Kinepolis
  if ("normal" in tarifaCine) {
    if (tipoSala === "imax") return tarifaCine.imax;
    if (tipoSala === "4dx") return tarifaCine["4dx"];

    if (dia === 3) {
      return {
        ...tarifaCine.normal,
        general: tarifaCine.normal?.miercoles,
      };
    }

    return tarifaCine.normal;
  }

  // Domingo matinal
  if (dia === 0 && tarifaCine.domingoMatinal) {
    return tarifaCine.domingoMatinal;
  }

  // Miércoles
  if (dia === 3 && tarifaCine.miercoles) {
    return tarifaCine.miercoles;
  }

  // Viernes, sábado y domingo
  if (dia === 5 || dia === 6 || dia === 0) {
    return tarifaCine.finDeSemana;
  }

  // Laborables
  return tarifaCine.laboral;
}

const ETIQUETAS_TARIFAS: Record<string, string> = {
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
  web: "Web",
  generalAntes17: "Antes de las 17h",
  promocional: "Promocional",
  desempleados: "Desempleados",
  menores12: "Menores 12",
};

/**
 * Tarifas previstas de una sesión como [etiqueta, precio], o [] si no
 * conocemos las de ese cine. Traduce el nombre del cine a la clave de
 * tarifas.ts y el formato (IMAX, 4DX) al tipo de sala.
 */
export function tarifasDeSesion(
  cineNombre: string,
  fechaISO: string,
  formato?: string,
): [string, number][] {
  let tipoSala: "normal" | "imax" | "4dx" = "normal";
  if (formato?.toLowerCase().includes("imax")) tipoSala = "imax";
  if (formato?.toLowerCase().includes("4dx")) tipoSala = "4dx";

  let claveTarifa = cineNombre;
  const nombreLower = cineNombre.toLowerCase();
  if (nombreLower.includes("lys")) {
    claveTarifa = "Cines Lys";
  } else if (nombreLower.includes("kinepolis")) {
    claveTarifa = "Kinepolis";
  } else if (nombreLower.includes("ocine")) {
    claveTarifa = "Ocine";
  } else if (nombreLower.includes("abc")) {
    if (nombreLower.includes("park")) claveTarifa = "ABC Park";
    else if (nombreLower.includes("saler")) claveTarifa = "ABC Saler";
    else if (nombreLower.includes("turia")) claveTarifa = "ABC Gran Turia";
    else if (nombreLower.includes("gandia")) claveTarifa = "ABC Gandía";
  }

  const info = obtenerPrecioSesion({
    cine: claveTarifa,
    fecha: new Date(fechaISO),
    tipoSala,
  });
  if (!info) return [];
  return Object.entries(info)
    .filter((par): par is [string, number] => typeof par[1] === "number")
    .map(([clave, precio]) => [ETIQUETAS_TARIFAS[clave] ?? clave, precio]);
}
