// V2 · Referidos r1: identidad permanente por referido (refId / sourceRefId), duplicados dentro del
// formulario y aviso ÚNICO de obsequio (4 citas coordinadas o 1 venta). Legacy (ACCESS_V2=0) igual.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  nuevoRefId, asegurarRefIds, coincideConReferido, resolverReferido, actualizarReferido, mismaReferenciaReferido,
  sellarReferidos, heredarRefIds, progresoObsequio, transicionObsequio, relevoObsequioStaff, idNotificacionObsequio, REGLA_OBSEQUIO, AGENTE_SISTEMA,
} from "../src/services/referidosV2";
import { candidatosDuplicadoAnfitrion, duplicadosEnFormulario, textoDuplicado, accionesRegistroV2 } from "../src/services/databaseV2";
import { valorDuplicado } from "../src/components/database/DatabaseV2";
import { trazaRegistro, enrichNewAppts } from "../src/services/apptTrace";
import { duplicateApptCandidate, sourceRecordForAppt, candidatosCartera } from "../src/services/agendaV2";
import { itemsDe } from "../src/services/callWorkflow";
import { distribucionDesdeVenta } from "../src/services/ventaDistribucionV2";
import { diffState, emptyDocs, APPT_NO_INICIALES_TM } from "../src/data/storeCore";
import { can } from "../src/auth/permissions";

const NOW = new Date(2026, 9, 12, 10, 0, 0);
const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const CC = fs.readFileSync(new URL("../src/components/calls/CallCenterV2.tsx", import.meta.url), "utf8");
const RULES = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const seq = () => { let n = 0; return () => `rf_t${++n}`; };
const U = (role: string, uid = "u1") => ({ uid, role, status: "active", appId: "impactos" } as any);
const actor = (role: string, uid = "u1") => ({ uid, role, can: (p: string) => can(U(role, uid), p) });
const anfitrion = (x: any = {}) => ({
  id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2145550100", regalo: "Sartén 10\"",
  referidos: [
    { nombre: "Marta", telefono: "2145550101", notas: [{ texto: "nota de Marta" }] },
    { nombre: "Juan", telefono: "2145550102", historial: [{ id: "h1", tipo: "llamada" }], proximo_seguimiento: "2026-10-20" },
  ], ...x,
});
const cita = (id: string, x: any = {}) => ({ id, tipo: "cita", _type: "cita", fecha: "2026-10-15T10:00", sourceSection: "referidos", sourceRecordId: "anf1", ...x });

// ═══ MEJORA 1 · Identidad permanente ═══════════════════════════════════════
test("1 · Crear y editar varios referidos: cada uno recibe un refId único y lo conserva al editar", () => {
  const a = asegurarRefIds(anfitrion(), seq());
  assert.deepEqual(a.referidos.map((r: any) => r.refId), ["rf_t1", "rf_t2"]);
  assert.equal(asegurarRefIds(a, seq()), a, "si todos tienen refId no cambia nada (misma referencia)");
  assert.match(nuevoRefId(), /^rf_./);
  assert.notEqual(nuevoRefId(), nuevoRefId());
  // editar: se agrega un tercero y se cambia el nombre de Marta → los existentes conservan su refId
  const prev = { referidos: [a], appts: [] };
  const editado = { ...a, referidos: [{ ...a.referidos[0], nombre: "Marta R." }, a.referidos[1], { nombre: "Luis", telefono: "2145550103" }] };
  const out = sellarReferidos(prev, { ...prev, referidos: [editado] }, () => "rf_nuevo");
  assert.deepEqual(out.referidos[0].referidos.map((r: any) => [r.nombre, r.refId]), [["Marta R.", "rf_t1"], ["Juan", "rf_t2"], ["Luis", "rf_nuevo"]]);
  // datos del anfitrión intactos (relación anfitrión ↔ referidos)
  assert.deepEqual([out.referidos[0].id, out.referidos[0].anfitrion, out.referidos[0].regalo], ["anf1", "Rita", "Sartén 10\""]);
  // anfitriones NO tocados no se reescriben (sin migración masiva)
  const otro = anfitrion({ id: "anf2" });
  const s0 = { referidos: [a, otro], appts: [] };
  const s1 = sellarReferidos(s0, { ...s0, referidos: [{ ...a, notas: "x" }, otro] }, seq());
  assert.equal(s1.referidos[1], otro, "anf2 sin refId porque nadie lo tocó");
});

test("1b · Formulario abierto antes de que existieran los refId: al guardar se heredan (no se rompen vínculos)", () => {
  const sinIds = anfitrion();
  const conIds = asegurarRefIds(sinIds, seq());                 // otro usuario agendó → Marta rf_t1, Juan rf_t2
  const prev = { referidos: [conIds], appts: [cita("c1", { nombre: "Juan", sourceRefIndex: 1, sourceRefId: "rf_t2" })] };
  // el formulario viejo (sin refId) se guarda quitando a Marta y agregando a Luis
  const form = { ...sinIds, referidos: [sinIds.referidos[1], { nombre: "Luis", telefono: "2145550103" }] };
  const out = sellarReferidos(prev, { ...prev, referidos: [form] }, () => "rf_nuevo");
  assert.deepEqual(out.referidos[0].referidos.map((r: any) => [r.nombre, r.refId]), [["Juan", "rf_t2"], ["Luis", "rf_nuevo"]]);
  assert.equal(resolverReferido(out.referidos[0], prev.appts[0])!.ref.nombre, "Juan");
  // sin coincidencia clara no hereda; un refId ya usado no se repite
  assert.equal(heredarRefIds(conIds, { ...sinIds, referidos: [{ nombre: "Otro", telefono: "2145559999" }] }).referidos[0].refId, undefined);
  const dos = heredarRefIds(conIds, { ...sinIds, referidos: [conIds.referidos[1], { nombre: "Juan bis", telefono: "2145550102" }] });
  assert.deepEqual(dos.referidos.map((r: any) => r.refId), ["rf_t2", undefined]);
  // sin teléfono que comparar: por nombre
  assert.equal(heredarRefIds({ referidos: [{ nombre: "Ana", refId: "rf_a" }] }, { referidos: [{ nombre: "ana" }] }).referidos[0].refId, "rf_a");
});

