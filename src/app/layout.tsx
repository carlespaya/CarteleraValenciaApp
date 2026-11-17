import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CineValencia — Cartelera de cines en Valencia',
  description: 'Todos los cines de Valencia en un solo lugar. Consulta horarios y reserva entradas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
