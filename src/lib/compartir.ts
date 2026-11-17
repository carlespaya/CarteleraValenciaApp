// src/lib/compartir.ts
// Imágenes para compartir (WhatsApp, historias…): el ticket de una entrada y
// el resumen de "Tu año en el cine". Se dibujan en un canvas con los colores
// de la app; el QR nunca se incluye, para que nadie pueda usar tu entrada.

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ANCHO = 1080;
const ALTO = 1350;

function fondo(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const brillo = ctx.createRadialGradient(150, 150, 50, 150, 150, 900);
  brillo.addColorStop(0, "rgba(245,158,11,0.35)");
  brillo.addColorStop(1, "rgba(245,158,11,0)");
  ctx.fillStyle = brillo;
  ctx.fillRect(0, 0, ANCHO, ALTO);
}

function marca(ctx: CanvasRenderingContext2D, y: number) {
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText("Cine", 90, y);
  const ancho = ctx.measureText("Cine").width;
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("Valencia", 90 + ancho, y);
}

// Texto en varias líneas dentro de un ancho; devuelve la y final
function parrafo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, ancho: number, alto: number, maxLineas = 3): number {
  const palabras = texto.split(/\s+/);
  let linea = "";
  let lineas = 0;
  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea ? `${linea} ${palabras[i]}` : palabras[i];
    if (ctx.measureText(prueba).width > ancho && linea) {
      lineas++;
      if (lineas === maxLineas) {
        ctx.fillText(`${linea}…`, x, y);
        return y + alto;
      }
      ctx.fillText(linea, x, y);
      y += alto;
      linea = palabras[i];
    } else {
      linea = prueba;
    }
  }
  if (linea) {
    ctx.fillText(linea, x, y);
    y += alto;
  }
  return y;
}

function rectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface DatosTicket {
  pelicula: string;
  cine: string;
  fechaLarga: string;
  detalle: string; // "20:35 · Sala 1 · Butaca F12"
  numero: string; // "Entrada nº 12 de 2026"
}

export function dibujarTicket(t: DatosTicket): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext("2d")!;
  fondo(ctx);
  marca(ctx, 150);

  // Cuerpo del ticket
  const x = 90, y = 240, w = ANCHO - 180, h = 900;
  const borde = ctx.createLinearGradient(x, y, x + w, y + h);
  borde.addColorStop(0, "#fbbf24");
  borde.addColorStop(1, "#f97316");
  rectRedondeado(ctx, x, y, w, h, 48);
  ctx.fillStyle = borde;
  ctx.fill();
  rectRedondeado(ctx, x + 6, y + 6, w - 12, h - 12, 44);
  ctx.fillStyle = "#18181b";
  ctx.fill();

  ctx.fillStyle = "#fbbf24";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText("ENTRADA DE CINE", x + 70, y + 110);

  ctx.fillStyle = "#fff";
  ctx.font = "900 84px system-ui, sans-serif";
  const yTitulo = parrafo(ctx, t.pelicula, x + 70, y + 230, w - 140, 96);

  ctx.fillStyle = "#d4d4d8";
  ctx.font = "600 46px system-ui, sans-serif";
  ctx.fillText(t.cine, x + 70, Math.max(yTitulo + 30, y + 470));

  // Línea troquelada con muescas a los lados
  const yCorte = y + 600;
  ctx.fillStyle = "#09090b";
  ctx.beginPath();
  ctx.arc(x, yCorte, 40, 0, Math.PI * 2);
  ctx.arc(x + w, yCorte, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([18, 16]);
  ctx.strokeStyle = "#52525b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 60, yCorte);
  ctx.lineTo(x + w - 60, yCorte);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 48px system-ui, sans-serif";
  ctx.fillText(t.fechaLarga.charAt(0).toUpperCase() + t.fechaLarga.slice(1), x + 70, yCorte + 110);
  ctx.fillStyle = "#e4e4e7";
  ctx.font = "600 42px system-ui, sans-serif";
  ctx.fillText(t.detalle, x + 70, yCorte + 180);
  ctx.fillStyle = "#71717a";
  ctx.font = "500 34px system-ui, sans-serif";
  ctx.fillText(t.numero, x + 70, yCorte + 250);
  return lienzo;
}

export interface DatosResumen {
  anyo: string;
  cifras: [string, string][]; // [valor, etiqueta]
  frases: string[];
}

export function dibujarResumen(r: DatosResumen): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext("2d")!;
  fondo(ctx);
  marca(ctx, 150);

  ctx.fillStyle = "#fff";
  ctx.font = "900 92px system-ui, sans-serif";
  ctx.fillText("Mi año en", 90, 300);
  ctx.fillText("el cine", 90, 400);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(r.anyo, 90 + ctx.measureText("el cine ").width, 400);

  // Cifras en dos columnas
  r.cifras.slice(0, 4).forEach(([valor, etiqueta], i) => {
    const cx = 90 + (i % 2) * 460;
    const cy = 540 + Math.floor(i / 2) * 230;
    ctx.fillStyle = "#fbbf24";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.fillText(valor, cx, cy);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "600 38px system-ui, sans-serif";
    ctx.fillText(etiqueta, cx, cy + 56);
  });

  ctx.fillStyle = "#e4e4e7";
  ctx.font = "600 42px system-ui, sans-serif";
  let y = 1060;
  for (const frase of r.frases.slice(0, 4)) {
    y = parrafo(ctx, frase, 90, y, ANCHO - 180, 56, 1) + 10;
  }
  return lienzo;
}

/** Abre el menú de compartir del móvil con la imagen (o la descarga en la web) */
export async function compartirImagen(lienzo: HTMLCanvasElement, nombre: string, texto: string) {
  const dataUrl = lienzo.toDataURL("image/png");
  if (!Capacitor.isNativePlatform()) {
    const enlace = document.createElement("a");
    enlace.href = dataUrl;
    enlace.download = `${nombre}.png`;
    enlace.click();
    return;
  }
  const archivo = await Filesystem.writeFile({
    path: `${nombre}.png`,
    data: dataUrl.split(",")[1],
    directory: Directory.Cache,
  });
  await Share.share({ title: texto, text: texto, files: [archivo.uri] });
}
