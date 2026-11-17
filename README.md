# 🎬 CineValencia — web y app Android gratis

Cartelera unificada de los cines de Valencia, publicada **sin servidor y sin
coste**:

```
GitHub Actions (cada 2 h)                GitHub Pages
  scrapers → public/datos/*.json  ──►  web estática  ◄── app Android (APK)
             (un JSON por día)          + los JSON         lee los mismos JSON
```

- **GitHub Actions** ejecuta los scrapers cada 2 horas y genera la cartelera de
  los próximos 7 días (`scripts/generar-cartelera.ts`).
- **GitHub Pages** publica la web (Next.js exportado como archivos estáticos) y
  los JSON.
- **La app Android** (Capacitor) es la misma interfaz empaquetada; descarga
  la cartelera de la web publicada.

Es gratis si el repositorio es **público** (GitHub Pages en repos privados es
de pago). Las claves no se suben nunca: van como secretos de GitHub.

## Desarrollo en local

```bash
npm install
```

```bash
npm run cartelera
```

```bash
npm run dev
```

`npm run cartelera` genera `public/datos/` con la cartelera real (unos 40 s).
Necesita `.env.local` con `OMDB_API_KEY` (ver `.env.example`) y el Chromium de
Playwright (`npx playwright install chromium` si no lo tienes).

## Publicar por primera vez

1. **Subir a GitHub**: en GitHub Desktop, *File → Add local repository* (esta
   carpeta) y *Publish repository* con el nombre **`CarteleraValenciaApp`** y
   **sin** marcar "Keep this code private".
2. **Clave de OMDb**: en GitHub, *Settings → Secrets and variables → Actions →
   New repository secret*, nombre `OMDB_API_KEY` y tu clave.
3. **Activar Pages**: *Settings → Pages → Build and deployment → Source:*
   **GitHub Actions**.
4. **Primera publicación**: pestaña *Actions → Publicar cartelera → Run
   workflow*. Tarda unos 5 minutos.

La web queda en `https://<tu-usuario>.github.io/CarteleraValenciaApp/` y se
actualiza sola cada 2 horas.

## Actualizar o corregir errores

1. Haz el cambio y pruébalo con `npm run dev`.
2. Comprueba que compila con `npm run build`.
3. Haz commit y *Push origin* en GitHub Desktop.

Cada push vuelve a publicar la web. **Si algo falla, la web publicada sigue
siendo la anterior** y el error aparece en la pestaña *Actions* (en rojo).
Para deshacer un cambio: en GitHub Desktop, *History → botón derecho sobre el
commit → Revert changes in commit* y *Push origin*.

Si un cine falla al generar la cartelera, se conservan sus últimos datos
buenos (la rama `datos` guarda la ejecución anterior).

## App Android (APK)

```bash
npm run apk
```

Genera `CineValencia.apk`. La app descarga la cartelera de tu web publicada
(la URL sale del repositorio de GitHub), así que **primero hay que publicar**.
Para probarla antes, con los datos de `public/datos` dentro:

```bash
npm run apk -- --datos-locales
```

- **Instalar**: pasa el APK al móvil y ábrelo; Android pedirá permitir
  "instalar apps desconocidas". También puedes subirlo a una *Release* de
  GitHub y compartir el enlace.
- **Actualizaciones**: la cartelera se actualiza sola. Si cambias la interfaz,
  genera otro APK e instálalo encima (conserva los datos si lo generas siempre
  en este ordenador, porque se firma con tu clave de depuración local).
- Requisitos: Android Studio instalado (el script usa su Java y el SDK).
- Iconos: `node scripts/generar-iconos.mjs` los regenera desde el logo.

## Estructura

```
.github/workflows/publicar.yml   ← genera la cartelera y publica en Pages
scripts/
  generar-cartelera.ts           ← scrapers → public/datos/*.json
  construir-apk.mjs              ← npm run apk
  generar-iconos.mjs             ← iconos de la app y favicon
src/
  app/page.tsx                   ← portada (incluye la cartelera de hoy)
  app/Cartelera.tsx              ← interfaz
  lib/cartelera.ts               ← junta todas las fuentes + OMDb
  lib/scrapers/                  ← un scraper por fuente
android/                         ← proyecto Android (Capacitor)
```

## Notas legales

Este proyecto lee páginas públicas de los cines para uso personal/educativo.
Para uso comercial, contacta con los cines para obtener acceso oficial a sus
datos.