test("2 · Eliminar el PRIMER referido no cambia la identidad del segundo", () => {
  const a = asegurarRefIds(anfitrion(), seq());               // Marta rf_t1 · Juan rf_t2
  const sinMarta = { ...a, referidos: a.referidos.filter((_: any, i: number) => i !== 0) };   // "Quitar" (filter)
  assert.deepEqual(sinMarta.referidos.map((r: any) => [r.nombre, r.refId]), [["Juan", "rf_t2"]]);
  // la cita de Juan (creada cuando era la posición 1) sigue apuntando a Juan
  const cJuan = cita("c1", { nombre: "Juan", telefono: "2145550102", sourceRefIndex: 1, sourceRefId: "rf_t2" });
  const r = resolverReferido(sinMarta, cJuan)!;
  assert.deepEqual([r.idx, r.ref.nombre, r.via], [0, "Juan", "refId"]);
  // escribir por refId sobre Juan (aunque la tarjeta se pintó con posición 1)
  const upd = actualizarReferido(sinMarta, "rf_t2", 1, (x) => ({ ...x, estado: "verde" }));
  assert.equal(upd.referidos[0].estado, "verde");
  // la cita de Marta (refId eliminado) NO cae a otra persona por posición
  assert.equal(resolverReferido(sinMarta, cita("c0", { nombre: "Marta", telefono: "2145550101", sourceRefIndex: 0, sourceRefId: "rf_t1" })), null);
  assert.equal(actualizarReferido(sinMarta, "rf_t1", 0, (x) => ({ ...x, estado: "rojo" })), sinMarta, "refId inexistente → no escribe en nadie");
  // reordenar tampoco cambia identidades
  const reordenado = { ...a, referidos: [a.referidos[1], a.referidos[0]] };
  assert.equal(resolverReferido(reordenado, cJuan)!.ref.nombre, "Juan");
});

test("3 · Citas existentes (solo posición): se conserva el vínculo solo si coincide; nunca se reasigna por suposición", () => {
  const a = anfitrion();                                       // datos históricos: sin refId
  const vieja = cita("v1", { nombre: "Juan", telefono: "(214) 555-0102", sourceRefIndex: 1 });
  assert.deepEqual([resolverReferido(a, vieja)!.ref.nombre, resolverReferido(a, vieja)!.via], ["Juan", "indice"]);
  // tras quitar a Marta, la posición 1 ya no existe → sin vínculo (no se pasa a nadie)
  const sinMarta = { ...a, referidos: [a.referidos[1]] };
  assert.equal(resolverReferido(sinMarta, vieja), null);
  // la cita vieja de Marta (posición 0) ahora caería sobre Juan → teléfono distinto → sin vínculo
  assert.equal(resolverReferido(sinMarta, cita("v0", { nombre: "Marta", telefono: "2145550101", sourceRefIndex: 0 })), null);
  // solo LECTURA (progreso del obsequio): teléfono que identifica a UN referido → se reconoce; ambiguo → no
  assert.equal(resolverReferido(sinMarta, vieja, { porTelefono: true })!.via, "telefono");
  assert.equal(resolverReferido({ referidos: [{ nombre: "J1", telefono: "2145550102" }, { nombre: "J2", telefono: "2145550102" }] }, { ...vieja, sourceRefIndex: 5 }, { porTelefono: true }), null);
  assert.equal(progresoObsequio({ id: "anf1", referidos: sinMarta.referidos }, [vieja]).citas, 1, "la cita vieja de Juan sigue contando");
  // nada que comparar → se respeta el vínculo histórico tal cual
  assert.equal(coincideConReferido({}, { nombre: "Juan" }), true);
  assert.equal(coincideConReferido({ nombre: "juan " }, { nombre: "Juan" }), true, "nombre normalizado");
  assert.equal(coincideConReferido({ telefono: "+1 214 555 0102", nombre: "Otro" }, { nombre: "Juan", telefono: "2145550102" }), true, "teléfono con código de país");
  // Agenda/ventas usan el mismo criterio
  assert.equal(sourceRecordForAppt({ referidos: [sinMarta] }, vieja), null);
  assert.deepEqual(sourceRecordForAppt({ referidos: [a] }, vieja), { section: "referidos", id: "anf1", refIdx: 1, via: "source" });
  // el sellado NO toca citas existentes (solo las nuevas)
  const prev = { referidos: [a], appts: [vieja] };
  const next = sellarReferidos(prev, { ...prev, referidos: [{ ...a, notas: "x" }] }, seq());
  assert.equal(next.appts, prev.appts);
  assert.equal(next.appts[0].sourceRefId, undefined);
});

test("3b · Al editar una cita, sourceRefId y el resto del origen no cambian (ni se inventa en citas viejas)", () => {
  const ctx = { uid: "sup1", role: "supervisor", appId: "impactos", nombre: "Eva" };
  const d = emptyDocs();
  d.appts["c1"] = { id: "c1", tipo: "cita", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1, sourceRefId: "rf_t2" };
  d.appts["v1"] = { id: "v1", tipo: "cita", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1 };
  const prev = { appts: [d.appts.c1, d.appts.v1] };
  const next = { appts: [{ ...d.appts.c1, notas: "x", sourceRefId: "rf_otro", sourceRefIndex: 0 }, { ...d.appts.v1, notas: "y", sourceRefId: "rf_inventado" }] };
  const ops: any[] = diffState(prev, next, d, ctx as any).ops;
  const c1 = ops.find((o) => o.id === "c1").data, v1 = ops.find((o) => o.id === "v1").data;
  assert.deepEqual([c1.sourceRefId, c1.sourceRefIndex], ["rf_t2", 1]);
  assert.equal(v1.sourceRefId, undefined);
});

