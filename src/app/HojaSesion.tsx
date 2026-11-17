"use client";

// Ficha que se abre en la app al tocar una sesión: comprar, guardarla en
// "Mi cine", ver las tarifas previstas y tus notas anteriores de ese cine.

import { createContext } from "react";
import { Film, Ticket, Plus, X, MapPin } from "lucide-react";
import type { Sesion } from "@/types";
import { tarifasDeSesion } from "@/lib/obtenerPrecioSesion";
import { useMiCine } from "@/lib/miCine";
import { useCerrarConAtras } from "@/lib/atras";
import { Estrellas, fechaLarga } from "./MiCine";

type Tema = "oscuro" | "claro";

export interface FichaSesion {
  sesion: Sesion;
  cine: { id: string; nombre: string; direccion?: string };
  pelicula: { titulo: string; poster?: string | null };
}

// Si hay proveedor (solo en la app), tocar una sesión abre su ficha
export const AccionSesionContext = createContext<
  ((ficha: FichaSesion) => void) | null
>(null);

export default function HojaSesion({
  ficha,
  tema,
  onCerrar,
  onGuardar,
}: {
  ficha: FichaSesion;
  tema: Tema;
  onCerrar: () => void;
  onGuardar: (ficha: FichaSesion) => void;
}) {
  useCerrarConAtras(true, onCerrar);
  const { entradas } = useMiCine();
  const { sesion, cine, pelicula } = ficha;
  const oscuro = tema === "oscuro";

  const tarifas = tarifasDeSesion(cine.nombre, sesion.fecha, sesion.formato);
  // Tus experiencias anteriores en este cine (primero las de la misma sala)
  const notasCine = entradas
    .filter(
      (e) =>
        e.cineId === cine.id &&
        (e.nota || e.butaca || Object.keys(e.valoracion ?? {}).length > 0),
    )
    .sort(
      (a, b) =>
        Number(b.sala === sesion.sala) - Number(a.sala === sesion.sala),
    )
    .slice(0, 5);

  const tarjeta = oscuro
    ? "bg-zinc-900 border-zinc-800"
    : "bg-zinc-50 border-zinc-200";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className={`relative max-h-[85vh] overflow-y-auto rounded-t-3xl border-t p-5 pb-8 ${
          oscuro ? "bg-zinc-950 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-900"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-500/40" />

        <div className="flex gap-4">
          <div
            className={`w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center ${
              oscuro ? "bg-zinc-800" : "bg-zinc-200"
            }`}
          >
            {pelicula.poster ? (
              <img src={pelicula.poster} alt="" className="w-full h-full object-cover" />
            ) : (
              <Film size={22} className="text-zinc-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black leading-tight">{pelicula.titulo}</h2>
            <p className="mt-1 text-sm text-zinc-500 flex items-center gap-1">
              <MapPin size={13} /> {cine.nombre}
            </p>
            <p className={`mt-1 text-sm font-semibold capitalize ${oscuro ? "text-amber-300" : "text-amber-700"}`}>
              {fechaLarga(sesion.fecha)} · {sesion.hora}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {[sesion.formato, sesion.sala && `Sala ${sesion.sala}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="self-start text-zinc-500">
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href={sesion.url_compra}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onCerrar}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black"
          >
            <Ticket size={16} /> Comprar
          </a>
          <button
            onClick={() => onGuardar(ficha)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              oscuro ? "border-amber-500/40 text-amber-300" : "border-amber-400 text-amber-700"
            }`}
          >
            <Plus size={16} /> Guardar entrada
          </button>
        </div>

        {tarifas.length > 0 && (
          <div className={`mt-5 rounded-xl border p-4 ${tarjeta}`}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">
              Tarifas previstas
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {tarifas.map(([etiqueta, precio]) => (
                <div key={etiqueta} className="flex justify-between">
                  <span className="text-zinc-500">{etiqueta}</span>
                  <span className="font-bold">{precio.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {notasCine.length > 0 && (
          <div className={`mt-4 rounded-xl border p-4 ${tarjeta}`}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">
              Tus notas de este cine
            </h3>
            <div className="space-y-3">
              {notasCine.map((e) => (
                <div key={e.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                    <span className="capitalize">{fechaLarga(e.fecha)}</span>
                    {e.sala && <span>· Sala {e.sala}</span>}
                    {e.butaca && <span>· Butaca {e.butaca}</span>}
                  </div>
                  <Estrellas valoracion={e.valoracion} compacto />
                  {e.nota && <p className="mt-0.5">{e.nota}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
