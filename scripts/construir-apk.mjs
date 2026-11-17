// scripts/construir-apk.mjs
// Genera el APK de la app Android (CineValencia.apk, en la raíz del proyecto).
//
//   npm run apk                     La app lee la cartelera de la web publicada
//                                   en GitHub Pages (se deduce del remoto de git).
//   npm run apk -- --datos-locales  La app lleva dentro los datos de public/datos
//                                   (para probarla sin haber publicado nada).
//
// Usa el Java que trae Android Studio y el SDK de Android de tu usuario, salvo
// que JAVA_HOME / ANDROID_HOME digan otra cosa. URL_DATOS permite forzar la URL.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = process.cwd();
const datosLocales = process.argv.includes("--datos-locales");
const esWindows = os.platform() === "win32";

function ejecutar(comando, opciones = {}) {
  console.log(`\n> ${comando}`);
  execSync(comando, { stdio: "inherit", ...opciones });
}

// https://github.com/<usuario>/<repo>.git → https://<usuario>.github.io/<repo>/datos
function urlDatosPublicados() {
  if (process.env.URL_DATOS) return process.env.URL_DATOS;
  let remoto;
  try {
    remoto = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "El proyecto aún no está en GitHub (no hay remoto 'origin').\n" +
        "Publícalo primero o prueba con: npm run apk -- --datos-locales",
    );
  }
  const m = remoto.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`No reconozco el repositorio de GitHub: ${remoto}`);
  return `https://${m[1].toLowerCase()}.github.io/${m[2]}/datos`;
}

const urlDatos = datosLocales ? "/datos" : urlDatosPublicados();
console.log(`La app leerá la cartelera de: ${urlDatos}`);

// 1. Web estática para la app: sin subcarpeta y con la URL de los datos
ejecutar("npx next build", {
  env: {
    ...process.env,
    NEXT_PUBLIC_APP: "1", // diseño compacto de la app
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_DATOS_URL: urlDatos,
  },
});
if (!datosLocales) {
  // Los JSON se descargan de internet: no hace falta meterlos en el APK
  fs.rmSync(path.join(RAIZ, "out", "datos"), { recursive: true, force: true });
}

// 2. Copiar la web al proyecto Android
ejecutar("npx cap sync android");

// 3. Compilar el APK con Gradle
const javaHome =
  process.env.JAVA_HOME ??
  (esWindows ? "C:\\Program Files\\Android\\Android Studio\\jbr" : undefined);
const androidHome =
  process.env.ANDROID_HOME ??
  (esWindows ? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk") : undefined);

// Ruta completa: algunos Windows no ejecutan programas de la carpeta actual
const gradlew = path.join(RAIZ, "android", esWindows ? "gradlew.bat" : "gradlew");
ejecutar(`"${gradlew}" assembleDebug`, {
  cwd: path.join(RAIZ, "android"),
  env: {
    ...process.env,
    ...(javaHome && { JAVA_HOME: javaHome }),
    ...(androidHome && { ANDROID_HOME: androidHome }),
  },
});

const apk = path.join(RAIZ, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const destino = path.join(RAIZ, "CineValencia.apk");
fs.copyFileSync(apk, destino);
console.log(
  `\n✅ APK listo: ${destino} (${(fs.statSync(destino).size / 1024 / 1024).toFixed(1)} MB)`,
);