test("4 · Notas, resultados, historial y seguimiento se conservan por referido (escritura por refId)", () => {
  let a = asegurarRefIds(anfitrion(), seq());
  // la tarjeta de Juan se pintó como posición 1; entretanto se quitó a Marta
  a = { ...a, referidos: [a.referidos[1]] };
  a = actualizarReferido(a, "rf_t2", 1, (x) => ({ ...x, resultado: "demo_no_venta" }));
  a = actualizarReferido(a, "rf_t2", 1, (x) => ({ ...x, historial: [...x.historial, { id: "h2", tipo: "cita" }] }));
  const j = a.referidos[0];
  assert.deepEqual([j.nombre, j.resultado, j.historial.map((h: any) => h.id), j.proximo_seguimiento, j.notas], ["Juan", "demo_no_venta", ["h1", "h2"], "2026-10-20", undefined]);
  // mapa legacy: se conserva la forma y la clave
  const mapa = { id: "anfM", referidos: { k7: { nombre: "Ana", refId: "rf_a" }, k9: { nombre: "Beto", refId: "rf_b" } } };
  const m2 = actualizarReferido(mapa, "rf_b", 1, (x) => ({ ...x, estado: "verde" }));
  assert.deepEqual(Object.keys(m2.referidos), ["k7", "k9"]);
  assert.equal(m2.referidos.k9.estado, "verde");
  assert.equal(m2.referidos.k7, mapa.referidos.k7);
  // App y CallCenterV2 escriben por refId (con posición solo como respaldo legacy)
  assert.ok(CC.includes("actualizarReferido(anf, it.refId, it.refIdx as number, fn)"));
  assert.ok(APP.includes("if(v2) return actualizarReferido(anf, r.refId, i, x=>({...x,...patch}));"));
  assert.ok(APP.includes("const conRef=(patch)=>(anf)=>actualizarReferido(anf, r.refId, i, x=>({...x,...patch}));"));
  assert.ok(APP.includes("if(ACCESS_V2){ escribirReferidoV2(id, r=>agregarNota(r, texto, agente)); return; }"), "Llamadas del staff (CallControl en v2)");
});

test("5 · Citas/ventas NUEVAS desde un referido guardan sourceRefId (traza, Llamadas, Agenda y sellado central)", () => {
  // trazaRegistro: con refId lo agrega; sin refId, salida idéntica a la anterior
  assert.deepEqual(trazaRegistro({ id: "anf1::1", section: "referidos", refId: "rf_t2" } as any), { sourceRecordId: "anf1", sourceSection: "referidos", sourceRefIndex: 1, sourceRefId: "rf_t2" });
  assert.deepEqual(trazaRegistro({ id: "anf1::1", section: "referidos" } as any), { sourceRecordId: "anf1", sourceSection: "referidos", sourceRefIndex: 1 });
  // bandeja de Llamadas v2: el item lleva refId y su key no depende de la posición
  const a = asegurarRefIds(anfitrion({ assignedTo: "tlk1" }), seq());
  const items = itemsDe({ referidos: [a] }, "ventas", "tlk1").filter((i: any) => i.section === "referidos");
  assert.deepEqual(items.map((i: any) => [i.refId, i.key]), [["rf_t1", "referidos:anf1::rf_t1"], ["rf_t2", "referidos:anf1::rf_t2"]]);
  assert.equal(trazaRegistro(items[1] as any).sourceRefId, "rf_t2");
  // Agenda "Nueva visita": el candidato lleva refId
  assert.equal(candidatosCartera({ referidos: [a] }).find((c: any) => c.nombre === "Juan").refId, "rf_t2");
  assert.ok(APP.includes("...(c.refIdx!==undefined&&c.refId?{sourceRefId:c.refId}:{})"));
  // sellado: cita nueva solo con posición, de un anfitrión sin refId → ese mismo cambio asigna ambos
  const h = anfitrion();
  const prev = { referidos: [h], appts: [], distribucion: [] };
  const nueva = cita("n1", { nombre: "Juan", sourceRefIndex: 1 });
  const out = sellarReferidos(prev, { ...prev, appts: [nueva] }, seq());
  assert.deepEqual(out.referidos[0].referidos.map((r: any) => r.refId), ["rf_t1", "rf_t2"]);
  assert.equal(out.appts[0].sourceRefId, "rf_t2");
  // Distribución nueva trazada desde un referido: también; y distribucionDesdeVenta copia sourceRefId
  const out2 = sellarReferidos(prev, { ...prev, distribucion: [{ id: "dv1", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 0 }] }, seq());
  assert.equal(out2.distribucion[0].sourceRefId, "rf_t1");
  const dv = distribucionDesdeVenta([], { id: "c1", tipo: "cita", nombre: "Juan", telefono: "2145550102", resultado: "demo_venta", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1, sourceRefId: "rf_t2" }, NOW) as any;
  assert.ok(JSON.stringify(dv).includes("\"sourceRefId\":\"rf_t2\""));
});

