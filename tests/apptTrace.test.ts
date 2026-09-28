// Trazabilidad de citas en v2: quién la creó queda por uid, y la ve quien la creó.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichNewAppts, esCitaDe } from "../src/services/apptTrace";
import { buildState, diffState, emptyDocs } from "../src/data/storeCore";
import { queriesFor } from "../src/data/schema";
import { ventasResumen, staffResumen } from "../src/services/commandCenter";

const NOW = new Date(2026, 8, 24, 11, 0, 0);
const HOY = "2026-09-24";
const TLK = { uid: "tlk1", nombre: "Yelitza" };
const ctx = { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Yelitza" };

test("TLK crea cita → queda createdByUid → la vuelve a leer → aparece en Citas de hoy y Mis citas", () => {
  // 1) Así crea citas la app: setAppts(p => [nueva, ...p])  (Agenda, Llamadas, Reclutamiento…)
  const prev: any[] = [];
  const nueva = { id: "c1", tipo: "cita", _type: "cita", nombre: "Cliente", fecha: `${HOY}T15:00`, agente: "Yelitza" };
  const next = enrichNewAppts(prev, [nueva, ...prev], TLK);
  assert.equal(next[0].createdByUid, "tlk1");
  assert.equal(next[0].createdByName, "Yelitza");
  assert.equal(next[0].assignedTo, undefined);            // NO se asigna automáticamente
  // 2) El store lo guarda con su autoría
  const d = emptyDocs();
  const { ops } = diffState({ appts: prev }, { appts: next }, d, ctx);
  const op: any = ops[0];
  assert.equal(op.col, "appts");
  assert.equal(op.data.createdByUid, "tlk1");
  assert.equal(op.data.createdByName, "Yelitza");
  assert.equal(op.data.assignedTo, null);
  // 3) El TLK vuelve a leerla: su consulta de citas incluye createdByUid == su uid
  const qs = queriesFor({ role: "telemarketing_ventas", uid: "tlk1" }, "appts");
  assert.ok(qs.some((q) => q.where.some(([f, , v]) => f === "createdByUid" && v === "tlk1")));
  d.appts[op.id] = op.data;
  const st = buildState(d);
  // 4) Aparece en su Centro de mando
  const r = ventasResumen(st, st.appts, {}, { uid: "tlk1", nombre: "Yelitza", now: NOW });
  assert.equal(r.citasHoy, 1);
  assert.equal(r.flujo.citas, 1);                          // "Mis citas" / citas próximas
  assert.ok(esCitaDe(st.appts[0], "tlk1"));
});

test("TLK NO ve una cita creada por otro TLK si no se la asignaron", () => {
  const ajena = { id: "c2", tipo: "cita", fecha: `${HOY}T10:00`, createdByUid: "tlk2", createdByName: "Otra" };
  assert.ok(!esCitaDe(ajena, "tlk1"));
  assert.equal(ventasResumen({}, [ajena], {}, { uid: "tlk1", nombre: "Yelitza", now: NOW }).citasHoy, 0);
  // Si se la asignan, sí
  assert.equal(ventasResumen({}, [{ ...ajena, assignedTo: "tlk1" }], {}, { uid: "tlk1", nombre: "Yelitza", now: NOW }).citasHoy, 1);
  // El nombre NO es identidad: misma "agente" pero otro uid → no es suya
  assert.equal(ventasResumen({}, [{ ...ajena, agente: "Yelitza", createdByName: "Yelitza" }], {}, { uid: "tlk1", nombre: "Yelitza", now: NOW }).citasHoy, 0);
});

test("Una visita que hará el distribuidor conserva su responsable y el TLK la sigue viendo", () => {
  const prev = [{ id: "c3", tipo: "cita", fecha: `${HOY}T18:00`, createdByUid: "tlk1", createdByName: "Yelitza", assignedTo: "dist1" }];
  const next = enrichNewAppts(prev, prev.map((a) => ({ ...a, resultado: "demo_venta" })), { uid: "dist1", nombre: "Angie" });
  assert.equal(next[0].createdByUid, "tlk1");              // editarla no cambia quién la creó
  assert.equal(next[0].assignedTo, "dist1");
  assert.ok(esCitaDe(next[0], "tlk1") && esCitaDe(next[0], "dist1"));
  // y el store tampoco deja cambiar la autoría al guardar
  const d = emptyDocs(); d.appts.c3 = prev[0];
  const op: any = diffState({ appts: prev }, { appts: [{ ...prev[0], createdByUid: "HACK" }] }, d, { ...ctx, uid: "dist1", role: "distribuidor", nombre: "Angie" }).ops[0];
  assert.equal(op.data.createdByUid, "tlk1");
});

test("Citas viejas no se tocan; sin usuario v2 no se enriquece nada", () => {
  const vieja = { id: "v1", tipo: "cita", fecha: `${HOY}T09:00` };
  const next = enrichNewAppts([vieja], [vieja, { id: "n1", tipo: "cita" }], TLK);
  assert.equal(next[0], vieja);                              // misma referencia, sin campos nuevos
  assert.equal(next[1].createdByUid, "tlk1");
  const arr = [{ id: "n2", tipo: "cita" }];
  assert.equal(enrichNewAppts([], arr, null), arr);          // modo actual: sin cambios
  assert.equal(staffResumen({}, next, NOW).visitasHoy, 1);   // la vieja se sigue contando
});

// ── r3: responsable y autoría al guardar ─────────────────────────────────────
import { apptDoc } from "../src/data/storeCore";
const TLKctx = { uid: "tlk1", role: "telemarketing_ventas", appId: "impactos", nombre: "Yelitza" };
const DIST = { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Angie" };

test("Nueva cita sin assignedTo → assignedTo null", () => {
  const d = apptDoc({ id: "n1", tipo: "cita", fecha: `${HOY}T10:00` }, undefined, TLKctx);
  assert.equal(d.assignedTo, null);
  assert.equal(d.createdByUid, "tlk1"); assert.equal(d.createdByName, "Yelitza");
});

test("TLK crea cita con assignedTo dist1 → se conserva dist1; la ven la TLK y el distribuidor", () => {
  // Así llega por setAppts + enrichNewAppts, y así lo guarda el store
  const next = enrichNewAppts([], [{ id: "c1", tipo: "cita", fecha: `${HOY}T15:00`, assignedTo: "dist1" }], TLK);
  const op: any = diffState({ appts: [] }, { appts: next }, emptyDocs(), TLKctx).ops[0];
  assert.equal(op.data.createdByUid, "tlk1");
  assert.equal(op.data.createdByName, "Yelitza");
  assert.equal(op.data.assignedTo, "dist1");               // NO se pierde
  // TLK la ve por createdByUid; el distribuidor por assignedTo (y como staff ve toda la agenda)
  assert.ok(esCitaDe(op.data, "tlk1"));
  assert.ok(esCitaDe(op.data, "dist1"));
  assert.ok(queriesFor({ role: "telemarketing_ventas", uid: "tlk1" }, "appts").some((q) => q.where.some(([f, , v]) => f === "createdByUid" && v === "tlk1")));
  assert.deepEqual(queriesFor({ role: "distribuidor", uid: "dist1" }, "appts"), [{ collection: "appts", where: [] }]);
  assert.equal(ventasResumen({}, [op.data], {}, { uid: "tlk1", nombre: "Yelitza", now: NOW }).citasHoy, 1);
});

test("createdByUid siempre es quien la crea, aunque la app mande otro", () => {
  const d = apptDoc({ id: "n2", tipo: "cita", createdByUid: "OTRA", createdByName: "Otra", assignedTo: "dist1" }, undefined, TLKctx);
  assert.equal(d.createdByUid, "tlk1"); assert.equal(d.createdByName, "Yelitza");
  assert.equal(d.assignedTo, "dist1");
});

test("Editar una cita existente conserva su assignedTo", () => {
  const cur = { id: "e1", tipo: "cita", createdByUid: "tlk1", createdByName: "Yelitza", assignedTo: "dist1" };
  const tlk = apptDoc({ ...cur, notas: "confirmó", assignedTo: "tlk1" }, cur, TLKctx);
  assert.equal(tlk.assignedTo, "dist1"); assert.equal(tlk.notas, "confirmó");
  const dist = apptDoc({ ...cur, resultado: "demo_venta", assignedTo: null }, cur, DIST);
  assert.equal(dist.assignedTo, "dist1"); assert.equal(dist.createdByUid, "tlk1");
});

test("Cita legacy sin createdByUid: el distribuidor la edita y NO se le adjudica", () => {
  const legacy = { id: "L1", tipo: "cita", fecha: "2026-09-10T10:00", agente: "Yelitza" };
  const d = emptyDocs(); d.appts.L1 = legacy;
  const op: any = diffState({ appts: [legacy] }, { appts: [{ ...legacy, resultado: "demo_no_venta" }] }, d, DIST).ops[0];
  assert.equal(op.data.resultado, "demo_no_venta");
  assert.ok(!("createdByUid" in op.data), "no debe inventar createdByUid");
  assert.ok(!esCitaDe(op.data, "dist1") || op.data.assignedTo === "dist1");
  assert.equal(op.data.assignedTo, null);
});

test("Cita legacy sin createdByName: editarla NO le crea uno (ni aunque la app lo mande)", () => {
  const legacy = { id: "L2", tipo: "cita", createdByUid: "tlk1" };
  const out = apptDoc({ ...legacy, notas: "x", createdByName: "Inventado" }, legacy, DIST);
  assert.ok(!("createdByName" in out));
  assert.equal(out.createdByUid, "tlk1");
  const sinNada = apptDoc({ id: "L3", createdByUid: "HACK", createdByName: "HACK" }, { id: "L3" }, DIST);
  assert.ok(!("createdByUid" in sinNada) && !("createdByName" in sinNada));
});
