import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itemsDe, priorizar, aplicarResultado, validarResultado, completarSeguimiento, cambiarEstadoV2, metricas, kpis,
  resultadoDe, etapaDe, clasificar, especialidadDe, agregarNotaV2,
} from "../src/services/callWorkflow";
import { trazaRegistro, enrichNewAppts } from "../src/services/apptTrace";
import { apptDoc, diffState, emptyDocs } from "../src/data/storeCore";
import { applyAssignments } from "../src/services/assignmentWriter";
// @ts-ignore
import { fakeDb } from "./fakeFirestore.mjs";

const NOW = new Date(2026, 8, 24, 11, 0, 0);   // 24/09/2026 local
const HOY = "2026-09-24";
const hace = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TLK = { uid: "tlk1", nombre: "Yelitza" };
const reg = (id: string, x: any = {}) => ({ id, nombre: "Cliente " + id, telefono: "2545550" + id, ciudad: "Dallas", cp: "75217", estado: "sin_estado", assignedTo: "tlk1", historial: [], ...x });
const prio = (items: any[], esp: any = "ventas") => priorizar(items, esp, NOW);
const motivoDe = (st: any, id: string, esp: any = "ventas") => prio(itemsDe(st, esp, "tlk1"), esp).find((p) => p.recId === id)?.motivo;

// ── 17. No perder seguimientos ──────────────────────────────────────────────
test("Seguimiento vencido 1, 5 y 30 días aparece (ninguno desaparece por tiempo)", () => {
  const st = { agregados: [reg("a1", { proximo_seguimiento: hace(1), estado: "naranja" }), reg("a5", { proximo_seguimiento: hace(5), estado: "naranja" }), reg("a30", { proximo_seguimiento: hace(30), estado: "naranja" }), reg("a365", { proximo_seguimiento: hace(365) })] };
  assert.equal(motivoDe(st, "a1"), "Seguimiento vencido · 1 día");
  assert.equal(motivoDe(st, "a5"), "Seguimiento vencido · 5 días");
  assert.equal(motivoDe(st, "a30"), "Seguimiento vencido · 30 días");
  assert.equal(motivoDe(st, "a365"), "Seguimiento vencido · 365 días");
  // el más vencido va primero dentro de los vencidos
  assert.deepEqual(prio(itemsDe(st, "ventas", "tlk1")).map((p) => p.recId), ["a365", "a30", "a5", "a1"]);
});
test("Cambiar estado NO borra proximo_seguimiento", () => {
  const r = cambiarEstadoV2(reg("x", { proximo_seguimiento: "2026-09-30" }), "azul");
  assert.equal(r.estado, "azul"); assert.equal(r.proximo_seguimiento, "2026-09-30");
  // tampoco un "no contestó" o "buzón" sobre un seguimiento abierto
  ["no_contesto", "buzon"].forEach((id) => assert.equal(aplicarResultado(reg("x", { proximo_seguimiento: hace(3) }), "ventas", id, {}, TLK, NOW).proximo_seguimiento, hace(3)));
});
test("Reprogramar sustituye la fecha anterior; completar cierra", () => {
  const r = aplicarResultado(reg("x", { proximo_seguimiento: hace(4) }), "ventas", "llamar_despues", { fecha: "2026-10-02", hora: "17:00", nota: "después de las 5" }, TLK, NOW);
  assert.equal(r.proximo_seguimiento, "2026-10-02"); assert.equal(r.seguimiento_hora, "17:00");
  const c = completarSeguimiento(r, "ventas", TLK, NOW);
  assert.equal(c.proximo_seguimiento, "");
  assert.equal(c.historial[c.historial.length - 1].tipo, "seguimiento_completado");
  assert.equal(c.historial.length, 2);                   // no se borra nada del historial
});

