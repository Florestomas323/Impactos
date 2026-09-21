import { test } from "node:test";
import assert from "node:assert/strict";
import { buildState, diffState, emptyDocs, mergeCallLogs, canWriteShared } from "../src/data/storeCore";
import { planOne, assignmentPatch, applyAssignments } from "../src/services/assignmentWriter";
import { canDo, canTab, setViewer } from "../src/auth/access";
import { puedeVerTabRol, puedeExportarRol, puedeCrearIncentivosRol, normalizarRol } from "../src/auth/legacyPermissions";
// @ts-ignore
import { fakeDb } from "./fakeFirestore.mjs";

const staff = { uid: "sup", role: "supervisor", appId: "impactos", nombre: "Mila", nowISO: "2026-09-20T10:00:00Z" };
const tm = { uid: "y1", role: "telemarketing_ventas", appId: "impactos", nombre: "Yelitza", nowISO: "2026-09-20T10:00:00Z" };
const docsBase = () => {
  const d = emptyDocs();
  d.records.a1 = { id: "a1", section: "agregados", nombre: "Ana", notas: "llamar el martes", historial: { k: { tipo: "llamada", fecha: "2026-08-01" } }, assignedTo: "y1", assignedToName: "Yelitza", assignmentHistory: [{ userId: "y1" }], legacyId: "a1", appId: "impactos", creado: "2026-01-02" };
  d.records.a2 = { id: "a2", section: "agregados", nombre: "Beto", notas: [], assignedTo: null, legacyId: "a2", appId: "impactos", creado: "2026-01-01" };
  d.records.cob_d1 = { id: "cob_d1", section: "cobranza", legacyId: "d1", saldo: 900, linkedRecordId: "d1", appId: "impactos" };
  d.records.d1 = { id: "d1", section: "distribucion", nombre: "Dora", appId: "impactos" };
  d.appts.ap1 = { id: "ap1", fecha: "2026-09-21", createdByUid: "y1", appId: "impactos" };
  d.shared.cobranza = { cfg: { dias: 30 } };
  d.shared.incentivos = [{ id: "i1" }];
  d.shared.callLog = { "2026-09-19": { Yelitza: 10 } };
  d.userData.y1 = { callLog: { "2026-09-20": { Yelitza: 3 } } };
  return d;
};

test("documentos → la MISMA forma de estado que usa la app hoy", () => {
  const st = buildState(docsBase());
  assert.deepEqual(st.agregados.map((r: any) => r.id), ["a1", "a2"]);
  assert.equal(st.agregados[0].notas, "llamar el martes");              // texto intacto
  assert.deepEqual(st.agregados[0].historial, { k: { tipo: "llamada", fecha: "2026-08-01" } }); // mapa intacto
  assert.equal(st.cobranza.cfg.dias, 30);
  assert.equal(st.cobranza.clientesData.d1.saldo, 900);
  assert.equal(st.cobranza.clientesData.d1.id, "d1");                  // la app la conoce por su clave
  assert.equal(st.distribucion[0].id, "d1");
  assert.deepEqual(st.incentivos, [{ id: "i1" }]);
  assert.deepEqual(st.callLog, { "2026-09-19": { Yelitza: 10 }, "2026-09-20": { Yelitza: 3 } });
  assert.equal(st.appts.length, 1);
});

test("editar un registro escribe SOLO ese documento, sin tocar asignación", () => {
  const d = docsBase(); const prev = buildState(d);
  const next = { ...prev, agregados: prev.agregados.map((r: any) => r.id === "a1" ? { ...r, estado: "verde", assignedTo: "HACKER", assignmentHistory: [] } : r) };
  const { ops } = diffState(prev, next, d, tm);
  assert.equal(ops.length, 1);
  const op: any = ops[0];
  assert.equal(op.id, "a1"); assert.equal(op.data.estado, "verde");
  assert.equal(op.data.assignedTo, "y1");                               // la app no puede cambiar responsable
  assert.deepEqual(op.data.assignmentHistory, [{ userId: "y1" }]);
  assert.equal(op.data.notas, "llamar el martes");                       // no se normaliza
  assert.deepEqual(op.data.historial, { k: { tipo: "llamada", fecha: "2026-08-01" } });
});

