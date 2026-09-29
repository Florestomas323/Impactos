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
    await rec("cob_d1", "cobranza", "jova", { linkedRecordId: "d1" }); await rec("d1", "distribucion", "yeli");   // mismo cliente, responsables distintos: válido
    await rec("rc1", "reclutamiento", "pedro");
    await f.collection("invitations").doc("nueva@x.com").set({ email: "nueva@x.com", emailNormalized: "nueva@x.com", role: "telemarketing_ventas", appId: A, status: "invited" });
    await f.collection("workspaces").doc(A).collection("shared").doc("incentivos").set({ payload: [] });
    // Citas: c1 la consiguió yeli (sin distribuidor asignado: correcto en v2); c2 es de lis.
    const cita = (id, extra) => f.collection("workspaces").doc(A).collection("appts").doc(id).set({ id, appId: A, tipo: "cita", nombre: "Cliente " + id, telefono: "2105550000", fecha: "2026-09-29T20:00", producto: "Sartenes", createdByUid: "yeli", createdByName: "Yeli", assignedTo: null, sourceSection: "agregados", sourceRecordId: "a1", ...extra });
    await cita("c1", {}); await cita("c2", { createdByUid: "lis", createdByName: "Lis", sourceRecordId: "a2" });
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
test("Cobranza: SOLO sus cuentas de cobranza (nunca Distribución, que es Ventas)", async () => {
  const d = db("jova");
  await assertSucceeds(R(d, "cob_d1").get()); await assertSucceeds(q(d, "jova", "cobranza"));
  await assertFails(R(d, "d1").get()); await assertFails(q(d, "jova", "distribucion"));
  await assertFails(q(d, "jova", "agregados")); await assertFails(R(d, "rc1").get());
});
test("Ventas: recibe su Distribución asignada; nunca Cobranza", async () => {
  const d = db("yeli");
  await assertSucceeds(R(d, "d1").get()); await assertSucceeds(q(d, "yeli", "distribucion"));
  await assertFails(R(d, "cob_d1").get()); await assertFails(q(d, "yeli", "cobranza"));
});
test("Reclutamiento: solo sus prospectos", async () => {
  const d = db("pedro");
  await assertSucceeds(R(d, "rc1").get()); await assertSucceeds(q(d, "pedro", "reclutamiento"));
  await assertFails(R(d, "cob_d1").get()); await assertFails(R(d, "a1").get()); await assertFails(R(d, "d1").get());
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
  await assertFails(S("yeli", "notificaciones").set({ payload: [] }));             // v2: las del telemarketing son personales (userData)
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

// ════════ shared por rol + userData aislado (Rutas/Cumpleaños v2) ════════
const sembrarListas = async () => env.withSecurityRulesDisabled(async (c) => {
  const ws = c.firestore().collection("workspaces").doc(A);
  for (const k of ["rutas", "cumpleanos", "notificaciones", "cumpleNotifs", "catalogoCustom", "cumpleMsgTpl", "callLog", "cobranza", "socios", "docsSocios", "incentivos", "cofreConfig"])
    await ws.collection("shared").doc(k).set({ payload: [] });
  for (const u of ["yeli", "lis", "jova", "pedro"]) await ws.collection("userData").doc(u).set({ rutas: [{ id: "R-" + u }], cumpleanos: [] });
});
const SH = (uid, k) => db(uid).collection("workspaces").doc(A).collection("shared").doc(k);
const UD = (uid, who) => db(uid).collection("workspaces").doc(A).collection("userData").doc(who);

for (const [tlk, otro, propios] of [
  ["yeli", "lis", ["catalogoCustom", "cumpleMsgTpl", "callLog"]],
  ["jova", "yeli", ["cobranza"]],
  ["pedro", "jova", ["socios", "docsSocios"]],
]) {
  test(`${tlk} (${U[tlk].role}): rutas, cumpleanos, notificaciones y cumpleNotifs globales DENEGADOS; su userData sí, el de otro no`, async () => {
    await sembrarListas();
    for (const k of ["rutas", "cumpleanos", "notificaciones", "cumpleNotifs"]) {
      await assertFails(SH(tlk, k).get());
      await assertFails(SH(tlk, k).set({ payload: [] }));
    }
    await assertFails(db(tlk).collection("workspaces").doc(A).collection("shared").get());   // tampoco la colección entera
    for (const k of propios) await assertSucceeds(SH(tlk, k).get());                       // lo que su operación usa
    for (const k of ["incentivos", "cofreConfig"]) await assertFails(SH(tlk, k).get());
    await assertSucceeds(UD(tlk, tlk).get());
    await assertSucceeds(UD(tlk, tlk).set({ rutas: [{ id: "R-nueva", createdByUid: tlk, paradas: [{ id: "a1", section: "agregados" }] }], notificaciones: [], cumpleNotifs: {} }, { merge: true }));
    await assertFails(UD(tlk, otro).get());
    await assertFails(UD(tlk, otro).set({ rutas: [] }, { merge: true }));
    await assertFails(db(tlk).collection("workspaces").doc(A).collection("userData").get()); // no puede listar el del equipo
    await assertFails(SH(tlk, "rutas").set({ payload: [] }));                                // ni escribir la lista del equipo
  });
}
test("Staff: lee shared/rutas, shared/cumpleanos, notificaciones, cumpleNotifs y el userData del equipo", async () => {
  await sembrarListas();
  for (const s of ["angie", "mila", "tomas"]) {
    for (const k of ["rutas", "cumpleanos", "notificaciones", "cumpleNotifs"]) await assertSucceeds(SH(s, k).get());
    await assertSucceeds(UD(s, "yeli").get());
    await assertSucceeds(db(s).collection("workspaces").doc(A).collection("userData").get());
  }
  await assertFails(UD("angie", "yeli").set({ rutas: [] }, { merge: true }));              // Rutas del equipo: solo lectura
});

// ── AGENDA v2: citas (appts) ─────────────────────────────────────────────────
const AP = (d, id) => d.collection("workspaces").doc(A).collection("appts").doc(id);
test("Agenda: TLK crea su cita sin distribuidor (assignedTo null); no a nombre de otro ni con resultado", async () => {
  const y = db("yeli");
  await assertSucceeds(AP(y, "n1").set({ id: "n1", appId: A, tipo: "cita", fecha: "2026-10-01T19:30", createdByUid: "yeli", createdByName: "Yeli", assignedTo: null, sourceSection: "agregados", sourceRecordId: "a1", producto: "Sartenes" }));
  await assertFails(AP(y, "n2").set({ id: "n2", appId: A, tipo: "cita", createdByUid: "lis", assignedTo: null }));
  await assertFails(AP(y, "n3").set({ id: "n3", appId: A, tipo: "cita", createdByUid: "yeli", assignedTo: null, resultado: "demo_venta" }));
  await assertFails(AP(y, "n4").set({ id: "n4", appId: A, tipo: "cita", createdByUid: "yeli", assignedTo: null, resultByUid: "yeli" }));
});
test("Agenda: TLK NO registra resultado de visita (demo_venta, demo_no_venta, reprogramada_visita…)", async () => {
  const y = db("yeli");
  for (const r of ["demo_venta", "demo_no_venta", "no_recibio", "reprogramada_visita", "no_visito", "seguimiento"])
    await assertFails(AP(y, "c1").update({ resultado: r }));
  await assertFails(AP(y, "c1").update({ monto: 1500 }));
  await assertFails(AP(y, "c1").update({ resultByUid: "yeli", resultByName: "Yeli", resultAt: "2026-09-29T20:30:00.000Z" }));
  await assertFails(AP(y, "c1").update({ producto: "Purificador" }));
});
test("Agenda: TLK no cambia autoría, origen ni asignación de su cita", async () => {
  const y = db("yeli");
  await assertFails(AP(y, "c1").update({ createdByUid: "lis" }));
  await assertFails(AP(y, "c1").update({ createdByName: "Otra" }));
  await assertFails(AP(y, "c1").update({ sourceRecordId: "a2" }));
  await assertFails(AP(y, "c1").update({ sourceSection: "prospectos" }));
  await assertFails(AP(y, "c1").update({ sourceRefIndex: 3 }));
  await assertFails(AP(y, "c1").update({ assignedTo: "yeli" }));
});
test("Agenda: TLK edita datos, reprograma antes de la visita y cancela SUS citas; no las de otra ni borra", async () => {
  const y = db("yeli");
  await assertSucceeds(AP(y, "c1").update({ telefono: "2105551111", direccion: "123 Main St", ciudad: "San Antonio", cp: "78201", notas: "tocar fuerte" }));
  await assertSucceeds(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [{ previousDate: "2026-09-29T20:00", newDate: "2026-09-30T18:00", changedAt: "2026-09-29T15:00:00.000Z", changedByUid: "yeli", changedByName: "Yeli", reason: "before_visit" }] }));
  await assertSucceeds(AP(y, "c1").update({ status: "cancelada", cancelledAt: "2026-09-29T16:00:00.000Z", cancelledByUid: "yeli", cancelledByName: "Yeli", cancelReason: "cliente de viaje" }));
  await assertFails(AP(y, "c2").update({ notas: "x" }));
  await assertFails(AP(y, "c1").delete());
});
test("Agenda: TLK solo lee las citas que creó (o asignadas a ella); el staff lee toda la agenda", async () => {
  await assertSucceeds(AP(db("yeli"), "c1").get());
  await assertFails(AP(db("yeli"), "c2").get());
  for (const s of ["tomas", "angie", "mila"]) { await assertSucceeds(AP(db(s), "c1").get()); await assertSucceeds(AP(db(s), "c2").get()); }
  await assertFails(AP(db("otra"), "c1").get());
});
test("Agenda: staff registra el resultado con su traza y crea la cita de 'Reprogramada en visita' conservando al creador original", async () => {
  const t = db("tomas");
  await assertSucceeds(AP(t, "c1").update({ resultado: "reprogramada_visita", resultByUid: "tomas", resultByName: "Tomas", resultAt: "2026-09-29T20:40:00.000Z" }));
  await assertSucceeds(AP(t, "c1b").set({ id: "c1b", appId: A, tipo: "cita", fecha: "2026-09-30T19:00", createdByUid: "yeli", createdByName: "Yeli", assignedTo: null, sourceSection: "agregados", sourceRecordId: "a1", reprogrammedFromApptId: "c1", createdFrom: "reprogramada_visita" }));
  await assertSucceeds(AP(db("mila"), "c2").update({ resultado: "demo_venta", monto: 1800, resultByUid: "mila", resultByName: "Mila", resultAt: "2026-09-29T21:00:00.000Z" }));
  await assertSucceeds(AP(db("yeli"), "c1b").get());               // la TLK sigue viendo la nueva cita (la creó ella)
});
test("Agenda: borrado físico solo Súper Admin y Distribuidor (supervisor y TLK cancelan)", async () => {
  await assertFails(AP(db("mila"), "c1").delete());
  await assertFails(AP(db("yeli"), "c1").delete());
  await assertSucceeds(AP(db("angie"), "c1").delete());
  await assertSucceeds(AP(db("tomas"), "c2").delete());
});