test("6 · Citas y ventas sin duplicar: misma persona = duplicado aunque cambie la posición; otra persona no", () => {
  const existente = cita("c1", { sourceRefIndex: 1, sourceRefId: "rf_t2" });
  // se quitó a Marta: Juan ahora es posición 0 → sigue siendo el MISMO referido
  assert.equal(duplicateApptCandidate([existente], cita("n1", { sourceRefIndex: 0, sourceRefId: "rf_t2", fecha: "2026-10-15T11:00" }))?.id, "c1");
  // misma posición pero OTRA persona (refId distinto) → no es duplicado
  assert.equal(duplicateApptCandidate([existente], cita("n2", { sourceRefIndex: 1, sourceRefId: "rf_t9" })), null);
  // legacy (sin refId en alguno): por posición, como antes
  assert.equal(mismaReferenciaReferido({ sourceRefIndex: 1 }, { sourceRefIndex: 1, sourceRefId: "rf_x" }), true);
  assert.equal(mismaReferenciaReferido({ sourceRefIndex: 0 }, { sourceRefIndex: 1 }), false);
  // progreso: cada referido suma UNA vez aunque tenga varias citas; cita+venta del mismo cuentan 1 y 1
  const a = asegurarRefIds(anfitrion(), seq());
  const appts = [cita("a1", { sourceRefIndex: 0, sourceRefId: "rf_t1" }), cita("a2", { sourceRefIndex: 0, sourceRefId: "rf_t1", fecha: "2026-10-16T10:00" })];
  assert.deepEqual([progresoObsequio(a, appts).citas, progresoObsequio(a, appts).ventas], [1, 0]);
  const conVenta = [...appts, cita("a3", { sourceRefIndex: 1, sourceRefId: "rf_t2", resultado: "demo_venta" })];
  const p = progresoObsequio(a, conVenta);
  assert.deepEqual([p.citas, p.ventas, p.logrado, p.motivo], [2, 1, true, "1 venta de sus referidos"]);
});

// ═══ MEJORA 2 · Duplicados dentro y fuera del formulario ═══════════════════
test("7 · Duplicados DENTRO del formulario: referido↔referido y anfitrión↔referido, con o sin código de país", () => {
  const f = { anfitrion: "Rita", anfitrion_telefono: "+1 (214) 555-0100", referidos: [
    { nombre: "Marta", telefono: "214-555-0101" }, { nombre: "Marta 2", telefono: "1 214 555 0101" }, { nombre: "Tía Rita", telefono: "2145550100" }] };
  const ds = duplicadosEnFormulario(f);
  assert.deepEqual(ds.map((d) => d.formulario), [{ a: "Marta 2", b: "Marta" }, { a: "Tía Rita", b: "Rita" }]);
  assert.deepEqual(ds.map(textoDuplicado), [
    'Posible duplicado en este formulario: "Marta 2" y "Marta" tienen el mismo teléfono.',
    'Posible duplicado en este formulario: "Tía Rita" y "Rita" tienen el mismo teléfono.']);
  assert.deepEqual(ds.map(valorDuplicado), ["214-555-0101", "+1 (214) 555-0100"], "muestra el dato coincidente");
  assert.ok(ds.every((d) => d.motivo === "telefono" && d.fuerte));
  // sin repetidos → nada; teléfonos cortos/vacíos no alertan
  assert.deepEqual(duplicadosEnFormulario({ anfitrion: "A", anfitrion_telefono: "", referidos: [{ nombre: "x", telefono: "" }, { nombre: "y", telefono: "" }] }), []);
  // integrado en la revisión del formulario de Referidos (mismo aviso con "Guardar de todos modos")
  const all = { agregados: [], prospectos: [], distribucion: [], referidos: [] };
  assert.equal(candidatosDuplicadoAnfitrion(f, all).filter((d) => d.seccion === "formulario").length, 2);
  assert.ok(APP.includes("candidatosDuplicadoAnfitrion(d, allData, {excluirId, editando:editItem||null})"));
});

test("8 · Duplicados FUERA del formulario se siguen revisando (Agregados, Prospección, Distribución, otros anfitriones)", () => {
  const all = {
    agregados: [{ id: "a1", nombre: "Ana", telefono: "2145550201" }], prospectos: [{ id: "p1", nombre: "Pepe", telefono: "2145550202" }],
    distribucion: [{ id: "d1", nombre: "Dora", telefono: "2145550203" }],
    referidos: [{ id: "anf9", anfitrion: "Otra", anfitrion_telefono: "2145550299", referidos: [{ nombre: "Zoe", telefono: "2145550204" }] }],
  };
  const f = { anfitrion: "Nueva", anfitrion_telefono: "+1 214 555 0201", referidos: [{ nombre: "r1", telefono: "2145550202" }, { nombre: "r2", telefono: "12145550203" }, { nombre: "r3", telefono: "2145550204" }] };
  const ds = candidatosDuplicadoAnfitrion(f, all);
  assert.deepEqual(ds.map((d) => [d.seccion, d.existente.nombre || d.existente.anfitrion]), [["agregados", "Ana"], ["prospectos", "Pepe"], ["distribucion", "Dora"], ["referidos", "Zoe"]]);
  assert.ok(textoDuplicado(ds[3]).includes("referido de Otra"));
});

