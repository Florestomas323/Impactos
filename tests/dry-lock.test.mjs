// Prueba del candado de simulación: cualquier escritura debe reventar.
import { test } from "node:test";
import assert from "node:assert/strict";
const DRY = true;
const bloquear = (m) => () => { throw new Error(`SIMULACIÓN: se intentó escribir (${m}). Abortado, no se tocó Firestore.`); };
const soloLectura = (ref) => new Proxy(ref, {
  get(t, k) {
    if (["set","create","update","delete","add"].includes(k)) return bloquear(String(k));
    const v = t[k];
    if (typeof v === "function") return (...a) => { const r = v.apply(t, a); return (r && (r.doc || r.get)) ? soloLectura(r) : r; };
    return v;
  },
});
const fake = { collection: (n) => ({ doc: (i) => ({ set(){}, create(){}, update(){}, delete(){}, get: async()=>({exists:false}), collection:(x)=>fake.collection(x) }), get: async()=>({size:0,forEach(){}}), add(){} }), batch: () => ({ create(){}, commit: async()=>{} }) };
const db = DRY ? new Proxy(fake, { get(t,k){ if(k==="batch") return bloquear("batch"); if(k==="collection") return (n)=>soloLectura(t.collection(n)); const v=t[k]; return typeof v==="function"?v.bind(t):v; } }) : fake;
test("--dry bloquea toda escritura, incluidos cursores y logs", () => {
  assert.throws(() => db.batch(), /SIMULACIÓN/);
  assert.throws(() => db.collection("workspaces").doc("impactos").set({}), /SIMULACIÓN/);
  assert.throws(() => db.collection("workspaces").doc("impactos").collection("_migration").doc("v1").set({}), /SIMULACIÓN/);
  assert.throws(() => db.collection("invitations").doc("x@y.com").create({}), /SIMULACIÓN/);
  assert.throws(() => db.collection("workspaces").add({}), /SIMULACIÓN/);
  assert.doesNotThrow(() => db.collection("crm_telemarketing").get()); // leer sí
});
