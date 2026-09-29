// Rutas y Cumpleaños para Telemarketing Ventas (v2): acceso SOLO a lo suyo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canViewTab, can } from "../src/auth/permissions";
import { queriesFor, USER_KEYS, isSharedKey } from "../src/data/schema";
import { buildState, diffState, emptyDocs } from "../src/data/storeCore";

const U = (role: string) => ({ uid: "u", role, status: "active", appId: "impactos" });

test("Rutas y Cumpleaños: SOLO telemarketing_ventas entre los telemarketing", () => {
  assert.equal(canViewTab(U("telemarketing_ventas"), "rutas"), true);
  assert.equal(canViewTab(U("telemarketing_ventas"), "cumpleanos"), true);
  assert.equal(canViewTab(U("telemarketing_cobranza"), "rutas"), false);
  assert.equal(canViewTab(U("telemarketing_cobranza"), "cumpleanos"), false);
  assert.equal(canViewTab(U("telemarketing_reclutamiento"), "rutas"), false);
  assert.equal(canViewTab(U("telemarketing_reclutamiento"), "cumpleanos"), false);
  // no gana acceso a Cobranza ni Reclutamiento ni a la base completa
  const v = U("telemarketing_ventas");
  ["cobranza", "reclutamiento", "usuarios", "asignaciones"].forEach((t) => assert.equal(canViewTab(v, t), false, t));
  assert.equal(can(v, "clientes.view"), false);
});

// Firestore simulado: lo que las CONSULTAS de la TLK devuelven realmente
const registros = [
  { id: "a1", section: "agregados", assignedTo: "eva", nombre: "Mía Agregado", fecha_cumple: "1990-09-29", direccion: "1 Main" },
  { id: "a2", section: "agregados", assignedTo: "otra", nombre: "Ajeno Agregado", fecha_cumple: "1985-09-29", direccion: "9 Elm" },
  { id: "p1", section: "prospectos", assignedTo: "eva", nombre: "Mía Prospecto" },
  { id: "d1", section: "distribucion", assignedTo: "eva", nombre: "Mía Distribución", fecha_cumple: "1970-10-01" },
  { id: "d2", section: "distribucion", assignedTo: null, nombre: "Libre Distribución" },
  { id: "r1", section: "referidos", assignedTo: "eva", anfitrion: "Ana", referidos: [{ nombre: "Mío Referido", fecha_cumple: "2000-01-01" }] },
  { id: "cob_d1", section: "cobranza", assignedTo: "eva", nombre: "Cuenta Cobranza" },           // aunque se la asignaran por error
  { id: "rc1", section: "reclutamiento", assignedTo: "eva", nombre: "Prospecto Reclutamiento" },
];
const leer = (uid: string, role: string) => {
  const d = emptyDocs();
  queriesFor({ role, uid }, "records").forEach((q) => registros.filter((r: any) => q.where.every(([f, , v]) => r[f] === v)).forEach((r) => { d.records[r.id] = r; }));
  return d;
};

test("TLK Ventas solo recibe agregados, referidos, prospectos y distribución ASIGNADOS a ella", () => {
  const d = leer("eva", "telemarketing_ventas");
  assert.deepEqual(Object.keys(d.records).sort(), ["a1", "d1", "p1", "r1"]);
  const st = buildState(d, {}, "eva");
  const nombres = JSON.stringify(st);
  ["Ajeno Agregado", "Libre Distribución", "Cuenta Cobranza", "Prospecto Reclutamiento"].forEach((n) => assert.ok(!nombres.includes(n), n));
  // Rutas y Cumpleaños arman sus listas con estas mismas bases (agregados/prospectos/distribucion/referidos)
  assert.deepEqual(st.agregados.map((r: any) => r.id), ["a1"]);
  assert.deepEqual(st.distribucion.map((r: any) => r.id), ["d1"]);
  assert.equal(Object.keys(st.cobranza.clientesData).length, 0);
  assert.equal(st.reclutamiento.length, 0);
});

