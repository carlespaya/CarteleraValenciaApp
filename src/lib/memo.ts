// src/lib/memo.ts
// Memoiza el resultado de una función asíncrona durante un tiempo.
// Si varias llamadas piden la misma clave a la vez, comparten la misma promesa:
// así refrescar los 7 días no repite 7 veces la misma descarga (FilmAffinity,
// Yelmo, Ocine… devuelven todos los días de una sola vez).

type Entrada =
  | { valor: unknown; expira: number }
  | { enCurso: Promise<unknown> };

// En globalThis para que el estado sea único aunque Next cargue el módulo
// desde varios bundles (rutas, instrumentation) o lo recargue en desarrollo.
const g = globalThis as typeof globalThis & { __memo?: Map<string, Entrada> };
const store = (g.__memo ??= new Map<string, Entrada>());

export function memoizar<T>(
  clave: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const entrada = store.get(clave);
  if (entrada) {
    if ("enCurso" in entrada) return entrada.enCurso as Promise<T>;
    if (entrada.expira > Date.now()) return Promise.resolve(entrada.valor as T);
  }

  const enCurso = fn().then(
    (valor) => {
      store.set(clave, { valor, expira: Date.now() + ttlMs });
      return valor;
    },
    (error) => {
      // Los errores no se guardan: la próxima llamada lo reintenta
      store.delete(clave);
      throw error;
    },
  );
  store.set(clave, { enCurso });
  return enCurso;
}

export function olvidar(clave: string) {
  store.delete(clave);
}
