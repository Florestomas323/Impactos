import { test } from "node:test";
import assert from "node:assert/strict";
import { registrosDeSeccion, receptoresPara, coincideBusqueda } from "../src/components/assignments/ManualAssignment";
import { matchesFilters, assignRecord, onlyAssignmentChanged, changedKeys } from "../src/services/assignments";
import { applyAssignments } from "../src/services/assignmentWriter";
// @ts-ignore
import { fakeDb } from "./fakeFirestore.mjs";

const NOW = new Date("2026-09-21T15:00:00Z");
const dias = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const cliente = (id: string, extra: any = {}) => ({
  id, nombre: "Cliente " + id, telefono: "(254) 555-01" + id, cuenta: "AC" + id, ciudad: "Temple", cp: "76501",
  estado: "naranja", venta: false, notas: "nota vieja en texto", mensajes: [{ t: "wa" }],
  historial: [{ tipo: "llamada", fecha: dias(45) }], proximo_seguimiento: "2026-08-01", eliminado: false, ...extra,
});
const miembros = [
  { uid: "v1", nombre: "Yelitza", role: "telemarketing_ventas", status: "active" },
  { uid: "v2", nombre: "Lisbeth", role: "telemarketing_ventas", status: "inactive" },
  { uid: "c1", nombre: "Jovanna", role: "telemarketing_cobranza", status: "active" },
  { uid: "r1", nombre: "Pedro", role: "telemarketing_reclutamiento", status: "active" },
  { uid: "s1", nombre: "Mila", role: "supervisor", status: "active" },
] as any;

test("Solo aparecen receptores cuyo rol trabaja esa sección", () => {
  const n = (sec: any) => receptoresPara(miembros, sec).map((m: any) => m.nombre);
  assert.deepEqual(n("agregados"), ["Yelitza"]);          // Lisbeth está inactiva
  assert.deepEqual(n("referidos"), ["Yelitza"]);
  assert.deepEqual(n("prospectos"), ["Yelitza"]);
  assert.deepEqual(n("cobranza"), ["Jovanna"]);
  assert.deepEqual(n("distribucion"), ["Jovanna"]);
  assert.deepEqual(n("reclutamiento"), ["Pedro"]);
});

test("Cada sección saca sus registros con el id de documento correcto", () => {
  const state = {
    agregados: [cliente("a1")],
    reclutamiento: [cliente("rc1")],
    cobranza: { clientesData: { d1: { saldo: 900 }, hy2: { saldo: 100 } } },
  };
  assert.deepEqual(registrosDeSeccion(state, "agregados").map((r: any) => r._docId), ["a1"]);
  assert.deepEqual(registrosDeSeccion(state, "reclutamiento").map((r: any) => r._docId), ["rc1"]);
  assert.deepEqual(registrosDeSeccion(state, "cobranza").map((r: any) => r._docId).sort(), ["cob_d1", "cob_hy2"]);
  assert.deepEqual(registrosDeSeccion(state, "prospectos"), []);
  // secciones guardadas como mapa (formato viejo) también se leen
  assert.equal(registrosDeSeccion({ agregados: { k1: cliente("a9") } } as any, "agregados").length, 1);
});

test("Búsqueda por nombre, teléfono (con o sin formato) y cuenta", () => {
  const c = cliente("07");
  assert.ok(coincideBusqueda(c, ""));
  assert.ok(coincideBusqueda(c, "cliente 07"));
  assert.ok(coincideBusqueda(c, "2545550107"));
  assert.ok(coincideBusqueda(c, "555-0107"));
  assert.ok(coincideBusqueda(c, "ac07"));
  assert.ok(!coincideBusqueda(c, "María"));
  assert.ok(coincideBusqueda({ anfitrion: "Anfitrión Ana" }, "ana"));
});

