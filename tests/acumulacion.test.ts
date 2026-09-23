// La cartera de un telemarketing CRECE: cada lote se suma, nada se reemplaza.
// El límite de 6 es de USUARIOS, no de registros.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAssignments } from "../src/services/assignmentWriter";
import { workload, selectForAssignment, matchesFilters } from "../src/services/assignments";
import { checkSeat, countSeats } from "../src/auth/workspaces";
// @ts-ignore
import { fakeDb } from "./fakeFirestore.mjs";

const NOW = new Date("2026-09-23T15:00:00Z");
const dias = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const cliente = (id: string, extra: any = {}) => ({
  id, nombre: "Cliente " + id, telefono: "254555" + id, ciudad: "Temple", cp: "76501", cuenta: "AC" + id,
  estado: "naranja", venta: false, notas: "nota original de " + id, mensajes: [{ t: "wa " + id }],
  historial: [{ tipo: "llamada", fecha: dias(45) }], proximo_seguimiento: "2026-09-01", eliminado: false, ...extra,
});
const MARIA = { uid: "maria", nombre: "María" };
const asignar = (db: any, ids: string[], to = MARIA, allowReassign = false, expected: any = null) =>
  applyAssignments(db, "impactos", ids.map((id) => ({ id, expectedAssignedTo: expected })),
    { kind: "assign", toUid: to.uid, toName: to.nombre, type: "ventas", via: "manual", allowReassign }, "sup");
const docs = (db: any) => [...db._data.entries()].filter(([k]: any) => k.includes("/records/")).map(([, v]: any) => v);
const deMaria = (db: any) => docs(db).filter((r: any) => r.assignedTo === "maria");

// 50 ya asignados + 30 frescos + una base vieja trabajada
function escenario() {
  const seed: any = {};
  const viejos: string[] = [];
  for (let i = 0; i < 50; i++) {
    const id = "v" + i; viejos.push(id);
    seed[`workspaces/impactos/records/${id}`] = { ...cliente(id), section: "agregados", assignedTo: "maria", assignedToName: "María", assignmentStatus: "assigned", assignmentType: "ventas", assignedAt: dias(60), assignmentHistory: [{ userId: "maria", userName: "María", assignedAt: dias(60), unassignedAt: null, via: "manual" }] };
  }
  const frescos: string[] = [];
  for (let i = 0; i < 30; i++) {
    const id = "f" + i; frescos.push(id);
    seed[`workspaces/impactos/records/${id}`] = { ...cliente(id), section: "agregados", historial: [], notas: [], estado: "sin_estado", assignedTo: null, assignmentHistory: [] };
  }
  const historicos: string[] = [];
  for (let i = 0; i < 12; i++) {
    const id = "h" + i; historicos.push(id);
    seed[`workspaces/impactos/records/${id}`] = { ...cliente(id), section: "agregados", assignedTo: null, assignmentHistory: [{ userId: "otro", userName: "Otro", assignedAt: dias(200), unassignedAt: dias(120), via: "manual" }] };
  }
  return { db: fakeDb(seed), viejos, frescos, historicos };
}

test("50 + 25 = 75, luego + 10 = 85; los 50 originales quedan intactos", async () => {
  const { db, viejos, frescos, historicos } = escenario();
  const antes50 = deMaria(db).map((r: any) => JSON.stringify(r)).sort();
  assert.equal(deMaria(db).length, 50);

  // Lote 1: 25 de los 30 frescos
  const r1 = await asignar(db, frescos.slice(0, 25));
  assert.equal(r1.ok, 25); assert.equal(r1.skipped.length, 0);
  assert.equal(deMaria(db).length, 75);

  // Lote 2 (mismo día, misma persona): 5 frescos que quedaban + 5 históricos
  const r2 = await asignar(db, [...frescos.slice(25), ...historicos.slice(0, 5)]);
  assert.equal(r2.ok, 10);
  assert.equal(deMaria(db).length, 85);

  // Los 50 originales: ni un byte distinto
  const despues50 = viejos.map((id) => JSON.stringify(db._data.get(`workspaces/impactos/records/${id}`))).sort();
  assert.deepEqual(despues50, antes50);

  // Y lo nuevo conserva su información comercial
  const nuevo = db._data.get(`workspaces/impactos/records/f0`);
  assert.equal(nuevo.assignedToName, "María");
  assert.equal(nuevo.nombre, "Cliente f0");
  assert.equal(nuevo.cuenta, "ACf0");
  const hist = db._data.get(`workspaces/impactos/records/h0`);
  assert.equal(hist.notas, "nota original de h0");
  assert.deepEqual(hist.mensajes, [{ t: "wa h0" }]);
  assert.deepEqual(hist.historial, [{ tipo: "llamada", fecha: dias(45) }]);
  assert.equal(hist.proximo_seguimiento, "2026-09-01");
  assert.equal(hist.assignmentHistory.length, 2);   // la vuelta anterior sigue ahí
});

