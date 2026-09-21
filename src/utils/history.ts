import { ACCESS_V2 } from "../config/flags";
import { asList } from "../services/assignments";
export function claveHist(h){ return h && (h.id || ((h.fecha||"") + "|" + (h.notas||"") + "|" + (h.tipo||""))); }
// Modo v2: el historial puede venir como mapa {id: entrada}. Producción: igual que siempre.
const lista = ACCESS_V2 ? asList : (v)=> v || [];
export function unirHistorial(a, b){
  const vistos = new Set(); const out = [];
  [...lista(a), ...lista(b)].forEach(h=>{
    const k = claveHist(h); if(!h || !k || vistos.has(k)) return;
    vistos.add(k); out.push(h);
  });
  out.sort((x,y)=>String(x.fecha||"").localeCompare(String(y.fecha||"")));
  return out;
}
