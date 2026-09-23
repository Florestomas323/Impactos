// ═══ Equipo → Distribución de datos ════════════════════════════════════════
// Asignar, retirar y reasignar registros. Todo pasa por applyAssignments():
// transacción + solo campos de asignación. Notas, mensajes, historial,
// llamadas, citas y seguimientos no se tocan nunca.
import { useMemo, useState } from "react";
import { Modal, Field, PrimaryBtn, inpLight } from "../primitives";
import { selectForAssignment, AssignFilters } from "../../services/assignments";
import { applyAssignments } from "../../services/assignmentWriter";
import { roleForAssignmentType, AssignmentType } from "../../auth/roles";
import { docIdFor } from "../../data/schema";
import { useTeam } from "../../services/members";
import { WorkloadTable } from "./WorkloadTable";
import { ManualAssignment } from "./ManualAssignment";

const TABS: Array<{ id: AssignmentType; label: string; bases: Array<{ id: string; label: string }> }> = [
  { id: "ventas", label: "Ventas", bases: [{ id: "agregados", label: "Agregados" }, { id: "prospectos", label: "Prospección" }, { id: "referidos", label: "Referidos" }] },
  { id: "cobranza", label: "Cobranza", bases: [{ id: "cobranza", label: "Cuentas de cobranza" }, { id: "distribucion", label: "Clientes de Distribución" }] },
  { id: "reclutamiento", label: "Reclutamiento", bases: [{ id: "reclutamiento", label: "Prospectos de reclutamiento" }] },
];
// Mismos estados que usa ImpactOS (App.tsx).
const ESTADOS = [["", "Cualquier estado"], ["sin_estado", "Sin estado"], ["naranja", "Pendiente / Seguimiento"], ["buzon", "Buzón de voz"], ["azul", "Llamar en las tardes"], ["morado", "Solo mañanas"], ["amarillo", "Solo fines de semana"], ["verde", "Cita agendada"], ["rojo", "No interesado / No califica"], ["magenta", "Archivar (no descartar)"]];

type Mode = "assign" | "unassign" | "reassign";

