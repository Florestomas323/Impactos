import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fakeFirestore.mjs";
import { runAction, loadCaller } from "../api/_lib/usersCore.js";

const seed = () => ({
  "workspaces/impactos": { nombre: "impactos" },
  "workspaces/otra": { nombre: "otra" },
  "users/tomas": { role: "super_admin", status: "active", appId: "impactos", emailNormalized: "t@x.com" },
  "users/angie": { role: "distribuidor", status: "active", appId: "impactos", emailNormalized: "a@x.com" },
  "users/mila": { role: "supervisor", status: "active", appId: "impactos", emailNormalized: "m@x.com" },
  "users/yeli": { role: "telemarketing_ventas", status: "active", appId: "impactos", emailNormalized: "y@x.com" },
});
const as = async (db, uid) => loadCaller(db, uid);
const run = async (db, uid, body) => runAction(db, await as(db, uid), body);
const rejects = async (p, re) => { await assert.rejects(p, (e) => { assert.match(e.message, re); return true; }); };

test("invitar ocupa cupo y respeta el límite de 6 telemarketing en cualquier combinación", async () => {
  const db = fakeDb(seed());
  // ya hay 1 ventas → caben 5 más, repartidos libremente
  const roles = ["telemarketing_cobranza", "telemarketing_cobranza", "telemarketing_cobranza", "telemarketing_reclutamiento", "telemarketing_reclutamiento"];
  for (let i = 0; i < roles.length; i++) await run(db, "angie", { action: "invite", email: `tm${i}@x.com`, nombre: "TM" + i, role: roles[i], appId: "impactos" });
  await rejects(run(db, "angie", { action: "invite", email: "septimo@x.com", role: "telemarketing_ventas" }), /cupo total/);
  await rejects(run(db, "tomas", { action: "invite", email: "septimo@x.com", role: "telemarketing_cobranza", appId: "impactos" }), /cupo total/);
  assert.equal(db._data.get("workspaces/impactos").counts.telemarketing_cobranza, 3);
  // otra app tiene su propio cupo
  await run(db, "tomas", { action: "invite", email: "otro@x.com", role: "telemarketing_ventas", appId: "otra" });
});

test("revocar una invitación libera el cupo", async () => {
  const db = fakeDb(seed());
  for (let i = 0; i < 5; i++) await run(db, "angie", { action: "invite", email: `t${i}@x.com`, role: "telemarketing_ventas" });
  await rejects(run(db, "angie", { action: "invite", email: "z@x.com", role: "telemarketing_ventas" }), /cupo/);
  await run(db, "angie", { action: "revokeInvitation", email: "t0@x.com" });
  await run(db, "angie", { action: "invite", email: "z@x.com", role: "telemarketing_ventas" });
});

test("2 distribuidores y 2 supervisores como máximo; solo el Súper Admin invita distribuidores", async () => {
  const db = fakeDb(seed());
  await rejects(run(db, "angie", { action: "invite", email: "d2@x.com", role: "distribuidor" }), /equipo operativo/);
  await run(db, "tomas", { action: "invite", email: "d2@x.com", role: "distribuidor", appId: "impactos" });
  await rejects(run(db, "tomas", { action: "invite", email: "d3@x.com", role: "distribuidor", appId: "impactos" }), /2 distribuidores/);
  await run(db, "angie", { action: "invite", email: "s2@x.com", role: "supervisor" });
  await rejects(run(db, "angie", { action: "invite", email: "s3@x.com", role: "supervisor" }), /2 supervisores/);
});

test("nadie crea otro Súper Admin; supervisor y telemarketing no administran", async () => {
  const db = fakeDb(seed());
  await rejects(run(db, "tomas", { action: "invite", email: "x@x.com", role: "super_admin", appId: "impactos" }), /Rol inválido/);
  await rejects(as(db, "mila"), /no puede administrar/);
  await rejects(as(db, "yeli"), /no puede administrar/);
  await rejects(run(db, "angie", { action: "changeRole", uid: "tomas", role: "supervisor" }), /No puedes modificar/);
});

test("un distribuidor no toca otra app; correo duplicado rechazado", async () => {
  const db = fakeDb(seed());
  const r = await run(db, "angie", { action: "invite", email: "N@X.com ", role: "telemarketing_ventas", appId: "otra" });
  assert.equal(db._data.get("invitations/n@x.com").appId, "impactos");     // se ignora el appId pedido
  await rejects(run(db, "angie", { action: "invite", email: "n@x.com", role: "telemarketing_ventas" }), /invitación pendiente/);
  await rejects(run(db, "angie", { action: "invite", email: "y@x.com", role: "telemarketing_ventas" }), /ya tiene cuenta/);
});

test("cambiar rol: libera el puesto viejo; desactivar libera, reactivar exige cupo", async () => {
  const db = fakeDb(seed());
  for (let i = 0; i < 5; i++) await run(db, "angie", { action: "invite", email: `t${i}@x.com`, role: "telemarketing_ventas" });
  // equipo lleno (6): pasar a Yeli de ventas a cobranza cabe (se descuenta ella misma)
  await run(db, "angie", { action: "changeRole", uid: "yeli", role: "telemarketing_cobranza" });
  assert.equal(db._data.get("users/yeli").role, "telemarketing_cobranza");
  await run(db, "angie", { action: "setStatus", uid: "yeli", status: "inactive" });
  assert.equal(db._data.get("users/yeli").status, "inactive");
  await run(db, "angie", { action: "invite", email: "nueva@x.com", role: "telemarketing_ventas" });   // ocupa su lugar
  await rejects(run(db, "angie", { action: "setStatus", uid: "yeli", status: "active" }), /cupo total/);
  await rejects(run(db, "angie", { action: "setStatus", uid: "angie", status: "inactive" }), /propio estado/);
});

test("mover de app: solo Súper Admin, con cupo en destino y sin datos asignados", async () => {
  const db = fakeDb({ ...seed(), "workspaces/impactos/records/r1": { assignedTo: "yeli", section: "agregados" } });
  await rejects(run(db, "angie", { action: "moveApp", uid: "yeli", appId: "otra" }), /Solo el Súper Admin/);
  await rejects(run(db, "tomas", { action: "moveApp", uid: "yeli", appId: "otra" }), /registros asignados/);
  db._data.set("workspaces/impactos/records/r1", { assignedTo: null, section: "agregados" });
  await run(db, "tomas", { action: "moveApp", uid: "yeli", appId: "otra" });
  assert.equal(db._data.get("users/yeli").appId, "otra");
  await rejects(run(db, "tomas", { action: "moveApp", uid: "yeli", appId: "noexiste" }), /no existe/);
});

test("cada acción deja rastro en la bitácora", async () => {
  const db = fakeDb(seed());
  await run(db, "angie", { action: "invite", email: "b@x.com", role: "telemarketing_ventas" });
  await run(db, "angie", { action: "setStatus", uid: "yeli", status: "suspended" });
  const logs = [...db._data.keys()].filter((k) => k.startsWith("workspaces/impactos/audit/"));
  assert.equal(logs.length, 2);
});
