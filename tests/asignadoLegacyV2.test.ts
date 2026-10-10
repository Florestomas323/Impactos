// V2: `asignado_a` (legacy, guarda un NOMBRE) no se muestra ni se edita como responsable.
// La asignación real es assignedTo/assignedToName desde Asignaciones (AssignmentManager → applyAssignments).
// Legacy (ACCESS_V2=0) conserva "Asignar a" y el badge 👤 exactamente igual.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assignRecord, unassignRecord, ASSIGNMENT_FIELDS } from "../src/services/assignments";
import { queriesFor } from "../src/data/schema";

const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const cuerpo = (nombre: string, siguiente: string) => { const i = APP.indexOf(`function ${nombre}(`); return APP.slice(i, APP.indexOf(`function ${siguiente}(`, i)); };
const FORM = cuerpo("ClientForm", "AppointmentForm");
const ROW = cuerpo("ClientRow", "DBSection");

test("1 · ClientForm: 'Asignar a' solo con !ACCESS_V2; en v2 queda únicamente 'Próximo seguimiento'", () => {
  const i = FORM.indexOf('<Field label="Asignar a">');
  assert.ok(i > 0, "el campo legacy sigue existiendo");
  assert.ok(FORM.slice(i - 30, i).includes("{!ACCESS_V2 && "), "condicionado a !ACCESS_V2");
  assert.equal((FORM.match(/label="Asignar a"/g) || []).length, 1, "un solo selector y sin reemplazo");
  assert.ok(FORM.includes(`<div className={ACCESS_V2?"":"grid grid-cols-2 gap-3"}>`), "en v2 el seguimiento ocupa la fila completa");
  assert.ok(FORM.includes('<Field label="Próximo seguimiento">'));
  // ningún otro control del formulario escribe asignado_a
  assert.equal((FORM.match(/set\("asignado_a"/g) || []).length, 1);
});

test("2 · ClientRow: el badge 👤 asignado_a solo con !ACCESS_V2", () => {
  assert.ok(ROW.includes("{!ACCESS_V2 && c.asignado_a && <span"));
  assert.equal((ROW.match(/c\.asignado_a/g) || []).length, 2, "solo la condición y el texto del badge");
});

test("3 · Legacy (ACCESS_V2=0): mismas expresiones evalúan igual que antes", () => {
  // Para ACCESS_V2=false: !ACCESS_V2 && X === X  ·  className = "grid grid-cols-2 gap-3"
  const ACCESS_V2 = false;
  const badge = (c: any) => !ACCESS_V2 && c.asignado_a;
  assert.equal(badge({ asignado_a: "Tomas" }), "Tomas");
  assert.equal(badge({ asignado_a: "" }), "");
  assert.equal(ACCESS_V2 ? "" : "grid grid-cols-2 gap-3", "grid grid-cols-2 gap-3");
  // el texto del selector legacy no cambió
  assert.ok(FORM.includes(`<select className={inpLight} value={d.asignado_a||""} onChange={e=>set("asignado_a",e.target.value)}>`));
  assert.ok(FORM.includes(`<option value="">Sin asignar</option>`));
  assert.ok(FORM.includes(`{AGENTES.map(a=><option key={a} value={a}>{a}</option>)}`));
  assert.ok(APP.includes(`const AGENTES = ["Tomas", "Angie", "Supervisora", "Agente de llamadas"];`));
  // el Dashboard legacy (que usa asignado_a para "Mis clientes") solo se monta sin v2
  assert.ok(APP.includes(`{tab==="inicio" && !(ACCESS_V2 && v2User) && <Dashboard `));
});

test("4 · No se borran datos: el formulario conserva asignado_a guardado; assignedTo/assignedToName intactos", () => {
  // ClientForm arranca con el registro completo y el valor de asignado_a viaja tal cual al guardar
  assert.ok(APP.includes("asignado_a:\"\","), "plantilla legacy sin cambios");
  assert.ok(!/delete [a-z]+\.asignado_a|asignado_a:\s*undefined/.test(FORM), "el formulario no limpia asignado_a");
  for (const f of ["assignedTo", "assignedToName", "assignedBy", "assignedAt", "assignmentType", "assignmentStatus", "assignmentHistory"])
    assert.ok((ASSIGNMENT_FIELDS as readonly string[]).includes(f), f);
  const rec = { id: "a1", section: "agregados", nombre: "Ana", asignado_a: "Tomas", notas: [{ texto: "x" }] };
  const a = assignRecord(rec as any, { toUid: "eva", toName: "Eva", byUid: "sup1", byName: "Sup", type: "ventas" } as any, new Date(2026, 9, 9, 23, 0));
  const r: any = (a as any).record || a;
  assert.deepEqual([r.assignedTo, r.assignedToName, r.notas.length], ["eva", "Eva", 1]);
  const u: any = (unassignRecord(r, { byUid: "sup1", byName: "Sup" } as any, new Date(2026, 9, 9, 23, 30)) as any);
  const ru: any = u.record || u;
  assert.equal(ru.assignedTo ?? null, null);
});

test("5 · Asignaciones y queries siguen usando assignedTo (no asignado_a)", () => {
  const AM = fs.readFileSync(new URL("../src/components/assignments/AssignmentManager.tsx", import.meta.url), "utf8");
  assert.ok(/assignedTo/.test(AM), "AssignmentManager usa assignedTo");
  assert.equal(/asignado_a\s*===/.test(AM), false, "AssignmentManager no filtra por asignado_a");
  const W = fs.readFileSync(new URL("../src/services/assignmentWriter.ts", import.meta.url), "utf8");
  assert.ok(W.includes("export async function applyAssignments"));
  const qs = JSON.stringify(queriesFor({ uid: "tlk1", role: "telemarketing_ventas", appId: "impactos" } as any));
  assert.ok(qs.includes("assignedTo") && qs.includes("tlk1") && !qs.includes("asignado_a"));
});

test("6 · firestore.rules: records siguen protegidos por assignedTo (sin cambios en este ajuste)", () => {
  const RULES = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.ok(RULES.includes("(tmOn(resource.data.section) && resource.data.assignedTo == uid())"));
  assert.ok(RULES.includes("'workStatus', 'asignado_a', 'legacyId', 'legacySource', 'createdByUid']"));
});