test("Contactados + sin venta + más de 30 días: el caso que pediste", () => {
  const viejo = cliente("v", { historial: [{ tipo: "llamada", fecha: dias(45) }] });
  const reciente = cliente("r", { historial: [{ tipo: "llamada", fecha: dias(5) }] });
  const vendido = cliente("s", { venta: true });
  const fresco = cliente("f", { historial: [], notas: [], estado: "sin_estado" });
  const f = { yaContactados: true, sinVenta: true, diasSinContacto: 30 };
  const pasan = [viejo, reciente, vendido, fresco].filter((r) => matchesFilters(r, f, NOW)).map((r) => r.id);
  assert.deepEqual(pasan, ["v"]);
});

test("Asignar a mano conserva TODO y deja rastro manual en el historial", async () => {
  const antes = cliente("a1", { assignedTo: "v9", assignedToName: "Otra", assignmentHistory: [{ userId: "v9", userName: "Otra", unassignedAt: null }] });
  const db = fakeDb({ "workspaces/impactos/records/a1": antes, "workspaces/impactos/records/a2": cliente("a2") });
  // sin confirmar la reasignación, el que ya tiene responsable NO se toca
  const r1 = await applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: "v9" }, { id: "a2", expectedAssignedTo: null }],
    { kind: "assign", toUid: "v1", toName: "Yelitza", type: "ventas", via: "manual" }, "s1");
  assert.equal(r1.ok, 1);
  assert.match(r1.skipped[0].error, /Ya está asignado a Otra/);
  assert.equal(db._data.get("workspaces/impactos/records/a1").assignedTo, "v9");
  assert.equal(db._data.get("workspaces/impactos/records/a2").assignedTo, "v1");
  // con confirmación explícita sí se reasigna
  const r2 = await applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: "v9" }],
    { kind: "assign", toUid: "v1", toName: "Yelitza", type: "ventas", allowReassign: true, via: "manual", reason: "asignación manual por Mila" }, "s1");
  assert.equal(r2.ok, 1);
  const fin = db._data.get("workspaces/impactos/records/a1");
  assert.equal(fin.assignedTo, "v1");
  assert.equal(fin.assignmentStatus, "assigned");
  assert.equal(fin.assignmentType, "ventas");
  // nada comercial se tocó
  assert.equal(fin.notas, "nota vieja en texto");
  assert.deepEqual(fin.mensajes, antes.mensajes);
  assert.deepEqual(fin.historial, antes.historial);
  assert.equal(fin.proximo_seguimiento, "2026-08-01");
  assert.equal(fin.cuenta, "AC" + "a1".slice(-2));
  // entrada nueva: anterior, nuevo, quién y que fue manual
  const ult = fin.assignmentHistory[fin.assignmentHistory.length - 1];
  assert.equal(ult.userId, "v1"); assert.equal(ult.userName, "Yelitza");
  assert.equal(ult.previousUserId, "v9"); assert.equal(ult.previousUserName, "Otra");
  assert.equal(ult.assignedBy, "s1"); assert.equal(ult.via, "manual");
  assert.ok(ult.assignedAt);
  assert.ok(fin.assignmentHistory[0].unassignedAt);   // el historial anterior no se borra
});

test("La escritura manual solo toca campos de asignación", () => {
  const antes = cliente("x1");
  const d = assignRecord(antes, { toUid: "v1", toName: "Yelitza", byUid: "s1", type: "ventas", via: "manual", now: NOW });
  assert.ok(onlyAssignmentChanged(antes, d.record), "tocó: " + changedKeys(antes, d.record).join(","));
});

test("Un registro no queda con dos responsables ni se duplica la asignación", async () => {
  const db = fakeDb({ "workspaces/impactos/records/a1": cliente("a1") });
  const op = (uid: string, esperado: any) => applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: esperado }],
    { kind: "assign", toUid: uid, toName: uid, type: "ventas", via: "manual", allowReassign: true }, "s1");
  await op("v1", null);
  const r = await op("c1", null);                       // otra pantalla, vista vieja
  assert.equal(r.ok, 0); assert.match(r.skipped[0].error, /Otra persona/);
  assert.equal(db._data.get("workspaces/impactos/records/a1").assignedTo, "v1");
  const igual = await op("v1", "v1");                   // asignar a quien ya lo tiene: no duplica
  assert.equal(igual.ok, 0);
  assert.equal(db._data.get("workspaces/impactos/records/a1").assignmentHistory.length, 1);
});