export function AssignmentManager({ me, getDB, state, notify }: { me: any; getDB: () => Promise<any>; state: any; notify?: (m: string) => void }) {
  const { members } = useTeam(getDB, me, me.appId);
  const [modo, setModo] = useState<"automatica" | "manual">("automatica");
  const [tab, setTab] = useState<AssignmentType>("ventas");
  const [base, setBase] = useState("agregados");
  const [mode, setMode] = useState<Mode>("assign");
  const [destino, setDestino] = useState("");
  const [origen, setOrigen] = useState("");
  const [cantidad, setCantidad] = useState(100);
  const [f, setF] = useState<AssignFilters>({ sinAsignar: true });
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState("");

  const cfg = TABS.find((t) => t.id === tab)!;
  const tms = members.filter((m) => m.role === roleForAssignmentType(tab) && m.status === "active");
  const todosTm = members.filter((m) => String(m.role).startsWith("telemarketing_"));

  // Registros de la base elegida (cobranza viene como mapa clientesData).
  const registros = useMemo(() => {
    if (base === "cobranza") return Object.entries(state?.cobranza?.clientesData || {}).map(([k, v]: any) => ({ ...v, id: k, _docId: docIdFor("cobranza", k) }));
    return (Array.isArray(state?.[base]) ? state[base] : []).map((r: any) => ({ ...r, _docId: String(r.id) }));
  }, [state, base]);
  const todos = useMemo(() => [
    ...["agregados", "referidos", "prospectos", "distribucion", "reclutamiento"].flatMap((k) => (Array.isArray(state?.[k]) ? state[k] : [])),
    ...Object.values(state?.cobranza?.clientesData || {}),
  ], [state]);

  const filtros: AssignFilters = mode === "assign" ? f : { ...f, sinAsignar: false, deUsuario: origen || "__nadie__" };
  const disponibles = useMemo(() => selectForAssignment(registros, filtros, 0), [registros, JSON.stringify(filtros)]);
  const seleccion = disponibles.slice(0, Math.max(0, cantidad));
  const dest = members.find((m) => m.uid === destino);
  const orig = members.find((m) => m.uid === origen);
  const listo = seleccion.length > 0 && (mode === "unassign" ? !!orig : !!dest) && (mode !== "reassign" || (!!orig && origen !== destino));

  const frase = mode === "assign" ? `Se asignarán ${seleccion.length} registros a ${dest?.nombre || "—"}.`
    : mode === "unassign" ? `Se retirarán ${seleccion.length} registros a ${orig?.nombre || "—"}. Quedan sin asignar y conservan todo su historial.`
    : `Se reasignarán ${seleccion.length} registros de ${orig?.nombre || "—"} a ${dest?.nombre || "—"}.`;

  const ejecutar = async () => {
    setBusy(true); setResultado("");
    const db = await getDB();
    // Cobranza: la cuenta y su cliente de Distribución van juntos a la misma persona.
    const items: Array<{ id: string; expectedAssignedTo: string | null }> = [];
    seleccion.forEach((r: any) => {
      items.push({ id: r._docId, expectedAssignedTo: r.assignedTo ?? null });
      if (base === "cobranza" && r.linkedRecordId) {
        const d = (state?.distribucion || []).find((x: any) => String(x.id) === String(r.linkedRecordId));
        if (d && (mode !== "assign" || !d.assignedTo)) items.push({ id: String(d.id), expectedAssignedTo: d.assignedTo ?? null });
      }
    });
    const action = mode === "unassign"
      ? { kind: "unassign" as const, reason: "retirado por " + (me.nombre || "supervisor") }
      : { kind: "assign" as const, toUid: dest!.uid, toName: dest!.nombre, type: tab, allowReassign: mode === "reassign", reason: mode === "reassign" ? "reasignación" : "asignación" };
    const r = await applyAssignments(db, me.appId, items, action, me.uid);
    setBusy(false); setConfirmar(false);
    const txt = `${r.ok} registros actualizados.${r.skipped.length ? ` ${r.skipped.length} no se tocaron (${r.skipped[0].error}${r.skipped.length > 1 ? "…" : ""}).` : ""}`;
    setResultado(txt); notify?.(txt);
  };

  const chk = (k: keyof AssignFilters, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{label}</label>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#111827]">Distribución de datos</h1>
        <div className="text-sm text-[#667085]">Automática: reparte por filtros. Manual: eliges tú cada registro. Un registro tiene como máximo un responsable, y reasignar nunca borra notas ni historial.</div>
      </div>

      {/* Dos formas de repartir: por filtros (automática) o marcando registros (manual). */}
      <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-white p-1">
        {([["automatica", "Automática"], ["manual", "Manual"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setModo(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold ${modo === id ? "bg-[#2563EB] text-white" : "text-[#667085]"}`}>{label}</button>
        ))}
      </div>

      {modo === "manual" && <ManualAssignment me={me} getDB={getDB} state={state} members={members as any} notify={notify} />}

      {modo === "automatica" && (<>
      <div className="flex gap-2">
        {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setBase(t.bases[0].id); setDestino(""); setOrigen(""); }}
          className={`px-4 py-2 rounded-xl text-sm font-bold border ${tab === t.id ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-white border-[#E2E8F0] text-[#111827]"}`}>{t.label}</button>)}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Acción"><select className={inpLight} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="assign">Asignar datos</option><option value="reassign">Reasignar de una persona a otra</option><option value="unassign">Retirar datos</option>
          </select></Field>
          <Field label="Base"><select className={inpLight} value={base} onChange={(e) => setBase(e.target.value)}>{cfg.bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>
          <Field label="Cantidad"><input className={inpLight} type="number" min={1} max={5000} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {mode !== "assign" && <Field label="De"><select className={inpLight} value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">Elige…</option>{todosTm.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}{m.status !== "active" ? ` (${m.status})` : ""}</option>)}
          </select></Field>}
          {mode !== "unassign" && <Field label="Para"><select className={inpLight} value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Elige…</option>{tms.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
          </select></Field>}
        </div>
        {mode !== "unassign" && !tms.length && <div className="text-xs text-amber-700 font-bold">No hay telemarketing de {cfg.label} activo en esta app.</div>}

        <div className="border-t border-[#EEF1F5] pt-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-2">Filtros</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {mode === "assign" && chk("sinAsignar", "Sin asignar")}
            {chk("frescos", "Datos frescos")}
            {chk("yaContactados", "Ya contactados")}
            {chk("noContesto", "No contestó (buzón)")}
            {chk("seguimientoVencido", "Seguimiento vencido")}
            {chk("sinVenta", "Sin venta")}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            <input className={inpLight} placeholder="Días sin contacto >" inputMode="numeric" value={f.diasSinContacto || ""} onChange={(e) => setF({ ...f, diasSinContacto: Number(e.target.value) || undefined })} />
            <input className={inpLight} placeholder="Ciudad" value={f.ciudad || ""} onChange={(e) => setF({ ...f, ciudad: e.target.value })} />
            <input className={inpLight} placeholder="ZIP" inputMode="numeric" value={f.zip || ""} onChange={(e) => setF({ ...f, zip: e.target.value })} />
            <input className={inpLight} placeholder="Fuente / campaña" value={f.fuente || ""} onChange={(e) => setF({ ...f, fuente: e.target.value })} />
            <select className={inpLight} value={f.estado || ""} onChange={(e) => setF({ ...f, estado: e.target.value || undefined })}>{ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-[#EEF1F5] pt-3">
          <div className="text-sm text-[#111827]"><b>{disponibles.length}</b> registros cumplen · se tomarán <b>{seleccion.length}</b> (los que llevan más tiempo sin contacto primero)</div>
          <PrimaryBtn disabled={!listo || busy} onClick={() => setConfirmar(true)}>Revisar y confirmar</PrimaryBtn>
        </div>
        {resultado && <div className="text-sm font-bold rounded-xl px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200">{resultado}</div>}
      </div>

      </>)}

      <div>
        <div className="text-base font-bold text-[#111827] mb-2">Carga de trabajo</div>
        <WorkloadTable team={members as any} records={todos} appts={state?.appts || []} />
      </div>

      {confirmar && <Modal title="Confirmar" onClose={() => !busy && setConfirmar(false)}>
        <div className="text-base font-bold text-[#111827] mb-2">{frase}</div>
        <div className="text-sm text-[#667085] mb-4">Solo cambia el responsable. Notas, mensajes, historial, llamadas, citas y seguimientos se conservan tal cual. Queda registrado en el historial de asignaciones.{base === "cobranza" ? " En Cobranza, el cliente de Distribución enlazado va con su cuenta." : ""}</div>
        <PrimaryBtn full disabled={busy} onClick={ejecutar}>{busy ? "Aplicando…" : "Confirmar"}</PrimaryBtn>
      </Modal>}
    </div>
  );
}
