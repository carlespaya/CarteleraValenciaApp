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