test("registro nuevo de un telemarketing nace asignado a él; de staff, sin asignar", () => {
  const d = docsBase(); const prev = buildState(d);
  const nuevo = { id: "n1", nombre: "Nuevo", creado: "2026-09-20" };
  const r1: any = diffState(prev, { ...prev, prospectos: [nuevo] }, d, tm).ops[0];
  assert.equal(r1.data.section, "prospectos"); assert.equal(r1.data.assignedTo, "y1");
  assert.equal(r1.data.assignmentHistory.length, 1); assert.equal(r1.data.createdByUid, "y1");
  const r2: any = diffState(prev, { ...prev, prospectos: [nuevo] }, d, staff).ops[0];
  assert.equal(r2.data.assignedTo, null); assert.equal(r2.data.assignmentStatus, "unassigned");
});

test("undefined se limpia (Firestore lo rechaza) pero null y textos se conservan", () => {
  const d = docsBase(); const prev = buildState(d);
  const next = { ...prev, agregados: prev.agregados.map((r: any) => r.id === "a2" ? { ...r, x: undefined, y: null } : r) };
  const op: any = diffState(prev, next, d, staff).ops[0];
  assert.ok(!("x" in op.data)); assert.equal(op.data.y, null);
});

test("borrado definitivo: solo distribuidor; el telemarketing queda bloqueado", () => {
  const d = docsBase(); const prev = buildState(d);
  const next = { ...prev, agregados: prev.agregados.filter((r: any) => r.id !== "a2") };
  const t = diffState(prev, next, d, tm);
  assert.equal(t.ops.length, 0); assert.match(t.blocked[0], /agregados:a2/);
  const dist = diffState(prev, next, d, { ...staff, role: "distribuidor" });
  assert.deepEqual(dist.ops, [{ kind: "delete", col: "records", id: "a2" }]);
});

test("cobranza: la entrada va a cob_<id> y la config a shared/cobranza", () => {
  const d = docsBase(); const prev = buildState(d);
  const cob = prev.cobranza;
  const next = { ...prev, cobranza: { ...cob, cfg: { dias: 45 }, clientesData: { ...cob.clientesData, d1: { ...cob.clientesData.d1, saldo: 800 } } } };
  const { ops } = diffState(prev, next, d, { ...tm, role: "telemarketing_cobranza" });
  const rec: any = ops.find((o: any) => o.kind === "set");
  assert.equal(rec.id, "cob_d1"); assert.equal(rec.data.saldo, 800); assert.equal(rec.data.legacyId, "d1");
  assert.equal(rec.data.linkedRecordId, "d1");
  const sh: any = ops.find((o: any) => o.kind === "shared");
  assert.equal(sh.key, "cobranza"); assert.deepEqual(sh.data, { cfg: { dias: 45 } });
});

test("callLog: cada quien guarda SOLO su parte, en su userData", () => {
  const d = docsBase(); const prev = buildState(d);
  const next = { ...prev, callLog: { ...prev.callLog, "2026-09-20": { Yelitza: 5, Otra: 99 } } };
  const { ops } = diffState(prev, next, d, tm);
  assert.deepEqual(ops, [{ kind: "userCallLog", uid: "y1", callLog: { "2026-09-20": { Yelitza: 5 } } }]);
  assert.deepEqual(mergeCallLogs({ a: { x: 1 } }, { a: { x: 2 } }), { a: { x: 3 } });
});

test("claves compartidas: staff escribe; telemarketing solo las suyas", () => {
  const d = docsBase(); const prev = buildState(d);
  const { ops, blocked } = diffState(prev, { ...prev, incentivos: [] }, d, tm);
  assert.equal(ops.length, 0); assert.deepEqual(blocked, ["incentivos"]);
  assert.equal(diffState(prev, { ...prev, incentivos: [] }, d, staff).ops.length, 1);
  assert.ok(canWriteShared("telemarketing_ventas", "cofreAperturas"));
  assert.ok(canWriteShared("telemarketing_reclutamiento", "socios"));
  assert.ok(!canWriteShared("telemarketing_ventas", "socios"));
  // el sistema de acceso viejo no viaja
  assert.equal(diffState(prev, { ...prev, cuentasCustom: [{ email: "x" }] }, d, staff).ops.length, 0);
});

