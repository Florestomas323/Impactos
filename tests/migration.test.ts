import { test } from "node:test";
import assert from "node:assert/strict";
import { joinLegacyDocs, countLegacy, planMigration, verifyMigration, formatReport, mapLegacyRole } from "../src/services/migration";
import { queriesFor, docIdFor } from "../src/data/schema";
import { assignRecord, unassignRecord, onlyAssignmentChanged, deriveWorkStatus } from "../src/services/assignments";
import { checkSeat, countSeats } from "../src/auth/workspaces";

const NOW = new Date("2026-09-19T15:00:00Z");
const dias = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const cliente = (id: string, extra: any = {}) => ({
  id, nombre: "Cliente " + id, telefono: "254555" + id, email: "c" + id + "@x.com",
  direccion: "1 Main St", ciudad: "Temple", cp: "76501", cuenta: "AC" + id,
  estado: "naranja", venta: false, resultado: "seguimiento", proximo_seguimiento: "2026-08-01",
  ultimaNota: "nota visible", notas: [{ texto: "nota visible", fecha: dias(40), agente: "Yelitza" }],
  mensajes: [{ t: "wa enviado", f: dias(41) }],
  historial: [{ id: "h" + id, tipo: "llamada", estado: "naranja", notas: "no contestó", agente: "Yelitza", fecha: dias(40) }],
  asignado_a: "Yelitza", eliminado: false, creado: dias(90), actualizado: dias(40), ...extra,
});

// Estado viejo tal como vive hoy: fragmentado en sec_<seccion>_<n> + sec_misc.
const legacyDocs = () => ({
  state: { agregados: [cliente("v0")] },                       // legado V0: debe ignorarse
  sec_misc: {
    callLog: { "2026-09-18": { Yelitza: 12 } },
    incentivos: [{ id: "i1", nombre: "Bono" }],
    cuentasCustom: [
      { email: "florestomas323@gmail.com", nombre: "Tomas", rol: "Distribuidor" },
      { email: "angie@x.com", nombre: "Angie", rol: "Distribuidor" },
      { email: "mila@x.com", nombre: "Mila", rol: "Supervisora telemarketing" },
      { email: "yelitza@x.com", nombre: "Yelitza", rol: "Telemarketing" },
      { email: "jovanna@x.com", nombre: "Jovanna", rol: "Cobranza" },
      { email: "jean@x.com", nombre: "Jean", rol: "Cobranza" },
    ],
    cumpleMsgTpl: "Feliz cumple {nombre}",
  },
  sec_agregados_1: [cliente("a1")], sec_agregados_2: [cliente("a2")], sec_agregados_3: [], sec_agregados_4: [], sec_agregados_5: [],
  sec_prospectos_1: [cliente("p1", { fuente: "Facebook" })], sec_prospectos_2: [], sec_prospectos_3: [], sec_prospectos_4: [], sec_prospectos_5: [],
  sec_distribucion_1: [cliente("d1", { ultima_compra: "2025-03-02" })], sec_distribucion_2: [], sec_distribucion_3: [], sec_distribucion_4: [], sec_distribucion_5: [],
  sec_referidos_1: [{ id: "r1", anfitrion: "Ana", anfitrion_telefono: "2545550000", estado: "verde",
    referidos: [{ nombre: "Luis", telefono: "2545551111", notas: [{ texto: "interesado", fecha: dias(5) }], historial: [{ tipo: "llamada", fecha: dias(5) }] }] }],
  sec_referidos_2: [], sec_referidos_3: [], sec_referidos_4: [], sec_referidos_5: [],
  sec_reclutamiento: [{ id: "rc1", nombre: "Pedro", telefono: "2545552222", etapa: "entrevista", notas: [], historial: [{ tipo: "llamada", fecha: dias(2) }] }],
  sec_cobranza_1: { cfg: { thresholds: { x: 1 } }, recurrentes: [{ id: "rec1" }],
    clientesData: { d1: { saldo: 1200, pagoMensual: 90, historial: [{ tipo: "pago", fecha: dias(10) }], promesa: { fecha: "2026-09-25" } } } },
  sec_cobranza_2: { clientesData: { x9: { saldo: 500, historial: [] } } },  // sin cliente en Distribución
  sec_cobranza_3: { clientesData: {} }, sec_cobranza_4: { clientesData: {} }, sec_cobranza_5: { clientesData: {} },
  sec_appts_1: [{ id: "ap1", tipo: "cita", fecha: "2026-09-20", cliente: "Cliente a1", agente: "Yelitza" }],
  sec_appts_2: [], sec_appts_3: [], sec_appts_4: [], sec_appts_5: [],
  sec_appts: [{ id: "viejo", tipo: "cita" }],   // respaldo V2: debe ignorarse
});

