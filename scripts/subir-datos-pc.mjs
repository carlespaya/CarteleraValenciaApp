// scripts/subir-datos-pc.mjs
// Genera la cartelera desde ESTE ordenador y la sube a la rama "datos".
//
// Por qué: Cinesa y Yelmo bloquean las conexiones desde los servidores de
// GitHub, pero no desde una conexión doméstica. El workflow de GitHub conserva
// los datos de un cine cuando no puede descargarlo, así que aprovecha los que
// sube este script y sigue actualizando él solo el resto cada 2 horas.
//
//   npm run datos-pc
//
// Lo ejecuta una tarea programada de Windows (scripts/instalar-tarea-pc.ps1).
// Usa tus credenciales de git para subir; no necesita nada más.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = process.cwd();
const DATOS = path.join(RAIZ, "public", "datos");
const CACHE_OMDB = path.join(RAIZ, ".cache", "omdb.json");

const ejecutar = (comando, opciones = {}) =>
  execSync(comando, { stdio: "inherit", ...opciones });
const leer = (comando, opciones = {}) =>
  execSync(comando, { encoding: "utf8", ...opciones }).trim();

console.log(`\n=== ${new Date().toLocaleString("es-ES")} ===`);
const remoto = leer("git remote get-url origin");

// 1. Datos actuales de la rama "datos" (para conservar lo que falle ahora)
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "cinevalencia-datos-"));
try {
  ejecutar(`git clone --depth 1 --branch datos "${remoto}" "${temporal}"`);
  fs.mkdirSync(DATOS, { recursive: true });
  fs.mkdirSync(path.dirname(CACHE_OMDB), { recursive: true });
  for (const nombre of fs.readdirSync(temporal)) {
    if (!nombre.endsWith(".json")) continue;
    const destino = nombre === "omdb.json" ? CACHE_OMDB : path.join(DATOS, nombre);
    fs.copyFileSync(path.join(temporal, nombre), destino);
  }

  // 2. Generar la cartelera completa desde aquí
  ejecutar("npm run cartelera");

  // Comprobar que esta vez sí están los cines que GitHub no puede descargar
  const hoy = JSON.parse(
    fs.readFileSync(path.join(DATOS, `${JSON.parse(fs.readFileSync(path.join(DATOS, "indice.json"), "utf8")).fechas[0]}.json`), "utf8"),
  );
  for (const id of ["yelmo-campanar", "cinesa-bonaire"]) {
    const cine = hoy.cines.find((c) => c.cine.id === id);
    console.log(`  ${id}: ${cine ? cine.peliculas.length : 0} películas hoy${cine?.error ? " (con error)" : ""}`);
  }

  // 3. Subir a la rama "datos" (un único commit, como hace el workflow)
  for (const nombre of fs.readdirSync(temporal)) {
    if (nombre !== ".git") fs.rmSync(path.join(temporal, nombre), { recursive: true, force: true });
  }
  for (const nombre of fs.readdirSync(DATOS)) {
    if (nombre.endsWith(".json")) fs.copyFileSync(path.join(DATOS, nombre), path.join(temporal, nombre));
  }
  if (fs.existsSync(CACHE_OMDB)) fs.copyFileSync(CACHE_OMDB, path.join(temporal, "omdb.json"));

  const enTemporal = { cwd: temporal };
  ejecutar("git checkout -q --orphan nueva", enTemporal);
  ejecutar("git add -A", enTemporal);
  ejecutar(
    `git -c user.name="CineValencia (PC)" -c user.email="cinevalencia-pc@users.noreply.github.com" commit -q -m "Cartelera desde PC ${new Date().toISOString().slice(0, 16)}"`,
    enTemporal,
  );
  ejecutar("git push -q -f origin nueva:datos", enTemporal);
  console.log("✅ Datos subidos a la rama datos. La web se actualizará en la próxima publicación (como mucho 2 h).");
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}
