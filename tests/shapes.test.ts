// Formatos históricos reales: array, mapa, null y texto. Lectura segura,
// valor original intacto y aviso con sección, id, campo y tipo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asList, asEntries, shapeOf, lastContactAt, deriveWorkStatus } from "../src/services/assignments";
import { joinLegacyDocs, planMigration, verifyMigration, countLegacy, inspectShape, formatReport } from "../src/services/migration";

const NOW = new Date("2026-09-19T15:00:00Z");
const base = (id: string, extra: any = {}) => ({ id, nombre: "C" + id, estado: "naranja", eliminado: false, ...extra });
const correr = (estado: any) => {
  const plan = planMigration(estado, "impactos", NOW);
  return { plan, rep: verifyMigration(estado, plan, "impactos", NOW) };
};
const congelar = (o: any) => JSON.parse(JSON.stringify(o));

test("asList/asEntries/shapeOf: solo leen, nunca modifican", () => {
  const arr = [1, 2]; const mapa = { a: { x: 1 }, b: { x: 2 } };
  assert.equal(asList(arr), arr);                       // mismo array, sin copiar
  assert.deepEqual(asList(mapa), [{ x: 1 }, { x: 2 }]);
  assert.deepEqual(asList(null), []); assert.deepEqual(asList(undefined), []);
  assert.deepEqual(asList("texto"), []); assert.deepEqual(asList(7), []);
  assert.deepEqual(asEntries(mapa).map(([k]) => k), ["a", "b"]);
  assert.deepEqual(mapa, { a: { x: 1 }, b: { x: 2 } });  // intacto
  assert.equal(shapeOf(null), "null"); assert.equal(shapeOf([]), "array");
  assert.equal(shapeOf({}), "object"); assert.equal(shapeOf("x"), "string");
});

test("historial como ARRAY: funciona igual que antes, sin avisos", () => {
  const r = base("h1", { historial: [{ tipo: "llamada", fecha: "2026-08-01T10:00:00Z" }] });
  assert.equal(lastContactAt(r), "2026-08-01T10:00:00Z");
  const { plan, rep } = correr({ agregados: [r] });
  assert.equal(rep.ok, true); assert.equal(plan.shapeWarnings.length, 0);
  assert.equal(rep.historialAntes, 1); assert.equal(rep.historialDespues, 1);
});

test("historial como OBJETO/MAPA: se lee, se conserva tal cual y se avisa", () => {
  const hist = { k1: { tipo: "llamada", fecha: "2026-08-02T10:00:00Z" }, k2: { tipo: "estado", fecha: "2026-08-05T10:00:00Z" } };
  const r = base("h2", { historial: hist });
  const antes = congelar(r);
  assert.equal(lastContactAt(r), "2026-08-05T10:00:00Z");     // antes reventaba aquí
  assert.equal(deriveWorkStatus(r), "worked");
  const { plan, rep } = correr({ agregados: [r] });
  assert.equal(rep.ok, true);
  assert.equal(rep.historialAntes, 2); assert.equal(rep.historialDespues, 2);
  const mig = plan.records[0];
  assert.deepEqual(mig.historial, hist);                       // NO se convirtió en array
  assert.ok(!Array.isArray(mig.historial));
  assert.deepEqual(r, antes);                                  // el origen no se tocó
  assert.deepEqual(plan.shapeWarnings, [{ section: "agregados", id: "h2", field: "historial", type: "object" }]);
});

test("notas como OBJETO/MAPA: se cuentan, se conservan y se avisa", () => {
  const notas = { n1: { texto: "hola", fecha: "2026-07-01" }, n2: { texto: "otra", fecha: "2026-07-09" } };
  const r = base("n1", { notas });
  assert.equal(lastContactAt(r), "2026-07-09");
  const { plan, rep } = correr({ prospectos: [r] });
  assert.equal(rep.notasAntes, 2); assert.equal(rep.notasDespues, 2);
  assert.deepEqual(plan.records[0].notas, notas);
  assert.deepEqual(plan.shapeWarnings, [{ section: "prospectos", id: "n1", field: "notas", type: "object" }]);
});