// ── AGENDA r2: cierre de seguridad de appts ──────────────────────────────────
const nuevaDe = (uid, id, extra = {}) => ({ id, appId: A, tipo: "cita", _type: "cita", nombre: "Cliente " + id, fecha: "2026-10-01T18:00", createdByUid: uid, createdByName: uid, assignedTo: null, ...extra });
test("r2 · 1-2: TLK crea con assignedTo null (OK); con assignedTo de otra TLK (DENEGADO)", async () => {
  await assertSucceeds(AP(db("yeli"), "a1n").set(nuevaDe("yeli", "a1n")));
  await assertFails(AP(db("yeli"), "a2n").set(nuevaDe("yeli", "a2n", { assignedTo: "lis" })));
  await assertFails(AP(db("yeli"), "a3n").set(nuevaDe("yeli", "a3n", { assignedTo: "yeli" })));   // tampoco "a sí misma": hoy no hay asignación
  await assertFails(AP(db("lis"), "a2n").get());                                                    // lis no la ve
  await assertSucceeds(AP(db("mila"), "a4n").set(nuevaDe("mila", "a4n", { assignedTo: "lis" })));  // el staff conserva su comportamiento
});
test("r2 · 3-8: tipos por rol en CREATE (ventas cita/llamada · cobranza llamada · reclutamiento entrevista/llamada)", async () => {
  const t = (uid, id, tipo) => AP(db(uid), id).set(nuevaDe(uid, id, { tipo, _type: tipo }));
  await assertSucceeds(t("yeli", "v1", "cita"));        await assertSucceeds(t("yeli", "v2", "llamada"));
  await assertFails(t("yeli", "v3", "servicio"));       await assertFails(t("yeli", "v4", "entrevista")); await assertFails(t("yeli", "v5", "cocinada"));
  await assertSucceeds(t("jova", "k1", "llamada"));
  await assertFails(t("jova", "k2", "cita"));           await assertFails(t("jova", "k3", "entrevista"));
  await assertSucceeds(t("pedro", "p1", "entrevista")); await assertSucceeds(t("pedro", "p2", "llamada"));
  await assertFails(t("pedro", "p3", "cita"));
  await assertFails(AP(db("yeli"), "v6").set(nuevaDe("yeli", "v6", { tipo: "cita", _type: "servicio" })));   // _type distinto de tipo
  await assertSucceeds(t("angie", "d1", "servicio"));   // staff: sin limitación
});
test("r2 · 7 (creación limpia): la TLK no crea citas cancelada, con resultado, reprogramada en visita ni sincronizadas", async () => {
  const y = db("yeli");
  for (const [id, extra] of Object.entries({
    x1: { status: "cancelada" }, x2: { cancelledByUid: "yeli", cancelledAt: "2026-09-29T10:00:00Z" }, x3: { resultado: "demo_venta" },
    x4: { resultByUid: "yeli" }, x5: { monto: 900 }, x6: { cartucho_meses: 12 }, x7: { reprogrammedFromApptId: "c1" },
    x8: { createdFrom: "reprogramada_visita" }, x9: { _sincronizado: true }, x10: { servicioResultado: "realizado" }, x11: { reprogramHistory: [] },
  })) await assertFails(AP(y, id).set(nuevaDe("yeli", id, extra)));
  await assertSucceeds(AP(y, "x0").set(nuevaDe("yeli", "x0", { resultado: "", producto: "Sartenes", notas: "llega 6pm" })));
});
test("r2 · 9-11: la TLK no cambia tipo/_type, servicioResultado, _sincronizado ni campos fuera de la allowlist", async () => {
  const y = db("yeli");
  await env.withSecurityRulesDisabled(async (c) => { await c.firestore().collection("workspaces").doc(A).collection("appts").doc("r1").set(nuevaDe("yeli", "r1", { tipo: "llamada", _type: "llamada" })); });
  await assertFails(AP(y, "r1").update({ tipo: "cita" }));
  await assertFails(AP(y, "r1").update({ _type: "cita" }));
  await assertFails(AP(y, "c1").update({ servicioResultado: "realizado" }));
  await assertFails(AP(y, "c1").update({ servicioHistorial: [] }));
  await assertFails(AP(y, "c1").update({ _sincronizado: true }));
  for (const k of ["_clienteId", "_clienteGrupo", "createdFrom", "reprogrammedFromApptId", "eliminado", "id", "campoNuevoCualquiera"])
    await assertFails(AP(y, "c1").update({ [k]: k === "eliminado" ? true : "x" }));
  await assertSucceeds(AP(y, "c1").update({ nombre: "Ana P.", telefono: "2105552222", direccion: "9 Oak", ciudad: "Temple", cp: "76501", notas: "ok" }));
});
test("r2 · 12-13: cancelar SU cita con cancelledByUid propio (OK); falsificar cancelledByUid, sin fecha u otro estado (DENEGADO)", async () => {
  const y = db("yeli");
  const canc = (extra = {}) => ({ status: "cancelada", cancelledAt: "2026-09-29T16:00:00.000Z", cancelledByUid: "yeli", cancelledByName: "Yeli", cancelReason: "viaje", ...extra });
  await assertFails(AP(y, "c1").update(canc({ cancelledByUid: "lis" })));
  await assertFails(AP(y, "c1").update(canc({ cancelledByUid: "tomas" })));
  await assertFails(AP(y, "c1").update(canc({ cancelledAt: "" })));
  await assertFails(AP(y, "c1").update({ status: "cancelada", cancelledByUid: "yeli" }));          // sin cancelledAt
  await assertFails(AP(y, "c1").update({ status: "confirmada" }));                                  // solo puede pasar a "cancelada"
  await assertFails(AP(y, "c1").update({ cancelReason: "x" }));                                     // campos de cancelación sin cancelar
  await assertFails(AP(y, "c2").update(canc()));                                                    // cita ajena
  await assertSucceeds(AP(y, "c1").update(canc()));
});
test("r2 · 14-15: una cita cancelada es solo lectura para la TLK (no reactiva, no edita, no cambia cancelledByUid); el staff sí la gestiona", async () => {
  const y = db("yeli");
  await assertSucceeds(AP(y, "c1").update({ status: "cancelada", cancelledAt: "2026-09-29T16:00:00.000Z", cancelledByUid: "yeli", cancelledByName: "Yeli" }));
  await assertFails(AP(y, "c1").update({ status: "" }));
  await assertFails(AP(y, "c1").update({ status: "activa" }));
  await assertFails(AP(y, "c1").update({ notas: "reactivar" }));
  await assertFails(AP(y, "c1").update({ cancelledByUid: "lis" }));
  await assertFails(AP(y, "c1").update({ cancelReason: "otro motivo" }));
  await assertSucceeds(AP(y, "c1").get());
  await assertSucceeds(AP(db("mila"), "c1").update({ status: "", notas: "reactivada por supervisión" }));
});
test("r2 · reprogramar antes de la visita: una entrada nueva, firmada por quien reprograma y con la fecha nueva", async () => {
  const y = db("yeli");
  const h = (x = {}) => ({ previousDate: "2026-09-29T20:00", newDate: "2026-09-30T18:00", changedAt: "2026-09-29T15:00:00.000Z", changedByUid: "yeli", changedByName: "Yeli", reason: "before_visit", ...x });
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00" }));                                          // fecha sin historial
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h({ changedByUid: "lis" })] }));   // firmada por otra
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h({ reason: "en_visita" })] }));
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h({ newDate: "2026-10-05T10:00" })] }));
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h(), h()] }));             // dos entradas de golpe
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h()], resultado: "demo_venta" })); // colar resultado
  await assertFails(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h()], createdByUid: "lis" }));     // colar identidad
  await assertSucceeds(AP(y, "c1").update({ fecha: "2026-09-30T18:00", reprogramHistory: [h()] }));
  // la segunda reprogramación conserva la primera
  const h2 = h({ previousDate: "2026-09-30T18:00", newDate: "2026-10-02T11:00", changedAt: "2026-09-30T09:00:00.000Z" });
  await assertFails(AP(y, "c1").update({ fecha: "2026-10-02T11:00", reprogramHistory: [h2] }));                    // borra la anterior
  await assertSucceeds(AP(y, "c1").update({ fecha: "2026-10-02T11:00", reprogramHistory: [h(), h2] }));
});