test("9 · Sin alertas falsas al editar: repetidos ya guardados, referido quitado y ficha trazada por refId", () => {
  // ya estaba repetido al guardarse ("Guardar de todos modos") → editar otra cosa no vuelve a avisar
  const guardado = { id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2145550100", referidos: [{ nombre: "Marta", telefono: "2145550101", refId: "rf_m" }, { nombre: "Marta bis", telefono: "2145550101", refId: "rf_mb" }] };
  assert.deepEqual(duplicadosEnFormulario({ ...guardado, anfitrion_ciudad: "Waco" }, guardado), []);
  // pero un repetido NUEVO en la edición sí avisa
  const conNuevo = { ...guardado, referidos: [...guardado.referidos, { nombre: "Rita hija", telefono: "214 555 0100" }] };
  assert.deepEqual(duplicadosEnFormulario(conNuevo, guardado).map((d) => d.formulario), [{ a: "Rita hija", b: "Rita" }]);
  // Juan pasó a Distribución desde la posición 1 (con refId); luego se quita a Marta y Juan queda en 0 → no alerta contra su propia ficha
  const host = { id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2145550100", referidos: [{ nombre: "Marta", telefono: "2145550101", refId: "rf_t1" }, { nombre: "Juan", telefono: "2145550102", refId: "rf_t2" }] };
  const distJ = { id: "dv_j", nombre: "Juan", telefono: "2145550102", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1, sourceRefId: "rf_t2" };
  const all = { agregados: [], prospectos: [], distribucion: [distJ], referidos: [host] };
  const sinMarta = { ...host, referidos: [host.referidos[1]] };
  assert.deepEqual(candidatosDuplicadoAnfitrion(sinMarta, all, { excluirId: "anf1", editando: host }), []);
  // un referido NUEVO con el teléfono de Juan sí alerta contra la ficha (y dentro del formulario)
  const otraVez = { ...sinMarta, referidos: [...sinMarta.referidos, { nombre: "Juan copia", telefono: "2145550102" }] };
  const ds = candidatosDuplicadoAnfitrion(otraVez, all, { excluirId: "anf1", editando: host });
  assert.deepEqual(ds.map((d) => d.seccion === "formulario" ? "formulario" : d.existente.id).sort(), ["dv_j", "formulario"]);
});

// ═══ MEJORA 3 · Obsequio ═══════════════════════════════════════════════════
test("10 · Regla vigente sin cambios: 4 citas coordinadas o 1 venta; progreso automático con citas reales", () => {
  assert.deepEqual(REGLA_OBSEQUIO, { citas: 4, ventas: 1 });
  const refs = ["A", "B", "C", "D", "E"].map((n, i) => ({ nombre: n, telefono: "21455503" + String(10 + i), refId: "rf_" + n }));
  const a = { id: "anf1", anfitrion: "Rita", referidos: refs };
  const c = (n: string, i: number, x: any = {}) => cita("c" + n, { sourceRefIndex: i, sourceRefId: "rf_" + n, ...x });
  assert.deepEqual([progresoObsequio(a, [c("A", 0), c("B", 1), c("C", 2)]).citas, progresoObsequio(a, [c("A", 0), c("B", 1), c("C", 2)]).logrado], [3, false]);
  const p4 = progresoObsequio(a, [c("A", 0), c("B", 1), c("C", 2), c("D", 3)]);
  assert.deepEqual([p4.citas, p4.logrado, p4.motivo], [4, true, "4 citas coordinadas"]);
  // cancelada no cuenta; servicio/llamada no son "cita"; otra cita de otro anfitrión no cuenta
  assert.equal(progresoObsequio(a, [c("A", 0), c("B", 1), c("C", 2), c("D", 3, { status: "cancelada" })]).logrado, false);
  assert.equal(progresoObsequio(a, [c("A", 0, { tipo: "llamada", _type: "llamada" })]).citas, 0);
  assert.equal(progresoObsequio(a, [c("A", 0, { sourceRecordId: "anf2" })]).citas, 0);
  // compatibilidad: sin citas vinculadas, el estado "Cita agendada" (verde) cuenta como antes
  const legacy = { id: "anf1", referidos: [{ nombre: "A", estado: "verde" }, { nombre: "B", estado: "verde" }, { nombre: "C", estado: "verde" }, { nombre: "D", estado: "verde" }] };
  assert.equal(progresoObsequio(legacy, []).logrado, true);
  // venta: marcada en el referido, o resultado de venta en su cita / venta de servicio
  assert.equal(progresoObsequio({ id: "anf1", referidos: [{ nombre: "A", venta: true }] }, []).ventas, 1);
  assert.equal(progresoObsequio({ id: "anf1", referidos: [{ nombre: "A", resultado: "demo_venta" }] }, []).ventas, 1);
  assert.equal(progresoObsequio(a, [c("A", 0, { tipo: "servicio", _type: "servicio", resultado: "venta_servicio" })]).ventas, 1);
  // el resumen de la tarjeta (Base de Datos v2) usa este cálculo
  assert.ok(APP.includes("const progV2 = v2 ? progresoObsequio(c, allData?.appts||[]) : null;"));
});

test("11 · Notificación del obsequio UNA sola vez; conserva regalo y anfitrión; nunca marca entregado", () => {
  const a = { id: "anf1", anfitrion: "Rita", regalo: "Sartén", regalo_entregado: false, referidos: [{ nombre: "A", refId: "rf_a" }] };
  const s0 = { referidos: [a], appts: [], notificaciones: [] };
  const venta = cita("cv", { sourceRefIndex: 0, sourceRefId: "rf_a", resultado: "demo_venta" });
  const s1 = transicionObsequio(s0, { ...s0, appts: [venta] }, { uid: "sup1", nombre: "Eva" }, "supervisor", NOW);
  const r = s1.referidos[0];
  assert.equal(r._obsequioAvisado, true);
  assert.deepEqual([r.obsequioLogrado.motivo, r.obsequioLogrado.ventas, r.obsequioLogrado.porNombre, r.obsequioLogrado.avisoStaff], ["1 venta de sus referidos", 1, "Eva", true]);
  assert.deepEqual([r.regalo, r.regalo_entregado, r.anfitrion, r.referidos], ["Sartén", false, "Rita", a.referidos]);
  assert.equal(JSON.stringify(s1).includes("entregado\":true"), false);
  assert.equal(s1.notificaciones.length, 1);
  const n = s1.notificaciones[0];
  assert.deepEqual([n.id, n.tipo, n.titulo, n.agente, n.leidoPor], [idNotificacionObsequio("anf1"), "obsequio", "🎁 ¡Obsequio para Rita!", "Eva", ["Eva"]]);
  assert.equal(n.detalle, "Rita logró 1 venta de sus referidos. Hay que pedir su regalo: Sartén.");
  // nuevas citas/ventas del mismo anfitrión → no se repite
  const s2 = transicionObsequio(s1, { ...s1, appts: [...s1.appts, cita("cv2", { sourceRefIndex: 0, sourceRefId: "rf_a", resultado: "demo_venta", fecha: "2026-10-20T10:00" })] }, { uid: "sup1", nombre: "Eva" }, "supervisor", NOW);
  assert.equal(s2.notificaciones.length, 1);
  assert.equal(s2.referidos, s1.referidos);
  // anfitrión avisado por el flujo anterior (legacy _obsequioAvisado) → tampoco se repite
  const viejo = { ...a, _obsequioAvisado: true };
  const s3 = transicionObsequio({ ...s0, referidos: [viejo] }, { ...s0, referidos: [viejo], appts: [venta] }, null, "supervisor", NOW);
  assert.equal(s3.notificaciones.length, 0);
  // en la papelera → no avisa
  const borrado = { ...a, eliminado: true };
  assert.equal(transicionObsequio({ ...s0, referidos: [borrado] }, { ...s0, referidos: [borrado], appts: [venta] }, null, "supervisor", NOW).notificaciones.length, 0);
});

test("12 · Telemarketing cumple el requisito → su aviso personal + UNA notificación para el staff (relevo)", () => {
  const a = { id: "anf1", anfitrion: "Rita", referidos: [{ nombre: "A", refId: "rf_a", estado: "" }] };
  const s0 = { referidos: [a], appts: [], notificaciones: [] };
  // CallCenterV2 (TLK) registra la venta del referido
  const tlk = transicionObsequio(s0, { ...s0, referidos: [actualizarReferido(a, "rf_a", 0, (r) => ({ ...r, venta: true }))] }, { uid: "tlk1", nombre: "Liam" }, "telemarketing_ventas", NOW);
  assert.deepEqual([tlk.referidos[0].obsequioLogrado.avisoStaff, tlk.notificaciones.length], [false, 1]);
  // la notificación del TLK va a SU userData (no a shared); el anfitrión se guarda en su record
  const ctxTLK = { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Liam" };
  const d = emptyDocs(); d.records["anf1"] = { ...a, assignedTo: "tlk1", section: "referidos", appId: "impactos" };
  const ops: any[] = diffState(s0, tlk, d, ctxTLK as any).ops;
  assert.ok(ops.some((o) => o.kind === "userField" && o.field === "notificaciones" && o.uid === "tlk1"));
  assert.equal(ops.some((o) => o.kind === "shared"), false);
  const rec = ops.find((o) => o.kind === "set" && o.id === "anf1").data;
  assert.deepEqual([rec._obsequioAvisado, rec.assignedTo], [true, "tlk1"], "responsable intacto");
  // el staff, al sincronizar, recibe una notificación compartida sin leer y se marca el relevo
  const staffState = { referidos: tlk.referidos, notificaciones: [] };
  const st1 = relevoObsequioStaff(staffState, NOW);
  assert.deepEqual([st1.notificaciones.length, st1.notificaciones[0].id, st1.notificaciones[0].agente, st1.notificaciones[0].leidoPor], [1, "obsequio_anf1", "Liam", []]);
  assert.equal(st1.referidos[0].obsequioLogrado.avisoStaff, true);
  // segunda pasada (o segundo staff con el registro ya marcado) → nada
  assert.equal(relevoObsequioStaff(st1, NOW), st1);
  // si ya existía la notificación con ese id, solo se marca (no se duplica)
  const st2 = relevoObsequioStaff({ ...staffState, notificaciones: [{ id: "obsequio_anf1" }] }, NOW);
  assert.deepEqual([st2.notificaciones.length, st2.referidos[0].obsequioLogrado.avisoStaff], [1, true]);
  // App: el relevo corre solo para staff con v2 y el wrapper aplica sellado + obsequio a todo cambio
  assert.ok(APP.includes("if(!(ACCESS_V2 && v2User && synced && esStaffShared(v2User.role))) return;"));
  assert.ok(APP.includes("return transicionObsequio(s, sellarReferidos(s,n), u?{uid:u.uid,nombre:u.nombre}:null, u?.role||\"\");"));
});

// ═══ Permisos ══════════════════════════════════════════════════════════════
// Misma regla de "no leída" que useNotificaciones (App.tsx); el test 12b verifica que el código es ese.
const noLeidas = (notifs: any[], agenteActivo: string) => notifs.filter((n) => n.agente !== agenteActivo && !(n.leidoPor || []).includes(agenteActivo));

test("12b · Telemarketing 'Liam' logra una venta → su aviso PERSONAL nace del sistema y NO LEÍDO; el staff recibe UNO", () => {
  // la regla real de la campana
  const UN = APP.slice(APP.indexOf("function useNotificaciones("), APP.indexOf("function useNotificaciones(") + 600);
  assert.ok(UN.includes("n.agente !== agenteActivo &&") && UN.includes("!(n.leidoPor||[]).includes(agenteActivo)"));
  const a = { id: "anf1", anfitrion: "Rita", regalo: "Sartén", referidos: [{ nombre: "A", refId: "rf_a" }] };
  const s0 = { referidos: [a], appts: [], notificaciones: [] };
  // 1) Liam (telemarketing_ventas) registra la venta del referido
  const s1 = transicionObsequio(s0, { ...s0, referidos: [actualizarReferido(a, "rf_a", 0, (r) => ({ ...r, venta: true }))] }, { uid: "tlk1", nombre: "Liam" }, "telemarketing_ventas", NOW);
  // 2) su notificación personal
  assert.equal(s1.notificaciones.length, 1);
  const n = s1.notificaciones[0];
  assert.equal(n.tipo, "obsequio");
  assert.notEqual(n.agente, "Liam");
  assert.equal(n.agente, AGENTE_SISTEMA);
  assert.equal(n.leidoPor.includes("Liam"), false);
  assert.deepEqual(n.leidoPor, []);
  assert.equal(n.logradoPor, "Liam", "quién lo logró queda como dato informativo");
  assert.equal(n.detalle, "Rita logró 1 venta de sus referidos. Hay que pedir su regalo: Sartén. Lo registró Liam.");
  // 3) cuenta como NO LEÍDA para Liam
  assert.equal(noLeidas(s1.notificaciones, "Liam").length, 1);
  // …y al abrir la campana (marcarLeidas: agrega agenteActivo a leidoPor) deja de estar pendiente
  assert.equal(noLeidas(s1.notificaciones.map((x: any) => ({ ...x, leidoPor: [...x.leidoPor, "Liam"] })), "Liam").length, 0);
  // y se guarda en SU userData (no en shared)
  const d = emptyDocs(); d.records["anf1"] = { ...a, assignedTo: "tlk1", section: "referidos", appId: "impactos" };
  const ops: any[] = diffState(s0, s1, d, { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Liam" } as any).ops;
  const uf = ops.find((o) => o.kind === "userField" && o.field === "notificaciones");
  assert.deepEqual([uf.uid, uf.data.length, uf.data[0].agente, uf.data[0].leidoPor], ["tlk1", 1, "Sistema", []]);
  assert.equal(ops.some((o) => o.kind === "shared"), false);
  // 4) el registro conserva quién lo logró; obsequioLogrado sin cambios de comportamiento
  const ol = s1.referidos[0].obsequioLogrado;
  assert.deepEqual([ol.porNombre, ol.porUid, ol.avisoStaff, ol.motivo, ol.ventas, s1.referidos[0]._obsequioAvisado], ["Liam", "tlk1", false, "1 venta de sus referidos", 1, true]);
  assert.equal("avisoStaffAt" in ol, false);
  // 5) el staff recibe después EXACTAMENTE UNA notificación compartida, sin leer para Supervisor y Distribuidor
  const st1 = relevoObsequioStaff({ referidos: s1.referidos, notificaciones: [] }, NOW);
  const obs = st1.notificaciones.filter((x: any) => x.tipo === "obsequio");
  assert.equal(obs.length, 1);
  assert.deepEqual([obs[0].id, obs[0].agente, obs[0].leidoPor], ["obsequio_anf1", "Liam", []]);
  assert.equal(noLeidas(st1.notificaciones, "Eva Supervisora").length, 1);
  assert.equal(noLeidas(st1.notificaciones, "Tomas Distribuidor").length, 1);
  assert.equal(st1.referidos[0].obsequioLogrado.avisoStaff, true);
  // 6) segunda pasada del relevo → nada nuevo (misma referencia)
  assert.equal(relevoObsequioStaff(st1, NOW), st1);
  // nuevas ventas del mismo anfitrión tampoco repiten el aviso personal
  const s2 = transicionObsequio(s1, { ...s1, appts: [{ id: "cv", tipo: "cita", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefId: "rf_a", sourceRefIndex: 0, resultado: "demo_venta" }] }, { uid: "tlk1", nombre: "Liam" }, "telemarketing_ventas", NOW);
  assert.equal(s2.notificaciones.length, 1);
});

test("12c · Supervisor / Distribuidor directos: comportamiento actual (agente = quien registra, ya leída por él)", () => {
  for (const [rol, nombre] of [["supervisor", "Eva"], ["distribuidor", "Tomas"], ["super_admin", "Admin"]]) {
    const a = { id: "anf1", anfitrion: "Rita", regalo: "Sartén", referidos: [{ nombre: "A", refId: "rf_a" }] };
    const s0 = { referidos: [a], appts: [], notificaciones: [] };
    const s1 = transicionObsequio(s0, { ...s0, referidos: [actualizarReferido(a, "rf_a", 0, (r) => ({ ...r, venta: true }))] }, { uid: "s1", nombre }, rol, NOW);
    const n = s1.notificaciones[0];
    assert.deepEqual([n.agente, n.leidoPor, "logradoPor" in n], [nombre, [nombre], false], rol);
    assert.equal(n.detalle, "Rita logró 1 venta de sus referidos. Hay que pedir su regalo: Sartén.");
    assert.equal(noLeidas(s1.notificaciones, nombre).length, 0, "quien lo registró ya lo conoce");
    assert.equal(noLeidas(s1.notificaciones, "Otra persona del staff").length, 1, "el resto del staff la ve sin leer");
    assert.deepEqual([s1.referidos[0].obsequioLogrado.avisoStaff, s1.referidos[0].obsequioLogrado.porNombre], [true, nombre]);
    // el relevo no agrega otra (ya está marcada avisoStaff)
    assert.equal(relevoObsequioStaff(s1, NOW), s1);
  }
});

test("13 · Permisos: Telemarketing, Supervisor y Distribuidor sin cambios", () => {
  const ref = { id: "anf1::0", assignedTo: "tlk1" };
  const tlk = accionesRegistroV2(actor("telemarketing_ventas", "tlk1"), ref, "referido");
  const ajeno = accionesRegistroV2(actor("telemarketing_ventas", "tlk2"), ref, "referido");
  const sup = accionesRegistroV2(actor("supervisor"), ref, "referido");
  const dist = accionesRegistroV2(actor("distribuidor"), ref, "referido");
  assert.deepEqual([tlk.editar, tlk.resultadoFisico, tlk.borrarDefinitivo], [true, false, false]);
  assert.equal(ajeno.editar, false);
  assert.deepEqual([sup.editar, sup.resultadoFisico, sup.borrarDefinitivo], [true, true, false]);
  assert.deepEqual([dist.editar, dist.resultadoFisico, dist.borrarDefinitivo], [true, true, true]);
  assert.equal(can(U("supervisor"), "ventas.manage"), false, "Supervisor sigue sin ventas.manage");
  assert.equal(can(U("supervisor"), "servicios.manage"), true);
  assert.equal(can(U("telemarketing_ventas"), "referidos.manage"), false);
  // TLK crea una cita desde SU referido: sourceRefId viaja (no es campo prohibido al crear)
  const ctxTLK = { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Liam" };
  const nueva = enrichNewAppts([], [cita("n1", { nombre: "Juan", sourceRefIndex: 1, sourceRefId: "rf_t2" })], { uid: "tlk1", nombre: "Liam" } as any);
  const op: any = diffState({ appts: [] }, { appts: nueva }, emptyDocs(), ctxTLK as any).ops[0];
  assert.deepEqual([op.data.sourceRefId, op.data.sourceRefIndex, op.data.createdByUid, op.data.assignedTo], ["rf_t2", 1, "tlk1", null]);
  assert.equal(APPT_NO_INICIALES_TM.includes("sourceRefId"), false);
});

test("14 · firestore.rules sin cambios: sourceRefId permitido al crear, inmutable para TLK al editar; refId/obsequio en el anfitrión", () => {
  const camposNoIniciales = RULES.slice(RULES.indexOf("function camposNoIniciales()"), RULES.indexOf("// ── Registro de origen en CREATE"));
  assert.equal(camposNoIniciales.includes("sourceRefId"), false);
  const editables = RULES.slice(RULES.indexOf("function tmEditables()"), RULES.indexOf("function camposCancelacion()"));
  assert.equal(editables.includes("sourceRefId"), false, "TLK no puede cambiarlo en una cita existente (allowlist)");
  assert.ok(RULES.includes("&& d.sourceRefIndex < rec.referidos.size());"), "sourceRefIndex se sigue validando igual");
  const untouched = RULES.slice(RULES.indexOf("function assignmentUntouched()"), RULES.indexOf("allow read: if staffOrSuper(appId)"));
  for (const f of ["referidos", "refId", "_obsequioAvisado", "obsequioLogrado"]) assert.equal(untouched.includes(`'${f}'`), false, f);
  assert.equal(RULES.includes("sourceRefId"), false, "no se tocó el archivo de reglas");
});

// ═══ Compatibilidad ════════════════════════════════════════════════════════
test("15 · Datos históricos: mapa legacy, citas sin refId y anfitriones nunca tocados siguen funcionando", () => {
  const mapa = { id: "anfM", anfitrion: "Mapa", referidos: { x1: { nombre: "Ana", telefono: "2145550401" }, x2: { nombre: "Beto", telefono: "2145550402" } } };
  const m = asegurarRefIds(mapa, seq());
  assert.deepEqual(Object.keys(m.referidos), ["x1", "x2"]);
  assert.deepEqual(Object.values(m.referidos).map((r: any) => r.refId), ["rf_t1", "rf_t2"]);
  // cita vieja por posición de valores del mapa (como en firestore.rules)
  assert.equal(resolverReferido(mapa, cita("v", { sourceRecordId: "anfM", nombre: "Beto", sourceRefIndex: 1 }))!.ref.nombre, "Beto");
  // anfitrión sin referidos / referidos no-objeto: no rompe
  assert.deepEqual(asegurarRefIds({ id: "z" }), { id: "z" });
  assert.deepEqual(progresoObsequio({ id: "z" }, []), { referidos: 0, citas: 0, ventas: 0, logrado: false, motivo: "0 citas coordinadas" });
  // sin cambios relevantes, el sellado y la transición devuelven el MISMO estado
  const s = { referidos: [mapa], appts: [], notificaciones: [] };
  assert.equal(sellarReferidos(s, s), s);
  const otro = { ...s, cumpleMsgTpl: "x" };
  assert.equal(sellarReferidos(s, otro), otro);
  assert.equal(transicionObsequio(s, otro, null, "supervisor"), otro);
});

test("16 · V2 desactivado (ACCESS_V2=0): mismo setState, mismo conteo y mismo aviso legacy", () => {
  assert.ok(APP.includes("const setState = ACCESS_V2 ? setStateV2 : setStateBase;"));
  assert.ok(APP.includes(": useSharedState(authReady && !!authUser);"));
  // resumen legacy: mismas expresiones que antes cuando v2 es null
  assert.ok(APP.includes(`const citas=v2 ? progV2.citas : refs.filter(r=>r.estado==="verde").length;`));
  assert.ok(APP.includes(`const ventas=v2 ? progV2.ventas : refs.filter(r=>r.venta||r.resultado==="venta").length;`));
  assert.ok(APP.includes("const lograObsequio = v2 ? (progV2.logrado || !!c.obsequioLogrado) : (citas>=4 || ventas>=1);"));
  // CallControl legacy: el aviso de obsequio de siempre sigue intacto; en v2 lo hace el sellado central
  assert.ok(APP.includes(`if(!anf._obsequioAvisado && (citas>=4 || ventas>=1) && notify){`));
  assert.ok(APP.includes("if(ACCESS_V2){ escribirReferidoV2(`${refDe}::${refIdx}`, r=>({...r,...patch})); return; }"));
  // las escrituras legacy por posición siguen ahí (las mismas 5 que en main), detrás de los atajos v2
  assert.equal((APP.match(/const \[refDe,refIdx\]=id\.split\("::"\);/g) || []).length, 5);
  // el relevo staff y el sellado solo existen con ACCESS_V2
  assert.ok(APP.includes("if(refDeCita){ return x.id!==refDeCita.anfId ? x : actualizarReferido("));
  assert.ok(APP.includes("const refDeCita = ACCESS_V2 && scheduleClient && type===\"referido\""));
});
