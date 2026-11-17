// src/lib/avisos.ts
// Notificaciones de la app (solo en el móvil):
//  - Recordatorio 1 hora antes de una sesión guardada en "Mi cine".
//  - Aviso cuando una película de "Quiero verla" entra en cartelera. Lo hace
//    public/runners/avisos.js en segundo plano; aquí se le pasa la lista.

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { BackgroundRunner } from "@capacitor/background-runner";
import type { Deseo, EntradaCine } from "@/lib/miCine";

const ETIQUETA_RUNNER = "es.cinevalencia.app.avisos";
const esMovil = () => Capacitor.isNativePlatform();

export async function pedirPermisoAvisos(): Promise<boolean> {
  if (!esMovil()) return false;
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === "granted";
  } catch {
    return false;
  }
}

// Identificador numérico estable a partir del id de la entrada
function idRecordatorio(idEntrada: string): number {
  let h = 0;
  for (const c of idEntrada) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 1000000) + 1;
}

/** Programa (o reprograma) el aviso 1 h antes de la sesión, si es futura */
export async function programarRecordatorio(entrada: EntradaCine) {
  if (!esMovil()) return;
  await cancelarRecordatorio(entrada.id);
  if (!entrada.hora) return;

  const [a, m, d] = entrada.fecha.split("-").map(Number);
  const [h, min] = entrada.hora.split(":").map(Number);
  const aviso = new Date(a, m - 1, d, h, min - 60);
  if (aviso.getTime() <= Date.now()) return;
  if (!(await pedirPermisoAvisos())) return;

  // Exacta si el móvil lo permite (la app declara USE_EXACT_ALARM). Si no, no
  // exacta: pedirla haría que el plugin abriera los ajustes del sistema
  let exacta = false;
  try {
    exacta = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    // Versión de Android sin este ajuste
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: idRecordatorio(entrada.id),
        title: `🎟️ ${entrada.pelicula} a las ${entrada.hora}`,
        body:
          [entrada.cineNombre, entrada.sala && `Sala ${entrada.sala}`, entrada.butaca && `Butaca ${entrada.butaca}`]
            .filter(Boolean)
            .join(" · ") + ". ¡Que la disfrutes!",
        schedule: { at: aviso, allowWhileIdle: true },
        isExactNotification: exacta,
      },
    ],
  });
}

export async function cancelarRecordatorio(idEntrada: string) {
  if (!esMovil()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: idRecordatorio(idEntrada) }],
    });
  } catch {
    // No había aviso programado
  }
}

/** Pasa la lista "Quiero verla" a la comprobación en segundo plano */
export async function sincronizarDeseos(deseos: Deseo[], urlDatos: string) {
  if (!esMovil()) return;
  try {
    await BackgroundRunner.dispatchEvent({
      label: ETIQUETA_RUNNER,
      event: "guardar",
      details: {
        deseos: deseos.map(({ clave, titulo }) => ({ clave, titulo })),
        urlDatos,
      },
    });
    // Y una comprobación inmediata, por si ya está en cartelera
    await BackgroundRunner.dispatchEvent({
      label: ETIQUETA_RUNNER,
      event: "comprobar",
      details: {},
    });
  } catch {
    // Sin plugin (navegador) o sin permiso: la lista sigue visible en la app
  }
}
