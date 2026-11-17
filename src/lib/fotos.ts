// src/lib/fotos.ts
// Fotos de las entradas (la captura del QR o una foto de la entrada en papel).
// Se reducen a un tamaño razonable y se guardan en IndexedDB, que admite
// mucho más espacio que localStorage. Solo están en el móvil.

const BD = "cinevalencia-fotos";
const ALMACEN = "fotos";
const LADO_MAXIMO = 1400; // px: suficiente para leer un QR y no ocupa casi nada

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function operar<T>(
  modo: IDBTransactionMode,
  accion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const bd = await abrir();
  return new Promise((resolve, reject) => {
    const peticion = accion(bd.transaction(ALMACEN, modo).objectStore(ALMACEN));
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Reduce la imagen y la guarda como JPEG asociada a la entrada */
export async function guardarFoto(idEntrada: string, archivo: File): Promise<void> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext("2d")!;
  ctx.fillStyle = "#fff"; // los PNG con transparencia se ven bien en JPEG
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85),
  );
  await operar("readwrite", (a) => a.put(blob, idEntrada));
}

/** URL para mostrar la foto (o null si la entrada no tiene) */
export async function urlFoto(idEntrada: string): Promise<string | null> {
  try {
    const blob = await operar<Blob | undefined>("readonly", (a) => a.get(idEntrada));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function borrarFoto(idEntrada: string): Promise<void> {
  try {
    await operar("readwrite", (a) => a.delete(idEntrada));
  } catch {
    // No había foto
  }
}
