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

// Usuario y repositorio de GitHub, a partir del remoto "origin"
function repositorioGitHub() {
  let remoto;
  try {
    remoto = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
  const m = remoto.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`No reconozco el repositorio de GitHub: ${remoto}`);
  return { usuario: m[1], repo: m[2] };
}

const repo = repositorioGitHub();
if (!repo && !datosLocales) {
  throw new Error(
    "El proyecto aún no está en GitHub (no hay remoto 'origin').\n" +
      "Publícalo primero o prueba con: npm run apk -- --datos-locales",
  );
}

// https://<usuario>.github.io/<repo>/datos
const urlDatos = datosLocales
  ? "/datos"
  : process.env.URL_DATOS ??
    `https://${repo.usuario.toLowerCase()}.github.io/${repo.repo}/datos`;
// La app compara su versión con la última release publicada en GitHub
const urlActualizaciones = repo
  ? `https://api.github.com/repos/${repo.usuario}/${repo.repo}/releases/latest`
  : "";
const version = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"),
).version;
console.log(`Versión ${version}. La app leerá la cartelera de: ${urlDatos}`);

// 1. Web estática para la app: sin subcarpeta y con la URL de los datos
ejecutar("npx next build", {
  env: {
    ...process.env,
    NEXT_PUBLIC_APP: "1", // diseño compacto de la app
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_DATOS_URL: urlDatos,
    NEXT_PUBLIC_VERSION_APP: version,
    NEXT_PUBLIC_URL_ACTUALIZACIONES: urlActualizaciones,
  },
});
if (!datosLocales) {
  // Los JSON se descargan de internet: no hace falta meterlos en el APK
  fs.rmSync(path.join(RAIZ, "out", "datos"), { recursive: true, force: true });
}

// 2. Copiar la web al proyecto Android
ejecutar("npx cap sync android");

// 3. Compilar el APK con Gradle
// Java 21, que es el que piden los plugins: el de JAVA_HOME, el que Gradle
// descargó en ~/.gradle/jdks o, si no hay, el de Android Studio
function buscarJava21() {
  const dir = path.join(os.homedir(), ".gradle", "jdks");
  if (!fs.existsSync(dir)) return undefined;
  const jdk = fs
    .readdirSync(dir)
    .find((n) => /-21-/.test(n) && fs.existsSync(path.join(dir, n, "bin")));
  return jdk && path.join(dir, jdk);
}
const javaHome =
  process.env.JAVA_HOME ??
  buscarJava21() ??
  (esWindows ? "C:\\Program Files\\Android\\Android Studio\\jbr" : undefined);
const androidHome =
  process.env.ANDROID_HOME ??
  (esWindows ? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk") : undefined);

// Ruta completa: algunos Windows no ejecutan programas de la carpeta actual
const gradlew = path.join(RAIZ, "android", esWindows ? "gradlew.bat" : "gradlew");
ejecutar(`"${gradlew}" assembleRelease`, {
  cwd: path.join(RAIZ, "android"),
  env: {
    ...process.env,
    ...(javaHome && { JAVA_HOME: javaHome }),
    ...(androidHome && { ANDROID_HOME: androidHome }),
  },
});

// Sin clave de firma (android/firma.properties o secretos), Gradle deja el
// APK sin firmar y no se podría instalar
const apk = path.join(RAIZ, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!fs.existsSync(apk)) {
  throw new Error(
    "No se ha generado un APK firmado. Falta android/firma.properties " +
      "(o los secretos APK_KEYSTORE / APK_KEYSTORE_PASSWORD).",
  );
}
const destino = path.join(RAIZ, "CineValencia.apk");
fs.copyFileSync(apk, destino);
console.log(
  `\n✅ APK ${version} listo: ${destino} (${(fs.statSync(destino).size / 1024 / 1024).toFixed(1)} MB)`,
);
