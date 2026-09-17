export function claveHist(h){ return h && (h.id || ((h.fecha||"") + "|" + (h.notas||"") + "|" + (h.tipo||""))); }
export function unirHistorial(a, b){
  const vistos = new Set(); const out = [];
  [...(a||[]), ...(b||[])].forEach(h=>{
    const k = claveHist(h); if(!h || !k || vistos.has(k)) return;
    vistos.add(k); out.push(h);
  });
  out.sort((x,y)=>String(x.fecha||"").localeCompare(String(y.fecha||"")));
  return out;
}
