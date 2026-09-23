// ═══ Distribución de datos → MANUAL ════════════════════════════════════════
// Elegir sección → filtrar/buscar → marcar registros uno por uno → elegir a
// quién van. Usa exactamente la misma lógica que la asignación automática
// (matchesFilters + applyAssignments), así que también aquí la escritura toca
// SOLO los campos de asignación: notas, mensajes, historial, llamadas, citas,
// seguimientos y campos legados quedan intactos.
import { useMemo, useState } from "react";
import { Modal, PrimaryBtn, inpLight } from "../primitives";
import { matchesFilters, AssignFilters, lastContactAt, daysSinceContact, asList } from "../../services/assignments";
import { applyAssignments } from "../../services/assignmentWriter";
import { SECTION_ASSIGNMENT, SECTIONS_FOR_ROLE, Section, docIdFor } from "../../data/schema";
import { Member } from "../../services/members";

export const SECCIONES: Array<{ id: Section; label: string }> = [
  { id: "agregados", label: "Agregados" },
  { id: "referidos", label: "Referidos" },
  { id: "prospectos", label: "Prospección" },
  { id: "distribucion", label: "Distribución" },
  { id: "cobranza", label: "Cobranza" },
  { id: "reclutamiento", label: "Reclutamiento" },
];
const ESTADOS_TRABAJO = [["", "Cualquiera"], ["fresh", "Fresco (sin contactar)"], ["worked", "Ya trabajado"], ["recontact", "Recontacto"], ["blocked", "Bloqueado"]];
const MAX_VISIBLES = 400;

// Registros de una sección, con el id del documento que toca escribir.
export function registrosDeSeccion(state: any, section: Section) {
  if (section === "cobranza") {
    return Object.entries(state?.cobranza?.clientesData || {}).map(([k, v]: any) => ({ ...v, id: k, _docId: docIdFor("cobranza", k) }));
  }
  return asList(state?.[section]).map((r: any) => ({ ...r, _docId: String(r?.id ?? "") })).filter((r: any) => r._docId);
}
// Quién puede recibir datos de esta sección (según su rol, no a mano).
export function receptoresPara(members: Member[], section: Section) {
  return members.filter((m) => m.status === "active" && (SECTIONS_FOR_ROLE[m.role] || []).includes(section));
}
const texto = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function coincideBusqueda(r: any, q: string) {
  const s = texto(q).trim();
  if (!s) return true;
  const tel = String(r?.telefono || "").replace(/\D/g, "");
  const qTel = s.replace(/\D/g, "");
  return texto(r?.nombre || r?.anfitrion).includes(s)
    || texto(r?.cuenta || r?.nroCuenta).includes(s)
    || (!!qTel && tel.includes(qTel));
}

