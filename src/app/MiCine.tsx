"use client";

// Panel "Mi cine" de la app: perfil, calendario de los días que has ido al
// cine, tus entradas (con diseño de ticket y la foto del QR), la lista
// "Quiero ver", el resumen "Mi año en el cine" y el formulario para guardar
// una entrada. Los datos viven solo en el móvil (src/lib/miCine.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  alternarDeseo,
  borrarEntrada,
  cambiarNombre,
  exportarMiCine,
  guardarEntrada,
  importarMiCine,
  nuevoId,
  useMiCine,
  type EntradaCine,
  type Valoracion,
} from "@/lib/miCine";
import { useCerrarConAtras } from "@/lib/atras";
import { fechaISO } from "@/lib/fechas";
import { generosDe } from "@/lib/generos";
import { normalizarTitulo } from "@/lib/titulos";
import { borrarFoto, guardarFoto, urlFoto } from "@/lib/fotos";
import { cancelarRecordatorio, pedirPermisoAvisos, programarRecordatorio } from "@/lib/avisos";
import { compartirImagen, dibujarResumen, dibujarTicket } from "@/lib/compartir";

type Tema = "oscuro" | "claro";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_SEMANA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const DURACION_TIPICA = 110; // minutos, si no sabemos lo que duró

const ASPECTOS: { clave: keyof Valoracion; etiqueta: string }[] = [
  { clave: "pantalla", etiqueta: "Pantalla" },
  { clave: "sonido", etiqueta: "Sonido" },
  { clave: "comodidad", etiqueta: "Comodidad" },
];

