// src/lib/fechas.ts
// Fechas "YYYY-MM-DD" siempre en hora de Valencia, independientemente de la
// zona horaria del servidor (en producción suele ser UTC) o del navegador.
// Usar toISOString() daba el día anterior entre las 00:00 y las 02:00.

export const ZONA_HORARIA = "Europe/Madrid";

// Días que muestra la cartelera (hoy + 6 siguientes)
export const DIAS_CARTELERA = 7;

const formateador = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha ISO (YYYY-MM-DD) en Valencia del instante indicado (por defecto, ahora) */
export function fechaISO(instante: Date = new Date()): string {
  const partes = formateador.formatToParts(instante);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** Suma (o resta) días a una fecha ISO */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día de la semana de una fecha ISO (0 = domingo … 6 = sábado) */
export function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Los próximos N días (empezando hoy) como fechas ISO */
export function proximosDias(n: number): string[] {
  const hoy = fechaISO();
  return Array.from({ length: n }, (_, i) => sumarDias(hoy, i));
}

const formateadorHora = new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA_HORARIA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Hora actual en Valencia ("HH:MM") */
export function horaActual(): string {
  return formateadorHora.format(new Date());
}

/**
 * "AAAA-MM-DD HH:MM" comparable con `${fechaISO()} ${horaActual()}`.
 * Las sesiones de madrugada (00:00–03:59) son de la noche del día indicado.
 */
export function momentoSesion(fecha: string, hora: string): string {
  return `${hora < "04:00" ? sumarDias(fecha, 1) : fecha} ${hora}`;
}
