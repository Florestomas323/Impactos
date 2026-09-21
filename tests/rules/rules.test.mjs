// Pruebas de firestore.rules contra el EMULADOR oficial (nunca contra un proyecto real).
// Corre en GitHub Actions: .github/workflows/rules-test.yml
import { test, before, after, beforeEach } from "node:test";
import fs from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

let env;
const A = "impactos";
const U = {
  tomas: { role: "super_admin", appId: A, status: "active", email: "tomas@x.com" },
  angie: { role: "distribuidor", appId: A, status: "active", email: "angie@x.com" },
  mila:  { role: "supervisor", appId: A, status: "active", email: "mila@x.com" },
  yeli:  { role: "telemarketing_ventas", appId: A, status: "active", email: "yeli@x.com" },
  lis:   { role: "telemarketing_ventas", appId: A, status: "active", email: "lis@x.com" },
  jova:  { role: "telemarketing_cobranza", appId: A, status: "active", email: "jova@x.com" },
  pedro: { role: "telemarketing_reclutamiento", appId: A, status: "active", email: "pedro@x.com" },
  inac:  { role: "telemarketing_ventas", appId: A, status: "inactive", email: "inac@x.com" },
  otra:  { role: "distribuidor", appId: "otra", status: "active", email: "otra@x.com" },
};
const db = (uid) => env.authenticatedContext(uid, { email: (U[uid]?.email || uid + "@x.com"), email_verified: true }).firestore();
const R = (d, id) => d.collection("workspaces").doc(A).collection("records").doc(id);

before(async () => {
  env = await initializeTestEnvironment({ projectId: "impactos-rules-test", firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    for (const [uid, u] of Object.entries(U)) await f.collection("users").doc(uid).set({ ...u, emailNormalized: u.email });
    await f.collection("workspaces").doc(A).set({ nombre: A });
    const rec = (id, section, assignedTo, extra = {}) => f.collection("workspaces").doc(A).collection("records").doc(id)
      .set({ id, appId: A, section, assignedTo, notas: "llamar el martes", assignmentHistory: [], ...extra });
    await rec("a1", "agregados", "yeli"); await rec("a2", "agregados", "lis"); await rec("a3", "agregados", null);
    await rec("cob_d1", "cobranza", "jova"); await rec("d1", "distribucion", "jova");
    await rec("rc1", "reclutamiento", "pedro");
    await f.collection("invitations").doc("nueva@x.com").set({ email: "nueva@x.com", emailNormalized: "nueva@x.com", role: "telemarketing_ventas", appId: A, status: "invited" });
    await f.collection("workspaces").doc(A).collection("shared").doc("incentivos").set({ payload: [] });
  });
});

const q = (d, uid, section) => d.collection("workspaces").doc(A).collection("records").where("assignedTo", "==", uid).where("section", "==", section).get();