/** "2026-11-17" → "martes, 17 de noviembre" */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Tus valoraciones (de 1 a 5) de una entrada, en una línea */
export function Estrellas({
  valoracion,
  compacto = false,
}: {
  valoracion?: Valoracion;
  compacto?: boolean;
}) {
  const puntos = ASPECTOS.filter((a) => valoracion?.[a.clave]);
  if (puntos.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-x-3 ${compacto ? "text-xs" : "text-sm"} text-zinc-500`}>
      {puntos.map((a) => (
        <span key={a.clave} className="flex items-center gap-1">
          {a.etiqueta}
          <Star size={11} className="fill-amber-400 text-amber-400" />
          {valoracion![a.clave]}
        </span>
      ))}
    </div>
  );
}

// "Entrada nº 3 de 2026": posición de la entrada dentro de su año
function numeroEntrada(e: EntradaCine, entradas: EntradaCine[]): string {
  const anyo = e.fecha.slice(0, 4);
  const delAnyo = entradas
    .filter((x) => x.fecha.startsWith(anyo))
    .sort((a, b) => `${a.fecha} ${a.hora ?? ""}`.localeCompare(`${b.fecha} ${b.hora ?? ""}`));
  return `Entrada nº ${delAnyo.findIndex((x) => x.id === e.id) + 1} de ${anyo}`;
}

function detalleEntrada(e: EntradaCine): string {
  return [e.hora, e.sala && `Sala ${e.sala}`, e.butaca && `Butaca ${e.butaca}`, e.formato]
    .filter(Boolean)
    .join(" · ");
}

function useUrlFoto(e: EntradaCine | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!e?.tieneFoto) return setUrl(null);
    let cancelado = false;
    let creada: string | null = null;
    urlFoto(e.id).then((u) => {
      creada = u;
      if (!cancelado) setUrl(u);
    });
    return () => {
      cancelado = true;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [e?.id, e?.tieneFoto]);
  return url;
}

// ─── Formulario de entrada ────────────────────────────────────────────────────

export function FormEntrada({
  inicial,
  cines,
  tema,
  onCerrar,
}: {
  inicial: Partial<EntradaCine>;
  cines: { id: string; nombre: string }[];
  tema: Tema;
  onCerrar: () => void;
}) {
  useCerrarConAtras(true, onCerrar);
  const oscuro = tema === "oscuro";
  const [e, setE] = useState<Partial<EntradaCine>>({
    fecha: fechaISO(),
    ...inicial,
  });
  const editando = !!inicial.id;
  const cambiar = (cambios: Partial<EntradaCine>) => setE((x) => ({ ...x, ...cambios }));

  // Foto de la entrada: la guardada, una nueva elegida o quitada
  const fotoGuardada = useUrlFoto(editando ? (inicial as EntradaCine) : null);
  const [fotoNueva, setFotoNueva] = useState<File | null>(null);
  const [fotoQuitada, setFotoQuitada] = useState(false);
  const urlFotoNueva = useMemo(() => (fotoNueva ? URL.createObjectURL(fotoNueva) : null), [fotoNueva]);
  const vistaFoto = urlFotoNueva ?? (fotoQuitada ? null : fotoGuardada);
  const selectorFoto = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);

  // El cine de la entrada siempre aparece en la lista, aunque hoy no tenga cartelera
  const opcionesCine = useMemo(() => {
    const lista = [...cines];
    if (e.cineId && !lista.some((c) => c.id === e.cineId)) {
      lista.unshift({ id: e.cineId, nombre: e.cineNombre ?? e.cineId });
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [cines, e.cineId, e.cineNombre]);

  const valida = !!e.pelicula?.trim() && !!e.cineId && !!e.fecha;

  async function guardar() {
    if (!valida || guardando) return;
    setGuardando(true);
    const id = e.id ?? nuevoId();
    let tieneFoto = !!e.tieneFoto && !fotoQuitada;
    try {
      if (fotoNueva) {
        await guardarFoto(id, fotoNueva);
        tieneFoto = true;
      } else if (fotoQuitada) {
        await borrarFoto(id);
      }
    } catch (error) {
      console.error("guardarFoto", error);
      alert("No se pudo guardar la foto; el resto de la entrada sí se guarda.");
    }
    const entrada: EntradaCine = {
      ...(e as EntradaCine),
      id,
      pelicula: e.pelicula!.trim(),
      tieneFoto,
      creadaEn: e.creadaEn ?? new Date().toISOString(),
    };
    guardarEntrada(entrada);
    programarRecordatorio(entrada);
    onCerrar();
  }

  const campo = `w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
    oscuro
      ? "bg-zinc-900 border-zinc-800 text-white focus:border-amber-400/50"
      : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-amber-400"
  }`;
  const etiqueta = "mb-1 block text-xs font-semibold text-zinc-500";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/60" />
      <div
        className={`relative max-h-[92vh] overflow-y-auto rounded-t-3xl border-t p-5 pb-8 ${
          oscuro ? "bg-zinc-950 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-900"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">{editando ? "Editar entrada" : "Guardar entrada"}</h2>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-zinc-500">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={etiqueta}>Película</label>
            <input className={campo} value={e.pelicula ?? ""} onChange={(x) => cambiar({ pelicula: x.target.value })} placeholder="Título" />
          </div>
          <div>
            <label className={etiqueta}>Cine</label>
            <select
              className={campo}
              value={e.cineId ?? ""}
              onChange={(x) => {
                const cine = opcionesCine.find((c) => c.id === x.target.value);
                cambiar({ cineId: cine?.id, cineNombre: cine?.nombre });
              }}
            >
              <option value="" disabled>Elige un cine</option>
              {opcionesCine.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Día</label>
              <input type="date" className={campo} value={e.fecha ?? ""} onChange={(x) => cambiar({ fecha: x.target.value })} />
            </div>
            <div>
              <label className={etiqueta}>Hora</label>
              <input type="time" className={campo} value={e.hora ?? ""} onChange={(x) => cambiar({ hora: x.target.value })} />
            </div>
            <div>
              <label className={etiqueta}>Sala</label>
              <input className={campo} value={e.sala ?? ""} onChange={(x) => cambiar({ sala: x.target.value })} placeholder="Ej. 5" />
            </div>
            <div>
              <label className={etiqueta}>Butaca</label>
              <input className={campo} value={e.butaca ?? ""} onChange={(x) => cambiar({ butaca: x.target.value })} placeholder="Ej. F12" />
            </div>
          </div>

          {/* Foto de la entrada (QR) */}
          <div>
            <label className={etiqueta}>Tu entrada (captura del QR o foto)</label>
            <input
              ref={selectorFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (x) => {
                const entrada = x.target;
                const archivo = entrada.files?.[0];
                if (archivo) {
                  try {
                    // Copia en memoria: en Android el permiso para leer el
                    // archivo elegido puede caducar antes de pulsar Guardar
                    const copia = new File([await archivo.arrayBuffer()], archivo.name, {
                      type: archivo.type || "image/jpeg",
                    });
                    setFotoNueva(copia);
                    setFotoQuitada(false);
                  } catch {
                    alert("No se pudo abrir esa imagen. Prueba con otra.");
                  }
                }
                entrada.value = "";
              }}
            />
            {vistaFoto ? (
              <div className="relative">
                <img src={vistaFoto} alt="Tu entrada" className="max-h-64 w-full rounded-xl bg-white object-contain" />
                <button
                  aria-label="Quitar foto"
                  onClick={() => {
                    setFotoNueva(null);
                    setFotoQuitada(true);
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => selectorFoto.current?.click()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm ${
                  oscuro ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-500"
                }`}
              >
                <Camera size={18} /> Añadir foto de la entrada
              </button>
            )}
          </div>

          <div>
            <label className={etiqueta}>Tu experiencia (solo la ves tú)</label>
            <div className={`rounded-xl border p-3 space-y-2 ${oscuro ? "border-zinc-800" : "border-zinc-200"}`}>
              {ASPECTOS.map((a) => (
                <div key={a.clave} className="flex items-center justify-between">
                  <span className="text-sm">{a.etiqueta}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const activa = (e.valoracion?.[a.clave] ?? 0) >= n;
                      return (
                        <button
                          key={n}
                          aria-label={`${a.etiqueta}: ${n}`}
                          onClick={() =>
                            cambiar({
                              valoracion: {
                                ...e.valoracion,
                                // Tocar la misma estrella otra vez la quita
                                [a.clave]: e.valoracion?.[a.clave] === n ? undefined : n,
                              },
                            })
                          }
                          className="p-0.5"
                        >
                          <Star size={22} className={activa ? "fill-amber-400 text-amber-400" : "text-zinc-500"} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={etiqueta}>Notas</label>
            <textarea
              className={`${campo} min-h-[80px]`}
              value={e.nota ?? ""}
              onChange={(x) => cambiar({ nota: x.target.value })}
              placeholder="Ej. Desde la fila F se ve la pantalla cortada; mejor centro y más atrás"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          {editando && (
            <button
              aria-label="Borrar entrada"
              onClick={() => {
                if (confirm("¿Borrar esta entrada?")) {
                  borrarEntrada(e.id!);
                  borrarFoto(e.id!);
                  cancelarRecordatorio(e.id!);
                  onCerrar();
                }
              }}
              className="rounded-xl border border-red-500/40 px-4 py-3 text-red-500"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={guardar}
            disabled={!valida || guardando}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket ───────────────────────────────────────────────────────────────────

/** Una entrada con aspecto de ticket de cine */
function Ticket({
  e,
  numero,
  tema,
  onAbrir,
}: {
  e: EntradaCine;
  numero: string;
  tema: Tema;
  onAbrir?: () => void;
}) {
  const oscuro = tema === "oscuro";
  const fondoPagina = oscuro ? "bg-black" : "bg-zinc-50";
  return (
    <button
      onClick={onAbrir}
      disabled={!onAbrir}
      className="relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-[2px] text-left"
    >
      <div className={`relative overflow-hidden rounded-[14px] ${oscuro ? "bg-zinc-900" : "bg-white"}`}>
        {/* Póster de fondo, difuminado */}
        {e.poster && (
          <img
            src={e.poster}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-md"
          />
        )}
        <div className="relative flex gap-3 p-4">
          <div className={`h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center ${oscuro ? "bg-zinc-800" : "bg-zinc-200"}`}>
            {e.poster ? <img src={e.poster} alt="" className="h-full w-full object-cover" /> : <Film size={20} className="text-zinc-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Entrada de cine</p>
            <p className="mt-0.5 text-lg font-black leading-tight">{e.pelicula}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              <MapPin size={11} /> {e.cineNombre}
            </p>
          </div>
        </div>
        {/* Troquelado */}
        <div className="relative h-0">
          <span className={`absolute -left-3 -top-3 h-6 w-6 rounded-full ${fondoPagina}`} />
          <span className={`absolute -right-3 -top-3 h-6 w-6 rounded-full ${fondoPagina}`} />
          <div className="mx-4 border-t-2 border-dashed border-zinc-500/40" />
        </div>
        <div className="relative px-4 py-3">
          <p className={`text-sm font-bold capitalize ${oscuro ? "text-amber-300" : "text-amber-700"}`}>
            {fechaLarga(e.fecha)}
          </p>
          {detalleEntrada(e) && <p className="text-xs text-zinc-500">{detalleEntrada(e)}</p>}
          <div className="mt-1 flex items-center justify-between gap-2">
            <Estrellas valoracion={e.valoracion} compacto />
            <span className="ml-auto text-[10px] text-zinc-500">{numero}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

/** Entrada a pantalla completa: ticket, foto del QR, compartir y editar */
function VistaEntrada({
  e,
  numero,
  tema,
  onCerrar,
  onEditar,
}: {
  e: EntradaCine;
  numero: string;
  tema: Tema;
  onCerrar: () => void;
  onEditar: () => void;
}) {
  useCerrarConAtras(true, onCerrar);
  const oscuro = tema === "oscuro";
  const foto = useUrlFoto(e);

  async function compartir() {
    try {
      await compartirImagen(
        dibujarTicket({
          pelicula: e.pelicula,
          cine: e.cineNombre,
          fechaLarga: fechaLarga(e.fecha),
          detalle: detalleEntrada(e),
          numero,
        }),
        `entrada-${e.id}`,
        `He visto «${e.pelicula}» en ${e.cineNombre} 🎬`,
      );
    } catch {
      // Compartir cancelado
    }
  }

  return (
    <div className={`fixed inset-0 z-[75] overflow-y-auto ${oscuro ? "bg-black text-white" : "bg-zinc-50 text-zinc-900"}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <button aria-label="Volver" onClick={onCerrar} className="p-1 text-zinc-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex gap-2">
          <button onClick={compartir} className="flex items-center gap-1.5 rounded-xl border border-amber-500/50 px-3 py-2 text-sm font-semibold text-amber-500">
            <Share2 size={15} /> Compartir
          </button>
          <button onClick={onEditar} className="flex items-center gap-1.5 rounded-xl border border-zinc-500/40 px-3 py-2 text-sm font-semibold text-zinc-500">
            <Pencil size={15} /> Editar
          </button>
        </div>
      </div>
      <div className="px-4 pb-10">
        <Ticket e={e} numero={numero} tema={tema} />
        {foto ? (
          <div className="mt-5">
            <p className="mb-2 text-center text-xs text-zinc-500">Muéstrala en la puerta del cine</p>
            <img src={foto} alt="Tu entrada" className="w-full rounded-2xl bg-white object-contain" />
          </div>
        ) : (
          <button
            onClick={onEditar}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-500/40 p-5 text-sm text-zinc-500"
          >
            <Camera size={18} /> Añade la foto o captura del QR
          </button>
        )}
        {e.nota && (
          <div className={`mt-5 rounded-2xl border p-4 text-sm ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
            {e.nota}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

type Pestana = "calendario" | "entradas" | "quiero" | "anyo";

export default function MiCine({
  tema,
  urlDatos,
  onCerrar,
  onEditar,
}: {
  tema: Tema;
  urlDatos: string;
  onCerrar: () => void;
  onEditar: (inicial: Partial<EntradaCine>) => void;
}) {
  useCerrarConAtras(true, onCerrar);
  const oscuro = tema === "oscuro";
  const { nombre, entradas } = useMiCine();
  const [pestana, setPestana] = useState<Pestana>("calendario");
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const abierta = entradas.find((e) => e.id === abiertaId) ?? null;

  const anyoActual = fechaISO().slice(0, 4);
  const esteAnyo = entradas.filter((e) => e.fecha.startsWith(anyoActual));
  const tarjeta = oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200";

  const ticket = (e: EntradaCine) => (
    <Ticket key={e.id} e={e} numero={numeroEntrada(e, entradas)} tema={tema} onAbrir={() => setAbiertaId(e.id)} />
  );

  return (
    <div className={`fixed inset-0 z-[60] overflow-y-auto ${oscuro ? "bg-black text-white" : "bg-zinc-50 text-zinc-900"}`}>
      <header
        className={`sticky top-0 z-10 border-b px-4 py-3 backdrop-blur-2xl ${
          oscuro ? "bg-black/80 border-white/5" : "bg-white/80 border-zinc-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <button aria-label="Volver" onClick={onCerrar} className="p-1 text-zinc-500">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black tracking-tight">
            Mi <span className={oscuro ? "text-amber-400" : "text-amber-600"}>cine</span>
          </h1>
        </div>

        <div className={`mt-3 flex gap-1 rounded-xl border p-1 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-zinc-100 border-zinc-200"}`}>
          {(
            [
              ["calendario", "Calendario"],
              ["entradas", "Entradas"],
              ["quiero", "Quiero ver"],
              ["anyo", "Mi año"],
            ] as [Pestana, string][]
          ).map(([p, texto]) => (
            <button
              key={p}
              onClick={() => setPestana(p)}
              className={`flex-1 rounded-lg border px-1 py-2 text-[13px] font-semibold ${
                pestana === p
                  ? oscuro
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-amber-100 text-amber-700 border-amber-400"
                  : "text-zinc-500 border-transparent"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pt-4 pb-28">
        {/* Perfil */}
        <div className={`mb-4 rounded-2xl border p-4 ${tarjeta}`}>
          <input
            value={nombre}
            onChange={(x) => cambiarNombre(x.target.value)}
            placeholder="Tu nombre"
            className="w-full bg-transparent text-lg font-black placeholder-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-sm text-zinc-500">
            {esteAnyo.length === 0
              ? `Aún no has guardado ninguna película en ${anyoActual}`
              : `${esteAnyo.length} ${esteAnyo.length === 1 ? "película" : "películas"} en ${anyoActual}`}
          </p>
        </div>

        {pestana === "calendario" && <Calendario entradas={entradas} tema={tema} ticket={ticket} onEditar={onEditar} />}
        {pestana === "entradas" && (
          <>
            {entradas.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Aún no has guardado ninguna entrada. Toca una sesión de la cartelera y
                elige "Guardar entrada", o usa "Añadir entrada".
              </p>
            ) : (
              <div className="space-y-4">{entradas.map(ticket)}</div>
            )}
            <CopiaSeguridad tema={tema} />
          </>
        )}
        {pestana === "quiero" && <QuieroVer tema={tema} urlDatos={urlDatos} />}
        {pestana === "anyo" && <MiAnyo entradas={entradas} tema={tema} />}
      </main>

      {pestana !== "quiero" && (
        <button
          onClick={() => onEditar({})}
          className="fixed bottom-6 right-5 flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3.5 text-sm font-bold text-black shadow-xl shadow-amber-500/30"
        >
          <Plus size={18} /> Añadir entrada
        </button>
      )}

      {abierta && (
        <VistaEntrada
          e={abierta}
          numero={numeroEntrada(abierta, entradas)}
          tema={tema}
          onCerrar={() => setAbiertaId(null)}
          onEditar={() => onEditar(abierta)}
        />
      )}
    </div>
  );
}

function Calendario({
  entradas,
  tema,
  ticket,
  onEditar,
}: {
  entradas: EntradaCine[];
  tema: Tema;
  ticket: (e: EntradaCine) => JSX.Element;
  onEditar: (inicial: Partial<EntradaCine>) => void;
}) {
  const oscuro = tema === "oscuro";
  const hoy = fechaISO();
  const [mes, setMes] = useState(hoy.slice(0, 7)); // AAAA-MM
  const [diaElegido, setDiaElegido] = useState<string | null>(null);

  const [anyo, numMes] = mes.split("-").map(Number);
  const primerDia = (new Date(anyo, numMes - 1, 1).getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(anyo, numMes, 0).getDate();

  const porDia = new Map<string, EntradaCine[]>();
  for (const e of entradas) {
    if (e.fecha.startsWith(mes)) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  }

  function moverMes(delta: number) {
    const d = new Date(anyo, numMes - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setDiaElegido(null);
  }

  const delDia = diaElegido ? porDia.get(diaElegido) ?? [] : [];

  return (
    <div>
      <div className={`rounded-2xl border p-4 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
        <div className="mb-3 flex items-center justify-between">
          <button aria-label="Mes anterior" onClick={() => moverMes(-1)} className="p-1 text-zinc-500">
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold capitalize">
            {MESES[numMes - 1]} {anyo}
          </span>
          <button aria-label="Mes siguiente" onClick={() => moverMes(1)} className="p-1 text-zinc-500">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS_CORTOS.map((d) => (
            <span key={d} className="pb-1 text-[11px] font-semibold text-zinc-500">{d}</span>
          ))}
          {Array.from({ length: primerDia }, (_, i) => <span key={`v${i}`} />)}
          {Array.from({ length: diasMes }, (_, i) => {
            const dia = `${mes}-${String(i + 1).padStart(2, "0")}`;
            const visitas = porDia.get(dia)?.length ?? 0;
            const elegido = dia === diaElegido;
            return (
              <button
                key={dia}
                onClick={() => setDiaElegido(elegido ? null : dia)}
                className={`relative aspect-square rounded-lg text-sm font-semibold ${
                  visitas
                    ? elegido
                      ? "bg-amber-500 text-black"
                      : oscuro
                        ? "bg-amber-500/25 text-amber-200"
                        : "bg-amber-100 text-amber-800"
                    : elegido
                      ? oscuro ? "bg-zinc-800" : "bg-zinc-200"
                      : ""
                } ${dia === hoy ? "ring-1 ring-amber-500/60" : ""}`}
              >
                {i + 1}
                {visitas > 1 && (
                  <span className="absolute right-1 top-0.5 text-[9px] font-black">{visitas}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {diaElegido && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold capitalize text-zinc-500">{fechaLarga(diaElegido)}</p>
          {delDia.length === 0 ? (
            <button
              onClick={() => onEditar({ fecha: diaElegido })}
              className="w-full rounded-2xl border border-dashed border-zinc-500/40 p-4 text-sm text-zinc-500"
            >
              Ese día no fuiste al cine. ¿Añadir una entrada?
            </button>
          ) : (
            delDia.map(ticket)
          )}
        </div>
      )}
    </div>
  );
}

// ─── Quiero ver ───────────────────────────────────────────────────────────────

interface PeliculaPublicada {
  clave: string;
  titulo: string;
  fechas: string[];
  cines: string[];
}

function QuieroVer({ tema, urlDatos }: { tema: Tema; urlDatos: string }) {
  const oscuro = tema === "oscuro";
  const { deseos } = useMiCine();
  const [publicadas, setPublicadas] = useState<PeliculaPublicada[] | null>(null);
  const [titulo, setTitulo] = useState("");

  useEffect(() => {
    fetch(`${urlDatos}/peliculas.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPublicadas)
      .catch(() => setPublicadas([]));
  }, [urlDatos]);

  // Misma regla que la app usa para unir títulos (sin la duración)
  const enCartelera = (clave: string) =>
    publicadas?.find((p) => {
      if (p.clave === clave) return true;
      const [corta, larga] = p.clave.length <= clave.length ? [p.clave, clave] : [clave, p.clave];
      return (corta.length >= 12 && larga.includes(corta)) ||
        (corta.length >= 6 && (larga.startsWith(corta) || larga.endsWith(corta)));
    });

  function anadir() {
    const limpio = titulo.trim();
    if (!limpio) return;
    const clave = normalizarTitulo(limpio);
    if (!deseos.some((d) => d.clave === clave)) {
      alternarDeseo({ clave, titulo: limpio });
      pedirPermisoAvisos();
    }
    setTitulo("");
  }

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500">
        Te avisaremos con una notificación cuando entren en cartelera. Añádelas desde la
        ficha de una película o escribiendo el título de un próximo estreno.
      </p>
      <div className="mb-4 flex gap-2">
        <input
          value={titulo}
          onChange={(x) => setTitulo(x.target.value)}
          onKeyDown={(x) => x.key === "Enter" && anadir()}
          placeholder="Título de la película"
          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
            oscuro ? "bg-zinc-900 border-zinc-800 text-white" : "bg-white border-zinc-200"
          }`}
        />
        <button onClick={anadir} disabled={!titulo.trim()} className="rounded-xl bg-amber-500 px-4 text-sm font-bold text-black disabled:opacity-40">
          Añadir
        </button>
      </div>

      {deseos.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Tu lista está vacía.</p>
      ) : (
        <div className="space-y-3">
          {deseos.map((d) => {
            const publicada = enCartelera(d.clave);
            return (
              <div key={d.clave} className={`flex items-center gap-3 rounded-2xl border p-3 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
                <div className={`h-16 w-11 flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center ${oscuro ? "bg-zinc-800" : "bg-zinc-200"}`}>
                  {d.poster ? <img src={d.poster} alt="" className="h-full w-full object-cover" /> : <Bookmark size={16} className="text-zinc-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{d.titulo}</p>
                  {publicadas === null ? (
                    <p className="text-xs text-zinc-500">Comprobando…</p>
                  ) : publicada ? (
                    <p className={`text-xs font-semibold ${oscuro ? "text-amber-300" : "text-amber-700"}`}>
                      En cartelera desde el <span className="capitalize">{fechaLarga(publicada.fechas[0])}</span> ·{" "}
                      {publicada.cines.length} {publicada.cines.length === 1 ? "cine" : "cines"}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500">Aún no está en cartelera</p>
                  )}
                </div>
                <button aria-label="Quitar de la lista" onClick={() => alternarDeseo(d)} className="p-1 text-zinc-500">
                  <X size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mi año en el cine ────────────────────────────────────────────────────────

function masRepetido<T>(valores: T[]): [T, number] | null {
  const cuenta = new Map<T, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  const [mejor] = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  return mejor ?? null;
}

function MiAnyo({ entradas, tema }: { entradas: EntradaCine[]; tema: Tema }) {
  const oscuro = tema === "oscuro";
  const anyos = Array.from(new Set([fechaISO().slice(0, 4), ...entradas.map((e) => e.fecha.slice(0, 4))])).sort();
  const [anyo, setAnyo] = useState(anyos[anyos.length - 1]);
  const delAnyo = entradas
    .filter((e) => e.fecha.startsWith(anyo))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const minutos = delAnyo.reduce((n, e) => n + (e.duracion ?? DURACION_TIPICA), 0);
  const estimado = delAnyo.some((e) => !e.duracion);
  const cines = new Set(delAnyo.map((e) => e.cineNombre));
  const vose = delAnyo.filter((e) => e.formato?.toUpperCase().includes("VOSE")).length;

  const cineFavorito = masRepetido(delAnyo.map((e) => e.cineNombre));
  const salaFavorita = masRepetido(delAnyo.filter((e) => e.sala).map((e) => `la sala ${e.sala} de ${e.cineNombre}`));
  const mesFavorito = masRepetido(delAnyo.map((e) => Number(e.fecha.slice(5, 7)) - 1));
  const generoFavorito = masRepetido(delAnyo.flatMap((e) => generosDe(e.genero)));
  const diaFavorito = masRepetido(
    delAnyo.map((e) => {
      const [a, m, d] = e.fecha.split("-").map(Number);
      return new Date(a, m - 1, d).getDay();
    }),
  );

  const cifras: [string, string][] = [
    [String(delAnyo.length), delAnyo.length === 1 ? "película" : "películas"],
    [`${estimado ? "≈" : ""}${Math.round(minutos / 60)} h`, "en la butaca"],
    [String(cines.size), cines.size === 1 ? "cine" : "cines distintos"],
    [String(vose), "en versión original"],
  ];
  const frases = [
    cineFavorito && `Tu cine: ${cineFavorito[0]} (${cineFavorito[1]} ${cineFavorito[1] === 1 ? "vez" : "veces"})`,
    salaFavorita && salaFavorita[1] > 1 && `Tu sitio: ${salaFavorita[0]}`,
    generoFavorito && `Lo que más ves: ${generoFavorito[0].toLowerCase()}`,
    mesFavorito && `Tu mes más cinéfilo: ${MESES[mesFavorito[0]]}`,
    diaFavorito && `Te gustan los ${DIAS_SEMANA[diaFavorito[0]]}`,
    delAnyo[0] && `Empezaste el año con «${delAnyo[0].pelicula}»`,
  ].filter(Boolean) as string[];

  async function compartir() {
    try {
      await compartirImagen(dibujarResumen({ anyo, cifras, frases }), `mi-anyo-${anyo}`, `Mi año en el cine ${anyo} 🎬`);
    } catch {
      // Compartir cancelado
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          aria-label="Año anterior"
          disabled={anyos.indexOf(anyo) <= 0}
          onClick={() => setAnyo(anyos[anyos.indexOf(anyo) - 1])}
          className="p-1 text-zinc-500 disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-black">
          Mi año en el cine <span className="text-amber-500">{anyo}</span>
        </h2>
        <button
          aria-label="Año siguiente"
          disabled={anyos.indexOf(anyo) >= anyos.length - 1}
          onClick={() => setAnyo(anyos[anyos.indexOf(anyo) + 1])}
          className="p-1 text-zinc-500 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {delAnyo.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Guarda tus entradas y aquí verás tu resumen del año.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {cifras.map(([valor, etiqueta]) => (
              <div key={etiqueta} className={`rounded-2xl border p-4 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
                <p className="text-3xl font-black text-amber-500">{valor}</p>
                <p className="text-xs text-zinc-500">{etiqueta}</p>
              </div>
            ))}
          </div>
          <ul className={`mt-3 space-y-2 rounded-2xl border p-4 text-sm ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
            {frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button onClick={compartir} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black">
            <Share2 size={16} /> Compartir mi año
          </button>
        </>
      )}

      <h3 className="mb-3 mt-8 font-black">Tus cines</h3>
      <Experiencias entradas={entradas} tema={tema} />
    </div>
  );
}

// Tus experiencias agrupadas por cine: visitas, media de tus valoraciones y notas
function Experiencias({ entradas, tema }: { entradas: EntradaCine[]; tema: Tema }) {
  const oscuro = tema === "oscuro";
  const porCine = new Map<string, EntradaCine[]>();
  for (const e of entradas) porCine.set(e.cineNombre, [...(porCine.get(e.cineNombre) ?? []), e]);
  const cines = [...porCine.entries()].sort((a, b) => b[1].length - a[1].length);

  if (cines.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">Aquí verás tus experiencias en cada cine.</p>;
  }

  const media = (lista: EntradaCine[], clave: keyof Valoracion) => {
    const valores = lista.map((e) => e.valoracion?.[clave]).filter((v): v is number => !!v);
    return valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10 : undefined;
  };

  return (
    <div className="space-y-4">
      {cines.map(([cine, lista]) => {
        const medias: Valoracion = {
          pantalla: media(lista, "pantalla"),
          sonido: media(lista, "sonido"),
          comodidad: media(lista, "comodidad"),
        };
        const conNotas = lista.filter((e) => e.nota || e.butaca);
        return (
          <div key={cine} className={`rounded-2xl border p-4 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-black">{cine}</h4>
              <span className="text-xs text-zinc-500">
                {lista.length} {lista.length === 1 ? "visita" : "visitas"}
              </span>
            </div>
            <div className="mt-1">
              <Estrellas valoracion={medias} compacto />
            </div>
            {conNotas.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-zinc-500/20 pt-3">
                {conNotas.map((e) => (
                  <div key={e.id} className="text-sm">
                    <p className="text-xs text-zinc-500">
                      {[e.sala && `Sala ${e.sala}`, e.butaca && `Butaca ${e.butaca}`, e.pelicula]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {e.nota && <p>{e.nota}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CopiaSeguridad({ tema }: { tema: Tema }) {
  const oscuro = tema === "oscuro";
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function exportar() {
    const copia = exportarMiCine();
    try {
      await navigator.clipboard.writeText(copia);
      setMensaje("Copia copiada. Guárdala en una nota o envíatela. (Las fotos de las entradas no se incluyen.)");
    } catch {
      setTexto(copia);
      setMensaje("Copia este texto y guárdalo en un lugar seguro.");
    }
  }

  function importar() {
    try {
      const nuevas = importarMiCine(texto.trim());
      setMensaje(`${nuevas} ${nuevas === 1 ? "entrada recuperada" : "entradas recuperadas"}.`);
      setTexto("");
    } catch {
      setMensaje("Ese texto no es una copia de seguridad válida.");
    }
  }

  return (
    <div className={`mt-8 rounded-2xl border p-4 ${oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
      <h3 className="font-bold">Copia de seguridad</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Tus datos solo están en este móvil. Si desinstalas la app o cambias de
        móvil, exporta antes la copia y luego pégala aquí.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={exportar} className="flex-1 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-black">
          Exportar
        </button>
        <button
          onClick={importar}
          disabled={!texto.trim()}
          className="flex-1 rounded-xl border border-amber-500/50 px-3 py-2.5 text-sm font-bold text-amber-500 disabled:opacity-40"
        >
          Importar
        </button>
      </div>
      <textarea
        value={texto}
        onChange={(x) => setTexto(x.target.value)}
        placeholder="Pega aquí una copia para importarla"
        className={`mt-3 min-h-[70px] w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
          oscuro ? "bg-black border-zinc-800 text-white" : "bg-zinc-50 border-zinc-200"
        }`}
      />
      {mensaje && <p className="mt-2 text-xs text-amber-500">{mensaje}</p>}
    </div>
  );
}
