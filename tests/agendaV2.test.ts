// Agenda v2: hora local (Texas), quién registra resultados, reprogramaciones, cancelación,
// registro de origen, duplicados, Maps y Centro de mando. Se ejecuta con TZ de Texas.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDateTimeValue, fechaLocal, isPastAppt, isCancelled, enFiltro, agendaCounters, canRecordVisitResult, canHardDelete,
  registrarResultado, reprogramarAntesDeVisita, reprogramarDesdeVisita, cancelarCita, duplicateApptCandidate,
  mapsLink, detallesEvento, icsEvento, sourceRecordForAppt, trazarCambiosAppts, candidatosCartera, buscarEnCartera,
  RESULTADOS_CITA_V2, ETIQUETA_RESULTADO, citaDesdeLlamada, revisarDuplicado,
  tieneResultado, citaSoloLectura, accionesCitaV2,
  PALETA_TIPOS, colorTipo, tipoOficial, colorBordeCita, COLOR_CANCELADA, TIPOS_OFICIALES,
} from "../src/services/agendaV2";
import { buildState } from "../src/data/storeCore";
import { SECTIONS_FOR_ROLE, docIdFor } from "../src/data/schema";
import fs from "node:fs";
import { TIPOS_AGENDA_POR_ROL } from "../src/services/commandCenter";
import { itemsDe } from "../src/services/callWorkflow";
import { enrichNewAppts, trazaRegistro } from "../src/services/apptTrace";
import { diffState, emptyDocs } from "../src/data/storeCore";
import { queriesFor } from "../src/data/schema";
import { staffResumen, ventasResumen, embudoComercial, RESULTADOS_VISITA, RESULTADOS_DEMO, esVisitaRealizada } from "../src/services/commandCenter";

