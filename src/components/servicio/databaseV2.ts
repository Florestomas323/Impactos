// ═══ BASE DE DATOS v2 — lógica pura (ACCESS_V2) ═════════════════════════════
// Búsqueda, filtros, paginación, duplicados (aviso con motivo real), acciones por rol y
// venta desde la tarjeta del cliente. Sin React, sin Firestore: todo testeable.
// NO reemplaza findDuplicate/coincideBusqueda legacy (los usa producción e importación).
import { trazaRegistro } from "./apptTrace";
import { canRecordVisitResult } from "./agendaV2";

export const lst = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const vacio = (v: any) => v === undefined || v === null || String(v).trim() === "";

// ── Normalización ────────────────────────────────────────────────────────────
export const normTexto = (t: any) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
export const normTelefono = (t: any) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
export const normCuenta = (c: any) => String(c ?? "").replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
export const normDireccion = (d: any) => normTexto(d).replace(/[.,#]/g, "");
export const normNombre = (n: any) => normTexto(n);
// Todos los teléfonos de un registro (variantes legacy incluidas).
export const telefonosDe = (r: any) =>
  [r?.telefono, r?.telefonoMovil, r?.telefonoCasa, r?.telefonoTrabajo, r?.anfitrion_telefono, r?.tel].map(normTelefono).filter((d) => d.length >= 7);

// ── Sección ⇄ tipo de pestaña ────────────────────────────────────────────────
export const SECCION_DE_TIPO: Record<string, string> = { agregado: "agregados", referido: "referidos", prospecto: "prospectos", distribucion: "distribucion" };
export const seccionDeTipo = (type: string) => SECCION_DE_TIPO[type] || type;

// ── Búsqueda y filtros ───────────────────────────────────────────────────────
export type FiltrosDB = { search?: string; filterStatus?: string; filterCity?: string; filterCP?: string };
export function coincideBusquedaV2(c: any, f: FiltrosDB = {}): boolean {
  const { search = "", filterStatus = "todos", filterCity = "", filterCP = "" } = f;
  const zipRaw = String(filterCP || "").replace(/\D/g, "");
  if (zipRaw.length > 0 && zipRaw.length < 5) return false;                   // ZIP incompleto: nada (igual que legacy)
  if (zipRaw.length === 5 && String(c?.cp || "").replace(/\D/g, "").slice(0, 5) !== zipRaw) return false;
  if (filterCity && !normTexto(c?.ciudad || c?.anfitrion_ciudad).includes(normTexto(filterCity))) return false;
  if (filterStatus && filterStatus !== "todos" && c?.estado !== filterStatus) return false;
  const q = normTexto(search);
  if (!q) return true;
  const qNum = search.replace(/\D/g, "");
  const textos = [c?.nombre, c?.anfitrion, c?.ciudad, c?.estado, c?.direccion, c?.cuenta, c?.anfitrion_ciudad];
  lst(c?.referidos).forEach((r: any) => textos.push(r?.nombre, r?.direccion));        // referidos anidados
  if (textos.some((t) => t && normTexto(t).includes(q))) return true;
  if (qNum.length >= 3) {                                                                // teléfono: solo búsqueda numérica
    const tels = [...telefonosDe(c), ...lst(c?.referidos).flatMap((r: any) => telefonosDe(r))];
    if (tels.some((t) => t.includes(qNum))) return true;
  }
  return false;
}
// Filtra (sin eliminados o solo eliminados) y devuelve la lista completa filtrada.
export function filtrarRegistros(lista: any[], f: FiltrosDB & { papelera?: boolean } = {}) {
  return (lista || []).filter((c) => c && (f.papelera ? !!c.eliminado : !c.eliminado) && coincideBusquedaV2(c, f));
}

// ── Paginación (en memoria; NO es paginación de Firestore) ──────────────────
export const PAGINA_DB = 30;
export function paginar<T>(lista: T[], visibles: number) {
  const total = (lista || []).length;
  const n = Math.max(0, Math.min(total, visibles));
  return { items: (lista || []).slice(0, n), total, visibles: n, hayMas: n < total, restantes: total - n };
}

// ── Duplicados (AVISO, nunca bloqueo ni fusión) ──────────────────────────────
export type Duplicado = { existente: any; seccion: string; motivo: "cuenta" | "telefono" | "origen" | "nombre_direccion"; fuerte: boolean; referidoDe?: any; refIdx?: number };
const SECCIONES_DUP = ["agregados", "prospectos", "distribucion", "referidos"];
const mismoOrigen = (a: any, b: any) =>
  !vacio(a?.sourceRecordId) && !vacio(b?.sourceRecordId) && String(a.sourceRecordId) === String(b.sourceRecordId)
  && String(a.sourceSection || "") === String(b.sourceSection || "") && String(a.sourceRefIndex ?? "") === String(b.sourceRefIndex ?? "");
// Compara un nuevo registro (o referido) contra todo lo visible. Devuelve el PRIMER motivo por fuerza.
export function candidatoDuplicado(nuevo: any, allData: any, opts: { excluirId?: any; excluirAnfitrionId?: any } = {}): Duplicado | null {
  const cuenta = normCuenta(nuevo?.cuenta || nuevo?.numeroCuenta || nuevo?.anfitrion_cuenta), tels = telefonosDe(nuevo);
  const nombre = normNombre(nuevo?.nombre || nuevo?.anfitrion), dir = normDireccion(nuevo?.direccion);
  const candidatos: Array<{ r: any; seccion: string; anfitrion?: any; refIdx?: number }> = [];
  for (const sec of SECCIONES_DUP) for (const r of lst(allData?.[sec])) {
    if (!r || r.eliminado || String(r.id) === String(opts.excluirId)) continue;
    candidatos.push({ r, seccion: sec });
    if (sec === "referidos" && String(r.id) !== String(opts.excluirAnfitrionId))
      lst(r.referidos).forEach((ref: any, i: number) => ref && candidatos.push({ r: ref, seccion: sec, anfitrion: r, refIdx: i }));
  }
  const res = (c: any, motivo: Duplicado["motivo"], fuerte: boolean): Duplicado =>
    ({ existente: c.r, seccion: c.seccion, motivo, fuerte, ...(c.anfitrion ? { referidoDe: c.anfitrion, refIdx: c.refIdx } : {}) });
  if (cuenta) { const c = candidatos.find((x) => normCuenta(x.r.cuenta || x.r.numeroCuenta || x.r.anfitrion_cuenta) === cuenta); if (c) return res(c, "cuenta", true); }
  if (!vacio(nuevo?.sourceRecordId)) { const c = candidatos.find((x) => mismoOrigen(x.r, nuevo)); if (c) return res(c, "origen", true); }
  if (tels.length) { const c = candidatos.find((x) => telefonosDe(x.r).some((t) => tels.includes(t))); if (c) return res(c, "telefono", true); }
  if (nombre && dir) { const c = candidatos.find((x) => normNombre(x.r.nombre || x.r.anfitrion) === nombre && normDireccion(x.r.direccion) === dir); if (c) return res(c, "nombre_direccion", false); }
  return null;
}
// Alta de ANFITRIÓN de referidos: revisa al anfitrión y a cada referido anidado.
export function candidatosDuplicadoAnfitrion(anf: any, allData: any, opts: { excluirId?: any } = {}): Duplicado[] {
  const out: Duplicado[] = [];
  // El formulario de Referidos guarda la cuenta del anfitrión en anfitrion_cuenta (legacy: cuenta).
  const h = candidatoDuplicado({ nombre: anf?.anfitrion, telefono: anf?.anfitrion_telefono, cuenta: anf?.anfitrion_cuenta || anf?.cuenta, direccion: anf?.anfitrion_direccion }, allData, { excluirId: opts.excluirId, excluirAnfitrionId: opts.excluirId });
  if (h) out.push(h);
  lst(anf?.referidos).forEach((r: any) => { const d = r && candidatoDuplicado(r, allData, { excluirId: opts.excluirId, excluirAnfitrionId: opts.excluirId }); if (d) out.push(d); });
  return out;
}
const SECCION_LABEL: Record<string, string> = { agregados: "Agregados", prospectos: "Prospección", distribucion: "Distribución", referidos: "Referidos" };
export function textoDuplicado(d: Duplicado) {
  const quien = d.existente?.nombre || d.existente?.anfitrion || "(sin nombre)";
  const donde = d.referidoDe ? `referido de ${d.referidoDe.anfitrion || "un anfitrión"} (Referidos)` : SECCION_LABEL[d.seccion] || d.seccion;
  const por = { cuenta: "el mismo número de cuenta", telefono: "el mismo teléfono", origen: "el mismo registro de origen", nombre_direccion: "el mismo nombre y dirección (coincidencia débil)" }[d.motivo];
  return `Posible duplicado: "${quien}" en ${donde} tiene ${por}.`;
}

// ── Acciones permitidas por rol (NO amplía permisos: solo lee los que ya existen) ──
// can(permiso) viene de src/auth/permissions.can(user, permiso).
export type ActorDB = { uid?: string; role?: string; can: (permiso: string) => boolean };
export function accionesRegistroV2(actor: ActorDB, registro: any, type: string) {
  const esRef = type === "referido";
  const asignadoAMi = !!actor?.uid && String(registro?.assignedTo || "") === String(actor.uid);
  const editarBase = actor.can("clientes.edit") || (actor.can("clientes.assigned.edit") && asignadoAMi);
  const editar = esRef ? (actor.can("referidos.manage") || editarBase) : editarBase;
  const borrarDefinitivo = actor.role === "super_admin" || actor.role === "distribuidor";
  // Resultado FÍSICO de visita (demo_venta, demo_no_venta, no_recibio, no_visito, seguimiento…): misma regla
  // que la Agenda (canRecordVisitResult: super_admin, distribuidor, supervisor). El resultado de LLAMADA no depende de esto.
  const resultadoFisico = canRecordVisitResult(String(actor.role || ""));
  return { editar, papelera: editar, restaurar: editar, borrarDefinitivo, agendar: editar || actor.can("agenda.manage"), resultadoFisico };
}

// ── Venta desde la tarjeta del cliente (mismo flujo que Agenda/Servicio) ─────
// Devuelve el registro actualizado (con resultBy*) y la "venta" que entra a Distribución
// (NO es una cita: no se agrega a appts, así Venta/Volumen no se duplican).
export function ventaDesdeRegistro(registro: any, type: string, datos: { monto?: any; producto?: string; detail?: string; cartucho_meses?: any }, autor: { uid: string; nombre: string }, now: Date = new Date()) {
  const montoNum = Number(datos?.monto) || 0, resultAt = now.toISOString();
  const traza = trazaRegistro({ ...registro, section: registro?._tipo || seccionDeTipo(type) } as any);
  // Id ESTABLE de esta venta de registro: si la venta sigue vigente se reutiliza (no duplica en Distribución).
  const ventaRegistroId = !vacio(registro?.ventaRegistroId) && (registro?.resultado === "demo_venta" || registro?.venta === true)
    ? String(registro.ventaRegistroId)
    : `rv_${traza.sourceSection}_${traza.sourceRecordId}${traza.sourceRefIndex != null ? "_" + traza.sourceRefIndex : ""}_${resultAt.replace(/\D/g, "")}`;
  const actualizado = {
    ...registro, venta: true, resultado: "demo_venta", resultado_detalle: datos?.detail || registro?.resultado_detalle,
    ultimo_monto_venta: montoNum || registro?.ultimo_monto_venta, ultimo_producto: datos?.producto || registro?.ultimo_producto,
    ultimo_cartucho_meses: datos?.cartucho_meses || registro?.ultimo_cartucho_meses,
    resultByUid: autor.uid, resultByName: autor.nombre, resultAt, ventaRegistroId,
  };
  const venta = {
    id: ventaRegistroId,
    tipo: "cita", resultado: "demo_venta", fecha: resultAt, monto: montoNum, producto: datos?.producto || "",
    nombre: registro?.nombre || "", telefono: registro?.telefono || "", direccion: registro?.direccion || "", ciudad: registro?.ciudad || "", cp: registro?.cp || "",
    ...(vacio(registro?.cuenta) ? {} : { cuenta: registro.cuenta }), ...traza,
    ...(registro?.createdByUid ? { createdByUid: registro.createdByUid } : {}), ...(registro?.createdByName ? { createdByName: registro.createdByName } : {}),
    resultByUid: autor.uid, resultByName: autor.nombre, resultAt,
  };
  return { registro: actualizado, venta };
}

// ── Referidos (vista especial anfitrión + referidos anidados) ────────────────
// Solo los campos de RESULTADO/VENTA que ventaDesdeRegistro calcula. La tarjeta del anfitrión
// renombra campos (anfitrion → nombre…), así que al documento real se aplica únicamente esto.
export const CAMPOS_VENTA_REGISTRO = ["venta", "resultado", "resultado_detalle", "ultimo_monto_venta", "ultimo_producto", "ultimo_cartucho_meses", "resultByUid", "resultByName", "resultAt", "ventaRegistroId"];
export const camposVenta = (registro: any) =>
  Object.fromEntries(CAMPOS_VENTA_REGISTRO.filter((k) => registro?.[k] !== undefined).map((k) => [k, registro[k]]));
// Claves React estables para los referidos de un anfitrión (v2). Prioridad: id persistente →
// clave original del mapa (datos legacy) → anfitrión + teléfono/nombre normalizado → índice (último recurso).
// Si dos referidos producen la misma clave, se distinguen por su número de aparición (no por la posición).
export function clavesReferidos(anf: any): string[] {
  const raw = anf?.referidos;
  const esMapa = raw && typeof raw === "object" && !Array.isArray(raw);
  const llaves = esMapa ? Object.keys(raw) : null;
  const vistos: Record<string, number> = {};
  return lst(raw).map((r: any, i: number) => {
    const base = !vacio(r?.id) ? `id:${r.id}`
      : esMapa ? `k:${llaves![i]}`
      : (normTelefono(r?.telefono) || normTexto(r?.nombre)) ? `t:${normTelefono(r?.telefono)}|n:${normTexto(r?.nombre)}`
      : `i:${i}`;
    vistos[base] = (vistos[base] || 0) + 1;
    return `ref-${anf?.id}-${base}${vistos[base] > 1 ? `#${vistos[base]}` : ""}`;
  });
}

// ── Corrección de un resultado físico registrado desde la tarjeta ────────────
// Sella el autor de la corrección. Si el registro tenía una venta vigente (ventaRegistroId) y el nuevo
// resultado ya no es venta, devuelve el evento para reconciliar Distribución con el MISMO id
// (reconciliarDistribucionPorVenta: papelera si era auto-creado y sin trabajo; si no, solo desvincular).
// No crea citas: el "evento" solo viaja a la reconciliación.
export function correccionDesdeRegistro(registro: any, nuevoResultado: string, autor: { uid: string; nombre: string }, now: Date = new Date()) {
  const patch: any = { resultByUid: autor.uid, resultByName: autor.nombre, resultAt: now.toISOString() };
  const ventaVigente = !vacio(registro?.ventaRegistroId);
  if (nuevoResultado === "demo_venta" || !ventaVigente) return { patch, reconciliar: null };
  patch.venta = false;
  patch.ventaRegistroId = undefined;                    // la venta terminó (el store elimina el campo)
  return { patch, reconciliar: { id: String(registro.ventaRegistroId), tipo: "cita", resultado: nuevoResultado } };
}
