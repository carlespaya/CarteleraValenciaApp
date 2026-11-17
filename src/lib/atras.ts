// src/lib/atras.ts
// Botón "atrás" de Android: cierra la capa abierta más reciente (ficha de
// sesión, formulario, panel "Mi cine") en vez de salir de la app.

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";

const capas: (() => void)[] = [];
let escuchando = false;

function escucharBotonAtras() {
  if (escuchando) return;
  escuchando = true;
  App.addListener("backButton", () => {
    const cerrar = capas.pop();
    if (cerrar) cerrar();
    else App.exitApp();
  }).catch(() => {
    // En el navegador no hay botón atrás de Android
  });
}

export function useCerrarConAtras(abierta: boolean, cerrar: () => void) {
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;

  useEffect(() => {
    if (!abierta) return;
    escucharBotonAtras();
    const capa = () => cerrarRef.current();
    capas.push(capa);
    return () => {
      const i = capas.lastIndexOf(capa);
      if (i >= 0) capas.splice(i, 1);
    };
  }, [abierta]);
}