export function ManualAssignment({ me, getDB, state, members, notify }: { me: any; getDB: () => Promise<any>; state: any; members: Member[]; notify?: (m: string) => void }) {
  const [section, setSection] = useState<Section>("agregados");
  const [q, setQ] = useState("");
  const [f, setF] = useState<AssignFilters & { workStatus?: string; asignacion?: "" | "sin" | "con" }>({ asignacion: "" });
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [destino, setDestino] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [aceptaReasignar, setAceptaReasignar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState("");

  const cambiaSeccion = (s: Section) => { setSection(s); setSel({}); setDestino(""); setResultado(""); };
  const receptores = receptoresPara(members, section);
  const dest = members.find((m) => m.uid === destino);
  const seccionLabel = SECCIONES.find((s) => s.id === section)!.label;

  const filtrados = useMemo(() => {
    const base: AssignFilters = { ...f, sinAsignar: f.asignacion === "sin", incluirBloqueados: f.workStatus === "blocked" };
    return registrosDeSeccion(state, section)
      .filter((r: any) => matchesFilters(r, base))
      .filter((r: any) => (f.asignacion === "con" ? !!r.assignedTo : true))
      .filter((r: any) => (f.workStatus ? (r.workStatus || "fresh") === f.workStatus : true))
      .filter((r: any) => coincideBusqueda(r, q))
      .sort((a: any, b: any) => lastContactAt(a).localeCompare(lastContactAt(b)));
  }, [state, section, JSON.stringify(f), q]);

  const visibles = filtrados.slice(0, MAX_VISIBLES);
  const marcados = filtrados.filter((r: any) => sel[r._docId]);
  const yaAsignados = marcados.filter((r: any) => r.assignedTo && r.assignedTo !== destino);
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((r: any) => sel[r._docId]);
  const todosMarcados = filtrados.length > 0 && filtrados.every((r: any) => sel[r._docId]);
  // Cartera actual de cada persona: solo para verla. Nadie tiene tope de registros.
  const carteraDe = (uid: string) => SECCIONES.reduce((n, sc) => n + registrosDeSeccion(state, sc.id).filter((r: any) => r.assignedTo === uid && !r.eliminado).length, 0);
  const listo = marcados.length > 0 && !!dest;

  const toggle = (id: string) => setSel((p) => ({ ...p, [id]: !p[id] }));
  const marcarVisibles = () => setSel((p) => { const n = { ...p }; visibles.forEach((r: any) => { n[r._docId] = !todosVisiblesMarcados; }); return n; });
  // Marca TODO lo que cumple los filtros, no solo lo que cabe en pantalla.
  const marcarTodos = () => setSel((p) => { const n = { ...p }; filtrados.forEach((r: any) => { n[r._docId] = !todosMarcados; }); return n; });

  const guardar = async () => {
    setBusy(true); setResultado("");
    const db = await getDB();
    const items = marcados.map((r: any) => ({ id: r._docId, expectedAssignedTo: r.assignedTo ?? null }));
    const r = await applyAssignments(db, me.appId, items, {
      kind: "assign", toUid: dest!.uid, toName: dest!.nombre, type: SECTION_ASSIGNMENT[section],
      allowReassign: aceptaReasignar, via: "manual",
      reason: `asignación manual por ${me.nombre || "administrador"}`,
    }, me.uid);
    setBusy(false); setConfirmar(false); setAceptaReasignar(false);
    const txt = `${r.ok} registros de ${seccionLabel} asignados a ${dest!.nombre}.${r.skipped.length ? ` ${r.skipped.length} sin cambios (${r.skipped[0].error}).` : ""}`;
    setResultado(txt); notify?.(txt);
    setSel({});
  };

  return (
    <div className="space-y-3">
      {/* 1. Sección */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1.5">1 · Base de datos</div>
        <div className="flex flex-wrap gap-2">
          {SECCIONES.map((s) => (
            <button key={s.id} onClick={() => cambiaSeccion(s.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold border ${section === s.id ? "bg-[#111827] text-white border-[#111827]" : "bg-white border-[#E2E8F0] text-[#111827]"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* 2. Buscar y filtrar */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">2 · Buscar y filtrar</div>
        <input className={inpLight} placeholder="Buscar por nombre, teléfono o cuenta" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className={inpLight} value={f.asignacion || ""} onChange={(e) => setF({ ...f, asignacion: e.target.value as any })}>
            <option value="">Asignados y sin asignar</option><option value="sin">Solo sin asignar</option><option value="con">Solo ya asignados</option>
          </select>
          <select className={inpLight} value={f.workStatus || ""} onChange={(e) => setF({ ...f, workStatus: e.target.value })}>
            {ESTADOS_TRABAJO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <input className={inpLight} placeholder="Ciudad" value={f.ciudad || ""} onChange={(e) => setF({ ...f, ciudad: e.target.value })} />
          <input className={inpLight} placeholder="CP" inputMode="numeric" value={f.zip || ""} onChange={(e) => setF({ ...f, zip: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.yaContactados} onChange={(e) => setF({ ...f, yaContactados: e.target.checked })} />Ya contactados</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.sinVenta} onChange={(e) => setF({ ...f, sinVenta: e.target.checked })} />Sin venta</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.diasSinContacto === 30} onChange={(e) => setF({ ...f, diasSinContacto: e.target.checked ? 30 : undefined })} />+30 días sin contacto</label>
          <input className={inpLight + " !w-36"} placeholder="o más de X días" inputMode="numeric" value={f.diasSinContacto || ""} onChange={(e) => setF({ ...f, diasSinContacto: Number(e.target.value) || undefined })} />
        </div>
      </div>

      {/* 3. Selección */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB]">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-[#EEF1F5] flex-wrap">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">3 · Elige los registros</div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#111827]"><b>{marcados.length}</b> marcados de {filtrados.length}</span>
            <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]" onClick={marcarVisibles}>{todosVisiblesMarcados ? "Quitar selección" : "Marcar los visibles"}</button>
            {filtrados.length > visibles.length && <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]" onClick={marcarTodos}>{todosMarcados ? "Quitar todos" : `Marcar los ${filtrados.length}`}</button>}
            {marcados.length > 0 && <button className="text-xs font-bold text-[#667085]" onClick={() => setSel({})}>Limpiar</button>}
          </div>
        </div>
        <div className="max-h-[52vh] overflow-y-auto divide-y divide-[#F3F4F6]">
          {visibles.map((r: any) => {
            const dias = daysSinceContact(r);
            return (
              <label key={r._docId} className="flex items-start gap-3 p-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={!!sel[r._docId]} onChange={() => toggle(r._docId)} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#111827] truncate">{r.nombre || r.anfitrion || "(sin nombre)"}</div>
                  <div className="text-xs text-[#667085] truncate">{[r.telefono, r.ciudad, r.cp, r.cuenta || r.nroCuenta].filter(Boolean).join(" · ")}</div>
                  <div className="text-[11px] text-[#94A3B8]">
                    {dias === null ? "nunca contactado" : `${dias} días sin contacto`}{r.venta ? " · con venta" : ""}
                  </div>
                </div>
                {r.assignedTo
                  ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 text-amber-700 bg-amber-50 border-amber-200">{r.assignedToName || "asignado"}</span>
                  : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 text-slate-500 bg-slate-50 border-slate-200">libre</span>}
              </label>
            );
          })}
          {!visibles.length && <div className="p-6 text-center text-sm text-[#94A3B8]">Ningún registro cumple estos filtros.</div>}
        </div>
        {filtrados.length > MAX_VISIBLES && (
          <div className="p-2 text-center text-[11px] text-[#94A3B8] border-t border-[#EEF1F5]">Mostrando {MAX_VISIBLES} de {filtrados.length}. Afina los filtros para ver el resto.</div>
        )}
      </div>

      {/* 4. Receptor */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">4 · ¿Para quién?</div>
        <select className={inpLight} value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Elige a la persona…</option>
          {receptores.map((m) => <option key={m.uid} value={m.uid}>{m.nombre} — ya tiene {carteraDe(m.uid)}</option>)}
        </select>
        {!receptores.length && <div className="text-xs text-amber-700 font-bold">Nadie en esta app tiene un rol que trabaje {seccionLabel}.</div>}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="text-sm text-[#111827]">{marcados.length} registros seleccionados de {seccionLabel}{dest ? ` → ${dest.nombre}` : ""}</div>
          <PrimaryBtn disabled={!listo || busy} onClick={() => { setAceptaReasignar(false); setConfirmar(true); }}>Revisar y asignar</PrimaryBtn>
        </div>
        {resultado && <div className="text-sm font-bold rounded-xl px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200">{resultado}</div>}
      </div>

      {confirmar && dest && (
        <Modal title="Confirmar asignación manual" onClose={() => !busy && setConfirmar(false)}>
          <div className="text-base font-bold text-[#111827] mb-2">{marcados.length} registros seleccionados de {seccionLabel} → {dest.nombre}.</div>
          <div className="text-sm text-[#667085] mb-3">Se suman a los {carteraDe(dest.uid)} que {dest.nombre} ya tiene: no se le retira nada. Solo cambia el responsable de los marcados. Notas, mensajes, historial de llamadas, citas y seguimientos se conservan tal cual, y el cambio queda en el historial de asignaciones.</div>
          {yaAsignados.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-3">
              <div className="text-sm font-bold text-amber-800 mb-1">{yaAsignados.length} ya tienen responsable</div>
              <div className="text-xs text-amber-800 mb-2">
                {[...new Set(yaAsignados.map((r: any) => r.assignedToName || "sin nombre"))].slice(0, 4).join(", ")}
                {yaAsignados.length > 4 ? "…" : ""}. Si no lo confirmas, esos registros no se tocan.
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <input type="checkbox" checked={aceptaReasignar} onChange={(e) => setAceptaReasignar(e.target.checked)} />
                Sí, quitárselos y pasárselos a {dest.nombre}
              </label>
            </div>
          )}
          <PrimaryBtn full disabled={busy} onClick={guardar}>
            {busy ? "Asignando…" : yaAsignados.length && !aceptaReasignar ? `Asignar solo los ${marcados.length - yaAsignados.length} libres` : `Asignar ${marcados.length}`}
          </PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}
