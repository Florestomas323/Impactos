// ═══ VENTA → DISTRIBUCIÓN (v2) ═══════════════════════════════════════════════
// Cuando un cliente termina en VENTA (cita comercial demo_venta / venta, o servicio
// venta_servicio) queda disponible en Distribución:
//   Datos → Cita → Visita → Venta → Distribución → Referidos
// NO se mueve ni se borra el registro original: se CREA o se VINCULA uno en Distribución.
// Anti-duplicado: si el cliente ya está en Distribución, solo se completa con datos nuevos.
import { esServicio, esVentaServicio, serviceMetricDate } from "./serviceV2";
import { isCancelled } from "./agendaV2";

const lst = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const digitos = (s: any) => String(s || "").replace(/\D/g, "").slice(-10);
const vacio = (v: any) => v === undefined || v === null || String(v).trim() === "";

// Ventas que pasan a Distribución. NO: demo_no_venta, no_recibio, no_visito, seguimiento, cancelados.
export function esVentaParaDistribucion(a: any) {
  if (!a || isCancelled(a)) return false;
  if (esServicio(a)) return esVentaServicio(a);
  return (a.tipo === "cita" || a._type === "cita") && (a.resultado === "demo_venta" || a.resultado === "venta");
}
// Id determinista: dos dispositivos que procesen la misma venta escriben el MISMO documento.
export const idDistribucionDeVenta = (a: any) => `dv_${a.id}`;

// Busca al cliente ya presente en Distribución (activo).
export function buscarEnDistribucion(distribucion: any[], a: any) {
  const activos = lst(distribucion).filter((r: any) => r && !r.eliminado);
  const tieneSrc = a.sourceRecordId != null && a.sourceRecordId !== "";
  // 1) la venta ES de un cliente de Distribución
  if (tieneSrc && a.sourceSection === "distribucion") {
    const r = activos.find((x: any) => String(x.id) === String(a.sourceRecordId));
    if (r) return r;
  }
  // 2) ya se vinculó antes desde el mismo registro de origen
  if (tieneSrc) {
    const r = activos.find((x: any) => x.sourceRecordId != null && String(x.sourceRecordId) === String(a.sourceRecordId)
      && String(x.sourceSection || "") === String(a.sourceSection || "") && String(x.sourceRefIndex ?? "") === String(a.sourceRefIndex ?? ""));
    if (r) return r;
  }
  // 3) mismo id determinista (venta ya procesada) · 4) teléfono · 5) cuenta
  const porId = activos.find((x: any) => String(x.id) === idDistribucionDeVenta(a));
  if (porId) return porId;
  const t = digitos(a.telefono);
  if (t.length >= 7) { const r = activos.find((x: any) => digitos(x.telefono) === t); if (r) return r; }
  if (!vacio(a.cuenta)) { const r = activos.find((x: any) => !vacio(x.cuenta) && String(x.cuenta).trim() === String(a.cuenta).trim()); if (r) return r; }
  return null;
}

const refVenta = (a: any) => ({
  apptId: a.id, tipo: esServicio(a) ? "servicio" : "cita", resultado: a.resultado,
  fecha: esServicio(a) ? serviceMetricDate(a) : String(a.fecha || ""),
  ...(a.monto ? { monto: Number(a.monto) } : {}), ...(a.producto ? { producto: a.producto } : {}),
  ...(a.resultByUid ? { porUid: a.resultByUid, porNombre: a.resultByName || "" } : {}),
});
const CAMPOS = ["nombre", "telefono", "direccion", "ciudad", "cp", "cuenta"];

