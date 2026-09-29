// ═══ AGENDA v2 — LÓGICA PURA (probada en tests/agendaV2.test.ts) ═══════════
// Modelo: Datos → Llamada → Cita → Visita → Demo → Venta. La cita se confirma en la
// llamada (no hay "por confirmar") y no se asigna distribuidor (assignedTo puede ser null).
// Quien agenda (createdBy*) NO es necesariamente quien visita (resultBy*).
// Todo en HORA LOCAL del navegador (Texas): nunca toISOString() para datetime-local.

// ── Hora local ──────────────────────────────────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, "0");
// Valor para <input type="datetime-local">: YYYY-MM-DDTHH:mm en hora LOCAL.
export const localDateTimeValue = (d: Date = new Date()) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const localDayValue = (d: Date = new Date()) => localDateTimeValue(d).slice(0, 10);
// Cualquier fecha guardada → "YYYY-MM-DDTHH:mm" LOCAL comparable como texto.
//  • "2026-09-29T20:00" (datetime-local, sin zona) ya es local → se respeta tal cual.
//  • "2026-09-30T01:00:00.000Z" (ISO con zona) → se convierte a la hora local.
//  • "2026-09-29" (solo día) → inicio del día.
export function fechaLocal(f: any): string {
  const s = String(f || "").trim();
  if (!s) return "";
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? "" : localDateTimeValue(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + "T00:00";
  return s.slice(0, 16);
}
export const diaLocal = (f: any) => fechaLocal(f).slice(0, 10);

// ── Tipos y estados ─────────────────────────────────────────────────────────
export const tipoDe = (a: any) => String(a?.tipo || a?._type || "");
export const esCita = (a: any) => tipoDe(a) === "cita";
export const isCancelled = (a: any) => a?.status === "cancelada";
export const isPastAppt = (a: any, now: Date = new Date()) => { const f = fechaLocal(a?.fecha); return !!f && f < localDateTimeValue(now); };

// ── Resultados de visita (tipo "cita") ──────────────────────────────────────
export const RESULTADOS_CITA_V2 = [
  { id: "demo_venta", label: "Demo / venta", bg: "#047857" },
  { id: "demo_no_venta", label: "Demo / no venta", bg: "#64748b" },
  { id: "no_recibio", label: "No recibió", bg: "#dc2626" },
  { id: "reprogramada_visita", label: "Reprogramada en visita", bg: "#0891b2" },
  { id: "no_visito", label: "No se visitó", bg: "#9333ea" },
  { id: "seguimiento", label: "Seguimiento", bg: "#f97316" },
];
// Etiquetas para mostrar (incluye resultados antiguos: no se migra nada).
export const ETIQUETA_RESULTADO: Record<string, string> = {
  ...Object.fromEntries(RESULTADOS_CITA_V2.map((r) => [r.id, r.label])),
  venta: "Demo / venta", no_venta: "Demo / no venta", reset: "Re-agendada", recompra: "Recompra",
};
export const CAMPOS_RESULTADO = ["resultado", "resultado_detalle", "monto", "producto", "cartucho_meses", "resultByUid", "resultByName", "resultAt"];
export const CAMPOS_TRAZA = ["createdByUid", "createdByName", "sourceRecordId", "sourceSection", "sourceRefIndex"];

// ── Quién registra el resultado de la VISITA ────────────────────────────────
// Quien agenda no necesariamente visita: el telemarketing no registra resultados físicos.
const STAFF = ["super_admin", "distribuidor", "supervisor"];
export const canRecordVisitResult = (role: string) => STAFF.includes(role);
export const canHardDelete = (role: string) => role === "super_admin" || role === "distribuidor";

export type Autor = { uid: string; nombre: string };

// Registrar resultado (solo staff): deja trazabilidad de quién visitó.
export function registrarResultado(a: any, id: string, datos: { detalle?: string; monto?: any; producto?: string; cartucho_meses?: any } = {}, autor: Autor, now: Date = new Date()) {
  const out: any = { ...a, resultado: id, resultado_detalle: datos.detalle ?? a.resultado_detalle ?? "", resultByUid: autor.uid, resultByName: autor.nombre, resultAt: now.toISOString() };
  if (id === "demo_venta") { out.monto = Number(datos.monto) || 0; if (datos.producto !== undefined) out.producto = datos.producto; if (datos.cartucho_meses !== undefined) out.cartucho_meses = datos.cartucho_meses; }
  return out;
}

// Reprogramar ANTES de la visita: misma cita, nueva fecha, historial. No es visita ni resultado.
export function reprogramarAntesDeVisita(a: any, nuevaFecha: string, autor: Autor, now: Date = new Date(), reason = "before_visit") {
  const hist = Array.isArray(a.reprogramHistory) ? a.reprogramHistory : [];
  return {
    ...a, fecha: nuevaFecha,
    reprogramHistory: [...hist, { previousDate: a.fecha || "", newDate: nuevaFecha, changedAt: now.toISOString(), changedByUid: autor.uid, changedByName: autor.nombre, reason }],
  };
}

// Reprogramada EN la visita: hubo presencia física. La cita actual conserva su fecha y
// queda con resultado; se crea una NUEVA cita que conserva cliente, origen y autoría original.
export function reprogramarDesdeVisita(a: any, nuevaFecha: string, nota: string, autor: Autor, now: Date, nuevoId: any) {
  const original = registrarResultado(a, "reprogramada_visita", { detalle: nota || a.resultado_detalle || "" }, autor, now);
  const nueva: any = { id: nuevoId, tipo: "cita", _type: "cita", fecha: nuevaFecha };
  ["nombre", "telefono", "direccion", "ciudad", "cp", "producto", "cuenta", "sourceRecordId", "sourceSection", "sourceRefIndex", "createdByUid", "createdByName", "agente", "appId"].forEach((k) => {
    if (a[k] !== undefined && a[k] !== null && a[k] !== "") nueva[k] = a[k];
  });
  if (nota) nueva.notas = nota;
  nueva.reprogrammedFromApptId = a.id;
  nueva.createdFrom = "reprogramada_visita";
  nueva.creado = now.toISOString();
  return { original, nueva };
}

// Cancelar (en vez de borrar): la cita queda en el historial.
export function cancelarCita(a: any, autor: Autor, now: Date = new Date(), reason = "") {
  return { ...a, status: "cancelada", cancelledAt: now.toISOString(), cancelledByUid: autor.uid, cancelledByName: autor.nombre, ...(reason ? { cancelReason: reason } : {}) };
}

// ── Filtros y contadores de la Agenda (hora local) ──────────────────────────
export type FiltroAgenda = "hoy" | "proximas" | "sinResultado" | "todas";
export function enFiltro(a: any, filtro: FiltroAgenda, now: Date = new Date()): boolean {
  if (!a) return false;
  if (filtro === "todas") return true;
  if (isCancelled(a)) return false;                       // canceladas: solo en "Todas"
  const f = fechaLocal(a.fecha), hoy = localDayValue(now), ahora = localDateTimeValue(now);
  if (!f) return false;
  if (filtro === "hoy") return f.slice(0, 10) === hoy;
  if (filtro === "proximas") return f > ahora && f.slice(0, 10) !== hoy;
  // Sin resultado: SOLO visitas comerciales que ya pasaron, sin resultado y no canceladas.
  return esCita(a) && f < ahora && !a.resultado;
}
export function agendaCounters(appts: any[], now: Date = new Date()) {
  const l = (appts || []).filter(Boolean);
  return {
    hoy: l.filter((a) => enFiltro(a, "hoy", now)).length,
    proximas: l.filter((a) => enFiltro(a, "proximas", now)).length,
    sinResultado: l.filter((a) => enFiltro(a, "sinResultado", now)).length,
    todas: l.length,
  };
}

// ── Duplicados (advertencia, no bloqueo) ────────────────────────────────────
const digitos = (s: any) => String(s || "").replace(/\D/g, "").slice(-10);
const minutos = (f: string) => { const t = new Date(fechaLocal(f)).getTime(); return isNaN(t) ? NaN : t / 60000; };
export function duplicateApptCandidate(appts: any[], nueva: any, ventanaMin = 180): any | null {
  if (!esCita(nueva) || !nueva?.fecha) return null;
  const m = minutos(nueva.fecha), tel = digitos(nueva.telefono);
  return (appts || []).find((a) => {
    if (!a || !esCita(a) || isCancelled(a) || a.id === nueva.id || !a.fecha) return false;
    const d = Math.abs(minutos(a.fecha) - m);
    if (isNaN(d)) return false;
    if (nueva.sourceRecordId && a.sourceRecordId) {
      return String(a.sourceRecordId) === String(nueva.sourceRecordId) && (a.sourceRefIndex ?? null) === (nueva.sourceRefIndex ?? null) && d <= ventanaMin;
    }
    return !!tel && digitos(a.telefono) === tel && d <= 60;   // manual/legacy: mismo teléfono y misma hora aprox.
  }) || null;
}

// ── Mapas y calendarios ─────────────────────────────────────────────────────
export const direccionCompleta = (a: any) => [a?.direccion, a?.ciudad, a?.cp].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
// "Cómo llegar": destino = dirección de la cita (no se usa ni se guarda el GPS del usuario).
export const mapsLink = (a: any) => { const d = direccionCompleta(a); return d ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(d) : ""; };
export function detallesEvento(a: any): string[] {
  return [
    a.nombre ? `Cliente: ${a.nombre}` : "",
    a.telefono ? `Teléfono: ${a.telefono}` : "",
    a.direccion ? `Dirección: ${a.direccion}` : "",
    (a.ciudad || a.cp) ? `Ciudad/ZIP: ${[a.ciudad, a.cp].filter(Boolean).join(" ")}` : "",
    a.producto ? `Producto: ${a.producto}` : "",
    a.notas ? `Notas: ${a.notas}` : "",
    (a.createdByName || a.agente) ? `Agendada por: ${a.createdByName || a.agente}` : "",
  ].filter(Boolean);
}
// Apple Calendar (y cualquier calendario): archivo .ics en hora local flotante.
const icsFecha = (f: string) => fechaLocal(f).replace(/[-:]/g, "") + "00";
const icsTexto = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function icsEvento(a: any, titulo: string, now: Date = new Date()): string {
  const ini = fechaLocal(a.fecha);
  const fin = localDateTimeValue(new Date(new Date(ini).getTime() + 3600000));
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ImpactOS//Agenda//ES", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${a.id || now.getTime()}@impactos`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${icsFecha(ini)}`, `DTEND:${icsFecha(fin)}`,
    `SUMMARY:${icsTexto(titulo)}`,
    `DESCRIPTION:${icsTexto(detallesEvento(a).join("\n"))}`,
    direccionCompleta(a) ? `LOCATION:${icsTexto(direccionCompleta(a))}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

// ── Registro de origen de la cita (para sincronizar una venta) ──────────────
// 1) sourceSection + sourceRecordId (referidos: + sourceRefIndex) → el registro EXACTO.
// 2) Solo citas legacy SIN trazabilidad → por teléfono.
export function sourceRecordForAppt(state: any, a: any): { section: string; id: string; refIdx?: number; via: "source" | "telefono" } | null {
  const sec = a?.sourceSection, sid = a?.sourceRecordId;
  if (sec && sid != null && sid !== "") {
    const lista = Array.isArray(state?.[sec]) ? state[sec] : [];
    const rec = lista.find((r: any) => r && String(r.id) === String(sid));
    if (rec) {
      if (sec === "referidos") {
        const idx = Number(a.sourceRefIndex);
        const refs = Array.isArray(rec.referidos) ? rec.referidos : Object.values(rec.referidos || {});
        if (Number.isInteger(idx) && refs[idx]) return { section: sec, id: String(rec.id), refIdx: idx, via: "source" };
      } else return { section: sec, id: String(rec.id), via: "source" };
    }
    return null;              // tiene trazabilidad pero el registro no está: NO adivinar por teléfono
  }
  const tel = digitos(a?.telefono);
  if (!tel) return null;
  for (const g of ["agregados", "prospectos", "distribucion"]) {
    const m = (state?.[g] || []).find((c: any) => c && digitos(c.telefono) === tel);
    if (m) return { section: g, id: String(m.id), via: "telefono" };
  }
  return null;
}

// ── Trazabilidad central de cambios (se aplica en setAppts, solo v2) ────────
// • Resultado nuevo o distinto registrado por STAFF → resultByUid/Name/At.
// • Un telemarketing NO cambia campos de resultado (de ningún evento): se conserva el anterior.
// • Nadie reescribe la autoría ni el registro de origen de una cita existente.
export function trazarCambiosAppts(prev: any[], next: any[], autor: Autor, role: string, now: Date = new Date()): any[] {
  const antes = new Map<string, any>();
  (prev || []).forEach((a) => { if (a && a.id != null) antes.set(String(a.id), a); });
  let cambio = false;
  const out = (next || []).map((a) => {
    if (!a || a.id == null) return a;
    const p = antes.get(String(a.id));
    if (!p || p === a) return a;
    let n = a;
    const fija = (campos: string[]) => campos.forEach((k) => { if (n[k] !== p[k]) { if (n === a) n = { ...a }; if (p[k] === undefined) delete n[k]; else n[k] = p[k]; } });
    fija(CAMPOS_TRAZA);
    if (!canRecordVisitResult(role)) fija(CAMPOS_RESULTADO);   // igual que firestore.rules (appts)
    else if (n.resultado && n.resultado !== p.resultado && !(n.resultByUid && n.resultAt && n.resultAt !== p.resultAt)) {
      n = { ...n, resultByUid: autor.uid, resultByName: autor.nombre, resultAt: now.toISOString() };
    }
    if (n !== a) cambio = true;
    return n;
  });
  return cambio ? out : next;
}

// ── "Nueva visita" desde la Agenda: buscar el cliente en MI cartera ─────────
// allData ya llega acotado por Firestore (el telemarketing solo recibe lo suyo).
export function candidatosCartera(allData: any) {
  const base = ["agregados", "prospectos", "distribucion"].flatMap((sec) =>
    (Array.isArray(allData?.[sec]) ? allData[sec] : []).filter((r: any) => r && !r.eliminado && (r.nombre || r.telefono))
      .map((r: any) => ({ key: `${sec}:${r.id}`, section: sec, recId: String(r.id), nombre: r.nombre || "", telefono: r.telefono || "", direccion: r.direccion || "", ciudad: r.ciudad || "", cp: r.cp || "", producto: r.producto || "" })));
  const refs = (Array.isArray(allData?.referidos) ? allData.referidos : []).filter((a: any) => a && !a.eliminado).flatMap((anf: any) =>
    (Array.isArray(anf.referidos) ? anf.referidos : Object.values(anf.referidos || {})).map((r: any, i: number) => r && (r.nombre || r.telefono)
      ? { key: `referidos:${anf.id}::${i}`, section: "referidos", recId: String(anf.id), refIdx: i, nombre: r.nombre || "", telefono: r.telefono || "", direccion: r.direccion || "", ciudad: r.ciudad || anf.anfitrion_ciudad || "", cp: r.cp || "", producto: "" }
      : null).filter(Boolean));
  return [...base, ...refs];
}
export function buscarEnCartera(cands: any[], q: string) {
  const t = String(q || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), d = String(q || "").replace(/\D/g, "");
  if (!t) return cands;
  const n = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return cands.filter((c) => n(c.nombre).includes(t) || n(c.ciudad).includes(t) || (d.length >= 3 && String(c.telefono).replace(/\D/g, "").includes(d)));
}

// ── Cita desde Llamadas (CallCenterV2 · "Cita agendada") ─────────────────────
// Misma cita que guardaba Llamadas (traza del registro real + _type), ahora con la
// misma revisión de duplicados que la Agenda. "Guardar de todos modos" = forzar.
export function citaDesdeLlamada(appt: any, traza: any, id: any) {
  return { ...appt, ...(traza || {}), id, _type: appt?.tipo };
}
export function revisarDuplicado(appts: any, nueva: any, forzar = false) {
  return forzar ? null : duplicateApptCandidate(appts, nueva);
}

// ── Solo lectura para telemarketing (mismo criterio que firestore.rules tmActualizaOk) ──
// Cita cancelada, o con resultado físico ya registrado (incluye legacy venta/no_venta):
// la TLK puede verla, llamar, escribir por WhatsApp y abrir Maps, pero no editarla,
// reprogramarla, cancelarla ni registrar resultado. El staff sí la gestiona.
export const tieneResultado = (a: any) => a?.resultado != null && String(a.resultado) !== "";
export const citaSoloLectura = (a: any, role: string) => !canRecordVisitResult(role) && (isCancelled(a) || tieneResultado(a));
// Botones de gestión en la tarjeta v2 (Llamar / WhatsApp / Cómo llegar no dependen de esto).
// Staff: igual que r1/r2. Telemarketing: nada si la cita es de solo lectura.
export function accionesCitaV2(a: any, puedeResultado: boolean) {
  const cancelada = isCancelled(a), conResultado = tieneResultado(a);
  const soloLectura = !puedeResultado && (cancelada || conResultado);
  const resultadoFisico = esCita(a) || String(a?.tipo || a?._type) === "cocinada";
  return {
    soloLectura,
    registrarResultado: puedeResultado && resultadoFisico && !cancelada,
    editar: !cancelada && !soloLectura,
    reprogramar: !cancelada && !conResultado,
    cancelar: !cancelada && !conResultado,
  };
}
