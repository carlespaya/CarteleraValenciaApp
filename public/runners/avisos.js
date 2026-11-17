// public/runners/avisos.js
// Se ejecuta en segundo plano en el móvil (plugin @capacitor/background-runner,
// cada ~3 horas aunque la app esté cerrada). Si una película de "Quiero verla"
// ha entrado en cartelera, manda una notificación una sola vez.
//
// La app le pasa la lista y la URL de los datos con el evento "guardar"; los
// guarda en CapacitorKV porque cada ejecución empieza sin memoria.

function leerKV(clave, porDefecto) {
  try {
    const guardado = CapacitorKV.get(clave);
    const texto = guardado && typeof guardado === "object" ? guardado.value : guardado;
    return texto ? JSON.parse(texto) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

// Misma idea que esMismaPelicula (src/lib/titulos.ts), sin la duración
function coincide(a, b) {
  if (a === b) return true;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  if (corta.length >= 12 && larga.includes(corta)) return true;
  return corta.length >= 6 && (larga.startsWith(corta) || larga.endsWith(corta));
}

// Identificador numérico estable de la notificación a partir del título
function idNotificacion(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h % 1000000) + 1000000;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function cuando(fechaISO) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d}`;
}

addEventListener("guardar", (resolve, reject, args) => {
  try {
    CapacitorKV.set("deseos", JSON.stringify(args.deseos || []));
    if (args.urlDatos) CapacitorKV.set("urlDatos", JSON.stringify(args.urlDatos));
    resolve();
  } catch (e) {
    reject(e);
  }
});

addEventListener("comprobar", async (resolve, reject) => {
  try {
    const deseos = leerKV("deseos", []);
    const urlDatos = leerKV("urlDatos", "");
    if (!deseos.length || !urlDatos) return resolve();

    const respuesta = await fetch(`${urlDatos}/peliculas.json`);
    if (!respuesta.ok) return resolve();
    const peliculas = await respuesta.json();

    const avisados = leerKV("avisados", []);
    // Películas ya comprobadas alguna vez. La primera comprobación es
    // silenciosa: si la marcaste estando ya en cartelera, avisar no aporta nada
    const conocidas = leerKV("conocidas", []);
    const nuevas = [];
    for (const deseo of deseos) {
      if (avisados.includes(deseo.clave)) continue;
      const primeraVez = !conocidas.includes(deseo.clave);
      if (primeraVez) conocidas.push(deseo.clave);
      const enCartelera = peliculas.find((p) => coincide(p.clave, deseo.clave));
      if (!enCartelera) continue;
      avisados.push(deseo.clave);
      if (primeraVez) continue;
      const cines = enCartelera.cines.slice(0, 3).join(", ") +
        (enCartelera.cines.length > 3 ? ` y ${enCartelera.cines.length - 3} más` : "");
      nuevas.push({
        id: idNotificacion(deseo.clave),
        title: `🎬 «${deseo.titulo}» ya está en cartelera`,
        body: `Desde el ${cuando(enCartelera.fechas[0])} en ${cines}`,
        scheduleAt: new Date(Date.now() + 2000),
      });
    }

    if (nuevas.length) CapacitorNotifications.schedule(nuevas);
    CapacitorKV.set("avisados", JSON.stringify(avisados));
    CapacitorKV.set("conocidas", JSON.stringify(conocidas));
    resolve();
  } catch (e) {
    reject(e);
  }
});
