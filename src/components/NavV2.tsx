// ═══ MENÚ LATERAL — ImpactOS v2 ═══════════════════════════════════════════
// Solo reorganiza la navegación en grupos desplegables. Las pestañas, sus ids
// y los permisos son los MISMOS de siempre: cada botón llama a go(id) y cada
// item se muestra solo si canSee(id). Producción (ACCESS_V2 apagado) sigue
// usando el menú anterior.
import { useEffect, useState } from "react";
import { Ico } from "../iconos";

type Item = { id: string; icon: string; label: string };
type Props = {
  nav: Item[];                      // NAV_ALL de App.tsx (ids y etiquetas reales)
  dbTabs: string[];                 // agregados, referidos, prospectos, distribucion
  tab: string;
  go: (id: string) => void;         // cambia de pestaña y cierra el menú en móvil
  canSee: (id: string) => boolean;  // permisos: canTab + regla de incentivos
  total: number;                    // total de registros (Clientes y prospectos)
  pendientes: number;
  citas: number;
};

// Grupos y su orden. Lo que no esté listado aquí cae en "Operación" para no perder nada.
const FIJOS = { resumen: ["inicio"], operacion: ["llamadas", "agenda", "servicio"] };
const GRUPOS = [
  { key: "base", label: "Base de datos", ids: ["__clientes__", "asignaciones"] },
  { key: "gestion", label: "Gestión", ids: ["reclutamiento", "cobranza", "catalogo", "simulador", "rutas", "cumpleanos"] },
  { key: "sistema", label: "Sistema", ids: ["usuarios", "incentivo", "control", "stats", "config"] },
] as const;
const MEMORIA = "impactos_nav_v2";

function leerMemoria(): Record<string, boolean> {
  try { return JSON.parse(sessionStorage.getItem(MEMORIA) || "{}") || {}; } catch { return {}; }
}

export function NavV2({ nav, dbTabs, tab, go, canSee, total, pendientes, citas }: Props) {
  const porId = Object.fromEntries(nav.map((n) => [n.id, n]));
  const visibles = (ids: readonly string[]) => ids.filter((id) => id === "__clientes__" ? dbTabs.some(canSee) : !!porId[id] && canSee(id));
  const grupoDe = (id: string) => (dbTabs.includes(id) ? "base" : GRUPOS.find((g) => (g.ids as readonly string[]).includes(id))?.key);
  const listados = new Set<string>([...FIJOS.resumen, ...FIJOS.operacion, ...dbTabs, ...GRUPOS.flatMap((g) => g.ids as readonly string[])]);
  const sueltos = nav.map((n) => n.id).filter((id) => !listados.has(id));

  // Estado abierto/cerrado: se recuerda mientras navegas (sesión del navegador).
  const [abierto, setAbierto] = useState<Record<string, boolean>>(() => ({ base: true, ...leerMemoria() }));
  const [clientesAbierto, setClientesAbierto] = useState<boolean>(() => leerMemoria().__clientes__ ?? dbTabs.includes(tab));
  useEffect(() => { try { sessionStorage.setItem(MEMORIA, JSON.stringify({ ...abierto, __clientes__: clientesAbierto })); } catch {} }, [abierto, clientesAbierto]);
  // Al llegar a una pestaña (desde el menú o desde otra pantalla), su grupo se abre.
  useEffect(() => {
    const g = grupoDe(tab);
    if (g) setAbierto((p) => (p[g] ? p : { ...p, [g]: true }));
    if (dbTabs.includes(tab)) setClientesAbierto(true);
  }, [tab]);

  const titulo = (t: string) => <div className="px-2 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#667085]">{t}</div>;

  const boton = (n: Item) => (
    <button key={n.id} onClick={() => go(n.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold mb-1 transition ${tab === n.id ? "text-white bg-[#172033] shadow-sm" : "text-[#A8B0BF] hover:bg-white/[0.055] hover:text-white"}`}>
      <span className="w-5 flex items-center justify-center"><Ico e={n.icon} size={16} /></span>
      <span className="truncate">{n.label}</span>
      {n.id === "llamadas" && pendientes > 0 && <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-bold ${tab === n.id ? "bg-[#2563EB] text-white" : "bg-white/[0.07] text-[#A8B0BF]"}`}>{pendientes}</span>}
      {n.id === "agenda" && citas > 0 && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-[#123B2B] text-[#6EE7B7]">{citas}</span>}
    </button>
  );

  const clientes = () => {
    const activo = dbTabs.includes(tab);
    return (
      <div key="__clientes__" className="mb-1">
        <button onClick={() => setClientesAbierto((o) => !o)} aria-expanded={clientesAbierto}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition ${activo ? "text-white bg-[#172033] shadow-sm" : "text-[#A8B0BF] hover:bg-white/[0.055] hover:text-white"}`}>
          <span className="w-5 flex items-center justify-center"><Ico e="🗄" size={16} /></span>
          <span className="truncate">Clientes y prospectos</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${activo ? "bg-white/10 text-white" : "bg-white/[0.06] text-[#8892A4]"}`}>{total}</span>
            <span className={`text-[10px] transition-transform duration-200 ${clientesAbierto ? "rotate-180" : ""}`}>⌄</span>
          </span>
        </button>
        {clientesAbierto && (
          <div className="mt-1.5 ml-4 pl-2 border-l border-white/[0.08] space-y-1">
            {dbTabs.filter(canSee).map((id) => porId[id] && (
              <button key={id} onClick={() => go(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition ${tab === id ? "text-white bg-[#1E2B43]" : "text-[#8F9AAD] hover:bg-white/[0.05] hover:text-white"}`}>
                <Ico e={porId[id].icon} size={14} />{porId[id].label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const resumen = visibles(FIJOS.resumen);
  const operacion = [...visibles(FIJOS.operacion), ...sueltos.filter(canSee)];

  return (
    <nav aria-label="Menú principal">
      {resumen.length > 0 && <>{titulo("Resumen")}{resumen.map((id) => boton(porId[id]))}</>}
      {operacion.length > 0 && <>{titulo("Operación")}{operacion.map((id) => boton(porId[id]))}</>}
      {GRUPOS.map((g) => {
        const ids = visibles(g.ids);
        if (!ids.length) return null;
        const open = !!abierto[g.key];
        const contieneActiva = ids.some((id) => (id === "__clientes__" ? dbTabs.includes(tab) : id === tab));
        return (
          <div key={g.key} className="mt-1">
            <button onClick={() => setAbierto((p) => ({ ...p, [g.key]: !p[g.key] }))} aria-expanded={open}
              className={`w-full flex items-center px-2 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${contieneActiva && !open ? "text-white" : "text-[#667085] hover:text-[#A8B0BF]"}`}>
              <span>{g.label}</span>
              {contieneActiva && !open && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-[#A07CFF]" aria-label="sección activa" />}
              <span className={`ml-auto text-[11px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {open && <div>{ids.map((id) => (id === "__clientes__" ? clientes() : boton(porId[id])))}</div>}
          </div>
        );
      })}
    </nav>
  );
}
