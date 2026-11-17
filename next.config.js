// Web estática (sin servidor): `next build` genera la carpeta out/, que se
// publica en GitHub Pages y se empaqueta dentro de la app Android.
//   NEXT_PUBLIC_BASE_PATH  subcarpeta de GitHub Pages (/CarteleraValenciaApp)
//   NEXT_PUBLIC_DATOS_URL  solo para la app: URL de los JSON publicados

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