// ── AGENDA r3: cita con resultado = solo lectura para TLK · registro de origen en CREATE ──
const semilla = async (fn) => env.withSecurityRulesDisabled(async (c) => fn(c.firestore().collection("workspaces").doc(A)));
test("r3 · 1-4: con resultado físico (incl. legacy venta/no_venta) la cita es SOLO LECTURA para la TLK; el staff sí la modifica", async () => {
  const y = db("yeli");
  const h = { previousDate: "2026-09-29T20:00", newDate: "2026-10-03T18:00", changedAt: "2026-09-30T15:00:00.000Z", changedByUid: "yeli", changedByName: "Yeli", reason: "before_visit" };
  for (const r of ["demo_venta", "demo_no_venta", "no_recibio", "reprogramada_visita", "no_visito", "seguimiento", "venta", "no_venta"]) {
    await semilla((w) => w.collection("appts").doc("cr").set(nuevaDe("yeli", "cr", { resultado: r, resultByUid: "tomas", resultByName: "Tomas", resultAt: "2026-09-29T21:00:00.000Z" })));
    await assertFails(AP(y, "cr").update({ notas: "cambio" }));                                            // 1. no edita
    await assertFails(AP(y, "cr").update({ nombre: "Otro", telefono: "1", direccion: "x", ciudad: "y", cp: "z" }));
    await assertFails(AP(y, "cr").update({ fecha: "2026-10-03T18:00", reprogramHistory: [h] }));          // 2. no mueve la fecha
    await assertFails(AP(y, "cr").update({ status: "cancelada", cancelledAt: "2026-09-30T10:00:00.000Z", cancelledByUid: "yeli", cancelledByName: "Yeli" }));   // 3. no cancela
    await assertSucceeds(AP(y, "cr").get());                                                              // sigue viéndola
  }
  await assertSucceeds(AP(db("angie"), "cr").update({ notas: "corrección de staff", fecha: "2026-09-29T20:30" }));   // 4. staff
  await assertSucceeds(AP(db("mila"), "cr").update({ resultado: "demo_venta", monto: 2100 }));
  await semilla((w) => w.collection("appts").doc("cv").set(nuevaDe("yeli", "cv", { resultado: "" })));
  await assertSucceeds(AP(y, "cv").update({ notas: "sin resultado: editable" }));                         // resultado vacío ≠ resultado
});
test("r3 · 7-10: registro de origen en CREATE de telemarketing (propio, ajeno, otra especialidad, manual)", async () => {
  await semilla(async (w) => {
    const rec = (id, section, assignedTo, extra = {}) => w.collection("records").doc(id).set({ id, appId: A, section, assignedTo, ...extra });
    await rec("rf1", "referidos", "yeli", { referidos: [{ nombre: "R0" }, { nombre: "R1" }] });
    await rec("rf2", "referidos", "lis", { referidos: [{ nombre: "Z0" }] });
    await rec("rc2", "reclutamiento", "otroReclutador");
    await rec("cob_d9", "cobranza", "otraCobradora", { linkedRecordId: "d9" });
    await rec("p5", "prospectos", "yeli");
  });
  const src = (uid, id, tipo, sourceSection, sourceRecordId, extra = {}) => AP(db(uid), id).set(nuevaDe(uid, id, { tipo, _type: tipo, sourceSection, sourceRecordId, ...extra }));
  // Ventas
  await assertSucceeds(src("yeli", "s1", "cita", "agregados", "a1"));                                    // 7. su agregado
  await assertSucceeds(src("yeli", "s2", "cita", "prospectos", "p5"));
  await assertSucceeds(src("yeli", "s3", "cita", "distribucion", "d1"));                                  // Distribución ES ventas
  await assertSucceeds(src("yeli", "s4", "cita", "referidos", "rf1", { sourceRefIndex: 1 }));            // anfitrión propio + índice válido
  await assertFails(src("yeli", "s5", "cita", "agregados", "a2"));                                        // 8. agregado de otra TLK
  await assertFails(src("yeli", "s6", "cita", "agregados", "a3"));                                        //    sin asignar
  await assertFails(src("yeli", "s7", "cita", "referidos", "rf2", { sourceRefIndex: 0 }));               //    anfitrión ajeno
  await assertFails(src("yeli", "s8", "cita", "referidos", "rf1", { sourceRefIndex: 5 }));               //    índice fuera de rango
  await assertFails(src("yeli", "s9", "cita", "cobranza", "d1"));                                         // 9. sección de otra especialidad
  await assertFails(src("yeli", "s10", "cita", "reclutamiento", "rc1"));
  await assertFails(src("yeli", "s11", "cita", "prospectos", "a1"));                                      //    sección no coincide con el registro
  await assertFails(src("yeli", "s12", "cita", "agregados", "no_existe"));                                //    registro inexistente
  await assertFails(AP(db("yeli"), "s13").set(nuevaDe("yeli", "s13", { sourceRefIndex: 0 })));           //    índice sin registro
  await assertFails(src("yeli", "s14", "cita", "agregados", "a1", { sourceRefIndex: 0 }));               //    índice fuera de referidos
  // Reclutamiento
  await assertSucceeds(src("pedro", "s20", "entrevista", "reclutamiento", "rc1"));
  await assertFails(src("pedro", "s21", "entrevista", "reclutamiento", "rc2"));
  await assertFails(src("pedro", "s22", "entrevista", "agregados", "a1"));
  // Cobranza: el documento real es records/cob_<clave>
  await assertSucceeds(src("jova", "s30", "llamada", "cobranza", "d1"));
  await assertFails(src("jova", "s31", "llamada", "cobranza", "d9"));
  await assertFails(src("jova", "s32", "llamada", "cobranza", "cob_d1"));                                 // la clave, no el id físico
  await assertFails(src("jova", "s33", "llamada", "distribucion", "d1"));                                 // Distribución es ventas
  // 10. cita manual sin registro de origen
  await assertSucceeds(AP(db("yeli"), "s40").set(nuevaDe("yeli", "s40", { nombre: "Cliente manual", telefono: "2105550000" })));
  await assertSucceeds(AP(db("pedro"), "s41").set(nuevaDe("pedro", "s41", { tipo: "llamada", _type: "llamada" })));
  // el staff no tiene esta restricción
  await assertSucceeds(src("mila", "s50", "cita", "agregados", "a2"));
});

