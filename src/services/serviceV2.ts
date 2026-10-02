// ═══ SERVICIO v2 — lógica pura (ACCESS_V2) ═══════════════════════════════════
// Un SERVICIO es atención postventa a un cliente existente (appts con tipo "servicio").
// NO es una demostración: una venta durante un servicio cuenta VENTA + VOLUMEN +
// SERVICIO REALIZADO, nunca DEMO. La usan la pestaña Servicio, la tarjeta de la
// Agenda (tipo servicio), Cartuchos y filtros, contarVentasDemos y el Centro de mando.
// Sin migración: los valores legacy se interpretan al leer.
import {
  isCancelled, cancelarCita, reprogramarAntesDeVisita, localDayValue, localDateTimeValue, fechaLocal, candidatosCartera,
} from "./agendaV2";

type Autor = { uid: string; nombre: string };
const lst = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const digitos = (s: any) => String(s || "").replace(/\D/g, "").slice(-10);
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export const esServicio = (a: any) => !!a && (a.tipo === "servicio" || a._type === "servicio");

// ── Estado del servicio ──────────────────────────────────────────────────────
// pendiente · realizado · venta · no_recibio · no_visito · no_realizado (legacy) · cancelado
export type EstadoServicio = "pendiente" | "realizado" | "venta" | "no_recibio" | "no_visito" | "no_realizado" | "cancelado";
const RESULTADOS_VENTA = ["venta_servicio", "demo_venta", "venta"];   // legacy: demo_venta / venta en un servicio = venta
export function estadoServicio(a: any): EstadoServicio {
  if (isCancelled(a)) return "cancelado";
  const sr = String(a?.servicioResultado || ""), r = String(a?.resultado || "");
  if (sr === "venta") return "venta";
  if (sr === "realizado") return RESULTADOS_VENTA.includes(r) ? "venta" : "realizado";
  if (sr === "no_recibio" || sr === "no_visito") return sr;
  if (sr === "no_realizado") return r === "no_recibio" || r === "no_visito" ? (r as EstadoServicio) : "no_realizado";
  return "pendiente";                                    // "", "pendiente" y el reset legacy
}
export const esServicioPendiente = (a: any) => esServicio(a) && estadoServicio(a) === "pendiente";
export const esServicioHecho = (a: any) => esServicio(a) && ["realizado", "venta"].includes(estadoServicio(a));
export const esServicioNoRealizado = (a: any) => esServicio(a) && ["no_recibio", "no_visito", "no_realizado"].includes(estadoServicio(a));
export const esVentaServicio = (a: any) => esServicio(a) && estadoServicio(a) === "venta";
// Servicio cerrado: tiene resultado final (o está cancelado) → sin Reprogramar / Cancelar.
export const serviceReadOnly = (a: any) => estadoServicio(a) !== "pendiente";
// Fecha REAL para métricas de resultado: cuándo se marcó (fallback legacy: la fecha programada).
// Se devuelve en hora LOCAL ("YYYY-MM-DDTHH:mm"): resultAt se guarda en UTC y a las 9 PM en
// Texas ya es el día siguiente en UTC; así el resultado cae en el día en que ocurrió.
export const serviceMetricDate = (a: any) => (a?.resultAt ? fechaLocal(a.resultAt) : String(a?.fecha || ""));