test("referidos como OBJETO/MAPA (y su historia anidada también como mapa)", () => {
  const refs = {
    ra: { nombre: "Luis", notas: [{ texto: "x", fecha: "2026-09-01" }], historial: { z: { tipo: "llamada", fecha: "2026-09-10" } } },
    rb: { nombre: "Ana", notas: [] },
  };
  const r = { id: "anf1", anfitrion: "Carmen", referidos: refs };
  assert.equal(lastContactAt(r), "2026-09-10");
  const { plan, rep } = correr({ referidos: [r] });
  assert.equal(rep.ok, true);
  assert.equal(rep.notasAntes, 1); assert.equal(rep.historialAntes, 1);
  assert.equal(rep.notasDespues, 1); assert.equal(rep.historialDespues, 1);
  assert.deepEqual(plan.records[0].referidos, refs);
  assert.deepEqual(plan.shapeWarnings, [
    { section: "referidos", id: "anf1", field: "referidos", type: "object" },
    { section: "referidos", id: "anf1", field: "referidos[ra].historial", type: "object" },
  ]);
});

test("NULL: se trata como vacío, se conserva null y NO genera aviso", () => {
  const r = base("z1", { historial: null, notas: null, referidos: null, mensajes: null });
  assert.equal(lastContactAt(r), "");
  assert.equal(deriveWorkStatus({ ...r, estado: "sin_estado" }), "fresh");
  const { plan, rep } = correr({ agregados: [r] });
  assert.equal(rep.ok, true);
  assert.equal(plan.records[0].historial, null);
  assert.equal(plan.records[0].notas, null);
  assert.equal(plan.shapeWarnings.length, 0);
});

test("STRING inesperado: se conserva el texto original y se avisa con su tipo", () => {
  const r = base("s1", { notas: "llamar el martes", historial: "sin datos", referidos: 3, mensajes: "wa" });
  assert.doesNotThrow(() => lastContactAt(r));
  const { plan, rep } = correr({ distribucion: [r] });
  assert.equal(rep.ok, true);
  const mig = plan.records[0];
  assert.equal(mig.notas, "llamar el martes");               // texto intacto
  assert.equal(mig.historial, "sin datos");
  assert.equal(mig.referidos, 3);
  const w = plan.shapeWarnings.map((x) => `${x.section}|${x.id}|${x.field}|${x.type}`).sort();
  assert.deepEqual(w, ["distribucion|s1|historial|string", "distribucion|s1|mensajes|string", "distribucion|s1|notas|string", "distribucion|s1|referidos|number"]);
  const txt = formatReport(rep);
  assert.match(txt, /FORMAS INESPERADAS: 4/);
  assert.match(txt, /distribucion \| s1 \| notas \| string/);
  assert.match(txt, /RESULTADO: OK .*avisos de formato/);
});

test("Sección entera guardada como MAPA: no se salta en silencio", () => {
  const estado = { agregados: { a1: base("a1"), a2: { nombre: "sin id propio" } } };
  const w: string[] = [];
  const { plan, rep } = correr(estado);
  assert.equal(countLegacy(estado).porSeccion.agregados, 2);
  assert.deepEqual(plan.records.map((r) => r.id).sort(), ["a1", "a2"]); // la clave del mapa es su id
  assert.equal(rep.ok, true);
  assert.ok(plan.warnings.some((x) => /sección agregados: es object/.test(x)));
});

test("Registro sin id en una lista: el reporte NO da OK y lo nombra", () => {
  const { plan, rep } = correr({ agregados: [base("ok1"), { nombre: "sin id" }] });
  assert.equal(rep.sinIdValido, 1);
  assert.equal(rep.ok, false);
  assert.ok(plan.warnings.some((x) => /sin id en la posición 1/.test(x)));
});

test("Registro que no es objeto (string suelto dentro de la lista)", () => {
  const estado = { agregados: [base("a1"), "basura"] };
  const { rep } = correr(estado);
  assert.equal(rep.sinIdValido, 1);           // no se inventa un id
  assert.equal(rep.ok, false);
  assert.deepEqual(inspectShape("basura", "agregados", "x"), [{ section: "agregados", id: "x", field: "(registro)", type: "string" }]);
});

test("Fragmentos mezclados (array + mapa) en la misma sección: se juntan y se avisa", () => {
  const w: string[] = [];
  const e = joinLegacyDocs({ sec_agregados_1: [base("a1")], sec_agregados_2: { k: base("a2") } }, w);
  assert.deepEqual(e.agregados.map((r: any) => r.id), ["a1", "a2"]);
  assert.match(w[0], /fragmentos mezclados/);
});