test("Rearma el estado fragmentado e ignora los respaldos legados", () => {
  const e = joinLegacyDocs(legacyDocs());
  assert.deepEqual(e.agregados.map((c: any) => c.id), ["a1", "a2"]);   // no aparece "v0"
  assert.equal(e.appts.length, 1);                                     // no aparece "viejo"
  assert.equal(e.cobranza.cfg.thresholds.x, 1);
  assert.deepEqual(Object.keys(e.cobranza.clientesData).sort(), ["d1", "x9"]);
  assert.equal(e.callLog["2026-09-18"].Yelitza, 12);
});

test("Migrador: conteos iguales, cero perdidos, cero duplicados", () => {
  const e = joinLegacyDocs(legacyDocs());
  const antes = countLegacy(e);
  const plan = planMigration(e, "impactos", NOW);
  const rep = verifyMigration(e, plan, "impactos", NOW);
  assert.equal(rep.ok, true, formatReport(rep));
  assert.equal(rep.totalAntes, antes.total);
  assert.equal(rep.totalDespues, antes.total);
  assert.equal(rep.duplicados, 0);
  assert.deepEqual(rep.perdidos, []);
  assert.ok(Object.values(rep.diferencia).every((d) => d === 0));
  assert.deepEqual(rep.antes, { agregados: 2, prospectos: 1, distribucion: 1, referidos: 1, reclutamiento: 1, cobranza: 2 });
  assert.equal(rep.huerfanosCobranza, 1); // x9 no está en Distribución
  assert.equal(plan.appts.length, 1);
});

test("Migrador idempotente: correrlo dos veces no duplica ni cambia nada", () => {
  const e = joinLegacyDocs(legacyDocs());
  const p1 = planMigration(e, "impactos", NOW);
  const p2 = planMigration(e, "impactos", NOW);
  assert.deepEqual(p1.records.map((r) => r.id).sort(), p2.records.map((r) => r.id).sort());
  assert.equal(new Set(p1.records.map((r) => r.id)).size, p1.records.length);
  // segunda pasada sobre registros YA migrados: mismos ids, sin duplicar
  const yaMigrado = { ...e, agregados: p1.records.filter((r) => r.section === "agregados") };
  const p3 = planMigration(yaMigrado, "impactos", NOW);
  assert.deepEqual(p3.records.filter((r) => r.section === "agregados").map((r) => r.id), ["a1", "a2"]);
  assert.equal(p3.records.filter((r) => r.section === "agregados")[0].legacyId, "a1");
});

test("Conserva legacyId, IDs estables y trazabilidad del origen", () => {
  const plan = planMigration(joinLegacyDocs(legacyDocs()), "impactos", NOW);
  const a1 = plan.records.find((r) => r.legacyId === "a1")!;
  assert.equal(a1.id, "a1");                  // ID original se mantiene
  assert.equal(a1.legacySource, "crm_telemarketing");
  assert.equal(a1.migrationVersion, 1);
  assert.ok(a1.migratedAt);
  assert.equal(a1.appId, "impactos");
  // Cobranza usa cob_ para no chocar con el cliente de Distribución del mismo id
  const cob = plan.records.find((r) => r.section === "cobranza" && r.legacyId === "d1")!;
  assert.equal(cob.id, "cob_d1");
  assert.equal(cob.linkedRecordId, "d1");
  assert.equal(docIdFor("cobranza", "d1"), "cob_d1");
  assert.equal(plan.records.find((r) => r.id === "cob_x9")!.linkedRecordId, null);
  assert.equal(plan.records.filter((r) => r.id === "d1").length, 1); // el cliente NO se duplica
});