// ── AGENDA r4: sourceRefIndex es POSICIÓN (lista o mapa legacy), no la clave del mapa ──
test("r4 · referidos: índice por posición en LISTA y en MAPA con claves no numéricas; sin referidos no hay índice; anfitrión sin índice", async () => {
  await semilla(async (w) => {
    const rec = (id, assignedTo, extra = {}) => w.collection("records").doc(id).set({ id, appId: A, section: "referidos", assignedTo, ...extra });
    await rec("rfL", "yeli", { referidos: [{ nombre: "María" }, { nombre: "Carlos" }] });
    await rec("rfM", "yeli", { referidos: { ref_abc: { nombre: "María" }, ref_xyz: { nombre: "Carlos" } } });
    await rec("rfN", "yeli");                                                         // anfitrión sin campo referidos
    await rec("rfO", "lis", { referidos: [{ nombre: "Z0" }] });                       // anfitrión de otra TLK
  });
  const ref = (id, recId, extra = {}) => AP(db("yeli"), id).set(nuevaDe("yeli", id, { sourceSection: "referidos", sourceRecordId: recId, ...extra }));
  // MAPA (claves ref_abc / ref_xyz): la posición manda
  await assertSucceeds(ref("m0", "rfM", { sourceRefIndex: 0 }));
  await assertSucceeds(ref("m1", "rfM", { sourceRefIndex: 1 }));
  await assertFails(ref("m2", "rfM", { sourceRefIndex: 2 }));
  // LISTA de 2
  await assertSucceeds(ref("l0", "rfL", { sourceRefIndex: 0 }));
  await assertSucceeds(ref("l1", "rfL", { sourceRefIndex: 1 }));
  await assertFails(ref("l2", "rfL", { sourceRefIndex: 2 }));
  // índice inválido en forma
  await assertFails(ref("l3", "rfL", { sourceRefIndex: -1 }));
  await assertFails(ref("l4", "rfL", { sourceRefIndex: "0" }));
  // sin campo referidos: un índice NO pasa
  await assertFails(ref("n0", "rfN", { sourceRefIndex: 0 }));
  // cita del ANFITRIÓN (sin índice): permitida, con o sin referidos
  await assertSucceeds(ref("h1", "rfN"));
  await assertSucceeds(ref("h2", "rfM"));
  // anfitrión de otra TLK: denegado con y sin índice
  await assertFails(ref("o0", "rfO", { sourceRefIndex: 0 }));
  await assertFails(ref("o1", "rfO"));
});
