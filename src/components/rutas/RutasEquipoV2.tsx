// ═══ Rutas del equipo — solo lectura para staff (v2) ═══════════════════════
// Las rutas que cada telemarketing arma con SUS clientes viven en su userData.
// El staff ya puede leer esos documentos (Rules); aquí solo se muestran.
// Un telemarketing nunca recibe el userData de otra persona, así que para él
// esta lista llega vacía por construcción y el componente no se pinta.
const fecha = (s: string) => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-"); return d ? `${Number(d)}/${Number(m)}/${y}` : s; };
// El catálogo de estados llega de App.tsx (ESTADO_RUTA): no se duplica aquí.
export function RutasEquipoV2({ rutas, estados }: { rutas: any[]; estados: Record<string, { label: string; bg?: string; color?: string }> }) {
  if (!rutas?.length) return null;
  const lista = [...rutas].sort((a, b) => String(b.fechaRuta || b.creado || "").localeCompare(String(a.fechaRuta || a.creado || "")));
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-extrabold text-[#111827]">Rutas del equipo</h2>
        <span className="text-xs text-[#667085]">Solo lectura · creadas por telemarketing</span>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
        {lista.map((r) => {
          // Solo metadatos de la ruta (sin datos de clientes): total original de paradas.
          const n = typeof r.totalParadas === "number" ? r.totalParadas : Array.isArray(r.paradas) ? r.paradas.length : 0;
          const zona = [...(r.zonas?.ciudades || [r.ciudad].filter(Boolean)), ...(r.zonas?.cps || [r.codigoPostal].filter(Boolean))].join(" · ");
          return (
            <div key={`${r._deUid}:${r.id}`} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-[#111827] truncate">{r.nombreRuta || "Ruta sin nombre"}</div>
                <div className="text-xs text-[#667085] truncate">{r.createdByName || "—"} · {fecha(r.fechaRuta || r.creado)} · {n} parada{n !== 1 ? "s" : ""}{zona ? ` · ${zona}` : ""}</div>
              </div>
              {(() => { const e = estados[r.estadoRuta] || estados.pendiente || { label: r.estadoRuta || "Pendiente" }; return (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: e.bg || "#F1F5F9", color: e.color || "#475569" }}>{e.label}</span>); })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}
