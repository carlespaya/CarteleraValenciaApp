"use client";

// Panel "Mi cine" de la app: perfil, calendario de los días que has ido al
// cine, lista de entradas, tus experiencias por cine y el formulario para
// guardar una entrada. Los datos viven solo en el móvil (src/lib/miCine.ts).

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Film,
  Plus,
  Star,
  X,
  MapPin,
  Trash2,
} from "lucide-react";
import {
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

type Tema = "oscuro" | "claro";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

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

  // El cine de la entrada siempre aparece en la lista, aunque hoy no tenga cartelera
  const opcionesCine = useMemo(() => {
    const lista = [...cines];
    if (e.cineId && !lista.some((c) => c.id === e.cineId)) {
      lista.unshift({ id: e.cineId, nombre: e.cineNombre ?? e.cineId });
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [cines, e.cineId, e.cineNombre]);

  const valida = !!e.pelicula?.trim() && !!e.cineId && !!e.fecha;

  function guardar() {
    if (!valida) return;
    guardarEntrada({
      ...(e as EntradaCine),
      id: e.id ?? nuevoId(),
      pelicula: e.pelicula!.trim(),
      creadaEn: e.creadaEn ?? new Date().toISOString(),
    });
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
            disabled={!valida}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

type Pestana = "calendario" | "entradas" | "cines";

export default function MiCine({
  tema,
  onCerrar,
  onEditar,
}: {
  tema: Tema;
  onCerrar: () => void;
  onEditar: (inicial: Partial<EntradaCine>) => void;
}) {
  useCerrarConAtras(true, onCerrar);
  const oscuro = tema === "oscuro";
  const { nombre, entradas } = useMiCine();
  const [pestana, setPestana] = useState<Pestana>("calendario");

  const anyoActual = fechaISO().slice(0, 4);
  const esteAnyo = entradas.filter((e) => e.fecha.startsWith(anyoActual));
  const visitasPorCine = new Map<string, number>();
  for (const e of esteAnyo) visitasPorCine.set(e.cineNombre, (visitasPorCine.get(e.cineNombre) ?? 0) + 1);
  const favorito = [...visitasPorCine.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const tarjeta = oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200";

  return (
    <div
      className={`fixed inset-0 z-[60] overflow-y-auto ${
        oscuro ? "bg-black text-white" : "bg-zinc-50 text-zinc-900"
      }`}
    >
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
              ["cines", "Cines"],
            ] as [Pestana, string][]
          ).map(([p, texto]) => (
            <button
              key={p}
              onClick={() => setPestana(p)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
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
              : `${esteAnyo.length} ${esteAnyo.length === 1 ? "película" : "películas"} en ${anyoActual}` +
                (favorito ? ` · Tu cine: ${favorito}` : "")}
          </p>
        </div>

        {pestana === "calendario" && (
          <Calendario entradas={entradas} tema={tema} onEditar={onEditar} />
        )}
        {pestana === "entradas" && (
          <ListaEntradas entradas={entradas} tema={tema} onEditar={onEditar} />
        )}
        {pestana === "cines" && <Experiencias entradas={entradas} tema={tema} />}

        {pestana === "entradas" && <CopiaSeguridad tema={tema} />}
      </main>

      <button
        onClick={() => onEditar({})}
        className="fixed bottom-6 right-5 flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3.5 text-sm font-bold text-black shadow-xl shadow-amber-500/30"
      >
        <Plus size={18} /> Añadir entrada
      </button>
    </div>
  );
}

function TarjetaEntrada({
  e,
  tema,
  onEditar,
}: {
  e: EntradaCine;
  tema: Tema;
  onEditar: (inicial: Partial<EntradaCine>) => void;
}) {
  const oscuro = tema === "oscuro";
  return (
    <button
      onClick={() => onEditar(e)}
      className={`flex w-full gap-3 rounded-2xl border p-3 text-left ${
        oscuro ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
      }`}
    >
      <div className={`w-12 h-[72px] flex-shrink-0 overflow-hidden rounded-lg flex items-center justify-center ${oscuro ? "bg-zinc-800" : "bg-zinc-200"}`}>
        {e.poster ? <img src={e.poster} alt="" className="w-full h-full object-cover" /> : <Film size={18} className="text-zinc-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">{e.pelicula}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
          <MapPin size={11} /> {e.cineNombre}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          <span className="capitalize">{fechaLarga(e.fecha)}</span>
          {e.hora && ` · ${e.hora}`}
          {e.sala && ` · Sala ${e.sala}`}
          {e.butaca && ` · ${e.butaca}`}
        </p>
        <div className="mt-1">
          <Estrellas valoracion={e.valoracion} compacto />
        </div>
        {e.nota && <p className="mt-1 line-clamp-2 text-sm">{e.nota}</p>}
      </div>
    </button>
  );
}

function Calendario({
  entradas,
  tema,
  onEditar,
}: {
  entradas: EntradaCine[];
  tema: Tema;
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
            delDia.map((e) => <TarjetaEntrada key={e.id} e={e} tema={tema} onEditar={onEditar} />)
          )}
        </div>
      )}
    </div>
  );
}

function ListaEntradas({
  entradas,
  tema,
  onEditar,
}: {
  entradas: EntradaCine[];
  tema: Tema;
  onEditar: (inicial: Partial<EntradaCine>) => void;
}) {
  if (entradas.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        Aún no has guardado ninguna entrada. Toca una sesión de la cartelera y
        elige "Guardar entrada", o usa "Añadir entrada".
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {entradas.map((e) => (
        <TarjetaEntrada key={e.id} e={e} tema={tema} onEditar={onEditar} />
      ))}
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
    return <p className="py-10 text-center text-sm text-zinc-500">Aquí verás tus experiencias en cada cine.</p>;
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
              <h3 className="font-black">{cine}</h3>
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
      setMensaje("Copia copiada. Guárdala en una nota o envíatela.");
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
