// scripts/generar-iconos.mjs
// Dibuja el icono de la app (el mismo logo de la cabecera: degradado ámbar →
// naranja con el icono "Film" de lucide en negro) en todos los tamaños que
// necesita Android, más el favicon de la web. Usa el Chromium de Playwright.
//   node scripts/generar-iconos.mjs

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RES = path.join("android", "app", "src", "main", "res");

// Icono "Film" de lucide-react (viewBox 24x24, trazo de 2)
const FILM = `
  <rect width="18" height="18" x="3" y="3" rx="2"/>
  <path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/>
  <path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>`;

const DEGRADADO = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
  </defs>`;

// Icono "Film" negro centrado, ocupando `escala` del lado
function glifo(lado, escala) {
  const tam = lado * escala;
  const desp = (lado - tam) / 2;
  return `<g transform="translate(${desp} ${desp}) scale(${tam / 24})" fill="none"
    stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FILM}</g>`;
}

const formas = {
  // Cuadrado redondeado con degradado (Android < 8 y favicon)
  cuadrado: (l) =>
    `${DEGRADADO}<rect width="${l}" height="${l}" rx="${l * 0.22}" fill="url(#g)"/>${glifo(l, 0.5)}`,
  // Círculo con degradado (icono redondo de Android < 8)
  circulo: (l) =>
    `${DEGRADADO}<circle cx="${l / 2}" cy="${l / 2}" r="${l / 2}" fill="url(#g)"/>${glifo(l, 0.5)}`,
  // Solo el glifo (primer plano del icono adaptable de Android 8+: el fondo
  // con el degradado va en drawable/ic_launcher_background.xml)
  primerPlano: (l) => glifo(l, 0.36),
};

const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const salidas = [];
for (const [densidad, f] of Object.entries(DENSIDADES)) {
  const dir = path.join(RES, `mipmap-${densidad}`);
  salidas.push([path.join(dir, "ic_launcher.png"), "cuadrado", 48 * f]);
  salidas.push([path.join(dir, "ic_launcher_round.png"), "circulo", 48 * f]);
  salidas.push([path.join(dir, "ic_launcher_foreground.png"), "primerPlano", 108 * f]);
}
salidas.push([path.join(RES, "drawable-xxxhdpi", "splash_logo.png"), "cuadrado", 384]);
salidas.push([path.join("src", "app", "icon.png"), "cuadrado", 512]);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [archivo, forma, lado] of salidas) {
  await page.setViewportSize({ width: lado, height: lado });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
      <svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"
        viewBox="0 0 ${lado} ${lado}" style="display:block">${formas[forma](lado)}</svg>
    </body></html>`,
  );
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  await page.screenshot({ path: archivo, omitBackground: true });
}
await browser.close();
console.log(`✅ ${salidas.length} iconos generados`);