export const ESTADO_SERVICIO: Record<EstadoServicio, { label: string; dot: string; badge: string }> = {
  pendiente:    { label: "Pendiente",      dot: "#F59E0B", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  realizado:    { label: "Realizado",      dot: "#16A34A", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  venta:        { label: "Venta",          dot: "#047857", badge: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  no_recibio:   { label: "No recibió",     dot: "#DC2626", badge: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  no_visito:    { label: "No se visitó",   dot: "#7C3AED", badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  no_realizado: { label: "No se realizó",  dot: "#DC2626", badge: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  cancelado:    { label: "Cancelado",      dot: "#94A3B8", badge: "bg-slate-200 text-slate-600" },
};

// ── Filtros y contadores de la pestaña Servicio ─────────────────────────────
export type FiltroServicio = "hoy" | "todos" | "pendiente" | "hechos" | "no_realizados" | "cancelados";
export function enFiltroServicio(a: any, filtro: FiltroServicio, now: Date = new Date()) {
  if (!esServicio(a)) return false;
  if (filtro === "todos") return true;                               // Todos = historial completo (incluye cancelados)
  const e = estadoServicio(a);
  if (filtro === "cancelados") return e === "cancelado";
  if (e === "cancelado") return false;                               // cancelado no cuenta en ningún otro grupo
  if (filtro === "hoy") return fechaLocal(a.fecha).slice(0, 10) === localDayValue(now);
  if (filtro === "pendiente") return e === "pendiente";
  if (filtro === "hechos") return e === "realizado" || e === "venta";
  return e === "no_recibio" || e === "no_visito" || e === "no_realizado";
}
export function serviceCounters(appts: any[], now: Date = new Date()) {
  const s = (appts || []).filter(esServicio);
  const n = (f: FiltroServicio) => s.filter((a) => enFiltroServicio(a, f, now)).length;
  return { hoy: n("hoy"), todos: s.length, pendiente: n("pendiente"), hechos: n("hechos"), no_realizados: n("no_realizados"), cancelados: n("cancelados") };
}

// ── Acciones (devuelven la cita nueva; nunca borran) ─────────────────────────
const entradaHist = (resultado: string, autor: Autor, now: Date, extra: any = {}) => ({
  resultado, fecha: now.toISOString(), uid: autor.uid, nombre: autor.nombre, agente: autor.nombre,   // agente: compatibilidad visual
  ...(extra.monto ? { monto: Number(extra.monto) } : {}), ...(extra.producto ? { producto: extra.producto } : {}),
});
const RESULTADO_DE: Record<string, string> = { realizado: "servicio_realizado", no_recibio: "no_recibio", no_visito: "no_visito" };

// Servicio realizado / No recibió / No se visitó (sin venta).
export function registrarResultadoServicio(a: any, resultado: "realizado" | "no_recibio" | "no_visito", autor: Autor, now: Date = new Date()) {
  if (!RESULTADO_DE[resultado]) throw new Error("resultado de servicio no válido: " + resultado);
  const out: any = {
    ...a, servicioResultado: resultado, resultado: RESULTADO_DE[resultado], venta: false,
    resultByUid: autor.uid, resultByName: autor.nombre, resultAt: now.toISOString(),
    servicioHistorial: [...lst(a.servicioHistorial), entradaHist(resultado, autor, now)],
    actualizado: now.toISOString(),
  };
  delete out.monto;                                       // si se corrige una venta, deja de sumar volumen
  return out;
}
// Venta durante el servicio: VENTA + VOLUMEN + SERVICIO REALIZADO, nunca DEMO.
export function registrarVentaServicio(a: any, { monto, producto }: { monto?: any; producto?: string }, autor: Autor, now: Date = new Date()) {
  const m = Number(monto) || 0, prod = producto || a.producto || "";
  return {
    ...a, servicioResultado: "venta", resultado: "venta_servicio", venta: true, monto: m, producto: prod,
    resultByUid: autor.uid, resultByName: autor.nombre, resultAt: now.toISOString(),
    servicioHistorial: [...lst(a.servicioHistorial), entradaHist("venta", autor, now, { monto: m, producto: prod })],
    actualizado: now.toISOString(),
  };
}
// Reprogramar: MISMA cita, nueva fecha, historial (reprogramHistory de Agenda). Queda pendiente.
export function reprogramarServicio(a: any, nuevaFecha: string, autor: Autor, now: Date = new Date()) {
  return { ...reprogramarAntesDeVisita(a, nuevaFecha, autor, now), servicioResultado: "pendiente" };
}
// Cancelar: mismo modelo que la Agenda (status cancelada, quién, cuándo, motivo). No se borra.
export const cancelarServicio = (a: any, autor: Autor, now: Date = new Date(), motivo = "") => cancelarCita(a, autor, now, motivo);
// Nota del servicio: se acumula (con identidad real).
export function notaServicio(a: any, texto: string, autor: Autor, now: Date = new Date()) {
  const t = String(texto || "").trim();
  if (!t) return a;
  return {
    ...a, servicioUltimaNota: t,
    servicioNotas: [...lst(a.servicioNotas), { texto: t, fecha: now.toISOString(), uid: autor.uid, nombre: autor.nombre, agente: autor.nombre }],
    actualizado: now.toISOString(),
  };
}

// ── Duplicados de SERVICIO (advertencia, no bloqueo) ─────────────────────────
// Solo compara servicios activos. Una cita comercial NO es duplicado de un servicio.
// Con registro de origen: mismo sourceRecordId + sourceRefIndex (+ producto compatible);
// sin origen (manual/legacy): mismo teléfono + producto compatible. Fecha: ±ventanaDias.
const diaMs = (f: any) => { const d = fechaLocal(f).slice(0, 10); return d ? Date.parse(d + "T12:00:00") : NaN; };
const mismoProducto = (x: any, y: any) => !norm(x) || !norm(y) || norm(x) === norm(y);
export function duplicateServiceCandidate(appts: any[], nuevo: any, ventanaDias = 3) {
  const t = diaMs(nuevo?.fecha);
  const conSource = nuevo?.sourceRecordId != null && nuevo.sourceRecordId !== "";
  return (appts || []).find((e: any) => {
    if (!esServicio(e) || isCancelled(e) || String(e.id) === String(nuevo?.id)) return false;
    const d = diaMs(e.fecha);
    if (!Number.isNaN(t) && !Number.isNaN(d) && Math.abs(d - t) > ventanaDias * 86400000) return false;
    if (!mismoProducto(e.producto, nuevo?.producto)) return false;
    if (conSource && e.sourceRecordId != null && e.sourceRecordId !== "")
      return String(e.sourceRecordId) === String(nuevo.sourceRecordId) && String(e.sourceSection || "") === String(nuevo.sourceSection || "")
        && String(e.sourceRefIndex ?? "") === String(nuevo.sourceRefIndex ?? "");
    const tn = digitos(nuevo?.telefono);
    return tn.length >= 7 && digitos(e.telefono) === tn;
  }) || null;
}

// ── Mantenimiento futuro después de una venta en servicio ────────────────────
const sumarMeses = (base: Date, meses: number) => { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate()); d.setMonth(d.getMonth() + meses); return d; };
const SOURCE = ["sourceRecordId", "sourceSection", "sourceRefIndex"];
const copiaSource = (a: any) => Object.fromEntries(SOURCE.filter((k) => a?.[k] !== undefined && a[k] !== null && a[k] !== "").map((k) => [k, a[k]]));
export function mantenimientoDesdeServicio(sv: any, { producto, meses }: { producto?: string; meses: number }, now: Date, id: any) {
  const fecha = localDayValue(sumarMeses(now, Number(meses) || 0)) + "T09:00";      // hora LOCAL
  const prod = producto || sv.producto || "";
  return {
    id, tipo: "servicio", _type: "servicio",
    nombre: sv.nombre || "", telefono: sv.telefono || "", direccion: sv.direccion || "", ciudad: sv.ciudad || "", cp: sv.cp || "",
    ...(sv.cuenta ? { cuenta: sv.cuenta } : {}),
    producto: prod, fecha, notas: `🔁 Mantenimiento ${prod} (cada ${meses} meses)`.replace(/\s+/g, " "),
    ...copiaSource(sv), createdFrom: "service_maintenance", maintenanceFromApptId: sv.id,
  };
}

// ── Servicio desde Cartuchos y filtros ───────────────────────────────────────
// Usa el registro de origen SOLO si calcularCartuchos lo trae (nunca se inventa).
export function servicioDesdeCartucho(x: any, now: Date, id: any) {
  const prox = x?.proxFecha instanceof Date ? x.proxFecha : new Date(x?.proxFecha || now);
  const dia = prox.getTime() > now.getTime() ? prox : now;
  return {
    id, tipo: "servicio", _type: "servicio", nombre: x?.nombre || "", telefono: x?.telefono || "",
    ...(x?.direccion ? { direccion: x.direccion } : {}), ...(x?.ciudad ? { ciudad: x.ciudad } : {}), ...(x?.cp ? { cp: x.cp } : {}),
    producto: x?.producto || "", fecha: localDayValue(dia) + "T09:00", notas: `🔔 Cambio de cartucho: ${x?.producto || ""}`.trim(),
    ...copiaSource(x), createdFrom: "cartuchos",
  };
}

// ── Buscador de cliente para un Servicio (Agenda · staff) ───────────────────
// Mismos candidatos que la Agenda, primero Distribución (normalmente ya son clientes),
// con cuenta y producto para autocompletar. No abre lecturas nuevas: usa lo que el rol ya ve.
export function candidatosServicio(allData: any) {
  const porId = (sec: string, id: any) => lst(allData?.[sec]).find((r: any) => r && String(r.id) === String(id)) || {};
  const orden: Record<string, number> = { distribucion: 0, agregados: 1, referidos: 2, prospectos: 3 };
  return candidatosCartera(allData)
    .map((c: any) => { const r = c.refIdx === undefined ? porId(c.section, c.recId) : {}; return { ...c, cuenta: r.cuenta || c.cuenta || "", producto: c.producto || r.producto || "" }; })
    .sort((a: any, b: any) => (orden[a.section] ?? 9) - (orden[b.section] ?? 9));
}

// ── Métricas: Demos / Ventas / Volumen (regla central v2) ────────────────────
//   cita + demo_venta/venta          → Demo + Venta + Volumen   (igual que siempre)
//   cita + demo_no_venta/no_venta    → Demo
//   servicio + venta_servicio        → Venta + Volumen, NO Demo (fecha: resultAt)
//   servicio legacy + demo_venta/venta → Venta + Volumen, NO Demo
//   servicio sin venta               → nada aquí (se cuenta como servicio)
//   cancelados                       → nada
export function contarVentasDemosV2({ appts = [], clientes = [], enP = (_f: any) => true, agente = "" }: any = {}) {
  let demos = 0, ventas = 0, volumen = 0;
  (appts || []).forEach((a: any) => {
    if (!a || a._sincronizado || isCancelled(a)) return;
    if (agente && a.agente && a.agente !== agente) return;
    if (esServicio(a)) {
      if (esVentaServicio(a) && enP(serviceMetricDate(a))) { ventas++; volumen += Number(a.monto) || 0; }
      return;
    }
    if (!enP(a.fecha)) return;
    if (a.resultado === "demo_venta" || a.resultado === "venta") { ventas++; demos++; volumen += Number(a.monto) || 0; }
    else if (a.resultado === "demo_no_venta" || a.resultado === "no_venta") { demos++; }
  });
  (clientes || []).forEach((c: any) => lst(c?.historial).forEach((h: any) => {
    if (!h || !enP(h.fecha)) return;
    if (agente && h.agente && h.agente !== agente) return;
    if (h.cita_resultado === "venta_servicio") { ventas++; volumen += Number(h.monto) || 0; return; }
    if (h.cita_resultado === "demo_venta" || h.cita_resultado === "venta") { ventas++; demos++; volumen += Number(h.monto) || 0; }
    else if (h.cita_resultado === "demo_no_venta" || h.cita_resultado === "no_venta") { demos++; }
  }));
  return { demos, ventas, volumen, cierre: demos > 0 ? Math.round((ventas / demos) * 100) : 0 };
}
// Servicios REALIZADOS (realizado + venta) atribuidos a la fecha real del resultado.
export const serviciosRealizados = (appts: any[], enP: (f: string) => boolean) =>
  (appts || []).filter((a) => esServicioHecho(a) && enP(serviceMetricDate(a))).length;

export { localDateTimeValue };