// ── 18. Ventas ──────────────────────────────────────────────────────────────
test("TLK ventas solo trabaja registros asignados (y ve toda su cartera acumulada 50+25+10)", async () => {
  const seed: any = {};
  for (let i = 0; i < 85; i++) seed[`workspaces/impactos/records/r${i}`] = { ...reg(`r${i}`), assignedTo: null, section: "agregados" };
  const db = fakeDb(seed);
  const lote = async (a: number, b: number) => applyAssignments(db, "impactos", Array.from({ length: b - a }, (_, k) => ({ id: `r${a + k}`, expectedAssignedTo: null })), { kind: "assign", toUid: "tlk1", toName: "Yelitza", type: "ventas" }, "sup");
  await lote(0, 50); await lote(50, 75); await lote(75, 85);
  const agregados = [...db._data.values()];
  agregados.push({ ...reg("ajeno"), assignedTo: "tlk2" });
  const items = itemsDe({ agregados, prospectos: [reg("p1")], referidos: [{ id: "anf1", anfitrion: "Ana", assignedTo: "tlk1", referidos: [{ nombre: "Luis", telefono: "2545551111" }] }, { id: "anf2", assignedTo: "otro", referidos: [{ nombre: "X", telefono: "1" }] }] }, "ventas", "tlk1");
  assert.equal(items.length, 85 + 1 + 1);               // sin límite; sin registros ajenos
  assert.ok(!items.some((i) => i.recId === "ajeno" || i.recId === "anf2"));
  const ref = items.find((i) => i.section === "referidos")!;
  assert.equal(ref.anfitrion, "Ana"); assert.equal(ref.fuente, "Referido");
});
test("Cita agendada genera appt con createdByUid, sourceRecordId y sourceSection; no pisa el assignedTo del distribuidor", () => {
  const it = itemsDe({ prospectos: [reg("p9")] }, "ventas", "tlk1")[0];
  const cita = { nombre: it.nombre, telefono: it.telefono, fecha: "2026-09-26T18:00", tipo: "cita", assignedTo: "dist1" };
  const nuevas = enrichNewAppts([], [{ ...cita, ...trazaRegistro(it), id: "c1", _type: "cita" }], TLK);
  const doc = apptDoc(nuevas[0], undefined, { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Yelitza" });
  assert.equal(doc.createdByUid, "tlk1"); assert.equal(doc.createdByName, "Yelitza");
  assert.equal(doc.sourceRecordId, "p9"); assert.equal(doc.sourceSection, "prospectos");
  assert.equal(doc.assignedTo, "dist1");
  // y el registro queda con la cita y el seguimiento cerrado
  const r = aplicarResultado({ ...it.raw, proximo_seguimiento: hace(2) }, "ventas", "cita_agendada", { fechaCita: cita.fecha }, TLK, NOW);
  assert.equal(r.estado, "verde"); assert.equal(r.proximo_seguimiento, ""); assert.equal(r.ultima_cita_programada, "2026-09-26T18:00");
  // una cita de un referido apunta al anfitrión real + índice
  assert.deepEqual(trazaRegistro({ section: "referidos", recId: "anf1", refIdx: 2 }), { sourceRecordId: "anf1", sourceSection: "referidos", sourceRefIndex: 2 });
  // editar la cita después no cambia su origen
  const editada = apptDoc({ ...doc, sourceRecordId: "OTRO", notas: "x" }, doc, { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Angie" });
  assert.equal(editada.sourceRecordId, "p9");
});
test("Llamar después exige seguimiento; En proceso exige próximo paso y fecha", () => {
  assert.match(validarResultado("ventas", "llamar_despues", {}), /fecha/);
  assert.equal(validarResultado("ventas", "llamar_despues", { fecha: "2026-10-01" }), "");
  assert.match(validarResultado("ventas", "en_proceso", { fecha: "2026-10-01" }), /próximo paso/);
  assert.match(validarResultado("ventas", "en_proceso", { paso: "enviar_informacion" }), /fecha/);
  assert.equal(validarResultado("ventas", "en_proceso", { paso: "enviar_informacion", fecha: "2026-10-01" }), "");
  const r = aplicarResultado(reg("x"), "ventas", "en_proceso", { paso: "esperando_respuesta", fecha: "2026-09-28", nota: "habla con su esposo" }, TLK, NOW);
  assert.equal(r.proximo_paso, "esperando_respuesta"); assert.equal(r.proximo_seguimiento, "2026-09-28");
});
test("Contacto efectivo: No contestó y Buzón NO; En proceso SÍ; Cita = contacto + productivo", () => {
  const c = (id: string) => resultadoDe("ventas", id)!;
  assert.equal(c("no_contesto").contacto, false);
  assert.equal(c("buzon").contacto, false);
  assert.equal(c("en_proceso").contacto, true);
  assert.equal(c("cita_agendada").contacto, true); assert.equal(c("cita_agendada").productivo, true);
  let r: any = reg("m");
  ["no_contesto", "buzon"].forEach((id) => { r = aplicarResultado(r, "ventas", id, {}, TLK, NOW); });
  r = aplicarResultado(r, "ventas", "en_proceso", { paso: "llamar_nuevamente", fecha: "2026-09-25" }, TLK, NOW);
  r = aplicarResultado(r, "ventas", "cita_agendada", {}, TLK, NOW);
  const m = metricas([{ ...itemsDe({ agregados: [r] }, "ventas", "tlk1")[0] }], "tlk1", HOY);
  assert.deepEqual({ i: m.intentos, c: m.contactos, p: m.productivos, conv: m.conversion }, { i: 4, c: 2, p: 1, conv: 50 });
});
test("Un cambio de estado o una entrada vieja NO cuenta como llamada", () => {
  assert.equal(clasificar({ tipo: "estado", estado: "verde", fecha: `${HOY}T10:00` }), null);
  assert.equal(clasificar({ tipo: "llamada", fecha: `${HOY}T10:00` }), null);   // sin clasificar (formato viejo)
  const it = itemsDe({ agregados: [reg("v", { historial: [{ tipo: "estado", fecha: `${HOY}T09:00:00` }, { tipo: "llamada", fecha: `${HOY}T09:30:00` }] })] }, "ventas", "tlk1");
  const m = metricas(it, "tlk1", HOY);
  assert.equal(m.intentos, 0); assert.equal(m.sinClasificar, 2);
});
test("Prioridad con razón visible y orden correcto", () => {
  const st = { agregados: [
    reg("rot", { ultimo_llamado: `${hace(3)}T10:00:00`, historial: [{ tipo: "llamada", fecha: `${hace(3)}T10:00:00` }], estado: "azul" }),
    reg("nuevo", { creado: "2026-09-20" }),
    reg("hoy", { proximo_seguimiento: HOY, estado: "naranja" }),
    reg("venc", { proximo_seguimiento: hace(2), estado: "naranja" }),
    reg("proc", { ultimoResultado: "en_proceso", ultimo_llamado: `${hace(1)}T10:00:00`, estado: "naranja" }),
    reg("futuro", { proximo_seguimiento: "2026-10-10", estado: "naranja" }),
    reg("cita", { estado: "verde", ultimo_llamado: `${hace(1)}T10:00:00` }),
    reg("no", { estado: "rojo" }), reg("mal", { estado: "numero_equivocado" }),
  ] };
  const p = prio(itemsDe(st, "ventas", "tlk1"));
  assert.deepEqual(p.map((x) => [x.recId, x.motivo]), [
    ["hoy", "Seguimiento hoy"], ["venc", "Seguimiento vencido · 2 días"], ["nuevo", "Nunca llamado"], ["proc", "En proceso"], ["rot", "Rotación"],
  ]);
});

// ── 19. Cobranza ────────────────────────────────────────────────────────────
// Cuentas de Cobranza AUTOSUFICIENTES (con su copia de contacto, como las deja la migración).
// Distribución es de Ventas: aunque esté en el estado, la TLK de Cobranza no la trabaja.
const cob = (x: any = {}) => ({ cobranza: { clientesData: {
  d1: { assignedTo: "tlk1", linkedRecordId: "d1", nombre: "María González", tel: "2145551234", ciudad: "Dallas", cp: "75217", saldo: 900, historial: [{ fecha: "2026-08-01", tipo: "pago", monto: 90, metodo: "cash" }], ...x },
  d5: { assignedTo: "tlk1", nombre: "Luis", tel: "2145559999", saldo: 300 },
  d2: { assignedTo: "otro", saldo: 100 },
} }, distribucion: [{ id: "d1", nombre: "María González", telefono: "2145551234", assignedTo: "eva" }, { id: "d3", nombre: "Venta de tlk1", assignedTo: "tlk1" }] });
test("Cobranza: SOLO sus cuentas de cobranza; nunca registros de Distribución", () => {
  const it = itemsDe(cob(), "cobranza", "tlk1");
  assert.deepEqual(it.map((i) => `${i.section}:${i.recId}`).sort(), ["cobranza:d1", "cobranza:d5"]);
  const m = it.find((i) => i.recId === "d1")!;
  assert.equal(m.nombre, "María González"); assert.equal(m.telefono, "2145551234");   // de la propia cuenta
});
test("Compromiso de pago guarda fecha y monto en el formato de Cobranza; cuenta como productivo", () => {
  assert.match(validarResultado("cobranza", "compromiso_pago", {}), /fecha prometida/);
  const base = cob().cobranza.clientesData.d1;
  const r = aplicarResultado(base, "cobranza", "compromiso_pago", { fecha: "2026-09-30", monto: "120", nota: "paga el viernes" }, TLK, NOW);
  assert.deepEqual(r.promesa, { fecha: "2026-09-30", hora: "", monto: 120 });
  assert.equal(r.historial[r.historial.length - 1].tipo, "promesa");          // lo que pinta Cobranza
  assert.equal(r.historial.length, 2);                                         // el pago viejo sigue
  assert.equal(r.gestiones.length, 1); assert.equal(r.gestiones[0].productivo, true);
  assert.equal(r.proximo_seguimiento, "2026-09-30");
  const m = metricas(itemsDe({ cobranza: { clientesData: { d1: r } } }, "cobranza", "tlk1"), "tlk1", HOY);
  assert.equal(m.productivos, 1);
});
test("La llamada de cobranza NO se mezcla con el historial de pagos", () => {
  const r = aplicarResultado(cob().cobranza.clientesData.d1, "cobranza", "no_contesto", {}, TLK, NOW);
  assert.equal(r.historial.length, 1);                                         // solo el pago original
  assert.equal(r.gestiones[0].contacto, false);                                // no contestó ≠ contacto
});
test("Promesa incumplida vuelve a prioridad de inmediato", () => {
  const r = aplicarResultado(cob({ promesa: { fecha: "2026-09-30", monto: 50 } }).cobranza.clientesData.d1, "cobranza", "promesa_incumplida", {}, TLK, NOW);
  assert.equal(r.promesa, null);
  assert.equal(r.historial[r.historial.length - 1].tipo, "promesa_rota");
  const st = cob(); st.cobranza.clientesData.d1 = r;
  const p = prio(itemsDe(st, "cobranza", "tlk1"), "cobranza");
  assert.equal(p[0].recId, "d1"); assert.equal(p[0].motivo, "Promesa incumplida"); assert.equal(p[0].rank, 1);
});
test("Cobranza: seguimiento vencido nunca desaparece; promesa de hoy y vencida con su razón", () => {
  assert.equal(motivoDe(cob({ proximo_seguimiento: hace(40) }), "d1", "cobranza"), "Seguimiento vencido · 40 días");
  assert.equal(motivoDe(cob({ promesa: { fecha: HOY } }), "d1", "cobranza"), "Promesa de pago hoy");
  assert.equal(motivoDe(cob({ promesa: { fecha: hace(3) } }), "d1", "cobranza"), "Promesa vencida · 3 días");
});

// ── 20. Reclutamiento ───────────────────────────────────────────────────────
const rc = (x: any = {}) => ({ reclutamiento: [{ id: "rc1", nombre: "Pedro", telefono: "2545552222", resultado: "Pendiente", assignedTo: "tlk1", ...x }, { id: "rc2", nombre: "Otro", assignedTo: "otro" }] });
test("Reclutamiento: solo prospectos asignados", () => {
  assert.deepEqual(itemsDe(rc(), "reclutamiento", "tlk1").map((i) => i.recId), ["rc1"]);
});
test("Interesado requiere seguimiento; mueve la etapa a Interesado", () => {
  assert.match(validarResultado("reclutamiento", "interesado", {}), /fecha/);
  const r = aplicarResultado(rc().reclutamiento[0], "reclutamiento", "interesado", { fecha: "2026-09-27" }, TLK, NOW);
  assert.equal(r.etapa, "interesado"); assert.equal(r.proximo_seguimiento, "2026-09-27");
  assert.equal(r.resultado, "Pendiente");                                      // el campo viejo no se toca
});
test("Entrevista agendada: crea appt con origen y autor, cambia la etapa y aparece en Reclutamiento → Entrevistas", () => {
  const it = itemsDe(rc(), "reclutamiento", "tlk1")[0];
  const appt = enrichNewAppts([], [{ id: "e1", tipo: "entrevista", fecha: "2026-09-25T10:00", nombre: "Pedro", ...trazaRegistro(it) }], TLK)[0];
  assert.equal(appt.createdByUid, "tlk1"); assert.equal(appt.sourceRecordId, "rc1"); assert.equal(appt.sourceSection, "reclutamiento");
  const r = aplicarResultado(it.raw, "reclutamiento", "entrevista_agendada", { fechaCita: "2026-09-25T10:00" }, TLK, NOW);
  assert.equal(r.etapa, "entrevista_agendada");
  assert.equal(r.entrevista_agendada, "2026-09-25T10:00");                     // lo que filtra la pestaña Entrevistas
  assert.equal(etapaDe(r), "entrevista_agendada");
});
test("Etapas: entrevistado ≠ nuevo socio; compatibilidad con 2da entrevista, Nuevo socio, No contratado y No se presentó", () => {
  assert.equal(etapaDe({ entrevistado: true, resultado: "Pendiente" }), "entrevistado");
  assert.notEqual(etapaDe({ entrevistado: true }), "nuevo_socio");
  assert.equal(etapaDe({ resultado: "2da entrevista", entrevistado: true }), "segunda_entrevista");
  assert.equal(etapaDe({ resultado: "Nuevo socio" }), "nuevo_socio");
  assert.equal(etapaDe({ resultado: "No contratado" }), "no_contratado");
  assert.equal(etapaDe({ resultado: "No se presentó" }), "no_se_presento");
  assert.equal(etapaDe({}), "nuevo");
  // cerrados fuera de la cola; 2da entrevista sigue en juego
  const st = { reclutamiento: [
    { id: "s", assignedTo: "tlk1", resultado: "Nuevo socio" }, { id: "n", assignedTo: "tlk1", resultado: "No contratado" },
    { id: "d", assignedTo: "tlk1", resultado: "2da entrevista", proximo_seguimiento: HOY },
  ] };
  assert.deepEqual(prio(itemsDe(st, "reclutamiento", "tlk1"), "reclutamiento").map((p) => p.recId), ["d"]);
});

// ── Otros ───────────────────────────────────────────────────────────────────
test("Especialidad por rol; staff no usa la bandeja de telemarketing", () => {
  assert.equal(especialidadDe("telemarketing_ventas"), "ventas");
  assert.equal(especialidadDe("telemarketing_cobranza"), "cobranza");
  assert.equal(especialidadDe("telemarketing_reclutamiento"), "reclutamiento");
  ["distribuidor", "supervisor", "super_admin"].forEach((r) => assert.equal(especialidadDe(r), null));
});
test("Nota: conserva la nota vieja en texto y el historial previo al reasignar", () => {
  const r = agregarNotaV2({ id: "x", notas: "nota vieja", historial: [{ tipo: "llamada", fecha: "2026-01-01", agente: "Otra" }] }, "nueva", TLK, "ventas", NOW);
  assert.equal(r.notas.length, 2); assert.equal(r.notas[0].texto, "nota vieja"); assert.equal(r.ultimaNota, "nueva");
  assert.equal(r.historial.length, 1);
  const k = kpis(itemsDe({ agregados: [{ ...r, assignedTo: "tlk1" }] }, "ventas", "tlk1"), "ventas", "tlk1", NOW);
  assert.equal(k.cartera, 1);
});

// ════════════════════════ r2 ════════════════════════
import { queriesFor } from "../src/data/schema";
import { buildState } from "../src/data/storeCore";
import { ultimaNotaDe, tienePromesa, resultadosPara } from "../src/services/callWorkflow";

// ── 1. Cobranza ↔ Distribución: un solo responsable, atómico ──────────────────
const W = "workspaces/impactos/records/";
const semillaCob = () => fakeDb({
  [W + "cob_d1"]: { id: "cob_d1", section: "cobranza", appId: "impactos", legacyId: "d1", linkedRecordId: "d1", saldo: 1200, pagoMensual: 90, historial: [{ fecha: "2026-08-01", tipo: "pago", monto: 90 }], assignedTo: null, assignmentHistory: [] },
  [W + "d1"]: { id: "d1", section: "distribucion", appId: "impactos", nombre: "María", telefono: "2145551234", direccion: "10 Elm St", ciudad: "Dallas", cp: "75217", notas: "cliente puntual", historial: [{ tipo: "llamada", fecha: "2026-07-01" }], assignedTo: null, assignmentHistory: [] },
  [W + "a1"]: { id: "a1", section: "agregados", appId: "impactos", nombre: "Ventas", assignedTo: "tlkV", assignmentHistory: [] },
});
const leer = (db: any, uid: string, role: string) => {        // simula las consultas de la TLK (assignedTo == uid && section == …)
  const docs = [...db._data.entries()].filter(([k]: any) => k.startsWith(W)).map(([, v]: any) => v);
  const out: any = { records: {}, appts: {}, shared: {}, userData: {} };
  queriesFor({ role, uid }, "records").forEach((q) => docs.filter((d: any) => q.where.every(([f, , v]) => d[f] === v)).forEach((d: any) => { out.records[d.id] = d; }));
  return out;
};
const asignar = (db: any, ids: string[], to: string | null, esperado: any = null, reasignar = false) => applyAssignments(db, "impactos",
  ids.map((id) => ({ id, expectedAssignedTo: esperado })),
  to ? { kind: "assign", toUid: to, toName: to, type: "cobranza", allowReassign: reasignar } : { kind: "unassign" }, "sup");

test("Cuenta de Cobranza sin datos del cliente: no entra a Prioridad (no hay a quién llamar)", () => {
  const st = { cobranza: { clientesData: { x9: { assignedTo: "tlk1", saldo: 50 } } } };
  const it = itemsDe(st, "cobranza", "tlk1");
  assert.equal(it[0].sinDatos, true);
  assert.equal(prio(it, "cobranza").length, 0);
});

// ── 2. No se presentó es final ──────────────────────────────────────────────
test("No se presentó NO vuelve a Prioridad; sigue en Etapas; reactivar es explícito", () => {
  const st = { reclutamiento: [
    { id: "ns", assignedTo: "tlk1", resultado: "No se presentó", proximo_seguimiento: hace(3) },
    { id: "ok", assignedTo: "tlk1", resultado: "Pendiente" },
  ] };
  const it = itemsDe(st, "reclutamiento", "tlk1");
  assert.deepEqual(prio(it, "reclutamiento").map((p) => p.recId), ["ok"]);
  assert.equal(it.find((i) => i.recId === "ns")!.etapa, "no_se_presento");        // visible en Etapas
  // aunque la bandeja la hubiera dejado en "Entrevista agendada", la decisión de Reclutamiento manda
  assert.equal(etapaDe({ etapa: "entrevista_agendada", resultado: "No se presentó" }), "no_se_presento");
  // reactivar: en Reclutamiento se vuelve a "Pendiente" → regresa al flujo
  const re = itemsDe({ reclutamiento: [{ id: "ns", assignedTo: "tlk1", resultado: "Pendiente", etapa: "entrevista_agendada", proximo_seguimiento: hace(3) }] }, "reclutamiento", "tlk1");
  assert.equal(prio(re, "reclutamiento")[0].motivo, "Seguimiento vencido · 3 días");
});

// ── 3. Última nota histórica ────────────────────────────────────────────────
test("Última nota: texto legacy, notas[] por fecha, historial, y ultimaNota explícita gana", () => {
  assert.equal(ultimaNotaDe({ notas: "hablar con su esposo" }), "hablar con su esposo");
  const arr = [{ texto: "primera", fecha: "2026-08-01T10:00:00Z" }, { texto: "última conversación", fecha: "2026-09-01T10:00:00Z" }, { texto: "", fecha: "2026-09-10T10:00:00Z" }, { texto: "media", fecha: "2026-08-15T10:00:00Z" }];
  const rec = { notas: arr };
  assert.equal(ultimaNotaDe(rec), "última conversación");
  assert.equal(rec.notas, arr); assert.equal(arr.length, 4);                         // no se altera el array
  assert.equal(ultimaNotaDe({ notas: [{ texto: "a" }, { texto: "b" }] }), "b");     // sin fecha: por posición
  assert.equal(ultimaNotaDe({ historial: [{ tipo: "llamada", notas: "vieja", fecha: "2026-07-01" }, { tipo: "llamada", notas: "llamar a las 5", fecha: "2026-09-02" }, { tipo: "estado", fecha: "2026-09-05" }] }), "llamar a las 5");
  assert.equal(ultimaNotaDe({ ultimaNota: "explícita", notas: arr, historial: [{ notas: "x", fecha: "2030-01-01" }] }), "explícita");
  assert.equal(ultimaNotaDe({}), "");
  // y la tarjeta la muestra
  assert.equal(itemsDe({ agregados: [reg("n", { notas: arr })] }, "ventas", "tlk1")[0].ultimaNota, "última conversación");
});

// ── 4. Informa que pagó: fuera de Prioridad solo hoy ────────────────────────
test("Informa que pagó: hoy va a Trabajados, no a Prioridad; mañana se evalúa normal; no crea pago", () => {
  const base = cob({ promesa: { fecha: HOY, monto: 90 }, saldo: 900, ultimoPago: "2026-08-01" }).cobranza.clientesData.d1;
  const r = aplicarResultado(base, "cobranza", "pago_informado", { nota: "dice que pagó por Zelle" }, TLK, NOW);
  assert.equal(r.saldo, 900); assert.equal(r.ultimoPago, "2026-08-01");
  assert.ok(!r.historial.some((h: any) => h.tipo === "pago" && h.fecha === HOY));   // ningún pago nuevo
  const st = cob(); st.cobranza.clientesData.d1 = r;
  const enCola = (now: Date) => priorizar(itemsDe(st, "cobranza", "tlk1"), "cobranza", now).map((p) => p.recId);
  assert.ok(!enCola(NOW).includes("d1"));                                           // hoy: fuera de Prioridad
  assert.ok(enCola(NOW).includes("d5"));                                            // el resto de la cartera sigue
  const ti = itemsDe(st, "cobranza", "tlk1").find((i) => i.recId === "d1")!;
  assert.equal((ti.raw.ultimo_llamado || "").slice(0, 10), new Date(NOW).toISOString().slice(0, 10)); // aparece en Trabajados hoy
  const manana = new Date(NOW); manana.setDate(manana.getDate() + 1);
  st.cobranza.clientesData.d1 = { ...r, promesa: null };
  assert.ok(enCola(manana).includes("d1"));                                         // mañana se evalúa normal
});

// ── 5. Promesa incumplida solo con promesa ──────────────────────────────────
test("Sin promesa no se puede registrar Promesa incumplida (ni aparece la opción)", () => {
  const sin = cob().cobranza.clientesData.d1;
  assert.equal(tienePromesa(sin), false);
  assert.match(validarResultado("cobranza", "promesa_incumplida", {}, sin), /no tiene una promesa/);
  assert.ok(!resultadosPara("cobranza", sin).some((r) => r.id === "promesa_incumplida"));
  const con = cob({ promesa: { fecha: hace(2), monto: 50 } }).cobranza.clientesData.d1;
  assert.equal(validarResultado("cobranza", "promesa_incumplida", {}, con), "");
  assert.ok(resultadosPara("cobranza", con).some((r) => r.id === "promesa_incumplida"));
});

// ════════ Distribución ES Ventas; Cobranza es otra especialidad (sin acoplamiento) ════════
import { completarContactoCobranza, SECTION_ASSIGNMENT, SECTIONS_FOR_ROLE } from "../src/data/schema";
import { planMigration, verifyMigration } from "../src/services/migration";
const W2 = "workspaces/impactos/records/";
const cliente = (cobDe: string | null, distDe: string | null) => fakeDb({
  [W2 + "cob_d1"]: { id: "cob_d1", section: "cobranza", linkedRecordId: "d1", nombre: "María", tel: "2145551234", saldo: 1200, historial: [{ fecha: "2026-08-01", tipo: "pago", monto: 90 }],
    assignedTo: cobDe, assignedToName: cobDe || "", assignmentType: "cobranza", assignmentHistory: cobDe ? [{ userId: cobDe, unassignedAt: null }] : [] },
  [W2 + "d1"]: { id: "d1", section: "distribucion", nombre: "María", telefono: "2145551234", notas: "cliente puntual", historial: [{ tipo: "llamada", fecha: "2026-07-01" }],
    assignedTo: distDe, assignedToName: distDe || "", assignmentType: "ventas", assignmentHistory: distDe ? [{ userId: distDe, unassignedAt: null }] : [] },
});
const duenos = (db: any) => [db._data.get(W2 + "cob_d1").assignedTo, db._data.get(W2 + "d1").assignedTo];
const mover = (db: any, id: string, de: any, a: string, tipo: any) => applyAssignments(db, "impactos", [{ id, expectedAssignedTo: de }], { kind: "assign", toUid: a, toName: a, type: tipo, allowReassign: true }, "sup");
const recibe = (db: any, uid: string, role: string) => {
  const docs = [...db._data.entries()].filter(([k]: any) => k.startsWith(W2)).map(([, v]: any) => v);
  return new Set(queriesFor({ role, uid }, "records").flatMap((q) => docs.filter((d: any) => q.where.every(([f, , v]) => d[f] === v)).map((d: any) => d.id)));
};

test("Mapa: Distribución es Ventas; Cobranza solo sus cuentas", () => {
  assert.equal(SECTION_ASSIGNMENT.distribucion, "ventas");
  assert.deepEqual(SECTIONS_FOR_ROLE.telemarketing_ventas, ["agregados", "referidos", "prospectos", "distribucion"]);
  assert.deepEqual(SECTIONS_FOR_ROLE.telemarketing_cobranza, ["cobranza"]);
  assert.deepEqual(SECTIONS_FOR_ROLE.telemarketing_reclutamiento, ["reclutamiento"]);
});
test("A) Distribución con Eva (Ventas) y Cobranza enlazada con Angie: estado válido, nada cambia solo", async () => {
  const db = cliente("angie", "eva");
  const r = await applyAssignments(db, "impactos", [{ id: "cob_d1", expectedAssignedTo: "angie" }], { kind: "assign", toUid: "angie", toName: "angie", type: "cobranza" }, "sup");
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(duenos(db), ["angie", "eva"]);
  assert.equal(db._data.get(W2 + "d1").assignmentHistory.length, 1);
});
test("B) Reasignar Cobranza Angie → Carla: Distribución sigue con Eva", async () => {
  const db = cliente("angie", "eva");
  const r = await mover(db, "cob_d1", "angie", "carla", "cobranza");
  assert.equal(r.ok, 1);
  assert.deepEqual(duenos(db), ["carla", "eva"]);
  assert.equal(db._data.get(W2 + "d1").assignmentHistory.length, 1);                 // Distribución intacta
  assert.equal(db._data.get(W2 + "d1").notas, "cliente puntual");
});
test("C) Reasignar Distribución Eva → Yelitza: Cobranza sigue con Angie", async () => {
  const db = cliente("angie", "eva");
  await mover(db, "d1", "eva", "yelitza", "ventas");
  assert.deepEqual(duenos(db), ["angie", "yelitza"]);
  assert.equal(db._data.get(W2 + "cob_d1").assignmentHistory.length, 1);
  assert.deepEqual(db._data.get(W2 + "cob_d1").historial, [{ fecha: "2026-08-01", tipo: "pago", monto: 90 }]);
  // retirar tampoco arrastra al otro
  await applyAssignments(db, "impactos", [{ id: "cob_d1", expectedAssignedTo: "angie" }], { kind: "unassign" }, "sup");
  assert.deepEqual(duenos(db), [null, "yelitza"]);
});
test("D) TLK Ventas recibe Distribución; TLK Cobranza NO", () => {
  const db = cliente("angie", "eva");
  assert.ok(recibe(db, "eva", "telemarketing_ventas").has("d1"));
  assert.ok(!recibe(db, "angie", "telemarketing_cobranza").has("d1"));
  // y la bandeja de Ventas lo trabaja como Distribución
  const it = itemsDe({ distribucion: [db._data.get(W2 + "d1")] }, "ventas", "eva");
  assert.equal(it.length, 1); assert.equal(it[0].fuente, "Distribución");
});
test("E) TLK Cobranza recibe su cuenta; TLK Ventas NO recibe Cobranza", () => {
  const db = cliente("angie", "eva");
  assert.deepEqual([...recibe(db, "angie", "telemarketing_cobranza")], ["cob_d1"]);
  assert.ok(!recibe(db, "eva", "telemarketing_ventas").has("cob_d1"));
  assert.equal(itemsDe({ cobranza: { clientesData: { d1: db._data.get(W2 + "cob_d1") } } }, "ventas", "eva").length, 0);
});
test("F) Migración: cuenta de Cobranza enlazada sin nombre/teléfono → copia el contacto mínimo del cliente", () => {
  const estado = {
    distribucion: [{ id: "d1", nombre: "María", telefono: "2145551234", direccion: "10 Elm St", ciudad: "Dallas", cp: "75217", cuenta: "AC-9",
      notas: [{ texto: "nota comercial" }], historial: [{ tipo: "cita", cita_resultado: "demo_venta", monto: 3000 }], venta: true, resultado: "demo_venta" }],
    cobranza: { clientesData: {
      d1: { saldo: 1200, pagoMensual: 90, historial: [{ fecha: "2026-08-01", tipo: "pago", monto: 90 }] },
      d2: { saldo: 50, nombre: "Nombre propio", tel: "9725550000" },
    } },
  };
  const plan = planMigration(estado, "impactos", NOW);
  const c1 = plan.records.find((r: any) => r.id === "cob_d1")!;
  assert.equal(c1.linkedRecordId, "d1");
  assert.equal(c1.nombre, "María"); assert.equal(c1.tel, "2145551234"); assert.equal(c1.telefono, "2145551234");
  assert.equal(c1.direccion, "10 Elm St"); assert.equal(c1.ciudad, "Dallas"); assert.equal(c1.cp, "75217");
  assert.equal(c1.nroCuenta, "AC-9"); assert.equal(c1.cuenta, "AC-9");
  // NO viaja nada comercial
  assert.equal(c1.venta, undefined); assert.equal(c1.resultado, undefined); assert.equal(c1.notas, undefined);
  assert.deepEqual(c1.historial, [{ fecha: "2026-08-01", tipo: "pago", monto: 90 }]);     // solo sus pagos
  assert.equal(c1.saldo, 1200);
  assert.deepEqual(c1.contactoCopiadoDe.campos.sort(), ["ciudad", "cp", "cuenta", "direccion", "nombre", "nroCuenta", "tel", "telefono"]);
  // la bandeja de Cobranza ya tiene a quién llamar sin ver Distribución
  const it = itemsDe({ cobranza: { clientesData: { d1: { ...c1, assignedTo: "angie" } } } }, "cobranza", "angie");
  assert.equal(it[0].nombre, "María"); assert.equal(it[0].telefono, "2145551234"); assert.ok(!it[0].sinDatos);
  const rep = verifyMigration(estado, plan, "impactos", NOW);
  assert.equal(rep.ok, true); assert.equal(rep.cobranzaCompletadas, 1);
});
test("F2) Nunca se sobrescribe un dato que Cobranza ya tenga (en ninguna variante)", () => {
  const dist = { id: "d1", nombre: "María", telefono: "214", cuenta: "AC-9", ciudad: "Dallas" };
  const r = completarContactoCobranza({ linkedRecordId: "d1", nombre: "María R.", tel: "972", numeroCuenta: "X-1" }, dist);
  assert.equal(r.doc.nombre, "María R."); assert.equal(r.doc.tel, "972"); assert.equal(r.doc.telefono, undefined);
  assert.equal(r.doc.numeroCuenta, "X-1"); assert.equal(r.doc.cuenta, undefined); assert.equal(r.doc.nroCuenta, undefined);
  assert.equal(r.doc.ciudad, "Dallas"); assert.deepEqual(r.campos, ["ciudad"]);
  const sinNada = { linkedRecordId: "d1", nombre: "A", tel: "1", cuenta: "c", direccion: "x", ciudad: "y", cp: "z" };
  assert.equal(completarContactoCobranza(sinNada, dist).doc, sinNada);                  // nada que copiar: mismo objeto
});
test("F3) Al guardar desde la app, una cuenta nueva de un cliente de Distribución se enlaza y completa su contacto", () => {
  const d = emptyDocs(); d.records.d7 = { id: "d7", section: "distribucion", nombre: "Ana", telefono: "2145557777", ciudad: "Waco", assignedTo: "eva", notas: "comercial" };
  const prev = { cobranza: { clientesData: {} } }, next = { cobranza: { clientesData: { d7: { saldo: 500 } } } };
  const op: any = diffState(prev, next, d, { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Angie" }).ops.find((o: any) => o.kind === "set");
  assert.equal(op.id, "cob_d7"); assert.equal(op.data.linkedRecordId, "d7");
  assert.equal(op.data.nombre, "Ana"); assert.equal(op.data.tel, "2145557777"); assert.equal(op.data.ciudad, "Waco");
  assert.equal(op.data.assignedTo, null);                                               // NO hereda al responsable de Ventas
  assert.equal(op.data.notas, undefined);
});
test("G) No se duplican clientes y linkedRecordId se conserva", () => {
  const estado = { distribucion: [{ id: "d1", nombre: "María", telefono: "214" }], cobranza: { clientesData: { d1: { saldo: 1 } } } };
  const plan = planMigration(estado, "impactos", NOW);
  assert.deepEqual(plan.records.map((r: any) => r.id).sort(), ["cob_d1", "d1"]);   // un cliente + su cuenta, nada más
  assert.equal(plan.records.find((r: any) => r.id === "cob_d1")!.linkedRecordId, "d1");
  assert.equal(plan.records.find((r: any) => r.id === "d1")!.assignmentType, "ventas");
  assert.equal(plan.records.find((r: any) => r.id === "cob_d1")!.assignmentType, "cobranza");
});