test("Nada de la historia comercial se pierde ni se simplifica", () => {
  const e = joinLegacyDocs(legacyDocs());
  const plan = planMigration(e, "impactos", NOW);
  const orig = e.agregados[0], mig = plan.records.find((r) => r.id === "a1")!;
  Object.keys(orig).forEach((k) => {
    if (k === "id") return;
    assert.deepEqual(mig[k], orig[k], "se perdió o cambió el campo " + k);
  });
  assert.deepEqual(mig.notas, orig.notas);
  assert.deepEqual(mig.mensajes, orig.mensajes);
  assert.deepEqual(mig.historial, orig.historial);
  assert.equal(mig.ultimaNota, "nota visible");
  assert.equal(mig.email, orig.email);
  assert.equal(mig.proximo_seguimiento, "2026-08-01");
  // el responsable viejo era un NOMBRE: se guarda como histórico, no como uid
  assert.equal(mig.responsablePrevio, "Yelitza");
  assert.equal(mig.assignedTo, null);
  // referidos: la historia anidada viaja completa
  const ref = plan.records.find((r) => r.id === "r1")!;
  assert.equal(ref.referidos[0].notas[0].texto, "interesado");
  // cobranza: saldo, promesa e historial de pagos
  const cob = plan.records.find((r) => r.id === "cob_d1")!;
  assert.equal(cob.saldo, 1200); assert.equal(cob.promesa.fecha, "2026-09-25"); assert.equal(cob.historial.length, 1);
  // todo lo que no es registro viaja a shared/{misma clave que usa la app}
  assert.equal(plan.shared.cobranza.cfg.thresholds.x, 1);
  assert.deepEqual(plan.shared.cobranza.recurrentes, [{ id: "rec1" }]);
  assert.equal(plan.shared.cobranza.clientesData, undefined);
  assert.equal(plan.shared.callLog["2026-09-18"].Yelitza, 12);
  assert.equal(plan.shared.cumpleMsgTpl, "Feliz cumple {nombre}");
  assert.deepEqual(plan.shared.incentivos, [{ id: "i1", nombre: "Bono" }]);
  // el sistema de acceso viejo NO se copia a shared
  assert.equal(plan.shared.cuentasCustom, undefined);
  assert.equal(plan.shared.agregados, undefined);
});

test("Modelo de asignación listo: único responsable, reasignar, liberar, recontacto", () => {
  const plan = planMigration(joinLegacyDocs(legacyDocs()), "impactos", NOW);
  const base = plan.records.find((r) => r.id === "a1")!;
  assert.equal(base.assignmentStatus, "unassigned");
  assert.equal(base.assignmentType, "ventas");
  assert.equal(plan.records.find((r) => r.id === "cob_d1")!.assignmentType, "cobranza");
  assert.equal(plan.records.find((r) => r.id === "rc1")!.assignmentType, "reclutamiento");

  const a = assignRecord(base, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: NOW });
  assert.equal(a.record.assignmentStatus, "assigned");
  assert.equal(a.record.workStatus, "recontact");          // ya venía trabajado
  assert.equal(assignRecord(a.record, { toUid: "u2", toName: "Lisbeth", byUid: "sup", type: "ventas" }).changed, false);
  const b = assignRecord(a.record, { toUid: "u2", toName: "Lisbeth", byUid: "sup", type: "ventas", allowReassign: true, now: NOW });
  assert.equal(b.record.assignmentHistory.length, 2);
  assert.ok(b.record.assignmentHistory[0].unassignedAt);
  assert.ok(onlyAssignmentChanged(base, b.record));
  const libre = unassignRecord(b.record, { byUid: "sup", now: NOW });
  assert.equal(libre.record.assignedTo, null);
  assert.equal(libre.record.assignmentStatus, "unassigned");
  assert.equal(libre.record.assignmentHistory.length, 2);   // el historial nunca se borra
  assert.equal(deriveWorkStatus(libre.record), "worked");   // vuelve al pool como ya trabajado
});