test("reasignar en transacción escribe solo campos de asignación", async () => {
  const antes = { id: "a1", nombre: "Ana", notas: "llamar el martes", mensajes: [{ t: 1 }], historial: { k: { fecha: "2026-08-01", tipo: "llamada" } }, proximo_seguimiento: "2026-09-30", assignedTo: "y1", assignedToName: "Yelitza", assignmentHistory: [{ userId: "y1", unassignedAt: null }] };
  const db = fakeDb({ "workspaces/impactos/records/a1": antes, "workspaces/impactos/records/a2": { id: "a2", assignedTo: null } });
  const s1 = await applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: "y1" }, { id: "a2", expectedAssignedTo: null }], { kind: "assign", toUid: "l2", toName: "Lisbeth", type: "ventas", allowReassign: true }, "sup");
  assert.equal(s1.ok, 2);
  const a1 = db._data.get("workspaces/impactos/records/a1");
  assert.equal(a1.assignedTo, "l2");
  assert.equal(a1.notas, "llamar el martes"); assert.deepEqual(a1.mensajes, [{ t: 1 }]);
  assert.deepEqual(a1.historial, antes.historial); assert.equal(a1.proximo_seguimiento, "2026-09-30");
  assert.equal(a1.assignmentHistory.length, 2); assert.ok(a1.assignmentHistory[0].unassignedAt);
  // choque: la pantalla creía que era de y1, pero ya es de l2
  const s2 = await applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: "y1" }], { kind: "assign", toUid: "z9", toName: "Z", type: "ventas", allowReassign: true }, "sup");
  assert.equal(s2.ok, 0); assert.match(s2.skipped[0].error, /Otra persona/);
  // sin allowReassign no se duplica asignación
  const s3 = await applyAssignments(db, "impactos", [{ id: "a1" }], { kind: "assign", toUid: "z9", toName: "Z", type: "ventas" }, "sup");
  assert.equal(s3.ok, 0); assert.match(s3.skipped[0].error, /Ya está asignado/);
  // retirar: vuelve al pool, historial intacto, lastAssignedAt no cambia
  const last = db._data.get("workspaces/impactos/records/a1").lastAssignedAt;
  await applyAssignments(db, "impactos", [{ id: "a1", expectedAssignedTo: "l2" }], { kind: "unassign" }, "sup");
  const fin = db._data.get("workspaces/impactos/records/a1");
  assert.equal(fin.assignedTo, null); assert.equal(fin.assignmentHistory.length, 2); assert.equal(fin.lastAssignedAt, last);
  assert.equal(fin.notas, "llamar el martes");
});

test("modo actual (producción): canDo/canTab responden IGUAL que el sistema viejo", () => {
  const roles = ["Distribuidor", "Supervisora telemarketing", "Supervisor", "Telemarketing", "Cobranza", "Reclutador", "Administradora", "loquesea", ""];
  const tabs = ["inicio", "llamadas", "agenda", "servicio", "agregados", "referidos", "prospectos", "distribucion", "reclutamiento", "cobranza", "catalogo", "simulador", "rutas", "cumpleanos", "incentivo", "control", "stats", "config"];
  roles.forEach((rol) => {
    const v = { mode: "legacy" as const, legacyRole: rol };
    tabs.forEach((t) => assert.equal(canTab(t, v), puedeVerTabRol(rol, t), `${rol}/${t}`));
    assert.equal(canDo("exportar", v), puedeExportarRol(rol));
    assert.equal(canDo("incentivos.manage", v), puedeCrearIncentivosRol(rol));
    assert.equal(canDo("usuarios.manage", v), normalizarRol(rol) === "Distribuidor");
    assert.equal(canDo("datos.herramientas", v), ["Distribuidor", "Supervisor"].includes(normalizarRol(rol)));
    assert.equal(canTab("usuarios", v), false); assert.equal(canTab("asignaciones", v), false);
  });
});

test("modo nuevo: pestañas separadas para Ventas, Cobranza y Reclutamiento", () => {
  const V = (role: string) => ({ mode: "v2" as const, user: { uid: "u", role, status: "active", appId: "impactos" } });
  const ver = (role: string) => ["agregados", "prospectos", "referidos", "distribucion", "cobranza", "reclutamiento", "usuarios", "asignaciones"].filter((t) => canTab(t, V(role)));
  assert.deepEqual(ver("telemarketing_ventas"), ["agregados", "prospectos", "referidos"]);
  assert.deepEqual(ver("telemarketing_cobranza"), ["distribucion", "cobranza"]);
  assert.deepEqual(ver("telemarketing_reclutamiento"), ["reclutamiento"]);
  assert.deepEqual(ver("supervisor"), ["agregados", "prospectos", "referidos", "distribucion", "asignaciones"]);
  assert.deepEqual(ver("distribuidor"), ["agregados", "prospectos", "referidos", "distribucion", "cobranza", "reclutamiento", "usuarios", "asignaciones"]);
  assert.equal(canTab("cobranza", { mode: "v2", user: { role: "distribuidor", status: "inactive" } }), false);
  setViewer({ mode: "v2", user: { role: "telemarketing_ventas", status: "active" } });
  assert.equal(canDo("exportar"), false);
  setViewer({ mode: "legacy", legacyRole: "" });
});
