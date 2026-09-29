// ═══ RUTAS PERSONALES v2 (telemarketing) — sin copias de clientes ══════════
// Una ruta personal guardada en userData/{uid}.rutas NO lleva datos del cliente
// (nombre, teléfono, dirección…): solo REFERENCIAS {id, section} y metadatos.
// Al mostrarla, cada parada se RESUELVE contra los registros que la persona
// tiene asignados HOY (allData ya viene acotado por Firestore). Si un cliente
// fue reasignado a otra persona, desaparece de la ruta: nunca se muestra una
// copia vieja. Las rutas globales del staff (formato histórico) no cambian.

export type Parada = { id: string; section: string };
export type RutaPersonal = {
  id: string; nombreRuta: string; createdByUid: string; createdByName: string;
  fechaCreacion: string; fechaRuta: string; estadoRuta: string;
  paradas: Parada[]; zonas: { ciudades: string[]; cps: string[] }; totalParadas: number;
  ciudad?: string; codigoPostal?: string;
};

const seccionDe = (p: any) => String(p?._tipo || p?._origen || p?.section || "");

// Lo que llega de RutaCrear → lo que se GUARDA (solo referencias + metadatos de zona).
export function rutaPersonalV2(ruta: any, autor: { uid: string; nombre: string }, id: string, nowISO: string): RutaPersonal {
  const stops = [...(ruta?.clientes || []), ...(ruta?.referidos || [])].filter((p: any) => p && p.id != null);
  const out: RutaPersonal = {
    id,
    nombreRuta: String(ruta?.nombreRuta || "").trim(),
    createdByUid: autor.uid,
    createdByName: autor.nombre,
    fechaCreacion: nowISO,
    fechaRuta: ruta?.fechaRuta || nowISO.slice(0, 10),
    estadoRuta: "pendiente",
    paradas: stops.map((p: any) => ({ id: String(p.id), section: seccionDe(p) })),
    zonas: {
      ciudades: [...new Set(stops.map((p: any) => String(p.ciudad || "").trim()).filter(Boolean))],
      cps: [...new Set(stops.map((p: any) => String(p.cp || "").trim()).filter(Boolean))],
    },
    totalParadas: stops.length,
  };
  if (ruta?.ciudad) out.ciudad = ruta.ciudad;               // filtro con el que se armó (zona, no PII)
  if (ruta?.codigoPostal) out.codigoPostal = ruta.codigoPostal;
  return out;
}

// Ruta guardada + candidatos AUTORIZADOS hoy → ruta para pintar (formato que ya usa la pantalla).
// candidatos = recolectarParaRutas(allData): {id, _tipo, nombre, telefono, direccion, …}
export function resolverRutaPersonal(ruta: any, candidatos: any[]) {
  const porClave = new Map<string, any>();
  (candidatos || []).forEach((c: any) => { if (c && c.id != null) porClave.set(`${seccionDe(c)}|${c.id}`, c); });
  const vivos: any[] = [];
  let faltantes = 0;
  (Array.isArray(ruta?.paradas) ? ruta.paradas : []).forEach((p: any) => {
    const c = porClave.get(`${p?.section}|${p?.id}`);
    if (c) vivos.push(c); else faltantes++;
  });
  const { paradas: _p, ...meta } = ruta || {};
  return {
    ...meta,
    paradas: ruta?.paradas || [],
    clientes: vivos.filter((c) => seccionDe(c) !== "referidos"),
    referidos: vivos.filter((c) => seccionDe(c) === "referidos"),
    _faltantes: faltantes,
  };
}