test("Consultas por rol: el telemarketing nunca descarga la base completa", () => {
  const v = queriesFor({ role: "telemarketing_ventas", uid: "u1" });
  assert.deepEqual(v.map((q) => q.where), [
    [["assignedTo", "==", "u1"], ["section", "==", "agregados"]],
    [["assignedTo", "==", "u1"], ["section", "==", "referidos"]],
    [["assignedTo", "==", "u1"], ["section", "==", "prospectos"]],
  ]);
  assert.deepEqual(queriesFor({ role: "telemarketing_cobranza", uid: "c" }).map((q) => q.where[1][2]), ["cobranza", "distribucion"]);
  assert.deepEqual(queriesFor({ role: "telemarketing_reclutamiento", uid: "r" }).map((q) => q.where[1][2]), ["reclutamiento"]);
  assert.deepEqual(queriesFor({ role: "supervisor", uid: "s" }), [{ collection: "records", where: [] }]);
  assert.deepEqual(queriesFor({ role: "super_admin", uid: "t" }), [{ collection: "records", where: [] }]);
  assert.equal(queriesFor({ role: "telemarketing_ventas", uid: "u1" }, "appts").length, 2);
  assert.deepEqual(queriesFor({ role: "Telemarketing", uid: "x" }), []);   // rol viejo: sin acceso
});

test("Cupo único de 6 telemarketing, en cualquier combinación", () => {
  const combos = [
    { telemarketing_cobranza: 3, telemarketing_ventas: 1, telemarketing_reclutamiento: 2 },
    { telemarketing_ventas: 5, telemarketing_reclutamiento: 1 },
    { telemarketing_ventas: 6 },
    { telemarketing_ventas: 2, telemarketing_cobranza: 2, telemarketing_reclutamiento: 2 },
    { telemarketing_cobranza: 4, telemarketing_ventas: 2 },
  ];
  combos.forEach((c) => {
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    assert.equal(total, 6);
    ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"].forEach((r) => {
      assert.equal(checkSeat(c, r as any).ok, false, "séptimo aceptado en " + JSON.stringify(c));
    });
  });
  // con 5 ocupados cabe cualquier especialidad, sin tope individual
  const cinco = { telemarketing_cobranza: 4, telemarketing_ventas: 1 };
  ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"].forEach((r) => {
    assert.equal(checkSeat(cinco, r as any).ok, true);
  });
  assert.match(checkSeat({ telemarketing_ventas: 6 }, "telemarketing_cobranza").message, /cupo total/);
  assert.equal(checkSeat({ distribuidor: 2 }, "distribuidor").ok, false);
  assert.equal(checkSeat({ supervisor: 2 }, "supervisor").ok, false);
});

test("Las cuentas de hoy se convierten en invitaciones con el rol correcto", () => {
  const SUPER = "florestomas323@gmail.com";
  const e = joinLegacyDocs(legacyDocs());
  const m = (e.cuentasCustom as any[]).map((c) => [c.email, mapLegacyRole(c.rol, c.email, SUPER)]);
  assert.deepEqual(m, [
    [SUPER, "super_admin"],
    ["angie@x.com", "distribuidor"],
    ["mila@x.com", "supervisor"],
    ["yelitza@x.com", "telemarketing_ventas"],
    ["jovanna@x.com", "telemarketing_cobranza"],
    ["jean@x.com", "telemarketing_cobranza"],   // los dos caben: cupo único
  ]);
  const miembros = m.filter(([, r]) => r !== "super_admin").map(([, role]) => ({ role, status: "invited", appId: "impactos" }));
  const counts = countSeats(miembros as any, "impactos");
  assert.deepEqual(counts, { distribuidor: 1, supervisor: 1, telemarketing_ventas: 1, telemarketing_cobranza: 2 });
  assert.equal(checkSeat(counts, "telemarketing_reclutamiento").ok, true);
});