// Devuelve la lista de Distribución actualizada y qué se hizo:
//   "creado" · "actualizado" (solo se completaron vacíos / se anotó la venta) · "sin_cambios" · "omitido"
export function distribucionDesdeVenta(distribucion: any[], a: any, now: Date = new Date()) {
  const lista = lst(distribucion);
  if (!esVentaParaDistribucion(a)) return { lista, accion: "omitido" as const, id: null };
  const ref = refVenta(a);
  const existente = buscarEnDistribucion(lista, a);
  if (existente) {
    const upd: any = { ...existente };
    let cambio = false;
    CAMPOS.forEach((k) => { if (vacio(upd[k]) && !vacio(a[k])) { upd[k] = a[k]; cambio = true; } });   // solo datos NUEVOS válidos
    const ventas = lst(upd.ventasOrigen);
    if (!ventas.some((v: any) => String(v.apptId) === String(a.id))) { upd.ventasOrigen = [...ventas, ref]; cambio = true; }
    if (!cambio) return { lista, accion: "sin_cambios" as const, id: existente.id };
    upd.actualizado = now.toISOString();
    return { lista: lista.map((r: any) => (r === existente ? upd : r)), accion: "actualizado" as const, id: existente.id };
  }
  const tieneSrc = a.sourceRecordId != null && a.sourceRecordId !== "";
  const nuevo: any = {
    id: idDistribucionDeVenta(a),
    nombre: a.nombre || "(Cliente de venta)", telefono: a.telefono || "",
    direccion: a.direccion || "", ciudad: a.ciudad || "", cp: a.cp || "",
    ...(vacio(a.cuenta) ? {} : { cuenta: a.cuenta }),
    ...(tieneSrc ? { sourceSection: a.sourceSection, sourceRecordId: String(a.sourceRecordId), ...(a.sourceRefIndex != null ? { sourceRefIndex: a.sourceRefIndex } : {}) } : {}),
    ...(a.createdByUid ? { createdByUid: a.createdByUid } : {}), ...(a.createdByName ? { createdByName: a.createdByName } : {}),
    createdFrom: "venta_distribucion", ventaOrigenApptId: a.id, ventasOrigen: [ref],
    fuente: esServicio(a) ? "Venta en servicio" : "Venta en visita",
    producto: a.producto || "", venta: true, creado: now.toISOString(), historial: [],
  };
  return { lista: [nuevo, ...lista], accion: "creado" as const, id: nuevo.id };
}

// ── Reconciliación después de corregir un resultado ─────────────────────────
// Si el evento sigue siendo venta, conserva/crea el vínculo. Si DEJÓ de ser venta:
//   A) registro auto-creado por ESA venta y nunca trabajado → PAPELERA (eliminado:true + motivo,
//      fecha y quién), sin quitarlo de la lista: nunca borrado físico, no depende de permisos de delete.
//   B) auto-creado pero ya trabajado (notas, historial, asignación, Cobranza, otras ventas…)
//      → sigue ACTIVO; solo se quita la referencia de esa venta.
//   C) registro preexistente → sigue ACTIVO; solo se quita la referencia.
// Funciona igual para super_admin, distribuidor y supervisor.
type Autor = { uid?: string; nombre?: string } | null | undefined;
const noVacio = (v: any) => !(v === undefined || v === null || String(v).trim() === "");
export function registroTrabajado(r: any, restantes: any[] = lst(r?.ventasOrigen)) {
  return restantes.length > 0
    || lst(r?.notas).length > 0 || lst(r?.historial).length > 0 || noVacio(r?.ultimaNota)
    || noVacio(r?.assignedTo) || noVacio(r?.linkedRecordId)
    || noVacio(r?.estado) || noVacio(r?.proximo_seguimiento) || noVacio(r?.ultima_cita_programada)
    || (noVacio(r?.actualizado) && noVacio(r?.creado) && String(r.actualizado) > String(r.creado));
}
export function reconciliarDistribucionPorVenta(distribucion: any[], a: any, now: Date = new Date(), autor: Autor = null) {
  const lista = lst(distribucion);
  if (esVentaParaDistribucion(a)) return distribucionDesdeVenta(lista, a, now);

  let accion: "sin_cambios" | "desvinculado" | "papelera" = "sin_cambios";
  let id: any = null;
  const siguiente = lista.map((r: any) => {
    if (!r) return r;
    const ventas = lst(r.ventasOrigen);
    if (!ventas.some((v: any) => String(v?.apptId) === String(a?.id))) return r;
    id = r.id;
    const restantes = ventas.filter((v: any) => String(v?.apptId) !== String(a?.id));
    const upd: any = { ...r, ventasOrigen: restantes, actualizado: now.toISOString() };
    if (String(upd.ventaOrigenApptId || "") === String(a?.id || "")) delete upd.ventaOrigenApptId;
    const autoCreado = r.createdFrom === "venta_distribucion" && String(r.ventaOrigenApptId || "") === String(a?.id || "");
    if (autoCreado && !r.eliminado && !registroTrabajado(r, restantes)) {           // A
      accion = "papelera";
      return { ...upd, eliminado: true, eliminadoMotivo: "Venta corregida", eliminadoAt: now.toISOString(),
        ...(autor?.uid ? { eliminadoPorUid: autor.uid } : {}), ...(autor?.nombre ? { eliminadoPorNombre: autor.nombre } : {}) };
    }
    if (accion !== "papelera") accion = "desvinculado";                               // B · C
    return upd;
  });
  return { lista: siguiente, accion, id };
}