test("Al día siguiente se le pueden dar otros 100 sin tocar los 85", async () => {
  const { db } = escenario();
  const extras: string[] = [];
  for (let i = 0; i < 100; i++) { const id = "x" + i; extras.push(id); db._data.set(`workspaces/impactos/records/${id}`, { ...cliente(id), section: "agregados", assignedTo: null, assignmentHistory: [] }); }
  const r = await asignar(db, extras);
  assert.equal(r.ok, 100);
  assert.equal(deMaria(db).length, 150);
  assert.equal(db._data.get("workspaces/impactos/records/v0").assignedTo, "maria");
});

test("Una cartera enorme NO bloquea: la carga de trabajo solo informa", async () => {
  const { db } = escenario();
  const muchos: string[] = [];
  for (let i = 0; i < 900; i++) { const id = "m" + i; muchos.push(id); db._data.set(`workspaces/impactos/records/${id}`, { ...cliente(id), section: "agregados", assignedTo: null, assignmentHistory: [] }); }
  assert.equal((await asignar(db, muchos)).ok, 900);
  const total = deMaria(db);
  assert.equal(total.length, 950);
  const w = workload(total, [], "maria", "María");
  assert.equal(w.asignados, 950);
  assert.ok(w.pendientes > 0);
  // Con 950 encima todavía se le puede dar uno más
  db._data.set("workspaces/impactos/records/z1", { ...cliente("z1"), section: "agregados", assignedTo: null, assignmentHistory: [] });
  assert.equal((await asignar(db, ["z1"])).ok, 1);
  assert.equal(deMaria(db).length, 951);
  // El cupo de 6 es de USUARIOS y no se mueve por esto
  const equipo = [{ role: "telemarketing_ventas", status: "active", appId: "impactos" }];
  assert.equal(checkSeat(countSeats(equipo as any, "impactos"), "telemarketing_ventas").ok, true);
});

test("Un cliente antiguo vuelve a repartirse: al mismo, a otro o al pool", async () => {
  const { db, historicos } = escenario();
  const id = historicos[0];
  const ref = `workspaces/impactos/records/${id}`;
  const original = { ...db._data.get(ref) };

  // filtro real: contactados + sin venta + más de 30 días
  const candidatos = docs(db).filter((r: any) => matchesFilters(r, { yaContactados: true, sinVenta: true, diasSinContacto: 30, sinAsignar: true }, NOW));
  assert.ok(candidatos.some((r: any) => r.id === id));

  await asignar(db, [id]);                                   // a María
  assert.equal(db._data.get(ref).assignedTo, "maria");
  // a otro: exige confirmación (sin ella no se toca)
  const sinConfirmar = await asignar(db, [id], { uid: "lis", nombre: "Lisbeth" }, false, "maria");
  assert.equal(sinConfirmar.ok, 0); assert.match(sinConfirmar.skipped[0].error, /Ya está asignado a María/);
  const conConfirmar = await asignar(db, [id], { uid: "lis", nombre: "Lisbeth" }, true, "maria");
  assert.equal(conConfirmar.ok, 1);
  const fin = db._data.get(ref);
  assert.equal(fin.assignedToName, "Lisbeth");
  // toda su información comercial intacta tras dos vueltas
  ["nombre", "telefono", "cuenta", "notas", "estado", "proximo_seguimiento"].forEach((k) => assert.deepEqual(fin[k], original[k], k));
  assert.deepEqual(fin.historial, original.historial);
  assert.deepEqual(fin.mensajes, original.mensajes);
  // historial de asignaciones completo: la vieja, María y Lisbeth
  assert.equal(fin.assignmentHistory.length, 3);
  assert.deepEqual(fin.assignmentHistory.map((e: any) => e.userName), ["Otro", "María", "Lisbeth"]);
  assert.equal(fin.assignmentHistory[2].previousUserName, "María");
  assert.equal(fin.assignmentHistory.filter((e: any) => !e.unassignedAt).length, 1); // un solo responsable activo
});

test("Los datos frescos pueden quedarse sin asignar el tiempo que haga falta", () => {
  const { db, frescos } = escenario();
  const libres = docs(db).filter((r: any) => !r.assignedTo);
  assert.equal(libres.length, frescos.length + 12);
  // La bandeja se consulta cuando se quiera, sin caducidad
  assert.equal(selectForAssignment(libres, { sinAsignar: true, frescos: true }, 0, NOW).length, 30);
  assert.equal(selectForAssignment(libres, { sinAsignar: true, yaContactados: true, sinVenta: true, diasSinContacto: 30 }, 0, NOW).length, 12);
});