const LIAM = { uid: "tlk1", nombre: "Liam" };
const TOMAS = { uid: "dist1", nombre: "Tomás" };
const ctxTLK = { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Liam" };
const ctxDIST = { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Tomás" };
// Martes 29-sep-2026, 8:30 PM en Texas  (= 01:30 UTC del 30-sep)
const NOCHE = new Date(2026, 8, 29, 20, 30, 0);
const cita = (x: any = {}) => ({ id: "c1", tipo: "cita", _type: "cita", nombre: "Ana Pérez", telefono: "(210) 555-0101", direccion: "123 Main St", ciudad: "San Antonio", cp: "78201", producto: "Sartenes", fecha: "2026-09-29T20:00", createdByUid: "tlk1", createdByName: "Liam", assignedTo: null, sourceSection: "agregados", sourceRecordId: "a1", ...x });
// Copia mínima de contarVentasDemos (App.tsx), igual que tests/commandCenter.test.ts
const cvd = ({ appts = [], enP = () => true }: any) => {
  let demos = 0, ventas = 0, volumen = 0;
  appts.forEach((a: any) => { if (a._sincronizado || !enP(a.fecha)) return;
    if (a.resultado === "demo_venta") { ventas++; demos++; volumen += Number(a.monto) || 0; } else if (a.resultado === "demo_no_venta") demos++; });
  return { demos, ventas, volumen };
};

test("1 · TLK crea cita: createdByUid real del TLK y assignedTo puede quedar null (sin distribuidor)", () => {
  const nueva = { id: "n1", tipo: "cita", nombre: "Ana", fecha: "2026-10-01T19:00", ...trazaRegistro({ id: "a1" }, "agregados") };
  const next = trazarCambiosAppts([], enrichNewAppts([], [nueva], LIAM), LIAM, "telemarketing_ventas", NOCHE);
  assert.equal(next[0].createdByUid, "tlk1");
  assert.equal(next[0].createdByName, "Liam");
  const op: any = diffState({ appts: [] }, { appts: next }, emptyDocs(), ctxTLK).ops[0];
  assert.equal(op.data.createdByUid, "tlk1");
  assert.equal(op.data.assignedTo, null);                       // NO se autoasigna a un distribuidor
  assert.ok(!("status" in op.data) || op.data.status !== "por_confirmar");
});

test("2 · TLK no puede registrar demo_venta (permiso, cambio central y store)", () => {
  assert.equal(canRecordVisitResult("telemarketing_ventas"), false);
  const prev = [cita()];
  const next = trazarCambiosAppts(prev, [{ ...prev[0], resultado: "demo_venta", monto: 2500, producto: "Purificador" }], LIAM, "telemarketing_ventas", NOCHE);
  assert.equal(next[0].resultado, undefined);
  assert.equal(next[0].monto, undefined);
  assert.equal(next[0].producto, "Sartenes");
  const d = emptyDocs(); d.appts.c1 = prev[0];
  const op: any = diffState({ appts: prev }, { appts: [{ ...prev[0], resultado: "demo_venta", resultByUid: "tlk1" }] }, d, ctxTLK).ops[0];
  assert.ok(!op || (op.data.resultado === undefined && op.data.resultByUid === undefined));
});

test("3 · TLK no puede registrar demo_no_venta (ni ningún resultado físico)", () => {
  const prev = [cita()];
  for (const r of RESULTADOS_CITA_V2.map((x) => x.id)) {
    const next = trazarCambiosAppts(prev, [{ ...prev[0], resultado: r }], LIAM, "telemarketing_ventas", NOCHE);
    assert.equal(next[0].resultado, undefined, r);
  }
  // Una cita que ya tenía resultado registrado por staff tampoco la cambia el TLK
  const conRes = [cita({ resultado: "demo_venta", resultByUid: "dist1", resultByName: "Tomás" })];
  const n2 = trazarCambiosAppts(conRes, [{ ...conRes[0], resultado: "demo_no_venta", resultByUid: "tlk1" }], LIAM, "telemarketing_ventas", NOCHE);
  assert.equal(n2[0].resultado, "demo_venta"); assert.equal(n2[0].resultByUid, "dist1");
});

test("4 · Staff sí puede registrar resultado (super_admin, distribuidor, supervisor)", () => {
  for (const r of ["super_admin", "distribuidor", "supervisor"]) assert.equal(canRecordVisitResult(r), true);
  const prev = [cita()];
  const next = trazarCambiosAppts(prev, [{ ...prev[0], resultado: "demo_no_venta" }], TOMAS, "distribuidor", NOCHE);
  assert.equal(next[0].resultado, "demo_no_venta");
  assert.equal(canHardDelete("distribuidor"), true); assert.equal(canHardDelete("super_admin"), true);
  assert.equal(canHardDelete("supervisor"), false); assert.equal(canHardDelete("telemarketing_ventas"), false);
});

test("5 · El resultado guarda resultByUid, resultByName y resultAt (Liam agendó, Tomás visitó)", () => {
  const r = registrarResultado(cita(), "demo_venta", { monto: 2890, producto: "Purificador", cartucho_meses: 12 }, TOMAS, NOCHE);
  assert.deepEqual([r.resultByUid, r.resultByName, r.resultAt], ["dist1", "Tomás", NOCHE.toISOString()]);
  assert.equal(r.createdByName, "Liam");
  assert.equal(r.monto, 2890);
  // y si la UI no lo trae, el punto central lo sella igual
  const prev = [cita()];
  const n = trazarCambiosAppts(prev, [{ ...prev[0], resultado: "no_recibio" }], TOMAS, "distribuidor", NOCHE);
  assert.equal(n[0].resultByUid, "dist1"); assert.equal(n[0].resultByName, "Tomás"); assert.equal(n[0].resultAt, NOCHE.toISOString());
});

test("6 · Reprogramar ANTES de la visita: misma cita, nueva fecha, historial y NO cuenta visita", () => {
  const a = cita();
  const r = reprogramarAntesDeVisita(a, "2026-09-30T18:00", LIAM, NOCHE);
  assert.equal(r.id, "c1");
  assert.equal(r.fecha, "2026-09-30T18:00");
  assert.equal(r.resultado, undefined);
  assert.deepEqual(r.reprogramHistory, [{ previousDate: "2026-09-29T20:00", newDate: "2026-09-30T18:00", changedAt: NOCHE.toISOString(), changedByUid: "tlk1", changedByName: "Liam", reason: "before_visit" }]);
  const r2 = reprogramarAntesDeVisita(r, "2026-10-02T10:00", LIAM, NOCHE);
  assert.equal(r2.reprogramHistory.length, 2);
  assert.equal(embudoComercial({}, [r2], "mes", cvd, NOCHE).visitas, 0);
  // el TLK puede hacerlo en SU cita: el store lo guarda
  const d = emptyDocs(); d.appts.c1 = a;
  const op: any = diffState({ appts: [a] }, { appts: [r] }, d, ctxTLK).ops[0];
  assert.equal(op.data.fecha, "2026-09-30T18:00"); assert.equal(op.data.reprogramHistory.length, 1);
});

test("7 · Reprogramada EN visita: original con resultado + nueva cita con cliente, origen y creador original", () => {
  const a = cita({ sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 2 });
  const { original, nueva } = reprogramarDesdeVisita(a, "2026-09-30T19:00", "Volver con la esposa", TOMAS, NOCHE, "c2");
  assert.equal(original.fecha, "2026-09-29T20:00");                 // conserva su fecha
  assert.equal(original.resultado, "reprogramada_visita");
  assert.deepEqual([original.resultByUid, original.resultByName, original.resultAt], ["dist1", "Tomás", NOCHE.toISOString()]);
  assert.equal(nueva.id, "c2"); assert.equal(nueva.fecha, "2026-09-30T19:00");
  for (const k of ["nombre", "telefono", "direccion", "ciudad", "cp", "producto"]) assert.equal(nueva[k], a[k], k);
  assert.deepEqual([nueva.sourceSection, nueva.sourceRecordId, nueva.sourceRefIndex], ["referidos", "anf1", 2]);
  assert.deepEqual([nueva.createdByUid, nueva.createdByName], ["tlk1", "Liam"]);   // quien CONSIGUIÓ la cita
  assert.equal(nueva.reprogrammedFromApptId, "c1"); assert.equal(nueva.createdFrom, "reprogramada_visita");
  assert.equal(nueva.resultado, undefined);
  // el store (staff) conserva el creador original en la cita nueva
  const d = emptyDocs(); d.appts.c1 = a;
  const { ops } = diffState({ appts: [a] }, { appts: [nueva, original] }, d, ctxDIST);
  const opN: any = ops.find((o: any) => o.id === "c2");
  assert.equal(opN.data.createdByUid, "tlk1"); assert.equal(opN.data.createdByName, "Liam");
  // …pero un TLK no puede fabricar citas a nombre de otro
  const fake = { ...nueva, id: "c3", createdByUid: "otro" };
  const opT: any = diffState({ appts: [] }, { appts: [fake] }, emptyDocs(), ctxTLK).ops[0];
  assert.equal(opT.data.createdByUid, "tlk1");
});

test("8 · Reprogramada en visita cuenta Visita, NO Demo, NO Venta (Visitas → Demos → Ventas → Volumen)", () => {
  assert.ok(RESULTADOS_VISITA.includes("reprogramada_visita"));
  assert.ok(!RESULTADOS_DEMO.includes("reprogramada_visita"));
  assert.equal(esVisitaRealizada("reprogramada_visita"), true);
  const { original, nueva } = reprogramarDesdeVisita(cita(), "2026-09-30T19:00", "", TOMAS, NOCHE, "c2");
  const e = embudoComercial({}, [original, nueva], "hoy", cvd, NOCHE);
  assert.deepEqual(e, { visitas: 1, demos: 0, ventas: 0, volumen: 0 });
});

test("9 · Cancelada: no aparece en Sin resultado, no es visita activa y permanece en Todas", () => {
  const c = cancelarCita(cita({ fecha: "2026-09-29T15:00" }), LIAM, NOCHE, "cliente de viaje");
  assert.ok(isCancelled(c));
  assert.deepEqual([c.status, c.cancelledByUid, c.cancelledByName, c.cancelledAt, c.cancelReason], ["cancelada", "tlk1", "Liam", NOCHE.toISOString(), "cliente de viaje"]);
  assert.equal(enFiltro(c, "sinResultado", NOCHE), false);
  assert.equal(enFiltro(c, "hoy", NOCHE), false);
  assert.equal(enFiltro(c, "proximas", NOCHE), false);
  assert.equal(enFiltro(c, "todas", NOCHE), true);
  const cnt = agendaCounters([c, cita({ id: "c9", fecha: "2026-09-29T15:00" })], NOCHE);
  assert.deepEqual(cnt, { hoy: 1, proximas: 0, sinResultado: 1, todas: 2 });
  assert.equal(embudoComercial({}, [{ ...c, resultado: "demo_venta", monto: 1000 }], "hoy", cvd, NOCHE).visitas, 0);
  // Sin resultado: SOLO visitas comerciales (no servicios, entrevistas ni recordatorios)
  for (const tipo of ["servicio", "entrevista", "llamada"]) assert.equal(enFiltro({ id: "x", tipo, fecha: "2026-09-28T10:00" }, "sinResultado", NOCHE), false);
});

test("10 · datetime-local usa hora LOCAL, no UTC", () => {
  assert.equal(localDateTimeValue(NOCHE), "2026-09-29T20:30");
  assert.notEqual(localDateTimeValue(NOCHE), NOCHE.toISOString().slice(0, 16));   // el bug: "2026-09-30T01:30"
  assert.equal(NOCHE.toISOString().slice(0, 16), "2026-09-30T01:30");
  assert.equal(fechaLocal("2026-09-30T01:30:00.000Z"), "2026-09-29T20:30");       // ISO con zona → local
  assert.equal(fechaLocal("2026-09-29T20:00"), "2026-09-29T20:00");               // datetime-local se respeta
  assert.equal(fechaLocal("2026-09-29"), "2026-09-29T00:00");
});

test("11 · Cita a las 8 PM en Texas: sigue siendo HOY y no salta al día siguiente", () => {
  const a = cita({ fecha: "2026-09-29T21:00" });
  const antes = new Date(2026, 8, 29, 19, 45);
  assert.equal(enFiltro(a, "hoy", antes), true);
  assert.equal(enFiltro(a, "proximas", antes), false);
  assert.equal(enFiltro(a, "sinResultado", antes), false);
  assert.equal(isPastAppt(a, antes), false);                 // con toISOString ya "habría pasado"
  const despues = new Date(2026, 8, 29, 21, 30);
  assert.equal(enFiltro(a, "sinResultado", despues), true);
  assert.equal(enFiltro(a, "hoy", despues), true);
  // Mañana a las 8 PM: próxima, no de hoy
  assert.equal(enFiltro(cita({ fecha: "2026-09-30T20:00" }), "proximas", NOCHE), true);
  // Centro de mando en la misma noche: visita de hoy, no de mañana
  const st = staffResumen({}, [cita({ fecha: "2026-09-29T20:00" }), cita({ id: "c2", fecha: "2026-09-30T08:00" })], NOCHE);
  assert.equal(st.visitasHoy, 1);
});

test("12 · sourceRecordId manda sobre el teléfono", () => {
  const state = {
    agregados: [{ id: "a9", nombre: "Otro con el mismo tel", telefono: "2105550101" }],
    prospectos: [{ id: "p1", nombre: "Ana Pérez", telefono: "2105550101" }],
  };
  const r = sourceRecordForAppt(state, cita({ sourceSection: "prospectos", sourceRecordId: "p1" }));
  assert.deepEqual(r, { section: "prospectos", id: "p1", via: "source" });
  // traza presente pero el registro ya no existe → NO adivinar por teléfono (y no crear prospecto)
  assert.equal(sourceRecordForAppt(state, cita({ sourceSection: "prospectos", sourceRecordId: "borrado" })), null);
  // cita legacy SIN traza → fallback por teléfono
  const legacy = cita({ sourceSection: undefined, sourceRecordId: undefined });
  assert.deepEqual(sourceRecordForAppt(state, legacy), { section: "agregados", id: "a9", via: "telefono" });
});

test("13 · Dos registros con el mismo teléfono: la venta va al registro de ORIGEN correcto (incl. referidos)", () => {
  const state = {
    agregados: [{ id: "a1", nombre: "Esposo", telefono: "210-555-0101" }, { id: "a2", nombre: "Esposa", telefono: "(210) 555 0101" }],
    referidos: [{ id: "anf1", referidos: [{ nombre: "R0", telefono: "2105550101" }, { nombre: "R1", telefono: "2105550101" }] }],
  };
  assert.equal(sourceRecordForAppt(state, cita({ sourceRecordId: "a2" }))!.id, "a2");
  assert.equal(sourceRecordForAppt(state, cita({ sourceRecordId: "a1" }))!.id, "a1");
  assert.deepEqual(sourceRecordForAppt(state, cita({ sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1 })), { section: "referidos", id: "anf1", refIdx: 1, via: "source" });
  // id numérico guardado como texto (o al revés) también encuentra el registro
  assert.equal(sourceRecordForAppt({ agregados: [{ id: 17, telefono: "1" }] }, cita({ sourceRecordId: "17" }))!.id, "17");
});

test("14 · TLK no modifica createdByUid, sourceRecordId ni resultByUid", () => {
  const prev = [cita({ resultado: "demo_venta", resultByUid: "dist1", resultByName: "Tomás" })];
  const hack = { ...prev[0], createdByUid: "otro", createdByName: "Otro", sourceRecordId: "zzz", sourceSection: "prospectos", sourceRefIndex: 4, resultByUid: "tlk1", notas: "ok" };
  const n = trazarCambiosAppts(prev, [hack], LIAM, "telemarketing_ventas", NOCHE)[0];
  assert.deepEqual([n.createdByUid, n.createdByName, n.sourceRecordId, n.sourceSection, n.sourceRefIndex, n.resultByUid], ["tlk1", "Liam", "a1", "agregados", undefined, "dist1"]);
  assert.equal(n.notas, "ok");                                      // lo básico sí lo edita
  // store: sobre una cita SIN resultado (con resultado es solo lectura para la TLK: r3)
  const abierta = [cita()]; const d = emptyDocs(); d.appts.c1 = abierta[0];
  const op: any = diffState({ appts: abierta }, { appts: [{ ...abierta[0], createdByUid: "otro", sourceRecordId: "zzz", resultByUid: "tlk1", notas: "ok" }] }, d, ctxTLK).ops[0];
  assert.deepEqual([op.data.createdByUid, op.data.sourceRecordId, op.data.resultByUid, op.data.notas], ["tlk1", "a1", undefined, "ok"]);
});

test("15 · TLK solo recibe las citas que creó o que tiene asignadas", () => {
  const qs = queriesFor({ role: "telemarketing_ventas", uid: "tlk1" } as any, "appts");
  assert.deepEqual(qs.map((q: any) => q.where), [[["assignedTo", "==", "tlk1"]], [["createdByUid", "==", "tlk1"]]]);
});

test("16 · Staff recibe la agenda completa del workspace", () => {
  for (const role of ["super_admin", "distribuidor", "supervisor"]) {
    const qs = queriesFor({ role, uid: "dist1" } as any, "appts");
    assert.deepEqual(qs.map((q: any) => q.where), [[]], role);
  }
});

test("17 · Cita duplicada: advertencia (candidato), nunca bloqueo", () => {
  const exist = [cita({ fecha: "2026-10-01T18:00" })];
  // mismo sourceRecordId y fecha aproximada
  assert.equal(duplicateApptCandidate(exist, { id: "n", tipo: "cita", sourceRecordId: "a1", fecha: "2026-10-01T19:30" })?.id, "c1");
  assert.equal(duplicateApptCandidate(exist, { id: "n", tipo: "cita", sourceRecordId: "a1", fecha: "2026-10-03T19:30" }), null);
  // manual/legacy: mismo teléfono + misma hora aprox.
  assert.equal(duplicateApptCandidate(exist, { id: "n", tipo: "cita", telefono: "210.555.0101", fecha: "2026-10-01T18:30" })?.id, "c1");
  assert.equal(duplicateApptCandidate(exist, { id: "n", tipo: "cita", telefono: "210.555.0101", fecha: "2026-10-01T21:00" }), null);
  // canceladas no cuentan como duplicado; otros tipos no se revisan
  assert.equal(duplicateApptCandidate([cancelarCita(exist[0], LIAM, NOCHE)], { id: "n", tipo: "cita", sourceRecordId: "a1", fecha: "2026-10-01T18:00" }), null);
  assert.equal(duplicateApptCandidate(exist, { id: "n", tipo: "llamada", sourceRecordId: "a1", fecha: "2026-10-01T18:00" }), null);
});

test("18 · TLK crea cita desde un cliente de SU cartera: sourceSection/sourceRecordId correctos", () => {
  const allData = {  // lo que ese TLK ya recibe de Firestore (acotado)
    agregados: [{ id: "a1", nombre: "Ana Pérez", telefono: "2105550101", direccion: "123 Main St", ciudad: "San Antonio", cp: "78201" }],
    distribucion: [{ id: "d1", nombre: "Luis", telefono: "2105550202" }],
    referidos: [{ id: "anf1", referidos: [{ nombre: "Marta", telefono: "2105550303" }] }],
  };
  const cands = candidatosCartera(allData);
  assert.equal(cands.length, 3);
  const [ana] = buscarEnCartera(cands, "perez");
  assert.deepEqual([ana.section, ana.recId, ana.nombre, ana.telefono, ana.direccion, ana.ciudad, ana.cp], ["agregados", "a1", "Ana Pérez", "2105550101", "123 Main St", "San Antonio", "78201"]);
  const [marta] = buscarEnCartera(cands, "555 0303");
  assert.deepEqual([marta.section, marta.recId, marta.refIdx], ["referidos", "anf1", 0]);
  // la cita guardada (mismo armado que Agenda) queda ligada al registro real
  const nueva: any = { id: "n1", tipo: "cita", fecha: "2026-10-01T18:00", nombre: ana.nombre, sourceSection: ana.section, sourceRecordId: ana.recId };
  const op: any = diffState({ appts: [] }, { appts: enrichNewAppts([], [nueva], LIAM) }, emptyDocs(), ctxTLK).ops[0];
  assert.deepEqual([op.data.sourceSection, op.data.sourceRecordId, op.data.createdByUid], ["agregados", "a1", "tlk1"]);
});

test("19 · 'Cómo llegar' usa la dirección de la cita (no el GPS) y el calendario dice 'Agendada por'", () => {
  const url = mapsLink(cita());
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent("123 Main St, San Antonio, 78201"));
  assert.ok(!/origin=|current|mylocation/i.test(url));
  assert.equal(mapsLink({ nombre: "sin dirección" }), "");
  const det = detallesEvento(cita({ notas: "perro bravo" }));
  assert.ok(det.includes("Agendada por: Liam"));
  assert.ok(!det.some((l) => /vendedor/i.test(l)));
  for (const k of ["Cliente: Ana Pérez", "Teléfono: (210) 555-0101", "Dirección: 123 Main St", "Ciudad/ZIP: San Antonio 78201", "Producto: Sartenes", "Notas: perro bravo"]) assert.ok(det.includes(k), k);
  const ics = icsEvento(cita(), "Cita - Ana Pérez", NOCHE);
  assert.ok(ics.includes("DTSTART:20260929T200000") && ics.includes("DTEND:20260929T210000"));   // hora local, sin salto de día
  assert.ok(ics.includes("LOCATION:123 Main St\\, San Antonio\\, 78201") && ics.includes("Agendada por: Liam"));
});

test("20 · Cita cancelada excluida de Visitas hoy / mañana (staff y TLK)", () => {
  const hoy = new Date(2026, 8, 29, 9, 0);
  const A = [
    cita({ id: "h1", fecha: "2026-09-29T11:00" }), cancelarCita(cita({ id: "h2", fecha: "2026-09-29T15:00" }), LIAM, hoy),
    cita({ id: "m1", fecha: "2026-09-30T11:00" }), cancelarCita(cita({ id: "m2", fecha: "2026-09-30T15:00" }), LIAM, hoy),
  ];
  const st: any = staffResumen({}, A, hoy);
  assert.equal(st.visitasHoy, 1);
  assert.equal(st.acciones.visitasManana, 1);
  const v: any = ventasResumen({}, A, {}, { uid: "tlk1", nombre: "Liam", now: hoy });
  assert.equal(v.citasHoy, 1);
  assert.equal(v.flujo.citas, 2);
});

test("Compatibilidad: resultados antiguos venta / no_venta / reset se siguen mostrando y contando", () => {
  assert.equal(ETIQUETA_RESULTADO.venta, "Demo / venta");
  assert.equal(ETIQUETA_RESULTADO.no_venta, "Demo / no venta");
  assert.equal(ETIQUETA_RESULTADO.reset, "Re-agendada");
  assert.equal(esVisitaRealizada("venta"), true); assert.equal(esVisitaRealizada("no_venta"), true);
  assert.deepEqual(RESULTADOS_CITA_V2.map((r) => r.id), ["demo_venta", "demo_no_venta", "no_recibio", "reprogramada_visita", "no_visito", "seguimiento"]);
  // citas viejas intactas: sin usuario v2 no se toca nada; editar notas no inventa traza
  const vieja: any = { id: "v1", tipo: "cita", fecha: "2026-01-10T10:00", resultado: "venta" };
  const n = trazarCambiosAppts([vieja], [{ ...vieja, notas: "x" }], TOMAS, "distribuidor", NOCHE)[0];
  assert.equal(n.resultByUid, undefined); assert.equal(n.createdByUid, undefined); assert.equal(n.resultado, "venta");
});

// ════════ Agenda r2: duplicados desde Llamadas, tipos por rol y store alineado con Rules ════════
const regLl = (id: string, x: any = {}) => ({ id, nombre: "Ana Pérez", telefono: "2105550101", direccion: "123 Main St", ciudad: "San Antonio", cp: "78201", assignedTo: "tlk1", ...x });
const citaForm = (fecha: string, x: any = {}) => ({ nombre: "Ana Pérez", telefono: "(210) 555-0101", fecha, tipo: "cita", notas: "", ...x });

test("16 · Llamadas: el duplicado se detecta ANTES de guardar (mismo registro de origen, hora cercana)", () => {
  const it = itemsDe({ prospectos: [regLl("p1")] }, "ventas", "tlk1")[0];
  const existentes = [cita({ id: "c1", sourceSection: "prospectos", sourceRecordId: "p1", fecha: "2026-10-01T18:00" })];
  const nueva = citaDesdeLlamada(citaForm("2026-10-01T19:00"), trazaRegistro(it), "n1");
  assert.deepEqual([nueva.sourceSection, nueva.sourceRecordId, nueva._type, nueva.id], ["prospectos", "p1", "cita", "n1"]);
  assert.equal(revisarDuplicado(existentes, nueva)?.id, "c1");
  // referido: manda sourceRecordId + sourceRefIndex (otro índice del mismo anfitrión NO es duplicado)
  const anf = { referidos: [{ id: "anf1", assignedTo: "tlk1", referidos: [{ nombre: "R0", telefono: "2105550303" }, { nombre: "R1", telefono: "2105550404" }] }] };
  const refs = itemsDe(anf, "ventas", "tlk1");
  const r0 = refs.find((i: any) => i.nombre === "R0")!, r1 = refs.find((i: any) => i.nombre === "R1")!;
  const citaR0 = citaDesdeLlamada(citaForm("2026-10-02T10:00", { nombre: "R0", telefono: "2105550303" }), trazaRegistro(r0), "r0");
  assert.equal(citaR0.sourceRefIndex, 0);
  const n1 = citaDesdeLlamada(citaForm("2026-10-02T10:30", { nombre: "R1", telefono: "2105550404" }), trazaRegistro(r1), "r1");
  assert.equal(revisarDuplicado([citaR0], n1), null);
  const n0 = citaDesdeLlamada(citaForm("2026-10-02T10:30", { nombre: "R0", telefono: "2105550303" }), trazaRegistro(r0), "r0b");
  assert.equal(revisarDuplicado([citaR0], n0)?.id, "r0");
  // legacy/manual sin traza: por teléfono
  assert.equal(revisarDuplicado([cita({ id: "L1", sourceSection: undefined, sourceRecordId: undefined, fecha: "2026-10-01T18:00" })], citaDesdeLlamada(citaForm("2026-10-01T18:30"), {}, "x"))?.id, "L1");
});

test("17 · Llamadas: 'Guardar de todos modos' sigue permitido (aviso, nunca bloqueo)", () => {
  const it = itemsDe({ prospectos: [regLl("p1")] }, "ventas", "tlk1")[0];
  const existentes = [cita({ id: "c1", sourceSection: "prospectos", sourceRecordId: "p1", fecha: "2026-10-01T18:00" })];
  const nueva = citaDesdeLlamada(citaForm("2026-10-01T18:15"), trazaRegistro(it), "n2");
  assert.ok(revisarDuplicado(existentes, nueva));
  assert.equal(revisarDuplicado(existentes, nueva, true), null);
  const op: any = diffState({ appts: existentes }, { appts: [nueva, ...existentes] }, { ...emptyDocs(), appts: { c1: existentes[0] } } as any, ctxTLK).ops[0];
  assert.deepEqual([op.id, op.data.createdByUid, op.data.assignedTo, op.data.sourceRecordId], ["n2", "tlk1", null, "p1"]);
});

test("18 · Llamadas: una cita diferente NO dispara el aviso", () => {
  const regs = { prospectos: [regLl("p1"), regLl("p2", { nombre: "Otra", telefono: "2105559999" })] };
  const [i1, i2] = ["p1", "p2"].map((id) => itemsDe(regs, "ventas", "tlk1").find((i: any) => i.raw.id === id)!);
  const existentes = [citaDesdeLlamada(citaForm("2026-10-01T18:00"), trazaRegistro(i1), "c1")];
  // otro cliente a la misma hora
  assert.equal(revisarDuplicado(existentes, citaDesdeLlamada(citaForm("2026-10-01T18:00", { nombre: "Otra", telefono: "2105559999" }), trazaRegistro(i2), "n")), null);
  // mismo cliente, otro día
  assert.equal(revisarDuplicado(existentes, citaDesdeLlamada(citaForm("2026-10-04T18:00"), trazaRegistro(i1), "n")), null);
  // la existente está cancelada
  assert.equal(revisarDuplicado([cancelarCita(existentes[0], LIAM, NOCHE)], citaDesdeLlamada(citaForm("2026-10-01T18:00"), trazaRegistro(i1), "n")), null);
});

test("r2 · apptTypeAllowed (firestore.rules) replica EXACTAMENTE TIPOS_AGENDA_POR_ROL", () => {
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const i = rules.indexOf("function apptTypeAllowed(");
  const bloque = rules.slice(i, rules.indexOf("}", i));
  for (const [role, tipos] of Object.entries(TIPOS_AGENDA_POR_ROL)) {
    const m = bloque.match(new RegExp(`'${role}'\\s*&& tipo (?:in \\[([^\\]]*)\\]|== '([^']*)')`));
    if (tipos === null) { assert.equal(m, null, `${role} (staff) no se limita por tipo`); continue; }
    assert.ok(m, `falta ${role}`);
    const enRules = (m![1] ? m![1].split(",").map((x) => x.trim().replace(/'/g, "")) : [m![2]]).sort();
    assert.deepEqual(enRules, [...tipos].sort(), role);
  }
});

test("r2 · store = Rules: la TLK crea limpio y sin asignar; no cambia tipo, servicio ni sincronización; cancelada = solo lectura", () => {
  // creación: aunque la app mande campos de staff, no salen del store
  const sucia = { id: "s1", tipo: "cita", _type: "cita", fecha: "2026-10-01T18:00", assignedTo: "tlk2", status: "cancelada", resultado: "demo_venta", monto: 900,
    createdFrom: "reprogramada_visita", reprogrammedFromApptId: "c0", _sincronizado: true, reprogramHistory: [{}], cancelledByUid: "x" };
  const op: any = diffState({ appts: [] }, { appts: [sucia] }, emptyDocs(), ctxTLK).ops[0];
  assert.equal(op.data.assignedTo, null);
  for (const k of ["status", "resultado", "monto", "createdFrom", "reprogrammedFromApptId", "_sincronizado", "reprogramHistory", "cancelledByUid"]) assert.equal(op.data[k], undefined, k);
  // edición: tipo, _type, servicioResultado y _sincronizado se conservan
  const cur = cita({ id: "e1", tipo: "llamada", _type: "llamada", servicioResultado: "pendiente", _sincronizado: false, eliminado: false });
  const d = emptyDocs(); d.appts.e1 = cur;
  const ed: any = diffState({ appts: [cur] }, { appts: [{ ...cur, tipo: "cita", _type: "cita", servicioResultado: "realizado", _sincronizado: true, _clienteId: "zz", eliminado: true, notas: "ok" }] }, d, ctxTLK).ops[0];
  assert.deepEqual([ed.data.tipo, ed.data._type, ed.data.servicioResultado, ed.data._sincronizado, ed.data._clienteId, ed.data.eliminado, ed.data.notas], ["llamada", "llamada", "pendiente", false, undefined, false, "ok"]);
  // cancelada: el store no la reescribe para la TLK (sí para el staff)
  const canc = cancelarCita(cita({ id: "k1" }), LIAM, NOCHE, "x"); const dk = emptyDocs(); dk.appts.k1 = canc;
  const rk = diffState({ appts: [canc] }, { appts: [{ ...canc, status: "", notas: "reactivar" }] }, dk, ctxTLK);
  assert.equal(rk.ops.length, 0); assert.ok(rk.blocked.some((b) => /cancelada/.test(b)));
  assert.equal(diffState({ appts: [canc] }, { appts: [{ ...canc, notas: "staff" }] }, dk, ctxDIST).ops.length, 1);
});

// ════════ Agenda r3: resultado = solo lectura (TLK), TEAM_CONTACTS en v2, source en CREATE ════════
const RESULTADOS_EXISTENTES = ["demo_venta", "demo_no_venta", "no_recibio", "reprogramada_visita", "no_visito", "seguimiento", "venta", "no_venta"];

test("r3 · 1-3: TLK no edita, no reprograma (fecha) ni cancela una cita con resultado (incl. legacy venta/no_venta)", () => {
  for (const r of RESULTADOS_EXISTENTES) {
    const a = cita({ resultado: r, resultByUid: "dist1" });
    assert.ok(tieneResultado(a), r);
    assert.equal(citaSoloLectura(a, "telemarketing_ventas"), true, r);
    assert.deepEqual(accionesCitaV2(a, false), { soloLectura: true, registrarResultado: false, editar: false, reprogramar: false, cancelar: false }, r);
    // el store tampoco la reescribe para la TLK (ni edición, ni fecha, ni cancelación)
    const d = emptyDocs(); d.appts.c1 = a;
    for (const cambio of [{ notas: "x", telefono: "1" }, { fecha: "2026-10-09T10:00" }, cancelarCita(a, LIAM, NOCHE, "x")]) {
      const res = diffState({ appts: [a] }, { appts: [{ ...a, ...cambio }] }, d, ctxTLK);
      assert.equal(res.ops.length, 0, r); assert.ok(res.blocked.some((b) => /con resultado: solo lectura/.test(b)), r);
    }
  }
  // sin resultado: la TLK sí gestiona su cita (r2 intacto)
  assert.deepEqual(accionesCitaV2(cita(), false), { soloLectura: false, registrarResultado: false, editar: true, reprogramar: true, cancelar: true });
  assert.equal(tieneResultado(cita({ resultado: "" })), false); assert.equal(tieneResultado(cita({ resultado: null })), false);
});

test("r3 · 4: el staff sí puede modificar una cita con resultado", () => {
  const a = cita({ resultado: "demo_venta", resultByUid: "dist1", resultByName: "Tomás", monto: 2000 });
  assert.equal(citaSoloLectura(a, "distribuidor"), false);
  assert.deepEqual(accionesCitaV2(a, true), { soloLectura: false, registrarResultado: true, editar: true, reprogramar: false, cancelar: false });   // igual que r1/r2
  const d = emptyDocs(); d.appts.c1 = a;
  for (const ctx of [ctxDIST, { ...ctxDIST, role: "supervisor" }, { ...ctxDIST, role: "super_admin" }]) {
    const op: any = diffState({ appts: [a] }, { appts: [{ ...a, notas: "corrección", fecha: "2026-09-29T20:30" }] }, d, ctx).ops[0];
    assert.equal(op.data.notas, "corrección"); assert.equal(op.data.fecha, "2026-09-29T20:30"); assert.equal(op.data.resultado, "demo_venta");
  }
});

test("r3 · 5-6: EntrevistaModal — v2 no usa TEAM_CONTACTS; legacy lo conserva (todas las referencias quedan detrás de ACCESS_V2)", () => {
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8").split("\n");
  const usos = app.map((l, i) => [i + 1, l] as const).filter(([, l]) => /TEAM_CONTACTS/.test(l) && !/^const TEAM_CONTACTS/.test(l) && !/^\s*\/\//.test(l));
  assert.ok(usos.length >= 6);
  for (const [n, l] of usos) assert.ok(/ACCESS_V2/.test(l), `App.tsx:${n} usa TEAM_CONTACTS sin condición ACCESS_V2`);
  const ini = app.findIndex((l) => /^function EntrevistaModal/.test(l)), fin = app.findIndex((l, i) => i > ini && /^}/.test(l));
  const modal = app.slice(ini, fin).join("\n");
  assert.ok(/attendees: ACCESS_V2 \? \[\] : TEAM_CONTACTS\.filter\(c=>c\.default\.entrevista\)/.test(modal), "invitados iniciales: v2 = [] · legacy = TEAM_CONTACTS de entrevista");
  assert.ok(/\(ACCESS_V2 \? \[\] : TEAM_CONTACTS\)\.map/.test(modal), "lista de contactos: vacía en v2, completa en legacy");
  assert.ok(/Otro correo/.test(modal), "se conserva el correo manual");
});

test("r3 · 7-10: el mapa de especialidades y la ruta del registro de origen en Rules coinciden con schema.ts", () => {
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const mapa = (fn: string) => { const i = rules.indexOf(`function ${fn}(`); const b = rules.slice(i, rules.indexOf("}", i));
    return Object.fromEntries(Object.keys(SECTIONS_FOR_ROLE).map((r) => { const m = b.match(new RegExp(`'${r}'\\s*&& x (?:in \\[([^\\]]*)\\]|== '([^']*)')`));
      return [r, m ? (m[1] ? m[1].split(",").map((x) => x.trim().replace(/'/g, "")) : [m[2]]).sort() : null]; })); };
  const esperado = Object.fromEntries(Object.entries(SECTIONS_FOR_ROLE).map(([r, v]) => [r, [...v].sort()]));
  assert.deepEqual(mapa("seccionDeRol"), esperado, "appts.seccionDeRol = SECTIONS_FOR_ROLE");
  assert.deepEqual(mapa("sectionAllowed"), esperado, "records.sectionAllowed = SECTIONS_FOR_ROLE");
  // ruta real del documento: Cobranza = cob_<clave>; el resto = su id (docIdFor)
  assert.equal(docIdFor("cobranza", "d1"), "cob_d1"); assert.equal(docIdFor("agregados", "a1"), "a1");
  assert.ok(/d\.sourceSection == 'cobranza' \? 'cob_' \+ d\.sourceRecordId : d\.sourceRecordId/.test(rules));
  // todos los flujos de la app guardan sourceRecordId como TEXTO (las Rules lo exigen)
  assert.equal(typeof trazaRegistro({ section: "agregados", id: 17 } as any).sourceRecordId, "string");
  assert.equal(typeof trazaRegistro({ section: "referidos", recId: 5 as any, refIdx: 1 }).sourceRecordId, "string");
  assert.equal(typeof candidatosCartera({ agregados: [{ id: 17, nombre: "x" }] })[0].recId, "string");
});

// ════════ Agenda r5: paleta oficial de tipos · cancelada visible en "Todas" ════════
test("r5 · 1-7: paleta oficial (cita verde · servicio rojo · entrevista morado · cocinada amarillo · recordatorio naranja · personal azul)", () => {
  assert.equal(colorTipo("cita"), "#16a34a");
  assert.equal(colorTipo("servicio"), "#dc2626");
  assert.equal(colorTipo("entrevista"), "#7c3aed");
  assert.equal(colorTipo("cocinada"), "#eab308");
  assert.equal(colorTipo("llamada"), "#ea580c");
  assert.equal(colorTipo("personal"), "#2563eb");
  assert.equal(colorTipo("recordatorio"), "#ea580c");                 // legacy → mismo naranja
  assert.equal(tipoOficial("recordatorio"), "llamada");
  // Google Calendar: 10 Basil · 11 Tomato · 3 Grape · 5 Banana · 6 Tangerine · 9 Blueberry
  assert.deepEqual(Object.fromEntries(TIPOS_OFICIALES.map((t) => [t, PALETA_TIPOS[t].colorId])), { cita: "10", servicio: "11", entrevista: "3", cocinada: "5", llamada: "6", personal: "9" });
  // estados / acciones / resultados NO son categorías de color
  for (const t of ["reset", "seguimiento", "pendiente", "reprogramada_visita", "cancelada"]) assert.equal(colorTipo(t), null, t);
  // la misma cita, en borde y punto: verde; cancelada: gris (sigue siendo "cita")
  assert.equal(colorBordeCita(cita()), "#16a34a");
  const c = cancelarCita(cita(), LIAM, NOCHE, "x");
  assert.equal(colorBordeCita(c), COLOR_CANCELADA); assert.equal(c.tipo, "cita");
  assert.equal(colorBordeCita({ id: "x", tipo: "recordatorio" }), "#ea580c");
  // App.tsx toma la paleta de aquí solo en v2 (legacy intacto)
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(/const TYPE_OPTIONS = ACCESS_V2\s*\? TYPE_OPTIONS_LEGACY\.map\(o=>\(\{ \.\.\.o, color:PALETA_TIPOS\[o\.v\]\.fuerte, pill:PALETA_TIPOS\[o\.v\]\.pill/.test(app));
  assert.ok(/if \(ACCESS_V2\) Object\.keys\(PALETA_TIPOS\)\.forEach\(t=>\{ if \(EVENT_CONFIG\[t\]\) EVENT_CONFIG\[t\]=\{ \.\.\.EVENT_CONFIG\[t\], colorId:PALETA_TIPOS\[t\]\.colorId \}/.test(app));
  assert.ok(/const TIPO_COLOR = ACCESS_V2\s*\?/.test(app));
});

test("r5 · 8-12: cancelada fuera de Hoy / Próximas / Sin resultado y SIEMPRE en Todas; contadores", () => {
  const manana = cita({ id: "f1", fecha: "2026-09-30T18:00" });
  const c = cancelarCita(cita({ id: "f2", fecha: "2026-09-30T18:00" }), LIAM, NOCHE, "viaje");
  const hoyC = cancelarCita(cita({ id: "f3", fecha: "2026-09-29T21:00" }), LIAM, NOCHE, "x");
  const pasadaC = cancelarCita(cita({ id: "f4", fecha: "2026-09-28T10:00" }), LIAM, NOCHE, "x");
  for (const x of [c, hoyC, pasadaC]) {
    assert.equal(enFiltro(x, "hoy", NOCHE), false);
    assert.equal(enFiltro(x, "proximas", NOCHE), false);
    assert.equal(enFiltro(x, "sinResultado", NOCHE), false);
    assert.equal(enFiltro(x, "todas", NOCHE), true);
  }
  assert.deepEqual(agendaCounters([manana, c], NOCHE), { hoy: 0, proximas: 1, sinResultado: 0, todas: 2 });
});

test("r5 · 13-14: flujo completo — TLK crea, cancela (SET, no DELETE), Firestore conserva status y la reconstrucción la devuelve en Todas", () => {
  // 1) La TLK crea la cita (mismo armado que la Agenda)
  const d = emptyDocs();
  const firestore = (ops: any[]) => ops.forEach((o: any) => { if (o.kind === "set") d.appts[o.id] = JSON.parse(JSON.stringify(o.data)); else if (o.kind === "delete") delete d.appts[o.id]; });
  const nueva = { id: "a34", tipo: "cita", _type: "cita", nombre: "Prueba A34", fecha: "2026-09-30T18:00" };
  const creada = trazarCambiosAppts([], enrichNewAppts([], [nueva], LIAM), LIAM, "telemarketing_ventas", NOCHE);
  const r1 = diffState({ appts: [] }, { appts: creada }, d, ctxTLK); firestore(r1.ops);
  let st: any = buildState(d, {}, "tlk1", "telemarketing_ventas");
  // 2) La TLK la cancela desde la tarjeta (cancelarCita → setAppts → trazar → diff → apptDoc)
  const cancelada = cancelarCita(st.appts.find((a: any) => a.id === "a34"), LIAM, NOCHE, "cliente de viaje");
  const next = trazarCambiosAppts(st.appts, enrichNewAppts(st.appts, st.appts.map((a: any) => (a.id === "a34" ? cancelada : a)), LIAM), LIAM, "telemarketing_ventas", NOCHE);
  const r2 = diffState(st, { ...st, appts: next }, d, ctxTLK);
  assert.equal(r2.ops.length, 1); assert.equal(r2.ops[0].kind, "set");                       // SET, nunca DELETE
  assert.equal(r2.blocked.length, 0);
  firestore(r2.ops);
  // 3) El documento en Firestore conserva la cita cancelada y sigue siendo de la TLK
  const doc = d.appts.a34;
  assert.deepEqual([doc.status, doc.cancelledByUid, doc.cancelReason, doc.createdByUid, doc.assignedTo, doc.tipo, doc.eliminado], ["cancelada", "tlk1", "cliente de viaje", "tlk1", null, "cita", false]);
  // 4) Sigue entrando en las consultas de la TLK (lo que devuelve el listener)
  const qs = queriesFor({ role: "telemarketing_ventas", uid: "tlk1" } as any, "appts");
  assert.ok(qs.some((q: any) => q.where.every(([f, , v]: any) => doc[f] === v)), "la cancelada sigue en assignedTo==uid o createdByUid==uid");
  // 5) buildState (reconstrucción desde Firestore) la incluye y la Agenda la muestra en Todas
  st = buildState(d, {}, "tlk1", "telemarketing_ventas");
  const a34 = st.appts.find((a: any) => a.id === "a34");
  assert.ok(a34 && a34.status === "cancelada");
  assert.ok(st.appts.filter((a: any) => enFiltro(a, "todas", NOCHE)).some((a: any) => a.id === "a34"));
  assert.equal(st.appts.filter((a: any) => enFiltro(a, "proximas", NOCHE)).length, 0);
  assert.deepEqual(agendaCounters(st.appts, NOCHE), { hoy: 0, proximas: 0, sinResultado: 0, todas: 1 });
  // 6) Un cambio posterior de la TLK no la "reactiva" ni la borra: queda bloqueado (solo lectura)
  const r3 = diffState(st, { ...st, appts: st.appts.map((a: any) => ({ ...a, notas: "x" })) }, d, ctxTLK);
  assert.equal(r3.ops.length, 0);
  const r4 = diffState(st, { ...st, appts: [] }, d, ctxTLK);                                  // intentar quitarla de la lista
  assert.equal(r4.ops.length, 0); assert.ok(r4.blocked.length > 0);
});

test("r5 · 15: una cancelada no cuenta como duplicado activo", () => {
  const c = cancelarCita(cita({ id: "c1", fecha: "2026-10-01T18:00" }), LIAM, NOCHE, "x");
  assert.equal(duplicateApptCandidate([c], { id: "n", tipo: "cita", sourceSection: "agregados", sourceRecordId: "a1", fecha: "2026-10-01T18:00" }), null);
  assert.equal(duplicateApptCandidate([c], { id: "n", tipo: "cita", telefono: "(210) 555-0101", fecha: "2026-10-01T18:00" }), null);
});

test("r5 · 16: ACCESS_V2=0 conserva los colores legacy tal cual", () => {
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes(`{ v:"cita",     ico:"📋", l:"Cita",         desc:"Azul · Google Calendar",    color:"#5b21b6", pill:"bg-purple-100 text-purple-800"    },`));
  assert.ok(app.includes(`  : { cita:"#5b21b6", llamada:"#ea580c", cocinada:"#7c3aed", servicio:"#dc2626", personal:"#16a34a", entrevista:"#0d9488" };`));
  assert.ok(app.includes(`cita:        { emoji:"📋", label:"Cita",                    colorId:"7",`));
  assert.ok(app.includes(`const TIPO_BORDER = { cita:"border-l-[#7c3aed]"`));
});

test("r5.1 · Personal = azul en todo v2 (filtro, menú, tarjeta, título de Google/Apple); legacy conserva 🟢", () => {
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const lineas = app.split("\n");
  // v2: cada referencia de Personal usa 🔵
  assert.ok(app.includes(`{v:"personal",   ico:ACCESS_V2?"🔵":"🟢", label:"Personal"}`), "TIPO_FILTROS");
  assert.ok(app.includes("if (ACCESS_V2) EVENT_CONFIG.personal={ ...EVENT_CONFIG.personal, emoji:\"🔵\", title: n=>`🔵 Personal - ${n}` };"), "EVENT_CONFIG (título Google/Apple)");
  assert.ok(app.includes(`...(o.v==="personal"?{ico:"🔵"}:{})`), "TYPE_OPTIONS");
  assert.ok(app.includes(`personal:ACCESS_V2?"🔵":"🟢"`), "TIPO_ICON");
  // ningún 🟢 de Personal queda sin condición: solo las dos definiciones legacy (sobrescritas en v2)
  const sinCondicion = lineas.filter((l) => l.includes("🟢") && /ersonal/.test(l) && !/ACCESS_V2/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(sinCondicion.length, 2);
  assert.ok(sinCondicion[0].trim().startsWith(`{ v:"personal", ico:"🟢"`) && sinCondicion[1].trim().startsWith(`personal:    { emoji:"🟢"`));
  // legacy: literales exactos de main/r4
  assert.ok(app.includes(`  { v:"personal", ico:"🟢", l:"Personal",     desc:"Verde · Google Calendar",    color:"#16a34a", pill:"bg-green-100 text-green-800"  },`));
  assert.ok(app.includes("  personal:    { emoji:\"🟢\", label:\"Personal\",                colorId:\"10\", title: n=>`🟢 Personal - ${n}` },     // verde (albahaca)"));
  assert.equal(PALETA_TIPOS.personal.nombre, "Azul"); assert.equal(PALETA_TIPOS.personal.color, "#2563eb");
});