test("Rutas/Cumpleaños de la TLK: SUS listas (userData), nunca las globales ni las de otra TLK", () => {
  const d = leer("eva", "telemarketing_ventas");
  d.shared.rutas = [{ id: "R-global", nombreRuta: "Ruta del equipo", clientes: [{ nombre: "Ajeno Agregado", direccion: "9 Elm" }] }];
  d.shared.cumpleanos = [{ id: "C-global", nombre: "Cumple global", telefono: "214" }];
  d.userData.eva = { rutas: [{ id: "R-eva", nombreRuta: "Mi ruta", clientes: [{ nombre: "Mía Agregado" }] }], cumpleanos: [{ id: "C-eva", nombre: "Mi cumple" }] };
  d.userData.otra = { rutas: [{ id: "R-otra", nombreRuta: "Ruta de otra", clientes: [{ nombre: "Ajeno Agregado" }] }], cumpleanos: [{ id: "C-otra", nombre: "Cumple de otra" }] };
  const st = buildState(d, {}, "eva");
  assert.deepEqual(st.misRutas.map((r: any) => r.id), ["R-eva"]);            // lo que ve en Rutas
  assert.deepEqual(st.misCumpleanos.map((c: any) => c.id), ["C-eva"]);       // lo que ve en Cumpleaños (manuales)
  assert.ok(!JSON.stringify([st.misRutas, st.misCumpleanos]).includes("otra"));
  assert.ok(!JSON.stringify([st.misRutas, st.misCumpleanos]).includes("global"));
});

test("Guardar una ruta de la TLK va a SU userData y no toca la lista compartida del equipo", () => {
  const d = emptyDocs(); d.shared.rutas = [{ id: "R-global" }]; d.userData.eva = { rutas: [] };
  const prev = buildState(d, {}, "eva");
  const next = { ...prev, misRutas: [{ id: "R-nueva", nombreRuta: "Temple martes", clientes: [{ id: "a1" }] }] };
  const { ops, blocked } = diffState(prev, next, d, { uid: "eva", role: "telemarketing_ventas", appId: "impactos", nombre: "Eva" });
  assert.deepEqual(blocked, []);
  assert.deepEqual(ops, [{ kind: "userField", uid: "eva", field: "rutas", data: [{ id: "R-nueva", nombreRuta: "Temple martes", clientes: [{ id: "a1" }] }] }]);
  assert.ok(!ops.some((o: any) => o.kind === "shared"));
  // igual para cumpleaños
  const n2 = { ...prev, misCumpleanos: [{ id: "C1", nombre: "Tía", fecha_cumple: "1960-12-01" }] };
  assert.deepEqual(diffState(prev, n2, d, { uid: "eva", role: "telemarketing_ventas", appId: "impactos", nombre: "Eva" }).ops.map((o: any) => [o.kind, o.field]), [["userField", "cumpleanos"]]);
  // estas claves nunca se tratan como compartidas
  Object.keys(USER_KEYS).forEach((k) => assert.equal(isSharedKey(k), false));
});

