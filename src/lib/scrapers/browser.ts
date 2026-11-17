// src/lib/scrapers/browser.ts
// Punto único para abrir páginas de Chromium desde los distintos scrapers.
//
// Antes cada scraper lanzaba su propio Chromium (hasta 12 a la vez por cada
// visita). Ahora todos comparten un único navegador y se limita cuántas
// páginas hay abiertas a la vez (SCRAPER_CONCURRENCIA, 3 por defecto) para que
// el servidor aguante con poca memoria. El navegador se cierra solo tras un
// minuto sin uso.
//
// En GitHub Actions el workflow instala Chromium con
// `playwright install --only-shell chromium`; en local, el que tengas
// instalado con `npx playwright install`.

import { chromium } from "playwright";
import type { Browser, BrowserContextOptions, Page } from "playwright";

const MAX_PAGINAS = Math.max(1, Number(process.env.SCRAPER_CONCURRENCIA) || 3);
const CIERRE_INACTIVO_MS = 60_000;

// Imágenes, vídeos y fuentes no hacen falta para leer horarios y son lo que
// más tarda en cargar. Las URLs de los pósters siguen estando en el HTML.
const RECURSOS_BLOQUEADOS = new Set(["image", "media", "font"]);

interface EstadoNavegador {
  browser: Promise<Browser> | null;
  activas: number;
  cola: (() => void)[];
  temporizadorCierre: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as typeof globalThis & { __navegador?: EstadoNavegador };
const estado: EstadoNavegador = (g.__navegador ??= {
  browser: null,
  activas: 0,
  cola: [],
  temporizadorCierre: null,
});

async function obtenerBrowser(): Promise<Browser> {
  if (estado.browser) {
    const actual = await estado.browser.catch(() => null);
    if (actual?.isConnected()) return actual;
  }

  const lanzamiento = chromium.launch({
    headless: true,
    // /dev/shm es muy pequeño en Docker y Chromium se cuelga sin esto
    args: ["--disable-dev-shm-usage"],
  });
  estado.browser = lanzamiento;
  lanzamiento.catch(() => {
    if (estado.browser === lanzamiento) estado.browser = null;
  });
  return lanzamiento;
}

async function adquirirHueco() {
  if (estado.temporizadorCierre) {
    clearTimeout(estado.temporizadorCierre);
    estado.temporizadorCierre = null;
  }
  if (estado.activas < MAX_PAGINAS) {
    estado.activas++;
    return;
  }
  // El hueco nos lo pasa directamente quien lo libere
  await new Promise<void>((resolve) => estado.cola.push(resolve));
}

function liberarHueco() {
  const siguiente = estado.cola.shift();
  if (siguiente) {
    siguiente();
    return;
  }
  estado.activas--;
  if (estado.activas === 0) {
    estado.temporizadorCierre = setTimeout(async () => {
      estado.temporizadorCierre = null;
      const browser = estado.browser;
      estado.browser = null;
      await (await browser?.catch(() => null))?.close().catch(() => {});
    }, CIERRE_INACTIVO_MS);
    estado.temporizadorCierre.unref?.();
  }
}

/** Cierra el navegador compartido (al terminar un script) */
export async function cerrarNavegador() {
  if (estado.temporizadorCierre) clearTimeout(estado.temporizadorCierre);
  estado.temporizadorCierre = null;
  const browser = estado.browser;
  estado.browser = null;
  await (await browser?.catch(() => null))?.close().catch(() => {});
}

export interface OpcionesPagina {
  contexto?: BrowserContextOptions;
  bloquearRecursos?: boolean;
}

/**
 * Abre una página en el navegador compartido. Llama siempre a `cerrar()`
 * (en un finally) para liberar el hueco.
 */
export async function abrirPagina(
  opciones: OpcionesPagina = {},
): Promise<{ page: Page; cerrar: () => Promise<void> }> {
  await adquirirHueco();

  let liberado = false;
  let cerrarContexto = async () => {};
  const cerrar = async () => {
    if (liberado) return;
    liberado = true;
    await cerrarContexto().catch(() => {});
    liberarHueco();
  };

  try {
    const browser = await obtenerBrowser();
    const context = await browser.newContext(opciones.contexto);
    cerrarContexto = () => context.close();

    if (opciones.bloquearRecursos) {
      await context.route("**/*", (route) =>
        RECURSOS_BLOQUEADOS.has(route.request().resourceType())
          ? route.abort()
          : route.continue(),
      );
    }

    const page = await context.newPage();
    return { page, cerrar };
  } catch (error) {
    await cerrar();
    throw error;
  }
}
