import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canViewTab, recordScope, manageableRoles } from "../src/auth/permissions";
import { checkSeat, checkRoleChange, countSeats } from "../src/auth/workspaces";
import { assignRecord, unassignRecord, bulkAssign, selectForAssignment, onlyAssignmentChanged, changedKeys, workload, deriveWorkStatus } from "../src/services/assignments";

const U = (role: string, status = "active", appId = "impactos", uid = role) => ({ uid, role, status, appId, nombre: role });
const NOW = new Date("2026-09-19T15:00:00Z");
const dias = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const clienteTrabajado = () => ({
  id: "c1", nombre: "María", telefono: "2545550101", ciudad: "Temple", cp: "76501", estado: "naranja", venta: false,
  ultimaNota: "Llamar en la tarde", notas: [{ texto: "Llamar en la tarde", fecha: dias(45), agente: "Yelitza" }],
  historial: [{ id: "h1", tipo: "llamada", estado: "naranja", notas: "no contestó", agente: "Yelitza", fecha: dias(45) }],
  mensajes: [{ t: "hola", f: dias(46) }], proximo_seguimiento: "2026-08-01", resultado: "seguimiento", eliminado: false,
});

test("Súper Admin ve todo", () => {
  const sa = U("super_admin");
  ["inicio", "cobranza", "reclutamiento", "usuarios", "asignaciones", "config", "stats"].forEach((t) => assert.ok(canViewTab(sa, t), t));
  assert.ok(can(sa, "lo.que.sea"));
  assert.equal(recordScope(sa, "cobranza"), "all");
});
test("Distribuidor y Supervisor: toda su app, sin poder crear Súper Admin", () => {
  assert.equal(recordScope(U("distribuidor"), "agregados"), "all");
  assert.equal(recordScope(U("supervisor"), "reclutamiento"), "all");
  assert.ok(can(U("supervisor"), "asignaciones.manage"));
  assert.ok(!can(U("supervisor"), "usuarios.manage"));
  assert.ok(!manageableRoles(U("distribuidor")).includes("super_admin" as any));
  assert.ok(!manageableRoles(U("distribuidor")).includes("distribuidor"));
  assert.deepEqual(manageableRoles(U("supervisor")), []);
});
test("Telemarketing Ventas: solo lo asignado; sin cobranza, reclutamiento ni usuarios", () => {
  const u = U("telemarketing_ventas");
  assert.equal(recordScope(u, "agregados"), "assigned");
  assert.equal(recordScope(u, "cobranza"), "none");
  assert.equal(recordScope(u, "reclutamiento"), "none");
  assert.equal(recordScope(u, "distribucion"), "none");
  ["cobranza", "reclutamiento", "usuarios", "asignaciones", "stats"].forEach((t) => assert.ok(!canViewTab(u, t), t));
  ["inicio", "llamadas", "agenda", "agregados"].forEach((t) => assert.ok(canViewTab(u, t), t));
});
test("Cobranza: solo cobranza + distribución asignada", () => {
  const u = U("telemarketing_cobranza");
  assert.equal(recordScope(u, "cobranza"), "assigned");
  assert.equal(recordScope(u, "distribucion"), "assigned");
  assert.equal(recordScope(u, "agregados"), "none");
  assert.equal(recordScope(u, "reclutamiento"), "none");
  assert.ok(canViewTab(u, "cobranza")); assert.ok(!canViewTab(u, "reclutamiento")); assert.ok(!canViewTab(u, "prospectos"));
});
test("Reclutamiento: solo sus prospectos de reclutamiento", () => {
  const u = U("telemarketing_reclutamiento");
  assert.equal(recordScope(u, "reclutamiento"), "assigned");
  assert.equal(recordScope(u, "cobranza"), "none");
  assert.equal(recordScope(u, "agregados"), "none");
  assert.ok(!canViewTab(u, "cobranza")); assert.ok(!canViewTab(u, "distribucion"));
});
test("inactive / suspended / sin perfil / rol viejo: no entra a nada", () => {
  assert.ok(!can(U("distribuidor", "inactive"), "dashboard.view"));
  assert.ok(!can(U("supervisor", "suspended"), "dashboard.view"));
  assert.ok(!can(null, "dashboard.view"));
  assert.ok(!can(U("Distribuidor"), "dashboard.view")); // texto viejo ya no vale
  assert.ok(!can(U("Telemarketing"), "dashboard.view"));
  assert.equal(recordScope(U("telemarketing_ventas", "inactive"), "agregados"), "none");
});
test("Límites: 2 distribuidores, 2 supervisores, 6 telemarketing (cupo único)", () => {
  const seis = { telemarketing_ventas: 3, telemarketing_cobranza: 2, telemarketing_reclutamiento: 1 };
  assert.equal(checkSeat(seis, "telemarketing_ventas").ok, false);           // séptimo telemarketing
  assert.match(checkSeat(seis, "telemarketing_ventas").message, /cupo total/);
  assert.equal(checkSeat(seis, "telemarketing_cobranza").ok, false);
  assert.equal(checkSeat(seis, "telemarketing_reclutamiento").ok, false);
  // sin tope por especialidad: 4 de cobranza es válido mientras quepa en los 6
  assert.equal(checkSeat({ telemarketing_cobranza: 4 }, "telemarketing_cobranza").ok, true);
  assert.equal(checkSeat({ telemarketing_reclutamiento: 3 }, "telemarketing_reclutamiento").ok, true);
  assert.equal(checkSeat({ distribuidor: 2 }, "distribuidor").ok, false);
  assert.equal(checkSeat({ supervisor: 2 }, "supervisor").ok, false);
  assert.equal(checkSeat({}, "super_admin").ok, false);
  // el Súper Admin puede cambiar el cupo sin tocar código
  assert.equal(checkSeat(seis, "telemarketing_ventas", { telemarketing_total: 8 }).ok, true);
  // cambiar de especialidad con el equipo lleno: libera el puesto viejo
  assert.equal(checkRoleChange(seis, "telemarketing_ventas", "telemarketing_cobranza").ok, true);
  assert.equal(checkRoleChange(seis, "telemarketing_ventas", "distribuidor").ok, true);
  assert.equal(checkRoleChange({ ...seis, distribuidor: 2 }, "telemarketing_ventas", "distribuidor").ok, false);
});
test("Conteo de puestos: invitados cuentan, inactivos no, Súper Admin no", () => {
  const m = [
    { role: "super_admin", status: "active", appId: "impactos" },
    { role: "telemarketing_ventas", status: "active", appId: "impactos" },
    { role: "telemarketing_ventas", status: "invited", appId: "impactos" },
    { role: "telemarketing_ventas", status: "inactive", appId: "impactos" },
    { role: "telemarketing_ventas", status: "active", appId: "otra" },
  ];
  assert.deepEqual(countSeats(m, "impactos"), { telemarketing_ventas: 2 });
});
test("Un registro = un solo responsable; reasignar exige acción explícita", () => {
  const base = clienteTrabajado();
  const a = assignRecord(base, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: NOW });
  assert.ok(a.changed);
  const b = assignRecord(a.record, { toUid: "u2", toName: "Lisbeth", byUid: "sup", type: "ventas", now: NOW });
  assert.equal(b.changed, false); assert.match(b.error, /Ya está asignado a Yelitza/);
  assert.equal(b.record.assignedTo, "u1");
  const c = assignRecord(a.record, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: NOW });
  assert.equal(c.changed, false); assert.equal(c.record.assignmentHistory.length, 1); // no duplica
  // choque entre dos supervisores
  const d = assignRecord(a.record, { toUid: "u2", toName: "Lisbeth", byUid: "sup2", type: "ventas", allowReassign: true, expectedAssignedTo: null });
  assert.equal(d.changed, false); assert.match(d.error, /Otra persona/);
});
test("Reasignar conserva notas, mensajes, historial, citas, ventas y fechas", () => {
  const base = clienteTrabajado();
  const a = assignRecord(base, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: new Date(dias(10)) }).record;
  const b = assignRecord(a, { toUid: "u2", toName: "Lisbeth", byUid: "sup", type: "ventas", allowReassign: true, reason: "rotación", now: NOW });
  assert.ok(b.changed);
  assert.ok(onlyAssignmentChanged(base, b.record), "tocó: " + changedKeys(base, b.record).join(","));
  assert.deepEqual(b.record.notas, base.notas);
  assert.deepEqual(b.record.mensajes, base.mensajes);
  assert.deepEqual(b.record.historial, base.historial);
  assert.equal(b.record.ultimaNota, base.ultimaNota);
  assert.equal(b.record.estado, base.estado);
  assert.equal(b.record.proximo_seguimiento, base.proximo_seguimiento);
  assert.equal(b.record.resultado, base.resultado);
  // historial de asignaciones: nada se borra, la anterior queda cerrada
  assert.equal(b.record.assignmentHistory.length, 2);
  assert.equal(b.record.assignmentHistory[0].userId, "u1");
  assert.ok(b.record.assignmentHistory[0].unassignedAt);
  assert.equal(b.record.assignmentHistory[1].unassignedAt, null);
  assert.equal(b.record.assignedTo, "u2");
  // retirar
  const r = unassignRecord(b.record, { byUid: "sup", reason: "salió del equipo", now: NOW });
  assert.equal(r.record.assignedTo, null); assert.equal(r.record.assignmentHistory.length, 2);
  assert.ok(r.record.assignmentHistory[1].unassignedAt);
  assert.ok(onlyAssignmentChanged(base, r.record));
});
test("Cliente trabajado puede volver a asignarse (recontacto) y se filtra por antigüedad", () => {
  const base = clienteTrabajado();
  const frescos = Array.from({ length: 5 }, (_, i) => ({ id: "f" + i, nombre: "F" + i, estado: "sin_estado", historial: [], notas: [] }));
  const reciente = { ...clienteTrabajado(), id: "c2", historial: [{ tipo: "llamada", fecha: dias(3) }], notas: [] };
  const vendido = { ...clienteTrabajado(), id: "c3", venta: true };
  const equivocado = { ...clienteTrabajado(), id: "c4", estado: "numero_equivocado" };
  const todos = [base, reciente, vendido, equivocado, ...frescos];
  const sel = selectForAssignment(todos, { sinAsignar: true, yaContactados: true, sinVenta: true, diasSinContacto: 30 }, 300, NOW);
  assert.deepEqual(sel.map((r) => r.id), ["c1"]);
  assert.equal(selectForAssignment(todos, { frescos: true }, 3, NOW).length, 3);
  assert.equal(selectForAssignment(todos, { zip: "76501-1234", ciudad: "temple" }, 0, NOW).length, 3); // c1,c2,c3 (c4 bloqueado)
  const res = bulkAssign(sel, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: NOW });
  assert.equal(res.changed.length, 1);
  assert.equal(res.changed[0].workStatus, "recontact");
  assert.equal(deriveWorkStatus(res.changed[0]), "recontact");
  assert.equal(deriveWorkStatus(frescos[0]), "fresh");
  assert.equal(deriveWorkStatus(equivocado), "blocked");
});
test("Carga de trabajo por telemarketing", () => {
  const mk = (id: string, contacto: string | null, venta = false) => ({
    ...assignRecord({ id, estado: "sin_estado", historial: [], notas: [] }, { toUid: "u1", toName: "Yelitza", byUid: "sup", type: "ventas", now: new Date(dias(5)) }).record,
    historial: contacto ? [{ tipo: "llamada", fecha: contacto }] : [], venta,
  });
  const recs = [mk("a", dias(1)), mk("b", dias(2), true), mk("c", null), { id: "z", assignedTo: "u2" }];
  const w = workload(recs, [{ createdByUid: "u1" }, { agente: "Yelitza" }, { agente: "Otra" }], "u1", "Yelitza");
  assert.deepEqual({ a: w.asignados, p: w.pendientes, t: w.trabajados, c: w.citas, v: w.ventas }, { a: 3, p: 1, t: 2, c: 2, v: 1 });
});