test("El staff sigue con las listas compartidas de siempre", () => {
  const d = emptyDocs(); d.shared.rutas = [{ id: "R-global" }]; d.shared.cumpleanos = [{ id: "C-global" }];
  const st = buildState(d, {}, "dist1");
  assert.deepEqual(st.rutas, [{ id: "R-global" }]); assert.deepEqual(st.cumpleanos, [{ id: "C-global" }]);
  const prev = st, next = { ...st, rutas: [...st.rutas, { id: "R2" }] };
  const ops = diffState(prev, next, d, { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Angie" }).ops;
  assert.deepEqual(ops.map((o: any) => [o.kind, o.key]), [["shared", "rutas"]]);
});

// ════════ r2: shared por rol (fuente única = Rules) y Rutas del equipo ════════
import fs from "node:fs";
import { SHARED_READ_KEYS_BY_ROLE, SHARED_WRITE_KEYS_BY_ROLE, puedeLeerShared, puedeEscribirShared } from "../src/data/schema";

test("Telemarketing NUNCA lee shared/rutas ni shared/cumpleanos; staff sí", () => {
  for (const r of ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"]) {
    for (const k of ["rutas", "cumpleanos", "notificaciones", "cumpleNotifs", "incentivos", "cofreConfig", "controlCierres"]) assert.equal(puedeLeerShared(r, k), false, `${r} ${k}`);
    assert.equal(puedeEscribirShared(r, "notificaciones"), false);
    SHARED_WRITE_KEYS_BY_ROLE[r].forEach((k) => assert.ok(SHARED_READ_KEYS_BY_ROLE[r].includes(k), `${r} escribe ${k} sin leerlo`));
  }
  for (const s of ["super_admin", "distribuidor", "supervisor"]) { assert.ok(puedeLeerShared(s, "rutas")); assert.ok(puedeLeerShared(s, "cumpleanos")); }
  assert.equal(puedeEscribirShared("distribuidor", "callLog"), false);        // histórico: solo lectura
  assert.equal(puedeLeerShared("telemarketing_ventas", "catalogoCustom"), true);
  assert.equal(puedeLeerShared("telemarketing_cobranza", "catalogoCustom"), false);
});
test("firestore.rules replica EXACTAMENTE el mapa de schema.ts (lectura y escritura)", () => {
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const bloque = (fn: string) => rules.slice(rules.indexOf(`function ${fn}()`), rules.indexOf("}", rules.indexOf(`function ${fn}()`)));
  // Un rol SIN documentos no tiene rama (nunca "docId in []"); con documentos, la lista exacta.
  const lista = (fn: string, role: string) => {
    const m = bloque(fn).match(new RegExp(`'${role}'\\s*&& docId in \\[([^\\]]*)\\]`));
    if (!m) { assert.ok(!bloque(fn).includes(`'${role}'`), `${fn}: rama de ${role} sin lista`); return []; }
    return m[1].split(",").map((x) => x.trim().replace(/'/g, "")).filter(Boolean).sort();
  };
  assert.ok(!/docId in \[\s*\]/.test(rules), "no debe existir la forma vacía docId in []");
  for (const role of Object.keys(SHARED_READ_KEYS_BY_ROLE)) {
    assert.deepEqual(lista("tmLee", role), [...SHARED_READ_KEYS_BY_ROLE[role]].sort(), `lectura ${role}`);
    assert.deepEqual(lista("tmEscribe", role), [...SHARED_WRITE_KEYS_BY_ROLE[role]].sort(), `escritura ${role}`);
  }
  assert.ok(!bloque("tmEscribe").includes("'telemarketing_ventas'"), "Ventas no tiene rama de escritura en shared");
});
test("Rutas del equipo: el staff ve las rutas personales (con creador); la TLK no ve las de otros", () => {
  const d = emptyDocs();
  d.userData.eva = { rutas: [{ id: "R1", nombreRuta: "Temple", createdByUid: "eva", createdByName: "Eva", paradas: [{ id: "a1" }] }] };
  d.userData.lis = { rutas: [{ id: "R2", nombreRuta: "Waco", createdByUid: "lis", createdByName: "Lis", paradas: [] }] };
  const staff = buildState(d, {}, "dist1");
  assert.deepEqual(staff.rutasEquipo.map((r: any) => [r.id, r._deUid, r.createdByName]).sort(), [["R1", "eva", "Eva"], ["R2", "lis", "Lis"]]);
  // un telemarketing solo recibe SU userData (Rules): su "equipo" queda vacío por construcción
  const soloEva = emptyDocs(); soloEva.userData.eva = d.userData.eva;
  assert.deepEqual(buildState(soloEva, {}, "eva").rutasEquipo, []);
  // rutasEquipo es derivado: nunca se escribe en ningún documento
  const prev = staff, next = { ...staff, rutasEquipo: [] };
  assert.deepEqual(diffState(prev, next, d, { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "A" }).ops, []);
});

// ════════ r3: rutas SIN copias de clientes · reasignación · notificaciones personales ════════
import { rutaPersonalV2, resolverRutaPersonal } from "../src/services/rutasV2";

// Mismo criterio que recolectarParaRutas (App.tsx): candidatos = registros ASIGNADOS de hoy
const candidatosDe = (st: any) => [
  ...["agregados", "prospectos", "distribucion"].flatMap((sec) => (st[sec] || []).filter((c: any) => !c.eliminado).map((c: any) => ({ id: c.id, _tipo: sec, _origen: sec, nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, ciudad: c.ciudad, cp: c.cp }))),
  ...(st.referidos || []).flatMap((anf: any) => (anf.referidos || []).map((r: any, i: number) => ({ id: `${anf.id}::${i}`, _tipo: "referidos", _origen: "referidos", nombre: r.nombre, telefono: r.telefono, direccion: r.direccion, ciudad: r.ciudad, cp: r.cp }))),
];
const PII = ["María Uno", "2145550001", "10 Elm St", "Pedro Dos", "2145550002", "22 Oak Ave", "Refe Tres", "2145550003"];

test("Ruta TLK: se guardan SOLO referencias y metadatos (ninguna PII de clientes)", () => {
  const cands = [
    { id: "a1", _tipo: "agregados", nombre: "María Uno", telefono: "2145550001", direccion: "10 Elm St", ciudad: "Temple", cp: "76501" },
    { id: "a2", _tipo: "agregados", nombre: "Pedro Dos", telefono: "2145550002", direccion: "22 Oak Ave", ciudad: "Belton", cp: "76513" },
    { id: "host1::2", _tipo: "referidos", nombre: "Refe Tres", telefono: "2145550003", ciudad: "Temple", cp: "76501" },
  ];
  const r = rutaPersonalV2({ nombreRuta: "Martes", fechaRuta: "2026-10-06", ciudad: "Temple", clientes: cands.slice(0, 2), referidos: cands.slice(2), agenteAsignado: "Viejo" },
    { uid: "eva", nombre: "Eva" }, "R1", "2026-09-29T10:00:00.000Z");
  assert.deepEqual(r.paradas, [{ id: "a1", section: "agregados" }, { id: "a2", section: "agregados" }, { id: "host1::2", section: "referidos" }]);
  assert.equal(r.createdByUid, "eva"); assert.equal(r.createdByName, "Eva"); assert.equal(r.fechaCreacion, "2026-09-29T10:00:00.000Z");
  assert.equal(r.fechaRuta, "2026-10-06"); assert.equal(r.estadoRuta, "pendiente"); assert.equal(r.totalParadas, 3);
  assert.deepEqual(r.zonas, { ciudades: ["Temple", "Belton"], cps: ["76501", "76513"] });
  const guardado = JSON.stringify(r);
  PII.forEach((x) => assert.ok(!guardado.includes(x), `la ruta guarda PII: ${x}`));
  ["clientes", "referidos", "agenteAsignado", "nombre", "telefono", "direccion"].forEach((k) => assert.ok(!(k in r), k));
});

test("Reasignación: a2 pasa a Carla → desaparece de la ruta de Eva, sin rastro de sus datos", () => {
  const W = (x: any) => ({ appId: "impactos", ...x });
  const registros = [
    W({ id: "a1", section: "agregados", assignedTo: "eva", nombre: "María Uno", telefono: "2145550001", direccion: "10 Elm St", ciudad: "Temple", cp: "76501" }),
    W({ id: "a2", section: "agregados", assignedTo: "eva", nombre: "Pedro Dos", telefono: "2145550002", direccion: "22 Oak Ave", ciudad: "Belton", cp: "76513" }),
  ];
  const leer = (uid: string, ud: any) => {         // lo que Firestore le entrega a Eva (sus consultas)
    const d = emptyDocs();
    queriesFor({ role: "telemarketing_ventas", uid }, "records").forEach((q) => registros.filter((r: any) => q.where.every(([f, , v]) => r[f] === v)).forEach((r) => { d.records[r.id] = r; }));
    d.userData[uid] = ud;
    return buildState(d, {}, uid, "telemarketing_ventas");
  };
  // 1) Eva crea la ruta [a1, a2] con sus candidatos de hoy → lo que se guarda en userData/eva
  const hoy = leer("eva", {});
  const cands = candidatosDe(hoy);
  const ruta = rutaPersonalV2({ nombreRuta: "Temple-Belton", fechaRuta: "2026-10-01", clientes: cands, referidos: [] }, { uid: "eva", nombre: "Eva" }, "R1", "2026-09-29T10:00:00.000Z");
  const userDataEva = { rutas: [ruta] };
  assert.deepEqual(userDataEva.rutas[0].paradas.map((p) => p.id), ["a1", "a2"]);
  PII.slice(0, 6).forEach((x) => assert.ok(!JSON.stringify(userDataEva).includes(x), x));
  // 2) a2 se reasigna a Carla
  registros[1].assignedTo = "carla";
  // 3) Eva vuelve a abrir sus rutas: su estado solo trae a1
  const manana = leer("eva", userDataEva);
  assert.deepEqual(manana.agregados.map((r: any) => r.id), ["a1"]);
  const vista = resolverRutaPersonal(manana.misRutas[0], candidatosDe(manana));
  assert.deepEqual(vista.clientes.map((c: any) => c.id), ["a1"]);
  assert.equal(vista._faltantes, 1);                                           // "1 parada ya no está asignada a ti."
  const pantalla = JSON.stringify(vista);
  ["Pedro Dos", "2145550002", "22 Oak Ave"].forEach((x) => assert.ok(!pantalla.includes(x), `a2 sigue visible: ${x}`));
  assert.ok(pantalla.includes("María Uno"));                                   // a1 sí, con sus datos ACTUALES
  // la vista no se guarda: el documento sigue siendo solo referencias
  assert.ok(!("clientes" in manana.misRutas[0]));
});

test("Rutas del equipo (staff): creador, fecha, total original de paradas y zonas; sin PII", () => {
  const d = emptyDocs();
  d.userData.eva = { rutas: [rutaPersonalV2({ nombreRuta: "Temple", fechaRuta: "2026-10-01", clientes: [{ id: "a1", _tipo: "agregados", nombre: "María Uno", telefono: "2145550001", ciudad: "Temple", cp: "76501" }], referidos: [] }, { uid: "eva", nombre: "Eva" }, "R1", "2026-09-29T10:00:00.000Z")] };
  const st = buildState(d, {}, "dist1", "distribuidor");
  const r = st.rutasEquipo[0];
  assert.deepEqual([r.createdByName, r.fechaRuta, r.totalParadas, r.zonas.ciudades[0], r.zonas.cps[0], r.estadoRuta], ["Eva", "2026-10-01", 1, "Temple", "76501", "pendiente"]);
  assert.ok(!JSON.stringify(st.rutasEquipo).includes("María Uno"));
  assert.ok(!JSON.stringify(st.rutasEquipo).includes("2145550001"));
});

test("TLK: notificaciones y avisos de cumpleaños PERSONALES (userData); nunca los globales", () => {
  const d = emptyDocs();
  d.shared.notificaciones = [{ id: "n-global", titulo: "Dato nuevo agregado", detalle: "Cliente Ajeno · 2145559999" }];
  d.shared.cumpleNotifs = { "Cliente Ajeno|10-01": true };
  d.userData.eva = { notificaciones: [{ id: "n-eva", titulo: "Mi aviso" }], cumpleNotifs: { "a1|10-02": true } };
  d.userData.otra = { notificaciones: [{ id: "n-otra", titulo: "De otra" }] };
  for (const role of ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"]) {
    const st = buildState(d, {}, "eva", role);
    assert.deepEqual(st.notificaciones.map((n: any) => n.id), ["n-eva"], role);
    assert.deepEqual(st.cumpleNotifs, { "a1|10-02": true }, role);
    assert.ok(!JSON.stringify([st.notificaciones, st.cumpleNotifs]).includes("Ajeno"));
  }
  // sin nada propio: vacío (no cae a lo global)
  const vacio = emptyDocs(); vacio.shared.notificaciones = [{ id: "g" }];
  assert.deepEqual(buildState(vacio, {}, "eva", "telemarketing_ventas").notificaciones, []);
  // escribir: van a SU userData, jamás a shared/
  const prev = buildState(d, {}, "eva", "telemarketing_ventas");
  const next = { ...prev, notificaciones: [{ id: "n2", titulo: "Nueva" }, ...prev.notificaciones], cumpleNotifs: { ...prev.cumpleNotifs, "a3|10-05": true } };
  const ops = diffState(prev, next, d, { uid: "eva", role: "telemarketing_ventas", appId: "impactos", nombre: "Eva" }).ops;
  assert.deepEqual(ops.map((o: any) => [o.kind, o.uid, o.field]).sort(), [["userField", "eva", "cumpleNotifs"], ["userField", "eva", "notificaciones"]]);
  // staff: sigue con las globales en shared/
  const s = buildState(d, {}, "dist1", "distribuidor");
  assert.deepEqual(s.notificaciones.map((n: any) => n.id), ["n-global"]);
  const opsS = diffState(s, { ...s, notificaciones: [{ id: "x" }] }, d, { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "A" }).ops;
  assert.deepEqual(opsS.map((o: any) => [o.kind, o.key]), [["shared", "notificaciones"]]);
});