test("Súper Admin lee todo, incluido crm_telemarketing", async () => {
  await assertSucceeds(db("tomas").collection("workspaces").doc(A).collection("records").get());
  await assertSucceeds(db("tomas").collection("crm_telemarketing").doc("sec_misc").get());
});
test("Distribuidor y Supervisor leen toda su app, no otra", async () => {
  await assertSucceeds(db("angie").collection("workspaces").doc(A).collection("records").get());
  await assertSucceeds(db("mila").collection("workspaces").doc(A).collection("records").get());
  await assertFails(db("otra").collection("workspaces").doc(A).collection("records").get());
});
test("Telemarketing Ventas: solo sus registros", async () => {
  const d = db("yeli");
  await assertSucceeds(q(d, "yeli", "agregados"));
  await assertSucceeds(R(d, "a1").get());
  await assertFails(R(d, "a2").get());                                   // de otra telemarketing
  await assertFails(R(d, "a3").get());                                   // sin asignar
  await assertFails(q(d, "lis", "agregados"));                           // consultar lo de otra
  await assertFails(d.collection("workspaces").doc(A).collection("records").get()); // toda la base
});
test("Cobranza: solo cobranza + distribución asignada", async () => {
  const d = db("jova");
  await assertSucceeds(R(d, "cob_d1").get()); await assertSucceeds(R(d, "d1").get());
  await assertSucceeds(q(d, "jova", "cobranza")); await assertSucceeds(q(d, "jova", "distribucion"));
  await assertFails(q(d, "jova", "agregados")); await assertFails(R(d, "rc1").get());
});
test("Reclutamiento: solo sus prospectos", async () => {
  const d = db("pedro");
  await assertSucceeds(R(d, "rc1").get()); await assertSucceeds(q(d, "pedro", "reclutamiento"));
  await assertFails(R(d, "cob_d1").get()); await assertFails(R(d, "a1").get());
});
test("Usuario inactivo no lee nada; sin perfil tampoco", async () => {
  await assertFails(R(db("inac"), "a1").get());
  await assertFails(R(db("desconocido"), "a1").get());
  await assertFails(db("desconocido").collection("workspaces").doc(A).collection("shared").doc("incentivos").get());
});
test("Telemarketing puede trabajar su registro pero NO reasignarlo", async () => {
  const d = db("yeli");
  await assertSucceeds(R(d, "a1").set({ id: "a1", appId: A, section: "agregados", assignedTo: "yeli", notas: "nueva nota", assignmentHistory: [] }));
  await assertFails(R(d, "a1").update({ assignedTo: "lis" }));
  await assertFails(R(d, "a1").update({ assignmentHistory: [] , section: "cobranza" }));
  await assertFails(R(d, "a2").update({ notas: "x" }));
  await assertFails(R(d, "a1").delete());
});
test("Supervisor asigna; telemarketing crea solo asignado a sí mismo", async () => {
  await assertSucceeds(R(db("mila"), "a3").update({ assignedTo: "yeli", assignmentStatus: "assigned" }));
  await assertSucceeds(R(db("yeli"), "n1").set({ id: "n1", appId: A, section: "prospectos", assignedTo: "yeli", createdByUid: "yeli" }));
  await assertFails(R(db("yeli"), "n2").set({ id: "n2", appId: A, section: "prospectos", assignedTo: null, createdByUid: "yeli" }));
  await assertFails(R(db("yeli"), "n3").set({ id: "n3", appId: A, section: "cobranza", assignedTo: "yeli", createdByUid: "yeli" }));
});
test("Nadie se sube el rol ni crea invitaciones desde el teléfono", async () => {
  await assertFails(db("yeli").collection("users").doc("yeli").update({ role: "distribuidor" }));
  await assertFails(db("angie").collection("users").doc("yeli").update({ status: "inactive" }));
  await assertFails(db("angie").collection("invitations").doc("x@x.com").set({ role: "telemarketing_ventas", appId: A, status: "invited" }));
  await assertFails(db("tomas").collection("invitations").doc("x@x.com").set({ role: "super_admin", appId: A, status: "invited" }));
  await assertFails(db("angie").collection("workspaces").doc(A).update({ counts: {} }));
  await assertFails(db("tomas").collection("workspaces").doc(A).update({ limits: { telemarketing_total: 99 } }));
  await assertSucceeds(db("yeli").collection("users").doc("yeli").update({ lastActiveAt: "2026-09-20" }));
});
test("Invitado entra con su Google y nace con el rol de SU invitación", async () => {
  const nueva = env.authenticatedContext("nuevaUid", { email: "nueva@x.com", email_verified: true }).firestore();
  const ok = nueva.batch();
  ok.set(nueva.collection("users").doc("nuevaUid"), { email: "nueva@x.com", emailNormalized: "nueva@x.com", role: "telemarketing_ventas", appId: A, status: "active" });
  ok.update(nueva.collection("invitations").doc("nueva@x.com"), { status: "accepted", acceptedUid: "nuevaUid", acceptedAt: "x" });
  await assertSucceeds(ok.commit());
});
test("Invitado NO puede cambiarse el rol al aceptar; no invitado no entra", async () => {
  const nueva = env.authenticatedContext("nuevaUid", { email: "nueva@x.com", email_verified: true }).firestore();
  const b = nueva.batch();
  b.set(nueva.collection("users").doc("nuevaUid"), { email: "nueva@x.com", emailNormalized: "nueva@x.com", role: "distribuidor", appId: A, status: "active" });
  b.update(nueva.collection("invitations").doc("nueva@x.com"), { status: "accepted", acceptedUid: "nuevaUid", acceptedAt: "x" });
  await assertFails(b.commit());
  const intruso = env.authenticatedContext("intr", { email: "intruso@x.com", email_verified: true }).firestore();
  await assertFails(intruso.collection("users").doc("intr").set({ emailNormalized: "intruso@x.com", role: "telemarketing_ventas", appId: A, status: "active" }));
});
test("Config compartida: staff escribe; telemarketing solo lo suyo; callLog histórico es solo lectura", async () => {
  const S = (uid, k) => db(uid).collection("workspaces").doc(A).collection("shared").doc(k);
  await assertSucceeds(S("mila", "incentivos").set({ payload: [1] }));
  await assertFails(S("yeli", "incentivos").set({ payload: [] }));
  await assertSucceeds(S("yeli", "notificaciones").set({ payload: [] }));
  await assertSucceeds(S("pedro", "socios").set({ payload: [] }));
  await assertFails(S("yeli", "socios").set({ payload: [] }));
  await assertSucceeds(S("jova", "cobranza").set({ payload: {} }));
  await assertFails(S("angie", "callLog").set({ payload: {} }));
  const UD = (uid, who) => db(uid).collection("workspaces").doc(A).collection("userData").doc(who);
  await assertSucceeds(UD("yeli", "yeli").set({ callLog: {} }));
  await assertFails(UD("yeli", "lis").set({ callLog: {} }));
});
test("crm_telemarketing no se puede escribir, ni siquiera el Súper Admin", async () => {
  await assertFails(db("tomas").collection("crm_telemarketing").doc("sec_misc").set({ x: 1 }));
  await assertFails(db("yeli").collection("crm_telemarketing").doc("sec_misc").get());
});
