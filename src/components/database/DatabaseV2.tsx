// ═══ BASE DE DATOS v2 — montaje e interfaz (la lógica vive en services/databaseV2.ts) ═══
// DatabaseV2 es lo que App monta en V2 para Agregados / Referidos / Prospectos / Distribución.
// Reutiliza la lista y la tarjeta legacy (DBSection + ClientRow) pasándoles una configuración
// v2 (autor, acciones por rol, venta → Distribución, paginación, duplicados como aviso).
// Legacy monta DBSection sin esa configuración: idéntico a siempre.
import { useMemo } from "react";
import { PAGINA_DB, textoDuplicado, type Duplicado } from "../../services/databaseV2";

type Props = {
  Base: any;                 // DBSection (vive en App.tsx; se recibe como prop para no crear importaciones circulares)
  baseProps: any;            // las props que legacy también pasa a DBSection
  v2User: any;               // { uid, nombre, role }
  can: (permiso: string) => boolean;
  onVenta: (venta: any) => void;   // Venta → Distribución (mismo camino que Agenda y Servicio)
  // Venta/corrección desde la TARJETA: registro de origen + Distribución en UNA transición de estado.
  ventaAtomica: (seccion: string, recordId: any, aplicar: (r: any) => any, evento: any) => any;
};
export function DatabaseV2({ Base, baseProps, v2User, can, onVenta, ventaAtomica }: Props) {
  const v2 = useMemo(() => ({
    autor: { uid: v2User.uid, nombre: v2User.nombre },
    actor: { uid: v2User.uid, role: v2User.role, can },
    onVenta, ventaAtomica, pagina: PAGINA_DB,
  }), [v2User?.uid, v2User?.nombre, v2User?.role, can, onVenta, ventaAtomica]);
  return <Base {...baseProps} v2={v2} />;
}

// Dato que se muestra junto al motivo del duplicado: el que COINCIDIÓ (no siempre el teléfono).
//   cuenta → cuenta · telefono → teléfono · origen → id del registro de origen · nombre_direccion → dirección
const lleno = (v: any) => v !== undefined && v !== null && String(v).trim() !== "";
export function valorDuplicado(d: Duplicado): string {
  const e: any = d?.existente || {};
  const primero = (...vs: any[]) => { const v = vs.find(lleno); return v === undefined ? "" : String(v).trim(); };
  switch (d?.motivo) {
    case "cuenta": return primero(e.cuenta, e.numeroCuenta, e.anfitrion_cuenta);
    case "telefono": return primero(e.telefono, e.anfitrion_telefono, e.telefonoMovil, e.telefonoCasa, e.telefonoTrabajo, e.tel);
    case "origen": return lleno(e.sourceRecordId) ? `origen ${e.sourceRecordId}${lleno(e.sourceRefIndex) ? ` · referido ${e.sourceRefIndex}` : ""}` : "";
    case "nombre_direccion": return primero(e.direccion, e.anfitrion_direccion);
    default: return "";
  }
}

// Aviso de posible duplicado al dar de alta (nunca bloquea, nunca fusiona).
export function AvisoDuplicadoDB({ duplicados, onVolver, onGuardar }: { duplicados: Duplicado[]; onVolver: () => void; onGuardar: () => void }) {
  return (
    <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-sm text-amber-900 space-y-3">
      <div className="font-black">Ya existe un registro parecido.</div>
      <ul className="space-y-1.5 text-[13px]">
        {duplicados.map((d, i) => (
          <li key={i} className="flex gap-2">
            <span>{d.fuerte ? "⚠️" : "ℹ️"}</span>
            <span>{textoDuplicado(d)}{valorDuplicado(d) ? <span className="text-amber-700"> · {valorDuplicado(d)}</span> : null}</span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-amber-700">No se fusiona ni se borra nada. Puedes volver a revisar o guardar de todos modos.</div>
      <div className="flex gap-2">
        <button onClick={onVolver} className="flex-1 text-sm font-bold py-2.5 rounded-lg bg-white border border-amber-300 text-slate-700">Volver</button>
        <button onClick={onGuardar} className="flex-1 text-sm font-bold py-2.5 rounded-lg text-white" style={{ background: "#d97706" }}>Guardar de todos modos</button>
      </div>
    </div>
  );
}

// "Ver más" de la paginación en memoria (30 + 30 …). El contador muestra el TOTAL filtrado.
export function VerMasDB({ pag, onMas }: { pag: { total: number; visibles: number; hayMas: boolean; restantes: number }; onMas: () => void }) {
  if (pag.total === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="text-xs text-slate-500">Mostrando <b>{pag.visibles}</b> de <b>{pag.total}</b> registro(s)</div>
      {pag.hayMas && (
        <button onClick={onMas} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
          Ver más ({Math.min(PAGINA_DB, pag.restantes)} de {pag.restantes} restantes)
        </button>
      )}
    </div>
  );
}
