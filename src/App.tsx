import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Ico, Msg, sinEmoji } from "./iconos";
import * as LU from "lucide-react";
import { RP, SERIF, SANS } from "./theme";
import { inpLight, PrimaryBtn, Modal, Field } from "./components/primitives";
import { ROLES_APP, normalizarRol, PERMISOS_ROL, puedeVerTabRol, puedeExportarRol, puedeCrearIncentivosRol } from "./auth/permissions";
import { CUENTA_ROOT, CUENTA_ROOT_DATOS, SEMILLA_CUENTAS, CUENTAS_DINAMICAS, setCuentasDinamicas, todasLasCuentas, cuentaAutorizada, cuentaDeEmail } from "./auth/accounts";
import { unirHistorial } from "./utils/history";
import { genId } from "./utils/ids";
import { CobranzaSection } from "./modules/collections/CobranzaSection";
import { BuscadorCodigos, SimuladorCompra } from "./modules/catalog/CatalogModule";

// ═══════════════════════════════════════════════════════════════
//  IMPACT OS — DARK PREMIUM PALETTE
//  Sistema visual centralizado: cambiar aquí re-estiliza toda la app.
//  Se mantienen las mismas claves (RP.*) para no tocar miles de usos.
// ═══════════════════════════════════════════════════════════════
// ─── FIREBASE CONFIG ──────────────────────────────────────────
// Proyecto: actividad-royal-prestige (tu Firebase existente)
// Colección exclusiva — no toca tu app de actividad anterior
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAbUP9Atr0yVJ14vrpZwoDBxyZyT5B0pRw",
  authDomain:        "actividad-royal-prestige.firebaseapp.com",
  projectId:         "actividad-royal-prestige",
  storageBucket:     "actividad-royal-prestige.firebasestorage.app",
  messagingSenderId: "281689379769",
  appId:             "1:281689379769:web:f72a8b0f8e03b6b69d5c68",
};
const FIRESTORE_DOC = "crm_telemarketing/state"; // documento LEGADO — queda intacto como respaldo, solo se lee para migrar
const FIRESTORE_COL = "crm_telemarketing";

// ── PARTICIÓN POR SECCIONES (límite de Firestore: 1 MB por documento) ──
// Cada sección grande vive en su propio documento → cada una tiene su propio 1 MB.
// Todo lo demás (callLog, config, incentivos, etc.) va junto en "sec_misc".
const SECCIONES_DOC = ["agregados","referidos","prospectos","distribucion","appts","cobranza","reclutamiento"];
const DOC_MISC = "sec_misc";

// ── FRAGMENTACIÓN 5x: las bases de datos pesadas se reparten en 5 documentos ──
// cada una (5 MB de capacidad por base). appts y reclutamiento siguen en 1 doc.
const SECCIONES_5 = ["agregados","referidos","prospectos","distribucion","cobranza","docsSocios","appts"];
const SECCIONES_1 = ["reclutamiento"];
const N_FRAG = 5;

// Divide un arreglo en N_FRAG tramos contiguos.
function fragArray(arr){
  const a = Array.isArray(arr) ? arr : [];
  const tam = Math.ceil(a.length / N_FRAG) || 0;
  const out = [];
  for(let i=0;i<N_FRAG;i++) out.push(tam ? a.slice(i*tam, (i+1)*tam) : []);
  return out;
}
// Divide las entradas de un objeto (claves ordenadas) en N_FRAG tramos.
function fragObjeto(obj){
  const claves = Object.keys(obj||{}).sort();
  const tam = Math.ceil(claves.length / N_FRAG) || 0;
  const out = [];
  for(let i=0;i<N_FRAG;i++){
    const o = {};
    (tam ? claves.slice(i*tam,(i+1)*tam) : []).forEach(k=>{ o[k]=obj[k]; });
    out.push(o);
  }
  return out;
}

// Reparte el estado completo en documentos fragmentados. GENÉRICO sobre las
// claves: ninguna clave del estado puede perderse.
// ── Caché local en IndexedDB: guarda el estado COMPLETO sin el límite de 5 MB
// de localStorage (que se llenó en silencio y dejaba el caché congelado). ──
const idbCache = {
  _db: null,
  _abrir(){
    return new Promise(res => {
      try {
        const rq = indexedDB.open("crm_cache", 1);
        rq.onupgradeneeded = () => { try { rq.result.createObjectStore("kv"); } catch {} };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      } catch { res(null); }
    });
  },
  async get(k){
    try {
      const d = this._db || (this._db = await this._abrir());
      if(!d) return null;
      return await new Promise(res => {
        try {
          const rq = d.transaction("kv","readonly").objectStore("kv").get(k);
          rq.onsuccess = () => res(rq.result ?? null);
          rq.onerror = () => res(null);
        } catch { res(null); }
      });
    } catch { return null; }
  },
  async set(k, v){
    try {
      const d = this._db || (this._db = await this._abrir());
      if(!d) return;
      d.transaction("kv","readwrite").objectStore("kv").put(v, k);
    } catch {}
  }
};
function partirEstado(estado){
  const docs = {};
  const misc = {};
  Object.keys(estado || {}).forEach(k => {
    if(k === "cobranza"){
      // cobranza: los clientes (clientesData) se fragmentan; el resto (cfg,
      // meses, reportesFin, recurrentes…) viaja en el fragmento _1.
      const cb = estado.cobranza || {};
      const resto = {};
      Object.keys(cb).forEach(kk => { if(kk !== "clientesData") resto[kk] = cb[kk]; });
      const tieneCD = Object.prototype.hasOwnProperty.call(cb, "clientesData");
      const frags = fragObjeto(cb.clientesData || {});
      for(let i=0;i<N_FRAG;i++){
        const base = i===0 ? { ...resto } : {};
        if(tieneCD) base.clientesData = frags[i];
        docs["sec_cobranza_"+(i+1)] = base;
      }
    } else if(SECCIONES_5.includes(k)){
      const frags = Array.isArray(estado[k]) ? fragArray(estado[k]) : fragObjeto(estado[k]);
      for(let i=0;i<N_FRAG;i++) docs["sec_"+k+"_"+(i+1)] = frags[i];
    } else if(SECCIONES_1.includes(k)){
      docs["sec_" + k] = estado[k];
    } else {
      misc[k] = estado[k];
    }
  });
  docs[DOC_MISC] = misc;
  return docs;
}
// Une los documentos fragmentados de vuelta en un solo estado.
function unirDocs(mapa){
  const estado = { ...(mapa[DOC_MISC] || {}) };
  SECCIONES_1.forEach(s => { if(mapa["sec_" + s] !== undefined) estado[s] = mapa["sec_" + s]; });
  SECCIONES_5.forEach(s => {
    const frags = [];
    for(let i=1;i<=N_FRAG;i++) if(mapa["sec_"+s+"_"+i] !== undefined) frags.push(mapa["sec_"+s+"_"+i]);
    if(!frags.length) return;
    if(s === "cobranza"){
      const cb = {}; const clientes = {}; let tuvoCD = false;
      frags.forEach((f,ix) => {
        Object.keys(f||{}).forEach(kk => {
          if(kk === "clientesData"){ tuvoCD = true; Object.assign(clientes, f[kk] || {}); }
          else if(ix === 0) cb[kk] = f[kk];
        });
      });
      if(tuvoCD) cb.clientesData = clientes;
      estado.cobranza = cb;
    } else if(frags.every(f => Array.isArray(f))){
      estado[s] = [].concat(...frags);
    } else {
      estado[s] = Object.assign({}, ...frags);
    }
  });
  return estado;
}

// ══ DÍA LOCAL (Texas), no UTC ════════════════════════════════════════════════
// ANTES: "hoy" se calculaba con toISOString() = día UTC. Entre las ~6pm y
// medianoche de Texas, UTC ya va en "mañana": una llamada de las 7:30pm caía
// en el contador del día siguiente. Estos helpers usan la hora del teléfono.
function fmtDiaLocal(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function hoyLocal(){ return fmtDiaLocal(new Date()); }
// Convierte un timestamp ISO (guardado en UTC) al DÍA local que le corresponde.
// Fechas sin hora ("2026-07-14") pasan tal cual.
function diaLocal(iso){
  const s = String(iso||"");
  if(!s) return "";
  if(!s.includes("T")) return s.slice(0,10);
  const d = new Date(s);
  return isNaN(d) ? s.slice(0,10) : fmtDiaLocal(d);
}

// ── callLog cooperativo: {fecha:{agente:n}} con compatibilidad legada (números) ──
// Cada agente incrementa SOLO su propia clave desde su dispositivo, y al recibir
// de Firebase se fusiona tomando el MÁXIMO por (fecha, agente): una escritura
// vieja de otro dispositivo ya no puede borrar las llamadas de nadie.
function clObj(v){ return (v && typeof v === "object" && !Array.isArray(v)) ? v : (v ? { Equipo: +v || 0 } : {}); }
function sumDia(v){ const o = clObj(v); return Object.values(o).reduce((a,b)=>a+(+b||0),0); }

// ══ CONTEO ÚNICO DE LLAMADAS — una sola fuente de verdad ═════════════════════
// ANTES: el panel principal leía SOLO callLog (que únicamente subía al tocar el
// botón 📞 y elegir app), mientras que la pestaña Llamadas contaba el historial
// de los clientes (registrar resultado / cambiar estado). Resultado: el panel
// mostraba 0 aunque la telemarketing tuviera 32 llamadas registradas.
// AHORA: ambos usan el MISMO conteo. Se recorre el historial exactamente igual
// que la pestaña Llamadas (tipo "llamada" o "estado") y se fusiona con el
// callLog viejo tomando el MÁXIMO por día/agente, para no perder los días
// históricos que solo quedaron registrados con el botón 📞.
function esContacto(h){ return !!h && (h.tipo === "llamada" || h.tipo === "estado"); }
function contactosPorDia(data){
  const mapa = {};  // { "2026-07-13": { "Chiqui": 12, "Tomas": 3 } }
  const push = (h) => {
    if(!esContacto(h)) return;
    const dia = diaLocal(h.fecha);   // día LOCAL del contacto, no UTC
    if(!dia) return;
    const ag = h.agente || "Equipo";
    if(!mapa[dia]) mapa[dia] = {};
    mapa[dia][ag] = (mapa[dia][ag] || 0) + 1;
  };
  ["agregados","prospectos","distribucion"].forEach(sec =>
    ((data && data[sec]) || []).forEach(c => (c.historial || []).forEach(push)));
  ((data && data.referidos) || []).forEach(anf =>
    (anf.referidos || []).forEach(r => (r.historial || []).forEach(push)));
  return mapa;
}
// El HISTORIAL manda: si un día tiene aunque sea una entrada en el historial,
// ese día se cuenta SOLO con el historial → el panel da EXACTAMENTE el mismo
// número que la pestaña Llamadas, siempre. El callLog viejo se usa únicamente
// como respaldo en días antiguos que no dejaron ninguna entrada de historial
// (así las gráficas históricas no se van a cero).
function conteoLlamadas(data, callLog){
  const hist = contactosPorDia(data);
  const out = {};
  const dias = new Set([...Object.keys(hist), ...Object.keys(callLog || {})]);
  dias.forEach(d => {
    const h = hist[d];
    out[d] = (h && Object.keys(h).length) ? h : clObj((callLog || {})[d]);
  });
  return out;
}
// ── FUSIÓN PROTECTORA DE BASES: al recibir una base desde Firebase, se UNE
// con la local por cliente: el historial y las notas NUNCA se pierden aunque
// otro dispositivo (con estado viejo) escriba encima. eliminado se propaga
// con OR y ultimo_llamado toma el más reciente. Escalares: manda lo remoto.
// Historial compartido modularizado en src/utils/history.ts
function mergeClienteBase(loc, rem){
  if(!loc) return rem; if(!rem) return loc;
  const m = { ...loc, ...rem }; // escalares: manda lo remoto (última edición)
  m.historial = unirHistorial(loc.historial, rem.historial);
  // "notas" tiene DOS formatos según la antigüedad del cliente: texto plano o
  // arreglo [{texto,fecha,agente}]. Se fusionan respetando el formato — jamás
  // se convierte un arreglo en texto (eso creaba notas fantasma letra por letra).
  const lN = loc.notas, rN = rem.notas;
  if(Array.isArray(lN) || Array.isArray(rN)){
    const arrL = Array.isArray(lN) ? lN : [];
    const arrR = Array.isArray(rN) ? rN : [];
    const vistosN = new Set(); const unidas = [];
    [...arrR, ...arrL].forEach(x=>{
      if(!x || typeof x !== "object" || !(x.texto||"").trim()) return;
      const k = (x.fecha||"") + "|" + x.texto;
      if(vistosN.has(k)) return; vistosN.add(k); unidas.push(x);
    });
    unidas.sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")));
    m.notas = unidas;
  } else if((lN||"") && (rN||"") && lN !== rN){
    m.notas = String(rN).includes(String(lN)) ? rN : String(lN).includes(String(rN)) ? lN : (rN + "\n" + lN);
  } else m.notas = rN || lN || "";
  m.eliminado = !!(loc.eliminado || rem.eliminado);
  const ul = [loc.ultimo_llamado||"", rem.ultimo_llamado||""].sort();
  if(ul[1]) m.ultimo_llamado = ul[1];
  if(loc.referidos || rem.referidos){
    // anfitriones: gana la versión con MÁS información en sus referidos
    const peso = arr => (arr||[]).reduce((t,r)=>t+(r.historial||[]).length+((r.notas||"").length?1:0),0) + (arr||[]).length;
    m.referidos = peso(loc.referidos) > peso(rem.referidos) ? loc.referidos : rem.referidos;
  }
  return m;
}
function mergeBase(local, remoto){
  if(!Array.isArray(remoto)) return remoto;
  if(!Array.isArray(local) || !local.length) return remoto;
  const locById = {}; local.forEach(c=>{ if(c && c.id!=null) locById[String(c.id)] = c; });
  const vistos = new Set();
  const out = remoto.map(r=>{
    const id = String(r && r.id); vistos.add(id);
    return mergeClienteBase(locById[id], r);
  });
  // clientes locales que lo remoto aún no tiene (recién creados, subida pendiente).
  // Los eliminados NO se re-agregan: así el vaciado de papelera remoto se respeta.
  local.forEach(c=>{ if(c && c.id!=null && !vistos.has(String(c.id)) && !c.eliminado) out.push(c); });
  return out;
}
// ── FUSIÓN DE NOTIFICACIONES: base = lo remoto (los borrados se propagan),
// leidoPor se UNE por id (marcar leída nunca se revierte) y las notificaciones
// locales muy recientes (subida pendiente) se conservan.
// Fusión protectora de COBRANZA: los clientes se comparan UNO POR UNO por su
// marca de tiempo _t — la versión más reciente gana. Así un borrado local
// (lápida _oculto con _t nuevo) NUNCA pierde contra la copia vieja de otro
// dispositivo, y los pagos externos se unen sin duplicar.
function mergeCobranza(local, remoto){
  const L = local || {}, R = remoto || {};
  const lcd = L.clientesData || {}, rcd = R.clientesData || {};
  const cd = { ...rcd };
  Object.keys(lcd).forEach(id => {
    const a = lcd[id], b = rcd[id];
    if (!b) { cd[id] = a; return; }                 // lo local que el remoto no tiene: se conserva
    if ((+a._t || 0) > (+b._t || 0)) cd[id] = a;    // gana el más reciente
  });
  const vistos = new Set();
  const pe = [...(R.pagosExternos || []), ...(L.pagosExternos || [])].filter(x => {
    const k = JSON.stringify([x.fecha, x.cuenta, x.nombre, x.monto]);
    if (vistos.has(k)) return false; vistos.add(k); return true;
  });
  return { ...R, clientesData: cd, pagosExternos: pe };
}
function mergeNotifs(local, remoto){
  if(!Array.isArray(remoto)) return remoto;
  const locById = {}; (local||[]).forEach(n=>{ if(n&&n.id) locById[n.id]=n; });
  const out = remoto.map(n=>{
    const l = locById[n.id];
    return l ? { ...n, leidoPor: [...new Set([...(n.leidoPor||[]), ...(l.leidoPor||[])])] } : n;
  });
  const ids = new Set(out.map(n=>n.id));
  const hace5min = Date.now() - 5*60*1000;
  (local||[]).forEach(n=>{
    if(n && n.id && !ids.has(n.id) && new Date(n.fecha||0).getTime() > hace5min) out.push(n);
  });
  return out.sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||""))).slice(0,100);
}
function mergeCallLog(local, remoto){
  const out = {};
  new Set([...Object.keys(local||{}), ...Object.keys(remoto||{})]).forEach(f=>{
    const L = clObj((local||{})[f]), R = clObj((remoto||{})[f]);
    const d = {};
    new Set([...Object.keys(L), ...Object.keys(R)]).forEach(ag=>{ d[ag] = Math.max(+L[ag]||0, +R[ag]||0); });
    out[f] = d;
  });
  return out;
}

// ─── ANTHROPIC API KEY ────────────────────────────────────────
// Para que funcionen la IA y el agendado FUERA de Claude,
// ⚠️ SEGURIDAD: la API key ya NO vive en el frontend. Todas las llamadas
// de IA pasan por el proxy /api/anthropic (Vercel), donde la key vive
// como variable de entorno ANTHROPIC_API_KEY. Nunca pongas una key aquí.
const ANTHROPIC_API_KEY = "";

const AI_HEADERS = () => ({
  "Content-Type": "application/json",
  ...(ANTHROPIC_API_KEY ? {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  } : {}),
});

// Firebase SDK — carga dinámica (no necesita npm)
let _db = null;
let _auth = null;
async function ensureFirebase() {
  // Carga app + firestore + auth (compat) e inicializa la app una sola vez
  if (!window.firebase || !window.firebase.firestore) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js");
  }
  if (!window.firebase.auth) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js");
  }
  if (!window.firebase.apps?.length) window.firebase.initializeApp(FIREBASE_CONFIG);
}
async function getDB() {
  if (_db) return _db;
  await ensureFirebase();
  _db = window.firebase.firestore();
  return _db;
}
async function getAuth() {
  if (_auth) return _auth;
  await ensureFirebase();
  _auth = window.firebase.auth();
  return _auth;
}
function loadScript(src) {
  return new Promise((res,rej)=>{
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

const STATUS_COLORS = {
  rojo:     { bg:"bg-red-500",     text:"text-white",    label:"No interesado / No califica", hex:"#dc2626", border:"border-l-red-500",     cardBg:"bg-red-50/60",      style:{background:"#ef4444",color:"#fff"}         },
  verde:    { bg:"bg-green-600",   text:"text-white",    label:"Cita agendada",                hex:"#16a34a", border:"border-l-green-500",   cardBg:"bg-green-50/70",    style:{background:"#16a34a",color:"#fff"}         },
  amarillo: { bg:"bg-amber-400",   text:"text-gray-900", label:"Solo fines de semana",         hex:"#fbbf24", border:"border-l-amber-400",   cardBg:"bg-amber-50/70",    style:{background:"#f59e0b",color:"#1f2d3d"}      },
  azul:     { bg:"bg-[#7c3aed]",   text:"text-white",    label:"Llamar en las tardes",         hex:"#7c3aed", border:"border-l-purple-500",    cardBg:"bg-purple-50/60",     style:{background:"#7c3aed",color:"#fff"}         },
  naranja:  { bg:"bg-orange-500",  text:"text-white",    label:"Pendiente / Seguimiento",      hex:"#f97316", border:"border-l-orange-500",  cardBg:"bg-orange-50/60",   style:{background:"#f97316",color:"#fff"}         },
  morado:   { bg:"bg-purple-600",  text:"text-white",    label:"Solo mañanas",                 hex:"#9333ea", border:"border-l-purple-500",  cardBg:"bg-purple-50/60",   style:{background:"#9333ea",color:"#fff"}         },
  magenta:  { bg:"bg-pink-500",    text:"text-white",    label:"Archivar (no descartar)",      hex:"#ec4899", border:"border-l-pink-500",    cardBg:"bg-pink-50/60",     style:{background:"#ec4899",color:"#fff"}         },
  buzon:    { bg:"bg-teal-500",    text:"text-white",    label:"Buzón de voz",                 hex:"#0d9488", border:"border-l-teal-500",    cardBg:"bg-teal-50/60",     style:{background:"#0d9488",color:"#fff"}         },
  sin_estado:    { bg:"bg-slate-200",  text:"text-slate-700",label:"Sin estado",                   hex:"#cbd5e1", border:"border-l-slate-300",   cardBg:"bg-white",          style:{background:"#e2e8f0",color:"#475569"}      },
  numero_equivocado: { bg:"bg-slate-500", text:"text-white",    label:"Número equivocado",            hex:"#64748b", border:"border-l-slate-500",   cardBg:"bg-slate-50/70",    style:{background:"#64748b",color:"#fff"}         },
};

const CALL_RESULTS = [
  { id:"cita",        ico:"✅", label:"Cita agendada",  status:"verde",   bg:"#16a34a", text:"#fff" },
  { id:"no_contesto", ico:"📵", label:"No contestó",    status:"naranja", bg:"#f97316", text:"#fff" },
  { id:"buzon",       ico:"📭", label:"Buzón de voz",   status:"buzon",   bg:"#0d9488", text:"#fff" },
  { id:"no_interes",  ico:"❌", label:"No interesado",  status:"rojo",    bg:"#dc2626", text:"#fff" },
  { id:"despues",     ico:"⏰", label:"Llamar después", status:"naranja", bg:"#fbbf24", text:"#1f2d3d" },
  { id:"pendiente",      ico:"💬", label:"En proceso",        status:"naranja",           bg:"#7c3aed", text:"#fff" },
  { id:"num_equivocado", ico:"📵", label:"Número equivocado", status:"numero_equivocado", bg:"#64748b", text:"#fff" },
];
const APPT_RESULTS = [
  { id:"demo_venta",    ico:"💰", label:"Demo / venta",        bg:"#047857", text:"#fff" },
  { id:"demo_no_venta", ico:"🎬", label:"Demo / no venta",     bg:"#64748b", text:"#fff" },
  { id:"no_recibio",    ico:"🚪", label:"No recibió",          bg:"#dc2626", text:"#fff" },
  { id:"no_visito",     ico:"🚷", label:"No se visitó",        bg:"#9333ea", text:"#fff" },
  { id:"seguimiento",   ico:"📅", label:"Llamar más adelante", bg:"#f97316", text:"#fff" },
  { id:"reset",         ico:"🔄", label:"Reset (re-agendar)",  bg:"#0891b2", text:"#fff" },
  { id:"recompra",      ico:"✖", label:"Recompra (no pagó su deuda — no sacar cita)", bg:"#111827", text:"#fff" },
];
// Nota: APPT_RESULTS NO cambian el estado del cliente — solo registran
// el resultado de la cita de forma independiente (c.venta / c.resultado)

// Badge visual del resultado de cita
const RESULTADO_STYLE = {
  demo_venta:    { ico:"💰", label:"Demo / venta",        style:{background:"#047857",color:"#fff"} },
  demo_no_venta: { ico:"🎬", label:"Demo / no venta",     style:{background:"#64748b",color:"#fff"} },
  no_recibio:    { ico:"🚪", label:"No recibió",          style:{background:"#dc2626",color:"#fff"} },
  no_visito:     { ico:"🚷", label:"No se visitó",        style:{background:"#9333ea",color:"#fff"} },
  seguimiento:   { ico:"📅", label:"Llamar más adelante", style:{background:"#f97316",color:"#fff"} },
  reset:         { ico:"🔄", label:"Re-agendada",         style:{background:"#0891b2",color:"#fff"} },
  // Compatibilidad con datos antiguos guardados en Firebase:
  venta:         { ico:"💰", label:"Demo / venta",        style:{background:"#047857",color:"#fff"} },
  no_venta:      { ico:"🎬", label:"Demo / no venta",     style:{background:"#64748b",color:"#fff"} },
};

// ─── PRODUCTOS VENDIDOS + CAMBIO DE CARTUCHO ──────────────────
// Catálogo de productos. "Filtros de agua" tiene sub-opciones con
// el tiempo (en meses) en que toca cambiar el cartucho.
const PRODUCTOS_VENTA = [
  { id:"cocina",      ico:"🍳", label:"Sistema de cocina" },
  { id:"electronico", ico:"📺", label:"Electrónico" },
  { id:"purificador", ico:"💨", label:"Purificador de aire", meses:12 }, // mantenimiento anual
  { id:"filtros",     ico:"💧", label:"Filtros de agua / cartuchos", sub:[
    { id:"cart35",    label:"Frescapure 3.500",        meses:12 },
    { id:"cart55",    label:"Frescapure 5.500",        meses:24 },
    { id:"ducha",     label:"Ducha",                   meses:6  },
    { id:"prefiltro", label:"Pre-filtros",             meses:4  },
    { id:"prefw",     label:"Frescaflow",              meses:6  },
    { id:"carbon",    label:"Carbón y mineralizador",  meses:12 },
    { id:"osmosis",   label:"Ósmosis inversa",         meses:24 },
  ]},
  { id:"premios",   ico:"🎁", label:"Premios" },
  { id:"repuestos", ico:"🔩", label:"Repuestos" },
];
// Resuelve producto+sub a { label, meses }. meses>0 ⇒ genera recordatorio de mantenimiento.
function resolveProducto(prodId, subId){
  const p = PRODUCTOS_VENTA.find(x=>x.id===prodId);
  if(!p) return { label:"", meses:0 };
  if(p.sub){
    const s = p.sub.find(x=>x.id===subId);
    return s ? { label:`${p.label} · ${s.label}`, meses:s.meses } : { label:p.label, meses:p.meses||0 };
  }
  return { label:p.label, meses:p.meses||0 };
}
// Suma meses a una fecha ISO y devuelve un objeto Date.
function addMeses(fechaISO, meses){
  const d = new Date(fechaISO);
  if(isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + Number(meses||0));
  return d;
}
// Dada una fecha de venta y el intervalo, devuelve el PRÓXIMO cambio (recurrente)
// a partir de hoy, y cuántos ciclos ya se cumplieron.
function proximoCambioCartucho(fechaVentaISO, meses, hoy=new Date()){
  if(!meses || meses<=0) return null;
  const base = new Date(fechaVentaISO);
  if(isNaN(base.getTime())) return null;
  // Ciclos: venta + k·meses. El cambio ACTIVO es el último ciclo que ya venció
  // (queda pendiente de hacer → aparece como VENCIDO) o, si ninguno venció
  // todavía, el primer ciclo futuro. Así los atrasados nunca se "esconden".
  let k = 1;
  let fecha = addMeses(fechaVentaISO, meses);
  if(!fecha) return null;
  while(k < 600){
    const sig = addMeses(fechaVentaISO, meses*(k+1));
    if(!sig || sig > hoy) break; // el siguiente ciclo aún no llega → nos quedamos en k
    k++; fecha = sig;
  }
  return { fecha, ciclo: k };
}

// Escanea todos los clientes (de las 4 bases) + appts y devuelve la lista de
// cambios de cartucho próximos o vencidos (dentro de la ventana de aviso).
function calcularCartuchos(flatClientes, appts, ventanaDias=30, hoy=new Date()){
  const out = [];
  const push = (nombre, telefono, prodLabel, meses, fechaVenta, origen) => {
    if(!meses || meses<=0 || !fechaVenta) return;
    const prox = proximoCambioCartucho(fechaVenta, meses, hoy);
    if(!prox || !prox.fecha) return;
    const diasFaltan = Math.round((prox.fecha - hoy)/86400000);
    if(diasFaltan <= ventanaDias){ // próximos (≤ventana) o ya vencidos (negativo)
      out.push({ nombre:nombre||"(Sin nombre)", telefono:telefono||"", producto:prodLabel||"", meses, fechaVenta, proxFecha:prox.fecha, diasFaltan, vencido:diasFaltan<0, origen });
    }
  };
  // Ventas registradas en el historial de los clientes
  (flatClientes||[]).forEach(c=>{
    (c.historial||[]).forEach(h=>{
      if((h.cita_resultado==="demo_venta"||h.cita_resultado==="venta") && h.cartucho_meses>0){
        push(c.nombre||c.anfitrion, c.telefono||c.anfitrion_telefono, h.producto, h.cartucho_meses, h.fecha, "cliente");
      }
    });
  });
  // Ventas registradas en citas de la agenda
  (appts||[]).forEach(a=>{
    if((a.resultado==="demo_venta"||a.resultado==="venta") && a.cartucho_meses>0){
      push(a.nombre, a.telefono, a.producto, a.cartucho_meses, a.fecha, "agenda");
    }
  });
  return out.sort((x,y)=>x.proxFecha - y.proxFecha);
}

// ─── CONTEO UNIFICADO DE VENTAS / DEMOS (fuente única de verdad) ──
// Cuenta demostraciones, ventas y volumen desde las citas de la agenda
// (appts) + el historial de los clientes. La usan Control de actividad,
// Estadísticas, Incentivos e Inicio para que TODOS los números cuadren.
//   appts    = arreglo de citas de la agenda
//   clientes = arreglo de clientes (con .historial)
//   enP      = (fechaISO)=>bool → ¿la fecha cae en el periodo?
//   agente   = (opcional) cuenta solo lo registrado por ese agente
function contarVentasDemos({ appts=[], clientes=[], enP=()=>true, agente="" }={}){
  let demos=0, ventas=0, volumen=0;
  (appts||[]).forEach(a=>{
    if(a._sincronizado) return; // ya atribuida a un cliente → se cuenta vía su historial
    if(!enP(a.fecha)) return;
    if(agente && a.agente && a.agente!==agente) return;
    if(a.resultado==="demo_venta"||a.resultado==="venta"){ ventas++; demos++; volumen+=Number(a.monto)||0; }
    else if(a.resultado==="demo_no_venta"||a.resultado==="no_venta"){ demos++; }
  });
  (clientes||[]).forEach(c=>(c.historial||[]).forEach(h=>{
    if(!enP(h.fecha)) return;
    if(agente && h.agente && h.agente!==agente) return;
    if(h.cita_resultado==="demo_venta"||h.cita_resultado==="venta"){ ventas++; demos++; volumen+=Number(h.monto)||0; }
    else if(h.cita_resultado==="demo_no_venta"||h.cita_resultado==="no_venta"){ demos++; }
  }));
  return { demos, ventas, volumen, cierre: demos>0?Math.round((ventas/demos)*100):0 };
}

// ─── HELPERS DE HISTORIAL ─────────────────────────────────────
// Crea una entrada de historial con fecha/hora automática.
function makeHistorialEntry({ tipo="llamada", estado="", notas="", agente="", cita_resultado="", monto=0, producto="", cartucho_meses=0 } = {}) {
  return {
    id: genId(),
    tipo,                       // "llamada" | "estado" | "cita"
    estado,                     // estado del semáforo en ese momento
    notas,                      // nota libre
    agente,                     // quién lo registró
    cita_resultado,             // demo_venta / demo_no_venta / no_recibio / no_visito / seguimiento
    monto: monto ? Number(monto) : 0, // valor de la venta (solo demo_venta)
    producto,                   // producto vendido (label) — solo demo_venta
    cartucho_meses: cartucho_meses ? Number(cartucho_meses) : 0, // meses para cambio de cartucho (0 = sin recordatorio)
    fecha: new Date().toISOString(),
  };
}
// Agrega una entrada de historial al cliente con ese id, dentro de un array.
function addHistorialEntry(arr, id, entry) {
  return (arr||[]).map(x => x.id===id ? {...x, historial:[...(x.historial||[]), entry]} : x);
}
// Elimina UNA entrada del historial de un cliente (por id de entrada o fecha).
// Deja un registro mínimo de que se eliminó. NO borra al cliente ni sus datos.
function deleteHistorialEntry(arr, clienteId, entryKey) {
  return (arr||[]).map(x => {
    if(x.id!==clienteId) return x;
    const nuevoHist=(x.historial||[]).filter(h=>(h.id||h.fecha)!==entryKey);
    return {...x, historial:nuevoHist, actualizado:new Date().toISOString()};
  });
}

// ─── NOTAS ────────────────────────────────────────────────────
// Agrega una nota nueva: se vuelve la última visible y la anterior pasa al historial.
function agregarNota(cliente, texto, agente="") {
  const t = (texto||"").trim();
  if(!t) return cliente;
  const nueva = { texto:t, fecha:new Date().toISOString(), agente };
  const notasPrev = cliente.notas || [];
  return {
    ...cliente,
    ultimaNota: t,
    notas: [...notasPrev, nueva],   // historial completo (no borra nada)
    actualizado: new Date().toISOString(),
  };
}

const emptyClient = () => ({
  id: genId(),
  nombre:"", cuenta:"", direccion:"", ciudad:"", cp:"", producto:"", telefono:"",
  telefonoCasa:"", telefonoTrabajo:"", telefonoMovil:"",   // teléfonos separados
  vendedor:"", nivelCliente:"", limiteCredito:"", saldoActual:"", // datos financieros
  productos:[],                                   // lista de productos comprados
  otrosDetalles:"",                               // otros datos útiles
  observaciones:"", detalles:"", estado:"sin_estado", venta:false,
  ultimaNota:"",                                  // última nota visible
  notas:[],                                       // historial de notas {texto, fecha, agente}
  resultado:"", resultado_detalle:"",
  asignado_a:"",                                  // quién es responsable del cliente
  proximo_seguimiento:"",                         // fecha del próximo seguimiento (YYYY-MM-DD)
  historial:[],                                   // historial de contactos
  eliminado:false,                                // soft-delete (papelera)
  actualizado:"",                                 // última actualización
  fecha_contacto: hoyLocal(), creado: new Date().toISOString(),
});
const emptyReferido = () => ({
  id: genId(), anfitrion:"", regalo:"",
  anfitrion_telefono:"", anfitrion_ciudad:"", anfitrion_cuenta:"", anfitrion_detalle:"",
  referidos:[{ nombre:"",parentesco:"",telefono:"",direccion:"",ciudad:"",cp:"",producto:"",observaciones:"",detalles:"",estado:"sin_estado",ultimaNota:"",notas:[],historial:[],proximo_seguimiento:"",creado:new Date().toISOString(),actualizado:"" }],
  estado:"sin_estado", venta:false, creado: new Date().toISOString(),
});
const emptyProspecto    = () => ({ ...emptyClient(), fuente:"" });
const emptyDistribucion = () => ({ ...emptyClient(), ultima_compra:"" });

// ── EQUIPO ─────────────────────────────────────────────────
const AGENTES = ["Tomas", "Angie", "Supervisora", "Agente de llamadas"];

// ── MATRIZ DE ROLES v2 (5 roles oficiales) ─────────────────────────
// Los roles viejos (Administrador/a, Asistente, Agente de llamadas,
// Supervisora telemarketing…) se MIGRAN lógicamente con normalizarRol:
// los datos de usuarios y cuentas NO se tocan.
// Roles/permisos modularizados en src/auth/permissions.ts
// Usuarios con rol y clave por defecto (la clave se puede cambiar en Configuración)
// (USUARIOS y CLAVES_DEFAULT eliminados — sistema de claves locales retirado.)

// ── Roles disponibles para usuarios creados por el admin ──
const ROLES_DISPONIBLES = ROLES_APP; // fuente única en auth/permissions

// ─── CUENTAS (Firebase Auth) — correo → identidad y rol ───────
// El login real lo hace Firebase. Aquí cada correo autorizado se
// mapea a su NOMBRE (lo que se muestra y se guarda) y su ROL
// (define permisos). Para dar de alta a alguien nuevo: créalo en
// Firebase Console (Authentication) y agrégalo también aquí.
// Si un correo NO está en esta lista, la app no le da acceso.
// ══ FIREBASE MANDA ═══════════════════════════════════════════════════════════
// Los usuarios YA NO viven en el código. Se administran desde el panel
// Configuración → Cuentas, y se guardan en Firebase (state.cuentasCustom).
// Para dar de alta a alguien: (1) créalo en Firebase Authentication,
// (2) agrega su correo a las reglas de Firestore, (3) agrégalo en el panel.
// No hace falta redesplegar nunca más.

// 🔑 LLAVE MAESTRA — la ÚNICA cuenta que queda en el código.
// Es el seguro contra quedarse fuera: si se borra mal una cuenta o Firebase
// devuelve la lista vacía, este correo SIEMPRE entra como Distribuidor y
// puede reparar todo desde el panel de Cuentas.
// Cuentas/autorización modularizadas en src/auth/accounts.ts
const SEED = {
  agregados:[
    { id:1, nombre:"María García", cuenta:"RP-4421", direccion:"123 Oak St, Temple TX", producto:"Juego Innové 5 pzs", telefono:"(254) 555-0101", observaciones:"Interesada en el set completo", detalles:"Visita sábado", estado:"verde", venta:false, fecha_contacto:"2026-06-08", creado:"2026-06-08T10:00:00Z" },
    { id:2, nombre:"Juan López",   cuenta:"RP-4422", direccion:"456 Elm Ave, Waco TX",  producto:"Filtro de agua", telefono:"(254) 555-0102", observaciones:"Llamar después del trabajo", detalles:"", estado:"azul", venta:false, fecha_contacto:"2026-06-07", creado:"2026-06-07T14:00:00Z" },
  ],
  referidos:[],
  prospectos:[
    { id:3, nombre:"Ana Martínez", cuenta:"", direccion:"789 Pine Rd, Austin TX", producto:"Purificador", telefono:"(512) 555-0201", observaciones:"Vino por Facebook", detalles:"", fuente:"Facebook", estado:"naranja", venta:false, fecha_contacto:"2026-06-09", creado:"2026-06-09T09:00:00Z" },
  ],
  distribucion:[
    { id:4, nombre:"Carlos Pérez", cuenta:"RP-3310", direccion:"321 Cedar Ln, Temple TX", producto:"Juego Clásico 7 pzs", telefono:"(254) 555-0301", observaciones:"Cliente leal", detalles:"Interesado en filtro", estado:"naranja", venta:true, ultima_compra:"2025-12-15", fecha_contacto:"2026-06-01", creado:"2025-12-15T00:00:00Z" },
  ],
};

// ─── SHARED STATE — Firebase Firestore con onSnapshot (tiempo real verdadero) ──
function useSharedState(authReady) {
  const initial = {
    agregados:[], referidos:[],
    prospectos:[], distribucion:[],
    callLog:{}, appts:[], cumpleanos:[], incentivos:[], rutas:[],
    cofreConfig:{ activo:true, niveles:COFRE_NIVELES_DEFAULT.map(n=>({...n,premios:[]})) }, cofreAperturas:[], respaldos:[],
    usuariosCustom:[], preguntasSeguridad:{}, reclutamiento:[], controlCierres:[], cuentasCustom:[], cumpleMsgTpl:""
  };
  const [state, setStateRaw] = useState(()=>{
    try { const s=localStorage.getItem("crm_fb_v1"); if(s) return JSON.parse(s); } catch {}
    return initial;
  });
  const [synced,  setSynced]  = useState(false);
  const [fbError, setFbError] = useState("");
  const lastJsonDoc = useRef({});   // por documento: último JSON visto/escrito (corta ecos)
  const unsub       = useRef(null);
  // ── RECONEXIÓN AUTOMÁTICA: si la escucha de Firebase muere, se re-suscribe sola ──
  const [connTick, setConnTick] = useState(0); // cambiarlo re-dispara la conexión
  const retryTimer = useRef(null);
  const retryDelay = useRef(5000);             // 5s → 10s → 20s → … máx 60s
  const programarReintento = useCallback(()=>{
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(()=>{ setConnTick(t=>t+1); }, retryDelay.current);
    retryDelay.current = Math.min(retryDelay.current * 2, 60000);
  },[]);
  const reintentarAhora = useCallback(()=>{
    clearTimeout(retryTimer.current);
    retryDelay.current = 5000;
    setFbError("📡 Reintentando conexión…");
    setConnTick(t=>t+1);
  },[]);
  const primerSnapRef = useRef(false); // espejo síncrono de primerSnap para el overlay del caché
  // Overlay del caché grande: si IndexedDB tiene una copia y aún no llegó nada
  // de Firebase, se muestra al instante (elimina el "abre con menos datos").
  useEffect(()=>{
    let vivo = true;
    idbCache.get("estado").then(v => {
      if(vivo && v && !primerSnapRef.current) setStateRaw(s => primerSnapRef.current ? s : v);
    });
    return () => { vivo = false; };
  },[]);
  const [primerSnap, setPrimerSnap] = useState(false); // ¿ya llegó el primer snapshot? (estado, para re-disparar el guardado)

  // Conectar, MIGRAR si hace falta y escuchar cambios en tiempo real
  useEffect(()=>{
    if(!authReady) return;
    let alive = true;
    getDB().then(db=>{
      if(!alive) return;
      const col = db.collection(FIRESTORE_COL);

      // ── MIGRACIÓN AUTOMÁTICA (en segundo plano, SIN bloquear la escucha) ──
      // Corre una sola vez en la vida del proyecto. Va en paralelo para que la
      // app EMPIECE A RECIBIR DATOS de inmediato aunque la conexión sea lenta.
      (async()=>{
        try{
          const guia = await col.doc(DOC_MISC).get();
          if(!guia.exists){
            const legado = await col.doc("state").get();
            const base = (legado.exists && legado.data()?.payload) ? legado.data().payload : initial;
            const docs = partirEstado(base);
            const batch = db.batch();
            Object.keys(docs).forEach(id => batch.set(col.doc(id), { payload: docs[id] }));
            await batch.commit();
          } else {
            const guia2 = await col.doc("sec_agregados_1").get();
            if(!guia2.exists){
              const V1 = ["agregados","referidos","prospectos","distribucion","appts","cobranza","reclutamiento"];
              const base = { ...(guia.data()?.payload || {}) };
              for(const sn of V1){
                const d = await col.doc("sec_" + sn).get();
                if(d.exists && d.data()?.payload !== undefined) base[sn] = d.data().payload;
              }
              const docs = partirEstado(base);
              const batch = db.batch();
              Object.keys(docs).forEach(id => batch.set(col.doc(id), { payload: docs[id] }));
              await batch.commit();
            } else {
              // Migración V2→V3: la AGENDA pasa de 1 documento (límite 1 MB, se llenó)
              // a 5 fragmentos. Corre una sola vez; sec_appts queda como respaldo.
              const guiaA = await col.doc("sec_appts_1").get();
              if(!guiaA.exists){
                const viejo = await col.doc("sec_appts").get();
                const arr = (viejo.exists && Array.isArray(viejo.data()?.payload)) ? viejo.data().payload : [];
                const frags = fragArray(arr);
                const batch = db.batch();
                for(let i=0;i<N_FRAG;i++) batch.set(col.doc("sec_appts_"+(i+1)), { payload: frags[i] });
                await batch.commit();
              }
            }
          }
        }catch(e){ /* si la migración falla (p. ej. reglas), el onSnapshot igual escucha */ }
      })();

      // ── Escucha en tiempo real de TODOS los documentos de sección (INMEDIATA) ──
      unsub.current = col.onSnapshot(qs=>{
        const cambios = {};
        let hubo = false;
        const LEGADO_V1 = ["sec_agregados","sec_referidos","sec_prospectos","sec_distribucion","sec_cobranza","sec_appts"];
        qs.forEach(doc=>{
          if(doc.id === "state" || LEGADO_V1.includes(doc.id)) return; // legados: solo respaldo
          const payload = doc.data()?.payload;
          if(payload === undefined) return;
          const json = JSON.stringify(payload);
          if(json !== lastJsonDoc.current[doc.id]){
            lastJsonDoc.current[doc.id] = json;
            cambios[doc.id] = payload;
            hubo = true;
          }
        });
        primerSnapRef.current = true;
        setPrimerSnap(true);
        if(hubo){
          setStateRaw(s=>{
            // 1) ¿Qué SECCIONES tocaron los documentos que cambiaron? Solo esas se
            //    reconstruyen — un snapshot de cobranza jamás toca agregados, y las
            //    ediciones locales aún no guardadas de otras secciones quedan intactas.
            const seccionesTocadas = new Set();
            let tocoMisc = false;
            Object.keys(cambios).forEach(id=>{
              if(id === DOC_MISC){ tocoMisc = true; return; }
              const m = id.match(/^sec_(.+?)(?:_\d+)?$/);
              if(m) seccionesTocadas.add(m[1]);
            });
            // 2) Mapa completo (últimos JSON conocidos, ya incluyen los cambios)
            const mapa = {};
            Object.keys(lastJsonDoc.current).forEach(id=>{
              if(id === "state") return;
              try { mapa[id] = JSON.parse(lastJsonDoc.current[id]); } catch {}
            });
            const todo = unirDocs(mapa);
            const parcial = {};
            if(tocoMisc) Object.assign(parcial, mapa[DOC_MISC] || {});
            seccionesTocadas.forEach(sec=>{ if(todo[sec] !== undefined) parcial[sec] = todo[sec]; });
            // 3) FUSIONES PROTECTORAS: nada de lo escrito localmente se pierde.
            //    callLog por máximo; historial/notas de las bases se UNEN por cliente;
            //    notificaciones unen leidoPor (marcar leída nunca se revierte).
            if(Object.prototype.hasOwnProperty.call(parcial, "callLog")) parcial.callLog = mergeCallLog(s.callLog, parcial.callLog);
            ["agregados","referidos","prospectos","distribucion","reclutamiento"].forEach(sec=>{
              if(Object.prototype.hasOwnProperty.call(parcial, sec)) parcial[sec] = mergeBase(s[sec], parcial[sec]);
            });
            if(Object.prototype.hasOwnProperty.call(parcial, "cobranza")) parcial.cobranza = mergeCobranza(s.cobranza, parcial.cobranza);
            if(Object.prototype.hasOwnProperty.call(parcial, "notificaciones")) parcial.notificaciones = mergeNotifs(s.notificaciones, parcial.notificaciones);
            if(Object.prototype.hasOwnProperty.call(parcial, "cumpleNotifs")) parcial.cumpleNotifs = { ...(parcial.cumpleNotifs||{}), ...(s.cumpleNotifs||{}) };
            // Reparar IDs duplicados/vacíos al recibir (no destructivo).
            const fusionado = repararIdsEstado({ ...s, ...parcial });
            idbCache.set("estado", fusionado);
            try { localStorage.removeItem("crm_fb_v1"); } catch {} // el caché viejo (congelado por cuota) se retira
            return fusionado;
          });
        }
        // Conexión viva: se limpia el aviso de conexión (los ⚠️ de guardado se conservan)
        retryDelay.current = 5000;
        setFbError(f => (f && (f.startsWith("📡") || f.startsWith("⛔"))) ? "" : f);
        setSynced(true);
      }, err=>{
        // La escucha MURIÓ (Firestore no la revive sola). Antes esto era permanente
        // y silencioso: la persona quedaba trabajando solo en su teléfono.
        const code = String(err?.code||"");
        if(code === "permission-denied"){
          setFbError("⛔ Este usuario NO tiene permiso en las reglas de Firestore — sus cambios no llegan a la nube. Avísale a Tomas.");
        } else {
          setFbError("📡 Sin conexión a Firebase — trabajando local. Reintentando automáticamente…");
        }
        setSynced(true);
        unsub.current?.(); unsub.current = null;
        programarReintento();
      });
    }).catch(()=>{
      setFbError("📡 Error al cargar Firebase — reintentando automáticamente…");
      setSynced(true);
      programarReintento();
    });
    return ()=>{ alive=false; clearTimeout(retryTimer.current); unsub.current?.(); };
  },[authReady, connTick]);

  // Guardar en Firestore cuando el estado cambia localmente.
  // SOLO se escriben los documentos cuya sección realmente cambió:
  // editar un cliente de Agregados ya no re-escribe Cobranza ni la Agenda.
  useEffect(()=>{
    if(!synced) return;
    // No subir NADA hasta haber recibido el primer snapshot: así nunca escribimos
    // una base reconstruida de forma incompleta encima de la de la nube.
    if(!primerSnap) return;
    const docs = partirEstado(state);
    const pendientes = [];
    Object.keys(docs).forEach(id=>{
      const json = JSON.stringify(docs[id]);
      if(json !== lastJsonDoc.current[id]){
        const previo = lastJsonDoc.current[id]; // para desmarcar si el guardado falla
        lastJsonDoc.current[id] = json;
        pendientes.push([id, docs[id], previo, json]);
      }
    });
    if(!pendientes.length) return;
    idbCache.set("estado", state);
    getDB().then(db=>{
      const col = db.collection(FIRESTORE_COL);
      pendientes.forEach(([id, payload, previo, json]) => col.doc(id).set({ payload }).catch(err=>{
        // Falló el guardado: se DESMARCA para que el próximo cambio lo reintente
        // (antes quedaba marcado como guardado y el fallo era permanente y silencioso).
        if(lastJsonDoc.current[id] === json) lastJsonDoc.current[id] = previo;
        const nombre = id === DOC_MISC ? "configuración" : id.slice(4);
        if(String(err?.message||"").toLowerCase().includes("size") || String(err?.message||"").toLowerCase().includes("bytes") || String(err?.code||"")==="invalid-argument"){
          setFbError("⚠️ La sección \"" + nombre + "\" superó su límite de tamaño — el último cambio NO se guardó en la nube. Avísale a Tomas.");
        } else if(String(err?.code||"")==="permission-denied"){
          setFbError("⛔ Este usuario NO tiene permiso para GUARDAR en la nube (reglas de Firestore) — sus cambios quedan solo en este teléfono. Avísale a Tomas.");
        } else {
          setFbError("⚠️ No se pudo guardar \"" + nombre + "\" en la nube (¿sin conexión?). Se reintentará automáticamente.");
        }
      }));
    }).catch(()=>{});
  },[state, synced, primerSnap, connTick]); // connTick: al reconectar se re-empujan los pendientes

  return [state, setStateRaw, synced, fbError, reintentarAhora];
}

// ─── UI PRIMITIVES ────────────────────────────────────────────
// UI primitives modularizados en src/components/primitives.tsx

// Royal Prestige logo (real) + Telemarketing Impact Enterprises
const LOGO_SRC = "data:image/png;base64,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";
function Brand({ small }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img src={LOGO_SRC} alt="ImpactOS"
        className="rounded-xl object-cover shrink-0 border border-white/10 bg-white/[0.03]"
        style={{width:small?"36px":"46px",height:small?"36px":"46px"}} />
      <div className="leading-tight min-w-0">
        <div className="text-[#F4F6F8] truncate" style={{fontFamily:SANS,fontSize:small?"15px":"19px",fontWeight:800,letterSpacing:"-0.025em"}}>
          Impact<span style={{color:"#60A5FA"}}>OS</span>
        </div>
        <div className="text-[10px] mt-0.5 text-[#667085] font-medium truncate">Business Operating System</div>
      </div>
    </div>
  );
}

// Deja solo los últimos 10 dígitos del número (para llamada y SMS — usan la región local)
const soloDigitos = (n) => {
  let d = (n||"").replace(/[^0-9]/g,"");
  if (d.length>10) d = d.slice(-10);   // últimos 10 dígitos
  return d;
};
// Para WhatsApp: SIEMPRE con código de país. EE.UU./Canadá = "1" + 10 dígitos.
// (WhatsApp rechaza números sin código de país)
const waDigitos = (n) => {
  let d = (n||"").replace(/[^0-9]/g,"");
  if (d.length===10) d = "1"+d;            // 10 díg → agrega el 1 de USA
  else if (d.length>10) d = d.slice(-11);  // si trae más, toma los últimos 11 (1 + 10)
  if (d.length===11 && d[0]!=="1") d = "1"+d.slice(-10); // asegura prefijo 1
  return d;
};
const telLink = (n) => "tel:" + soloDigitos(n);
// WhatsApp — con código de país (1 para USA)
const waLink = (n) => "https://wa.me/" + waDigitos(n);
// SMS — solo los últimos 10 dígitos (región local)
const smsLink = (n) => "sms:" + soloDigitos(n);
// Número solo con dígitos (últimos 10)
const intlNum = (n) => soloDigitos(n);

// ═══════════════════════════════════════════════════════════════
// SISTEMA DE BÚSQUEDA GLOBAL — usado por TODAS las listas de clientes
// ═══════════════════════════════════════════════════════════════
// Normaliza texto: minúsculas + sin acentos + sin espacios extra.
// Así "Bogotá", "BOGOTA" y "  bogota " se vuelven todos "bogota".
function normTexto(t){
  return (t||"").toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"") // quita acentos/tildes
    .toLowerCase().trim().replace(/\s+/g," ");
}
// Estados de EE.UU. (nombre y abreviatura) para limpiar la ciudad: "Dallas, Texas",
// "Dallas TX" y "DALLAS" deben caer todos en la misma zona.
const ESTADOS_US = new Set(["al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc","alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","nuevo mexico","new york","nueva york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","tejas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","puerto rico"]);
function limpiaCiudad(crudo){
  let t = (crudo||"").toString().split(",")[0].replace(/[.\u00b7;]+/g," ").replace(/\s+/g," ").trim();
  const parts = t.split(" ");
  while(parts.length > 1){
    const l1 = normTexto(parts[parts.length-1]);
    const l2 = parts.length > 2 ? normTexto(parts.slice(-2).join(" ")) : "";
    if(l2 && ESTADOS_US.has(l2)){ parts.splice(-2,2); continue; }
    if(ESTADOS_US.has(l1)){ parts.pop(); continue; }
    break;
  }
  return parts.join(" ").trim();
}
// Deja solo los dígitos de un valor (para teléfono y código postal).
function soloNum(t){ return (t||"").toString().replace(/[^0-9]/g,""); }
// ─── GENERADOR DE ID ÚNICO ───
// Date.now()+Math.random() puede COLISIONAR cuando se crean muchos registros en el
// mismo milisegundo (ej. importación masiva con IA): dos clientes terminan con el mismo
// id y al editar/borrar uno se afecta el otro. Este generador combina timestamp +
// contador incremental + base36 aleatorio → id ÚNICO garantizado, siempre string.
// IDs modularizados en src/utils/ids.ts
// Repara IDs DUPLICADOS o vacíos en una lista de registros, SIN borrar datos.
// Si dos clientes comparten id (por el bug viejo de Date.now()+Math.random()), al
// segundo y siguientes se les asigna un id nuevo único. Devuelve {lista, reparados}.
function repararIdsLista(lista){
  if(!Array.isArray(lista)) return { lista, reparados:0 };
  const vistos = new Set();
  let reparados = 0;
  const out = lista.map(item=>{
    if(!item || typeof item!=="object") return item;
    let id = item.id;
    const idStr = (id===undefined||id===null) ? "" : String(id);
    if(idStr==="" || vistos.has(idStr)){
      reparados++;
      const nuevo = genId();
      vistos.add(nuevo);
      return { ...item, id: nuevo };
    }
    vistos.add(idStr);
    return item;
  });
  return { lista: out, reparados };
}
// Repara IDs duplicados en TODAS las secciones de clientes del estado.
function repararIdsEstado(estado){
  if(!estado || typeof estado!=="object") return estado;
  const secciones = ["agregados","prospectos","distribucion","referidos"];
  let totalRep = 0;
  const nuevo = { ...estado };
  secciones.forEach(sec=>{
    if(Array.isArray(nuevo[sec])){
      const { lista, reparados } = repararIdsLista(nuevo[sec]);
      if(reparados>0){ nuevo[sec] = lista; totalRep += reparados; }
    }
  });
  return totalRep>0 ? nuevo : estado;
}
// Normaliza un código postal: quita todo lo que no sea número y toma los primeros 5 dígitos.
// Así "75061-1234" (ZIP+4) → "75061", y " 765 01 " → "76501".
function normalizeZip(value){ return String(value||"").replace(/\D/g,"").slice(0,5); }
// Extrae un código postal de 5 dígitos que esté ESCRITO DENTRO de un texto (dirección).
// Busca un grupo de exactamente 5 dígitos juntos. Ej: "123 Main St, Dallas TX 75220" → "75220".
// Si hay ZIP+4 como "75220-1234", toma los primeros 5. Si hay varios, toma el último
// (normalmente el ZIP va al final de la dirección).
function zipDesdeTexto(texto){
  const s=String(texto||"");
  // \b(\d{5})(?:-\d{4})?\b → 5 dígitos, opcional -4, con límites de palabra
  const matches=[...s.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].map(m=>m[1]);
  return matches.length>0 ? matches[matches.length-1] : "";
}
// Lee el código postal de un cliente (5 díg). Primero busca en los campos de CP;
// si están vacíos, lo EXTRAE de la dirección (donde suele venir escrito).
function cpDe(c){
  const campoCP = normalizeZip(c?.cp||c?.codigoPostal||c?.postalCode||c?.zip||c?.addressZip||c?.codigo_postal);
  if(campoCP.length===5) return campoCP;
  // No hay CP en su propio campo → buscar 5 dígitos juntos en la dirección
  const enDireccion = zipDesdeTexto(c?.direccion||c?.address||c?.direccion_completa);
  // F) Garantizar que el ZIP extraído sea EXACTAMENTE 5 dígitos (si no, "")
  return enDireccion.length===5 ? enDireccion : "";
}
// Lee el teléfono de un cliente (cliente normal o anfitrión de referido).
function telDe(c){ return soloNum(c?.telefono||c?.anfitrion_telefono||c?.tel); }

// FILTRO GLOBAL ÚNICO. Devuelve true si el cliente cumple TODOS los filtros activos.
// Reglas:
//  - search: busca en nombre, anfitrión, ciudad, estado, dirección, teléfono y CP
//  - filterStatus: estado exacto ("todos" = sin filtro)
//  - filterCity: ciudad por coincidencia parcial sin acentos
//  - filterCP: EXACTO con 5 dígitos. Menos de 5 dígitos NO filtra (no parcial).
function coincideBusqueda(c, filtros){
  const { search="", filterStatus="todos", filterCity="", filterCP="" } = filtros||{};
  // Código postal — solo filtra cuando hay 5 dígitos completos, y compara EXACTO
  const zipRaw = soloNum(filterCP);
  const zipQuery = normalizeZip(filterCP);
  // Si empezó a escribir un ZIP pero aún NO son 5 dígitos (1-4), NO mostrar nada.
  // Esto evita que aparezcan clientes incorrectos mientras el filtro está incompleto.
  if(zipRaw.length>0 && zipRaw.length<5) return false;
  const cpCliente = cpDe(c);
  const shouldFilterByZip = zipQuery.length===5;
  const mcp = !shouldFilterByZip || cpCliente===zipQuery;
  // Ciudad (sin acentos, parcial — esto sí puede ser parcial)
  const mc = !filterCity || normTexto(c?.ciudad).includes(normTexto(filterCity));
  // Estado
  const mf = !filterStatus || filterStatus==="todos" || c?.estado===filterStatus;
  // Búsqueda libre
  let ms = true;
  if(search && search.trim()){
    const q = normTexto(search);
    const qNum = soloNum(search);
    const nombre = normTexto(c?.nombre);
    const anfitrion = normTexto(c?.anfitrion);
    const ciudad = normTexto(c?.ciudad);
    const estado = normTexto(c?.estado);
    const direccion = normTexto(c?.direccion);
    const tel = telDe(c);
    const coincideTexto = nombre.includes(q)||anfitrion.includes(q)||ciudad.includes(q)||estado.includes(q)||direccion.includes(q);
    // Coincidencia por teléfono SOLO si la búsqueda es básicamente un número (mín 3 díg),
    // no texto que casualmente trae un dígito (ej. "calle 5").
    const busquedaEsNumerica = qNum.length>=3 && qNum.length>=q.replace(/[^a-z0-9]/g,"").length;
    const coincideTel = busquedaEsNumerica && tel.includes(qNum);
    // Coincidencia por CP en la búsqueda libre: también exacto con 5 dígitos
    const coincideCp = qNum.length===5 && cpCliente===qNum;
    ms = coincideTexto || coincideTel || coincideCp;
  }
  return ms && mf && mc && mcp;
}
// Apps de llamada. iOS no permite que una web abra apps de terceros
// directamente, así que: tel/GVoice abren con el número listo, y
// TextNow/iPlum copian el número automático (solo abres la app y pegas).
const copyNum = (n) => { try { navigator.clipboard.writeText(intlNum(n)); } catch {} };
const CALL_APPS = [
  { id:"tel",     label:"Teléfono",      icon:"📞", color:"#7c3aed", mode:"link", href:(n)=>telLink(n) },
  { id:"gvoice",  label:"Google Voice",  icon:"📱", color:"#1a73e8", mode:"link", href:(n)=>`https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(intlNum(n))}` },
  { id:"textnow", label:"TextNow",       icon:"☎️", color:"#65c466", mode:"copy" },
  { id:"iplum",   label:"iPlum",         icon:"🔵", color:"#0a6cff", mode:"copy" },
];


// ─── GOOGLE CALENDAR LINK (evento pre-llenado, funciona en cualquier lado) ──
const fmtGCal = (d) => {
  const p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};
function gcalLink(appt) {
  const start = new Date(appt.fecha);
  const end   = new Date(start.getTime() + 3600000);
  const cfg   = EVENT_CONFIG[appt.tipo] || EVENT_CONFIG.cita;
  const guestList = (appt.invitados||[]).filter(Boolean).join(", ");
  const details = [
    `Tel: ${appt.telefono||"—"}`,
    `Producto: ${appt.producto||"—"}`,
    appt.cuenta ? `Cuenta: ${appt.cuenta}` : "",
    appt.ciudad ? `Ciudad: ${appt.ciudad}${appt.cp?` · CP: ${appt.cp}`:""}` : (appt.cp?`CP: ${appt.cp}`:""),
    guestList ? `Invitados cocinada: ${guestList}` : "",
    appt.notas ? `Notas: ${appt.notas}` : "",
    `Vendedor: ${appt.agente||"—"}`,
  ].filter(Boolean).join("\n");
  const locationStr = [appt.direccion, appt.ciudad, appt.cp].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text:   cfg.title(appt.nombre),
    dates:  `${fmtGCal(start)}/${fmtGCal(end)}`,
    details,
    location: locationStr || "",
    ctz: "America/Chicago",
  });
  const adds = (appt.attendees||[]).filter(Boolean).join(",");
  if (adds) params.append("add", adds);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

// ─── DUPLICATE DETECTION ──────────────────────────────────────
// Jerarquía: 1) n��mero de cuenta, 2) teléfono, 3) nombre + dirección.
const normName = (s)=>(s||"").toLowerCase().trim().replace(/\s+/g," ");
const normTel  = (s)=>{ let d=(s||"").replace(/[^0-9]/g,""); if(d.length>10)d=d.slice(-10); return d; };
const normCuenta = (s)=>(s||"").toString().replace(/[^0-9a-zA-Z]/g,"").toLowerCase();
const normDir  = (s)=>(s||"").toLowerCase().trim().replace(/\s+/g," ").replace(/[.,#]/g,"");
const contactKey = (c)=> normName(c.nombre)+"|"+normTel(c.telefono);

// Devuelve el cliente existente que coincide (o null), siguiendo la jerarquía.
function findDuplicate(contact, allData, excludeId=null) {
  const cuenta = normCuenta(contact.cuenta || contact.numeroCuenta);
  const tel = normTel(contact.telefono || contact.telefonoMovil);
  const nombre = normName(contact.nombre);
  const dir = normDir(contact.direccion);
  for (const sec of ["agregados","prospectos","distribucion"]) {
    for (const x of (allData[sec]||[])) {
      if (x.id===excludeId || x.eliminado) continue;
      // 1) por cuenta
      if (cuenta && normCuenta(x.cuenta)===cuenta) return {match:x, sec, motivo:"número de cuenta"};
    }
  }
  for (const sec of ["agregados","prospectos","distribucion"]) {
    for (const x of (allData[sec]||[])) {
      if (x.id===excludeId || x.eliminado) continue;
      // 2) por teléfono (solo si el nuevo no tenía cuenta que matcheara)
      if (tel && normTel(x.telefono)===tel) return {match:x, sec, motivo:"teléfono"};
    }
  }
  for (const sec of ["agregados","prospectos","distribucion"]) {
    for (const x of (allData[sec]||[])) {
      if (x.id===excludeId || x.eliminado) continue;
      // 3) por nombre + dirección
      if (nombre && dir && normName(x.nombre)===nombre && normDir(x.direccion)===dir) return {match:x, sec, motivo:"nombre y dirección"};
    }
  }
  return null;
}
// Compatibilidad: isDuplicate / dupReason siguen funcionando
function isDuplicate(contact, allData, excludeId=null) {
  return !!findDuplicate(contact, allData, excludeId);
}
function dupReason(contact, allData) {
  const d = findDuplicate(contact, allData);
  return d ? d.motivo : "";
}
// Cuenta cuántos campos útiles tiene un cliente (para decidir cuál conservar)
function contarCampos(c) {
  const campos = ["nombre","cuenta","direccion","telefono","telefonoCasa","telefonoTrabajo","telefonoMovil","vendedor","nivelCliente","limiteCredito","saldoActual","otrosDetalles","ciudad","observaciones"];
  let n = campos.reduce((acc,k)=> acc + ((c[k]&&String(c[k]).trim())?1:0), 0);
  if(Array.isArray(c.productos) && c.productos.length) n++;
  return n;
}
// Fusiona dos clientes: rellena vacíos del existente con datos del nuevo.
// Conserva toda la info útil de ambos. No borra nada.
function fusionarClientes(existente, nuevo) {
  const merged = {...existente};
  const campos = ["nombre","cuenta","direccion","telefono","telefonoCasa","telefonoTrabajo","telefonoMovil","vendedor","nivelCliente","limiteCredito","saldoActual","otrosDetalles","ciudad"];
  campos.forEach(k=>{
    const vNuevo = nuevo[k]!==undefined ? nuevo[k] : nuevo[k==="cuenta"?"numeroCuenta":k];
    if((!merged[k] || !String(merged[k]).trim()) && vNuevo && String(vNuevo).trim()){
      merged[k] = vNuevo;
    }
  });
  // Productos: unir sin duplicar
  const prodEx = Array.isArray(existente.productos)?existente.productos:[];
  const prodNew = Array.isArray(nuevo.productos)?nuevo.productos:(nuevo.productos?[nuevo.productos]:[]);
  const prodSet = [...new Set([...prodEx, ...prodNew].map(p=>String(p).trim()).filter(Boolean))];
  if(prodSet.length) merged.productos = prodSet;
  // Observaciones: concatenar si el nuevo aporta algo distinto
  if(nuevo.observaciones && nuevo.observaciones.trim() && nuevo.observaciones.trim()!==(existente.observaciones||"").trim()){
    merged.observaciones = [existente.observaciones, nuevo.observaciones].filter(Boolean).join(" · ");
  }
  merged.actualizado = new Date().toISOString();
  return merged;
}

// ─── PDF EXPORT (Royal style) ─────────────────────────────────
function exportToPDF(data, sectionName) {
  const rows = data.map(c=>{
    const name=c.anfitrion||c.nombre||"(Sin nombre)", tel=c.telefono||c.referidos?.[0]?.telefono||"",
      prod=c.producto||"", dir=c.direccion||"", status=STATUS_COLORS[c.estado]?.label||"Sin estado", obs=c.observaciones||"";
    return `<tr style="border-bottom:1px solid #e8edf3">
      <td style="padding:8px 10px;font-weight:700;color:#1f2d3d">${name}</td>
      <td style="padding:8px 10px;color:#555">${tel}</td>
      <td style="padding:8px 10px;color:#555">${prod}</td>
      <td style="padding:8px 10px;color:#555;max-width:140px">${dir}</td>
      <td style="padding:8px 10px"><span style="background:#5b21b6;color:#fff;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:700">${status}</span></td>
      <td style="padding:8px 10px;color:#888;font-style:italic;font-size:10px">${obs}</td></tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Royal Prestige — ${sectionName}</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
  body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:24px;color:#1f2d3d}
  .bar{background:#5b21b6;color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:20px}
  h1{font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;margin:0}
  h1 span{font-style:italic;color:#a78bfa}
  .sub{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c4b5fd;margin-top:6px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#3b0d8f;color:#fff;padding:10px;text-align:left;font-weight:700;font-size:11px}
  tr:nth-child(even){background:#f4f6f9}
  @media print{body{padding:10px}}</style></head>
  <body><div class="bar"><h1>Royal <span>Prestige</span> — ${sectionName}</h1>
  <div class="sub">Telemarketing Impact Enterprises · ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})} · ${data.length} registros</div></div>
  <div class="noprint" style="position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:99">
    <button onclick="window.print()" style="background:#5b21b6;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer">🖨️ Imprimir</button>
    <button onclick="window.close();history.back();" style="background:#e2e8f0;color:#475569;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer">✕ Cerrar</button>
  </div>
  <style>.noprint{} @media print{.noprint{display:none!important}}</style>
  <table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Producto</th><th>Dirección</th><th>Estado</th><th>Observaciones</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  // Usar Blob + nueva pestaña con botón de cerrar (en iPhone window.open con print atrapa la vista)
  try {
    const blob = new Blob([html], { type:"text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if(!w){
      // Si el navegador bloquea la ventana, descargar el archivo
      const a = document.createElement("a");
      a.href = url; a.download = `RoyalPrestige_${sectionName}_${hoyLocal()}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  } catch(e) {
    alert("No se pudo generar el PDF: "+(e?.message||e));
  }
}

// ════════════════════════════════════════════════════════════════
// COFRE IMPACT SEMANAL + RESPALDO MENSUAL
// ════════════════════════════════════════════════════════════════

// Niveles por defecto del Cofre (editables por el encargado)
const COFRE_NIVELES_DEFAULT = [
  { id:"bronce", nombre:"Cofre Bronce", emoji:"🥉", color:"#b06b2f", metaCitas:0, metaDemos:0, metaVentas:0, metaVolumen:0, premios:[] },
  { id:"plata",  nombre:"Cofre Plata",  emoji:"🥈", color:"#8a97a8", metaCitas:0, metaDemos:0, metaVentas:0, metaVolumen:0, premios:[] },
  { id:"oro",    nombre:"Cofre Oro",    emoji:"🥇", color:"#caa12f", metaCitas:0, metaDemos:0, metaVentas:0, metaVolumen:0, premios:[] },
];

// Llave de la semana actual = fecha (ISO) del lunes de esta semana
function semanaActualKey(){ return lunesDeLaSemana(new Date()).toISOString().slice(0,10); }

// Logro de ESTA semana (lunes 00:00 → ahora) para un agente
function calcularSemanaAgente(agente, allData){
  const lunes = lunesDeLaSemana(new Date());
  const ahora = new Date();
  const enSemana = (fechaISO)=>{ if(!fechaISO) return false; const f=new Date(fechaISO); return f>=lunes && f<=ahora; };
  const clientes = [
    ...(allData.agregados||[]),
    ...(allData.prospectos||[]),
    ...(allData.distribucion||[]),
    ...((allData.referidos||[]).flatMap(anf=>(anf.referidos||[]))),
  ];
  let citas=0, demos=0, ventas=0, volumen=0;
  (allData.appts||[]).forEach(a=>{
    if(agente && a.agente!==agente) return;
    if(!enSemana(a.fecha)) return;
    if(a.tipo==="cita" || a._type==="cita") citas++;
    if((a.resultado==="demo_venta"||a.resultado==="venta") && a.monto) volumen += Number(a.monto)||0;
  });
  clientes.forEach(c=>{
    (c.historial||[]).forEach(h=>{
      if(agente && h.agente!==agente) return;
      if(!enSemana(h.fecha)) return;
      if(h.cita_resultado==="demo_venta"||h.cita_resultado==="demo_no_venta"||h.cita_resultado==="venta"||h.cita_resultado==="no_venta") demos++;
      if(h.cita_resultado==="demo_venta"||h.cita_resultado==="venta"){ ventas++; if(h.monto) volumen += Number(h.monto)||0; }
    });
  });
  return { citas, demos, ventas, volumen };
}

function cofreNivelTieneMetas(n){
  return (Number(n.metaCitas)||0)>0 || (Number(n.metaDemos)||0)>0 || (Number(n.metaVentas)||0)>0 || (Number(n.metaVolumen)||0)>0;
}
function cofreNivelCumplido(n, l){
  if(!cofreNivelTieneMetas(n)) return false;
  const mc=Number(n.metaCitas)||0, md=Number(n.metaDemos)||0, mv=Number(n.metaVentas)||0, mvo=Number(n.metaVolumen)||0;
  if(mc>0  && l.citas   < mc)  return false;
  if(md>0  && l.demos   < md)  return false;
  if(mv>0  && l.ventas  < mv)  return false;
  if(mvo>0 && l.volumen < mvo) return false;
  return true;
}
function cofreProgresoNivel(n, l){
  const partes=[];
  const mc=Number(n.metaCitas)||0, md=Number(n.metaDemos)||0, mv=Number(n.metaVentas)||0, mvo=Number(n.metaVolumen)||0;
  if(mc>0)  partes.push(Math.min(1, l.citas/mc));
  if(md>0)  partes.push(Math.min(1, l.demos/md));
  if(mv>0)  partes.push(Math.min(1, l.ventas/mv));
  if(mvo>0) partes.push(Math.min(1, l.volumen/mvo));
  return partes.length ? Math.round(partes.reduce((a,b)=>a+b,0)/partes.length*100) : 0;
}
// Nivel más alto cumplido (asume orden bronce → plata → oro)
function cofreNivelMaxCumplido(niveles, l){
  let max=null;
  (niveles||[]).forEach(n=>{ if(cofreNivelCumplido(n,l)) max=n; });
  return max;
}

// Mini barra de meta (para la tarjeta del cofre)
function CofreMiniMeta({ label, actual, meta, money }){
  const m=Number(meta)||0;
  const pct=m>0 ? Math.min(100, Math.round((Number(actual)||0)/m*100)) : 0;
  const fmt=(v)=> money ? "$"+(Number(v)||0).toLocaleString("en-US") : (Number(v)||0);
  return (
    <div className="bg-[#f4f6f9] rounded-lg px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
        <span>{label}</span>
        <span className={pct>=100?"text-emerald-600":"text-slate-600"}>{fmt(actual)} / {fmt(meta)}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{width:pct+"%", background:pct>=100?"#16a34a":RP.navy}}></div>
      </div>
    </div>
  );
}

// Tarjeta del Cofre en el Inicio del agente
function CofreSemanal({ cofreConfig, cofreAperturas, agente, allData, onAbrir }){
  const [revelado,setRevelado]=useState(null);
  const cfg=cofreConfig||{};
  const niveles=cfg.niveles||[];
  const activo = cfg.activo!==false && niveles.some(cofreNivelTieneMetas);
  if(!activo) return null;

  const logro=calcularSemanaAgente(agente, allData);
  const semana=semanaActualKey();
  const apertura=(cofreAperturas||[]).find(a=>a.agente===agente && a.semana===semana);
  const maxNivel=cofreNivelMaxCumplido(niveles, logro);

  const abrir=()=>{
    if(!maxNivel || apertura) return;
    const premios=(maxNivel.premios||[]).filter(p=>p && p.texto && p.texto.trim());
    const premio = premios.length ? premios[Math.floor(Math.random()*premios.length)].texto : "🎉 ¡Felicidades, lo lograste!";
    setRevelado({ nivel:maxNivel, premio });
    onAbrir(agente, maxNivel, premio);
  };

  return (
    <div className="rounded-2xl bg-white border-2 border-amber-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 flex items-center justify-between">
        <div className="text-sm font-black text-amber-700"><Ico e="🎁" className="mr-1.5" />Cofre Impact Semanal</div>
        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Reinicia cada lunes</span>
      </div>
      <div className="p-4 space-y-3">
        {niveles.filter(cofreNivelTieneMetas).map(n=>{
          const pct=cofreProgresoNivel(n, logro);
          const cumplido=cofreNivelCumplido(n, logro);
          return (
            <div key={n.id} className="rounded-xl border border-[#e8edf3] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-black text-sm" style={{color:n.color}}>{n.emoji} {n.nombre}</div>
                <div className="text-xs font-black" style={{color:cumplido?"#16a34a":"#94a3b8"}}>{cumplido?<><Ico e="✅" className="mr-1" />Logrado</>:pct+"%"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Number(n.metaCitas)>0   && <CofreMiniMeta label="Citas"   actual={logro.citas}   meta={n.metaCitas} />}
                {Number(n.metaDemos)>0   && <CofreMiniMeta label="Demos"   actual={logro.demos}   meta={n.metaDemos} />}
                {Number(n.metaVentas)>0  && <CofreMiniMeta label="Ventas"  actual={logro.ventas}  meta={n.metaVentas} />}
                {Number(n.metaVolumen)>0 && <CofreMiniMeta label="Volumen" actual={logro.volumen} meta={n.metaVolumen} money />}
              </div>
            </div>
          );
        })}

        {apertura ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
            <div className="text-xs font-bold text-emerald-700">Ya abriste tu cofre esta semana</div>
            <div className="text-lg font-black text-emerald-800 mt-1">{apertura.emoji} {apertura.nivelNombre}</div>
            <div className="text-sm text-emerald-700 mt-1"><Ico e="🎉" className="mr-1.5" />Premio: <b>{apertura.premio}</b></div>
          </div>
        ) : revelado ? (
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
            <div className="text-3xl mb-1"><Ico e={revelado.nivel.emoji} size={26} className="text-[#C8A24A]" /></div>
            <div className="text-sm font-black text-amber-800">¡Abriste el {revelado.nivel.nombre}!</div>
            <div className="text-base font-black text-amber-900 mt-1">Premio: {revelado.premio}</div>
          </div>
        ) : maxNivel ? (
          <button onClick={abrir} className="w-full py-3 rounded-xl text-white font-black text-sm active:scale-95 transition" style={{background:"linear-gradient(90deg,#c8901f,#e0b53a)"}}>
            <Ico e="🔓" className="mr-1.5" />Abrir {maxNivel.emoji} {maxNivel.nombre}
          </button>
        ) : (
          <div className="text-center text-xs text-slate-400 font-bold py-1">Sigue trabajando — aún no alcanzas ningún cofre esta semana 💪</div>
        )}
      </div>
    </div>
  );
}

// Editor de un nivel del cofre (metas + premios)
function CofreNivelEditor({ nivel, onChange, onClose }){
  const [nombre,setNombre]=useState(nivel.nombre);
  const [mc,setMc]=useState(nivel.metaCitas||"");
  const [md,setMd]=useState(nivel.metaDemos||"");
  const [mv,setMv]=useState(nivel.metaVentas||"");
  const [mvo,setMvo]=useState(nivel.metaVolumen||"");
  const [premios,setPremios]=useState((nivel.premios||[]).map(p=>({...p})));
  const [nuevo,setNuevo]=useState("");

  const addPremio=()=>{ const t=nuevo.trim(); if(!t) return; setPremios(p=>[...p,{id:genId(),texto:t}]); setNuevo(""); };
  const editPremio=(id,t)=> setPremios(p=>p.map(x=>x.id===id?{...x,texto:t}:x));
  const delPremio=(id)=> setPremios(p=>p.filter(x=>x.id!==id));

  const guardar=()=>{
    onChange({ nombre:(nombre||"").trim()||nivel.nombre, metaCitas:Number(mc)||0, metaDemos:Number(md)||0, metaVentas:Number(mv)||0, metaVolumen:Number(mvo)||0, premios:premios.filter(p=>p.texto && p.texto.trim()) });
    onClose();
  };

  return (
    <div>
      <Field label="Nombre del cofre"><input className={inpLight} value={nombre} onChange={e=>setNombre(e.target.value)} /></Field>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 mt-2">Metas de la semana</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meta de citas"><input className={inpLight} inputMode="numeric" value={mc} onChange={e=>setMc(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" /></Field>
        <Field label="Meta de demos"><input className={inpLight} inputMode="numeric" value={md} onChange={e=>setMd(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" /></Field>
        <Field label="Meta de ventas"><input className={inpLight} inputMode="numeric" value={mv} onChange={e=>setMv(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" /></Field>
        <Field label="Meta de volumen ($)"><input className={inpLight} inputMode="numeric" value={mvo} onChange={e=>setMvo(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" /></Field>
      </div>
      <div className="text-[11px] text-slate-400 mb-3">Deja en 0 las metas que no apliquen a este cofre.</div>

      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Premios posibles</div>
      <div className="space-y-2 mb-3">
        {premios.length===0 && <div className="text-[11px] text-slate-400">Aún no hay premios. Agrega al menos uno.</div>}
        {premios.map(p=>(
          <div key={p.id} className="flex items-center gap-2">
            <input className={inpLight} value={p.texto} onChange={e=>editPremio(p.id,e.target.value)} />
            <button onClick={()=>delPremio(p.id)} className="text-red-400 font-bold text-sm shrink-0 px-2"><Ico e="✕" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input className={inpLight} value={nuevo} onChange={e=>setNuevo(e.target.value)} placeholder="Nuevo premio…" onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addPremio(); } }} />
        <button onClick={addPremio} className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0" style={{background:RP.navy}}>+ Agregar</button>
      </div>

      <button onClick={guardar} className="w-full py-3 rounded-xl text-white font-black text-sm" style={{background:RP.navy}}>Guardar cofre</button>
    </div>
  );
}

// Tarjeta de configuración del Cofre (dentro de Incentivos)
function CofreConfigCard({ cofreConfig, setCofreConfig, rolActivo }){
  const puede=puedeCrearIncentivosRol(rolActivo);
  const fallback = ()=>({ activo:true, niveles:COFRE_NIVELES_DEFAULT.map(n=>({...n,premios:[]})) });
  const cfg = (cofreConfig && cofreConfig.niveles) ? cofreConfig : fallback();
  const [editId,setEditId]=useState(null);

  const setNivel=(id, patch)=>{
    setCofreConfig(prev=>{
      const base = (prev && prev.niveles) ? prev : fallback();
      return {...base, niveles: base.niveles.map(n=>n.id===id?{...n,...patch}:n)};
    });
  };
  const toggleActivo=()=> setCofreConfig(prev=>{
    const base = (prev && prev.niveles) ? prev : fallback();
    return {...base, activo: base.activo===false };
  });

  const nivelEdit = cfg.niveles.find(n=>n.id===editId);

  return (
    <div className="rounded-2xl bg-white border-2 border-amber-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 flex items-center justify-between">
        <div>
          <div className="text-sm font-black text-amber-700"><Ico e="🎁" className="mr-1.5" />Cofre Impact Semanal</div>
          <div className="text-[11px] text-amber-600/80">Incentivo semanal · reinicia cada lunes · no se acumula</div>
        </div>
        {puede && <button onClick={toggleActivo} className={`px-3 py-1.5 rounded-full text-[11px] font-black ${cfg.activo!==false?"bg-emerald-100 text-emerald-700":"bg-slate-200 text-slate-500"}`}>{cfg.activo!==false?"Activo":"Apagado"}</button>}
      </div>
      <div className="p-4 space-y-2">
        {cfg.niveles.map(n=>{
          const metas=[
            Number(n.metaCitas)>0   && `${n.metaCitas} citas`,
            Number(n.metaDemos)>0   && `${n.metaDemos} demos`,
            Number(n.metaVentas)>0  && `${n.metaVentas} ventas`,
            Number(n.metaVolumen)>0 && `$${n.metaVolumen} vol.`,
          ].filter(Boolean).join(" · ") || "Sin metas definidas";
          const numPremios=(n.premios||[]).filter(p=>p && p.texto && p.texto.trim()).length;
          return (
            <div key={n.id} className="rounded-xl border border-[#e8edf3] p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black text-sm" style={{color:n.color}}>{n.emoji} {n.nombre}</div>
                <div className="text-[11px] text-slate-500 truncate">{metas}</div>
                <div className="text-[11px] text-slate-400">{numPremios} premio(s)</div>
              </div>
              {puede && <button onClick={()=>setEditId(n.id)} className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0" style={{background:RP.navy}}>Editar</button>}
            </div>
          );
        })}
        {!puede && <div className="text-[11px] text-slate-400">Solo el encargado puede editar los cofres.</div>}
      </div>

      {nivelEdit && (
        <Modal title={`${nivelEdit.emoji} ${nivelEdit.nombre}`} onClose={()=>setEditId(null)}>
          <CofreNivelEditor nivel={nivelEdit} onChange={(patch)=>setNivel(nivelEdit.id,patch)} onClose={()=>setEditId(null)} />
        </Modal>
      )}
    </div>
  );
}

// Botón / recordatorio de Respaldo mensual (Inicio del distribuidor)
function RespaldoBox({ allData, appts, callLog, respaldos, registrarRespaldo, rolActivo }){
  const puede=puedeExportarRol(rolActivo); // Distribuidor y Supervisor
  const [abierto,setAbierto]=useState(false);
  if(!puede) return null;

  const hoy=new Date();
  const mesActual=hoy.toISOString().slice(0,7); // YYYY-MM
  const yaRespaldado=(respaldos||[]).some(r=>r.mes===mesActual);
  const prev=new Date(hoy.getFullYear(), hoy.getMonth()-1, 1);
  const prevKey=prev.toISOString().slice(0,7);
  const nombreMes=(d)=> d.toLocaleDateString("es-MX",{month:"long",year:"numeric"});
  const destacar=!yaRespaldado;

  const generar=(tipo)=>{
    exportRespaldo(allData, appts, callLog, { tipo, mesKey: tipo==="mes"?prevKey:null, mesNombre: tipo==="mes"?nombreMes(prev):"" });
    registrarRespaldo(mesActual, tipo);
    setAbierto(false);
  };

  return (
    <div className={`rounded-2xl overflow-hidden shadow-sm border-2 ${destacar?"border-purple-300":"border-[#e8edf3]"}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${destacar?"bg-purple-50":"bg-white"}`}>
        <div>
          <div className="text-sm font-black text-[#5b21b6]"><Ico e="📦" className="mr-1.5" />Guardar Respaldo</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {destacar ? `Inicio de mes — guarda el respaldo de ${nombreMes(hoy)}` : <><Ico e="✅" className="mr-1" />Ya guardaste un respaldo este mes</>}
          </div>
        </div>
        <button onClick={()=>setAbierto(v=>!v)} className="px-3 py-2 rounded-lg text-xs font-black text-white shrink-0" style={{background:RP.navy}}>{abierto?"Cerrar":"Generar"}</button>
      </div>
      {abierto && (
        <div className="p-4 bg-white border-t border-[#e8edf3] space-y-2">
          <button onClick={()=>generar("completo")} className="w-full text-left px-4 py-3 rounded-xl border border-[#e5def4] bg-[#f4f6f9] active:scale-[0.99] transition">
            <div className="font-black text-sm text-[#1f2d3d]"><Ico e="📋" className="mr-1.5" />Respaldo completo</div>
            <div className="text-[11px] text-slate-500">Todo lo que hay ahora: citas, las 4 bases, historial y servicios.</div>
          </button>
          <button onClick={()=>generar("mes")} className="w-full text-left px-4 py-3 rounded-xl border border-[#e5def4] bg-[#f4f6f9] active:scale-[0.99] transition">
            <div className="font-black text-sm text-[#1f2d3d]"><Ico e="📅" className="mr-1.5" />Cierre de mes</div>
            <div className="text-[11px] text-slate-500">Solo la actividad de {nombreMes(prev)} (el mes que cerró).</div>
          </button>
        </div>
      )}
    </div>
  );
}

// Motor del PDF de respaldo (estilo Royal, Blob + pestaña — seguro en iPhone)
function exportRespaldo(allData, appts, callLog, opts){
  const o=opts||{};
  const esMes = o.tipo==="mes" && !!o.mesKey;
  const mesKey=o.mesKey;
  const enMes=(fechaISO)=>{ if(!esMes) return true; if(!fechaISO) return false; return String(fechaISO).slice(0,7)===mesKey; };
  const esc=(v)=> String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmtFecha=(iso)=>{ if(!iso) return ""; try{ return new Date(iso).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}); }catch(e){ return String(iso).slice(0,10); } };
  const estadoLabel=(e)=> (STATUS_COLORS[e] && STATUS_COLORS[e].label) || "Sin estado";

  function seccion(titulo, n, contenido){
    return `<div class="sec"><h2>${esc(titulo)} <span class="cnt">${n} registro${n===1?"":"s"}</span></h2>${contenido}</div>`;
  }
  function secVacia(titulo){
    return `<div class="sec"><h2>${esc(titulo)} <span class="cnt">0</span></h2><div class="muted" style="padding:8px 0">Sin registros.</div></div>`;
  }

  // CITAS
  const citas=(appts||[]).filter(a=>(a.tipo==="cita"||a._type==="cita") && enMes(a.fecha)).sort((x,y)=>new Date(y.fecha||0)-new Date(x.fecha||0));
  // SERVICIOS
  const servicios=(appts||[]).filter(a=>a.tipo==="servicio" && enMes(a.fecha)).sort((x,y)=>new Date(y.fecha||0)-new Date(x.fecha||0));
  // HISTORIAL (de todos los clientes)
  const clientesTodos=[
    ...(allData.agregados||[]),
    ...(allData.prospectos||[]),
    ...(allData.distribucion||[]),
    ...((allData.referidos||[]).flatMap(anf=>(anf.referidos||[]))),
  ];
  const histRows=[];
  clientesTodos.forEach(c=>{
    (c.historial||[]).forEach(h=>{
      if(!enMes(h.fecha)) return;
      histRows.push({ fecha:h.fecha, cliente:c.nombre||c.anfitrion||"(Sin nombre)", agente:h.agente||"", resultado:h.cita_resultado||h.resultado||h.tipo||"", nota:h.nota||h.observacion||"" });
    });
  });
  histRows.sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));

  // BASES (en modo mes: solo clientes con actividad ese mes)
  const baseRows=(arr)=> (arr||[]).filter(c=>!c.eliminado && (!esMes || (c.historial||[]).some(h=>enMes(h.fecha))));
  const agregados=baseRows(allData.agregados);
  const prospectos=baseRows(allData.prospectos);
  const distribucion=baseRows(allData.distribucion);
  const referidosAnf=(allData.referidos||[]).filter(anf=>!anf.eliminado && (!esMes || (anf.referidos||[]).some(r=>(r.historial||[]).some(h=>enMes(h.fecha)))));

  const tablaClientes=(titulo, arr)=>{
    if(!arr.length) return secVacia(titulo);
    const filas=arr.map(c=>`<tr>
      <td class="b">${esc(c.nombre||c.anfitrion||"(Sin nombre)")}</td>
      <td>${esc(c.telefono||"")}</td>
      <td>${esc(c.ciudad||c.anfitrion_ciudad||"")}</td>
      <td>${esc(c.cp||"")}</td>
      <td><span class="tag">${esc(estadoLabel(c.estado))}</span></td>
      <td class="muted">${esc(c.observaciones||"")}</td></tr>`).join("");
    return seccion(titulo, arr.length, `<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Ciudad</th><th>C.P.</th><th>Estado</th><th>Observaciones</th></tr></thead><tbody>${filas}</tbody></table>`);
  };
  const tablaReferidos=(arr)=>{
    if(!arr.length) return secVacia("Programa Referidos");
    let total=0;
    const bloques=arr.map(anf=>{
      const refs=(anf.referidos||[]);
      total+=refs.length;
      const filas=refs.map(r=>`<tr><td class="b">${esc(r.nombre||"")}</td><td>${esc(r.telefono||"")}</td><td>${esc(r.ciudad||"")}</td><td><span class="tag">${esc(estadoLabel(r.estado))}</span></td></tr>`).join("");
      return `<div class="anf">Anfitrión: <b>${esc(anf.anfitrion||"")}</b>${anf.regalo?` · Regalo: ${esc(anf.regalo)}`:""}</div>
      <table><thead><tr><th>Referido</th><th>Teléfono</th><th>Ciudad</th><th>Estado</th></tr></thead><tbody>${filas||'<tr><td colspan="4" class="muted">Sin referidos</td></tr>'}</tbody></table>`;
    }).join("");
    return seccion("Programa Referidos", total, bloques);
  };
  const tablaCitas=(titulo, arr)=>{
    if(!arr.length) return secVacia(titulo);
    const filas=arr.map(a=>`<tr><td>${esc(fmtFecha(a.fecha))}</td><td class="b">${esc(a.cliente||a.nombre||"")}</td><td>${esc(a.telefono||"")}</td><td>${esc(a.direccion||"")}</td><td>${esc(a.agente||"")}</td></tr>`).join("");
    return seccion(titulo, arr.length, `<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Dirección</th><th>Agente</th></tr></thead><tbody>${filas}</tbody></table>`);
  };
  const tablaServicios=(arr)=>{
    if(!arr.length) return secVacia("Servicios");
    const filas=arr.map(a=>`<tr><td>${esc(fmtFecha(a.fecha))}</td><td class="b">${esc(a.cliente||a.nombre||"")}</td><td>${esc(a.telefono||"")}</td><td><span class="tag">${esc(a.servicioResultado||"pendiente")}</span></td><td class="muted">${esc(a.notas||a.nota||"")}</td></tr>`).join("");
    return seccion("Servicios", arr.length, `<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Estado</th><th>Notas</th></tr></thead><tbody>${filas}</tbody></table>`);
  };
  const tablaHistorial=(arr)=>{
    if(!arr.length) return secVacia("Historial de llamadas");
    const filas=arr.map(h=>`<tr><td>${esc(fmtFecha(h.fecha))}</td><td class="b">${esc(h.cliente)}</td><td>${esc(h.agente)}</td><td><span class="tag">${esc(h.resultado)}</span></td><td class="muted">${esc(h.nota)}</td></tr>`).join("");
    return seccion("Historial de llamadas", arr.length, `<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Agente</th><th>Resultado</th><th>Nota</th></tr></thead><tbody>${filas}</tbody></table>`);
  };
  const tablaCallLog=()=>{
    const entries=Object.entries(callLog||{}).filter(([d])=>enMes(d+"T00:00:00")).sort((a,b)=>String(b[0]).localeCompare(String(a[0])));
    if(!entries.length) return "";
    const filas=entries.map(([d,n])=>`<tr><td>${esc(fmtFecha(d+"T00:00:00"))}</td><td class="b">${esc(sumDia(n))}</td></tr>`).join("");
    return seccion("Conteo diario de llamadas", entries.length, `<table><thead><tr><th>Día</th><th>Llamadas</th></tr></thead><tbody>${filas}</tbody></table>`);
  };

  const titulo = esMes ? `Cierre de mes — ${esc(o.mesNombre||mesKey)}` : "Respaldo completo";
  const totalGeneral = citas.length+agregados.length+prospectos.length+distribucion.length+referidosAnf.length+servicios.length+histRows.length;

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Royal Prestige — ${titulo}</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
  body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:24px;color:#1f2d3d;background:#fff}
  .bar{background:#5b21b6;color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:18px}
  h1{font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;margin:0}
  h1 span{font-style:italic;color:#a78bfa}
  .sub{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c4b5fd;margin-top:6px}
  .sec{margin:0 0 22px}
  .sec h2{font-size:15px;color:#3b0d8f;border-bottom:2px solid #e8edf3;padding-bottom:6px;margin:18px 0 10px}
  .cnt{font-size:11px;color:#94a3b8;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
  th{background:#3b0d8f;color:#fff;padding:8px 10px;text-align:left;font-weight:700}
  td{padding:7px 10px;border-bottom:1px solid #eef2f6;vertical-align:top}
  tr:nth-child(even) td{background:#f7f9fc}
  .b{font-weight:700;color:#1f2d3d}
  .muted{color:#8a93a3;font-style:italic;font-size:10px}
  .tag{background:#5b21b6;color:#fff;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap}
  .anf{margin:10px 0 4px;font-size:12px;color:#3b0d8f}
  @media print{body{padding:10px}.noprint{display:none!important}}</style></head>
  <body>
  <div class="bar"><h1>Royal <span>Prestige</span> — ${titulo}</h1>
  <div class="sub">Telemarketing Impact Enterprises · ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})} · ${totalGeneral} registros en total</div></div>
  <div class="noprint" style="position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:99">
    <button onclick="window.print()" style="background:#5b21b6;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer">🖨️ Guardar PDF</button>
    <button onclick="window.close();history.back();" style="background:#e2e8f0;color:#475569;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer">✕ Cerrar</button>
  </div>
  ${tablaCitas("Citas", citas)}
  ${tablaClientes("Base · Clientes Agregados", agregados)}
  ${tablaReferidos(referidosAnf)}
  ${tablaClientes("Base · Prospección", prospectos)}
  ${tablaClientes("Base · Bajo Distribución", distribucion)}
  ${tablaHistorial(histRows)}
  ${tablaCallLog()}
  ${tablaServicios(servicios)}
  </body></html>`;

  try{
    const blob=new Blob([html],{type:"text/html"});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,"_blank");
    if(!w){
      const a=document.createElement("a");
      a.href=url; a.download=`RoyalPrestige_Respaldo_${esMes?mesKey:hoyLocal()}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){ alert("No se pudo generar el respaldo: "+((e && e.message)||e)); }
}


// ─── CLIENT FORM ─────────────────────────────────────────────
function ClientForm({ initial, onSave, onClose, type }) {
  const [d, setD] = useState(initial || (
    type==="referido"?emptyReferido(): type==="prospecto"?emptyProspecto(): type==="distribucion"?emptyDistribucion(): emptyClient()
  ));
  const set = (k,v)=>setD(p=>({...p,[k]:v}));

  if (type==="referido") return (
    <form onSubmit={e=>{e.preventDefault(); if(!(d.anfitrion||"").trim()){ alert("✍️ Escribe el nombre del anfitrión — no se guardan números sin nombre."); return; } if(soloDigitos(d.anfitrion_telefono).length<10){ alert("📞 Debes ingresar el teléfono del anfitrión (al menos 10 dígitos) para guardar."); return; } const refsSin=(d.referidos||[]).some(r=>soloDigitos(r.telefono).length>=10 && !(r.nombre||"").trim()); if(refsSin){ alert("✍️ Hay referidos con teléfono pero SIN nombre — ponles nombre o quita el número."); return; } onSave(d);}}>
      <Field label="Nombre del Anfitrión" required><input className={inpLight} value={d.anfitrion} onChange={e=>set("anfitrion",e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono anfitrión"><input className={inpLight} value={d.anfitrion_telefono||""} onChange={e=>set("anfitrion_telefono",e.target.value)} /></Field>
        <Field label="Ciudad"><input className={inpLight} placeholder="ej. Temple, Waco…" value={d.anfitrion_ciudad||""} onChange={e=>set("anfitrion_ciudad",e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuenta #"><input className={inpLight} value={d.anfitrion_cuenta||""} onChange={e=>set("anfitrion_cuenta",e.target.value)} /></Field>
        <Field label="Detalle"><input className={inpLight} value={d.anfitrion_detalle||""} onChange={e=>set("anfitrion_detalle",e.target.value)} /></Field>
      </div>
      <Field label="Regalo escogido"><input className={inpLight} value={d.regalo} onChange={e=>set("regalo",e.target.value)} /></Field>
      <div className="mt-4 mb-2 text-xs font-bold text-[#5b21b6] uppercase tracking-wider">Referidos</div>
      {d.referidos.map((r,i)=>(
        <div key={i} className="bg-[#f4f6f9] rounded-xl p-3 mb-3 border border-[#e5def4]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-[#7c3aed]">Referido #{i+1}</div>
            {d.referidos.length>1 && <button type="button" onClick={()=>set("referidos",d.referidos.filter((_,j)=>j!==i))} className="text-xs text-red-400 font-bold"><Ico e="✕" className="mr-1.5" />Quitar</button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre"><input className={inpLight} value={r.nombre} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],nombre:e.target.value};set("referidos",rs);}}/></Field>
            <Field label="Parentesco"><input className={inpLight} placeholder="ej. Hermana, Vecino…" value={r.parentesco||""} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],parentesco:e.target.value};set("referidos",rs);}}/></Field>
          </div>
          <Field label="Teléfono"><input className={inpLight} value={r.telefono} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],telefono:e.target.value};set("referidos",rs);}}/></Field>
          <Field label="Dirección"><input className={inpLight} value={r.direccion} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],direccion:e.target.value};set("referidos",rs);}}/></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ciudad"><input className={inpLight} placeholder="ej. Temple, Dallas…" value={r.ciudad||""} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],ciudad:e.target.value};set("referidos",rs);}}/></Field>
            <Field label="Código postal"><input className={inpLight} placeholder="ej. 76501" inputMode="numeric" maxLength={5} value={r.cp||""} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],cp:e.target.value.replace(/\D/g,"").slice(0,5)};set("referidos",rs);}}/></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Producto"><input className={inpLight} placeholder="ej. Juego Innové…" value={r.producto} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],producto:e.target.value};set("referidos",rs);}}/></Field>
            <Field label="Observaciones"><input className={inpLight} value={r.observaciones} onChange={e=>{const rs=[...d.referidos];rs[i]={...rs[i],observaciones:e.target.value};set("referidos",rs);}}/></Field>
          </div>
        </div>
      ))}
      <button type="button" onClick={()=>set("referidos",[...d.referidos,{nombre:"",parentesco:"",telefono:"",direccion:"",ciudad:"",cp:"",producto:"",observaciones:"",detalles:"",estado:"sin_estado",ultimaNota:"",notas:[],historial:[],proximo_seguimiento:"",creado:new Date().toISOString(),actualizado:""}])} className="text-sm text-[#7c3aed] font-bold mb-4 hover:underline">+ Agregar referido</button>
      <div className="flex gap-2 pt-2"><PrimaryBtn type="submit"><Ico e="💾" className="mr-1.5" />Guardar</PrimaryBtn><button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-[#f4f6f9]">Cancelar</button></div>
    </form>
  );

  return (
    <form onSubmit={e=>{e.preventDefault(); if(!(d.nombre||"").trim()){ alert("✍️ Escribe el nombre del cliente — no se guardan números sin nombre."); return; } if(soloDigitos(d.telefono).length<10){ alert("📞 Debes ingresar un número de teléfono válido (al menos 10 dígitos) para guardar este registro."); return; } onSave(d);}}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required><input className={inpLight} value={d.nombre} onChange={e=>set("nombre",e.target.value)} /></Field>
        <Field label="Teléfono" required><input className={inpLight} value={d.telefono} onChange={e=>set("telefono",e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuenta #"><input className={inpLight} value={d.cuenta||""} onChange={e=>set("cuenta",e.target.value)} /></Field>
        <Field label="Producto"><input className={inpLight} placeholder="ej. Juego Innové, Filtro…" value={d.producto} onChange={e=>set("producto",e.target.value)} /></Field>
      </div>
      <Field label="Dirección"><input className={inpLight} value={d.direccion} onChange={e=>set("direccion",e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad"><input className={inpLight} placeholder="ej. Temple, Waco…" value={d.ciudad||""} onChange={e=>set("ciudad",e.target.value)} /></Field>
        <Field label="Código Postal"><input className={inpLight} placeholder="ej. 76501" inputMode="numeric" maxLength={5} value={d.cp||""} onChange={e=>set("cp",e.target.value.replace(/\D/g,"").slice(0,5))} /></Field>
      </div>
      {type==="prospecto" && <Field label="Fuente del dato"><input className={inpLight} placeholder="ej. Facebook, Referido, Evento…" value={d.fuente||""} onChange={e=>set("fuente",e.target.value)} /></Field>}
      {type==="distribucion" && <Field label="Fecha última compra"><input type="date" className={inpLight} value={d.ultima_compra||""} onChange={e=>set("ultima_compra",e.target.value)} /></Field>}
      {/* ASIGNACIÓN + SEGUIMIENTO */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Asignar a">
          <select className={inpLight} value={d.asignado_a||""} onChange={e=>set("asignado_a",e.target.value)}>
            <option value="">Sin asignar</option>
            {AGENTES.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Próximo seguimiento"><input type="date" className={inpLight} value={d.proximo_seguimiento||""} onChange={e=>set("proximo_seguimiento",e.target.value)} /></Field>
      </div>
      <Field label="Observaciones del distribuidor"><textarea className={inpLight+" resize-none"} rows={2} value={d.observaciones} onChange={e=>set("observaciones",e.target.value)} /></Field>
      <Field label="Detalles adicionales"><textarea className={inpLight+" resize-none"} rows={2} value={d.detalles} onChange={e=>set("detalles",e.target.value)} /></Field>
      <div className="flex gap-2 pt-2"><PrimaryBtn type="submit"><Ico e="💾" className="mr-1.5" />Guardar</PrimaryBtn><button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-[#f4f6f9]">Cancelar</button></div>
    </form>
  );
}

// ─── APPOINTMENT FORM (4 tipos con campos dinámicos) ──────────
const TYPE_OPTIONS = [
  { v:"cita",     ico:"📋", l:"Cita",         desc:"Azul · Google Calendar",    color:"#5b21b6", pill:"bg-purple-100 text-purple-800"    },
  { v:"llamada",  ico:"📞", l:"Recordatorio", desc:"Naranja · Google Calendar",  color:"#ea580c", pill:"bg-orange-100 text-orange-800"},
  { v:"cocinada", ico:"🍳", l:"Cocinada",     desc:"Morado · Google Calendar",   color:"#7c3aed", pill:"bg-purple-100 text-purple-800"},
  { v:"servicio", ico:"🔧", l:"Servicio",     desc:"Rojo · Google Calendar",     color:"#dc2626", pill:"bg-red-100 text-red-800"      },
  { v:"personal", ico:"🟢", l:"Personal",     desc:"Verde · Google Calendar",    color:"#16a34a", pill:"bg-green-100 text-green-800"  },
  { v:"entrevista",ico:"🤝", l:"Entrevista",   desc:"Teal · Reclutamiento",       color:"#0d9488", pill:"bg-teal-100 text-teal-800"   },
];

// ── Correos del equipo — edita aquí si cambian ──────────────
const TEAM_CONTACTS = [
  { ico:"👑", label:"Tomas (Admin)",     email:"florestomas323@gmail.com",          default:{ cita:true,  llamada:false, cocinada:true,  servicio:true,  entrevista:true } },
  { ico:"📞", label:"Angiemar Paredes",   email:"paredesangiemar@gmail.com",        default:{ cita:true,  llamada:true,  cocinada:true,  servicio:true,  entrevista:true } },
];

function AppointmentForm({ client, onSave, onClose, loading, forceTipo, agenteActivo="" }) {
  const today = new Date().toISOString().slice(0,16);

  // Build default attendees based on event type
  const buildDefaultAttendees = (tipo) =>
    TEAM_CONTACTS.filter(c => c.default[tipo||"cita"]).map(c => c.email);

  const [d, setD] = useState({
    nombre:client?.nombre||"", telefono:client?.telefono||"",
    direccion:client?.direccion||"", ciudad:client?.ciudad||"", cp:client?.cp||"",
    producto:client?.producto||"",
    cuenta:client?.cuenta||"", agente:agenteActivo||"", fecha:today, notas:"",
    tipo:forceTipo||"cita",
    invitados:["",""],
    attendees: buildDefaultAttendees(forceTipo||"cita"),
    extraEmail:"",
  });
  const set=(k,v)=>setD(p=>({...p,[k]:v}));
  const cfg = TYPE_OPTIONS.find(t=>t.v===d.tipo) || (d.tipo==="reset"?{v:"reset",ico:"🔄", l:"Re-agendar cita",desc:"Naranja · Google Calendar",color:"#f59e0b",pill:"bg-amber-100 text-amber-800"}:TYPE_OPTIONS[0]);

  // When tipo changes, reset attendees to defaults for new type
  const changeTipo = (tipo) => {
    setD(p=>({...p, tipo, attendees: buildDefaultAttendees(tipo) }));
  };

  const toggleAttendee = (email) => {
    setD(p=>({...p,
      attendees: p.attendees.includes(email)
        ? p.attendees.filter(e=>e!==email)
        : [...p.attendees, email]
    }));
  };

  const addExtra = () => {
    const em = d.extraEmail.trim().toLowerCase();
    if (!em || !em.includes("@")) return;
    if (!d.attendees.includes(em)) setD(p=>({...p, attendees:[...p.attendees,em], extraEmail:""}));
    else setD(p=>({...p, extraEmail:""}));
  };

  const removeAttendee = (email) => {
    // only allow removing non-team emails freely; team ones toggle
    setD(p=>({...p, attendees:p.attendees.filter(e=>e!==email)}));
  };

  return (
    <form onSubmit={e=>{e.preventDefault();onSave(d);}}>
      {/* TYPE SELECTOR */}
      {!forceTipo && (
        <div className="mb-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de evento</div>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map(o=>(
              <button key={o.v} type="button" onClick={()=>changeTipo(o.v)}
                className={`flex flex-col gap-0.5 p-3 rounded-xl border-2 text-left transition ${d.tipo===o.v?"border-current":""}`}
                style={d.tipo===o.v?{borderColor:o.color,background:o.color+"12"}:{borderColor:"#e5def4"}}>
                <span className="font-black text-sm" style={d.tipo===o.v?{color:o.color}:{color:"#1f2d3d"}}>{o.l}</span>
                <span className="text-[10px] text-slate-400">{o.desc}</span>
              </button>
            ))}
          </div>
          <div className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-lg inline-block ${cfg.pill}`}>{cfg.l} guardará en Calendar</div>
        </div>
      )}
      {forceTipo && (
        <div className="mb-4 rounded-xl p-3 text-sm font-bold text-white" style={{background:cfg.color}}>
          {cfg.l} — se guardará en Google Calendar
        </div>
      )}

      {/* PERSONAL: solo descripción, dirección y detalles (simple) */}
      {d.tipo==="personal" ? (
        <>
          <Field label="Descripción" required>
            <input className={inpLight} value={d.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="ej. Cita médica, Gimnasio, Banco…" />
          </Field>
          <Field label="Dirección"><AddressAutocomplete value={d.direccion} onChange={v=>set("direccion",v)} onSelect={({direccion,ciudad,cp})=>setD(p=>({...p,direccion,ciudad:ciudad||p.ciudad,cp:cp||p.cp}))} placeholder="opcional" /></Field>
          <Field label="Detalles"><textarea className={inpLight+" resize-none"} rows={2} value={d.notas} onChange={e=>set("notas",e.target.value)} placeholder="detalles adicionales (opcional)" /></Field>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Fecha y hora" required><input type="datetime-local" className={inpLight} value={d.fecha} onChange={e=>set("fecha",e.target.value)} /></Field>
          </div>
        </>
      ) : (
      <>
      {/* COMMON FIELDS */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={d.tipo==="cocinada"?"Nombre anfitrión":"Nombre cliente"} required>
          <input className={inpLight} value={d.nombre} onChange={e=>set("nombre",e.target.value)} />
        </Field>
        <Field label="Teléfono"><input className={inpLight} value={d.telefono} onChange={e=>set("telefono",e.target.value)} /></Field>
      </div>
      <Field label="Dirección"><AddressAutocomplete value={d.direccion} onChange={v=>set("direccion",v)} onSelect={({direccion,ciudad,cp})=>setD(p=>({...p,direccion,ciudad:ciudad||p.ciudad,cp:cp||p.cp}))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad"><input className={inpLight} value={d.ciudad||""} onChange={e=>set("ciudad",e.target.value)} placeholder="ej. Temple, Dallas…" /></Field>
        <Field label="Código postal"><input className={inpLight} value={d.cp||""} onChange={e=>set("cp",e.target.value)} placeholder="ej. 76501" /></Field>
      </div>

      {/* SERVICIO: cuenta # */}
      {d.tipo==="servicio" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Producto / Servicio"><input className={inpLight} placeholder="ej. Filtro, Cookware…" value={d.producto} onChange={e=>set("producto",e.target.value)} /></Field>
          <Field label="Número de cuenta" required><input className={inpLight} value={d.cuenta} onChange={e=>set("cuenta",e.target.value)} /></Field>
        </div>
      )}
      {d.tipo!=="servicio" && (
        <Field label="Producto"><input className={inpLight} placeholder="ej. Juego Innové…" value={d.producto} onChange={e=>set("producto",e.target.value)} /></Field>
      )}

      {/* COCINADA: invitados */}
      {d.tipo==="cocinada" && (
        <div className="mb-3">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-2">Invitados</div>
          <div className="space-y-2">
            {d.invitados.map((inv,i)=>(
              <div key={i} className="flex gap-2 items-center">
                <input className={inpLight+" flex-1"} placeholder={`Invitado ${i+1}`} value={inv}
                  onChange={e=>{const arr=[...d.invitados];arr[i]=e.target.value;set("invitados",arr);}} />
                {d.invitados.length>2 && (
                  <button type="button" onClick={()=>set("invitados",d.invitados.filter((_,j)=>j!==i))}
                    className="text-red-400 font-bold text-lg px-1"><Ico e="✕" /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={()=>set("invitados",[...d.invitados,""])}
            className="mt-2 text-xs text-purple-600 font-bold hover:underline">+ Agregar invitado</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha y hora" required><input type="datetime-local" className={inpLight} value={d.fecha} onChange={e=>set("fecha",e.target.value)} /></Field>
        <Field label="Vendedor/a"><input className={inpLight} placeholder="quién atiende" value={d.agente} onChange={e=>set("agente",e.target.value)} /></Field>
      </div>
      <Field label="Notas"><textarea className={inpLight+" resize-none"} rows={2} value={d.notas} onChange={e=>set("notas",e.target.value)} /></Field>
      </>
      )}

      {/* ── ATTENDEES SECTION ── */}
      <div className="mb-4 mt-1">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          <Ico e="📨" className="mr-1.5" />Notificar en Google Calendar
        </div>

        {/* Team checkboxes */}
        <div className="space-y-2 mb-3">
          {TEAM_CONTACTS.map(tc=>{
            const on = d.attendees.includes(tc.email);
            return (
              <label key={tc.email} onClick={()=>toggleAttendee(tc.email)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition select-none ${on?"border-[#5b21b6] bg-[#5b21b6]/5":"border-[#e8edf3] bg-white hover:border-[#e5def4]"}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${on?"border-[#5b21b6] bg-[#5b21b6]":"border-[#e5def4] bg-white"}`}>
                  {on && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#1f2d3d] leading-tight">{tc.label}</div>
                  <div className="text-xs text-slate-400 truncate">{tc.email}</div>
                </div>
                {on && <span className="text-[10px] font-bold text-[#5b21b6] bg-[#5b21b6]/10 px-2 py-0.5 rounded-full shrink-0"><Ico e="✓" className="mr-1.5" />Invitado</span>}
              </label>
            );
          })}
        </div>

        {/* Extra email add */}
        <div className="flex gap-2">
          <input className={inpLight+" flex-1 text-xs"} type="email"
            placeholder="Agregar otro correo…"
            value={d.extraEmail} onChange={e=>set("extraEmail",e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();addExtra();} }} />
          <button type="button" onClick={addExtra}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0 hover:brightness-110"
            style={{background:RP.navy}}>+ Add</button>
        </div>

        {/* Extra (non-team) attendees */}
        {d.attendees.filter(e=>!TEAM_CONTACTS.map(t=>t.email).includes(e)).length>0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {d.attendees.filter(e=>!TEAM_CONTACTS.map(t=>t.email).includes(e)).map(e=>(
              <span key={e} className="inline-flex items-center gap-1 bg-[#f4f6f9] text-[#1f2d3d] text-xs font-bold px-2.5 py-1 rounded-full border border-[#e5def4]">
                <Ico e="✉" className="mr-1.5" />{e}
                <button type="button" onClick={()=>removeAttendee(e)} className="text-red-400 ml-1 hover:text-red-600 font-bold"><Ico e="✕" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {d.attendees.length>0 && (
          <div className="mt-2 text-xs text-slate-400">
            Se enviará invitación a {d.attendees.length} persona(s)
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          style={{background:cfg.color}}>{loading?<><Ico e="⏳" className="mr-1" />Guardando…</>:<><Ico e="📅" className="mr-1" />Guardar en Google Calendar</>}</button>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-[#f4f6f9]">Cancelar</button>
      </div>
    </form>
  );
}

const EVENT_CONFIG = {
  cita:        { emoji:"📋", label:"Cita",                    colorId:"7",  title: n=>`📋 Cita - ${n}` },         // azul (pavo real)
  llamada:     { emoji:"📞", label:"Recordatorio",            colorId:"6",  title: n=>`📞 Recordatorio - ${n}` }, // naranja (mandarina)
  cocinada:    { emoji:"🍳", label:"Cocinada",                colorId:"3",  title: n=>`🍳 Cocinada - ${n}` },     // morado (uva)
  servicio:    { emoji:"🔧", label:"Servicio",                colorId:"11", title: n=>`🔧 Servicio - ${n}` },     // rojo (tomate)
  seguimiento: { emoji:"📅", label:"Seguimiento",             colorId:"6",  title: n=>`📅 Seguimiento - ${n}` },  // naranja (mandarina)
  reset:       { emoji:"🔄", label:"Re-agendar cita",         colorId:"6",  title: n=>`🔄 Re-agendar - ${n}` },   // naranja (mandarina)
  recordatorio:{ emoji:"🔔", label:"Recordatorio especial",   colorId:"6",  title: n=>`🔔 Recordatorio - ${n}` }, // naranja (mandarina)
  pendiente:   { emoji:"⏳", label:"Pendiente por llamar",    colorId:"6",  title: n=>`⏳ Pendiente - ${n}` },    // naranja (mandarina)
  personal:    { emoji:"🟢", label:"Personal",                colorId:"10", title: n=>`🟢 Personal - ${n}` },     // verde (albahaca)
  entrevista:  { emoji:"🤝", label:"Entrevista",              colorId:"9",  title: n=>`🤝 Entrevista - ${n}` },  // azul (arándano)
};
async function createCalendarEvent(appt) {
  const start  = new Date(appt.fecha);
  const end    = new Date(start.getTime() + 3600000);
  const cfg    = EVENT_CONFIG[appt.tipo] || EVENT_CONFIG.cita;
  const guestList   = (appt.invitados||[]).filter(Boolean).join(", ");
  // All attendees selected in the form
  const attendeeList = (appt.attendees||[]).filter(Boolean);
  const attendeeLine = attendeeList.length
    ? `Asistentes (enviar invitación a): ${attendeeList.join(", ")}`
    : "Asistente: paredesangiemar@gmail.com";
  try {
    const resp = await fetch("/api/anthropic", {
      method:"POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:"claude-sonnet-4-5", max_tokens:1000,
        system:"Agendas eventos en Google Calendar. Cuando te pidan crear un evento con múltiples asistentes, agrégalos todos como attendees/invitados al evento.",
        messages:[{role:"user", content:`Crea evento en Google Calendar:
Título: ${cfg.title(appt.nombre)}
Inicio: ${start.toISOString()} | Fin: ${end.toISOString()}
Timezone: America/Chicago
${attendeeLine}
Descripción: Tel: ${appt.telefono} | Producto: ${appt.producto} | Dir: ${appt.direccion} | Notas: ${appt.notas} | Vendedor: ${appt.agente}${appt.cuenta?` | Cuenta: ${appt.cuenta}`:""}${guestList?` | Invitados cocinada: ${guestList}`:""}
ColorId: ${cfg.colorId}
Por favor agrega a TODOS los correos de la lista como attendees del evento.`}],
        mcp_servers:[{type:"url", url:"https://calendarmcp.googleapis.com/mcp/v1", name:"google-calendar"}]
      })
    });
    await resp.json(); return true;
  } catch { return false; }
}

// ─── AI EXTRACTOR ─────────────────────────────────────────────
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
//  IMPORTADOR MASIVO  \u00b7  CSV y PDF  \u00b7  SIN IA, sin costo de API
//  ---------------------------------------------------------------
//  \u00b7 CSV: se lee entero en el propio tel\u00e9fono.
//  \u00b7 PDF de texto: se extrae el texto con sus coordenadas y se
//    reconstruyen las filas y columnas de la tabla.
//  \u00b7 PDF escaneado (solo im\u00e1genes): no hay texto que leer \u2014 se avisa
//    y se sugiere el importador con IA, que s\u00ed puede verlo.
//  El CANAL (agregado / distribuci\u00f3n / referido / prospecto) puede
//  venir en una columna: cada fila se guarda donde le toca.
//  Las columnas que no se mapean NO se pierden: se guardan en
//  "otros detalles" con su nombre original.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

// Divide una l\u00ednea de CSV respetando comillas y el separador detectado.
function partirLineaCSV(linea, sep){
  const out=[]; let campo=""; let enComillas=false;
  for(let i=0;i<linea.length;i++){
    const c=linea[i];
    if(enComillas){
      if(c==='"'){ if(linea[i+1]==='"'){ campo+='"'; i++; } else enComillas=false; }
      else campo+=c;
    } else {
      if(c==='"') enComillas=true;
      else if(c===sep){ out.push(campo); campo=""; }
      else campo+=c;
    }
  }
  out.push(campo);
  return out.map(x=>x.trim());
}

// Texto CSV \u2192 { columnas, filas }
function leerCSV(texto){
  let t=String(texto||"").replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const primera=t.split("\n")[0]||"";
  const cand=[",",";","\t","|"];
  let sep=","; let mejor=-1;
  cand.forEach(c=>{ const n=partirLineaCSV(primera,c).length; if(n>mejor){ mejor=n; sep=c; } });
  // Une l\u00edneas partidas por saltos dentro de comillas
  const lineas=[]; let actual=""; let comillas=0;
  t.split("\n").forEach(l=>{
    const n=(l.match(/"/g)||[]).length;
    actual = actual ? actual+"\n"+l : l;
    comillas+=n;
    if(comillas%2===0){ lineas.push(actual); actual=""; comillas=0; }
  });
  if(actual) lineas.push(actual);
  const utiles=lineas.filter(l=>l.trim()!=="");
  if(!utiles.length) return { columnas:[], filas:[], sep };
  const columnas=nombrarColumnas(partirLineaCSV(utiles[0],sep));
  const filas=utiles.slice(1).map(l=>{
    const celdas=partirLineaCSV(l,sep);
    const o={}; columnas.forEach((c,i)=>{ o[c]= celdas[i]!==undefined ? celdas[i] : ""; });
    return o;
  }).filter(f=>Object.values(f).some(v=>String(v).trim()!==""));
  return { columnas, filas, sep };
}

// Evita columnas vac\u00edas o repetidas (romper\u00edan el mapeo).
function nombrarColumnas(brutas){
  const vistas={}; 
  return (brutas||[]).map((c,i)=>{
    let n=String(c||"").trim() || `Columna ${i+1}`;
    if(vistas[n]!==undefined){ vistas[n]++; n=`${n} (${vistas[n]})`; } else vistas[n]=1;
    return n;
  });
}

// \u2500\u2500\u2500 PDF \u2192 filas de tabla \u2500\u2500\u2500
// pdf.js entrega cada trozo de texto con su posici\u00f3n (x,y). Agrupamos por
// altura para formar filas, y ordenamos por x para formar las columnas.
async function leerPDF(arrayBuffer, onProgreso){
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const filasCrudas=[];
  for(let np=1; np<=doc.numPages; np++){
    if(onProgreso) onProgreso(np, doc.numPages);
    const pagina = await doc.getPage(np);
    const contenido = await pagina.getTextContent();
    const piezas = contenido.items
      .filter(it => it && typeof it.str === "string" && it.str.trim() !== "")
      .map(it => ({ t: it.str.trim(), x: it.transform[4], y: it.transform[5] }));
    // Agrupar por l\u00ednea: misma "y" con tolerancia (el texto de una fila
    // rara vez queda exactamente a la misma altura).
    const lineas=[];
    piezas.forEach(pz=>{
      const l = lineas.find(L => Math.abs(L.y - pz.y) <= 3.2);
      if(l){ l.piezas.push(pz); l.y=(l.y*l.piezas.length + pz.y)/(l.piezas.length+1); }
      else lineas.push({ y: pz.y, piezas:[pz] });
    });
    lineas.sort((a,b)=> b.y - a.y);   // en PDF la y crece hacia arriba
    lineas.forEach(L=>{
      L.piezas.sort((a,b)=> a.x - b.x);
      // Unir trozos muy pegados (una misma palabra partida por el PDF)
      const celdas=[]; let acc=null;
      L.piezas.forEach(pz=>{
        if(acc && (pz.x - acc.xFin) < 6){ acc.t += (pz.x - acc.xFin > 1 ? " " : "") + pz.t; acc.xFin = pz.x + pz.t.length*4.2; }
        else { if(acc) celdas.push(acc); acc={ t:pz.t, x:pz.x, xFin: pz.x + pz.t.length*4.2 }; }
      });
      if(acc) celdas.push(acc);
      if(celdas.length) filasCrudas.push(celdas.map(c=>c.t));
    });
  }
  return filasCrudas;
}

// Campos del CRM a los que se puede mapear una columna.
const CAMPOS_IMP = [
  { k:"",              l:"\u2014 Otros detalles \u2014" },
  { k:"nombre",        l:"Nombre" },
  { k:"apellido",      l:"Apellido" },
  { k:"canal",         l:"CANAL (agregado/distrib/ref/prosp)" },
  { k:"cuenta",        l:"N\u00famero de cuenta" },
  { k:"telefono",      l:"Tel\u00e9fono" },
  { k:"telefonoMovil", l:"Tel\u00e9fono m\u00f3vil" },
  { k:"telefonoCasa",  l:"Tel\u00e9fono casa" },
  { k:"telefonoTrabajo",l:"Tel\u00e9fono trabajo" },
  { k:"direccion",     l:"Direcci\u00f3n" },
  { k:"ciudad",        l:"Ciudad" },
  { k:"cp",            l:"C\u00f3digo postal" },
  { k:"producto",      l:"Producto" },
  { k:"vendedor",      l:"Vendedor" },
  { k:"anfitrion",     l:"Anfitri\u00f3n (para referidos)" },
  { k:"nivelCliente",  l:"Nivel de cliente" },
  { k:"limiteCredito", l:"L\u00edmite de cr\u00e9dito" },
  { k:"saldoActual",   l:"Saldo actual" },
  { k:"fuente",        l:"Fuente" },
  { k:"ultima_compra", l:"\u00daltima compra" },
  { k:"observaciones", l:"Observaciones" },
  { k:"omitir",        l:"\u2715 No importar" },
];

// Adivina el campo por el nombre de la columna.
function adivinarCampo(nombreCol){
  const t=String(nombreCol||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const tiene=(...ps)=>ps.some(x=>t.includes(x));
  if(tiene("canal","seccion","secci\u00f3n","tipo de cliente","categoria","base")) return "canal";
  if(tiene("anfitrion","host","quien refiere","refiere")) return "anfitrion";
  if(tiene("apellido","last name","surname")) return "apellido";
  if(tiene("movil","celular","cell","mobile")) return "telefonoMovil";
  if(tiene("casa","home")&&tiene("tel","phone")) return "telefonoCasa";
  if(tiene("trabajo","work","oficina")&&tiene("tel","phone")) return "telefonoTrabajo";
  if(tiene("telefono","phone","tel.","numero de tel","contacto")) return "telefono";
  if(tiene("cuenta","account","acct","no. cta","nro cta")) return "cuenta";
  if(tiene("nombre","name","cliente","customer")) return "nombre";
  if(tiene("direccion","address","domicilio","calle")) return "direccion";
  if(tiene("ciudad","city","municipio")) return "ciudad";
  if(tiene("postal","zip","c.p")) return "cp";
  if(tiene("producto","product","articulo")) return "producto";
  if(tiene("vendedor","seller","asesor")) return "vendedor";
  if(tiene("nivel","level")) return "nivelCliente";
  if(tiene("limite")) return "limiteCredito";
  if(tiene("saldo","balance","deuda")) return "saldoActual";
  if(tiene("fuente","source","origen")) return "fuente";
  if(tiene("ultima compra","last purchase")) return "ultima_compra";
  if(tiene("observacion","nota","note","comment","detalle")) return "observaciones";
  return "";
}

// Texto del canal \u2192 secci\u00f3n real de la app.
function canalASeccion(valor){
  const t=String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  if(!t) return null;
  if(t.includes("refer")) return "referidos";
  if(t.includes("distrib") || t.includes("reparto")) return "distribucion";
  if(t.includes("prospec") || t.includes("prospect")) return "prospectos";
  if(t.includes("agregad") || t.includes("cliente") || t.includes("added")) return "agregados";
  return null;
}
const SEC_NOMBRE = { agregados:"Clientes (Agregados)", prospectos:"Prospecci\u00f3n", distribucion:"Distribuci\u00f3n", referidos:"Referidos" };

function ImportadorMasivo({ onListo, onClose }){
  const [paso,setPaso]=useState(1);
  const [nombreArch,setNombreArch]=useState("");
  const [columnas,setColumnas]=useState([]);
  const [filas,setFilas]=useState([]);
  const [mapa,setMapa]=useState({});
  const [destDefecto,setDestDefecto]=useState("agregados");
  const [error,setError]=useState("");
  const [cargando,setCargando]=useState("");
  const [pdfCrudo,setPdfCrudo]=useState(null);   // filas del PDF antes de elegir encabezado
  const [filaEncab,setFilaEncab]=useState(0);
  const fileRef=useRef(null);

  const prepararTabla=(cols,fs,nombre)=>{
    const m={}; cols.forEach(c=>{ m[c]=adivinarCampo(c); });
    setColumnas(cols); setFilas(fs); setMapa(m); setNombreArch(nombre);
    setError(""); setCargando(""); setPaso(2);
  };

  const alElegirArchivo=async (e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f) return;
    setError(""); setPdfCrudo(null);
    if(/\.xlsx?$/i.test(f.name)){
      setError("Los archivos de Excel (.xls/.xlsx) no se leen directo. \u00c1brelo en Excel o Numbers \u2192 Exportar \u2192 CSV, y sube ese archivo.");
      return;
    }
    if(/\.pdf$/i.test(f.name) || f.type==="application/pdf"){
      try{
        setCargando("Leyendo PDF\u2026");
        const buf=await f.arrayBuffer();
        const crudas=await leerPDF(buf,(n,total)=>setCargando(`Leyendo PDF\u2026 p\u00e1gina ${n} de ${total}`));
        if(!crudas.length){
          setCargando("");
          setError("Este PDF no tiene texto \u2014 es un escaneo o una foto. Para leerlo usa el bot\u00f3n \u00abImportar con IA\u00bb, que s\u00ed puede verlo.");
          return;
        }
        setPdfCrudo(crudas); setNombreArch(f.name); setFilaEncab(0);
        setCargando(""); setPaso(1.5);
      }catch(err){
        setCargando("");
        setError("No se pudo leer el PDF: "+(err&&err.message?err.message:"error"));
      }
      return;
    }
    const lector=new FileReader();
    lector.onload=()=>{
      try{
        const { columnas:cols, filas:fs } = leerCSV(String(lector.result||""));
        if(!cols.length || !fs.length){ setError("No se encontraron filas con datos. \u00bfEl archivo tiene encabezados en la primera fila?"); return; }
        prepararTabla(cols,fs,f.name);
      }catch(err){ setError("No se pudo leer el archivo: "+(err&&err.message?err.message:"error")); }
    };
    lector.onerror=()=>setError("No se pudo abrir el archivo.");
    lector.readAsText(f,"UTF-8");
  };

  // Confirmar cu\u00e1l fila del PDF es el encabezado y armar la tabla.
  const confirmarEncabezadoPDF=()=>{
    const cols=nombrarColumnas(pdfCrudo[filaEncab]||[]);
    const cuerpo=pdfCrudo.slice(filaEncab+1)
      .filter(r=>r.length>1)
      .map(r=>{ const o={}; cols.forEach((c,i)=>{ o[c]= r[i]!==undefined ? r[i] : ""; }); return o; })
      .filter(f=>Object.values(f).some(v=>String(v).trim()!==""));
    if(!cuerpo.length){ setError("Con esa fila como encabezado no quedaron datos. Prueba con otra."); return; }
    prepararTabla(cols,cuerpo,nombreArch);
  };

  // Construye los registros finales, agrupados por canal.
  const construir=()=>{
    const porSeccion={ agregados:[], prospectos:[], distribucion:[], referidos:[] };
    filas.forEach(f=>{
      const r={}; const extras=[];
      let apellido="", canalTxt="", anfitrion="";
      columnas.forEach(c=>{
        const campo=mapa[c];
        const val=String(f[c]==null?"":f[c]).trim();
        if(!val || campo==="omitir") return;
        if(campo==="apellido"){ apellido=val; return; }
        if(campo==="canal"){ canalTxt=val; return; }
        if(campo==="anfitrion"){ anfitrion=val; return; }
        if(!campo){ extras.push(`${c}: ${val}`); return; }   // nada se pierde
        r[campo]= r[campo] ? `${r[campo]} / ${val}` : val;
      });
      // Nombre + apellido se unen con un espacio (no con barra).
      if(apellido) r.nombre = r.nombre ? `${r.nombre} ${apellido}` : apellido;
      if(extras.length) r.otrosDetalles = r.otrosDetalles ? `${r.otrosDetalles} \u00b7 ${extras.join(" \u00b7 ")}` : extras.join(" \u00b7 ");
      if(!r.telefono && r.telefonoMovil) r.telefono=r.telefonoMovil;
      if(!r.telefono && r.telefonoCasa)  r.telefono=r.telefonoCasa;
      const tieneAlgo = (r.nombre&&r.nombre.trim()) || (r.telefono&&r.telefono.trim()) || (r.cuenta&&r.cuenta.trim());
      if(!tieneAlgo) return;
      const sec = canalASeccion(canalTxt) || (anfitrion ? "referidos" : destDefecto);
      if(sec==="referidos") porSeccion.referidos.push({ ...r, _anfitrion: anfitrion });
      else porSeccion[sec].push(r);
    });
    return porSeccion;
  };

  const grupos = paso>=2 ? construir() : { agregados:[], prospectos:[], distribucion:[], referidos:[] };
  const totalListos = Object.values(grupos).reduce((a,l)=>a+l.length,0);
  const hayCanal = Object.values(mapa).includes("canal");
  const hayContacto = Object.values(mapa).some(v=> v==="nombre"||v==="apellido"||v==="cuenta"||(v&&v.indexOf("telefono")===0));

  return (
    <div className="space-y-3">
      {error && <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2 leading-relaxed">{error}</div>}
      {cargando && <div className="text-xs font-bold text-[#5b21b6] bg-[#f1ecfd] rounded-xl px-3 py-2">{cargando}</div>}

      {paso===1 && (
        <>
          <div className="text-sm text-slate-600 leading-relaxed">
            Sube un <b>CSV</b> o un <b>PDF con texto</b>. Se lee aqu\u00ed mismo, en tu tel\u00e9fono \u2014 sin usar inteligencia artificial y sin costo.
          </div>
          <input ref={fileRef} type="file" accept=".csv,.pdf,text/csv,text/plain,application/pdf" onChange={alElegirArchivo} className="hidden" />
          <button onClick={()=>fileRef.current&&fileRef.current.click()}
            className="w-full py-4 rounded-2xl font-black text-white text-sm active:scale-95 transition" style={{background:RP.navy}}>
            <Ico e="\U0001F4C4" className="mr-1.5" />Elegir archivo (CSV o PDF)
          </button>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            \u00b7 <b>Excel:</b> \u00e1brelo y usa Exportar \u2192 CSV.<br/>
            \u00b7 <b>PDF escaneado</b> (no se puede seleccionar su texto): usa el bot\u00f3n de IA.<br/>
            \u00b7 Si el archivo trae una columna de <b>canal</b>, cada fila se guarda en su secci\u00f3n sola.
          </div>
        </>
      )}

      {paso===1.5 && pdfCrudo && (
        <>
          <div className="text-xs font-bold text-slate-500"><Ico e="\u2705" /> {nombreArch} \u00b7 {pdfCrudo.length} l\u00edneas le\u00eddas</div>
          <div className="text-sm font-black text-[#5b21b6] uppercase tracking-wider">\u00bfCu\u00e1l fila tiene los t\u00edtulos?</div>
          <div className="text-[11px] text-slate-400">Toca la fila que contiene los nombres de las columnas (Nombre, Tel\u00e9fono\u2026). Lo de arriba suele ser el membrete del reporte.</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {pdfCrudo.slice(0,12).map((r,i)=>(
              <button key={i} onClick={()=>setFilaEncab(i)}
                className={`w-full text-left px-3 py-2 rounded-xl border-2 transition ${filaEncab===i?"border-[#7c3aed] bg-[#f1ecfd]":"border-[#e8edf3] bg-white"}`}>
                <div className="text-[11px] font-bold text-slate-600">Fila {i+1} \u00b7 {r.length} celdas</div>
                <div className="text-[11px] text-slate-500 truncate">{r.map(c=>c.t).join(" \u2502 ").slice(0,90)}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{setPaso(1);setPdfCrudo(null);}} className="px-4 py-3 rounded-xl text-xs font-bold bg-[#f4f6f9] text-slate-600">\u2190 Otro archivo</button>
            <button onClick={confirmarEncabezadoPDF} className="flex-1 py-3 rounded-xl text-sm font-black text-white" style={{background:RP.navy}}>Continuar \u203a</button>
          </div>
        </>
      )}

      {paso===2 && (
        <>
          <div className="text-xs font-bold text-slate-500"><Ico e="\u2705" /> {nombreArch} \u00b7 {filas.length.toLocaleString()} filas \u00b7 {columnas.length} columnas</div>
          <div className="text-sm font-black text-[#5b21b6] uppercase tracking-wider">\u00bfQu\u00e9 es cada columna?</div>
          <div className="text-[11px] text-slate-400 leading-relaxed">Lo que dejes en \u00abOtros detalles\u00bb igual se guarda, con el nombre de su columna.</div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {columnas.map(c=>(
              <div key={c} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{c}</div>
                  <div className="text-[10px] text-slate-400 truncate">ej: {String((filas[0]||{})[c]||"").slice(0,26)||"(vac\u00edo)"}</div>
                </div>
                <select value={mapa[c]||""} onChange={e=>setMapa(m=>({...m,[c]:e.target.value}))}
                  className="text-xs border-2 border-[#e5def4] rounded-lg px-2 py-1.5 bg-white shrink-0" style={{maxWidth:"50%"}}>
                  {CAMPOS_IMP.map(f=><option key={f.k} value={f.k}>{f.l}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!hayContacto && <div className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Marca al menos una columna como Nombre, Tel\u00e9fono o N\u00famero de cuenta.</div>}
          <div className="flex gap-2">
            <button onClick={()=>{setPaso(pdfCrudo?1.5:1);}} className="px-4 py-3 rounded-xl text-xs font-bold bg-[#f4f6f9] text-slate-600">\u2190 Atr\u00e1s</button>
            <button onClick={()=>setPaso(3)} disabled={!hayContacto} className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50" style={{background:RP.navy}}>Continuar \u203a</button>
          </div>
        </>
      )}

      {paso===3 && (
        <>
          {!hayCanal && (
            <>
              <div className="text-sm font-black text-[#5b21b6] uppercase tracking-wider">\u00bfD\u00f3nde se guardan?</div>
              <div className="text-[11px] text-slate-400">El archivo no trae columna de canal, as\u00ed que todo va a la misma secci\u00f3n.</div>
              <div className="grid grid-cols-1 gap-2">
                {["agregados","prospectos","distribucion"].map(v=>(
                  <button key={v} onClick={()=>setDestDefecto(v)}
                    className={`text-left px-4 py-3 rounded-2xl border-2 transition ${destDefecto===v?"border-[#7c3aed] bg-[#f1ecfd]":"border-[#e8edf3] bg-white"}`}>
                    <div className="font-bold text-sm">{SEC_NOMBRE[v]}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="rounded-xl bg-[#f4f6f9] p-3">
            <div className="text-xs font-black text-slate-600 mb-1.5">Se van a importar {totalListos.toLocaleString()} registros</div>
            {Object.keys(grupos).filter(k=>grupos[k].length).map(k=>(
              <div key={k} className="text-[11px] text-slate-500 flex justify-between border-t border-[#e8edf3] pt-1 mt-1">
                <span>{SEC_NOMBRE[k]}</span><b className="text-slate-700">{grupos[k].length.toLocaleString()}</b>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[#f4f6f9] p-3">
            <div className="text-xs font-black text-slate-600 mb-1">Vista previa</div>
            {[...grupos.agregados,...grupos.prospectos,...grupos.distribucion,...grupos.referidos].slice(0,3).map((r,i)=>(
              <div key={i} className="text-[11px] text-slate-500 border-t border-[#e8edf3] pt-1.5 mt-1.5">
                <b className="text-slate-700">{r.nombre||"(sin nombre)"}</b>
                {r.telefono?` \u00b7 ${r.telefono}`:""}{r.cuenta?` \u00b7 cta ${r.cuenta}`:""}
                {r.otrosDetalles?<div className="text-slate-400 truncate">{r.otrosDetalles}</div>:null}
              </div>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed">
            Los repetidos se detectan solos (por cuenta, tel\u00e9fono o nombre) y se te muestran para revisar antes de guardar.
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setPaso(2)} className="px-4 py-3 rounded-xl text-xs font-bold bg-[#f4f6f9] text-slate-600">\u2190 Columnas</button>
            <button onClick={()=>onListo(grupos)} disabled={!totalListos}
              className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50" style={{background:RP.navy}}>
              Importar {totalListos.toLocaleString()}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AIExtractor({ onExtracted, onClose }) {
  const [files,setFiles]=useState([]);const [loading,setLoading]=useState(false);
  const [preview,setPreview]=useState(null);const [refPreview,setRefPreview]=useState(null);
  const [dest,setDest]=useState("agregados");const [error,setError]=useState("");const fileRef=useRef();
  const [modelo,setModelo]=useState("haiku"); // "haiku" o "sonnet"
  const [progreso,setProgreso]=useState("");
  const MODELOS={
    haiku:  { id:"claude-haiku-4-5-20251001", ico:"⚡", label:"Rápido",    desc:"Listas digitales, PDFs claros, hasta ~50 registros",    color:"#0d9488", badge:"HAIKU"  },
    sonnet: { id:"claude-sonnet-4-5",         ico:"🧠", label:"Preciso",   desc:"Fotos, letra a mano, documentos difíciles de leer",     color:"#7c3aed", badge:"SONNET" },
  };
  const handleFile=e=>{
    const nuevos=Array.from(e.target.files||[]);
    if(!nuevos.length) return;
    setFiles(prev=>{
      const combinados=[...prev,...nuevos].slice(0,20); // máximo 20
      return combinados;
    });
    setPreview(null);setRefPreview(null);setError("");
  };
  const quitarArchivo=(idx)=>setFiles(prev=>prev.filter((_,i)=>i!==idx));

  // Procesar UN archivo y devolver su base64 + media_type
  const prepararArchivo=async(file)=>{
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("No se pudo leer el archivo"));r.readAsDataURL(file);});
    const isPdf=file.type==="application/pdf" || /\.pdf$/i.test(file.name||"");
    let mediaType=(file.type||"").toLowerCase();
    if(!isPdf){
      const name=(file.name||"").toLowerCase();
      if(mediaType==="image/jpg") mediaType="image/jpeg";
      if(!["image/jpeg","image/png","image/gif","image/webp"].includes(mediaType)){
        if(/\.(jpe?g)$/i.test(name)) mediaType="image/jpeg";
        else if(/\.png$/i.test(name)) mediaType="image/png";
        else if(/\.gif$/i.test(name)) mediaType="image/gif";
        else if(/\.webp$/i.test(name)) mediaType="image/webp";
        else if(/\.(heic|heif)$/i.test(name)){ throw new Error("El formato HEIC del iPhone no es compatible ("+file.name+"). En tu iPhone ve a Ajustes → Cámara → Formatos → 'Más compatible', o usa una captura de pantalla."); }
        else mediaType="image/jpeg";
      }
    }
    const sizeMB=(b64.length*0.75)/(1024*1024);
    if(sizeMB>4.5) throw new Error("Una imagen es muy grande ("+sizeMB.toFixed(1)+"MB: "+file.name+"). Usa una captura de pantalla o redúcela.");
    return isPdf?{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}}:{type:"image",source:{type:"base64",media_type:mediaType,data:b64}};
  };

  // Extraer datos de UN bloque (una imagen/PDF)
  const extraerUno=async(block)=>{
    const sys=dest==="referidos"
      ? `Extrae datos de referidos para Royal Prestige. Responde SOLO JSON sin backticks. Formato: {"referidos":[{"anfitrion":"","regalo":"","referidos":[{"nombre":"","parentesco":"","telefono":"","direccion":"","producto":"","observaciones":""}]}]}`
      : `Extrae TODA la información útil de clientes del documento para Royal Prestige. Responde SOLO JSON compacto sin backticks ni explicaciones.

EXTRAE Y GUARDA SI APARECEN: nombre completo, número de cuenta, dirección, teléfono de casa, teléfono de trabajo, teléfono móvil, vendedor, nivel del cliente o nivel de financiamiento, límite de crédito, saldo actual, productos comprados (como lista simple de texto), y cualquier otro dato útil para seguimiento (en "otrosDetalles").

NUNCA extraigas ni inventes: fecha original de compra, fecha de cierre, última fecha de pago, morosidad, fecha de orden, código de artículo, descripción de artículo, cantidad. Ignóralos por completo.

NO inventes datos. Si un campo no aparece, déjalo vacío "".

Formato EXACTO: {"registros":[{"nombre":"","numeroCuenta":"","direccion":"","telefonoCasa":"","telefonoTrabajo":"","telefonoMovil":"","vendedor":"","nivelCliente":"","limiteCredito":"","saldoActual":"","productos":[],"otrosDetalles":""}]}. NO te detengas hasta incluir TODOS los clientes visibles.`;
    let resp;
    try{
      resp=await fetch("/api/anthropic",{method:"POST",headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({model:MODELOS[modelo].id,max_tokens:8000,system:sys,messages:[{role:"user",content:[block,{type:"text",text:"Extrae los datos. Solo JSON."}]}]})});
    }catch(netErr){
      throw new Error("No se pudo conectar con el servicio de IA. Revisa tu conexión a internet. Si persiste, puede que tu API key no tenga créditos.");
    }
    if(!resp.ok){
      let msg="Error "+resp.status;
      try{ const e=await resp.json(); msg=(e.error&&e.error.message)||msg; }catch{}
      if(resp.status===401) msg="API key inválida o sin créditos. Revisa tu cuenta de Anthropic.";
      if(resp.status===400) msg="Una imagen no se pudo procesar. Intenta con una captura de pantalla más clara.";
      if(resp.status===413) msg="Una imagen es muy grande. Usa captura de pantalla.";
      if(resp.status===529||resp.status===429) msg="El servicio está ocupado. Espera unos segundos e intenta de nuevo.";
      throw new Error(msg);
    }
    const data=await resp.json();
    const text=(data.content||[]).map(b=>b.text||"").join("");
    if(!text.trim()) return dest==="referidos"?{referidos:[]}:{registros:[]};
    let clean=text.replace(/```json|```/g,"").trim();
    const fb=clean.indexOf("{"); const lb=clean.lastIndexOf("}");
    if(fb>=0&&lb>fb) clean=clean.slice(fb,lb+1);
    try{ return JSON.parse(clean); }
    catch{
      const arrName = dest==="referidos" ? "referidos" : "registros";
      const objs = clean.match(/\{[^{}]*\}/g) || [];
      const recovered = objs.map(o=>{ try{return JSON.parse(o);}catch{return null;} }).filter(Boolean);
      return { [arrName]: recovered };
    }
  };

  const extract=async()=>{
    if(!files.length){setError("Primero selecciona uno o más archivos.");return;}
    setLoading(true);setError("");setProgreso("");
    try{
      let acumReg=[], acumRef=[];
      for(let i=0;i<files.length;i++){
        setProgreso(`Procesando ${i+1} de ${files.length}…`);
        const block=await prepararArchivo(files[i]);
        const parsed=await extraerUno(block);
        if(dest==="referidos") acumRef=acumRef.concat(parsed.referidos||[]);
        else acumReg=acumReg.concat(parsed.registros||[]);
      }
      setProgreso("");
      if(dest==="referidos"){
        if(!acumRef.length) throw new Error("No se encontraron referidos en los archivos.");
        setRefPreview(acumRef);
      }else{
        if(!acumReg.length) throw new Error("No se encontraron datos de contacto en los archivos.");
        setPreview(acumReg);
      }
    }catch(err){
      setError("⚠️ "+(err.message||"No se pudo extraer. Verifica los archivos e intenta de nuevo."));
      setProgreso("");
    }
    setLoading(false);
  };
  const confirm=()=>{
    if(dest==="referidos"){if(!refPreview?.length)return;
      onExtracted(refPreview.map(r=>({...emptyReferido(),anfitrion:r.anfitrion||"",regalo:r.regalo||"",
        referidos:(r.referidos||[]).map(x=>({nombre:x.nombre||"",parentesco:x.parentesco||"",telefono:x.telefono||"",direccion:x.direccion||"",producto:x.producto||"",observaciones:x.observaciones||"",detalles:"",estado:"sin_estado"})),id:genId()})),"referidos");
    }else{if(!preview?.length)return;
      // Mapear los campos nuevos de la IA al modelo del cliente
      const mapped=preview.map(r=>{
        const movil=r.telefonoMovil||r.telefono||"";
        const tel = movil || r.telefonoCasa || r.telefonoTrabajo || "";
        return {
          nombre:r.nombre||"",
          cuenta:r.numeroCuenta||r.cuenta||"",
          direccion:r.direccion||"",
          telefono:tel,                              // el principal (móvil de preferencia)
          telefonoCasa:r.telefonoCasa||"",
          telefonoTrabajo:r.telefonoTrabajo||"",
          telefonoMovil:movil,
          vendedor:r.vendedor||"",
          nivelCliente:r.nivelCliente||"",
          limiteCredito:r.limiteCredito||"",
          saldoActual:r.saldoActual||"",
          productos:Array.isArray(r.productos)?r.productos:(r.productos?[r.productos]:[]),
          otrosDetalles:r.otrosDetalles||"",
          ciudad:r.ciudad||"",
          observaciones:r.observaciones||"",
        };
      });
      onExtracted(mapped,dest);
    }
  };
  const hasPreview=dest==="referidos"?!!refPreview:!!preview;
  const count=dest==="referidos"?(refPreview?.length||0):(preview?.length||0);
  return (
    <div>
      <div className="bg-[#5b21b6]/8 border border-[#5b21b6]/15 rounded-xl p-4 mb-4 text-sm text-[#5b21b6] font-medium"><strong><Ico e="🤖" className="mr-1.5" />Extracción con IA:</strong> Sube hasta <strong>20 fotos o PDFs</strong> y la IA llena la base de datos sola.</div>

      {/* SELECTOR DE MODELO */}
      <Field label="Tipo de extracción">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MODELOS).map(([k,m])=>(
            <button key={k} type="button" onClick={()=>setModelo(k)}
              className={`text-left px-3 py-3 rounded-xl border-2 transition ${modelo===k?"border-2 text-white":"border-[#e5def4] bg-white text-slate-700"}`}
              style={modelo===k?{background:m.color,borderColor:m.color}:{}}>
              <div className="font-black text-sm">{m.label}</div>
              <div className={`text-[10px] mt-0.5 leading-tight ${modelo===k?"text-white/80":"text-slate-400"}`}>{m.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-400 text-center">
          <Ico e="💡" className="mr-1.5" />Recomendado: <strong>máx. 50 datos por imagen</strong> para mejor resultado
        </div>
      </Field>
      <Field label={`Archivos (PDF, JPG, PNG) — ${files.length}/20`}>
        <div onClick={()=>fileRef.current.click()} className="border-2 border-dashed border-[#e5def4] rounded-xl p-5 text-center cursor-pointer hover:border-[#7c3aed] hover:bg-[#f4f6f9] transition">
          <div className="text-3xl mb-1">{files.length?"➕":"📎"}</div>
          <div className="text-sm text-slate-600 font-bold">{files.length?`Agregar más (${files.length} seleccionado${files.length>1?"s":""})`:"Toca para seleccionar archivos"}</div>
          <div className="text-[10px] text-slate-400 mt-1">Puedes elegir varias a la vez</div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*" multiple onChange={handleFile} />
        </div>
        {files.length>0 && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {files.map((f,i)=>(
              <div key={i} className="flex items-center gap-2 bg-[#f4f6f9] rounded-lg px-2.5 py-1.5 text-xs">
                <span className="shrink-0">{/\.pdf$/i.test(f.name)?"📄":"🖼️"}</span>
                <span className="flex-1 truncate text-slate-600">{f.name}</span>
                <button onClick={(e)=>{e.stopPropagation();quitarArchivo(i);}} className="text-red-400 font-bold shrink-0 px-1"><Ico e="✕" /></button>
              </div>
            ))}
          </div>
        )}
      </Field>
      <Field label="Guardar en sección">
        <div className="grid grid-cols-2 gap-2">
          {[{v:"agregados",ico:"📂", l:"Agregados"},{v:"referidos",ico:"🎁", l:"Referidos"},{v:"prospectos",ico:"🔍", l:"Prospección"},{v:"distribucion",ico:"🏠", l:"Distribución"}].map(o=>(
            <button key={o.v} type="button" onClick={()=>{setDest(o.v);setPreview(null);setRefPreview(null);}} className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition text-left ${dest===o.v?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-600"}`}>{o.l}</button>
          ))}
        </div>
      </Field>
      {error && <div className="text-red-500 text-sm mb-3 bg-red-50 p-3 rounded-lg">{error}</div>}
      {!hasPreview && <PrimaryBtn onClick={extract} disabled={!files.length||loading} full>{loading?(progreso||`⏳ Extrayendo con ${MODELOS[modelo].badge}…`):`🤖 Extraer ${files.length>1?files.length+" archivos":""} con ${MODELOS[modelo].label}`}</PrimaryBtn>}
      {hasPreview && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-slate-700"><Ico e="✅" className="mr-1.5" />{count} registro(s) — Toca para editar:</div>
            {dest!=="referidos" && <button onClick={()=>setPreview(p=>[...p,{nombre:"",telefonoMovil:"",numeroCuenta:"",direccion:"",vendedor:"",nivelCliente:"",limiteCredito:"",saldoActual:"",productos:[],otrosDetalles:""}])} className="text-xs font-bold text-[#7c3aed]">+ Agregar</button>}
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
            {dest==="referidos"?refPreview.map((r,i)=>(
              <div key={i} className="bg-[#f4f6f9] rounded-lg p-3 border border-[#e8edf3] text-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <input value={r.anfitrion||""} onChange={e=>setRefPreview(p=>p.map((x,j)=>j===i?{...x,anfitrion:e.target.value}:x))} className="font-bold text-slate-800 bg-white border border-[#e5def4] rounded px-2 py-1 text-sm flex-1 mr-2" placeholder="Anfitrión" />
                  <button onClick={()=>setRefPreview(p=>p.filter((_,j)=>j!==i))} className="text-red-400 text-xs font-bold shrink-0"><Ico e="🗑" /></button>
                </div>
                <input value={r.regalo||""} onChange={e=>setRefPreview(p=>p.map((x,j)=>j===i?{...x,regalo:e.target.value}:x))} className="w-full bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Regalo" />
                <div className="text-slate-400 text-[10px] mt-1">{r.referidos?.length||0} referido(s)</div>
              </div>
            ))
            :preview.map((r,i)=>(
              <div key={i} className="bg-[#f4f6f9] rounded-lg p-3 border border-[#e8edf3] space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={r.nombre||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))} className="font-bold text-slate-800 bg-white border border-[#e5def4] rounded px-2 py-1 text-sm flex-1" placeholder="Nombre" />
                  <button onClick={()=>setPreview(p=>p.filter((_,j)=>j!==i))} className="text-red-400 text-xs font-bold shrink-0 px-1"><Ico e="🗑" /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={r.telefonoMovil||r.telefono||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,telefonoMovil:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Móvil" />
                  <input value={r.numeroCuenta||r.cuenta||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,numeroCuenta:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="N° cuenta" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={r.telefonoCasa||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,telefonoCasa:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Casa" />
                  <input value={r.telefonoTrabajo||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,telefonoTrabajo:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Trabajo" />
                </div>
                <input value={r.direccion||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,direccion:e.target.value}:x))} className="w-full bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Dirección" />
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={r.vendedor||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,vendedor:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Vendedor" />
                  <input value={r.nivelCliente||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,nivelCliente:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Nivel" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={r.limiteCredito||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,limiteCredito:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Límite crédito" />
                  <input value={r.saldoActual||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,saldoActual:e.target.value}:x))} className="bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Saldo actual" />
                </div>
                <input value={Array.isArray(r.productos)?r.productos.join(", "):(r.productos||"")} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,productos:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}:x))} className="w-full bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Productos (separados por coma)" />
                <input value={r.otrosDetalles||""} onChange={e=>setPreview(p=>p.map((x,j)=>j===i?{...x,otrosDetalles:e.target.value}:x))} className="w-full bg-white border border-[#e5def4] rounded px-2 py-1 text-xs text-slate-600" placeholder="Otros detalles" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={confirm} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white" style={{background:RP.blue}}><Ico e="✅" className="mr-1.5" />Confirmar y guardar {count}</button>
            <button onClick={()=>{setPreview(null);setRefPreview(null);setFiles([]);}} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-[#f4f6f9]">Volver</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUTOCOMPLETAR DIRECCIÓN (Geoapify) ───────────────────────
// Campo de dirección con sugerencias reales. Al elegir una, llama
// onSelect con {direccion, ciudad, cp} para llenar los 3 campos solos.
// La API key se lee de VITE_GEOAPIFY_KEY (Replit Secret). Si no hay
// key, funciona como un input de texto normal (no rompe nada).
function getGeoapifyKey(){
  try { return import.meta.env.VITE_GEOAPIFY_KEY || ""; } catch { return ""; }
}
function AddressAutocomplete({ value, onChange, onSelect, placeholder="Dirección", className }) {
  const [sugerencias,setSugerencias]=useState([]);
  const [abierto,setAbierto]=useState(false);
  const [cargando,setCargando]=useState(false);
  const timerRef = useRef(null);
  const cajaRef = useRef(null);
  const apiKey = getGeoapifyKey();

  // Buscar sugerencias con debounce de 350ms
  const buscar=(texto)=>{
    if(timerRef.current) clearTimeout(timerRef.current);
    if(!apiKey || !texto || texto.trim().length<3){ setSugerencias([]); setAbierto(false); return; }
    timerRef.current=setTimeout(async()=>{
      try{
        setCargando(true);
        const url=`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(texto)}&filter=countrycode:us,co&format=json&limit=5&apiKey=${apiKey}`;
        const res=await fetch(url);
        const data=await res.json();
        const items=(data.results||[]).map(r=>({
          label: r.formatted || [r.address_line1,r.address_line2].filter(Boolean).join(", "),
          direccion: r.address_line1 || [r.housenumber,r.street].filter(Boolean).join(" ") || r.formatted || "",
          ciudad: r.city || r.county || r.state || "",
          cp: (r.postcode||"").toString().replace(/\D/g,"").slice(0,5),
        }));
        setSugerencias(items);
        setAbierto(items.length>0);
      }catch(e){
        setSugerencias([]); setAbierto(false);
      }finally{
        setCargando(false);
      }
    }, 350);
  };

  const elegir=(s)=>{
    setAbierto(false);
    setSugerencias([]);
    if(onSelect) onSelect({direccion:s.direccion||s.label, ciudad:s.ciudad, cp:s.cp});
  };

  return (
    <div className="relative" ref={cajaRef}>
      <input className={className||inpLight} value={value||""} placeholder={apiKey?placeholder:placeholder+" (escribe a mano)"}
        name="direccion-geoapify" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        onChange={e=>{ onChange(e.target.value); buscar(e.target.value); }}
        onFocus={()=>{ if(sugerencias.length>0) setAbierto(true); }} />
      {cargando && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</div>}
      {abierto && sugerencias.length>0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={()=>setAbierto(false)} />
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-[#e8edf3] overflow-hidden max-h-64 overflow-y-auto">
            {sugerencias.map((s,i)=>(
              <button key={i} type="button" onClick={()=>elegir(s)}
                className="w-full flex items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-[#f4f6f9] transition border-b border-[#f4f6f9] last:border-0">
                <span className="text-base shrink-0"><Ico e="📍" /></span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-700 truncate">{s.direccion||s.label}</div>
                  <div className="text-[11px] text-slate-400 truncate">{[s.ciudad,s.cp].filter(Boolean).join(" · ")}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CLIENT ROW ──────────────────────────���──────────────��─────
// ─── CALL MENU (dropdown de apps de llamada) ──────────────────
function CallMenu({ telefono, onCall, compact }) {
  const [open,setOpen]=useState(false);
  const [toast,setToast]=useState("");
  const doCopy = (label) => {
    copyNum(telefono);
    if(onCall) onCall();
    setOpen(false);
    setToast(`📋 ${intlNum(telefono)} copiado — abre ${label} y pega`);
    setTimeout(()=>setToast(""), 3000);
  };
  if(!telefono) return null;
  return (
    <div className="relative inline-block">
      <button onClick={()=>setOpen(p=>!p)}
        className={compact
          ? "w-9 h-9 rounded-full flex items-center justify-center text-white text-base shrink-0 hover:brightness-110 transition active:scale-95"
          : "inline-flex items-center gap-1.5 text-white font-bold px-2.5 py-1 rounded-md hover:brightness-110 transition text-xs"}
        style={{background:RP.blue}}>
        {compact ? "📞" : <><Ico e="📞" className="mr-1.5" />{telefono} <span className={`transition-transform ${open?"rotate-180":""}`}>▾</span></>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={()=>setOpen(false)} />
          <div className={`absolute z-50 mt-1 ${compact?"right-0":"left-0"} bg-white rounded-xl shadow-2xl border border-[#e8edf3] overflow-hidden`} style={{minWidth:"190px"}}>
            <div className="px-3 py-2 border-b border-[#f4f6f9]">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Llamar con…</div>
              <div className="text-[9px] text-slate-400 mt-0.5"><Ico e="📋" className="mr-1.5" />El número se copia automático</div>
            </div>
            {CALL_APPS.map(app=>(
              app.mode==="link" ? (
                <a key={app.id} href={app.href(telefono)} target={app.id==="gvoice"?"_blank":undefined} rel="noreferrer"
                  onClick={()=>{ copyNum(telefono); if(onCall) onCall(); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold hover:bg-[#f4f6f9] transition border-b border-[#f4f6f9] last:border-0">
                  <span className="w-6 flex items-center justify-center">{<Ico e={app.icon} size={16} />}</span>
                  <span style={{color:app.color}}>{app.label}</span>
                </a>
              ) : (
                <button key={app.id} type="button"
                  onClick={()=>doCopy(app.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold hover:bg-[#f4f6f9] transition border-b border-[#f4f6f9] last:border-0">
                  <span className="w-6 flex items-center justify-center">{<Ico e={app.icon} size={16} />}</span>
                  <span style={{color:app.color}}>{app.label}</span>
                  <span className="ml-auto text-[9px] text-slate-400 font-normal">copia el #</span>
                </button>
              )
            ))}
            <a href={waLink(telefono)} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold hover:bg-[#f4f6f9] transition bg-[#25D366]/5">
              <span className="w-6 text-center text-base"><Ico e="💬" /></span>
              <span style={{color:"#25D366"}}>WhatsApp</span>
            </a>
            <a href={smsLink(telefono)} onClick={()=>setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold hover:bg-[#f4f6f9] transition border-t border-[#f4f6f9]">
              <span className="w-6 text-center text-base"><Ico e="✉" /></span>
              <span style={{color:"#7c3aed"}}>Mensaje de texto (SMS)</span>
            </a>
          </div>
        </>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[#1f2d3d] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── CLIENT ROW (compacta + expandible) ───────────────────────
function ClientRow({ c, onStatusChange, onEdit, onSchedule, onDelete, onRestore, onHardDelete, inPapelera, onCall, onApptResult, onSaveCallToHistorial, onSaveNota, type, role, onToggleRoute, isInRoute, agente, onDeleteHistorial, onMarcarLlamado, infoCobranza }) {
  const [expanded,setExpanded]=useState(false);
  const [showPicker,setShowPicker]=useState(false);
  const [showResult,setShowResult]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showDetalles,setShowDetalles]=useState(false);
  const [showNotasHist,setShowNotasHist]=useState(false);
  const [nuevaNota,setNuevaNota]=useState("");
  const [notaMsg,setNotaMsg]=useState("");
  const [resultDetail,setResultDetail]=useState("");
  const [montoVenta,setMontoVenta]=useState(""); // monto de la venta (solo demo_venta)
  const [productoVenta,setProductoVenta]=useState(""); // producto vendido (solo demo_venta)
  const [filtroVenta,setFiltroVenta]=useState("");     // sub-producto de filtros de agua
  const [resultSelId,setResultSelId]=useState(""); // para saber si demo_venta está seleccionado
  const [callStatus,setCallStatus]=useState(null);
  const [estadoMsg,setEstadoMsg]=useState("");
  // E) Guard de seguridad: si no hay objeto o no tiene id válido, NO renderizar la tarjeta.
  // (va DESPUÉS de los hooks para respetar las reglas de React)
  const _idOk = c && (
    c._tipo==="referidos"
      ? (typeof c.id==="string" && (()=>{const p=c.id.split("::");return !!p[0]&&p[0]!=="undefined"&&p[0]!=="null"&&p[1]!==undefined&&p[1]!=="";})())
      : (c.id!==undefined && c.id!==null && c.id!=="")
  );
  if(!_idOk){
    return null;
  }
  const s=STATUS_COLORS[c.estado]||STATUS_COLORS.sin_estado;
  const isCita=c.estado==="verde";
  const historial=c.historial||[];
  // notas: solo entradas reales {texto,...}. Si el campo es texto legado, se
  // muestra como UNA nota (nunca se parte en letras) y se ignoran las vacías.
  const notas=(Array.isArray(c.notas)
    ? c.notas.filter(n=>n && typeof n==="object" && (n.texto||"").trim())
    : (typeof c.notas==="string" && c.notas.trim() ? [{texto:c.notas.trim()}] : []));
  const todayStr=hoyLocal();
  const seguimientoVencido = c.proximo_seguimiento && c.proximo_seguimiento <= todayStr;
  // Saldo/pago mensual sincronizados desde Cobranza (solo Distribución)
  const cbInfo = infoCobranza && (infoCobranza.saldo!==undefined || infoCobranza.pagoMensual!==undefined) ? infoCobranza : null;

  const guardarNota=()=>{
    const t=nuevaNota.trim();
    if(!t) return;
    if(onSaveNota) onSaveNota(c.id, t);
    setNuevaNota("");
    setNotaMsg("✅ Nota guardada");
    setTimeout(()=>setNotaMsg(""),2500);
  };

  const handleResultClick=(r)=>{
    if(r.id==="reset"){
      onApptResult(c,"reset",resultDetail);
      setShowResult(false); setResultDetail(""); setMontoVenta(""); setProductoVenta(""); setFiltroVenta(""); setResultSelId("");
      return;
    }
    if(isCita){
      const prodInfo = r.id==="demo_venta" ? resolveProducto(productoVenta, filtroVenta) : {label:"",meses:0};
      onApptResult(c,r.id,resultDetail, r.id==="demo_venta"?montoVenta:"", prodInfo.label, prodInfo.meses);
      if(onSaveCallToHistorial){
        const RES_LABEL={demo_venta:"💰 Demo / venta",demo_no_venta:"🎬 Demo / no venta",no_recibio:"🚪 No recibió",no_visito:"🚷 No se visitó",seguimiento:"📅 Llamar más adelante",recompra:"✖️ Recompra (no pagó)"};
        const montoNum = r.id==="demo_venta" ? Number(montoVenta)||0 : 0;
        onSaveCallToHistorial(c.id, makeHistorialEntry({
          tipo:"cita",
          estado:c.estado,
          cita_resultado:r.id,
          notas: resultDetail ? `${RES_LABEL[r.id]||r.id}${prodInfo.label?` — ${prodInfo.label}`:""} — ${resultDetail}${montoNum?` ($${montoNum})`:""}` : `${RES_LABEL[r.id]||r.id}${prodInfo.label?` — ${prodInfo.label}`:""}`,
          agente,
          monto: montoNum,
          producto: prodInfo.label,
          cartucho_meses: prodInfo.meses,
        }));
      }
    } else {
      onStatusChange(c.id,r.status);
      if(onSaveCallToHistorial) onSaveCallToHistorial(c.id, makeHistorialEntry({tipo:"llamada",estado:r.status,notas:resultDetail,agente}));
      if(r.id==="cita") onSchedule(c);
    }
    setShowResult(false); setResultDetail(""); setMontoVenta(""); setProductoVenta(""); setFiltroVenta(""); setResultSelId("");
  };

  return (
    <div className={`rounded-xl border border-[#e8edf3] border-l-4 shadow-sm relative ${s.cardBg||"bg-white"} ${s.border||"border-l-slate-300"}`}>

      {/* ══ FILA COMPACTA — nombre + color + llamar + expandir ══ */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none active:bg-black/5 transition rounded-xl"
        onClick={()=>setExpanded(p=>!p)}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:s.hex}} />
        {(()=>{
          const SRC={
            agregado:{t:"AGG",bg:"#f1ecfd",c:"#5b21b6"}, agregados:{t:"AGG",bg:"#f1ecfd",c:"#5b21b6"},
            prospecto:{t:"PROS",bg:"#fef3e2",c:"#b45309"}, prospectos:{t:"PROS",bg:"#fef3e2",c:"#b45309"},
            distribucion:{t:"DIS",bg:"#e7f6ec",c:"#047857"},
            "referido-llamada":{t:"REF",bg:"#faf5ff",c:"#7c3aed"},
          };
          const sc=SRC[type];
          if(!sc) return null;
          return <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded" style={{background:sc.bg,color:sc.c}} title={`Fuente: ${sc.t}`}>{sc.t}</span>;
        })()}
        <span className="font-bold text-sm text-[#1f2d3d] flex-1 truncate" style={{fontFamily:SERIF}}>
          {type==="referido" ? (c.anfitrion||"(Sin anfitrión)") : (c.nombre||"(Sin nombre)")}
          {type==="referido-llamada" && c._anfitrion && <span className="ml-1.5 text-[10px] font-normal text-purple-500"><Ico e="🎁" className="mr-1.5" />ref. de {c._anfitrion}</span>}
        </span>
        {cbInfo && (
          <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title="Sincronizado desde Cobranza">
            💵 ${Number(cbInfo.saldo||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}{cbInfo.pagoMensual?` · $${Number(cbInfo.pagoMensual).toLocaleString("en-US",{maximumFractionDigits:0})}/mes`:""}
          </span>
        )}
        {c.resultado==="venta" && <span className="text-sm shrink-0" title="Venta"><Ico e="💰" /></span>}
        {seguimientoVencido && !inPapelera && <span className="text-sm shrink-0" title="Seguimiento vencido"><Ico e="⏰" /></span>}
        {onToggleRoute && (()=>{
          // Solo califica para ruta si tiene dirección exacta (no solo ciudad)
          const dir=(c.direccion||"").trim();
          const ciudad=(c.ciudad||"").trim().toLowerCase();
          const tieneDirExacta = dir.length>0 && dir.toLowerCase()!==ciudad && /\d/.test(dir);
          if(tieneDirExacta){
            return (
              <button onClick={e=>{e.stopPropagation();onToggleRoute(c.id);}}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 transition active:scale-95 ${isInRoute?"text-white bg-emerald-600":"bg-[#f4f6f9] text-slate-500"}`}><Ico e="🗺" /></button>
            );
          }
          return (
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 bg-[#f4f6f9] opacity-40" title="Sin dirección exacta — no califica para ruta"><Ico e="🚫" /></span>
          );
        })()}
        <div onClick={e=>e.stopPropagation()}>
          <CallMenu telefono={c.telefono} onCall={onCall} compact />
        </div>
        <button onClick={e=>{e.stopPropagation();setExpanded(p=>!p);}} className={`text-slate-400 text-sm transition-transform duration-200 shrink-0 w-7 h-7 flex items-center justify-center rounded-full active:bg-black/5 ${expanded?"rotate-180":""}`} aria-label="Abrir/cerrar">▾</button>
      </div>

      {/* ══ PANEL EXPANDIDO ══ */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[#f4f6f9]">

          {/* Estado — picker */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="relative">
              <button onClick={()=>setShowPicker(p=>!p)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition active:brightness-90"
                style={s.style}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{background:s.style?.color==="#1f2d3d"?"#1f2d3d":"rgba(255,255,255,0.85)"}} />
                {s.label}
                <span className={`transition-transform duration-150 ${showPicker?"rotate-180":""}`}>▾</span>
              </button>
              {showPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={()=>setShowPicker(false)} />
                  <div className="absolute z-50 mt-1 left-0 bg-white rounded-xl shadow-2xl border border-[#e8edf3] overflow-hidden" style={{width:"220px",maxHeight:"60vh",overflowY:"auto"}}>
                    <div className="px-3 py-2 border-b border-[#f4f6f9] text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cambiar estado</div>
                    <div className="p-1.5">
                      {Object.entries(STATUS_COLORS).map(([k,v])=>(
                        <button key={k} onClick={()=>{
                            if(k!==c.estado){
                              onStatusChange(c.id,k);
                              if(onSaveCallToHistorial) onSaveCallToHistorial(c.id, makeHistorialEntry({tipo:"estado",estado:k,notas:`Estado cambiado a ${v.label}`,agente}));
                            }
                            setShowPicker(false);
                            setEstadoMsg(`✅ Estado: ${v.label} — guardado`);
                            setTimeout(()=>setEstadoMsg(""),2500);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold mb-1 last:mb-0 transition active:scale-95`}
                          style={{...v.style,outline:k===c.estado?"2px solid rgba(255,255,255,0.7)":"none"}}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:v.style.color==="#1f2d3d"?"#1f2d3d":"rgba(255,255,255,0.85)"}} />
                          <span className="flex-1 text-left">{v.label}</span>
                          {k===c.estado && <span className="text-xs font-black"><Ico e="✓" /></span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {c.asignado_a && <span className="inline-flex items-center gap-1 bg-[#5b21b6]/8 text-[#5b21b6] px-2 py-0.5 rounded-md font-bold text-[10px]"><Ico e="👤" className="mr-1.5" />{c.asignado_a}</span>}
          </div>
          {estadoMsg && <div className="mb-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5"><Msg>{estadoMsg}</Msg></div>}

          {/* Botón "Llamado" — manda este cliente al final de la lista de pendientes */}
          {onMarcarLlamado && (
            <button onClick={()=>{ onMarcarLlamado(c.id); setEstadoMsg("✅ Llamado registrado — pasa al final de la lista"); setTimeout(()=>setEstadoMsg(""),2500); }}
              className="w-full mb-2 flex items-center justify-center gap-2 text-xs font-bold py-2.5 px-3 rounded-lg text-white active:scale-95 transition" style={{background:"#16a34a"}}>
              <Ico e="✅" className="mr-1.5" />Marcar como llamado · pasar al final
              {c.ultimo_llamado && <span className="text-[10px] font-normal opacity-80">(últ: {new Date(c.ultimo_llamado).toLocaleDateString("es-MX",{day:"numeric",month:"short"})} {new Date(c.ultimo_llamado).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})})</span>}
            </button>
          )}

          {/* Badge de ORIGEN del dato */}
          {(()=>{
            const ORIGEN = {
              agregados:    {ico:"📂", label:"Agregados",     bg:"#f1ecfd", color:"#5b21b6"},
              prospectos:   {ico:"🔍", label:"Prospección",   bg:"#fef3e2", color:"#b45309"},
              prospecto:    {ico:"🔍", label:"Prospección",   bg:"#fef3e2", color:"#b45309"},
              distribucion: {ico:"🏠", label:"Distribución",  bg:"#e7f6ec", color:"#047857"},
              "referido-llamada": {ico:"🎁", label:"Referido", bg:"#faf5ff", color:"#7c3aed"},
            };
            const o = ORIGEN[type];
            if(!o) return null;
            return (
              <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md" style={{background:o.bg,color:o.color}}>
                  Origen: {o.label}
                </span>
                {type==="referido-llamada" && c._anfitrion && (
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#faf5ff] text-[#7c3aed]">
                    👤 Refirió: {c._anfitrion}{c._parentesco?` · ${c._parentesco}`:""}
                  </span>
                )}
                {type==="prospecto" && c.fuente && (
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#fef3e2] text-[#b45309]">
                    <Ico e="📲" className="mr-1.5" />{c.fuente}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Info del cliente */}
          <div className="text-xs text-slate-500 space-y-1 mb-3">
            {c.telefono && <div><CallMenu telefono={c.telefono} onCall={onCall} /></div>}
            {type==="prospecto" && c.fuente && <div><span className="bg-[#e5def4] text-[#5b21b6] text-xs px-2 py-0.5 rounded-md font-bold">{c.fuente}</span></div>}
            {c.producto && <div><Ico e="📦" className="mr-1.5" />{c.producto}{c.cuenta?` — ${c.cuenta}`:""}</div>}
            {c.direccion && <div><Ico e="📍" className="mr-1.5" />{c.direccion}{c.ciudad?`, ${c.ciudad}`:""}{ c.cp?` ${c.cp}`:""}</div>}
            {type==="distribucion" && c.ultima_compra && <div><Ico e="🛒" className="mr-1.5" />Última compra: {c.ultima_compra}</div>}
            {c.proximo_seguimiento && <div className={seguimientoVencido?"text-red-500 font-bold":""}><Ico e="⏰" className="mr-1.5" />Seguimiento: {c.proximo_seguimiento}{seguimientoVencido?" (vencido)":""}</div>}
            {c.observaciones && <div className="text-slate-400 italic">"{c.observaciones}"</div>}
            {c.resultado && RESULTADO_STYLE[c.resultado] && (
              <div><span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md" style={RESULTADO_STYLE[c.resultado].style}>{RESULTADO_STYLE[c.resultado].label}</span></div>
            )}
            {c.resultado_detalle && <div className="text-[#5b21b6] text-xs bg-[#5b21b6]/6 rounded-lg px-2 py-1"><Ico e="📝" className="mr-1.5" />{c.resultado_detalle}</div>}
          </div>

          {/* ── ÚLTIMA NOTA + AGREGAR NOTA ── */}
          {!inPapelera && (
            <div className="mb-3 rounded-xl border border-[#e8edf3] overflow-hidden">
              {c.ultimaNota && (
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                  <div className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-0.5"><Ico e="📌" className="mr-1.5" />Última nota</div>
                  <div className="text-xs text-slate-700">{c.ultimaNota}</div>
                </div>
              )}
              <div className="p-2 bg-white">
                <div className="flex gap-1.5">
                  <input value={nuevaNota} onChange={e=>setNuevaNota(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")guardarNota();}}
                    placeholder="Escribir nueva nota…"
                    className="flex-1 border border-[#e5def4] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" />
                  <button onClick={guardarNota} disabled={!nuevaNota.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{background:"#16a34a"}}>Guardar</button>
                </div>
                {notaMsg && <div className="text-[10px] font-bold text-emerald-600 mt-1"><Msg>{notaMsg}</Msg></div>}
                {notas.length>0 && (
                  <button onClick={()=>setShowNotasHist(p=>!p)} className="text-[10px] font-bold text-[#7c3aed] mt-1.5">
                    {showNotasHist?"Ocultar":"Ver"} historial de notas ({notas.length})
                  </button>
                )}
                {showNotasHist && notas.length>0 && (
                  <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                    {[...notas].reverse().map((n,i)=>{
                      const d=new Date(n.fecha);
                      const fechaOk=n.fecha && !isNaN(d.getTime());
                      return (
                        <div key={i} className="bg-[#f4f6f9] rounded-lg px-2 py-1.5 text-[11px]">
                          <div className="text-slate-700">{n.texto}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {fechaOk ? <><Ico e="📅" className="mr-1.5" />{d.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} <Ico e="🕐" /> {d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</> : <><Ico e="📅" className="mr-1" />—</>}{n.agente?<> · <Ico e="👤" /> {n.agente}</>:null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── BOTÓN DETALLES ── */}
          <button onClick={()=>setShowDetalles(p=>!p)}
            className="w-full mb-3 flex items-center justify-between px-3 py-2 rounded-xl border border-[#e5def4] bg-[#f4f6f9] hover:bg-[#f1ecfd] transition text-xs font-bold text-[#5b21b6]">
            <span><Ico e="📋" className="mr-1.5" />{showDetalles?"Ocultar detalles":"Ver detalles completos"}</span>
            <span className={`transition-transform duration-200 ${showDetalles?"rotate-180":""}`}>▾</span>
          </button>
          {showDetalles && (
            <div className="mb-3 rounded-xl border border-[#e5def4] overflow-hidden">
              <div className="px-3 py-2 text-xs font-black text-white uppercase tracking-wide" style={{background:RP.navy}}><Ico e="📋" className="mr-1.5" />Detalles del cliente</div>
              <div className="divide-y divide-[#f4f6f9] text-xs">
                {[
                  ["Nombre", c.nombre],
                  ["N° de cuenta", c.cuenta],
                  ["Dirección", c.direccion],
                  ["Ciudad", c.ciudad],
                  ["📱 Móvil", c.telefonoMovil||c.telefono],
                  ["🏠 Casa", c.telefonoCasa],
                  ["💼 Trabajo", c.telefonoTrabajo],
                  ["Vendedor", c.vendedor],
                  ["Nivel del cliente", c.nivelCliente],
                  ["Límite de crédito", c.limiteCredito],
                  ["Saldo actual", c.saldoActual],
                  ["Productos", Array.isArray(c.productos)&&c.productos.length?c.productos.join(", "):(c.producto||"")],
                  ["Otros detalles", c.otrosDetalles],
                  ["Observaciones", c.observaciones],
                ].filter(([,v])=>v && String(v).trim()).map(([label,val],i)=>(
                  <div key={i} className="flex px-3 py-1.5">
                    <span className="text-slate-400 font-bold w-32 shrink-0">{label}</span>
                    <span className="text-slate-700 flex-1 break-words">{val}</span>
                  </div>
                ))}
                <div className="flex px-3 py-1.5 bg-[#f9fafb]">
                  <span className="text-slate-400 font-bold w-32 shrink-0">Fecha agregado</span>
                  <span className="text-slate-500 flex-1">{c.creado?new Date(c.creado).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"}):"—"}</span>
                </div>
                {c.actualizado && (
                  <div className="flex px-3 py-1.5 bg-[#f9fafb]">
                    <span className="text-slate-400 font-bold w-32 shrink-0">Última actualización</span>
                    <span className="text-slate-500 flex-1">{new Date(c.actualizado).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})} {new Date(c.actualizado).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-1.5 flex-wrap">
            {!inPapelera && (
              <button onClick={()=>setShowResult(p=>!p)}
                className={`flex-1 text-xs font-bold py-2 px-2 rounded-lg transition ${showResult?"text-white":"text-[#5b21b6]"}`}
                style={showResult?{background:RP.navy}:{background:"#f1ecfd"}}>
                {isCita?<><Ico e="🎯" className="mr-1" />Resultado cita</>:<><Ico e="📞" className="mr-1" />Resultado</>}
              </button>
            )}
            {!inPapelera && <button onClick={()=>onSchedule(c)} className="flex-1 text-xs font-bold py-2 px-2 rounded-lg bg-[#7c3aed]/12 text-[#7c3aed]"><Ico e="📅" className="mr-1.5" />Agendar</button>}
            {!inPapelera && <button onClick={()=>onEdit(c)} className="text-xs font-bold py-2 px-2 rounded-lg bg-[#f4f6f9] text-slate-600"><Ico e="✏" /></button>}
            {!inPapelera && <button onClick={()=>onDelete(c.id)} className="text-xs font-bold py-2 px-2 rounded-lg bg-red-50 text-red-500" title="Mover a papelera"><Ico e="🗑" /></button>}
            {inPapelera && <button onClick={()=>onRestore(c.id)} className="flex-1 text-xs font-bold py-2 px-2 rounded-lg bg-emerald-50 text-emerald-600"><Ico e="♻" className="mr-1.5" />Restaurar</button>}
            {inPapelera && <button onClick={()=>{if(confirm("¿Eliminar permanentemente? No se puede deshacer."))onHardDelete(c.id);}} className="flex-1 text-xs font-bold py-2 px-2 rounded-lg bg-red-100 text-red-600"><Ico e="🗑" className="mr-1.5" />Definitivo</button>}
          </div>

          {/* Panel de resultado */}
          {showResult && !inPapelera && (
            <div className="mt-3 rounded-xl overflow-hidden border border-[#5b21b6]/15">
              <div className="px-3 py-2 text-xs font-bold text-white tracking-wide uppercase" style={{background:RP.navy}}>
                {isCita?<><Ico e="🎯" className="mr-1" />Resultado de la cita</>:<><Ico e="☎" className="mr-1" />Registrar llamada</>}
              </div>
              <div className="p-2 bg-[#f1ecfd]">
                {isCita ? (
                  <>
                    {/* Agendar OTRA cita a un cliente que ya está en verde */}
                    <button onClick={()=>{ onSchedule(c); setShowResult(false); }}
                      className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-white active:scale-95 transition"
                      style={{background:RP.navy}}>
                      <Ico e="📅" className="mr-1.5" />Agendar otra cita
                    </button>
                    {/* CITA: nota + botones de resultado directos */}
                    <div className="mb-2">
                      <textarea className="w-full border-2 border-[#e5def4] bg-white rounded-lg px-3 py-2 text-sm text-[#1f2d3d] focus:outline-none focus:border-[#5b21b6] resize-none placeholder:text-slate-400"
                        rows={2} maxLength={300} placeholder="Detalle del resultado (opcional)…"
                        value={resultDetail} onChange={e=>setResultDetail(e.target.value)} />
                      <div className="text-right text-[10px] text-slate-400 font-bold mt-0.5">{resultDetail.length}/300</div>
                    </div>

                    {/* Paso 2: campo de monto (solo si ya tocó demo_venta) */}
                    {resultSelId==="demo_venta" && (
                      <div className="mb-3 p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50">
                        <div className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-2"><Ico e="💵" className="mr-1.5" />¿Cuánto fue la venta?</div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base font-bold text-slate-500">$</span>
                          <input type="number" value={montoVenta} onChange={e=>setMontoVenta(e.target.value)}
                            className="flex-1 border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-base font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 placeholder:text-slate-300"
                            placeholder="0.00" min="0" step="0.01" autoFocus />
                        </div>
                        {/* Producto vendido */}
                        <div className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5"><Ico e="📦" className="mr-1.5" />¿Qué producto vendió?</div>
                        <select value={productoVenta} onChange={e=>{setProductoVenta(e.target.value); setFiltroVenta("");}}
                          className="w-full border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 mb-2">
                          <option value="">— Selecciona el producto —</option>
                          {PRODUCTOS_VENTA.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        {productoVenta==="filtros" && (
                          <select value={filtroVenta} onChange={e=>setFiltroVenta(e.target.value)}
                            className="w-full border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 mb-2">
                            <option value="">— Tipo de filtro —</option>
                            {PRODUCTOS_VENTA.find(p=>p.id==="filtros").sub.map(s=><option key={s.id} value={s.id}>{s.label} (cada {s.meses} meses)</option>)}
                          </select>
                        )}
                        {productoVenta==="filtros" && filtroVenta && (
                          <div className="text-[10px] text-emerald-600 mb-2"><Ico e="🔔" className="mr-1.5" />Te avisaré cuando toque el cambio de cartucho.</div>
                        )}
                        {productoVenta==="purificador" && (
                          <div className="text-[10px] text-emerald-600 mb-2"><Ico e="🔔" className="mr-1.5" />Te avisaré cada año para su mantenimiento.</div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={()=>{setResultSelId("");setMontoVenta("");setProductoVenta("");setFiltroVenta("");}}
                            className="px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500">Cancelar</button>
                          <button onClick={()=>handleResultClick(APPT_RESULTS.find(r=>r.id==="demo_venta"))}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{background:"#047857"}}>
                            💰 Confirmar venta {montoVenta?`$${montoVenta}`:""}
                          </button>
                        </div>
                        <div className="text-[10px] text-emerald-600 mt-1.5">El valor se suma al total vendido del incentivo.</div>
                      </div>
                    )}

                    {/* Botones de resultado — demo_venta pre-selecciona, los demás guardan directo */}
                    {resultSelId!=="demo_venta" && (
                      <div className="grid grid-cols-2 gap-2">
                        {APPT_RESULTS.map(r=>(
                          <button key={r.id}
                            onClick={()=>{ if(r.id==="demo_venta"){ setResultSelId("demo_venta"); } else { handleResultClick(r); } }}
                            style={{background:r.bg,color:r.text}}
                            className="flex items-center justify-center gap-1.5 text-center px-3 py-3 rounded-lg text-sm font-bold shadow-sm hover:brightness-105 active:scale-95 transition">
                            <Ico e={r.ico} size={15} />{r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* LLAMADA: elegir estado + nota + botón Guardar */}
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">1. ¿Qué pasó en la llamada?</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {CALL_RESULTS.map(r=>(
                        <button key={r.id} onClick={()=>setCallStatus(r)}
                          style={callStatus?.id===r.id?{background:r.bg,color:r.text}:{background:"#fff",color:"#64748b"}}
                          className={`flex items-center justify-center gap-1.5 text-center px-3 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:brightness-105 active:scale-95 transition ${callStatus?.id===r.id?"ring-2 ring-offset-1 ring-[#5b21b6]":"border border-[#e5def4]"}`}>
                          <Ico e={r.ico} size={15} />{r.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">2. Nota de la llamada (opcional)</div>
                    <textarea className="w-full border-2 border-[#e5def4] bg-white rounded-lg px-3 py-2 text-sm text-[#1f2d3d] focus:outline-none focus:border-[#5b21b6] resize-none placeholder:text-slate-400 mb-2"
                      rows={2} maxLength={300} placeholder="Ej: No contestó, llamar mañana. / Interesado, agendar cita…"
                      value={resultDetail} onChange={e=>setResultDetail(e.target.value)} />
                    <button onClick={()=>{
                        if(!callStatus){ return; }
                        onStatusChange(c.id, callStatus.status);
                        if(onSaveCallToHistorial) onSaveCallToHistorial(c.id, makeHistorialEntry({tipo:"llamada",estado:callStatus.status,notas:resultDetail,agente}));
                        if(callStatus.id==="cita") onSchedule(c);
                        setShowResult(false); setResultDetail(""); setCallStatus(null); setShowHistory(true);
                      }}
                      disabled={!callStatus}
                      className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                      style={{background: callStatus ? "#16a34a" : "#94a3b8"}}>
                      💾 {callStatus ? `Guardar llamada — ${callStatus.label}` : "Selecciona qué pasó arriba"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Historial */}
          <button onClick={()=>setShowHistory(p=>!p)}
            className="w-full mt-3 flex items-center justify-between px-3 py-2 rounded-xl border border-[#e5def4] bg-[#f4f6f9] hover:bg-[#f1ecfd] transition text-xs font-bold text-[#5b21b6]">
            <span><Ico e="📊" className="mr-1.5" />{showHistory?"Ocultar historial":"Ver historial"} {historial.length>0?`(${historial.length} contacto${historial.length!==1?"s":""})`:"— sin registros"}</span>
            <span className={`transition-transform duration-200 ${showHistory?"rotate-180":""}`}>▾</span>
          </button>

          {showHistory && (
            <div className="mt-2 rounded-xl overflow-hidden border border-[#e5def4]">
              <div className="px-3 py-2 text-xs font-black text-white uppercase tracking-wide" style={{background:RP.navy}}>
                <Ico e="📊" className="mr-1.5" />Historial de contactos
              </div>
              {historial.length===0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Sin registros todavía</div>
              ) : (
                <div className="divide-y divide-[#e8edf3]">
                  {[...historial].reverse().map((h,i)=>{
                    const esCita=h.tipo==="cita";
                    const esEstado=h.tipo==="estado";
                    const d=new Date(h.fecha);
                    const fechaStr=d.toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});
                    const horaStr=d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
                    const estInfo=STATUS_COLORS[h.estado];
                    const resInfo=RESULTADO_STYLE[h.cita_resultado];
                    const icono = esCita?"📋":esEstado?"🏷️":"📞";
                    const titulo = esCita?"Cita":esEstado?"Cambio de estado":"Llamada";
                    return (
                      <div key={h.id||i} className={`p-3 ${esCita?"bg-[#f0f7ff]":esEstado?"bg-[#faf8ff]":"bg-white"}`}>
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-base mt-0.5"
                            style={{background:esCita?RP.navy:esEstado?"#7c3aed":"#e8edf3"}}>
                            {icono}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-xs font-black text-[#1f2d3d]">{titulo}</span>
                              <span className="text-[10px] text-slate-400 bg-white border border-[#e8edf3] px-1.5 py-0.5 rounded-md"><Ico e="📅" className="mr-1.5" />{fechaStr}</span>
                              <span className="text-[10px] text-slate-400 bg-white border border-[#e8edf3] px-1.5 py-0.5 rounded-md"><Ico e="🕐" className="mr-1.5" />{horaStr}</span>
                              {h.agente && <span className="text-[10px] text-[#5b21b6] bg-[#5b21b6]/8 px-1.5 py-0.5 rounded-md font-bold"><Ico e="👤" className="mr-1.5" />{h.agente}</span>}
                            </div>
                            {(!esCita) && estInfo && (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mb-1" style={estInfo.style}>{estInfo.label}</div>
                            )}
                            {esCita && resInfo && (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mb-1" style={resInfo.style}>{resInfo.label}</div>
                            )}
                            {esCita && !resInfo && (
                              <div className="text-[10px] text-slate-400 italic mb-1">Sin resultado registrado</div>
                            )}
                            {h.notas && (
                              <div className="text-[10px] text-slate-500 italic bg-white rounded-lg px-2 py-1 border border-[#e8edf3] mt-1">📝 "{h.notas}"</div>
                            )}
                          </div>
                          {/* Eliminar este registro del historial (con confirmación) */}
                          {onDeleteHistorial && (h.id||h.fecha) && (
                            <button onClick={()=>{
                              if(confirm(`¿Eliminar este registro de ${titulo.toLowerCase()} del ${fechaStr}?\n\nEsto solo borra este registro del historial. El cliente y sus demás datos NO se tocan.`)){
                                onDeleteHistorial(c.id, h.id||h.fecha);
                              }
                            }} className="text-red-300 hover:text-red-500 text-xs shrink-0 px-1" title="Eliminar este registro"><Ico e="🗑" /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DB SECTION ───────────────────────────────────────────────
function DBSection({ data, setData, type, title, onCallLog, role, allData, agente, notify, setAppts, rolActivo="", cobranzaClientes=null }) {
  // Exportar (CSV/PDF) solo para roles de gestión — NUNCA telemarketing/vendedor
  const puedeExportar = puedeExportarRol(rolActivo);
  const [search,setSearch]=useState("");const [filterStatus,setFilterStatus]=useState("todos");
  const [filterCity,setFilterCity]=useState("");const [filterCP,setFilterCP]=useState("");
  const [showRoute,setShowRoute]=useState(false);const [routeSel,setRouteSel]=useState([]);
  const [showPapelera,setShowPapelera]=useState(false);
  const [showForm,setShowForm]=useState(false);const [editItem,setEditItem]=useState(null);
  const [scheduleClient,setScheduleClient]=useState(null);const [forceTipo,setForceTipo]=useState(null);
  const [calLoading,setCalLoading]=useState(false);const [calMsg,setCalMsg]=useState("");
  const [dupMsg,setDupMsg]=useState("");
  const norm=(t)=>(t||"").toString().trim().toLowerCase();
  const cities=[...new Set(data.map(c=>(c.ciudad||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  // Estado del filtro de código postal (exacto con 5 dígitos)
  const zipQuery = normalizeZip(filterCP);
  const zipIncompleto = zipQuery.length>0 && zipQuery.length<5;
  const eliminados = data.filter(c=>c.eliminado);
  // Descartar registros sin id válido (igual criterio que CallControl)
  const _tieneIdValidoDB=(c)=>{
    if(!c) return false;
    if(c._tipo==="referidos"){
      if(typeof c.id!=="string") return false;
      const p=c.id.split("::");
      return !!p[0] && p[0]!=="undefined" && p[0]!=="null" && p[1]!==undefined && p[1]!=="";
    }
    return c?.id!==undefined && c?.id!==null && c?.id!=="";
  };
  const _baseDB = data.filter(c=> showPapelera ? c.eliminado : !c.eliminado);
  const filtered=data.filter(c=>{
    if(showPapelera) return c.eliminado;          // en papelera solo mostramos eliminados
    if(c.eliminado) return false;                 // ocultar eliminados de la vista normal
    if(!_tieneIdValidoDB(c)) return false;        // C) descartar registros sin id válido
    // Búsqueda global unificada (nombre/teléfono/ciudad/estado/CP/dirección, sin acentos)
    return coincideBusqueda(c, {search, filterStatus, filterCity, filterCP});
  });
  const toggleRoute=id=>setRouteSel(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const routeList=filtered.filter(c=>routeSel.includes(c.id));
  const saveNew=d=>{
    if(editItem){ setData(p=>p.map(x=>x.id===editItem.id?{...d,id:editItem.id}:x)); setShowForm(false);setEditItem(null); return; }
    if(type!=="referido" && allData && isDuplicate(d, allData)){
      setDupMsg(`⚠️ "${d.nombre||"Sin nombre"}" con ese teléfono ya existe. No se agregó duplicado.`);
      setShowForm(false); return;
    }
    setData(p=>[{...d,id:genId(),creado:d.creado||new Date().toISOString()},...p]);
    if(notify) notify("datos",
      `📂 Dato nuevo agregado por ${agente}`,
      `${d.nombre||"Sin nombre"}${d.telefono?` · ${d.telefono}`:""} en ${title}`,
      title
    );
    setShowForm(false);setEditItem(null);
  };
  const openSchedule=(client,tipo=null)=>{setScheduleClient(client);setForceTipo(tipo);};
  const handleSchedule=appt=>{
    setCalMsg("");
    window.open(gcalLink(appt),"_blank");
    if(setAppts) setAppts(p=>[{...appt,id:genId(),_type:appt.tipo},...p]);

    // ── OBJETIVO 3: Actualizar tarjeta del cliente con datos del appt ──
    if(scheduleClient){
      setData(p=>p.map(x=>{
        if(x.id!==scheduleClient.id) return x;
        const upd={...x};
        // Teléfono: solo rellenar si está vacío
        if(!upd.telefono && appt.telefono) upd.telefono=appt.telefono;
        // Dirección: solo rellenar si está vacía (no sobrescribir si difiere)
        if(!upd.direccion && appt.direccion) upd.direccion=appt.direccion;
        // Ciudad: solo rellenar si está vacía
        if(!upd.ciudad && appt.ciudad) upd.ciudad=appt.ciudad;
        // CP: solo rellenar si está vacío
        if(!upd.cp && appt.cp) upd.cp=appt.cp;
        // Cuenta: solo rellenar si está vacía
        if(!upd.cuenta && appt.cuenta) upd.cuenta=appt.cuenta;
        // Nota de la cita → al historial + última nota visible
        if(appt.notas && appt.notas.trim()){
          const notaCita=`[Cita ${appt.tipo||"cita"} ${(appt.fecha||"").slice(0,10)}] ${appt.notas.trim()}`;
          upd.ultimaNota=notaCita;
          upd.notas=[...(upd.notas||[]),{texto:notaCita,fecha:new Date().toISOString(),agente:appt.agente||agente}];
        }
        // Próximo seguimiento: si el tipo es seguimiento o llamada
        if(["llamada","seguimiento","reset"].includes(appt.tipo) && appt.fecha){
          upd.proximo_seguimiento=(appt.fecha||"").slice(0,10);
        }
        // Marcar última cita programada
        upd.ultima_cita_programada=(appt.fecha||"").slice(0,16);
        upd.actualizado=new Date().toISOString();
        return upd;
      }));
    }

    setCalMsg(`✅ ${EVENT_CONFIG[appt.tipo]?.emoji||"📋"} ${appt.nombre} — cita guardada en Agenda y se abrió Google Calendar: solo toca GUARDAR allá.`);
    setScheduleClient(null);setForceTipo(null);
  };
  const handleApptResult=(c,id,detail="",monto="",producto="",cartucho_meses=0)=>{
    const RLABEL={demo_venta:"💰 Demo / venta",demo_no_venta:"🎬 Demo / no venta",no_recibio:"🚪 No recibió",no_visito:"🚷 No se visitó",seguimiento:"📅 Llamar más adelante",recompra:"✖️ Recompra (no pagó su deuda)"};
    const montoNum = id==="demo_venta" ? Number(monto)||0 : 0;
    if(id==="demo_venta")      setData(p=>p.map(x=>x.id===c.id?{...x,venta:true, resultado:"demo_venta",    resultado_detalle:detail||x.resultado_detalle, ultimo_monto_venta:montoNum||x.ultimo_monto_venta, ultimo_producto:producto||x.ultimo_producto, ultimo_cartucho_meses:cartucho_meses||x.ultimo_cartucho_meses}:x));
    else if(id==="demo_no_venta")  setData(p=>p.map(x=>x.id===c.id?{...x,venta:false,resultado:"demo_no_venta", resultado_detalle:detail||x.resultado_detalle}:x));
    else if(id==="no_recibio") setData(p=>p.map(x=>x.id===c.id?{...x,venta:false,resultado:"no_recibio",resultado_detalle:detail||x.resultado_detalle}:x));
    else if(id==="no_visito") setData(p=>p.map(x=>x.id===c.id?{...x,venta:false,resultado:"no_visito",resultado_detalle:detail||x.resultado_detalle}:x));
    else if(id==="seguimiento"){setData(p=>p.map(x=>x.id===c.id?{...x,resultado:"seguimiento",resultado_detalle:detail||x.resultado_detalle}:x)); openSchedule(c,"llamada");}
    else if(id==="reset"){setData(p=>p.map(x=>x.id===c.id?{...x,resultado:"reset",resultado_detalle:detail||x.resultado_detalle}:x)); openSchedule(c,"reset");}
    else if(id==="recompra") setData(p=>p.map(x=>x.id===c.id?{...x,venta:false,resultado:"recompra",resultado_detalle:detail||"No pagó su deuda anterior — no sacar cita",recompra:true}:x));
    if(notify) notify("resultado",
      `🎯 Resultado de cita registrado por ${agente}`,
      `${c.nombre||"Cliente"} → ${RLABEL[id]||id}${producto?` · ${producto}`:""}${detail?` · "${detail}"`:""}${montoNum?` · $${montoNum}`:""}`,
      title
    );
  };
  const exportCSV=()=>{const cols=type==="referido"?["anfitrion","regalo","estado"]:type==="distribucion"?["nombre","cuenta","telefono","producto","ciudad","cp","direccion","ultima_compra","observaciones","estado"]:type==="prospecto"?["nombre","telefono","fuente","producto","ciudad","cp","direccion","observaciones","estado"]:["nombre","cuenta","telefono","producto","ciudad","cp","direccion","observaciones","estado"];const rows=[cols.join(","),...filtered.map(r=>cols.map(c=>`"${(r[c]||"").toString().replace(/"/g,'""')}"`).join(","))];const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows.join("\n")],{type:"text/csv"}));a.download=`${type}_${Date.now()}.csv`;a.click();};
  return (
    <div>
      {calMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-bold flex items-center justify-between"><Msg>{calMsg}</Msg><button onClick={()=>setCalMsg("")} className="ml-2"><Ico e="✕" /></button></div>}
      {dupMsg && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-800 font-bold flex items-center justify-between"><Msg>{dupMsg}</Msg><button onClick={()=>setDupMsg("")} className="ml-2"><Ico e="✕" /></button></div>}

      {/* Search + status */}
      <div className="flex items-center gap-2 mb-2">
        <input className={inpLight+" flex-1"} placeholder="Buscar por nombre o teléfono…" name={`buscar-${type}`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="border-2 border-[#e5def4] rounded-lg px-2 py-2 text-xs bg-white shrink-0 font-bold" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="todos">Todos</option>{Object.entries(STATUS_COLORS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      {/* City + CP filter */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <input list={`ciudades-${type}`} className="w-full border-2 border-[#e5def4] rounded-lg px-2 py-2 text-xs bg-white font-bold text-slate-700 focus:outline-none focus:border-[#7c3aed]"
            placeholder={`Filtrar ciudad (${cities.length} disponibles)`}
            name={`filtro-ciudad-${type}`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            value={filterCity} onChange={e=>setFilterCity(e.target.value)} />
          <datalist id={`ciudades-${type}`}>
            {cities.map(c=><option key={c} value={c}>{c}</option>)}
          </datalist>
        </div>
        <input className="border-2 border-[#e5def4] rounded-lg px-2 py-2 text-xs bg-white font-bold text-slate-700 w-24"
          placeholder="C.P. (5 díg)" inputMode="numeric" maxLength={10}
          name={`filtro-cp-${type}`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={filterCP} onChange={e=>setFilterCP(e.target.value)} />
        {(filterCity||filterCP) && <button onClick={()=>{setFilterCity("");setFilterCP("");}} className="text-xs text-red-400 font-bold px-1 hover:text-red-600"><Ico e="✕" /></button>}
      </div>
      {zipIncompleto && <div className="mb-3 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><Ico e="📮" className="mr-1.5" />Escribe 5 dígitos para filtrar por código postal</div>}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {!showPapelera && <PrimaryBtn onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Agregar</PrimaryBtn>}
        {puedeExportar && <button onClick={exportCSV} className="px-3 py-2.5 rounded-lg text-xs font-bold bg-[#f4f6f9] text-slate-700 border border-[#e5def4]"><Ico e="📥" className="mr-1.5" />CSV</button>}
        {puedeExportar && <button onClick={()=>exportToPDF(filtered,title)} className="px-3 py-2.5 rounded-lg text-xs font-bold text-white" style={{background:RP.navyDark}}><Ico e="🖨" className="mr-1.5" />PDF</button>}
        {type!=="referido" && !showPapelera && <button onClick={()=>{setShowRoute(p=>!p);setRouteSel([]);}}
          className={`px-3 py-2.5 rounded-lg text-xs font-bold border transition ${showRoute?"text-white border-transparent":"border-[#e5def4] text-[#5b21b6] bg-[#f4f6f9]"}`}
          style={showRoute?{background:RP.navy}:{}}><Ico e="🗺" className="mr-1.5" />Ruta</button>}
        <button onClick={()=>{setShowPapelera(p=>!p);setShowRoute(false);}}
          className={`px-3 py-2.5 rounded-lg text-xs font-bold border transition ${showPapelera?"text-white border-transparent":"border-[#e5def4] text-slate-500 bg-[#f4f6f9]"}`}
          style={showPapelera?{background:"#dc2626"}:{}}><Ico e="🗑" className="mr-1.5" />Papelera{eliminados.length>0?` (${eliminados.length})`:""}</button>
        <span className="ml-auto text-xs text-slate-400 self-center font-bold">{filtered.length} registro(s)</span>
      </div>

      {showPapelera && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-bold">
          🗑️ Papelera — los registros eliminados se pueden restaurar aquí. "Eliminar definitivo" no se puede deshacer.
        </div>
      )}

      {/* Route planner panel */}
      {showRoute && (
        <div className="mb-4 bg-[#f4f6f9] rounded-xl p-3 border border-[#e5def4]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-[#5b21b6] uppercase tracking-wider"><Ico e="🗺" className="mr-1.5" />Planeador de ruta</div>
            <span className="text-xs font-bold text-slate-500">{routeSel.length} parada(s)</span>
          </div>
          <div className="text-[10px] text-slate-400 mb-2">Solo aparece 🗺️ en clientes con dirección exacta. Las paradas van en el orden que las seleccionas.</div>
          {routeList.length>0 && (
            <div className="space-y-1 mb-3 max-h-36 overflow-y-auto">
              {routeList.map((c,i)=>(
                <div key={c.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-[#e8edf3]">
                  <span className="font-black text-[#5b21b6] w-5 text-center shrink-0">{i+1}</span>
                  <span className="font-bold text-[#1f2d3d] truncate flex-1">{c.nombre}</span>
                  <span className="text-slate-400 text-[10px] truncate"><Ico e="📍" className="mr-1.5" />{c.direccion||"—"}</span>
                  <button onClick={()=>toggleRoute(c.id)} className="ml-1 text-red-400 font-bold shrink-0"><Ico e="✕" /></button>
                </div>
              ))}
            </div>
          )}
          {routeList.length>0
            ? <a href={`https://www.google.com/maps/dir/${routeList.map(c=>encodeURIComponent((c.direccion||"").trim())).filter(Boolean).join("/")}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110 transition" style={{background:"#16a34a"}}>
                <Ico e="🗺" className="mr-1.5" />Abrir ruta en Google Maps ({routeList.length} paradas)
              </a>
            : <div className="text-xs text-slate-400">Toca 🗺️ en cada tarjeta (con dirección exacta) para agregar la parada a la ruta.</div>}
        </div>
      )}

      {filtered.length===0 && <div className="text-center py-12 text-slate-400"><div className="mb-3 flex justify-center"><Ico e="👥" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">No hay registros.</div></div>}
      <div className="space-y-3">
        {filtered.map((c,idx)=>type==="referido"?(
          <div key={`dbref-${idx}-${String(c.id)}`} className="bg-white rounded-2xl border border-[#e8edf3] p-4 shadow-sm relative">

            {/* ANFITRIÓN como tarjeta de cliente: llamable (tel/WS/SMS), con estado e historial propios */}
            {(()=>{
              const anfCard={...c, nombre:c.anfitrion||"(Sin anfitrión)", telefono:c.anfitrion_telefono||"", ciudad:c.anfitrion_ciudad||"", cuenta:c.anfitrion_cuenta||"", direccion:c.anfitrion_direccion||""};
              const patchAnf=(patch)=>setData(p=>p.map(anf=>anf.id===c.id?{...anf,...patch}:anf));
              const saveHistAnf=(entry)=>setData(p=>p.map(anf=>anf.id===c.id?{...anf,historial:[...(anf.historial||[]),entry]}:anf));
              return (
                <ClientRow c={anfCard} type="anfitrion" role={role}
                  onStatusChange={(id,st)=>patchAnf({estado:st})}
                  onEdit={()=>{setEditItem(c);setShowForm(true);}}
                  onSchedule={cc=>openSchedule(cc)}
                  onDelete={()=>{}}
                  onCall={onCallLog}
                  onApptResult={(cc,rid,detail="")=>{
                    const patch = rid==="demo_venta"?{venta:true,resultado:"demo_venta",resultado_detalle:detail}
                      : rid==="demo_no_venta"?{venta:false,resultado:"demo_no_venta",resultado_detalle:detail}
                      : rid==="no_recibio"?{venta:false,resultado:"no_recibio",resultado_detalle:detail}
                      : rid==="no_visito"?{venta:false,resultado:"no_visito",resultado_detalle:detail}
                      : rid==="seguimiento"?{resultado:"seguimiento",resultado_detalle:detail}:{};
                    patchAnf(patch);
                  }}
                  onSaveCallToHistorial={(id,entry)=>saveHistAnf(entry)}
                  onSaveNota={(id,texto)=>{ const conNota=agregarNota({...anfCard},texto,agente); patchAnf({ultimaNota:conNota.ultimaNota, notas:conNota.notas, actualizado:conNota.actualizado}); }}
                  agente={agente} />
              );
            })()}
            {(c.regalo||c.anfitrion_cuenta||c.anfitrion_detalle) && (
              <div className="text-xs text-slate-500 mt-1.5 space-y-0.5 px-1">
                {c.regalo && <div><Ico e="🎁" className="mr-1.5" />{c.regalo}</div>}
                {c.anfitrion_cuenta && <div><Ico e="🔖" className="mr-1.5" />Cuenta: {c.anfitrion_cuenta}</div>}
                {c.anfitrion_detalle && <div><Ico e="📝" className="mr-1.5" />{c.anfitrion_detalle}</div>}
              </div>
            )}

            {/* Resumen de progreso de referidos (para obsequio) */}
            {(()=>{
              const refs=c.referidos||[];
              const citas=refs.filter(r=>r.estado==="verde").length;
              const ventas=refs.filter(r=>r.venta||r.resultado==="venta").length;
              if(refs.length===0) return null;
              const lograObsequio = citas>=4 || ventas>=1;
              return (
                <div className={`mt-2 flex items-center gap-2 flex-wrap text-[10px] font-bold px-2.5 py-1.5 rounded-lg ${lograObsequio?"bg-amber-50 text-amber-700 border border-amber-200":"bg-[#f4f6f9] text-slate-500"}`}>
                  <span>{refs.length} referido(s)</span>
                  <span>· 📅 {citas} cita(s)</span>
                  <span>· 💰 {ventas} venta(s)</span>
                  {lograObsequio && <span className="ml-auto"><Ico e="🎁" className="mr-1.5" />¡Obsequio ganado!</span>}
                </div>
              );
            })()}

            {/* Cada referido como tarjeta completa */}
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"><Ico e="👥" className="mr-1.5" />Referidos (cada uno es llamable)</div>
              {(c.referidos||[]).length===0 && <div className="text-xs text-slate-400 italic">Sin referidos aún. Toca ✏️ Editar para agregar.</div>}
              {(c.referidos||[]).map((r,i)=>{
                const refCard={
                  ...r,
                  id:`${c.id}::${i}`,
                  _anfitrion:c.anfitrion||"",
                  _parentesco:r.parentesco||"",
                  nombre:r.nombre||"(Referido sin nombre)",
                };
                const patchRef=(patch)=>setData(p=>p.map(anf=>{
                  if(anf.id!==c.id) return anf;
                  const refs=[...(anf.referidos||[])];
                  refs[i]={...refs[i],...patch};
                  return {...anf,referidos:refs};
                }));
                const saveHist=(entry)=>setData(p=>p.map(anf=>{
                  if(anf.id!==c.id) return anf;
                  const refs=[...(anf.referidos||[])];
                  refs[i]={...refs[i],historial:[...(refs[i].historial||[]),entry]};
                  return {...anf,referidos:refs};
                }));
                return (
                  <ClientRow key={i} c={refCard} type="referido-llamada" role={role}
                    onStatusChange={(id,st)=>patchRef({estado:st})}
                    onEdit={()=>{setEditItem(c);setShowForm(true);}}
                    onSchedule={cc=>openSchedule(cc)}
                    onDelete={()=>{}}
                    onCall={onCallLog}
                    onApptResult={(cc,rid,detail="")=>{
                      const patch = rid==="demo_venta"?{venta:true,resultado:"demo_venta",resultado_detalle:detail}
                        : rid==="demo_no_venta"?{venta:false,resultado:"demo_no_venta",resultado_detalle:detail}
                        : rid==="no_recibio"?{venta:false,resultado:"no_recibio",resultado_detalle:detail}
                        : rid==="no_visito"?{venta:false,resultado:"no_visito",resultado_detalle:detail}
                        : rid==="seguimiento"?{resultado:"seguimiento",resultado_detalle:detail}:{};
                      patchRef(patch);
                    }}
                    onSaveCallToHistorial={(id,entry)=>saveHist(entry)}
                    onSaveNota={(id,texto)=>{
                      const refActual={...refCard};
                      const conNota=agregarNota(refActual,texto,agente);
                      patchRef({ultimaNota:conNota.ultimaNota, notas:conNota.notas, actualizado:conNota.actualizado});
                    }}
                    agente={agente} />
                );
              })}
            </div>

            <div className="flex gap-1.5 mt-3"><button onClick={()=>{setEditItem(c);setShowForm(true);}} className="text-xs px-3 py-1.5 rounded-md bg-[#f4f6f9] text-slate-700 font-bold border border-[#e5def4]"><Ico e="✏" className="mr-1.5" />Editar anfitrión / referidos</button><button onClick={()=>setData(p=>p.filter(x=>x.id!==c.id))} className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-500 font-bold"><Ico e="🗑" /></button></div>
          </div>
        ):(
          <ClientRow key={`db-${idx}-${type}-${String(c.id)}`} c={c} type={type} role={role} infoCobranza={cobranzaClientes ? cobranzaClientes[String(c.id)] : null} onStatusChange={(id,st)=>setData(p=>p.map(x=>x.id===id?{...x,estado:st}:x))} onEdit={c=>{setEditItem(c);setShowForm(true);}} onSchedule={c=>openSchedule(c)} onDelete={id=>setData(p=>p.map(x=>x.id===id?{...x,eliminado:true}:x))} onRestore={id=>setData(p=>p.map(x=>x.id===id?{...x,eliminado:false}:x))} onHardDelete={id=>setData(p=>p.filter(x=>x.id!==id))} inPapelera={showPapelera} onCall={onCallLog} onApptResult={handleApptResult} onSaveCallToHistorial={(id,entry)=>setData(p=>addHistorialEntry(p,id,entry))} onSaveNota={(id,texto)=>setData(p=>p.map(x=>x.id===id?agregarNota(x,texto,agente):x))} onToggleRoute={showRoute?toggleRoute:null} isInRoute={routeSel.includes(c.id)} agente={agente} onDeleteHistorial={(cid,ekey)=>setData(p=>deleteHistorialEntry(p,cid,ekey))} />
        ))}
      </div>
      {showForm && <Modal title={`${editItem?"Editar":"Nuevo"} — ${title}`} onClose={()=>{setShowForm(false);setEditItem(null);}}><ClientForm initial={editItem} type={type} onSave={saveNew} onClose={()=>{setShowForm(false);setEditItem(null);}} /></Modal>}
      {scheduleClient && <Modal title="📅 Agendar en Google Calendar" onClose={()=>{setScheduleClient(null);setForceTipo(null);}}><AppointmentForm client={scheduleClient} forceTipo={forceTipo} loading={calLoading} onSave={handleSchedule} onClose={()=>{setScheduleClient(null);setForceTipo(null);}} agenteActivo={agente} /></Modal>}
    </div>
  );
}

// ─── STATS ────────────────────────────────────────────────────
// ─── CITA CARD (expandible: resultado, editar, borrar) ────────
function CitaCard({ a, onUpdate, onDelete, mostrarFecha, esPasada }) {
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState("");          // "" | "result" | "edit"
  const [detail,setDetail]=useState("");
  const [draft,setDraft]=useState(null);
  const [montoCita,setMontoCita]=useState("");
  const [productoCita,setProductoCita]=useState("");
  const [filtroCita,setFiltroCita]=useState("");
  const [ventaStep,setVentaStep]=useState(false); // panel monto+producto al marcar venta
  const esServicio = a._type==="servicio" || a.tipo==="servicio";
  const servEstado = a.servicioResultado || "pendiente"; // pendiente | realizado | no_realizado
  const resInfo = RESULTADO_STYLE[a.resultado];
  const fechaObj = a.fecha ? new Date(a.fecha) : null;
  const horaStr = fechaObj ? fechaObj.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) : "";
  const fechaStr = fechaObj ? fechaObj.toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"}) : "";

  const startEdit = () => {
    setDraft({ nombre:a.nombre||"", telefono:a.telefono||"", direccion:a.direccion||"", fecha:(a.fecha||"").slice(0,16), notas:a.notas||"" });
    setMode("edit");
  };
  const saveEdit = () => { onUpdate({ ...a, ...draft }); setMode(""); };
  const setRes = (id) => {
    if(id==="reset"){ setDetail(""); setMontoCita(""); setProductoCita(""); setFiltroCita(""); setVentaStep(false); startEdit(); return; }
    if(id==="demo_venta"){
      const prod = resolveProducto(productoCita, filtroCita);
      onUpdate({ ...a, resultado:id, resultado_detalle:detail||a.resultado_detalle||"", monto:Number(montoCita)||0, producto:prod.label, cartucho_meses:prod.meses });
    } else {
      onUpdate({ ...a, resultado:id, resultado_detalle:detail||a.resultado_detalle||"" });
    }
    setMode(""); setDetail(""); setMontoCita(""); setProductoCita(""); setFiltroCita(""); setVentaStep(false);
  };
  // Servicio: marca resultado en el MISMO appt (sincroniza con la pestaña Servicio)
  const setServRes = (resultado) => {
    const histPrev=a.servicioHistorial||[];
    onUpdate({ ...a, servicioResultado:resultado, servicioHistorial:[...histPrev,{resultado,fecha:new Date().toISOString(),agente:a.agente||""}], actualizado:new Date().toISOString() });
  };

  return (
    <div className="px-4 py-3">
      {/* Fila compacta */}
      <div className="flex items-center gap-3 cursor-pointer select-none" onClick={()=>setOpen(p=>!p)}>
        <div className="text-lg w-7 text-center shrink-0">{TIPO_ICON[a._type]||"📋"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-[#1f2d3d] truncate">{a.nombre}</div>
          <div className="text-xs text-slate-400">
            {mostrarFecha && fechaStr ? <span className="font-bold text-slate-500">{fechaStr} · </span> : null}
            {horaStr}{a.direccion?` · ${a.direccion}`:""}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Servicio: indicador verde (realizado) / rojo (no realizado o pendiente) */}
            {esServicio ? (
              servEstado==="realizado" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{background:"#16a34a"}}><Ico e="✅" className="mr-1.5" />Se realizó</span>
              ) : servEstado==="no_realizado" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{background:"#dc2626"}}><Ico e="❌" className="mr-1.5" />No se realizó</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{background:"#dc2626"}}><Ico e="🔧" className="mr-1.5" />Servicio pendiente</span>
              )
            ) : (
              <>
                {resInfo && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md" style={resInfo.style}>{resInfo.label}</span>}
                {esPasada && !a.resultado && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700"><Ico e="⏰" className="mr-1.5" />Sin resultado</span>}
              </>
            )}
          </div>
        </div>
        {a.telefono && <div onClick={e=>e.stopPropagation()}><CallMenu telefono={a.telefono} compact /></div>}
        <span className={`text-slate-400 text-sm transition-transform duration-200 shrink-0 ${open?"rotate-180":""}`}>▾</span>
      </div>

      {/* Panel expandido */}
      {open && (
        <div className="mt-2 pl-10">
          {mode==="" && (
            <>
              {/* Servicio: botones de resultado directos (Se realizó / No se realizó) */}
              {esServicio ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button onClick={()=>setServRes("realizado")}
                      className={`px-3 py-2.5 rounded-lg text-xs font-bold transition ${servEstado==="realizado"?"text-white ring-2 ring-offset-1 ring-emerald-500":"text-emerald-700 bg-emerald-50"}`}
                      style={servEstado==="realizado"?{background:"#16a34a"}:{}}><Ico e="✅" className="mr-1.5" />Se realizó</button>
                    <button onClick={()=>setServRes("no_realizado")}
                      className={`px-3 py-2.5 rounded-lg text-xs font-bold transition ${servEstado==="no_realizado"?"text-white ring-2 ring-offset-1 ring-red-500":"text-red-700 bg-red-50"}`}
                      style={servEstado==="no_realizado"?{background:"#dc2626"}:{}}><Ico e="❌" className="mr-1.5" />No se realizó</button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={startEdit} className="flex-1 text-xs font-bold py-2 px-3 rounded-lg bg-[#f4f6f9] text-slate-600"><Ico e="✏" className="mr-1.5" />Editar</button>
                    <button onClick={()=>{if(confirm("¿Borrar este servicio? No se puede deshacer."))onDelete(a.id);}} className="text-xs font-bold py-2 px-3 rounded-lg bg-red-50 text-red-500"><Ico e="🗑" className="mr-1.5" />Borrar</button>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2"><Ico e="🔄" className="mr-1.5" />El resultado se sincroniza con la pestaña Servicio.</div>
                </>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={()=>setMode("result")} className="flex-1 text-xs font-bold py-2 px-2 rounded-lg" style={{background:"#f1ecfd",color:RP.navy}}><Ico e="🎯" className="mr-1.5" />Resultado</button>
                  <button onClick={startEdit} className="text-xs font-bold py-2 px-3 rounded-lg bg-[#f4f6f9] text-slate-600"><Ico e="✏" className="mr-1.5" />Editar</button>
                  <button onClick={()=>{if(confirm("¿Borrar esta cita? No se puede deshacer."))onDelete(a.id);}} className="text-xs font-bold py-2 px-3 rounded-lg bg-red-50 text-red-500"><Ico e="🗑" className="mr-1.5" />Borrar</button>
                </div>
              )}
              {a.notas && <div className="text-xs text-slate-400 italic mt-2">"{a.notas}"</div>}
              {a.resultado_detalle && <div className="text-[#5b21b6] text-xs bg-[#5b21b6]/6 rounded-lg px-2 py-1 mt-2"><Ico e="📝" className="mr-1.5" />{a.resultado_detalle}</div>}
            </>
          )}

          {/* Registrar resultado */}
          {mode==="result" && (
            <div className="rounded-xl overflow-hidden border border-[#5b21b6]/15">
              <div className="px-3 py-2 text-xs font-bold text-white tracking-wide uppercase" style={{background:RP.navy}}><Ico e="🎯" className="mr-1.5" />Resultado de la cita</div>
              <div className="p-2 bg-[#f1ecfd]">
                <textarea className="w-full border-2 border-[#e5def4] bg-white rounded-lg px-3 py-2 text-sm text-[#1f2d3d] focus:outline-none focus:border-[#5b21b6] resize-none placeholder:text-slate-400 mb-2"
                  rows={2} maxLength={300} placeholder="Detalle del resultado (opcional)…"
                  value={detail} onChange={e=>setDetail(e.target.value)} />
                {!ventaStep ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {APPT_RESULTS.map(r=>(
                        <button key={r.id} onClick={()=>{ if(r.id==="demo_venta"){ setVentaStep(true); } else { setRes(r.id); } }}
                          style={{background:r.bg,color:r.text}}
                          className="flex items-center justify-center text-center px-3 py-3 rounded-lg text-sm font-bold shadow-sm hover:brightness-105 active:scale-95 transition">
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>{setMode("");setDetail("");}} className="w-full mt-2 text-xs font-semibold text-slate-500 py-1.5">Cancelar</button>
                  </>
                ) : (
                  <div className="p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50">
                    <div className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-2"><Ico e="💵" className="mr-1.5" />¿Cuánto fue la venta?</div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-bold text-slate-500">$</span>
                      <input type="number" value={montoCita} onChange={e=>setMontoCita(e.target.value)}
                        className="flex-1 border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-base font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 placeholder:text-slate-300"
                        placeholder="0.00" min="0" step="0.01" autoFocus />
                    </div>
                    <div className="text-[11px] font-black text-emerald-700 uppercase tracking-wider mb-1.5"><Ico e="📦" className="mr-1.5" />¿Qué producto vendió?</div>
                    <select value={productoCita} onChange={e=>{setProductoCita(e.target.value); setFiltroCita("");}}
                      className="w-full border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 mb-2">
                      <option value="">— Selecciona el producto —</option>
                      {PRODUCTOS_VENTA.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    {productoCita==="filtros" && (
                      <select value={filtroCita} onChange={e=>setFiltroCita(e.target.value)}
                        className="w-full border-2 border-emerald-400 bg-white rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 mb-2">
                        <option value="">— Tipo de filtro —</option>
                        {PRODUCTOS_VENTA.find(p=>p.id==="filtros").sub.map(s=><option key={s.id} value={s.id}>{s.label} (cada {s.meses} meses)</option>)}
                      </select>
                    )}
                    {productoCita==="filtros" && filtroCita && (
                      <div className="text-[10px] text-emerald-600 mb-2"><Ico e="🔔" className="mr-1.5" />Te avisaré cuando toque el cambio de cartucho.</div>
                    )}
                    {productoCita==="purificador" && (
                      <div className="text-[10px] text-emerald-600 mb-2"><Ico e="🔔" className="mr-1.5" />Te avisaré cada año para su mantenimiento.</div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>{setVentaStep(false);setMontoCita("");setProductoCita("");setFiltroCita("");}}
                        className="px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500">Atrás</button>
                      <button onClick={()=>setRes("demo_venta")}
                        className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{background:"#047857"}}><Ico e="💰" className="mr-1.5" />Confirmar venta {montoCita?`$${montoCita}`:""}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Editar cita */}
          {mode==="edit" && draft && (
            <div className="space-y-2 bg-[#f4f6f9] rounded-xl p-3 border border-[#e5def4]">
              <input className={inpLight} placeholder="Nombre" value={draft.nombre} onChange={e=>setDraft(d=>({...d,nombre:e.target.value}))} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inpLight} placeholder="Teléfono" value={draft.telefono} onChange={e=>setDraft(d=>({...d,telefono:e.target.value}))} />
                <input type="datetime-local" className={inpLight} value={draft.fecha} onChange={e=>setDraft(d=>({...d,fecha:e.target.value}))} />
              </div>
              <input className={inpLight} placeholder="Dirección" value={draft.direccion} onChange={e=>setDraft(d=>({...d,direccion:e.target.value}))} />
              <textarea className={inpLight+" resize-none"} rows={2} placeholder="Notas" value={draft.notas} onChange={e=>setDraft(d=>({...d,notas:e.target.value}))} />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex-1 px-3 py-2 rounded-lg text-sm font-bold text-white" style={{background:RP.navy}}><Ico e="💾" className="mr-1.5" />Guardar</button>
                <button onClick={()=>setMode("")} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-500">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SISTEMA DE NOTIFICACIONES ────────────────────────────────
// Notificaciones guardadas en Firebase para que todos las vean en tiempo real.
// Estructura: { id, tipo, titulo, detalle, seccion, agente, fecha, leidoPor:[] }

function useNotificaciones(state, setState, agenteActivo) {
  // Contar no leídas (enviadas por otro agente y que yo no he leído)
  const notifs = state.notificaciones || [];
  const noLeidas = notifs.filter(n =>
    n.agente !== agenteActivo &&
    !(n.leidoPor||[]).includes(agenteActivo)
  ).length;

  // Agregar nueva notificación a Firebase (vía setState compartido)
  const notify = (tipo, titulo, detalle, seccion) => {
    const nueva = {
      id: Date.now()+"_"+Math.random().toString(36).slice(2,5),
      tipo,                          // "datos" | "resultado"
      titulo,
      detalle,
      seccion: seccion || "",
      agente: agenteActivo,
      fecha: new Date().toISOString(),
      leidoPor: [agenteActivo],      // quien la creó ya la "leyó"
    };
    setState(s => ({
      ...s,
      notificaciones: [nueva, ...(s.notificaciones||[])].slice(0,100)
    }));
    // Notificación nativa del sistema (si el usuario la permitió)
    try {
      if(Notification.permission === "granted") {
        new Notification(titulo, { body: detalle, icon: "/favicon.ico" });
      }
    } catch {}
  };

  // Marcar todas como leídas para este agente
  const marcarLeidas = () => {
    setState(s => ({
      ...s,
      notificaciones: (s.notificaciones||[]).map(n =>
        (n.leidoPor||[]).includes(agenteActivo)
          ? n
          : { ...n, leidoPor: [...(n.leidoPor||[]), agenteActivo] }
      )
    }));
  };

  // Marcar UNA notificación como leída para este agente
  const marcarUnaLeida = (id) => {
    setState(s => ({
      ...s,
      notificaciones: (s.notificaciones||[]).map(n =>
        n.id===id && !(n.leidoPor||[]).includes(agenteActivo)
          ? { ...n, leidoPor: [...(n.leidoPor||[]), agenteActivo] }
          : n
      )
    }));
  };

  return { notifs, noLeidas, notify, marcarLeidas, marcarUnaLeida };
}

// Pedir permiso de notificaciones al sistema (se llama una vez al montar)
function useNotifPermission() {
  useEffect(() => {
    try {
      if(Notification && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {}
  }, []);
}

// Panel de notificaciones (modal)
function NotifPanel({ notifs, agenteActivo, onClose, onMarcarLeidas, onNotifClick, onLimpiar }) {
  const TIPO_ICON = { datos:"📂", resultado:"🎯", obsequio:"🎁", cumple:"🎂", incentivo:"🏆" };
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div className="relative bg-white w-full max-w-md rounded-t-3xl shadow-2xl overflow-hidden"
        style={{maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8edf3]" style={{background:RP.navy}}>
          <span className="text-white font-black text-sm"><Ico e="🔔" className="mr-1.5" />Notificaciones</span>
          <div className="flex gap-2">
            <button onClick={onMarcarLeidas}
              className="text-[10px] text-white/80 font-bold px-2 py-1 rounded-md bg-white/10 hover:bg-white/20">
              <Ico e="✓" className="mr-1.5" />Marcar leídas
            </button>
            {onLimpiar && <button onClick={onLimpiar}
              className="text-[10px] text-white/80 font-bold px-2 py-1 rounded-md bg-white/10 hover:bg-white/20">
              <Ico e="🗑" className="mr-1.5" />Limpiar
            </button>}
            <button onClick={onClose} className="text-white/80 text-lg leading-none">×</button>
          </div>
        </div>
        {/* Lista */}
        <div className="overflow-y-auto" style={{maxHeight:"calc(80vh - 52px)"}}>
          {notifs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Sin notificaciones todavía</div>
          ) : notifs.map(n => {
            const leida = (n.leidoPor||[]).includes(agenteActivo);
            const fecha = new Date(n.fecha);
            const fechaStr = fecha.toLocaleDateString("es-MX",{day:"numeric",month:"short"});
            const horaStr  = fecha.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
            return (
              <button key={n.id} onClick={()=>onNotifClick(n)}
                className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[#f4f6f9] transition active:bg-[#f1ecfd] ${leida?"opacity-50":"bg-[#f1ecfd]/60"}`}>
                <div className="mt-0.5 shrink-0"><Ico e={TIPO_ICON[n.tipo]||"🔔"} size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#1f2d3d]">{n.titulo}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{n.detalle}</div>
                  <div className="flex gap-2 mt-1 flex-wrap items-center">
                    {n.seccion && <span className="text-[10px] bg-[#5b21b6]/8 text-[#5b21b6] px-1.5 py-0.5 rounded-md font-bold">{n.seccion}</span>}
                    <span className="text-[10px] text-slate-400">{fechaStr} · {horaStr}</span>
                    <span className="text-[10px] text-slate-400">por {n.agente}</span>
                    <span className="text-[10px] text-[#7c3aed] font-bold ml-auto">Ver ›</span>
                  </div>
                </div>
                {!leida && <div className="w-2 h-2 rounded-full bg-[#5b21b6] mt-1.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD "HOY" ──────────────────────────────────────────
// ── Cumpleaños que caen HOY (manuales + base con fecha_cumple), sin duplicados ──
function cumpleanosDeHoy(cumpleanos, allData){
  const hd=new Date(); const mesA=hd.getMonth(), diaA=hd.getDate();
  const pMD=(fc)=>{
    if(!fc) return null; let m,d;
    if(/^\d{4}-\d{2}-\d{2}$/.test(fc)){ const p=fc.split("-"); m=+p[1]-1; d=+p[2]; }
    else if(/^\d{1,2}-\d{1,2}$/.test(fc)){ const p=fc.split("-"); m=+p[0]-1; d=+p[1]; }
    else if(/^\d{1,2}\/\d{1,2}$/.test(fc)){ const p=fc.split("/"); m=+p[0]-1; d=+p[1]; }
    else return null;
    return {mes:m, dia:d};
  };
  const noE=a=>(a||[]).filter(c=>!c.eliminado);
  const base=[...noE(allData?.distribucion),...noE(allData?.agregados),...noE(allData?.prospectos)]
    .filter(c=>c.fecha_cumple).map(c=>({nombre:c.nombre,telefono:c.telefono,fecha_cumple:c.fecha_cumple}));
  const man=(cumpleanos||[]).map(c=>({nombre:c.nombre,telefono:c.telefono,fecha_cumple:c.fecha_cumple}));
  const vistos=new Set();
  return [...man,...base].map(c=>({...c,md:pMD(c.fecha_cumple)}))
    .filter(c=>c.md&&c.md.mes===mesA&&c.md.dia===diaA)
    .filter(c=>{const k=(c.nombre||"")+"|"+((c.telefono||"").replace(/\D/g,"")); if(vistos.has(k))return false; vistos.add(k); return true;});
}
function Dashboard({ allData, appts, setAppts, callLog, agente, goTo, incentivos, cofreConfig, cofreAperturas, abrirCofre, rolActivo, respaldos, registrarRespaldo, cumpleanos }) {
  const todayStr = hoyLocal();
  const flat = [...allData.agregados, ...allData.prospectos, ...allData.distribucion].filter(c=>!c.eliminado);

  // Incentivos activos asignados a este agente (o a todos)
  const misIncentivos = (incentivos||[]).filter(i=>i.estado!=="cancelado" && (!i.agente || i.agente===agente));

  // Citas de hoy (de Google Calendar local)
  const citasHoy = (appts||[]).filter(a=>a.fecha?.startsWith(todayStr));

  // Seguimientos vencidos o de hoy (proximo_seguimiento <= hoy)
  const seguimientos = flat.filter(c=>c.proximo_seguimiento && c.proximo_seguimiento <= todayStr);

  // Pendientes de llamar (sin estado o naranja)
  const pendientes = flat.filter(c=>["sin_estado","naranja"].includes(c.estado));

  // Mis clientes (asignados a mí)
  const misClientes = flat.filter(c=>c.asignado_a===agente);

  // Stats de hoy — MISMO conteo que la pestaña Llamadas (historial + callLog)
  const conteoLlam = useMemo(()=>conteoLlamadas(allData, callLog), [allData, callLog]);
  const callsToday = sumDia(conteoLlam[todayStr]);
  const enHoy=(f)=>diaLocal(f)===todayStr;
  const flatHistHoy=[...flat, ...(allData.referidos||[]), ...(allData.referidos||[]).flatMap(r=>r.referidos||[])];
  const ventasHoy = contarVentasDemos({ appts, clientes:flatHistHoy, enP:enHoy }).ventas;

  // ── Datos auxiliares del dashboard ──
  const manana=fmtDiaLocal(new Date(Date.now()+86400000));
  // Servicios pendientes (appts tipo servicio sin resultado realizado/no_realizado)
  const serviciosPendientes=(appts||[]).filter(a=>a.tipo==="servicio" && !["realizado","no_realizado"].includes(a.servicioResultado||""));
  // Citas próximas (mañana en adelante)
  const citasProximas=(appts||[]).filter(a=>a.tipo==="cita" && a.fecha && a.fecha.slice(0,10)>=manana).sort((x,y)=>new Date(x.fecha)-new Date(y.fecha));

  // ── CAMBIOS DE CARTUCHO (recordatorio recurrente por producto vendido) ──
  const flatCartucho = [...flat, ...(allData.referidos||[]).filter(c=>!c.eliminado)];
  const cartuchos = calcularCartuchos(flatCartucho, appts, 30);
  const cartuchosVencidos = cartuchos.filter(x=>x.vencido);
  // Notificación nativa una sola vez por sesión si hay cambios vencidos
  useEffect(()=>{
    if(typeof window==="undefined" || window.__cartuchoNotifShown) return;
    if(cartuchosVencidos.length>0){
      window.__cartuchoNotifShown = true;
      try{
        if(typeof Notification!=="undefined" && Notification.permission==="granted"){
          new Notification("🔔 Cambio de cartucho pendiente", { body:`${cartuchosVencidos.length} cliente(s) probablemente necesitan cambio de cartucho`, icon:"/favicon.ico" });
        }
      }catch(e){}
    }
  },[cartuchosVencidos.length]);

  // ── PRIORIDADES (solo lo de HOY): pendiente por llamar, reset, seguimiento, recordatorio ──
  const appointmentsHoy=(appts||[]).filter(a=>a.fecha && a.fecha.slice(0,10)===todayStr);
  // Los recordatorios de llamada (tipo "llamada"/"recordatorio") YA NO entran a
  // prioridad — Tomas pidió quitarlos. Solo quedan pendientes reales, seguimiento y reset.
  const pendientesLlamarHoy=appointmentsHoy.filter(a=>a.tipo==="pendiente");
  const resetHoy=appointmentsHoy.filter(a=>a.tipo==="reset");
  const seguimientoHoy=appointmentsHoy.filter(a=>a.tipo==="seguimiento");

  // Chips de prioridad — SOLO citas de HOY de esos 4 tipos
  const chips=[
    { id:"pend", icon:"📞", label:"Por llamar", n:pendientesLlamarHoy.length, tab:"agenda", color:"#ea580c" },
    { id:"seg",  icon:"📅", label:"Seguimiento",n:seguimientoHoy.length,      tab:"agenda", color:"#7c3aed" },
    { id:"res",  icon:"🔄", label:"Reset",      n:resetHoy.length,            tab:"agenda", color:"#f59e0b" },
  ].filter(c=>c.n>0);

  // Lista combinada de pendientes de hoy (para mostrarlos en detalle)
  const prioridadesHoy=[...pendientesLlamarHoy,...seguimientoHoy,...resetHoy]
    .sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));

  const hora = new Date().getHours();
  const saludo = hora<12 ? "Buenos días" : hora<19 ? "Buenas tardes" : "Buenas noches";
  const noElim=(arr)=>(arr||[]).filter(c=>!c.eliminado);
  const nAgg=noElim(allData.agregados).length;
  const nPros=noElim(allData.prospectos).length;
  const nDist=noElim(allData.distribucion).length;
  const nRef=noElim(allData.referidos).reduce((a,anf)=>a+(anf.referidos||[]).length,0);
  const totalDatos=nAgg+nPros+nDist+nRef;
  const kpis=[
    {label:"Llamadas hoy", value:callsToday, icon:"📞", helper:"Actividad registrada hoy"},
    {label:"Citas hoy", value:citasHoy.length, icon:"📅", helper:"Agenda del día"},
    {label:"Ventas hoy", value:ventasHoy, icon:"💰", helper:"Ventas registradas"},
    {label:"Por llamar", value:pendientes.length, icon:"☎", helper:"Pendientes de contacto"},
  ];
  const bases=[
    {label:"Clientes", value:nAgg, icon:"👥", tab:"agregados"},
    {label:"Referidos", value:nRef, icon:"🤝", tab:"referidos"},
    {label:"Prospección", value:nPros, icon:"◎", tab:"prospectos"},
    {label:"Distribución", value:nDist, icon:"⌂", tab:"distribucion"},
  ];

  return (
    <div className="space-y-6">
      {/* CABECERA DEL CENTRO DE MANDO */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <button onClick={()=>goTo&&goTo("config")} className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition text-left">
            {saludo}, {agente}
          </button>
          <h1 className="mt-1 text-2xl sm:text-[30px] font-black tracking-[-0.035em] text-slate-950">Centro de mando</h1>
          <p className="mt-1 text-sm text-slate-500">Tu operación de hoy, prioridades y rendimiento en un solo lugar.</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
          <Ico e="📅" size={14} />
          <span className="capitalize">{new Date().toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})}</span>
        </div>
      </section>

      {/* KPI PRINCIPALES */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map(k=>(
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-semibold text-slate-500">{k.label}</div>
                <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-950">{k.value}</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center shrink-0"><Ico e={k.icon} size={16} /></div>
            </div>
            <div className="mt-2 text-[10px] sm:text-[11px] text-slate-400 leading-tight">{k.helper}</div>
          </div>
        ))}
      </section>

      {/* BASE DE DATOS */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-slate-950">Base de datos</div>
            <div className="text-xs text-slate-500 mt-0.5">{totalDatos.toLocaleString("en-US")} registros activos</div>
          </div>
          <button onClick={()=>goTo&&goTo("agregados")} className="text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] transition">Ver datos →</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x divide-slate-100">
          {bases.map(b=>(
            <button key={b.label} onClick={()=>goTo&&goTo(b.tab)} className="p-4 sm:p-5 text-left hover:bg-slate-50 transition border-b md:border-b-0 border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="text-[#2563EB]"><Ico e={b.icon} size={14} /></span>{b.label}</div>
              <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-950">{b.value.toLocaleString("en-US")}</div>
            </button>
          ))}
        </div>
      </section>

      {/* PANEL DE PRIORIDADES (Obj 9) — chips clicables, lo más importante primero */}
      {chips.length>0 && (
        <div className="rounded-2xl bg-white border-2 border-[#5b21b6]/15 p-3 shadow-sm">
          <div className="text-xs font-black text-[#5b21b6] uppercase tracking-wider mb-2 px-1"><Ico e="🎯" className="mr-1.5" />Tus prioridades de hoy</div>
          <div className="grid grid-cols-3 gap-2">
            {chips.map(c=>(
              <button key={c.id} onClick={()=>goTo(c.tab)}
                className="rounded-xl p-2.5 text-left transition active:scale-95 border"
                style={{background:`${c.color}0d`,borderColor:`${c.color}33`}}>
                <div className="flex items-center justify-between mb-0.5">
                  <Ico e={c.icon} size={16} />
                  <span className="text-xl font-black" style={{fontFamily:SERIF,color:c.color}}>{c.n}</span>
                </div>
                <div className="text-[10px] font-bold text-slate-500">{c.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CITAS PRÓXIMAS (mañana en adelante) */}
      {citasProximas.length>0 && (
        <div className="rounded-2xl bg-white border border-[#e8edf3] overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between bg-[#f1ecfd]">
            <div className="text-sm font-black text-[#5b21b6]"><Ico e="🔜" className="mr-1.5" />Próximas citas</div>
            <span className="text-xs font-black text-white bg-[#7c3aed] px-2 py-0.5 rounded-full">{citasProximas.length}</span>
          </div>
          <div className="divide-y divide-[#f4f6f9] max-h-52 overflow-y-auto">
            {citasProximas.slice(0,5).map(a=>{
              const d=new Date(a.fecha);
              return (
                <button key={a.id} onClick={()=>goTo("agenda")} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#f4f6f9]">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#1f2d3d] truncate">{a.nombre||"Cliente"}</div>
                    <div className="text-xs text-slate-400"><Ico e="🗓" className="mr-1.5" />{d.toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · 🕐 {d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#7c3aed] shrink-0">Ver →</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SERVICIOS PENDIENTES */}
      {serviciosPendientes.length>0 && (
        <div className="rounded-2xl bg-white border border-red-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between bg-red-50">
            <div className="text-sm font-black text-red-700"><Ico e="🔧" className="mr-1.5" />Servicios pendientes</div>
            <span className="text-xs font-black text-white bg-red-500 px-2 py-0.5 rounded-full">{serviciosPendientes.length}</span>
          </div>
          <div className="divide-y divide-[#f4f6f9] max-h-52 overflow-y-auto">
            {serviciosPendientes.slice(0,5).map(a=>{
              const d=a.fecha?new Date(a.fecha):null;
              return (
                <button key={a.id} onClick={()=>goTo("servicio")} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#f4f6f9]">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#1f2d3d] truncate">{a.nombre||"Cliente"}</div>
                    <div className="text-xs text-slate-400">{d?`🗓️ ${d.toLocaleDateString("es-MX",{day:"numeric",month:"short"})}`:"Sin fecha"}{a.direccion?` · 📍 ${a.direccion}`:""}</div>
                  </div>
                  <span className="text-[10px] font-bold text-red-500 shrink-0">Ver →</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🎂 CUMPLEAÑOS DE HOY */}
      {(()=>{
        const hoyCumple = cumpleanosDeHoy(cumpleanos, allData);
        if(!hoyCumple.length) return null;
        return (
          <div className="rounded-2xl bg-white border-2 border-pink-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-pink-50 flex items-center justify-between">
              <div className="text-sm font-black text-pink-600"><Ico e="🎂" className="mr-1.5" />Cumpleaños de hoy</div>
              <span className="text-xs font-black text-white bg-pink-500 px-2 py-0.5 rounded-full">{hoyCumple.length}</span>
            </div>
            <div className="divide-y divide-[#f4f6f9]">
              {hoyCumple.map((c,i)=>(
                  <div key={`cum-${i}`} className="px-4 py-2.5 flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-[#1f2d3d] truncate">{c.nombre}</div>
                      <div className="text-xs text-slate-400">¡Hoy es su día! 🥳</div>
                    </div>
                    {/* MISMOS enlaces que la pestaña Cumpleaños: número normalizado
                        (waDigitos agrega el 1 de USA) y mismo mensaje de felicitación. */}
                    {c.telefono && <a href={waLinkMsg(c.telefono,c.nombre)} target="_blank" rel="noreferrer" className="text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0" style={{background:"#25D366"}}><Ico e="💬" className="mr-1.5" />WA</a>}
                    {c.telefono && <a href={smsLinkMsg(c.telefono,c.nombre)} className="text-[#5b21b6] text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-[#e5def4] shrink-0">SMS</a>}
                    {c.telefono && <a href={telLink(c.telefono)} className="text-[11px] px-2 py-1.5 rounded-lg border border-[#e5def4] shrink-0"><Ico e="📞" /></a>}
                  </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MANTENIMIENTOS Y CARTUCHOS PRÓXIMOS / VENCIDOS */}
      {cartuchos.length>0 && (
        <div className="rounded-2xl bg-white border-2 border-teal-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-teal-50 flex items-center justify-between">
            <div className="text-sm font-black text-teal-700"><Ico e="🔔" className="mr-1.5" />Mantenimientos y cartuchos</div>
            <span className="text-xs font-black text-white bg-teal-500 px-2 py-0.5 rounded-full">{cartuchos.length}</span>
          </div>
          <div className="divide-y divide-[#f4f6f9] max-h-64 overflow-y-auto">
            {cartuchos.slice(0,12).map((x,i)=>{
              const tel=(x.telefono||"").replace(/\D/g,"");
              return (
                <div key={`cart-${i}`} className="px-4 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#1f2d3d] truncate">{x.nombre}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {x.producto||"Filtro"} · {x.vencido
                        ? <span className="text-red-500 font-bold"><Ico e="⚠" className="mr-1.5" />Vencido {Math.abs(x.diasFaltan)} d</span>
                        : <span className="text-teal-600 font-bold">en {x.diasFaltan} d</span>} · 🗓️ {x.proxFecha.toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}
                    </div>
                  </div>
                  {tel && <a href={`tel:${tel}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-white text-sm shrink-0" style={{background:RP.blue}}><Ico e="📞" /></a>}
                  {tel && <a href={`https://wa.me/${tel}?text=${encodeURIComponent(`¡Hola ${(x.nombre||"").split(" ")[0]}! 👋 Le saluda su equipo de Royal Prestige. Le corresponde el ${x.vencido?"cambio (ya vencido)":"próximo cambio"} de: ${x.producto||"su filtro"} 💧 ¿Le agendamos su visita de mantenimiento?`)}`} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg text-white text-sm shrink-0" style={{background:"#25D366"}}>💬</a>}
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 text-[10px] text-slate-400 bg-[#f4f6f9]">Se cuenta desde la fecha de venta y se repite en cada ciclo de cambio.</div>
        </div>
      )}

      {/* RESPALDO MENSUAL (solo distribuidor/admin) */}
      <RespaldoBox allData={allData} appts={appts} callLog={callLog} respaldos={respaldos} registrarRespaldo={registrarRespaldo} rolActivo={rolActivo} />

      {/* COFRE IMPACT SEMANAL (por agente) */}
      <CofreSemanal cofreConfig={cofreConfig} cofreAperturas={cofreAperturas} agente={agente} allData={allData} onAbrir={abrirCofre} />

      {/* INCENTIVOS ACTIVOS DEL AGENTE */}
      {misIncentivos.length>0 && misIncentivos.map(inc=>(
        inc.tipo==="racha"
          ? <RachaProgreso key={inc.id} inc={inc} allData={allData} />
          : <IncentivoProgreso key={inc.id} inc={inc} allData={allData} />
      ))}

      {/* SEGUIMIENTOS VENCIDOS — lo más urgente */}
      {seguimientos.length>0 && (
        <div className="rounded-2xl bg-white border-2 border-orange-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-orange-50 flex items-center justify-between">
            <div className="text-sm font-black text-orange-700"><Ico e="⏰" className="mr-1.5" />Seguimientos pendientes</div>
            <span className="text-xs font-black text-white bg-orange-500 px-2 py-0.5 rounded-full">{seguimientos.length}</span>
          </div>
          <div className="divide-y divide-[#f4f6f9] max-h-64 overflow-y-auto">
            {seguimientos.slice(0,8).map(c=>{
              const vencido = c.proximo_seguimiento < todayStr;
              return (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#1f2d3d] truncate">{c.nombre}</div>
                    <div className="text-xs text-slate-400">{vencido?<><Ico e="🔴" className="mr-1" />Vencido</>:<><Ico e="🟠" className="mr-1" />Hoy</>} · {c.proximo_seguimiento}{c.asignado_a?` · ${c.asignado_a}`:""}</div>
                  </div>
                  {c.telefono && <a href={telLink(c.telefono)} className="text-white text-xs font-bold px-3 py-1.5 rounded-md shrink-0" style={{background:RP.blue}}><Ico e="📞" /></a>}
                  {c.telefono && <a href={waLink(c.telefono)} target="_blank" rel="noreferrer" className="text-white text-xs font-bold px-3 py-1.5 rounded-md shrink-0" style={{background:"#25D366"}}><Ico e="💬" /></a>}
                  {c.telefono && <a href={smsLink(c.telefono)} className="text-white text-xs font-bold px-3 py-1.5 rounded-md shrink-0" style={{background:"#7c3aed"}}><Ico e="✉" /></a>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CITAS DE HOY */}
      <div className="rounded-2xl bg-white border border-[#e8edf3] overflow-hidden shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between" style={{background:RP.navy}}>
          <div className="text-sm font-black text-white"><Ico e="📅" className="mr-1.5" />Tus citas de hoy</div>
          <span className="text-xs font-black text-[#5b21b6] bg-white px-2 py-0.5 rounded-full">{citasHoy.length}</span>
        </div>
        {citasHoy.length===0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">No hay citas agendadas para hoy</div>
        ) : (
          <div className="divide-y divide-[#f4f6f9]">
            {citasHoy.map(a=>(
              <CitaCard key={a.id} a={a}
                onUpdate={u=>setAppts(p=>p.map(x=>x.id===u.id?u:x))}
                onDelete={id=>setAppts(p=>p.filter(x=>x.id!==id))} />
            ))}
          </div>
        )}
      </div>

      {/* ACCESOS RÁPIDOS */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={()=>goTo("llamadas")} className="rounded-2xl bg-white border border-[#e8edf3] p-4 text-left shadow-sm hover:border-[#7c3aed] transition">
          <div className="text-2xl mb-1"><Ico e="📞" /></div>
          <div className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{pendientes.length}</div>
          <div className="text-xs font-bold text-slate-400">Por llamar</div>
        </button>
        <button onClick={()=>goTo("agenda")} className="rounded-2xl bg-white border border-[#e8edf3] p-4 text-left shadow-sm hover:border-[#7c3aed] transition">
          <div className="text-2xl mb-1"><Ico e="📅" /></div>
          <div className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>+</div>
          <div className="text-xs font-bold text-slate-400">Agendar cita</div>
        </button>
      </div>

      {/* MIS CLIENTES ASIGNADOS */}
      {misClientes.length>0 && (
        <div className="rounded-2xl bg-white border border-[#e8edf3] p-4 shadow-sm">
          <div className="text-sm font-black text-[#1f2d3d] mb-1"><Ico e="👤" className="mr-1.5" />Mis clientes asignados</div>
          <div className="text-3xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{misClientes.length}</div>
          <div className="text-xs text-slate-400 mt-1">Asignados a {agente}</div>
        </div>
      )}
    </div>
  );
}

function Stats({ data, callLog, appts }) {
  const [vista,setVista]=useState("mes");  // "mes" | "historico"
  const flat=[...data.agregados,...data.prospectos,...data.distribucion,...data.referidos];

  // ── Mes seleccionado (default: mes actual) ──
  const now=new Date();
  const [mesSel,setMesSel]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);

  // Lista de meses disponibles (de los datos creados + historial + hoy)
  const mesesSet=new Set([mesSel]);
  flat.forEach(c=>{ if(c.creado) mesesSet.add(c.creado.slice(0,7)); (c.historial||[]).forEach(h=>{ if(h.fecha) mesesSet.add(h.fecha.slice(0,7)); }); });
  (appts||[]).forEach(a=>{ if(a.fecha) mesesSet.add(a.fecha.slice(0,7)); });
  const meses=[...mesesSet].sort().reverse();
  const mesLabel=(m)=>{ const [y,mo]=m.split("-"); return new Date(+y,+mo-1,1).toLocaleDateString("es-MX",{month:"long",year:"numeric"}); };

  // ── Métricas del mes seleccionado ──
  const enMes=(fecha)=>fecha&&fecha.slice(0,7)===mesSel;
  // Datos creados en el mes
  const datosMes=flat.filter(c=>enMes(c.creado));
  // Citas del mes (de appts agendadas en el mes)
  const citasMes=(appts||[]).filter(a=>enMes(a.fecha));
  // Ventas del mes (resultado venta registrado en historial del mes, o cita con resultado venta en el mes)
  const flatHist=[...flat, ...(data.referidos||[]).flatMap(r=>r.referidos||[])];
  // Conteo unificado (igual que el panel y la pestaña Llamadas)
  const conteoLlam=conteoLlamadas(data, callLog);
  const llamadasMes=Object.entries(conteoLlam).filter(([k])=>k.slice(0,7)===mesSel).reduce((a,[,v])=>a+sumDia(v),0);
  const _vdMes = contarVentasDemos({ appts, clientes:flatHist, enP:enMes });
  const ventasMes = _vdMes.ventas;
  const demosMes = _vdMes.demos;

  const totalDatosMes=datosMes.length;
  const totalCitasMes=citasMes.length;
  const tasaCitaMes=totalDatosMes>0?Math.round((totalCitasMes/totalDatosMes)*100):0;
  const tasaCierreMes=totalCitasMes>0?Math.round((ventasMes/totalCitasMes)*100):0;
  const tasaCierreDemo=demosMes>0?Math.round((ventasMes/demosMes)*100):0; // % de cierre = ventas / demostraciones
  const tasaCitaDemo=totalCitasMes>0?Math.round((demosMes/totalCitasMes)*100):0; // % de citas que llegaron a demostración
  const llamPorVentaMes=ventasMes>0?(llamadasMes/ventasMes).toFixed(1):"—";

  // (llamadasMes ya sale del conteo unificado — ver arriba)
  const llamadasCallLogMes=llamadasMes;

  // ── Grupos del mes ──
  const groups=[
    {key:"agregados",ico:"📂", label:"Agregados",arr:data.agregados},
    {key:"referidos",ico:"🎁", label:"Referidos",arr:data.referidos},
    {key:"prospectos",ico:"🔍", label:"Prospección",arr:data.prospectos},
    {key:"distribucion",ico:"🏠", label:"Distribución",arr:data.distribucion},
  ];

  // ── HISTÓRICO: métricas por cada mes ──
  const historico=meses.map(m=>{
    const inM=(f)=>f&&f.slice(0,7)===m;
    const d=flat.filter(c=>inM(c.creado)).length;
    const ct=(appts||[]).filter(a=>inM(a.fecha)).length;
    const v=contarVentasDemos({ appts, clientes:flatHist, enP:inM }).ventas;
    const ll=Object.entries(conteoLlam).filter(([k])=>k.slice(0,7)===m).reduce((a,[,x])=>a+sumDia(x),0);
    return {mes:m, datos:d, citas:ct, ventas:v, llamadas:ll};
  });

  // Contador de llamadas últimos 7 días (siempre visible)
  const days=[];for(let i=6;i>=0;i--){const dd=new Date();dd.setDate(dd.getDate()-i);const k=fmtDiaLocal(dd);days.push({k,n:sumDia(conteoLlam[k]),label:dd.toLocaleDateString("es-MX",{weekday:"short"})});}
  const todayKey=hoyLocal();const callsToday=sumDia(conteoLlam[todayKey]);const maxCalls=Math.max(...days.map(d=>d.n),1);

  return (
    <div className="space-y-5">
      {/* Pestañas Mes / Histórico */}
      <div className="flex gap-1.5">
        <button onClick={()=>setVista("mes")}
          className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition ${vista==="mes"?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
          style={vista==="mes"?{background:RP.navy}:{}}><Ico e="📅" className="mr-1.5" />Por mes</button>
        <button onClick={()=>setVista("historico")}
          className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition ${vista==="historico"?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
          style={vista==="historico"?{background:RP.navy}:{}}><Ico e="📈" className="mr-1.5" />Histórico mensual</button>
      </div>

      {vista==="mes" ? (
        <>
          {/* Selector de mes */}
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-[#e8edf3]">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mes a mostrar</div>
            <select className="w-full border-2 border-[#e5def4] rounded-lg px-3 py-2 text-sm bg-white font-bold capitalize" value={mesSel} onChange={e=>setMesSel(e.target.value)}>
              {meses.map(m=><option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          </div>

          {/* Resumen del mes */}
          <div className="grid grid-cols-3 gap-3">
            {[{l:"Datos",v:totalDatosMes,ic:"👥"},{l:"Citas",v:totalCitasMes,ic:"📅"},{l:"Ventas",v:ventasMes,ic:"💰"}].map(s=>(
              <div key={s.l} className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#e8edf3]"><div className="text-2xl mb-1">{s.ic}</div><div className="text-3xl font-bold text-[#5b21b6]" style={{fontFamily:SERIF}}>{s.v}</div><div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{s.l}</div></div>
            ))}
          </div>

          {/* Embudo del mes */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
            <div className="text-sm font-bold text-[#1f2d3d] mb-1 capitalize"><Ico e="🎯" className="mr-1.5" />Embudo de conversión — {mesLabel(mesSel)}</div>
            <div className="text-[11px] text-slate-400 mb-3">Cada barra muestra el % que avanzó desde la etapa anterior</div>
            <div className="space-y-2">
              {[
                {label:"Datos del mes",   val:totalDatosMes, pct:100, color:"#5b21b6"},
                {label:"Citas agendadas", val:totalCitasMes, pct:totalDatosMes>0?(totalCitasMes/totalDatosMes)*100:0, color:"#16a34a"},
                {label:"Demostraciones",  val:demosMes,      pct:totalCitasMes>0?(demosMes/totalCitasMes)*100:0,     color:"#0d9488"},
                {label:"Ventas cerradas", val:ventasMes,     pct:demosMes>0?(ventasMes/demosMes)*100:0,               color:"#047857"},
              ].map(f=>(
                <div key={f.label}>
                  <div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-600">{f.label}</span><span style={{color:f.color}}>{f.val}</span></div>
                  <div className="h-7 rounded-lg bg-[#f4f6f9] overflow-hidden">
                    <div className="h-full rounded-lg flex items-center px-2 text-white text-xs font-black transition-all" style={{width:`${Math.max(f.pct,8)}%`,background:f.color}}>{Math.round(f.pct)}%</div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#f4f6f9]">
                <div className="text-center"><div className="text-xl font-black text-teal-700">{tasaCitaDemo}%</div><div className="text-[9px] font-bold text-slate-400 uppercase">Cita → Demo</div></div>
                <div className="text-center"><div className="text-xl font-black text-emerald-700">{tasaCierreDemo}%</div><div className="text-[9px] font-bold text-slate-400 uppercase">Demo → Venta</div></div>
              </div>
            </div>
          </div>

          {/* Contador de llamadas 7 días */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
            <div className="flex items-center justify-between mb-3"><div className="text-sm font-bold text-[#1f2d3d]"><Ico e="📞" className="mr-1.5" />Llamadas — últimos 7 días</div><div className="text-white text-xs font-bold px-3 py-1 rounded-full" style={{background:RP.navy}}>HOY: {callsToday}</div></div>
            <div className="flex items-end gap-2 h-28">{days.map(d=>(<div key={d.k} className="flex-1 flex flex-col items-center gap-1"><div className="text-xs font-bold text-slate-500">{d.n}</div><div className="w-full rounded-t-md transition-all" style={{height:`${(d.n/maxCalls)*80}px`,minHeight:"4px",background:RP.blue,opacity:d.k===todayKey?1:0.45}} /><div className="text-[10px] font-bold text-slate-400 capitalize">{d.label}</div></div>))}</div>
          </div>

          {/* Estadísticas por grupo (del mes) */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
            <div className="text-sm font-bold text-[#1f2d3d] mb-3 capitalize"><Ico e="📊" className="mr-1.5" />Por grupo — {mesLabel(mesSel)}</div>
            <div className="text-[11px] text-slate-400 mb-2 -mt-1">% de cierre = ventas ÷ demostraciones · para ver la calidad del dato de cada base</div>
            <div className="space-y-3">{groups.map(g=>{
              const esRef = g.key==="referidos";
              const cards = g.arr||[];
              const clientesG = esRef ? [...cards, ...cards.flatMap(a=>a.referidos||[])] : cards;
              const datos = esRef
                ? cards.reduce((n,anf)=> n + (anf.eliminado?0:(anf.referidos||[]).filter(r=>enMes(r.creado||anf.creado)).length), 0)
                : cards.filter(c=>!c.eliminado && enMes(c.creado)).length;
              const vd = contarVentasDemos({ clientes:clientesG, enP:enMes });
              return (
              <div key={g.key} className="border border-[#e8edf3] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold text-slate-700">{g.label}</div>
                  <div className="text-[11px] font-black text-white px-2 py-0.5 rounded-full" style={{background: vd.demos===0?"#cbd5e1":vd.cierre>=50?"#16a34a":vd.cierre>=25?"#f59e0b":"#94a3b8"}}>{vd.demos===0?"sin demos":`${vd.cierre}% cierre`}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">{[{l:"Datos",v:datos,c:"text-[#5b21b6]"},{l:"Demos",v:vd.demos,c:"text-teal-700"},{l:"Ventas",v:vd.ventas,c:"text-emerald-700"}].map(x=>(<div key={x.l} className="bg-[#f4f6f9] rounded-lg py-2 text-center"><div className={`text-xl font-bold ${x.c}`}>{x.v}</div><div className="text-[10px] font-bold text-slate-400 uppercase">{x.l}</div></div>))}</div>
              </div>);})}</div>
          </div>

          {/* Rendimiento agente de llamadas (del mes) */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
            <div className="text-sm font-bold text-[#1f2d3d] mb-3"><Ico e="📞" className="mr-1.5" />Agente de llamadas — {mesLabel(mesSel)}</div>
            {(()=>{
              const ag="Agente de llamadas";
              let llamadas=0, ventas=0;
              flat.forEach(c=>(c.historial||[]).forEach(h=>{ if(h.agente===ag&&enMes(h.fecha)){ if(h.tipo==="llamada")llamadas++; if(h.cita_resultado==="demo_venta"||h.cita_resultado==="venta")ventas++; } }));
              const citas=citasMes.filter(a=>a.asignado_a===ag||true).length>=0?citasMes.length:0;
              const tasa=llamadas>0?Math.round((totalCitasMes/llamadas)*100):0;
              return (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#f4f6f9] rounded-xl py-3 text-center"><div className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{llamadas}</div><div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5"><Ico e="📞" className="mr-1.5" />Llamadas</div></div>
                    <div className="bg-[#f4f6f9] rounded-xl py-3 text-center"><div className="text-2xl font-black text-green-700" style={{fontFamily:SERIF}}>{totalCitasMes}</div><div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5"><Ico e="📅" className="mr-1.5" />Citas</div></div>
                    <div className="bg-[#f4f6f9] rounded-xl py-3 text-center"><div className="text-2xl font-black text-emerald-700" style={{fontFamily:SERIF}}>{ventas}</div><div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5"><Ico e="💰" className="mr-1.5" />Ventas</div></div>
                  </div>
                  <div className="rounded-xl p-3 text-white flex items-center justify-between" style={{background:`linear-gradient(135deg, ${RP.navy}, ${RP.blue})`}}>
                    <span className="text-xs font-bold opacity-90">Efectividad: llamadas que generan cita</span>
                    <span className="text-2xl font-black" style={{fontFamily:SERIF}}>{tasa}%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        /* ── VISTA HISTÓRICO ── */
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
            <div className="text-sm font-bold text-[#1f2d3d] mb-1"><Ico e="📈" className="mr-1.5" />Histórico mensual</div>
            <div className="text-xs text-slate-400 mb-4">Resumen de todas tus estadísticas mes a mes</div>
            {historico.length===0 ? (
              <div className="text-center text-sm text-slate-400 py-6">Aún no hay datos históricos</div>
            ) : (
              <div className="space-y-3">
                {historico.map(h=>{
                  const tasaCierre=h.citas>0?Math.round((h.ventas/h.citas)*100):0;
                  return (
                    <div key={h.mes} className="border-2 border-[#e8edf3] rounded-xl overflow-hidden">
                      <div className="px-3 py-2 text-white font-bold text-sm capitalize" style={{background:RP.navy}}>{mesLabel(h.mes)}</div>
                      <div className="grid grid-cols-4 divide-x divide-[#f4f6f9]">
                        <div className="py-3 text-center"><div className="text-xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{h.datos}</div><div className="text-[9px] font-bold text-slate-400 uppercase">Datos</div></div>
                        <div className="py-3 text-center"><div className="text-xl font-black text-orange-600" style={{fontFamily:SERIF}}>{h.llamadas}</div><div className="text-[9px] font-bold text-slate-400 uppercase">Llam.</div></div>
                        <div className="py-3 text-center"><div className="text-xl font-black text-green-700" style={{fontFamily:SERIF}}>{h.citas}</div><div className="text-[9px] font-bold text-slate-400 uppercase">Citas</div></div>
                        <div className="py-3 text-center"><div className="text-xl font-black text-emerald-700" style={{fontFamily:SERIF}}>{h.ventas}</div><div className="text-[9px] font-bold text-slate-400 uppercase">Ventas</div></div>
                      </div>
                      <div className="px-3 py-1.5 bg-[#f4f6f9] text-center text-[10px] font-bold text-slate-500">Cierre: {tasaCierre}% · {h.ventas} venta(s) de {h.citas} cita(s)</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Comparativa de ventas por mes (barras) */}
          {historico.length>1 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
              <div className="text-sm font-bold text-[#1f2d3d] mb-3"><Ico e="💰" className="mr-1.5" />Ventas por mes</div>
              <div className="flex items-end gap-2 h-32">
                {[...historico].reverse().map(h=>{
                  const maxV=Math.max(...historico.map(x=>x.ventas),1);
                  return (
                    <div key={h.mes} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs font-bold text-emerald-700">{h.ventas}</div>
                      <div className="w-full rounded-t-md transition-all" style={{height:`${(h.ventas/maxV)*90}px`,minHeight:"4px",background:"#047857"}} />
                      <div className="text-[9px] font-bold text-slate-400 capitalize">{h.mes.split("-")[1]}/{h.mes.split("-")[0].slice(2)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── AGENDA ───────────────────────────────────────────────────
const TIPO_BORDER = { cita:"border-l-[#7c3aed]", llamada:"border-l-orange-400", cocinada:"border-l-purple-500", servicio:"border-l-red-500", personal:"border-l-green-500", entrevista:"border-l-teal-500" };
const TIPO_ICON   = { cita:"📋", llamada:"📞", cocinada:"🍳", servicio:"🔧", personal:"🟢", entrevista:"🤝" };
const TIPO_COLOR = { cita:"#5b21b6", llamada:"#ea580c", cocinada:"#7c3aed", servicio:"#dc2626", personal:"#16a34a", entrevista:"#0d9488" };
const MESES_CAL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CAL  = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

// ─── CALENDARIO ESTILO GOOGLE CALENDAR (día / semana / mes / año) ───
function CalendarioAgenda({ appts, onUpdate, onDelete }) {
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const hoyISO = isoLocal(new Date());
  const [modo,setModo] = useState("mes");            // dia | semana | mes | año
  const [ref,setRef]   = useState(()=>new Date());   // fecha de referencia del periodo
  const [selDia,setSelDia] = useState(hoyISO);       // día seleccionado (vista mes/día)

  // Agrupar citas por día (clave YYYY-MM-DD) y ordenar por hora
  const porDia = useMemo(()=>{
    const m={};
    (appts||[]).forEach(a=>{ const k=(a.fecha||"").slice(0,10); if(k.length===10){ (m[k]=m[k]||[]).push(a); } });
    Object.values(m).forEach(l=>l.sort((x,y)=>(x.fecha||"").localeCompare(y.fecha||"")));
    return m;
  },[appts]);

  const mover = dir => {
    if(modo==="dia"){ const d=new Date(selDia+"T12:00"); d.setDate(d.getDate()+dir); setSelDia(isoLocal(d)); setRef(d); return; }
    const d=new Date(ref);
    if(modo==="semana") d.setDate(d.getDate()+7*dir);
    else if(modo==="mes") d.setMonth(d.getMonth()+dir);
    else d.setFullYear(d.getFullYear()+dir);
    setRef(d);
  };
  const irHoy = ()=>{ const d=new Date(); setRef(d); setSelDia(isoLocal(d)); };

  // Cuadrícula del mes (empieza lunes)
  const celdasMes = base => {
    const y=base.getFullYear(), m=base.getMonth();
    const offset=(new Date(y,m,1).getDay()+6)%7;
    const nDias=new Date(y,m+1,0).getDate();
    const celdas=[];
    for(let i=0;i<offset;i++) celdas.push(null);
    for(let d=1;d<=nDias;d++) celdas.push(new Date(y,m,d));
    while(celdas.length%7!==0) celdas.push(null);
    return celdas;
  };
  const semanaDias = () => { const lun=lunesDeLaSemana(ref); return Array.from({length:7},(_,i)=>{const d=new Date(lun);d.setDate(d.getDate()+i);return d;}); };

  const etiqueta = modo==="dia"
    ? new Date(selDia+"T12:00").toLocaleDateString("es",{weekday:"long",day:"numeric",month:"long",year:"numeric"})
    : modo==="semana"
    ? (()=>{const ds=semanaDias();return `${ds[0].getDate()} ${MESES_CAL[ds[0].getMonth()].slice(0,3)} – ${ds[6].getDate()} ${MESES_CAL[ds[6].getMonth()].slice(0,3)} ${ds[6].getFullYear()}`;})()
    : modo==="mes"
    ? `${MESES_CAL[ref.getMonth()]} ${ref.getFullYear()}`
    : String(ref.getFullYear());

  const cardsDe = (arr, mostrarFecha=false) => arr.map(a=>{
    const esPasada=a.fecha && a.fecha<new Date().toISOString() && !(a.fecha||"").startsWith(hoyISO);
    return (
      <div key={a.id} className={`bg-white border-2 border-[#e8edf3] border-l-4 rounded-2xl shadow-sm ${TIPO_BORDER[a._type||a.tipo]||"border-l-slate-300"}`}>
        <CitaCard a={a} mostrarFecha={mostrarFecha} esPasada={esPasada} onUpdate={onUpdate} onDelete={onDelete} />
      </div>
    );
  });

  const Dot = ({t}) => <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:TIPO_COLOR[t]||"#94a3b8"}} />;

  return (
    <div>
      {/* Selector día / semana / mes / año */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[["dia","Día"],["semana","Semana"],["mes","Mes"],["año","Año"]].map(([v,l])=>(
          <button key={v} onClick={()=>setModo(v)}
            className={`py-2 rounded-lg text-xs font-bold transition ${modo===v?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
            style={modo===v?{background:RP.navy}:{}}>{l}</button>
        ))}
      </div>

      {/* Navegación ‹ Hoy › */}
      <div className="flex items-center justify-between gap-2 mb-3 bg-white rounded-xl border border-[#e8edf3] px-2 py-2 shadow-sm">
        <button onClick={()=>mover(-1)} className="w-9 h-9 flex-shrink-0 rounded-lg text-lg font-bold text-slate-600 bg-[#f4f6f9] hover:brightness-95">‹</button>
        <div className="text-sm font-black text-center capitalize flex-1 min-w-0" style={{color:RP.navy}}>{etiqueta}</div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={irHoy} className="px-3 h-9 rounded-lg text-xs font-bold text-white hover:brightness-110" style={{background:RP.blue}}>Hoy</button>
          <button onClick={()=>mover(1)} className="w-9 h-9 rounded-lg text-lg font-bold text-slate-600 bg-[#f4f6f9] hover:brightness-95">›</button>
        </div>
      </div>

      {/* VISTA AÑO */}
      {modo==="año" && (
        <div className="grid grid-cols-3 gap-2">
          {MESES_CAL.map((nm,i)=>{
            const pref=`${ref.getFullYear()}-${String(i+1).padStart(2,"0")}`;
            const n=Object.keys(porDia).filter(k=>k.startsWith(pref)).reduce((sum,k)=>sum+porDia[k].length,0);
            const esMesActual=pref===hoyISO.slice(0,7);
            return (
              <button key={nm} onClick={()=>{setRef(new Date(ref.getFullYear(),i,1));setModo("mes");}}
                className={`p-3 rounded-xl border text-center transition bg-white shadow-sm hover:brightness-95 ${esMesActual?"border-[#7c3aed] ring-1 ring-[#a78bfa]":"border-[#e8edf3]"}`}>
                <div className="text-xs font-black" style={{color:RP.navy}}>{nm.slice(0,3)}</div>
                <div className={`text-[10px] mt-1 font-bold ${n?"text-[#7c3aed]":"text-slate-300"}`}>{n?`${n} cita${n>1?"s":""}`:"—"}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* VISTA MES */}
      {modo==="mes" && (()=>{
        const celdas=celdasMes(ref);
        const citasSel=porDia[selDia]||[];
        return (
          <div>
            <div className="bg-white rounded-2xl border border-[#e8edf3] shadow-sm p-2">
              <div className="grid grid-cols-7 mb-1">
                {DIAS_CAL.map(d=><div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {celdas.map((d,i)=>{
                  if(!d) return <div key={"v"+i} />;
                  const iso=isoLocal(d);
                  const citas=porDia[iso]||[];
                  const esHoy=iso===hoyISO, esSel=iso===selDia;
                  return (
                    <button key={iso} onClick={()=>setSelDia(iso)}
                      className={`relative rounded-lg pt-1 pb-1.5 min-h-[46px] flex flex-col items-center transition border ${esSel?"border-[#7c3aed]":"border-transparent"} ${esHoy&&!esSel?"bg-[#ede9fe]":""}`}
                      style={esSel?{background:RP.navy}:{}}>
                      <span className={`text-xs font-bold ${esSel?"text-white":esHoy?"text-[#5b21b6]":"text-slate-700"}`}>{d.getDate()}</span>
                      <span className="flex gap-0.5 mt-1 flex-wrap justify-center px-0.5">
                        {citas.slice(0,3).map((a,j)=><Dot key={j} t={a._type||a.tipo} />)}
                        {citas.length>3 && <span className={`text-[8px] font-bold leading-none ${esSel?"text-white":"text-slate-400"}`}>+{citas.length-3}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap mt-2 px-1">
              {TYPE_OPTIONS.map(o=>(
                <span key={o.v} className="flex items-center gap-1 text-[9px] font-bold text-slate-500"><Dot t={o.v}/>{o.l.replace(/^\S+\s/,"")}</span>
              ))}
            </div>
            <div className="mt-3">
              <div className="text-xs font-black mb-2 capitalize" style={{color:RP.navy}}>
                📌 {new Date(selDia+"T12:00").toLocaleDateString("es",{weekday:"long",day:"numeric",month:"long"})} · {citasSel.length} cita{citasSel.length!==1?"s":""}
              </div>
              {citasSel.length===0
                ? <div className="bg-white rounded-2xl p-6 text-center text-sm text-slate-400 shadow-sm border border-[#e8edf3]">Sin citas este día</div>
                : <div className="space-y-2">{cardsDe(citasSel)}</div>}
            </div>
          </div>
        );
      })()}

      {/* VISTA SEMANA */}
      {modo==="semana" && (
        <div className="space-y-3">
          {semanaDias().map(d=>{
            const iso=isoLocal(d);
            const citas=porDia[iso]||[];
            const esHoy=iso===hoyISO;
            return (
              <div key={iso}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className={`text-xs font-black capitalize ${esHoy?"text-white px-2 py-0.5 rounded-full":"text-slate-600"}`} style={esHoy?{background:RP.blue}:{}}>
                    {DIAS_CAL[(d.getDay()+6)%7]} {d.getDate()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">{citas.length?`${citas.length} cita${citas.length>1?"s":""}`:"libre"}</span>
                </div>
                {citas.length>0 && <div className="space-y-2">{cardsDe(citas)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA DÍA */}
      {modo==="dia" && (()=>{
        const citas=porDia[selDia]||[];
        return citas.length===0
          ? <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-400 shadow-sm border border-[#e8edf3]">Sin citas este día</div>
          : <div className="space-y-2">{cardsDe(citas)}</div>;
      })()}
    </div>
  );
}

function Agenda({ appts, setAppts, agente, onVentaSync }) {
  const [showForm,setShowForm]=useState(false);const [menuOpen,setMenuOpen]=useState(false);
  const [preType,setPreType]=useState(null);const [calLoading,setCalLoading]=useState(false);const [calMsg,setCalMsg]=useState("");
  const handleSchedule=appt=>{
    setCalMsg("");
    window.open(gcalLink(appt),"_blank");
    setAppts(p=>[{...appt,id:Date.now(),_type:appt.tipo},...p]);
    const cfg=TYPE_OPTIONS.find(t=>t.v===appt.tipo)||TYPE_OPTIONS[0];
    setCalMsg(`✅ ${cfg.l} — "${appt.nombre}" guardada aquí. Se abrió Google Calendar con todo listo: solo toca GUARDAR allá.`);
    setShowForm(false);setPreType(null);
  };
  const openWith=(tipo)=>{setPreType(tipo);setMenuOpen(false);setShowForm(true);};
  const [vista,setVista]=useState("lista"); // lista | calendario
  const [filtro,setFiltro]=useState("hoy");   // hoy | proximas | todas
  const [filtroTipo,setFiltroTipo]=useState("todos");
  const [filtroResultado,setFiltroResultado]=useState("todos");
  const [mostrarFiltros,setMostrarFiltros]=useState(false);
  const [busca,setBusca]=useState("");
  const todayStr=hoyLocal();
  const ahora=new Date().toISOString();

  // Ordenar todas las citas por fecha
  const ordenadas=[...appts].filter(Boolean).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  // Filtrar por TIPO de cita (base — se comparte entre lista y calendario)
  let base=ordenadas;
  if(filtroTipo!=="todos"){
    base=base.filter(a=>{
      const t=a.tipo||a._type;
      if(filtroTipo==="llamada") return t==="llamada"||t==="recordatorio"; // "Recordatorio"
      return t===filtroTipo;
    });
  }
  // Filtrar por RESULTADO de la cita
  if(filtroResultado!=="todos"){
    const PROD_KEYS={venta_ducha:["ducha"],venta_cart35:["3.500","3500"],venta_cart55:["5.500","5500"],venta_prefw:["frescaflow","fw"]};
    base=base.filter(a=>{
      if(filtroResultado==="demo_venta")    return a.resultado==="demo_venta"||a.resultado==="venta";
      if(filtroResultado==="demo_no_venta") return a.resultado==="demo_no_venta"||a.resultado==="no_venta";
      if(PROD_KEYS[filtroResultado]){
        const esVenta=a.resultado==="demo_venta"||a.resultado==="venta";
        const lbl=String(a.producto||a.venta_producto||"").toLowerCase();
        return esVenta && PROD_KEYS[filtroResultado].some(k=>lbl.includes(k));
      }
      return a.resultado===filtroResultado;
    });
  }
  // Filtrar por búsqueda (nombre, teléfono o ciudad — sin acentos)
  if(busca.trim()){
    const q=normTexto(busca);
    const qNum=soloNum(busca);
    base=base.filter(a=>normTexto(a.nombre).includes(q)||normTexto(a.ciudad).includes(q)||(qNum&&soloNum(a.telefono).includes(qNum)));
  }
  // Filtrar por categoría (solo para la vista de lista)
  let lista=base;
  if(filtro==="hoy")      lista=base.filter(a=>a.fecha?.startsWith(todayStr));
  else if(filtro==="proximas") lista=base.filter(a=>a.fecha&&a.fecha>ahora&&!a.fecha.startsWith(todayStr));
  // "todas" deja todo

  // Contadores
  const nHoy=ordenadas.filter(a=>a.fecha?.startsWith(todayStr)).length;
  const nProximas=ordenadas.filter(a=>a.fecha&&a.fecha>ahora&&!a.fecha.startsWith(todayStr)).length;
  const sinResultado=ordenadas.filter(a=>{const t=a.tipo||a._type; return t==="cita" && a.fecha && a.fecha<ahora && !a.fecha.startsWith(todayStr) && !a.resultado;}).length;

  const FILTROS=[
    {id:"hoy",      label:"Hoy",      count:nHoy},
    {id:"proximas", label:"Próximas", count:nProximas},
    {id:"todas",    label:"Todas",    count:ordenadas.length},
  ];

  const TIPO_FILTROS=[
    {v:"todos",      label:"Todos"},
    {v:"cita",       ico:"📋", label:"Cita"},
    {v:"llamada",    ico:"🔔", label:"Recordatorio"},
    {v:"cocinada",   ico:"🍳", label:"Cocinada"},
    {v:"servicio",   ico:"🔧", label:"Servicio"},
    {v:"personal",   ico:"🟢", label:"Personal"},
    {v:"entrevista", ico:"🤝", label:"Entrevista"},
  ];
  const RES_FILTROS=[
    {v:"todos",         label:"Todos"},
    {v:"demo_venta",    ico:"💰", label:"Demo venta"},
    {v:"demo_no_venta", ico:"📋", label:"Demo no venta"},
    {v:"no_recibio",    ico:"🚫", label:"No recibió"},
    {v:"no_visito",     ico:"🏠", label:"No se visitó"},
    {v:"seguimiento",   ico:"📅", label:"Seguimiento"},
    {v:"recompra",      ico:"✖", label:"Recompra"},
    {v:"venta_ducha",   ico:"🚿", label:"Ducha (6 meses)"},
    {v:"venta_cart35",  ico:"💧", label:"Frescapure 3.500 (12 meses)"},
    {v:"venta_cart55",  ico:"💧", label:"Frescapure 5.500 (24 meses)"},
    {v:"venta_prefw",   ico:"💧", label:"Frescaflow (6 meses)"},
  ];
  const filtrosActivos=(filtroTipo!=="todos"?1:0)+(filtroResultado!=="todos"?1:0);

  return (
    <div>
      {calMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-bold flex items-center justify-between"><Msg>{calMsg}</Msg><button onClick={()=>setCalMsg("")} className="ml-2"><Ico e="✕" /></button></div>}

      {/* ── DROPDOWN TRIGGER ── */}
      <div className="relative mb-4">
        <button onClick={()=>setMenuOpen(p=>!p)}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-white font-bold text-sm hover:brightness-110 transition shadow-sm"
          style={{background:RP.navy}}>
          <span><Ico e="📅" className="mr-1.5" />Nueva cita / recordatorio</span>
          <span className={`text-lg transition-transform duration-200 ${menuOpen?"rotate-180":""}`}>▾</span>
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-[#e8edf3] overflow-hidden z-40">
            {TYPE_OPTIONS.map(o=>(
              <button key={o.v} type="button" onClick={()=>openWith(o.v)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-bold transition border-b border-[#f4f6f9] last:border-0 hover:brightness-95"
                style={{background:o.color+"12"}}>
                <span className="text-2xl w-8 text-center">{TIPO_ICON[o.v]}</span>
                <div className="text-left flex-1">
                  <div className="font-black" style={{color:o.color}}>{o.l}</div>
                  <div className="text-xs text-slate-400 font-normal">{o.desc}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.pill}`}>{o.desc.split("·")[0].trim()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Aviso de citas pasadas sin resultado */}
      {sinResultado>0 && (
        <button onClick={()=>{setFiltro("todas");setFiltroTipo("todos");setFiltroResultado("todos");}}
          className="w-full mb-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-800 font-bold flex items-center justify-between hover:bg-amber-100 transition">
          <span><Ico e="⏰" className="mr-1.5" />{sinResultado} cita(s) pasada(s) sin resultado</span>
          <span className="text-xs">Ver →</span>
        </button>
      )}

      {/* Cambiar entre vista de lista y calendario */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {[["lista","📋","Lista"],["calendario","📆","Calendario"]].map(([v,ico,l])=>(
          <button key={v} onClick={()=>setVista(v)}
            className={`py-2.5 rounded-xl text-xs font-bold transition ${vista===v?"text-white shadow-sm":"text-slate-600 bg-[#f4f6f9]"}`}
            style={vista===v?{background:RP.navy}:{}}><span className="inline-flex items-center justify-center gap-1.5"><Ico e={ico} size={13} />{l}</span></button>
        ))}
      </div>

      {/* Buscador */}
      <input className={inpLight+" mb-3"} placeholder="Buscar cita por nombre o teléfono…" name="buscar-cita" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={busca} onChange={e=>setBusca(e.target.value)} />

      {/* Filtros tipo pestañas (solo vista lista) */}
      {vista==="lista" && <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTROS.map(f=>(
          <button key={f.id} onClick={()=>setFiltro(f.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${filtro===f.id?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
            style={filtro===f.id?{background:RP.blue}:{}}>
            {f.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filtro===f.id?"bg-white/25":"bg-white"}`}>{f.count}</span>
          </button>
        ))}
      </div>}

      {/* Filtrar por tipo y resultado (colapsable) */}
      <button onClick={()=>setMostrarFiltros(p=>!p)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold mb-3 transition ${filtrosActivos>0?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
        style={filtrosActivos>0?{background:RP.navy}:{}}>
        <span><Ico e="🔎" className="mr-1.5" />Filtrar por tipo y resultado{filtrosActivos>0?` · ${filtrosActivos} activo${filtrosActivos>1?"s":""}`:""}</span>
        <span className="flex items-center gap-2">
          {filtrosActivos>0 && <span onClick={e=>{e.stopPropagation();setFiltroTipo("todos");setFiltroResultado("todos");}} className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full">Limpiar ✕</span>}
          <span className={`transition-transform duration-200 ${mostrarFiltros?"rotate-180":""}`}>▾</span>
        </span>
      </button>
      {mostrarFiltros && (
        <div className="mb-4 space-y-2 bg-[#f9fafc] rounded-xl p-3 border border-[#eef1f5]">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-0.5">Tipo</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {TIPO_FILTROS.map(t=>(
                <button key={t.v} onClick={()=>setFiltroTipo(t.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${filtroTipo===t.v?"text-white":"text-slate-600 bg-white border border-[#e8edf3]"}`}
                  style={filtroTipo===t.v?{background:RP.blue}:{}}>{t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-0.5">Resultado de la cita</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {RES_FILTROS.map(r=>(
                <button key={r.v} onClick={()=>setFiltroResultado(r.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${filtroResultado===r.v?"text-white":"text-slate-600 bg-white border border-[#e8edf3]"}`}
                  style={filtroResultado===r.v?{background:RP.blue}:{}}>{r.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendario (día / semana / mes / año) */}
      {vista==="calendario" && (
        <CalendarioAgenda appts={base}
          onUpdate={u=>{setAppts(p=>p.map(x=>x.id===u.id?u:x)); if(u.resultado==="demo_venta" && !u._sincronizado && onVentaSync) onVentaSync(u);}}
          onDelete={id=>setAppts(p=>p.filter(x=>x.id!==id))} />
      )}

      {/* Lista de citas */}
      {vista==="lista" && (lista.length===0
        ? <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-400 shadow-sm border border-[#e8edf3]">
            {busca||filtrosActivos>0?"No hay citas que coincidan con los filtros":filtro==="hoy"?"No hay citas para hoy":filtro==="proximas"?"No hay citas próximas":"No hay citas agendadas"}
          </div>
        : <div className="space-y-2">{lista.map(a=>{
            const esPasada=a.fecha&&a.fecha<ahora&&!a.fecha.startsWith(todayStr);
            return (
              <div key={a.id} className={`bg-white border-2 border-[#e8edf3] border-l-4 rounded-2xl shadow-sm ${TIPO_BORDER[a._type]||"border-l-slate-300"} ${esPasada&&!a.resultado?"ring-1 ring-amber-200":""}`}>
                <CitaCard a={a} mostrarFecha={filtro!=="hoy"} esPasada={esPasada}
                  onUpdate={u=>{setAppts(p=>p.map(x=>x.id===u.id?u:x)); if(u.resultado==="demo_venta" && !u._sincronizado && onVentaSync) onVentaSync(u);}}
                  onDelete={id=>setAppts(p=>p.filter(x=>x.id!==id))} />
              </div>
            );
          })}</div>)}

      {showForm && <Modal title={`${TIPO_ICON[preType]||"📅"} ${TYPE_OPTIONS.find(t=>t.v===preType)?.l||"Nueva cita"}`} onClose={()=>{setShowForm(false);setPreType(null);}}>
        <AppointmentForm forceTipo={preType} loading={calLoading} onSave={handleSchedule} onClose={()=>{setShowForm(false);setPreType(null);}} agenteActivo={agente} />
      </Modal>}
    </div>
  );
}

// ─── CALL CONTROL ─────────────────────────────────────────────
// Aplana los referidos individuales como contactos llamables.
// Cada uno lleva _refDe (id anfitrión) y _refIdx (posición) para guardar de vuelta.
function flattenReferidos(referidosArr) {
  const out=[];
  (referidosArr||[]).forEach(anf=>{
    // D) Si el anfitrión NO tiene id válido, NO generamos sus referidos llamables
    // (evita ids rotos tipo "undefined::0" que luego no se pueden abrir).
    const anfId = anf?.id;
    if(anfId===undefined || anfId===null || anfId==="") return;
    (anf.referidos||[]).forEach((r,idx)=>{
      out.push({
        ...r,
        id: `${anfId}::${idx}`,
        _tipo: "referidos",
        _refDe: anfId,
        _refIdx: idx,
        _anfitrion: anf.anfitrion||"",
        _parentesco: r.parentesco||"",
        nombre: r.nombre || "(Referido sin nombre)",
        observaciones: r.observaciones || (anf.anfitrion?`Referido de ${anf.anfitrion}`:""),
      });
    });
  });
  return out;
}

function CallControl({ data, setData, onCallLog, role, agente, notify, setAppts }) {
  const [scheduleClient,setScheduleClient]=useState(null);const [forceTipo,setForceTipo]=useState(null);const [calLoading,setCalLoading]=useState(false);const [calMsg,setCalMsg]=useState("");
  const [filterCity,setFilterCity]=useState("");const [filterCP,setFilterCP]=useState("");const [search,setSearch]=useState("");const [filterBase,setFilterBase]=useState("todas");

  const referidosLlamables = flattenReferidos(data.referidos)
    .filter(c=>(c.nombre&&c.nombre!=="(Referido sin nombre)")||c.telefono)  // solo referidos con datos reales
    .filter(c=>["sin_estado","naranja","amarillo","azul","morado","buzon","verde","numero_equivocado"].includes(c.estado||"sin_estado"));
  const pendientesAll=[
    ...data.prospectos.filter(c=>!c.eliminado && ["sin_estado","naranja","amarillo","azul","morado","buzon","numero_equivocado"].includes(c.estado)).map(c=>({...c,_tipo:"prospectos"})),
    ...data.agregados.filter(c=>!c.eliminado && ["sin_estado","naranja","buzon","verde","numero_equivocado"].includes(c.estado)).map(c=>({...c,_tipo:"agregados"})),
    ...data.distribucion.filter(c=>!c.eliminado && ["sin_estado","naranja","buzon","verde","numero_equivocado"].includes(c.estado)).map(c=>({...c,_tipo:"distribucion"})),
    ...referidosLlamables,
  ];
  const norm=(t)=>(t||"").toString().trim().toLowerCase();
  // ── FILTRO ÚNICO de ciudad + CP, reutilizado por TODAS las vistas (pendientes, estados, prioridad, zonas) ──
  // Ciudad: parcial sin acentos. CP: EXACTO con 5 dígitos (menos de 5 no filtra).
  const coincideFiltro=(c)=>coincideBusqueda(c, {search, filterCity, filterCP});
  const zipQuery = normalizeZip(filterCP);
  const zipIncompleto = zipQuery.length>0 && zipQuery.length<5; // 1-4 dígitos → avisar
  const cpFiltraActivo = zipQuery.length===5;                    // 5 dígitos → sí filtra
  const hayFiltro = !!(filterCity || cpFiltraActivo);            // CP solo cuenta como filtro con 5 díg
  // Ciudades disponibles (de TODOS los clientes activos, no solo pendientes)
  const cities=[...new Set([...data.agregados,...data.prospectos,...data.distribucion].filter(c=>!c.eliminado).map(c=>(c.ciudad||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  // Pendientes filtrados + ORDENADOS por última vez llamado (rotación sin repetir)
  // displayedClients = ÚNICA fuente de verdad para pendientes:
  // 1) filtra por estado (pendientesAll), 2) filtra por ciudad/CP (coincideFiltro),
  // 3) descarta cualquier registro sin id válido (requisito 7), 4) ordena por rotación.
  const tieneIdValido=(c)=>{
    if(!c) return false;
    // C) Referidos: id debe tener formato "anfitrionId::indice" con anfitrionId no vacío
    if(c._tipo==="referidos"){
      if(typeof c.id!=="string") return false;
      const partes=c.id.split("::");
      const anfId=partes[0];
      const idx=partes[1];
      return !!anfId && anfId!=="undefined" && anfId!=="null" && idx!==undefined && idx!=="";
    }
    // Clientes normales: el id debe existir
    return c?.id!==undefined && c?.id!==null && c?.id!=="";
  };
  const coincideBase=(c)=>filterBase==="todas" || c._tipo===filterBase;
  const pendientes=pendientesAll
    .filter(coincideFiltro)
    .filter(coincideBase)
    .filter(tieneIdValido)
    .sort((a,b)=>{
      // Rotación ÚNICA para TODAS las bases por igual (referidos incluidos, sin
      // privilegio): primero los NUNCA llamados, y los YA llamados bajan por fecha
      // (más reciente al final). Así "marcar como llamado" manda al cliente al
      // final de verdad, sea agregado, distribución, prospecto o referido.
      const ta=a.ultimo_llamado||"";  // "" = nunca llamado
      const tb=b.ultimo_llamado||"";
      // Ambos sin llamar: lo MÁS NUEVO primero — cualquier dato recién subido
      // (importado, agregado a mano o referido nuevo) aparece arriba de la lista.
      if(!ta && !tb) return String(b.creado||"").localeCompare(String(a.creado||""));
      if(!ta) return -1;              // sin llamar va antes que llamado
      if(!tb) return 1;
      return ta.localeCompare(tb);    // ambos llamados: más antiguo primero, recién llamado al final
    });

  // ── TODOS los clientes (activos) con su tipo, para agrupar por estado — TAMBIÉN se filtra por ciudad/CP ──
  // Filtra por ciudad/CP Y descarta registros sin id válido (requisito 7).
  const todosClientes=[
    ...data.agregados.filter(c=>!c.eliminado).map(c=>({...c,_tipo:"agregados"})),
    ...data.prospectos.filter(c=>!c.eliminado).map(c=>({...c,_tipo:"prospectos"})),
    ...data.distribucion.filter(c=>!c.eliminado).map(c=>({...c,_tipo:"distribucion"})),
    ...referidosLlamables,
  ].filter(coincideFiltro).filter(coincideBase).filter(tieneIdValido);
  // Orden de las secciones por estado (usa los estados REALES de la app)
  const ORDEN_ESTADOS=["verde","azul","amarillo","morado","naranja","buzon","rojo","magenta","numero_equivocado","sin_estado"];
  // Un cliente solo va a UNA sección (la de su estado actual)
  const clientesPorEstado={};
  ORDEN_ESTADOS.forEach(e=>clientesPorEstado[e]=[]);
  todosClientes.forEach(c=>{
    const e=clientesPorEstado[c.estado]!==undefined?c.estado:"sin_estado";
    clientesPorEstado[e].push(c);
  });

  // ── 🔥 PRIORIDAD HOY + ⚠️ SEGUIMIENTOS VENCIDOS ──
  const hoyISO=hoyLocal();
  const citasHoyFechas=new Set((data.appts||[]).filter(a=>(a.fecha||"").slice(0,10)===hoyISO).map(a=>(a.nombre||"").toLowerCase().trim()));
  const diasVencido=(fecha)=>{
    if(!fecha) return 0;
    const f=new Date(fecha+"T00:00:00"); const h=new Date(hoyISO+"T00:00:00");
    return Math.round((h-f)/(1000*60*60*24));
  };
  // Marca cada cliente con su motivo de prioridad
  const prioridadHoy=[]; const vencidos=[];
  todosClientes.forEach(c=>{
    const motivos=[];
    // Cita programada hoy (estado verde + seguimiento hoy, o aparece en appts de hoy)
    if(c.proximo_seguimiento===hoyISO) motivos.push("Seguimiento hoy");
    if(c.estado==="verde" && (citasHoyFechas.has((c.nombre||"").toLowerCase().trim()))) motivos.push("Cita hoy");
    // Seguimiento vencido
    const dvReal=c.proximo_seguimiento && c.proximo_seguimiento<hoyISO ? diasVencido(c.proximo_seguimiento) : 0;
    // Un recordatorio vencido solo vive 2 días en prioridad; después sale solo.
    const dv = dvReal>0 && dvReal<=2 ? dvReal : 0;
    if(dv>0){ motivos.push(`Vencido hace ${dv} día${dv!==1?"s":""}`); vencidos.push({...c,_diasVencido:dv}); }
    if(motivos.length>0 && !(motivos.length===1 && dv>0)){
      // Va a Prioridad Hoy si tiene algo de HOY (no solo vencido)
      prioridadHoy.push({...c,_motivos:motivos,_diasVencido:dv});
    } else if(dv>0){
      // Solo vencido → también entra a prioridad pero marcado distinto
      prioridadHoy.push({...c,_motivos:motivos,_diasVencido:dv});
    }
  });
  vencidos.sort((a,b)=>b._diasVencido-a._diasVencido);

  // Actualiza un referido dentro de su anfitrión y revisa si toca obsequio
  const updateReferido=(refDe,refIdx,patch)=>{
    setData("referidos", p=>p.map(anf=>{
      if(anf.id!==refDe) return anf;
      const refs=[...(anf.referidos||[])];
      refs[refIdx]={...refs[refIdx],...patch};
      // Contar citas (verde) y ventas de los referidos de este anfitrión
      const citas=refs.filter(r=>r.estado==="verde").length;
      const ventas=refs.filter(r=>r.venta||r.resultado==="venta").length;
      // Disparar alerta de obsequio una sola vez
      if(!anf._obsequioAvisado && (citas>=4 || ventas>=1) && notify){
        const motivo = ventas>=1 ? `1 venta de sus referidos` : `${citas} citas coordinadas`;
        notify("obsequio",
          `🎁 ¡Obsequio para ${anf.anfitrion||"anfitrión"}!`,
          `${anf.anfitrion||"Un anfitrión"} logró ${motivo}. Hay que pedir su regalo${anf.regalo?`: ${anf.regalo}`:""}.`,
          "🎁 Referidos"
        );
        return {...anf, referidos:refs, _obsequioAvisado:true};
      }
      return {...anf, referidos:refs};
    }));
  };

  const updateStatus=(id,tipo,status)=>{
    if(tipo==="referidos"){
      const [refDe,refIdx]=id.split("::");
      updateReferido(refDe, +refIdx, {estado:status, proximo_seguimiento:""});
    } else {
      // Al cambiar el estado, el recordatorio/seguimiento se limpia → el cliente
      // SALE de la lista de prioridad automáticamente.
      setData(tipo,p=>p.map(x=>x.id===id?{...x,estado:status, proximo_seguimiento:""}:x));
    }
  };
  const saveHistorial=(id,tipo,entry)=>{
    if(tipo==="referidos"){
      const [refDe,refIdx]=id.split("::");
      setData("referidos", p=>p.map(anf=>{
        if(anf.id!==refDe) return anf;
        const refs=[...(anf.referidos||[])];
        refs[refIdx]={...refs[refIdx], historial:[...(refs[refIdx].historial||[]), entry]};
        return {...anf, referidos:refs};
      }));
    } else {
      setData(tipo,p=>addHistorialEntry(p,id,entry));
    }
  };
  // Marca un cliente como "llamado ahora" → se va al final de la lista de pendientes
  const marcarLlamado=(id,tipo)=>{
    const ahora=new Date().toISOString();
    if(tipo==="referidos"){
      const [refDe,refIdx]=id.split("::");
      setData("referidos", p=>p.map(anf=>{
        if(anf.id!==refDe) return anf;
        const refs=[...(anf.referidos||[])];
        refs[refIdx]={...refs[refIdx], ultimo_llamado:ahora};
        return {...anf, referidos:refs};
      }));
    } else {
      setData(tipo,p=>p.map(x=>x.id===id?{...x,ultimo_llamado:ahora}:x));
    }
  };
  const saveNota=(id,tipo,texto)=>{
    if(tipo==="referidos"){
      const [refDe,refIdx]=id.split("::");
      setData("referidos", p=>p.map(anf=>{
        if(anf.id!==refDe) return anf;
        const refs=[...(anf.referidos||[])];
        refs[refIdx]=agregarNota(refs[refIdx], texto, agente);
        return {...anf, referidos:refs};
      }));
    } else {
      setData(tipo,p=>p.map(x=>x.id===id?agregarNota(x,texto,agente):x));
    }
  };
  // Eliminar una entrada del historial (llamada/cita) desde el área de Llamadas
  const deleteHist=(id,tipo,entryKey)=>{
    if(tipo==="referidos"){
      const [refDe,refIdx]=id.split("::");
      setData("referidos", p=>p.map(anf=>{
        if(anf.id!==refDe) return anf;
        const refs=[...(anf.referidos||[])];
        refs[refIdx]={...refs[refIdx], historial:(refs[refIdx].historial||[]).filter(h=>(h.id||h.fecha)!==entryKey)};
        return {...anf, referidos:refs};
      }));
    } else {
      setData(tipo,p=>deleteHistorialEntry(p,id,entryKey));
    }
  };
  // ── Eliminar y editar clientes desde el área de Llamadas (funciona en todas las vistas) ──
  const [editCall,setEditCall]=useState(null); // {cliente, tipo}
  const eliminarCliente=(id,tipo)=>{
    if(tipo==="referidos"){ alert("Los referidos se eliminan desde la pestaña Referidos."); return; }
    if(!confirm("¿Mover este registro a la papelera? Podrás restaurarlo desde su pestaña.")) return;
    setData(tipo,p=>p.map(x=>x.id===id?{...x,eliminado:true}:x));
  };
  const editarCliente=(cliente,tipo)=>{
    if(tipo==="referidos"){ alert("Los referidos se editan desde la pestaña Referidos."); return; }
    setEditCall({cliente,tipo});
  };
  const guardarEdicionCall=(d)=>{
    if(!editCall) return;
    setData(editCall.tipo, p=>p.map(x=>x.id===editCall.cliente.id?{...d,id:editCall.cliente.id}:x));
    setEditCall(null);
  };
  const openSchedule=(client,tipo=null)=>{setScheduleClient(client);setForceTipo(tipo);};
  const handleSchedule=appt=>{
    window.open(gcalLink(appt),"_blank");
    if(setAppts) setAppts(p=>[{...appt,id:genId(),_type:appt.tipo},...p]);

    // Guardar info de la cita en la tarjeta del cliente (igual que DBSection)
    if(scheduleClient){
      const sc=scheduleClient;
      const tipo=sc._tipo;
      const actualizarCliente=(clientes)=>clientes.map(x=>{
        if(x.id!==sc.id) return x;
        const upd={...x};
        if(!upd.telefono && appt.telefono) upd.telefono=appt.telefono;
        if(!upd.direccion && appt.direccion) upd.direccion=appt.direccion;
        if(!upd.ciudad && appt.ciudad) upd.ciudad=appt.ciudad;
        if(!upd.cp && appt.cp) upd.cp=appt.cp;
        if(!upd.cuenta && appt.cuenta) upd.cuenta=appt.cuenta;
        if(appt.notas && appt.notas.trim()){
          const notaCita=`[Cita ${appt.tipo||"cita"} ${(appt.fecha||"").slice(0,10)}] ${appt.notas.trim()}`;
          upd.ultimaNota=notaCita;
          upd.notas=[...(upd.notas||[]),{texto:notaCita,fecha:new Date().toISOString(),agente:appt.agente||agente}];
        }
        if(["llamada","seguimiento","reset"].includes(appt.tipo) && appt.fecha)
          upd.proximo_seguimiento=(appt.fecha||"").slice(0,10);
        upd.ultima_cita_programada=(appt.fecha||"").slice(0,16);
        upd.actualizado=new Date().toISOString();
        return upd;
      });
      if(tipo==="referidos"){
        const [refDe,refIdx]=sc.id.split("::");
        setData("referidos",p=>p.map(anf=>{
          if(anf.id!==refDe) return anf;
          const refs=[...(anf.referidos||[])];
          refs[+refIdx]=actualizarCliente([refs[+refIdx]])[0];
          return {...anf,referidos:refs};
        }));
      } else if(tipo){
        setData(tipo,actualizarCliente);
      }
    }

    setCalMsg(`✅ ${appt.nombre} — cita guardada en Agenda y se abrió Google Calendar: solo toca GUARDAR allá.`);
    setScheduleClient(null); setForceTipo(null);
  };
  const handleApptResult=(c,id,detail="",monto="",producto="",cartucho_meses=0)=>{
    const t=c._tipo;
    const montoNum = id==="demo_venta" ? Number(monto)||0 : 0;
    const patch = id==="demo_venta" ? {venta:true,resultado:"demo_venta",resultado_detalle:detail,ultimo_monto_venta:montoNum||undefined,ultimo_producto:producto||undefined,ultimo_cartucho_meses:cartucho_meses||undefined}
                : id==="demo_no_venta" ? {venta:false,resultado:"demo_no_venta",resultado_detalle:detail}
                : id==="no_recibio" ? {venta:false,resultado:"no_recibio",resultado_detalle:detail}
                : id==="no_visito" ? {venta:false,resultado:"no_visito",resultado_detalle:detail}
                : id==="seguimiento" ? {resultado:"seguimiento",resultado_detalle:detail}
                : id==="reset" ? {resultado:"reset",resultado_detalle:detail} : {};
    if(t==="referidos"){
      const [refDe,refIdx]=c.id.split("::");
      updateReferido(refDe, +refIdx, patch);
    } else {
      setData(t,p=>p.map(x=>x.id===c.id?{...x,...patch}:x));
    }
    if(id==="seguimiento") openSchedule(c,"llamada");
    if(id==="reset") openSchedule(c,"reset");
  };

  // ── LLAMADAS REALIZADAS HOY ──
  // Recolecta de TODOS los datos las entradas de historial tipo "llamada" hechas hoy.
  const [subTab,setSubTab]=useState("pendientes");  // pendientes | estados | hoy | total
  const [estadosAbiertos,setEstadosAbiertos]=useState({verde:true}); // secciones de "por estado" colapsables
  const [zonasAbiertas,setZonasAbiertas]=useState({}); // secciones de "zonas" colapsables
  const [zonaVer,setZonaVer]=useState({}); // cuántas tarjetas mostrar por zona (paginado ligero)
  const [zonaModo,setZonaModo]=useState("ciudad"); // ciudad | zip
  const hoyStr=hoyLocal();
  const SRC_LABEL={agregados:"📂 Agregados",prospectos:"🔍 Prospección",distribucion:"🏠 Distribución",referidos:"🎁 Referido"};

  const recolectarLlamadas=(soloHoy)=>{
    const out=[];
    const push=(nombre,fuente,h,anfitrion)=>{
      // Cuenta llamadas Y cambios de estado (ambos significan que hubo contacto)
      if(h.tipo!=="llamada" && h.tipo!=="estado") return;
      if(soloHoy && diaLocal(h.fecha)!==hoyStr) return;
      out.push({nombre, fuente, anfitrion, estado:h.estado, notas:h.notas, fecha:h.fecha, agente:h.agente, tipo:h.tipo});
    };
    (data.agregados||[]).forEach(c=>(c.historial||[]).forEach(h=>push(c.nombre,"agregados",h)));
    (data.prospectos||[]).forEach(c=>(c.historial||[]).forEach(h=>push(c.nombre,"prospectos",h)));
    (data.distribucion||[]).forEach(c=>(c.historial||[]).forEach(h=>push(c.nombre,"distribucion",h)));
    (data.referidos||[]).forEach(anf=>(anf.referidos||[]).forEach(r=>(r.historial||[]).forEach(h=>push(r.nombre,"referidos",h,anf.anfitrion))));
    // Más recientes primero
    return out.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  };
  const llamadasHoy=recolectarLlamadas(true);
  const llamadasTotal=recolectarLlamadas(false);

  const LlamadaItem=({l})=>{
    const est=STATUS_COLORS[l.estado];
    const d=l.fecha?new Date(l.fecha):null;
    const hora=d?d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"";
    const fecha=d?d.toLocaleDateString("es-MX",{day:"numeric",month:"short"}):"";
    const SRC_MINI={agregados:{t:"AGG",bg:"#f1ecfd",c:"#5b21b6"},prospectos:{t:"PROS",bg:"#fef3e2",c:"#b45309"},distribucion:{t:"DIS",bg:"#e7f6ec",c:"#047857"},referidos:{t:"REF",bg:"#faf5ff",c:"#7c3aed"}};
    const sc=SRC_MINI[l.fuente];
    return (
      <div className="bg-white rounded-xl border border-[#e8edf3] p-3 flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#e8edf3] flex items-center justify-center text-base shrink-0 mt-0.5"><Ico e="📞" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {sc && <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{background:sc.bg,color:sc.c}}>{sc.t}</span>}
            <span className="font-bold text-sm text-[#1f2d3d] truncate">{l.nombre||"(Sin nombre)"}</span>
            {l.fuente==="referidos" && l.anfitrion && <span className="text-[10px] text-purple-500">ref. de {l.anfitrion}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {est && <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md" style={est.style}>{est.label}</span>}
            <span className="text-[10px] text-slate-400 bg-[#f4f6f9] px-1.5 py-0.5 rounded-md"><Ico e="🕐" className="mr-1.5" />{hora}</span>
            <span className="text-[10px] text-slate-400 bg-[#f4f6f9] px-1.5 py-0.5 rounded-md"><Ico e="📅" className="mr-1.5" />{fecha}</span>
            {l.agente && <span className="text-[10px] text-[#5b21b6] bg-[#5b21b6]/8 px-1.5 py-0.5 rounded-md font-bold"><Ico e="👤" className="mr-1.5" />{l.agente}</span>}
          </div>
          {l.notas && <div className="text-[11px] text-slate-500 italic bg-[#f4f6f9] rounded-lg px-2 py-1 mt-1.5">📝 "{l.notas}"</div>}
        </div>
      </div>
    );
  };

  return (
    <div>
      {calMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-bold flex items-center justify-between"><Msg>{calMsg}</Msg><button onClick={()=>setCalMsg("")} className="ml-2"><Ico e="✕" /></button></div>}

      {/* Sub-pestañas */}
      <div className="flex gap-1.5 mb-4">
        {[
          {id:"prioridad",ico:"🔥", label:"Prioridad",n:prioridadHoy.length},
          {id:"pendientes",ico:"⏳", label:"Pendientes",n:pendientesAll.length},
          {id:"estados",ico:"🗂", label:"Estados",n:todosClientes.length},
          {id:"zonas",ico:"📍", label:"Zonas",n:Object.keys(todosClientes.reduce((a,c)=>{if(c.ciudad)a[normTexto(limpiaCiudad(c.ciudad))]=1;return a;},{})).length},
          {id:"hoy",ico:"✅", label:"Hoy",n:llamadasHoy.length},
          {id:"total",ico:"📊", label:"Total",n:llamadasTotal.length},
        ].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            className={`flex-1 px-1 py-2.5 rounded-xl text-[10px] font-bold transition flex flex-col items-center gap-0.5 ${subTab===t.id?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
            style={subTab===t.id?{background:RP.navy}:{}}>
            <span>{t.label}</span>
            <span className={`text-base font-black ${subTab===t.id?"text-white":"text-[#5b21b6]"}`} style={{fontFamily:SERIF}}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* ── FILTRO de ciudad + CP — visible en todas las vistas excepto Hoy/Total (que son de llamadas) ── */}
      {["prioridad","pendientes","estados","zonas"].includes(subTab) && (
        <>
          <input className="w-full border-2 border-[#e5def4] rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#7c3aed] mb-2" placeholder="Buscar por nombre o teléfono…" name="buscar-llamadas" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={search} onChange={e=>setSearch(e.target.value)} />
          {/* ── FILTRO POR BASE ── */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            {[["todas","📋","Todas"],["agregados","➕","Agregados"],["distribucion","🚚","Distribución"],["referidos","🔗","Referidos"],["prospectos","🎯","Prospección"]].map(([id,ico,label])=>(
              <button key={id} onClick={()=>setFilterBase(id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black transition ${filterBase===id?"text-white":"bg-white text-slate-500 border border-[#e5def4]"}`}
                style={filterBase===id?{background:RP.navy}:{}}><Ico e={ico} size={12} />{label}</button>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <input list="ciudades-llamadas" className="w-full border-2 border-[#e5def4] rounded-lg px-2 py-2 text-xs bg-white font-bold text-slate-700 focus:outline-none focus:border-[#7c3aed]"
                placeholder={`Filtrar ciudad (${cities.length} disponibles)`}
                name="filtro-ciudad-llamadas" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                value={filterCity} onChange={e=>setFilterCity(e.target.value)} />
              <datalist id="ciudades-llamadas">
                {cities.map(c=><option key={c} value={c}>{c}</option>)}
              </datalist>
            </div>
            <input className="border-2 border-[#e5def4] rounded-lg px-2 py-2 text-xs bg-white font-bold text-slate-700 w-24"
              placeholder="C.P. (5 díg)" inputMode="numeric" maxLength={10}
              name="filtro-cp-llamadas" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              value={filterCP} onChange={e=>setFilterCP(e.target.value)} />
            {(filterCity||filterCP) && <button onClick={()=>{setFilterCity("");setFilterCP("");}} className="text-xs text-red-400 font-bold px-1 hover:text-red-600"><Ico e="✕" /></button>}
          </div>
          {zipIncompleto && <div className="mb-3 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><Ico e="📮" className="mr-1.5" />Escribe 5 dígitos para filtrar por código postal</div>}
          {hayFiltro && <div className="mb-3 text-xs font-bold text-[#5b21b6]"><Ico e="🔎" className="mr-1.5" />Filtro activo{filterCity?` · ciudad "${filterCity}"`:""}{cpFiltraActivo?` · CP "${zipQuery}"`:""}</div>}
        </>
      )}

      {/* ── PRIORIDAD HOY ── */}
      {subTab==="prioridad" && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">Clientes con algo importante para hoy o seguimientos vencidos. Aquí empiezas el día.</div>

          {/* Seguimientos vencidos primero (lo más urgente) */}
          {vencidos.length>0 && (
            <div className="rounded-2xl border-2 border-red-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 flex items-center justify-between">
                <span className="text-sm font-black text-red-700"><Ico e="⚠" className="mr-1.5" />Seguimientos vencidos</span>
                <span className="text-xs font-black text-white bg-red-500 px-2 py-0.5 rounded-full">{vencidos.length}</span>
              </div>
              <div className="p-2 space-y-2 bg-[#fff8f8]">
                {vencidos.map((c,_i)=>(
                  <div key={`venc-${_i}-${c._tipo}-${String(c.id)}`} className="relative">
                    <div className="absolute -top-1 -right-1 z-10 text-[9px] font-black text-white bg-red-500 px-1.5 py-0.5 rounded-full shadow"><Ico e="🔴" className="mr-1.5" />{c._diasVencido}d</div>
                    <ClientRow c={c} type={c._tipo==="referidos"?"referido-llamada":c._tipo} role={role}
                      onStatusChange={(id,status)=>updateStatus(id,c._tipo,status)} onEdit={cc=>editarCliente(cc,c._tipo)} onSchedule={cc=>openSchedule(cc)} onDelete={id=>eliminarCliente(id,c._tipo)}
                      onCall={onCallLog} onApptResult={handleApptResult} onSaveCallToHistorial={(id,entry)=>saveHistorial(id,c._tipo,entry)} onSaveNota={(id,texto)=>saveNota(id,c._tipo,texto)} agente={agente} onDeleteHistorial={(cid,ekey)=>deleteHist(cid,c._tipo,ekey)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prioridad de hoy (citas/seguimientos de hoy) */}
          {(()=>{
            const soloHoy=prioridadHoy.filter(c=>c._motivos.some(m=>m.includes("hoy")||m.includes("Cita")||m.includes("Seguimiento hoy")));
            if(soloHoy.length===0 && vencidos.length===0){
              return (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
                  <div className="mb-2 flex justify-center"><Ico e="🎉" size={36} strokeWidth={1.25} className="opacity-40" /></div>
                  <div className="text-sm text-slate-400">Nada urgente para hoy. ¡Vas al día!</div>
                </div>
              );
            }
            if(soloHoy.length===0) return null;
            return (
              <div className="rounded-2xl border-2 border-[#16a34a]/30 overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-50 flex items-center justify-between">
                  <span className="text-sm font-black text-emerald-700"><Ico e="🔥" className="mr-1.5" />Para hoy</span>
                  <span className="text-xs font-black text-white bg-emerald-500 px-2 py-0.5 rounded-full">{soloHoy.length}</span>
                </div>
                <div className="p-2 space-y-2 bg-[#f8fdf9]">
                  {soloHoy.map((c,_i)=>(
                    <div key={`hoy-${_i}-${c._tipo}-${String(c.id)}`}>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {c._motivos.map((m,i)=>(
                          <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.includes("Vencido")?"bg-red-100 text-red-600":m.includes("Cita")?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>{m.includes("Cita")?<><Ico e="📅" className="mr-1" /></>:m.includes("Seguimiento")?<><Ico e="⏰" className="mr-1" /></>:<><Ico e="⚠" className="mr-1" /></>}{m}</span>
                        ))}
                      </div>
                      <ClientRow c={c} type={c._tipo==="referidos"?"referido-llamada":c._tipo} role={role}
                        onStatusChange={(id,status)=>updateStatus(id,c._tipo,status)} onEdit={cc=>editarCliente(cc,c._tipo)} onSchedule={cc=>openSchedule(cc)} onDelete={id=>eliminarCliente(id,c._tipo)}
                        onCall={onCallLog} onApptResult={handleApptResult} onSaveCallToHistorial={(id,entry)=>saveHistorial(id,c._tipo,entry)} onSaveNota={(id,texto)=>saveNota(id,c._tipo,texto)} agente={agente} onDeleteHistorial={(cid,ekey)=>deleteHist(cid,c._tipo,ekey)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── POR ESTADO: secciones colapsables ── */}
      {subTab==="estados" && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400 mb-1">Cada cliente aparece en la sección de su estado actual. Cambia el estado de un cliente y se mueve solo.</div>
          {ORDEN_ESTADOS.filter(e=>clientesPorEstado[e].length>0).map(e=>{
            const info=STATUS_COLORS[e];
            const lista=clientesPorEstado[e];
            const abierto=estadosAbiertos[e];
            return (
              <div key={e} className="rounded-xl border border-[#e8edf3] overflow-hidden">
                <button onClick={()=>setEstadosAbiertos(p=>({...p,[e]:!p[e]}))}
                  className="w-full flex items-center justify-between px-3 py-2.5 transition" style={info.style}>
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{background:info.style.color==="#1f2d3d"?"#1f2d3d":"rgba(255,255,255,0.85)"}} />
                    {info.label}
                    <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{background:"rgba(255,255,255,0.25)"}}>{lista.length}</span>
                  </span>
                  <span className={`transition-transform duration-200 ${abierto?"rotate-180":""}`}>▾</span>
                </button>
                {abierto && (
                  <div className="p-2 space-y-2 bg-[#f9fafb]">
                    {lista.map((c,_i)=>(
                      <ClientRow key={`est-${e}-${_i}-${c._tipo}-${String(c.id)}`} c={c} type={c._tipo==="referidos"?"referido-llamada":c._tipo} role={role}
                        onStatusChange={(id,status)=>updateStatus(id,c._tipo,status)}
                        onEdit={cc=>editarCliente(cc,c._tipo)} onSchedule={cc=>openSchedule(cc)} onDelete={id=>eliminarCliente(id,c._tipo)}
                        onCall={onCallLog} onApptResult={handleApptResult}
                        onSaveCallToHistorial={(id,entry)=>saveHistorial(id,c._tipo,entry)}
                        onSaveNota={(id,texto)=>saveNota(id,c._tipo,texto)}
                        agente={agente} onDeleteHistorial={(cid,ekey)=>deleteHist(cid,c._tipo,ekey)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {todosClientes.length===0 && (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
              <div className="mb-2 flex justify-center"><Ico e="🗂" size={36} strokeWidth={1.25} className="opacity-40" /></div>
              <div className="text-sm text-slate-400">Aún no hay clientes. Agrégalos o impórtalos con IA.</div>
            </div>
          )}
        </div>
      )}

      {/* ── 📍 ZONAS (segmentación por ciudad/ZIP) ── */}
      {subTab==="zonas" && (()=>{
        const campo = zonaModo==="ciudad" ? "ciudad" : "cp";
        // Agrupación NORMALIZADA: "Dallas", "dallas" y "DALLAS" caen en el mismo grupo
        // (sin acentos, sin mayúsculas/minúsculas, sin espacios dobles).
        const grupos={};
        const variantes={}; // clave normalizada -> conteo de cada forma escrita original
        todosClientes.forEach(c=>{
          const crudo=(c[campo]||"").toString().trim();
          const base=zonaModo==="ciudad"?limpiaCiudad(crudo):crudo; // quita ", Texas", " TX", etc.
          const k=base?normTexto(base):"(sin dato)";
          if(!grupos[k]){ grupos[k]=[]; variantes[k]={}; }
          grupos[k].push(c);
          if(base){ const v=base.replace(/\s+/g," "); variantes[k][v]=(variantes[k][v]||0)+1; }
        });
        // Etiqueta visible: la forma más usada, en Formato Título (ej. "Fort Worth")
        const etiquetaDe=(k)=>{
          if(k==="(sin dato)") return "(sin dato)";
          const vs=Object.entries(variantes[k]||{});
          if(!vs.length) return k;
          const top=vs.sort((a,b)=>b[1]-a[1])[0][0];
          return top.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(" ");
        };
        const ordenados=Object.entries(grupos).sort((a,b)=>b[1].length-a[1].length);
        return (
          <div className="space-y-2">
            <div className="flex gap-1.5 mb-2">
              {[["ciudad","🏙️ Por ciudad"],["zip","📮 Por código postal"]].map(([v,l])=>(
                <button key={v} onClick={()=>setZonaModo(v)} className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${zonaModo===v?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-500"}`}>{l}</button>
              ))}
            </div>
            <div className="text-xs text-slate-400 mb-1">Clientes y referidos agrupados por {zonaModo==="ciudad"?"ciudad":"código postal"}. Toca una zona para ver y crear ruta.</div>
            {ordenados.map(([zona,lista])=>{
              const abierta=zonasAbiertas[zona];
              const conDir=lista.filter(c=>dirSuficiente(c)).length;
              return (
                <div key={zona} className="rounded-xl border border-[#e8edf3] overflow-hidden">
                  <button onClick={()=>setZonasAbiertas(p=>({...p,[zona]:!p[zona]}))} className="w-full flex items-center justify-between px-3 py-2.5 bg-[#f4f6f9] hover:bg-[#f1ecfd] transition">
                    <span className="flex items-center gap-2 font-bold text-sm text-[#5b21b6]">
                      <span>{zonaModo==="ciudad"?"🏙️":"📮"} {etiquetaDe(zona)}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#5b21b6] text-white">{lista.length}</span>
                      {conDir>0 && <span className="text-[10px] text-emerald-600 font-bold"><Ico e="📍" className="mr-1.5" />{conDir} con dirección</span>}
                    </span>
                    <span className={`transition-transform duration-200 ${abierta?"rotate-180":""}`}>▾</span>
                  </button>
                  {abierta && (
                    <div className="p-2 bg-white">
                      <div className="space-y-3 mb-2">
                        {lista.slice(0, zonaVer[zona]||15).map((c,_i)=>(
                          <ClientRow key={`zona-${zona}-${_i}-${c._tipo}-${String(c.id)}`} c={c} type={c._tipo==="referidos"?"referido-llamada":c._tipo} role={role}
                            onStatusChange={(id,status)=>updateStatus(id,c._tipo,status)} onEdit={cc=>editarCliente(cc,c._tipo)} onSchedule={c=>openSchedule(c)}
                            onDelete={id=>eliminarCliente(id,c._tipo)} onCall={onCallLog} onApptResult={handleApptResult}
                            onSaveCallToHistorial={(id,entry)=>saveHistorial(id,c._tipo,entry)} onSaveNota={(id,texto)=>saveNota(id,c._tipo,texto)}
                            agente={agente} onDeleteHistorial={(cid,ekey)=>deleteHist(cid,c._tipo,ekey)} onMarcarLlamado={(id)=>marcarLlamado(id,c._tipo)} />
                        ))}
                      </div>
                      {lista.length>(zonaVer[zona]||15) && (
                        <button onClick={()=>setZonaVer(p=>({...p,[zona]:(p[zona]||15)+15}))}
                          className="w-full mb-2 px-3 py-2 rounded-lg text-xs font-bold border-2 border-[#5b21b6] text-[#5b21b6] bg-white active:scale-95 transition">
                          ▾ Mostrar 15 más ({lista.length-(zonaVer[zona]||15)} restantes)
                        </button>
                      )}
                      <a href={rutaMapsLink(lista.filter(c=>dirSuficiente(c)))} target="_blank" rel="noreferrer"
                        className={`block w-full text-center px-3 py-2 rounded-lg text-xs font-bold text-white ${lista.filter(c=>dirSuficiente(c)).length>0?"":"opacity-40 pointer-events-none"}`} style={{background:"#1a73e8"}}>
                        <Ico e="🗺" className="mr-1.5" />Ver {etiquetaDe(zona)} en Google Maps
                      </a>
                      <div className="text-[10px] text-slate-400 text-center mt-1.5"><Ico e="💡" className="mr-1.5" />Para guardar esta zona como ruta, ve a la pestaña 🗺️ Rutas → Crear ruta → Por {zonaModo==="ciudad"?"ciudad":"ZIP"}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {todosClientes.length===0 && (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
                <div className="mb-2 flex justify-center"><Ico e="📍" size={36} strokeWidth={1.25} className="opacity-40" /></div>
                <div className="text-sm text-slate-400">Aún no hay clientes con zona registrada.</div>
              </div>
            )}
          </div>
        );
      })()}

      {subTab==="pendientes" && (
        <>
          {hayFiltro && <div className="mb-3 text-xs font-bold text-[#5b21b6]">Mostrando {pendientes.length} de {pendientesAll.length} pendientes</div>}

          {pendientes.length===0
            ? <div className="text-center py-14 text-slate-400"><div className="mb-3 flex justify-center"><Ico e={pendientesAll.length===0?"✅":"🔍"} size={40} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">{pendientesAll.length===0?"¡No hay llamadas pendientes!":"Ningún pendiente con ese filtro"}</div></div>
            : <div className="space-y-3">{pendientes.map((c,_i)=>(<ClientRow key={`pend-${_i}-${c._tipo}-${String(c.id)}`} c={c} type={c._tipo==="referidos"?"referido-llamada":c._tipo} role={role} onStatusChange={(id,status)=>updateStatus(id,c._tipo,status)} onEdit={cc=>editarCliente(cc,c._tipo)} onSchedule={c=>openSchedule(c)} onDelete={id=>eliminarCliente(id,c._tipo)} onCall={onCallLog} onApptResult={handleApptResult} onSaveCallToHistorial={(id,entry)=>saveHistorial(id,c._tipo,entry)} onSaveNota={(id,texto)=>saveNota(id,c._tipo,texto)} agente={agente} onDeleteHistorial={(cid,ekey)=>deleteHist(cid,c._tipo,ekey)} onMarcarLlamado={(id)=>marcarLlamado(id,c._tipo)} />))}</div>}
        </>
      )}

      {subTab==="hoy" && (
        <>
          <div className="mb-3 rounded-xl p-4 text-white flex items-center justify-between" style={{background:`linear-gradient(135deg, ${RP.navy}, ${RP.blue})`}}>
            <div><div className="text-xs font-bold opacity-90">Llamadas realizadas hoy</div><div className="text-3xl font-black" style={{fontFamily:SERIF}}>{llamadasHoy.length}</div></div>
            <div className="opacity-80 flex justify-center"><Ico e="📞" size={44} strokeWidth={1.25} className="opacity-40" /></div>
          </div>
          {llamadasHoy.length===0
            ? <div className="text-center py-10 text-slate-400"><div className="mb-2 flex justify-center"><Ico e="☎" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">Aún no hay llamadas registradas hoy</div><div className="text-xs mt-1">Registra llamadas desde "Pendientes" con el botón 📞 Resultado</div></div>
            : <div className="space-y-2">{llamadasHoy.map((l,i)=><LlamadaItem key={i} l={l} />)}</div>}
        </>
      )}

      {subTab==="total" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#e8edf3]"><div className="text-3xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{llamadasHoy.length}</div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Hoy</div></div>
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#e8edf3]"><div className="text-3xl font-black text-emerald-700" style={{fontFamily:SERIF}}>{llamadasTotal.length}</div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Total histórico</div></div>
          </div>
          {llamadasTotal.length===0
            ? <div className="text-center py-10 text-slate-400"><div className="mb-2 flex justify-center"><Ico e="☎" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">Aún no hay llamadas registradas</div></div>
            : <div className="space-y-2">{llamadasTotal.map((l,i)=><LlamadaItem key={i} l={l} />)}</div>}
        </>
      )}

      {scheduleClient && <Modal title="📅 Agendar" onClose={()=>{setScheduleClient(null);setForceTipo(null);}}><AppointmentForm client={scheduleClient} forceTipo={forceTipo} loading={calLoading} onSave={handleSchedule} onClose={()=>{setScheduleClient(null);setForceTipo(null);}} agenteActivo={agente} /></Modal>}
      {editCall && <Modal title={`✏️ Editar — ${editCall.tipo==="distribucion"?"Distribución":editCall.tipo==="prospectos"?"Prospecto":"Cliente"}`} onClose={()=>setEditCall(null)}><ClientForm initial={editCall.cliente} type={editCall.tipo==="prospectos"?"prospecto":editCall.tipo==="distribucion"?"distribucion":"agregado"} onSave={guardarEdicionCall} onClose={()=>setEditCall(null)} /></Modal>}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
// ─── RECLUTAMIENTO ────────────────────────────────────────────
const RECLU_RESULTADOS = ["Pendiente","Nuevo socio","No contratado","No se presentó","2da entrevista"];
const RECLU_RES_STYLE = {
  "Pendiente":      { bg:"#fef3e2", c:"#b45309" },
  "Nuevo socio":    { bg:"#e7f6ec", c:"#047857" },
  "No contratado":  { bg:"#fde8e8", c:"#dc2626" },
  "No se presentó": { bg:"#f1f5f9", c:"#64748b" },
  "2da entrevista": { bg:"#f1ecfd", c:"#5b21b6" },
};
// Mensaje persuasivo de oportunidad laboral (WhatsApp/SMS)
const recluMsg = (nombre) => {
  const primer = (nombre||"").split(" ")[0] || nombre || "";
  return encodeURIComponent(`¡Hola ${primer}! 👋 Te escribo de Impact Enterprises. Estamos creciendo y buscamos personas con buena actitud para una oportunidad con ingresos por encima del promedio, horario flexible y crecimiento real — no necesitas experiencia, nosotros te capacitamos. Me encantaría contarte los detalles en una entrevista corta. ¿Qué día de esta semana te queda mejor? 🙌`);
};
const waLinkReclu = (n, nombre) => waLink(n) + "?text=" + recluMsg(nombre);
const smsLinkReclu = (n, nombre) => "sms:" + soloDigitos(n) + "&body=" + recluMsg(nombre);

// Casilla de estadística (número de la semana grande + del mes debajo)
function ReclStat({ label, semana, mes }) {
  return (
    <div className="rounded-xl bg-[#f4f6f9] px-2 py-3 text-center">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 leading-tight">{label}</div>
      <div className="text-2xl font-black text-[#5b21b6] leading-none">{semana}</div>
      <div className="text-[9px] text-slate-400 mt-0.5">esta semana</div>
      <div className="text-base font-bold text-slate-600 mt-2">{mes}</div>
      <div className="text-[9px] text-slate-400">este mes</div>
    </div>
  );
}

// Tarjeta compacta de prospecto de reclutamiento (se expande al tocar; incluye nota)
function RecruitCard({ r, onUpdate, onEdit, onDelete, onAgendar }) {
  const [open,setOpen]=useState(false);
  const [nota,setNota]=useState(r.notas||"");
  useEffect(()=>{ setNota(r.notas||""); },[r.notas]);
  const rs=RECLU_RES_STYLE[r.resultado]||RECLU_RES_STYLE["Pendiente"];
  const guardarNota=()=>{ if((nota||"")!==(r.notas||"")) onUpdate(r.id,{notas:nota}); };
  return (
    <div className="bg-white rounded-xl border border-[#e8edf3] shadow-sm">
      {/* Fila compacta */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none active:bg-black/5 rounded-xl" onClick={()=>setOpen(o=>!o)}>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-[#1f2d3d] truncate">{r.nombre||"(Sin nombre)"}</div>
          <div className="text-[11px] text-slate-400 truncate">{r.telefono||"sin teléfono"}{r.fuente?` · ${r.fuente}`:""}</div>
        </div>
        {r.entrevistado && <span className="text-[11px] shrink-0" title="Entrevistado"><Ico e="✅" /></span>}
        {r.entrevista_agendada && <span className="text-[11px] shrink-0" title="Entrevista agendada"><Ico e="🗓" /></span>}
        {(r.notas||"").trim() && <span className="text-[11px] shrink-0" title="Tiene nota"><Ico e="📝" /></span>}
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{background:rs.bg,color:rs.c}}>{r.resultado||"Pendiente"}</span>
        {r.telefono && <a onClick={e=>e.stopPropagation()} href={telLink(r.telefono)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white text-sm shrink-0" style={{background:RP.blue}}><Ico e="📞" /></a>}
        {r.telefono && <a onClick={e=>e.stopPropagation()} href={waLinkReclu(r.telefono,r.nombre)} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg text-white text-sm shrink-0" style={{background:"#25D366"}}><Ico e="💬" /></a>}
        <span className="text-slate-300 text-xs shrink-0 w-4 text-center">{open?"▲":"▼"}</span>
      </div>

      {/* Expandido */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-[#f0f3f7] space-y-2.5">
          {r.telefono && (
            <a href={smsLinkReclu(r.telefono,r.nombre)} className="block text-center text-[#5b21b6] text-xs font-bold px-3 py-2 rounded-lg border border-[#e5def4]"><Ico e="✉" className="mr-1.5" />Enviar SMS de oportunidad</a>
          )}
          {r.entrevista_agendada && (
            <div className="flex items-center gap-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2"><Ico e="🗓" className="mr-1.5" />Entrevista: {new Date(r.entrevista_agendada).toLocaleString("es",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
          )}
          {!r.entrevista_agendada ? (
            <button onClick={()=>onAgendar&&onAgendar(r)} className="w-full text-center text-white text-xs font-bold px-3 py-2 rounded-lg" style={{background:"#0d9488"}}><Ico e="🤝" className="mr-1.5" />Agendar entrevista</button>
          ) : (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Resultado de entrevista</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={()=>onUpdate(r.id,{entrevista_resultado:"entrevistado",entrevistado:true,entrevistado_fecha:r.entrevistado_fecha||new Date().toISOString()})} className={`text-[11px] font-bold px-2 py-2 rounded-lg border-2 ${r.entrevista_resultado==="entrevistado"?"text-white border-transparent":"text-slate-500 border-[#e5def4] bg-white"}`} style={r.entrevista_resultado==="entrevistado"?{background:"#047857"}:{}}><Ico e="✅" className="mr-1.5" />Entrevistado</button>
                <button onClick={()=>onUpdate(r.id,{entrevista_resultado:"no_llego"})} className={`text-[11px] font-bold px-2 py-2 rounded-lg border-2 ${r.entrevista_resultado==="no_llego"?"text-white border-transparent":"text-slate-500 border-[#e5def4] bg-white"}`} style={r.entrevista_resultado==="no_llego"?{background:"#dc2626"}:{}}><Ico e="🚫" className="mr-1.5" />No llegó</button>
                <button onClick={()=>onAgendar&&onAgendar(r)} className="text-[11px] font-bold px-2 py-2 rounded-lg border-2 text-cyan-700 border-cyan-200 bg-cyan-50"><Ico e="🔄" className="mr-1.5" />Reset</button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>onUpdate(r.id, r.entrevistado?{entrevistado:false}:{entrevistado:true,entrevistado_fecha:new Date().toISOString()})} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${r.entrevistado?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-[#f4f6f9] text-slate-500 border-[#e5def4]"}`}>{r.entrevistado?<><Ico e="✅" className="mr-1" />Entrevistado</>:<><Ico e="⬜" className="mr-1" />Sin entrevistar</>}</button>
            <select value={r.resultado||"Pendiente"} onChange={e=>{const v=e.target.value; onUpdate(r.id, v==="Nuevo socio"?{resultado:v,socio_fecha:r.socio_fecha||new Date().toISOString()}:{resultado:v});}} className="text-[11px] font-bold border-2 border-[#e5def4] rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-[#7c3aed]">
              {RECLU_RESULTADOS.map(op=><option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <textarea value={nota} onChange={e=>setNota(e.target.value)} onBlur={guardarNota} rows={2}
            className="w-full border-2 border-[#e5def4] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#7c3aed] resize-none"
            placeholder="Nota o detalles del prospecto…" />
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              <button onClick={()=>onEdit(r)} className="text-xs px-3 py-1.5 rounded-md bg-[#f4f6f9] text-slate-700 font-bold border border-[#e5def4]"><Ico e="✏" className="mr-1.5" />Editar</button>
              <button onClick={()=>onDelete(r.id)} className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-500 font-bold"><Ico e="🗑" /></button>
            </div>
            <div className="text-[10px] text-slate-300">La nota se guarda al salir del campo</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntrevistaModal({ prospecto, agente, onSave, onClose }) {
  const defFecha = new Date(Date.now()+3600000).toISOString().slice(0,16);
  const [f,setF]=useState({
    nombre: prospecto?.nombre||"",
    telefono: prospecto?.telefono||"",
    fecha: defFecha,
    notas: "",
    attendees: TEAM_CONTACTS.filter(c=>c.default.entrevista).map(c=>c.email),
    extraEmail: "",
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggle=(email)=>setF(p=>({...p, attendees: p.attendees.includes(email)?p.attendees.filter(e=>e!==email):[...p.attendees,email] }));
  const guardar=()=>{
    if(!f.fecha){ alert("📅 Elige la fecha y hora de la entrevista."); return; }
    const extra=(f.extraEmail||"").trim();
    const attendees=[...f.attendees, ...(extra?[extra]:[])].filter(Boolean);
    onSave({ nombre:f.nombre, telefono:f.telefono, fecha:f.fecha, notas:f.notas, attendees });
  };
  return (
    <Modal title="🤝 Agendar entrevista" onClose={onClose}>
      <div className="space-y-2.5">
        <Field label="Nombre"><input className={inpLight} value={f.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Nombre del prospecto" /></Field>
        <Field label="Teléfono"><input className={inpLight} value={f.telefono} onChange={e=>set("telefono",e.target.value)} placeholder="Teléfono" /></Field>
        <Field label="Fecha y hora"><input type="datetime-local" className={inpLight} value={f.fecha} onChange={e=>set("fecha",e.target.value)} /></Field>
        <Field label="Nota"><textarea className={inpLight+" resize-none"} rows={2} value={f.notas} onChange={e=>set("notas",e.target.value)} placeholder="Ej: Entrevista inicial, llevar presentación…" /></Field>
        <Field label="Invitar al equipo (Google Calendar)">
          <div className="space-y-1.5">
            {TEAM_CONTACTS.map(c=>(
              <button key={c.email} type="button" onClick={()=>toggle(c.email)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border-2 text-left ${f.attendees.includes(c.email)?"border-teal-500 bg-teal-50 text-teal-700":"border-[#e5def4] text-slate-500"}`}>
                <span>{f.attendees.includes(c.email)?"✅":"⬜"}</span>{c.label}
              </button>
            ))}
            <input className={inpLight} value={f.extraEmail} onChange={e=>set("extraEmail",e.target.value)} placeholder="Otro correo (opcional)" inputMode="email" autoCapitalize="off" autoCorrect="off" />
          </div>
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={guardar} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:"#0d9488"}}><Ico e="📅" className="mr-1.5" />Agendar y abrir Calendar</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-[#f4f6f9] border border-[#e5def4]">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Compresión de archivos para socios (imagen → JPEG ~100 KB; PDF ≤ 300 KB) ──
const comprimirArchivoSocio = (file) => new Promise((resolve, reject) => {
  if(file.type === "application/pdf"){
    if(file.size > 300*1024) return reject(new Error("El PDF pesa más de 300 KB. Súbelo como foto o comprímelo primero."));
    const r=new FileReader(); r.onload=()=>resolve({ n:file.name, t:file.type, b64:String(r.result).split(",")[1] });
    r.onerror=()=>reject(new Error("No se pudo leer el archivo")); r.readAsDataURL(file); return;
  }
  const r=new FileReader();
  r.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=1000; let w=img.width,h=img.height;
      if(Math.max(w,h)>MAX){ const k=MAX/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      const data=cv.toDataURL("image/jpeg",0.55);
      resolve({ n:(file.name||"foto").replace(/\.[^.]+$/,"")+".jpg", t:"image/jpeg", b64:data.split(",")[1] });
    };
    img.onerror=()=>reject(new Error("Imagen inválida"));
    img.src=String(r.result);
  };
  r.onerror=()=>reject(new Error("No se pudo leer el archivo"));
  r.readAsDataURL(file);
});
const verArchivoSocio = (f) => {
  try{
    const bin=atob(f.b64); const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([arr],{type:f.t}));
    window.open(url,"_blank");
  }catch(e){ alert("No se pudo abrir el archivo"); }
};

// ── Panel de SOCIOS NUEVOS (datos + ID y Acuerdo de emprendedor opcionales) ──
function SociosPanel({ socios, setSocios, docsSocios, setDocsSocios, agente }){
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [f,setF]=useState({nombre:"",apellido:"",telefono:"",direccion:"",correo:"",fechaInicio:""});
  const [busca,setBusca]=useState("");
  const [subiendo,setSubiendo]=useState("");
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const abrirNuevo=()=>{ setF({nombre:"",apellido:"",telefono:"",direccion:"",correo:"",fechaInicio:hoyLocal()}); setEditId(null); setShowForm(true); };
  const abrirEditar=(x)=>{ setF({nombre:x.nombre||"",apellido:x.apellido||"",telefono:x.telefono||"",direccion:x.direccion||"",correo:x.correo||"",fechaInicio:x.fechaInicio||""}); setEditId(x.id); setShowForm(true); };
  const guardar=()=>{
    if(!f.nombre.trim()||!f.apellido.trim()){ alert("✍️ Nombre y apellido son obligatorios."); return; }
    if((f.telefono||"").replace(/\D/g,"").length<10){ alert("📞 Teléfono válido (10 dígitos) es obligatorio."); return; }
    if(editId) setSocios(p=>p.map(x=>x.id===editId?{...x,...f}:x));
    else setSocios(p=>[...(p||[]),{id:genId(),...f,registradoPor:agente,creado:new Date().toISOString()}]);
    setShowForm(false);
  };
  const subirDoc=(socioId, slot)=>{
    const inp=document.createElement("input");
    inp.type="file"; inp.accept="image/*,application/pdf";
    inp.onchange=async(e)=>{
      const file=e.target.files?.[0]; if(!file) return;
      setSubiendo(socioId+slot);
      try{
        const comp=await comprimirArchivoSocio(file);
        setDocsSocios(p=>({...(p||{}),[socioId]:{...((p||{})[socioId]||{}),[slot]:comp}}));
      }catch(err){ alert("⚠️ "+(err.message||err)); }
      setSubiendo("");
    };
    inp.click();
  };
  const quitarDoc=(socioId,slot)=>{
    if(!confirm("¿Quitar este archivo?")) return;
    setDocsSocios(p=>{ const d={...(p||{})}; const so={...(d[socioId]||{})}; delete so[slot]; if(Object.keys(so).length) d[socioId]=so; else delete d[socioId]; return d; });
  };
  const lista=(socios||[]).filter(x=>{
    const q=(busca||"").toLowerCase();
    return !q || (x.nombre+" "+x.apellido).toLowerCase().includes(q) || (x.telefono||"").includes(q);
  }).sort((a,b)=>(b.fechaInicio||"").localeCompare(a.fechaInicio||""));
  const SLOTS=[["idDoc","🪪 ID"],["contrato","📜 Acuerdo de emprendedor"]];
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input className={inpLight+" flex-1"} placeholder="Buscar socio…" value={busca} onChange={e=>setBusca(e.target.value)} />
        <button onClick={abrirNuevo} className="px-4 py-2 rounded-lg text-sm font-bold text-white shrink-0" style={{background:RP.navy}}>+ Socio</button>
      </div>
      {lista.length===0 && <div className="text-center py-12 text-slate-400"><div className="mb-3 flex justify-center"><Ico e="🤝" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">Sin socios registrados.</div><div className="text-xs mt-1">Toca "+ Socio" para registrar al primero.</div></div>}
      <div className="space-y-2">
        {lista.map(x=>{
          const docs=(docsSocios||{})[x.id]||{};
          return (
            <div key={x.id} className="bg-white rounded-2xl border border-[#e8edf3] p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#1f2d3d]" style={{fontFamily:SERIF}}><Ico e="🤝" className="mr-1.5" />{x.nombre} {x.apellido}</div>
                  <div className="text-xs text-slate-500 mt-0.5"><Ico e="📞" className="mr-1.5" />{x.telefono||"—"} {x.correo?` · ✉️ ${x.correo}`:""}</div>
                  {x.direccion && <div className="text-xs text-slate-400"><Ico e="📍" className="mr-1.5" />{x.direccion}</div>}
                  {x.fechaInicio && <div className="text-[11px] text-emerald-600 font-bold mt-0.5"><Ico e="🚀" className="mr-1.5" />Inició: {x.fechaInicio}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {(x.telefono||"").replace(/\D/g,"") && <a href={`https://wa.me/${(x.telefono||"").replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg text-white text-sm" style={{background:"#25D366"}}>💬</a>}
                  <button onClick={()=>abrirEditar(x)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f4f6f9] text-sm"><Ico e="✏" /></button>
                  <button onClick={()=>{ if(confirm("¿Eliminar este socio y sus archivos?")){ setSocios(p=>p.filter(y=>y.id!==x.id)); setDocsSocios(p=>{const d={...(p||{})}; delete d[x.id]; return d;}); } }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-sm"><Ico e="🗑" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {SLOTS.map(([slot,label])=>(
                  <div key={slot} className="rounded-xl border border-[#e8edf3] bg-[#fafbfc] p-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">{label} <span className="font-normal normal-case">(opcional)</span></div>
                    {docs[slot] ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={()=>verArchivoSocio(docs[slot])} className="flex-1 text-left text-[11px] font-bold text-[#5b21b6] truncate underline">{docs[slot].n}</button>
                        <button onClick={()=>quitarDoc(x.id,slot)} className="text-red-400 text-xs font-bold px-1"><Ico e="✕" /></button>
                      </div>
                    ) : (
                      <button onClick={()=>subirDoc(x.id,slot)} disabled={subiendo===x.id+slot}
                        className="w-full py-1.5 rounded-lg text-[11px] font-bold border-2 border-dashed border-[#c9b8f0] text-[#5b21b6]">
                        {subiendo===x.id+slot?"Comprimiendo…":<><Ico e="⬆" className="mr-1" />Subir foto o PDF</>}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {showForm && (
        <Modal title={editId?<><Ico e="✏" className="mr-1" />Editar socio</>:<><Ico e="🤝" className="mr-1" />Nuevo socio</>} onClose={()=>setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required><input className={inpLight} value={f.nombre} onChange={e=>set("nombre",e.target.value)} /></Field>
            <Field label="Apellido" required><input className={inpLight} value={f.apellido} onChange={e=>set("apellido",e.target.value)} /></Field>
          </div>
          <Field label="Teléfono" required><input className={inpLight} value={f.telefono} onChange={e=>set("telefono",e.target.value)} inputMode="tel" /></Field>
          <Field label="Dirección"><input className={inpLight} value={f.direccion} onChange={e=>set("direccion",e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Correo electrónico"><input className={inpLight} value={f.correo} onChange={e=>set("correo",e.target.value)} inputMode="email" autoCapitalize="off" /></Field>
            <Field label="Fecha de inicio"><input type="date" className={inpLight} value={f.fechaInicio} onChange={e=>set("fechaInicio",e.target.value)} /></Field>
          </div>
          <div className="text-[11px] text-slate-400 mb-3">El ID y el Acuerdo de emprendedor se suben desde la tarjeta del socio después de guardarlo.</div>
          <button onClick={guardar} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{background:RP.navy}}><Ico e="✅" className="mr-1.5" />Guardar socio</button>
        </Modal>
      )}
    </div>
  );
}

function RecruitmentSection({ reclutamiento, setReclutamiento, agente, notify, rolActivo, setAppts, socios, setSocios, docsSocios, setDocsSocios }) {
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [tab,setTab]=useState("todos"); // todos | entrevistas
  const [form,setForm]=useState({nombre:"",telefono:"",fuente:"",entrevistado:false,resultado:"Pendiente"});
  const [busca,setBusca]=useState("");

  const abrirNuevo=()=>{ setForm({nombre:"",telefono:"",fuente:"",entrevistado:false,resultado:"Pendiente"}); setEditId(null); setShowForm(true); };
  const abrirEditar=(r)=>{ setForm({nombre:r.nombre||"",telefono:r.telefono||"",fuente:r.fuente||"",entrevistado:!!r.entrevistado,resultado:r.resultado||"Pendiente"}); setEditId(r.id); setShowForm(true); };
  const guardar=()=>{
    if(!form.nombre.trim() && soloDigitos(form.telefono).length<10){ alert("📝 Pon al menos un nombre o un teléfono válido (10 dígitos)."); return; }
    const ahora=new Date().toISOString();
    if(editId){
      setReclutamiento(p=>p.map(r=>{
        if(r.id!==editId) return r;
        const patch={...form,actualizado:ahora};
        if(form.entrevistado && !r.entrevistado_fecha) patch.entrevistado_fecha=ahora;
        if(form.resultado==="Nuevo socio" && !r.socio_fecha) patch.socio_fecha=ahora;
        return {...r,...patch};
      }));
    } else {
      const nuevo={id:genId(),...form,creado:ahora};
      if(form.entrevistado) nuevo.entrevistado_fecha=ahora;
      if(form.resultado==="Nuevo socio") nuevo.socio_fecha=ahora;
      setReclutamiento(p=>[nuevo,...p]);
      if(notify) notify("reclutamiento",`🧲 Nuevo prospecto de reclutamiento: ${form.nombre||form.telefono}`,`Fuente: ${form.fuente||"—"}`,"Reclutamiento");
    }
    setShowForm(false); setEditId(null);
  };
  const borrar=(id)=>{ if(window.confirm("¿Eliminar este prospecto de reclutamiento?")) setReclutamiento(p=>p.filter(r=>r.id!==id)); };
  const setCampo=(id,patch)=>setReclutamiento(p=>p.map(r=>r.id===id?{...r,...patch,actualizado:new Date().toISOString()}:r));
  const [agendarPros,setAgendarPros]=useState(null);
  const onAgendarEntrevista=(datos)=>{
    const appt={ id:genId(), tipo:"entrevista", _type:"entrevista", nombre:datos.nombre, telefono:datos.telefono, fecha:datos.fecha, notas:datos.notas, attendees:datos.attendees, agente:agente||"" };
    if(setAppts) setAppts(p=>[appt,...p]);
    if(agendarPros?.id) setCampo(agendarPros.id,{ entrevista_agendada:datos.fecha });
    try{ window.open(gcalLink(appt),"_blank"); }catch(e){}
    if(notify) notify("reclutamiento",`🤝 Entrevista agendada: ${datos.nombre||datos.telefono}`,`📅 ${new Date(datos.fecha).toLocaleString("es")}`,"Reclutamiento");
    setAgendarPros(null);
  };

  const q=(busca||"").toLowerCase().trim(); const qNum=soloDigitos(busca);
  const lista=(reclutamiento||[]).filter(r=>{
    if(!q) return true;
    const nombre=(r.nombre||"").toLowerCase();
    const fuente=(r.fuente||"").toLowerCase();
    const tel=soloDigitos(r.telefono);
    return nombre.includes(q)||fuente.includes(q)||(qNum.length>=3 && tel.includes(qNum));
  });

  // ── Estadísticas (esta semana / este mes) ──
  const _now=new Date();
  const _inicioSemana=(()=>{ const d=new Date(_now); const dia=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-dia); return d; })();
  const _inicioMes=new Date(_now.getFullYear(), _now.getMonth(), 1);
  const _enRango=(iso,desde)=>{ if(!iso) return false; const t=new Date(iso); return !isNaN(t.getTime()) && t>=desde; };
  const _arr=reclutamiento||[];
  const stats={
    entSemana:_arr.filter(r=>r.entrevistado && _enRango(r.entrevistado_fecha,_inicioSemana)).length,
    entMes:_arr.filter(r=>r.entrevistado && _enRango(r.entrevistado_fecha,_inicioMes)).length,
    prosSemana:_arr.filter(r=>_enRango(r.creado,_inicioSemana)).length,
    prosMes:_arr.filter(r=>_enRango(r.creado,_inicioMes)).length,
    sociosSemana:_arr.filter(r=>r.resultado==="Nuevo socio" && _enRango(r.socio_fecha,_inicioSemana)).length,
    sociosMes:_arr.filter(r=>r.resultado==="Nuevo socio" && _enRango(r.socio_fecha,_inicioMes)).length,
  };

  return (
    <div className="space-y-4">
      {/* Panel de estadísticas */}
      <div className="bg-white rounded-2xl border border-[#e8edf3] p-4 shadow-sm">
        <div className="text-sm font-bold text-[#1f2d3d] mb-3"><Ico e="📊" className="mr-1.5" />Estadísticas de reclutamiento</div>
        <div className="grid grid-cols-3 gap-2">
          <ReclStat label="Entrevistas" semana={stats.entSemana} mes={stats.entMes} />
          <ReclStat label="Prospectos nuevos" semana={stats.prosSemana} mes={stats.prosMes} />
          <ReclStat label="Nuevos socios" semana={stats.sociosSemana} mes={stats.sociosMes} />
        </div>
      </div>

      {/* Pestañas: Todos / Entrevistas */}
      <div className="flex gap-1.5">
        {[{id:"todos",ico:"🧲", label:"Todos",n:(reclutamiento||[]).length},{id:"entrevistas",ico:"🤝", label:"Entrevistas",n:(reclutamiento||[]).filter(r=>r.entrevista_agendada).length},{id:"socios",ico:"⭐", label:"Socios",n:(socios||[]).length}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 ${tab===t.id?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
            style={tab===t.id?{background:RP.navy}:{}}>
            {t.label}<span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab===t.id?"bg-white/25":"bg-white"}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {tab!=="socios" && <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500 font-bold">{(reclutamiento||[]).length} prospecto(s) de reclutamiento</div>
        <button onClick={abrirNuevo} className="text-sm font-bold text-white px-4 py-2 rounded-xl" style={{background:RP.navy}}>+ Nuevo</button>
      </div>}

      {tab!=="socios" && <input className={inpLight} placeholder="Buscar por nombre o teléfono…" name="buscar-reclu" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={busca} onChange={e=>setBusca(e.target.value)} />}

      {showForm && (
        <div className="bg-white rounded-2xl border border-[#e8edf3] p-4 shadow-sm space-y-2.5">
          <Field label="Nombre"><input className={inpLight} value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del prospecto" /></Field>
          <Field label="Teléfono"><input className={inpLight} value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="Teléfono" /></Field>
          <Field label="Fuente"><input className={inpLight} value={form.fuente} onChange={e=>setForm(f=>({...f,fuente:e.target.value}))} placeholder="ej. Facebook, referido, volante…" /></Field>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>setForm(f=>({...f,entrevistado:!f.entrevistado}))} className={`px-3 py-2 rounded-lg text-sm font-bold border-2 ${form.entrevistado?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-[#e5def4] text-slate-500"}`}>{form.entrevistado?<><Ico e="✅" className="mr-1" />Entrevistado</>:"¿Ya fue entrevistado?"}</button>
          </div>
          <Field label="Resultado de entrevista">
            <div className="grid grid-cols-2 gap-1.5">
              {RECLU_RESULTADOS.map(r=>(
                <button key={r} type="button" onClick={()=>setForm(f=>({...f,resultado:r}))} className={`px-2 py-2 rounded-lg text-[11px] font-bold border-2 ${form.resultado===r?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-500"}`}>{r}</button>
              ))}
            </div>
          </Field>
          <div className="flex gap-2">
            <button onClick={guardar} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:"#16a34a"}}>{editId?<><Ico e="💾" className="mr-1" />Guardar</>:<><Ico e="✅" className="mr-1" />Agregar</>}</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-[#f4f6f9] border border-[#e5def4]">Cancelar</button>
          </div>
        </div>
      )}

      {(() => {
        if(tab==="socios") return <SociosPanel socios={socios} setSocios={setSocios} docsSocios={docsSocios} setDocsSocios={setDocsSocios} agente={agente} />;
        const listaMostrar = tab==="entrevistas" ? lista.filter(r=>r.entrevista_agendada) : lista;
        if(listaMostrar.length===0) return (
          <div className="text-center py-12 text-slate-400"><div className="mb-3 flex justify-center"><Ico e={tab==="entrevistas"?"🤝":"🧲"} size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">{tab==="entrevistas"?"Sin entrevistas agendadas.":"Sin prospectos de reclutamiento."}</div><div className="text-xs mt-1">{tab==="entrevistas"?"Agenda una entrevista desde un prospecto en \"Todos\".":"Toca \"+ Nuevo\" para agregar el primero."}</div></div>
        );
        return listaMostrar.map(r=><RecruitCard key={r.id} r={r} onUpdate={setCampo} onEdit={abrirEditar} onDelete={borrar} onAgendar={setAgendarPros} />);
      })()}
      {agendarPros && <EntrevistaModal prospecto={agendarPros} agente={agente} onSave={onAgendarEntrevista} onClose={()=>setAgendarPros(null)} />}
    </div>
  );
}

// ─── CONTROL DE ACTIVIDAD (semana / mes) ──────────────────────
function ControlActividad({ allData, appts, reclutamiento, cierres, onGuardarCierre }){
  const ahora = new Date();
  const lunes = lunesDeLaSemana(ahora);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate()+6); domingo.setHours(23,59,59,999);
  const mesKey = ahora.toISOString().slice(0,7);
  const enSemana = (f)=>{ if(!f) return false; const d=new Date(f); return d>=lunes && d<=domingo; };
  const enMes = (f)=>{ if(!f) return false; return String(f).slice(0,7)===mesKey; };

  const aps = appts||[];
  const refs = allData.referidos||[];
  // Clientes con historial (agregados + prospección + distribución + anfitriones + referidos anidados)
  const clientesHist = [
    ...(allData.agregados||[]),
    ...(allData.prospectos||[]),
    ...(allData.distribucion||[]),
    ...refs,
    ...refs.flatMap(anf=>anf.referidos||[]),
  ];

  const calc = (enP)=>{
    // Citas / entrevistas (por fecha agendada, dentro del periodo)
    const citas = aps.filter(a=>(a.tipo==="cita"||a._type==="cita") && enP(a.fecha)).length;
    // Entrevistas de reclutamiento: Invitados = agendadas · Entrevistas = marcadas "entrevistado"
    const invitados = aps.filter(a=>(a.tipo==="entrevista"||a._type==="entrevista") && enP(a.fecha)).length;
    const entrevistas = (reclutamiento||[]).filter(r=>(r.entrevista_resultado==="entrevistado"||r.entrevistado) && enP(r.entrevista_agendada||r.entrevistado_fecha||r.creado)).length;
    // Servicios realizados (por fecha del servicio)
    const servicios = aps.filter(a=>(a.tipo==="servicio"||a._type==="servicio") && a.servicioResultado==="realizado" && enP(a.fecha)).length;
    // Demos / ventas / volumen — función central (misma que Estadísticas e Incentivos)
    const _vd = contarVentasDemos({ appts:aps, clientes:clientesHist, enP });
    const demos=_vd.demos, ventas=_vd.ventas, volumen=_vd.volumen;
    // Datos (cada referido cuenta, sin contar al anfitrión) por fecha de subida
    let datos = 0;
    datos += (allData.agregados||[]).filter(c=>!c.eliminado && enP(c.creado)).length;
    datos += (allData.prospectos||[]).filter(c=>!c.eliminado && enP(c.creado)).length;
    datos += (allData.distribucion||[]).filter(c=>!c.eliminado && enP(c.creado)).length;
    refs.forEach(anf=>{ if(!anf.eliminado)(anf.referidos||[]).forEach(r=>{ if(enP(r.creado||anf.creado)) datos++; }); });
    // Prospectos socio (Reclutamiento) por fecha de subida
    const prospectosSocio = (reclutamiento||[]).filter(r=>enP(r.creado)).length;
    // Socio nuevo (Reclutamiento marcado "Nuevo socio") por fecha
    const socioNuevo = (reclutamiento||[]).filter(r=>r.resultado==="Nuevo socio" && enP(r.socio_fecha||r.creado)).length;
    return { citas, demos, ventas, volumen, servicios, datos, prospectosSocio, invitados, entrevistas, socioNuevo };
  };

  const sem = calc(enSemana);
  const mes = calc(enMes);

  const METRICAS = [
    {key:"citas", icon:"📅", label:"Citas"},
    {key:"demos", icon:"🎬", label:"Demostraciones"},
    {key:"ventas", icon:"💰", label:"Ventas"},
    {key:"volumen", icon:"💵", label:"Volumen de venta", money:true},
    {key:"servicios", icon:"🔧", label:"Servicios"},
    {key:"datos", icon:"📇", label:"Datos"},
    {key:"prospectosSocio", icon:"🧲", label:"Prospectos socio"},
    {key:"invitados", icon:"📨", label:"Invitados"},
    {key:"entrevistas", icon:"🤝", label:"Entrevistas"},
    {key:"socioNuevo", icon:"🌟", label:"Socio nuevo"},
  ];
  const fmt = (m,money)=> money ? `$${(Number(m)||0).toLocaleString("en-US")}` : (Number(m)||0).toLocaleString("en-US");
  const rangoSemana = `${lunes.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} – ${domingo.toLocaleDateString("es-MX",{day:"numeric",month:"short"})}`;
  const rangoMes = ahora.toLocaleDateString("es-MX",{month:"long",year:"numeric"});

  // ── HISTÓRICO ANUAL (mes a mes) + cierre de año ──
  const [vista,setVista]=useState("resumen"); // resumen | historico
  const añoActual=ahora.getFullYear();
  const [yearSel,setYearSel]=useState(añoActual);
  const computeMeses=(Y)=>{
    const out=[];
    for(let m=1;m<=12;m++){
      const mm=String(m).padStart(2,"0");
      const d=calc((f)=>f && String(f).slice(0,7)===`${Y}-${mm}`);
      if(d.citas||d.demos||d.ventas||d.volumen||d.servicios||d.datos||d.prospectosSocio||d.invitados||d.entrevistas||d.socioNuevo)
        out.push({ mes:`${Y}-${mm}`, label:new Date(Y,m-1,1).toLocaleDateString("es-MX",{month:"long"}), ...d });
    }
    return out;
  };
  const computeTotal=(Y)=>calc((f)=>f && String(f).slice(0,4)===String(Y));
  const añosSet=new Set([añoActual]);
  (appts||[]).forEach(a=>{ if(a.fecha) añosSet.add(+String(a.fecha).slice(0,4)); });
  (reclutamiento||[]).forEach(r=>{ if(r.creado) añosSet.add(+String(r.creado).slice(0,4)); });
  ["agregados","prospectos","distribucion"].forEach(g=>(allData[g]||[]).forEach(c=>{ if(c.creado) añosSet.add(+String(c.creado).slice(0,4)); }));
  (cierres||[]).forEach(c=>añosSet.add(c.año));
  const años=[...añosSet].filter(y=>y>2000 && y<2100).sort((a,b)=>b-a);
  const cierreSel=(cierres||[]).find(c=>c.año===yearSel);
  const mesesDelAño = cierreSel ? (cierreSel.meses||[]) : computeMeses(yearSel);
  const totalDelAño = cierreSel ? (cierreSel.total||{}) : computeTotal(yearSel);
  const recordarCierre = ahora.getMonth()===11 || ahora.getMonth()===0; // diciembre o enero

  const exportarPDF=(Y, meses, total)=>{
    const cols=METRICAS;
    const head=cols.map(m=>`<th>${m.label}</th>`).join("");
    const filas=(meses||[]).map(me=>`<tr><td style="text-transform:capitalize;font-weight:700">${me.label||me.mes}</td>${cols.map(m=>`<td style="text-align:right">${fmt(me[m.key],m.money)}</td>`).join("")}</tr>`).join("");
    const totalRow=`<tr style="font-weight:800;background:#f1ecfd"><td>TOTAL ${Y}</td>${cols.map(m=>`<td style="text-align:right">${fmt((total||{})[m.key],m.money)}</td>`).join("")}</tr>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Control de actividad ${Y}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:0;padding:18px;color:#1f2d3d}h1{font-size:20px;margin:0 0 4px}.sub{color:#64748b;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #e5def4;padding:6px 8px}th{background:#5b21b6;color:#fff;text-align:left}td:first-child,th:first-child{text-align:left}tr:nth-child(even) td{background:#faf8ff}.noprint{position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:9}@media print{.noprint{display:none}}@page{size:A4 landscape;margin:12mm}</style></head><body><div class="noprint"><button onclick="window.print()" style="background:#5b21b6;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">🖨️ Guardar PDF</button><button onclick="window.close()" style="background:#e2e8f0;color:#475569;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer">✕ Cerrar</button></div><h1>📈 Control de actividad — ${Y}</h1><div class="sub">Impact Enterprises · generado ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</div><table><thead><tr><th>Mes</th>${head}</tr></thead><tbody>${filas||`<tr><td colspan="${cols.length+1}" style="text-align:center;color:#94a3b8">Sin actividad registrada en ${Y}</td></tr>`}${totalRow}</tbody></table></body></html>`;
    try{
      const blob=new Blob([html],{type:"text/html"});
      const url=URL.createObjectURL(blob);
      const w=window.open(url,"_blank");
      if(!w){ const a=document.createElement("a"); a.href=url; a.download=`ControlActividad_${Y}.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){ alert("No se pudo generar el PDF: "+((e&&e.message)||e)); }
  };
  const cerrarAño=(Y)=>{
    const meses=computeMeses(Y), total=computeTotal(Y);
    if(!window.confirm(`📄 Antes de cerrar ${Y}, te recomiendo exportar el PDF para guardar tus números.\n\n¿Generar el PDF y guardar el cierre de ${Y}? Quedará disponible siempre en "Años cerrados".`)) return;
    exportarPDF(Y, meses, total);
    if(onGuardarCierre) onGuardarCierre({ id:genId(), año:Y, fecha:new Date().toISOString(), total, meses });
    setTimeout(()=>alert(`✅ Cierre de ${Y} guardado.`), 400);
  };

  const Col = ({titulo, sub, datos:d, accent}) => (
    <div className="flex-1 min-w-0 bg-white rounded-2xl border border-[#e5def4] shadow-sm overflow-hidden">
      <div className="px-3 py-3 text-white" style={{background:accent}}>
        <div className="text-sm font-extrabold leading-tight">{titulo}</div>
        <div className="text-[11px] opacity-90 capitalize">{sub}</div>
      </div>
      <div className="divide-y divide-[#f0ecf9]">
        {METRICAS.map(m=>(
          <div key={m.key} className="flex items-center gap-1.5 px-2.5 py-2.5">
            <span className="w-5 flex items-center justify-center shrink-0">{<Ico e={m.icon} size={15} />}</span>
            <span className="text-[11px] text-slate-500 flex-1 min-w-0 leading-tight">{m.label}</span>
            <span className="text-sm font-extrabold text-[#1f2d3d] shrink-0">{fmt(d[m.key], m.money)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-3 py-4">
      <div className="mb-3">
        <h2 className="text-lg font-extrabold text-[#1f2d3d]"><Ico e="📈" className="mr-1.5" />Control de actividad</h2>
        <p className="text-xs text-slate-400">Totales del distribuidor · se actualiza solo</p>
      </div>

      {/* Toggle Resumen / Histórico */}
      <div className="flex gap-1.5 mb-4">
        <button onClick={()=>setVista("resumen")} className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition ${vista==="resumen"?"text-white":"text-slate-600 bg-[#f4f6f9]"}`} style={vista==="resumen"?{background:RP.navy}:{}}><Ico e="📊" className="mr-1.5" />Resumen</button>
        <button onClick={()=>setVista("historico")} className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold transition ${vista==="historico"?"text-white":"text-slate-600 bg-[#f4f6f9]"}`} style={vista==="historico"?{background:RP.navy}:{}}><Ico e="📅" className="mr-1.5" />Histórico</button>
      </div>

      {vista==="resumen" && (
        <>
          <div className="flex gap-2.5">
            <Col titulo="📅 Esta semana" sub={rangoSemana} datos={sem} accent="#5b21b6" />
            <Col titulo="🗓️ Este mes" sub={rangoMes} datos={mes} accent="#7c3aed" />
          </div>
          <p className="text-[10px] text-slate-300 mt-3 text-center">Citas y entrevistas se cuentan por fecha agendada · datos/prospectos por fecha de subida · ventas por fecha de la cita</p>
        </>
      )}

      {vista==="historico" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select value={yearSel} onChange={e=>setYearSel(+e.target.value)} className="flex-1 border-2 border-[#e5def4] rounded-lg px-3 py-2 text-sm bg-white font-bold">
              {años.map(y=><option key={y} value={y}>Año {y}{(cierres||[]).some(c=>c.año===y)?" 🔒 cerrado":""}</option>)}
            </select>
            <button onClick={()=>exportarPDF(yearSel, mesesDelAño, totalDelAño)} className="px-3 py-2 rounded-lg text-sm font-bold text-white shrink-0" style={{background:RP.blue}}><Ico e="📄" className="mr-1.5" />PDF</button>
          </div>

          <div className="bg-white rounded-2xl border border-[#e5def4] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-white" style={{background:RP.navy}}>
                    <th className="px-2 py-2 text-left font-bold sticky left-0" style={{background:RP.navy}}>Mes</th>
                    {METRICAS.map(m=><th key={m.key} className="px-2 py-2 text-center font-bold whitespace-nowrap" title={m.label}><Ico e={m.icon} size={15} className="mx-auto" /></th>)}
                  </tr>
                </thead>
                <tbody>
                  {mesesDelAño.length===0
                    ? <tr><td colSpan={METRICAS.length+1} className="px-3 py-6 text-center text-slate-400">Sin actividad registrada en {yearSel}</td></tr>
                    : mesesDelAño.map(me=>(
                      <tr key={me.mes} className="border-t border-[#f0ecf9]">
                        <td className="px-2 py-2 font-bold text-slate-700 capitalize sticky left-0 bg-white whitespace-nowrap">{me.label}</td>
                        {METRICAS.map(m=><td key={m.key} className="px-2 py-2 text-right text-slate-600 whitespace-nowrap">{fmt(me[m.key],m.money)}</td>)}
                      </tr>
                    ))}
                  <tr className="border-t-2 border-[#ddd1f7]" style={{background:"#f1ecfd"}}>
                    <td className="px-2 py-2 font-black text-[#5b21b6] sticky left-0 whitespace-nowrap" style={{background:"#f1ecfd"}}>TOTAL {yearSel}</td>
                    {METRICAS.map(m=><td key={m.key} className="px-2 py-2 text-right font-black text-[#5b21b6] whitespace-nowrap">{fmt(totalDelAño[m.key],m.money)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] text-slate-400 leading-relaxed">{METRICAS.map(m=>(<span key={m.key} className="inline-flex items-center gap-1"><Ico e={m.icon} size={12} />{m.label}</span>))}</div>

          {!cierreSel
            ? <button onClick={()=>cerrarAño(yearSel)} className={`w-full px-4 py-3 rounded-xl text-sm font-bold text-white ${recordarCierre?"animate-pulse":""}`} style={{background:recordarCierre?"#b45309":"#475569"}}><Ico e="🔒" className="mr-1.5" />Cerrar {yearSel} y exportar PDF</button>
            : <div className="text-center text-xs text-slate-400"><Ico e="🔒" className="mr-1.5" />{yearSel} ya está cerrado · {new Date(cierreSel.fecha).toLocaleDateString("es-MX")}</div>}
          {recordarCierre && !cierreSel && <p className="text-[11px] text-amber-700 text-center font-bold"><Ico e="📅" className="mr-1.5" />Es fin/inicio de año — buen momento para cerrar y guardar tus números en PDF.</p>}
          <p className="text-[10px] text-slate-300 text-center">El histórico se calcula solo de todos tus datos. Al cerrar un año, queda guardado aunque limpies datos después.</p>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// COBRANZA — módulo integrado (clientes sincronizados con Distribución)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ── MÓDULO COBRANZA (encapsulado — sin dependencias externas) ──
// ═══════════════════════════════════════════════════════════════
// Cobranza modularizada en src/modules/collections/CobranzaSection.tsx



/* ══════════════════════════════════════════════════════════════════
   MÓDULO CATÁLOGO RP — Buscador de Códigos + Simulador de Compra
   Catálogo fusionado: Excel 2026 (485) + app web v8 (30 extra) = 515 productos.
   Datos 100% estáticos (no tocan Firebase). Sin precios (decisión de Tomas).
   ══════════════════════════════════════════════════════════════════ */
// Catálogo modularizado en src/modules/catalog/CatalogModule.tsx


const NAV=[{id:"inicio",icon:"▦",label:"Centro de mando"},{id:"llamadas",icon:"📞",label:"Llamadas"},{id:"agenda",icon:"📅",label:"Agenda"},{id:"servicio",icon:"🔧",label:"Servicios"},{id:"agregados",icon:"📂",label:"Agregados"},{id:"referidos",icon:"🎁",label:"Referidos"},{id:"prospectos",icon:"🔍",label:"Prospección"},{id:"distribucion",icon:"🏠",label:"Distribución"},{id:"reclutamiento",icon:"🧲",label:"Reclutamiento"},{id:"cobranza",icon:"💵",label:"Cobranza"},{id:"catalogo",icon:"🔎",label:"Buscador de Códigos"},{id:"simulador",icon:"🧮",label:"Simulador de Compra"},{id:"rutas",icon:"🗺️",label:"Rutas"},{id:"cumpleanos",icon:"🎂",label:"Cumpleaños"},{id:"incentivo",icon:"🏆",label:"Incentivos"},{id:"control",icon:"📈",label:"Control de actividad"},{id:"stats",icon:"📊",label:"Estadísticas"},{id:"config",icon:"⚙️",label:"Configuración"}];

// Las 4 secciones que se agrupan bajo la pestaña desplegable "Base de datos"
const DB_TABS=["agregados","referidos","prospectos","distribucion"];

// ─── MODAL DE REVISIÓN EDITABLE DE REFERIDOS ──────────────────
function RefReviewModal({ records, onSave, onClose }) {
  const [items,setItems]=useState(()=>records.map(r=>({
    id: genId(),
    anfitrion: r.anfitrion||"",
    regalo: r.regalo||"",
    anfitrion_telefono: r.anfitrion_telefono||"",
    anfitrion_ciudad: r.anfitrion_ciudad||"",
    anfitrion_cuenta: r.anfitrion_cuenta||"",
    anfitrion_detalle: r.anfitrion_detalle||"",
    estado:"sin_estado", venta:false, creado:new Date().toISOString(),
    referidos:(r.referidos||[]).map(x=>({nombre:x.nombre||"",parentesco:x.parentesco||"",telefono:x.telefono||"",direccion:x.direccion||"",producto:x.producto||"",observaciones:x.observaciones||"",detalles:"",estado:"sin_estado",historial:[]})),
  })));

  const setAnf=(ai,patch)=>setItems(p=>p.map((a,i)=>i===ai?{...a,...patch}:a));
  const setRef=(ai,ri,patch)=>setItems(p=>p.map((a,i)=>i!==ai?a:{...a,referidos:a.referidos.map((r,j)=>j===ri?{...r,...patch}:r)}));
  const addRef=(ai)=>setItems(p=>p.map((a,i)=>i!==ai?a:{...a,referidos:[...a.referidos,{nombre:"",parentesco:"",telefono:"",direccion:"",producto:"",observaciones:"",detalles:"",estado:"sin_estado",historial:[]}]}));
  const delRef=(ai,ri)=>setItems(p=>p.map((a,i)=>i!==ai?a:{...a,referidos:a.referidos.filter((_,j)=>j!==ri)}));
  const delAnf=(ai)=>setItems(p=>p.filter((_,i)=>i!==ai));

  const totalRefs=items.reduce((a,anf)=>a+anf.referidos.length,0);
  const inp="w-full border border-[#e5def4] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-[#5b21b6]";

  return (
    <Modal title="🎁 Revisar referidos antes de guardar" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-[#5b21b6]/8 border border-[#5b21b6]/15 text-sm text-[#5b21b6]">
          La IA extrajo <strong>{items.length} anfitrión(es)</strong> con <strong>{totalRefs} referido(s)</strong>. Revisa y edita lo que necesites antes de guardar.
        </div>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {items.map((anf,ai)=>(
            <div key={anf.id} className="border-2 border-[#e8edf3] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider"><Ico e="🏠" className="mr-1.5" />Anfitrión {ai+1}</span>
                <button onClick={()=>delAnf(ai)} className="text-xs text-red-500 font-bold"><Ico e="🗑" className="mr-1.5" />Quitar</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="col-span-2"><input className={inp} placeholder="Nombre del anfitrión" value={anf.anfitrion} onChange={e=>setAnf(ai,{anfitrion:e.target.value})} /></div>
                <input className={inp} placeholder="Regalo prometido" value={anf.regalo} onChange={e=>setAnf(ai,{regalo:e.target.value})} />
                <input className={inp} placeholder="Teléfono" value={anf.anfitrion_telefono} onChange={e=>setAnf(ai,{anfitrion_telefono:e.target.value})} />
                <input className={inp} placeholder="Ciudad" value={anf.anfitrion_ciudad} onChange={e=>setAnf(ai,{anfitrion_ciudad:e.target.value})} />
                <input className={inp} placeholder="Cuenta" value={anf.anfitrion_cuenta} onChange={e=>setAnf(ai,{anfitrion_cuenta:e.target.value})} />
              </div>

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 mt-3"><Ico e="👥" className="mr-1.5" />Referidos</div>
              <div className="space-y-2">
                {anf.referidos.map((r,ri)=>(
                  <div key={ri} className="bg-[#f4f6f9] rounded-lg p-2 relative">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input className={inp} placeholder="Nombre" value={r.nombre} onChange={e=>setRef(ai,ri,{nombre:e.target.value})} />
                      <input className={inp} placeholder="Parentesco" value={r.parentesco} onChange={e=>setRef(ai,ri,{parentesco:e.target.value})} />
                      <input className={inp} placeholder="Teléfono" value={r.telefono} onChange={e=>setRef(ai,ri,{telefono:e.target.value})} />
                      <input className={inp} placeholder="Producto interés" value={r.producto} onChange={e=>setRef(ai,ri,{producto:e.target.value})} />
                      <div className="col-span-2"><input className={inp} placeholder="Dirección" value={r.direccion} onChange={e=>setRef(ai,ri,{direccion:e.target.value})} /></div>
                    </div>
                    <button onClick={()=>delRef(ai,ri)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"><Ico e="✕" /></button>
                  </div>
                ))}
                <button onClick={()=>addRef(ai)} className="text-xs text-[#7c3aed] font-bold hover:underline">+ Agregar referido a este anfitrión</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={()=>onSave(items)} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:RP.navy}}>
            <Ico e="✅" className="mr-1.5" />Guardar {items.length} anfitrión(es) · {totalRefs} referido(s)
          </button>
          <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-[#f4f6f9]">
            Cancelar — no guardar nada
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── CUMPLEAÑOS ───────────────────────────────────────────────
// Mensaje de felicitación: editable en Configuración → 🎂 Mensaje de cumpleaños.
// {nombre} se reemplaza por el primer nombre del cumpleañero.
const CUMPLE_MSG_DEFAULT = `¡Feliz cumpleaños, {nombre}! 🎉🎂\n\nDe parte de todo el equipo de Royal Prestige queremos desearte un día maravilloso, lleno de alegría, salud y muchas bendiciones. 🥳✨\n\nY porque hoy es tu día, queremos consentirte con un obsequio totalmente gratis por tu cumpleaños 🎁\n\nPara reclamarlo, solo responde este mensaje con:\n“Me lo merezco” 😍🎉`;
let CUMPLE_MSG_TPL = CUMPLE_MSG_DEFAULT;
function setCumpleMsgTpl(t){ CUMPLE_MSG_TPL = (t && String(t).trim()) ? String(t) : CUMPLE_MSG_DEFAULT; }
const cumpleMsg = (nombre) => {
  const primer = (nombre||"").split(" ")[0] || nombre || "";
  return encodeURIComponent(CUMPLE_MSG_TPL.split("{nombre}").join(primer));
};
const waLinkMsg = (n, nombre) => waLink(n) + "?text=" + cumpleMsg(nombre);
const smsLinkMsg = (n, nombre) => "sms:" + soloDigitos(n) + "&body=" + cumpleMsg(nombre);
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function CumpleSection({ cumpleanos, setCumple, allData, agente, notify, puedeImportar }) {
  const [showForm,setShowForm]=useState(false);
  const [showAI,setShowAI]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const hoy=new Date(); const mesActual=hoy.getMonth(); const diaActual=hoy.getDate();
  const [mesVer,setMesVer]=useState(mesActual);

  // Toda la base de datos junta (agregados + prospección + distribución + referidos)
  const baseCompleta=[
    ...(allData?.agregados||[]),
    ...(allData?.prospectos||[]),
    ...(allData?.distribucion||[]),
    ...((allData?.referidos||[]).flatMap(anf=>(anf.referidos||[]))),
  ].filter(c=>!c.eliminado);

  // Normalizar para comparar (sin acentos, minúsculas, sin espacios extra)
  const normNombre=(s)=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
  const normCuenta=(s)=>(s||"").toString().toLowerCase().replace(/[^a-z0-9]/g,"").trim();

  // Buscar teléfono en toda la base por nombre O número de cuenta
  const buscarTelefono=(nombre,cuenta)=>{
    const nN=normNombre(nombre), nC=normCuenta(cuenta);
    // 1) Match por cuenta (más confiable)
    if(nC){
      const porCuenta=baseCompleta.find(c=>c.cuenta && normCuenta(c.cuenta)===nC && c.telefono);
      if(porCuenta) return porCuenta.telefono;
    }
    // 2) Match por nombre
    if(nN){
      const porNombre=baseCompleta.find(c=>normNombre(c.nombre)===nN && c.telefono);
      if(porNombre) return porNombre.telefono;
    }
    return "";
  };

  // Cumpleaños de la base (distribución + agregados con fecha_cumple)
  const desdeBase=baseCompleta
    .filter(c=>c.fecha_cumple)
    .map(c=>({ id:"base::"+c.id, nombre:c.nombre, telefono:c.telefono, cuenta:c.cuenta, fecha_cumple:c.fecha_cumple, origen:"base" }));

  // Para los manuales: si NO tiene teléfono, buscarlo en toda la base por nombre/cuenta
  const manuales=(cumpleanos||[]).map(c=>{
    let tel=c.telefono;
    if(!tel || !tel.replace(/[^0-9]/g,"")){
      tel=buscarTelefono(c.nombre, c.cuenta) || tel;
    }
    return {...c, telefono:tel, origen:"manual"};
  });
  // Evitar duplicados por teléfono
  const telsManuales=new Set(manuales.map(c=>(c.telefono||"").replace(/[^0-9]/g,"")).filter(Boolean));
  const todos=[...manuales, ...desdeBase.filter(c=>{
    const t=(c.telefono||"").replace(/[^0-9]/g,"");
    return !t || !telsManuales.has(t);
  })];

  // Parsear fecha_cumple "MM-DD" o "YYYY-MM-DD" o "DD/MM"
  const parseMesDia=(fc)=>{
    if(!fc) return null;
    let m,d;
    if(/^\d{4}-\d{2}-\d{2}$/.test(fc)){ const p=fc.split("-"); m=+p[1]-1; d=+p[2]; }
    else if(/^\d{1,2}-\d{1,2}$/.test(fc)){ const p=fc.split("-"); m=+p[0]-1; d=+p[1]; }
    else if(/^\d{1,2}\/\d{1,2}$/.test(fc)){ const p=fc.split("/"); m=+p[0]-1; d=+p[1]; }
    else return null;
    return {mes:m, dia:d};
  };

  // Agrupar por mes
  const conMesDia=todos.map(c=>({...c, md:parseMesDia(c.fecha_cumple)})).filter(c=>c.md);
  const cumpleHoy=conMesDia.filter(c=>c.md.mes===mesActual && c.md.dia===diaActual);
  // Conteo por mes (para el selector)
  const conteoPorMes={}; conMesDia.forEach(c=>{ conteoPorMes[c.md.mes]=(conteoPorMes[c.md.mes]||0)+1; });

  const fmtFecha=(md)=> `${md.dia} de ${MESES[md.mes]}`;

  const eliminar=(c)=>{
    if(c.origen==="base"){ alert("Este cumpleaños viene de tu base de datos (Agregados/Distribución/etc). Edítalo o quítale la fecha desde su sección original."); return; }
    if(!confirm("¿Eliminar este cumpleaños?")) return;
    setCumple(p=>p.filter(x=>x.id!==c.id));
  };

  const guardar=(item)=>{
    if(editItem && editItem.id){
      // Editar un manual existente
      setCumple(p=>p.map(x=>x.id===editItem.id?{...item,id:editItem.id}:x));
    } else {
      // Nuevo manual (o edición de uno que venía de "base" → se guarda como manual)
      setCumple(p=>[{...item,id:genId()},...p]);
    }
    setShowForm(false); setEditItem(null);
  };

  // Editar un cumpleañero (manual edita directo; base crea copia manual editable)
  const editar=(c)=>{
    setEditItem({
      id: c.origen==="manual" ? c.id : null,  // si es base, se guarda como nuevo manual
      nombre: c.nombre||"",
      telefono: c.telefono||"",
      cuenta: c.cuenta||"",
      fecha_cumple: c.fecha_cumple||"",
    });
    setShowForm(true);
  };

  const Card=({c})=>(
    <div className="flex items-center justify-between gap-2 py-3 border-b border-[#f4f6f9] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm text-[#1f2d3d] truncate">{c.nombre}{c.origen==="base"&&<span className="ml-1.5 text-[9px] bg-[#5b21b6]/10 text-[#5b21b6] px-1 py-0.5 rounded font-bold">BASE</span>}</div>
        <div className="text-xs text-slate-400">{c.md?fmtFecha(c.md):c.fecha_cumple} · {c.telefono||"⚠️ sin teléfono"}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {c.telefono && <a href={waLinkMsg(c.telefono,c.nombre)} target="_blank" rel="noreferrer" className="text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{background:"#25D366"}}><Ico e="💬" className="mr-1.5" />WA</a>}
        {c.telefono && <a href={smsLinkMsg(c.telefono,c.nombre)} className="text-[#5b21b6] text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-[#e5def4]">SMS</a>}
        {c.telefono && <a href={telLink(c.telefono)} className="text-[11px] px-2 py-1.5 rounded-lg border border-[#e5def4]"><Ico e="📞" /></a>}
        <button onClick={()=>editar(c)} className="text-[#7c3aed] text-[11px] px-2 py-1.5 rounded-lg border border-[#e5def4]"><Ico e="✏" /></button>
        <button onClick={()=>eliminar(c)} className="text-red-400 text-[11px] px-2 py-1.5 rounded-lg border border-red-100"><Ico e="🗑" /></button>
      </div>
    </div>
  );

  // Mes seleccionado para ver (por defecto el actual)
  const cumpleDelMes=conMesDia.filter(c=>c.md.mes===mesVer).sort((a,b)=>a.md.dia-b.md.dia);
  const sinTelefono=cumpleDelMes.filter(c=>!c.telefono).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>Cumpleaños</h2>
        <div className="flex gap-2 mt-3">
          {puedeImportar && <button onClick={()=>setShowAI(true)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{background:RP.navy}}><Ico e="📤" className="mr-1.5" />Importar reporte</button>}
          <button onClick={()=>{setEditItem(null);setShowForm(true);}} className="px-4 py-2.5 rounded-lg text-sm font-bold border-2 border-[#5b21b6] text-[#5b21b6]">+ Agregar</button>
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">Sube cada mes el reporte de cumpleaños (foto o PDF) y la app sincroniza el teléfono con tu base de datos (Agregados, Distribución, etc.) por nombre o cuenta. Te avisa <strong>2 días antes</strong> y <strong>el día</strong> para felicitar. Los cumpleaños se guardan mes a mes.</p>
      </div>

      {/* HOY CUMPLEN — siempre visible arriba */}
      {cumpleHoy.length>0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-[#16a34a]">
          <div className="text-sm font-black text-[#16a34a] uppercase tracking-wide mb-1"><Ico e="🎉" className="mr-1.5" />¡Hoy cumplen! ({cumpleHoy.length})</div>
          {cumpleHoy.map(c=><Card key={c.id} c={c} />)}
        </div>
      )}

      {/* SELECTOR DE MES */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-[#e8edf3]">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 px-1">Ver cumpleaños por mes</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MESES.map((m,i)=>(
            <button key={i} onClick={()=>setMesVer(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition relative ${mesVer===i?"text-white":"bg-[#f4f6f9] text-slate-500"}`}
              style={mesVer===i?{background:RP.navy}:{}}>
              {m.slice(0,3)}{conteoPorMes[i]?<span className={`ml-1 ${mesVer===i?"text-white/70":"text-[#7c3aed]"}`}>({conteoPorMes[i]})</span>:""}
            </button>
          ))}
        </div>
      </div>

      {/* CUMPLEAÑOS DEL MES SELECCIONADO */}
      {cumpleDelMes.length>0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8edf3]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-black text-slate-500 uppercase tracking-wide">{MESES[mesVer]} ({cumpleDelMes.length})</div>
            {sinTelefono>0 && <div className="text-[10px] text-amber-500 font-bold"><Ico e="⚠" className="mr-1.5" />{sinTelefono} sin teléfono</div>}
          </div>
          {cumpleDelMes.map(c=><Card key={c.id} c={c} />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
          <div className="mb-2 flex justify-center"><Ico e="🎂" size={36} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-sm text-slate-400">No hay cumpleaños en {MESES[mesVer]}. Importa el reporte del mes o agrégalos manualmente.</div>
        </div>
      )}

      {showForm && <CumpleForm item={editItem} onSave={guardar} onClose={()=>{setShowForm(false);setEditItem(null);}} />}
      {showAI && <Modal title="📤 Importar cumpleaños con IA" onClose={()=>setShowAI(false)}><CumpleAIImport onImported={(lista)=>{setCumple(p=>[...lista.map(x=>({...x,id:genId()})),...p]);setShowAI(false);}} onClose={()=>setShowAI(false)} /></Modal>}
    </div>
  );
}

// Formulario manual de cumpleaños
function CumpleForm({ item, onSave, onClose }) {
  const [nombre,setNombre]=useState(item?.nombre||"");
  const [telefono,setTelefono]=useState(item?.telefono||"");
  const [fecha,setFecha]=useState(item?.fecha_cumple||"");
  const [cuenta,setCuenta]=useState(item?.cuenta||"");
  const guardar=()=>{
    if(!nombre.trim()){alert("Escribe el nombre");return;}
    onSave({nombre:nombre.trim(), telefono:telefono.trim(), fecha_cumple:fecha.trim(), cuenta:cuenta.trim()});
  };
  return (
    <Modal title={item?<><Ico e="✏" className="mr-1" />Editar cumpleaños</>:<><Ico e="🎂" className="mr-1" />Agregar cumpleaños</>} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre"><input value={nombre} onChange={e=>setNombre(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="Nombre completo" /></Field>
        <Field label="Teléfono (opcional — se busca en tu base)"><input value={telefono} onChange={e=>setTelefono(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="Déjalo vacío para sincronizar" /></Field>
        <Field label="N° de cuenta (opcional — ayuda al match)"><input value={cuenta} onChange={e=>setCuenta(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="RP-0000" /></Field>
        <Field label="Fecha de cumpleaños"><input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(fecha)?fecha:""} onChange={e=>setFecha(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" /></Field>
        <button onClick={guardar} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:"#16a34a"}}><Ico e="💾" className="mr-1.5" />Guardar</button>
      </div>
    </Modal>
  );
}

// Importar cumpleaños con IA (foto o PDF del reporte mensual)
function CumpleAIImport({ onImported, onClose }) {
  const [file,setFile]=useState(null);const [loading,setLoading]=useState(false);
  const [preview,setPreview]=useState(null);const [error,setError]=useState("");const fileRef=useRef();
  const [modelo,setModelo]=useState("haiku");
  const MODELOS={ haiku:{id:"claude-haiku-4-5-20251001",ico:"⚡", label:"Rápido",badge:"HAIKU"}, sonnet:{id:"claude-sonnet-4-5",ico:"🧠", label:"Preciso",badge:"SONNET"} };
  const handleFile=e=>{const f=e.target.files[0];if(!f)return;setFile(f);setPreview(null);setError("");};
  const extract=async()=>{
    if(!file){setError("Primero selecciona un archivo.");return;}
    setLoading(true);setError("");
    try{
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("No se pudo leer el archivo"));r.readAsDataURL(file);});
      const isPdf=file.type==="application/pdf" || /\.pdf$/i.test(file.name||"");
      let mediaType=(file.type||"").toLowerCase();
      if(!isPdf){
        const name=(file.name||"").toLowerCase();
        if(mediaType==="image/jpg") mediaType="image/jpeg";
        if(!["image/jpeg","image/png","image/gif","image/webp"].includes(mediaType)){
          if(/\.(jpe?g)$/i.test(name)) mediaType="image/jpeg";
          else if(/\.png$/i.test(name)) mediaType="image/png";
          else if(/\.(heic|heif)$/i.test(name)){ throw new Error("El formato HEIC del iPhone no es compatible. Toma una captura de pantalla y súbela."); }
          else mediaType="image/jpeg";
        }
      }
      const sizeMB=(b64.length*0.75)/(1024*1024);
      if(sizeMB>4.5) throw new Error("La imagen es muy grande. Toma una captura de pantalla o redúcela.");
      const block=isPdf?{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}}:{type:"image",source:{type:"base64",media_type:mediaType,data:b64}};
      const sys=`Extrae los cumpleaños del documento. Responde SOLO JSON sin backticks. Formato: {"cumpleanos":[{"nombre":"","telefono":"","cuenta":"","fecha_cumple":"MM-DD"}]}. La fecha_cumple SIEMPRE en formato MM-DD (mes-día), por ejemplo "06-25" para 25 de junio. Si hay año, ignóralo. "cuenta" = número de cliente si aparece. Campo vacío = "". Incluye TODOS los nombres aunque no tengan teléfono.`;
      let resp;
      try{
        resp=await fetch("/api/anthropic",{method:"POST",headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({model:MODELOS[modelo].id,max_tokens:8000,system:sys,messages:[{role:"user",content:[block,{type:"text",text:"Extrae los cumpleaños. Solo JSON."}]}]})});
      }catch{ throw new Error("No se pudo conectar con el servicio de IA. Revisa tu conexión o créditos."); }
      if(!resp.ok){
        let msg="Error "+resp.status;
        try{ const e=await resp.json(); msg=(e.error&&e.error.message)||msg; }catch{}
        if(resp.status===401) msg="API key inválida o sin créditos. Revisa tu cuenta de Anthropic.";
        if(resp.status===400) msg="El archivo no se pudo procesar. Intenta con una captura de pantalla más clara.";
        throw new Error(msg);
      }
      const data=await resp.json();
      const text=(data.content||[]).map(b=>b.text||"").join("");
      let clean=text.replace(/```json|```/g,"").trim();
      const fb=clean.indexOf("{"); const lb=clean.lastIndexOf("}");
      if(fb>=0&&lb>fb) clean=clean.slice(fb,lb+1);
      let parsed;
      try{ parsed=JSON.parse(clean); }catch{ throw new Error("No se pudo leer la respuesta. Intenta con una imagen más nítida."); }
      const lista=parsed.cumpleanos||[];
      if(!lista.length) throw new Error("No se encontraron cumpleaños en el archivo.");
      setPreview(lista);
    }catch(err){ setError("⚠️ "+(err.message||"No se pudo extraer.")); }
    setLoading(false);
  };
  return (
    <div>
      <div className="bg-[#5b21b6]/8 border border-[#5b21b6]/15 rounded-xl p-4 mb-4 text-sm text-[#5b21b6] font-medium"><strong><Ico e="🎂" className="mr-1.5" />Importar cumpleaños:</strong> Sube el reporte mensual (foto o PDF) y la IA agrega a todos.</div>
      <Field label="Tipo de extracción">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MODELOS).map(([k,m])=>(
            <button key={k} type="button" onClick={()=>setModelo(k)} className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition ${modelo===k?"text-white":"border-[#e5def4] bg-white text-slate-600"}`} style={modelo===k?{background:k==="haiku"?"#0d9488":"#7c3aed",borderColor:k==="haiku"?"#0d9488":"#7c3aed"}:{}}>{m.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Archivo (PDF, JPG, PNG)">
        <div onClick={()=>fileRef.current.click()} className="border-2 border-dashed border-[#e5def4] rounded-xl p-6 text-center cursor-pointer hover:border-[#7c3aed] hover:bg-[#f4f6f9] transition">
          <div className="text-3xl mb-2">{file?"📄":"📎"}</div><div className="text-sm text-slate-600 font-bold">{file?file.name:"Toca para seleccionar archivo"}</div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*" onChange={handleFile} />
        </div>
      </Field>
      {error && <div className="text-red-500 text-sm mb-3 bg-red-50 p-3 rounded-lg">{error}</div>}
      {!preview && <PrimaryBtn onClick={extract} disabled={!file||loading} full>{loading?`⏳ Extrayendo con ${MODELOS[modelo].badge}…`:`🤖 Extraer con ${MODELOS[modelo].label}`}</PrimaryBtn>}
      {preview && (
        <div>
          <div className="text-sm font-bold text-slate-700 mb-2"><Ico e="✅" className="mr-1.5" />{preview.length} cumpleaños — Revisa antes de guardar:</div>
          <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
            {preview.map((c,i)=>(<div key={i} className="bg-[#f4f6f9] rounded-lg p-3 border border-[#e8edf3] text-sm"><div className="font-bold text-slate-800">{c.nombre||"(Sin nombre)"}</div><div className="text-slate-500 text-xs"><Ico e="🎂" className="mr-1.5" />{c.fecha_cumple} · {c.telefono||"sin teléfono"}</div></div>))}
          </div>
          <div className="flex gap-2">
            <button onClick={()=>onImported(preview)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white" style={{background:RP.blue}}><Ico e="✅" className="mr-1.5" />Guardar {preview.length}</button>
            <button onClick={()=>{setPreview(null);setFile(null);}} className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-500 border border-[#e5def4]">Reintentar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INCENTIVOS ───────────────────────────────────────────────
// Calcula el progreso real de un incentivo según los datos del CRM.
// ─── CÁLCULO DE RACHA (incentivo tipo juego de 4 semanas) ───
// Cuenta citas/demos/ventas por semana (lunes-domingo) del agente, y evalúa
// la racha contra las metas de cada semana definidas al crear el incentivo.
// Lógica: cumplir meta = sigue en racha. Falla 1 semana → usa vida y continúa.
// Falla 2 → racha vuelve a 0. Completa las 4 → gana bono final + reinicia.
function lunesDeLaSemana(fecha){
  const d=new Date(fecha); d.setHours(0,0,0,0);
  const dia=d.getDay(); // 0=domingo..6=sábado
  const diff=(dia===0?-6:1-dia); // mover a lunes
  d.setDate(d.getDate()+diff);
  return d;
}
function calcularRacha(inc, allData){
  // semanas: array de {metaCitas,metaDemos,metaVentas,bono} definidas al crear
  const semanas=inc.semanas||[];
  if(semanas.length===0) return { activa:false };
  const agente=inc.agente;
  const inicio = inc.fechaInicio ? lunesDeLaSemana(inc.fechaInicio+"T00:00:00") : lunesDeLaSemana(new Date().toISOString());

  // Conteo de logros por número de semana (0..N) desde el inicio
  // Citas = appts tipo "cita" agendadas por el agente en esa semana
  // Demos = historial con demo_venta o demo_no_venta
  // Ventas = historial con demo_venta
  const clientes=[
    ...(allData.agregados||[]),
    ...(allData.prospectos||[]),
    ...(allData.distribucion||[]),
    ...((allData.referidos||[]).flatMap(anf=>(anf.referidos||[]))),
  ];
  const logroSemana={}; // idx -> {citas,demos,ventas}
  const acum=(idx,campo)=>{ if(!logroSemana[idx]) logroSemana[idx]={citas:0,demos:0,ventas:0}; logroSemana[idx][campo]++; };
  const idxDe=(fechaISO)=>{
    if(!fechaISO) return -1;
    const f=lunesDeLaSemana(fechaISO);
    const diff=Math.round((f-inicio)/(1000*60*60*24*7));
    return diff;
  };
  // Citas desde appts
  (allData.appts||[]).forEach(a=>{
    const deAgente=!agente || a.agente===agente;
    if(!deAgente) return;
    if(a.tipo==="cita" || a._type==="cita"){
      const idx=idxDe(a.fecha);
      if(idx>=0 && idx<semanas.length) acum(idx,"citas");
    }
  });
  // Demos y ventas desde historial de clientes
  clientes.forEach(c=>{
    (c.historial||[]).forEach(h=>{
      const deAgente=!agente || h.agente===agente;
      if(!deAgente) return;
      const idx=idxDe(h.fecha);
      if(idx<0 || idx>=semanas.length) return;
      if(h.cita_resultado==="demo_venta"||h.cita_resultado==="demo_no_venta"||
         h.cita_resultado==="venta"||h.cita_resultado==="no_venta") acum(idx,"demos");
      if(h.cita_resultado==="demo_venta"||h.cita_resultado==="venta") acum(idx,"ventas");
    });
  });

  // ¿Cuál es la semana actual (índice) respecto a hoy?
  const hoyIdx=idxDe(new Date().toISOString());

  // Evaluar cada semana: ¿cumplió su meta?
  const evalSemana=(idx)=>{
    const s=semanas[idx]; if(!s) return false;
    const l=logroSemana[idx]||{citas:0,demos:0,ventas:0};
    const okC=!s.metaCitas || l.citas>=Number(s.metaCitas);
    const okD=!s.metaDemos || l.demos>=Number(s.metaDemos);
    const okV=!s.metaVentas || l.ventas>=Number(s.metaVentas);
    return okC&&okD&&okV;
  };

  // Recorrer semanas hasta hoy, aplicando lógica de racha + vida.
  // 'nivel' = semanas CONSECUTIVAS cumplidas (no la posición absoluta).
  let nivel=0;          // racha actual (consecutivas)
  let vidaUsada=false;  // si ya gastó la vida en este ciclo
  let completadoCiclo=false;
  const detalleSemanas=[];
  const ultimaSemanaEval=Math.min(hoyIdx, semanas.length-1);
  for(let i=0;i<=ultimaSemanaEval && i<semanas.length;i++){
    const cumplio=evalSemana(i);
    const l=logroSemana[i]||{citas:0,demos:0,ventas:0};
    detalleSemanas.push({idx:i,cumplio,logro:l,meta:semanas[i]});
    if(cumplio){
      nivel++;  // suma una semana a la racha consecutiva
      if(nivel>=semanas.length){ completadoCiclo=true; }
    } else {
      if(!vidaUsada){ vidaUsada=true; nivel++; } // 1er fallo: usa vida, la semana cuenta igual
      else { nivel=0; vidaUsada=false; }         // 2do fallo: pierde racha, reinicia (recupera vida)
    }
  }

  const semanaActual=Math.min(nivel,semanas.length-1);
  const vidaDisponible=!vidaUsada;
  // Sumar ajuste manual del admin/distribuidor a la semana actual
  const aj=inc.ajusteManual||{};
  const logroBase=logroSemana[semanaActual]||{citas:0,demos:0,ventas:0};
  const logroConAjuste={
    citas:  logroBase.citas  + (Number(aj.citas)||0),
    demos:  logroBase.demos  + (Number(aj.demos)||0),
    ventas: logroBase.ventas + (Number(aj.ventas)||0),
  };
  return {
    activa:true,
    semanas, detalleSemanas,
    nivel,
    semanaActual,
    vidaDisponible,
    completadoCiclo,
    logroActual: logroConAjuste,
    totalSemanas: semanas.length,
    bonoFinal: semanas[semanas.length-1]?.bono || "",
  };
}

function calcularProgresoIncentivo(inc, allData) {
  const desde = inc.fechaInicio ? new Date(inc.fechaInicio+"T00:00:00") : null;
  const hasta = inc.fechaFin ? new Date(inc.fechaFin+"T23:59:59") : null;
  const agente = inc.agente;
  const enRango = (fechaISO) => {
    if(!fechaISO) return false;
    const f = new Date(fechaISO);
    if(desde && f<desde) return false;
    if(hasta && f>hasta) return false;
    return true;
  };
  const clientes = [
    ...(allData.agregados||[]),
    ...(allData.prospectos||[]),
    ...(allData.distribucion||[]),
    ...((allData.referidos||[]).flatMap(anf=>(anf.referidos||[]))),
  ];
  let citas=0;
  // Citas AGENDADAS (appts tipo "cita" del agente en el periodo)
  (allData.appts||[]).forEach(a=>{
    const deAgente = !agente || a.agente===agente;
    if(!deAgente || !enRango(a.fecha)) return;
    if(a.tipo==="cita" || a._type==="cita") citas++;
  });
  // Demos / ventas / valor con la función central (citas de agenda + historial),
  // para que coincidan exactamente con Control de actividad y Estadísticas.
  const _vd = contarVentasDemos({ appts: allData.appts||[], clientes, enP: enRango, agente });
  let demos = _vd.demos, ventas = _vd.ventas, valor = _vd.volumen;
  // Sumar ajuste manual del admin/distribuidor/asistente
  const aj=inc.ajusteManual||{};
  citas  += Number(aj.citas)||0;
  demos  += Number(aj.demos)||0;
  ventas += Number(aj.ventas)||0;
  valor  += Number(aj.valor)||0;
  const metaCitas=Number(inc.metaCitas)||0;
  const metaDemos=Number(inc.metaDemos)||0;
  const metaVentas=Number(inc.metaVentas)||0;
  const metaValor=Number(inc.metaValor)||0;
  const partes=[];
  if(metaCitas>0) partes.push(Math.min(1,citas/metaCitas));
  if(metaDemos>0) partes.push(Math.min(1,demos/metaDemos));
  if(metaVentas>0) partes.push(Math.min(1,ventas/metaVentas));
  if(metaValor>0) partes.push(Math.min(1,valor/metaValor));
  const pct = partes.length? Math.round(partes.reduce((a,b)=>a+b,0)/partes.length*100) : 0;
  let diasRestantes=null;
  if(hasta){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    diasRestantes=Math.max(0,Math.ceil((hasta-hoy)/(1000*60*60*24)));
  }
  const completado = partes.length>0 && partes.every(p=>p>=1);

  // ── GAMIFICACIÓN: estado de misión, racha, medallas ──
  let estadoMision="activa";
  if(completado) estadoMision="completada";
  else if(diasRestantes===0) estadoMision="vencida";
  else if(pct>0) estadoMision="en_progreso";

  // Racha diaria: días consecutivos (hasta hoy) con al menos 1 actividad del agente
  const diasConActividad=new Set();
  clientes.forEach(c=>{
    (c.historial||[]).forEach(h=>{
      const deAgente = !agente || h.agente===agente;
      if(deAgente && h.fecha && enRango(h.fecha)) diasConActividad.add(new Date(h.fecha).toISOString().slice(0,10));
    });
  });
  let racha=0;
  { const d=new Date(); d.setHours(0,0,0,0);
    for(let i=0;i<60;i++){
      const key=d.toISOString().slice(0,10);
      if(diasConActividad.has(key)) racha++;
      else if(i>0) break; // permite que hoy aún no tenga actividad sin cortar la racha de ayer
      d.setDate(d.getDate()-1);
    }
  }

  // Medallas por hitos de progreso
  const medallas=[];
  if(pct>=25) medallas.push({icon:"🥉",label:"25%"});
  if(pct>=50) medallas.push({icon:"🥈",label:"50%"});
  if(pct>=75) medallas.push({icon:"🥇",label:"75%"});
  if(pct>=100) medallas.push({icon:"🏆",label:"¡Completa!"});
  if(racha>=3) medallas.push({icon:"🔥",label:`Racha ${racha}`});

  // Mensaje motivacional según progreso
  let mensaje="¡Arranca tu misión! 💪";
  if(pct>=100) mensaje="¡Misión cumplida! Eres una leyenda 🎉";
  else if(pct>=75) mensaje="¡Ya casi! Un último empujón 🚀";
  else if(pct>=50) mensaje="¡Vas a mitad de camino! Sigue así 🔥";
  else if(pct>=25) mensaje="¡Buen comienzo! No pares 💪";
  else if(pct>0) mensaje="¡Primeros pasos dados! Acelera ⚡";

  return { citas, demos, ventas, valor, metaCitas, metaDemos, metaVentas, metaValor, pct, diasRestantes, completado, estadoMision, racha, medallas, mensaje };
}

// Barra de progreso de una meta individual
function MetaBar({ label, actual, meta, color }) {
  if(!meta || meta<=0) return null;
  const pct=Math.min(100,Math.round(actual/meta*100));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] font-bold mb-0.5">
        <span className="text-slate-600">{label}</span>
        <span style={{color}}>{actual} / {meta}{pct>=100?" ✅":""}</span>
      </div>
      <div className="h-2.5 rounded-full bg-[#f1ecfd] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{width:pct+"%",background:color}} />
      </div>
    </div>
  );
}

// Tarjeta de progreso de incentivo (para el Inicio del agente)
function IncentivoProgreso({ inc, allData, compact }) {
  const p=calcularProgresoIncentivo(inc, allData);
  const ESTADO_MISION={
    activa:      { ico:"🎯", label:"Misión activa",   chip:"#7c3aed" },
    en_progreso: { ico:"⚡", label:"En progreso",     chip:"#b45309" },
    completada:  { ico:"✅", label:"Completada",      chip:"#16a34a" },
    vencida:     { ico:"⏰", label:"Vencida",         chip:"#64748b" },
  };
  const em=ESTADO_MISION[p.estadoMision]||ESTADO_MISION.activa;
  const headerBg = p.completado
    ? "linear-gradient(135deg,#16a34a,#15803d)"
    : p.estadoMision==="vencida"
      ? "linear-gradient(135deg,#64748b,#475569)"
      : `linear-gradient(135deg,${RP.navy},${RP.blue})`;
  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${p.completado?"border-[#16a34a]":p.estadoMision==="vencida"?"border-slate-300":"border-[#e8b800]"}`}>
      {/* Cabecera de misión */}
      <div className="px-4 py-3" style={{background:headerBg}}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-black text-white/90 bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wide">{em.label}</span>
          <div className="flex items-center gap-1.5">
            {p.racha>=2 && <span className="text-[10px] font-black text-white bg-orange-500/80 px-2 py-0.5 rounded-full"><Ico e="🔥" className="mr-1.5" />{p.racha} días</span>}
            {p.diasRestantes!==null && <span className="text-[10px] font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">{p.diasRestantes===0?"Último día":`${p.diasRestantes} días`}</span>}
          </div>
        </div>
        <div className="text-white font-black text-base" style={{fontFamily:SERIF}}><Ico e="🎮" className="mr-1.5" />{inc.nombre||"Misión"}</div>
        {inc.descripcion && <div className="text-white/75 text-[11px] mt-0.5 italic">{inc.descripcion}</div>}
        {inc.premio && <div className="text-white/85 text-xs mt-0.5"><Ico e="🎁" className="mr-1.5" />Recompensa: {inc.premio}</div>}
      </div>

      <div className="p-4 bg-white">
        {p.completado ? (
          <div className="text-center py-3">
            <div className="mb-2 animate-bounce flex justify-center"><Ico e="🎉" size={44} strokeWidth={1.5} className="text-[#C8A24A]" /></div>
            <div className="font-black text-[#16a34a] text-xl" style={{fontFamily:SERIF}}>Congratulations!</div>
            <div className="text-sm font-bold text-slate-700 mt-1">{p.mensaje}</div>
            <div className="text-xs text-slate-500 mt-1">¡Misión cumplida! Habla con tu líder por tu recompensa 🏆</div>
            {p.medallas.length>0 && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap mt-3">
                {p.medallas.map((m,i)=>(<span key={i} className="inline-flex items-center" title={m.label}><Ico e={m.icon} size={16} className="text-[#C8A24A]" /></span>))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Barra de progreso grande estilo juego */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Progreso de misión</span>
              <span className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{p.pct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all duration-700" style={{width:`${p.pct}%`,background:p.pct>=75?"linear-gradient(90deg,#16a34a,#22c55e)":p.pct>=50?"linear-gradient(90deg,#93C5FD,#60A5FA)":"linear-gradient(90deg,#b45309,#f59e0b)"}} />
            </div>
            {/* Mensaje motivacional */}
            <div className="text-center text-xs font-bold text-[#5b21b6] bg-[#f1ecfd] rounded-lg py-1.5 mb-3">{p.mensaje}</div>

            {/* Medallas ganadas */}
            {p.medallas.length>0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-3 justify-center">
                {p.medallas.map((m,i)=>(
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full border border-amber-200">
                    <Ico e={m.icon} size={14} />{m.label}
                  </span>
                ))}
              </div>
            )}

            {/* Metas */}
            <MetaBar label="📅 Citas" actual={p.citas} meta={p.metaCitas} color="#16a34a" />
            <MetaBar label="🎬 Demostraciones" actual={p.demos} meta={p.metaDemos} color="#7c3aed" />
            <MetaBar label="💰 Ventas" actual={p.ventas} meta={p.metaVentas} color="#047857" />
            <MetaBar label="💵 Valor vendido" actual={p.valor} meta={p.metaValor} color="#b45309" />
          </>
        )}
      </div>
    </div>
  );
}

// Pestaña INCENTIVO (crear y administrar — solo admin/distribuidor)
// ─── RACHA: visual tipo juego (4 semanas con vida) ───
function RachaProgreso({ inc, allData }) {
  const r=calcularRacha(inc, allData);
  if(!r.activa) return null;
  const niveles=r.semanas.length;
  return (
    <div className="rounded-2xl border-2 border-[#e8b800] overflow-hidden">
      {/* Cabecera */}
      <div className="px-4 py-3" style={{background:r.completadoCiclo?"linear-gradient(135deg,#16a34a,#15803d)":`linear-gradient(135deg,${RP.navy},${RP.blue})`}}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-black text-white/90 bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wide"><Ico e="🔥" className="mr-1.5" />Racha · {inc.agente||"Equipo"}</span>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.vidaDisponible?"bg-white/25 text-white":"bg-black/20 text-white/50 line-through"}`}><Ico e="🛡" className="mr-1.5" />{r.vidaDisponible?"1 vida":"sin vida"}</span>
            <span className="text-[10px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full">Semana {Math.min(r.nivel+1,niveles)}/{niveles}</span>
          </div>
        </div>
        <div className="text-white font-black text-base" style={{fontFamily:SERIF}}><Ico e="🎮" className="mr-1.5" />{inc.nombre||"Reto en racha"}</div>
        {inc.descripcion && <div className="text-white/75 text-[11px] mt-0.5 italic">{inc.descripcion}</div>}
      </div>

      <div className="p-4 bg-white">
        {r.completadoCiclo ? (
          <div className="text-center py-3">
            <div className="mb-2 animate-bounce flex justify-center"><Ico e="🎉" size={44} strokeWidth={1.5} className="text-[#C8A24A]" /></div>
            <div className="font-black text-[#16a34a] text-xl" style={{fontFamily:SERIF}}>Congratulations!</div>
            <div className="text-sm font-bold text-slate-700 mt-1">¡Completaste las {niveles} semanas en racha!</div>
            {r.bonoFinal && <div className="text-xs text-[#b45309] bg-amber-50 rounded-lg px-3 py-1.5 mt-2 inline-block font-bold"><Ico e="🎁" className="mr-1.5" />{r.bonoFinal}</div>}
            <div className="text-[11px] text-slate-400 mt-2">La racha se reinicia para un nuevo ciclo 🔄</div>
          </div>
        ) : (
          <>
            {/* Niveles tipo videojuego */}
            <div className="flex items-center justify-between gap-1 mb-3">
              {r.semanas.map((s,i)=>{
                const det=r.detalleSemanas.find(d=>d.idx===i);
                const cumplida=det?.cumplio;
                const esActual=i===r.semanaActual;
                const futura=i>r.semanaActual;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black border-2 ${cumplida?"bg-[#16a34a] border-[#16a34a] text-white":esActual?"bg-[#7c3aed]/10 border-[#7c3aed] text-[#7c3aed]":futura?"bg-slate-50 border-slate-200 text-slate-300":"bg-red-50 border-red-300 text-red-400"}`}>
                      {cumplida?"✓":esActual?(i+1):futura?(i+1):"✕"}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 mt-1">Sem {i+1}</div>
                    {s.bono && <div className="text-[8px] text-[#b45309] font-bold text-center leading-tight">{s.bono}</div>}
                  </div>
                );
              })}
            </div>

            {/* Meta de la semana actual */}
            {(()=>{
              const s=r.semanas[r.semanaActual]||{};
              const l=r.logroActual;
              return (
                <div className="bg-[#f9f5ff] rounded-xl p-3 border border-[#7c3aed]/15">
                  <div className="text-[11px] font-black text-[#7c3aed] uppercase tracking-wider mb-2"><Ico e="🎯" className="mr-1.5" />Meta de la semana {r.semanaActual+1}</div>
                  {Number(s.metaCitas)>0 && <MetaBar label="📅 Citas" actual={l.citas} meta={Number(s.metaCitas)} color="#16a34a" />}
                  {Number(s.metaDemos)>0 && <MetaBar label="🎬 Demostraciones" actual={l.demos} meta={Number(s.metaDemos)} color="#7c3aed" />}
                  {Number(s.metaVentas)>0 && <MetaBar label="💰 Ventas" actual={l.ventas} meta={Number(s.metaVentas)} color="#047857" />}
                  {s.bono && <div className="text-xs text-[#b45309] bg-amber-50 rounded-lg px-2 py-1 mt-2 inline-block font-bold"><Ico e="🎁" className="mr-1.5" />Premio de esta semana: {s.bono}</div>}
                </div>
              );
            })()}

            <div className="text-center text-[11px] font-bold text-[#7c3aed] bg-[#f9f5ff] rounded-lg py-1.5 mt-2">
              {r.vidaDisponible ? <><Ico e="🛡" className="mr-1" />Si fallas una semana, usas tu vida y sigues en racha</> : <><Ico e="⚠" className="mr-1" />Ya usaste tu vida — si fallas otra semana, la racha vuelve a 0</>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── HUB DE INCENTIVOS: Telemarketing (clásico) + Cobranza + Reclutamiento ──
function MetaBarInc({ pct }){
  return (
    <div className="h-2.5 rounded-full bg-[#eef1f5] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{width:`${Math.min(100,pct)}%`, background: pct>=100?"#059669":"#7c3aed"}} />
    </div>
  );
}
function IncentivosCobranzaPanel({ metas, setMetas, cobranza }){
  const mesKey = new Date().toISOString().slice(0,7);
  const [form,setForm]=useState(null); // null | {id?,titulo,metaMonto,bono}
  const cobradoMes = (()=>{
    let t=0;
    Object.values((cobranza||{}).clientesData||{}).forEach(c=>(c.historial||[]).forEach(h=>{
      if(h.tipo==="pago" && String(h.fecha||"").startsWith(mesKey)) t += +h.monto||0;
    }));
    return +t.toFixed(2);
  })();
  const lista=(metas||[]).filter(m=>m.mes===mesKey);
  const guardar=()=>{
    if(!form.titulo.trim() || !(+form.metaMonto>0)){ alert("Ponle título y monto meta."); return; }
    if(form.id) setMetas(p=>p.map(x=>x.id===form.id?{...x,...form,metaMonto:+form.metaMonto}:x));
    else setMetas(p=>[...(p||[]),{id:genId(),titulo:form.titulo,metaMonto:+form.metaMonto,bono:form.bono||"",mes:mesKey,creado:new Date().toISOString()}]);
    setForm(null);
  };
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 text-white" style={{background:"linear-gradient(135deg,#065f46,#059669)"}}>
        <div className="text-[11px] opacity-80 uppercase font-black tracking-wider"><Ico e="💵" className="mr-1.5" />Cobrado este mes (automático)</div>
        <div className="text-3xl font-black mt-1" style={{fontFamily:SERIF}}>${cobradoMes.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
        <div className="text-[11px] opacity-75 mt-0.5">Se actualiza solo con cada pago registrado en Cobranza</div>
      </div>
      <button onClick={()=>setForm({titulo:"",metaMonto:"",bono:""})} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{background:RP.navy}}>+ Nueva meta de cobranza</button>
      {lista.length===0 && <div className="text-center py-8 text-slate-400 text-sm">Sin metas este mes. Crea la primera 💪</div>}
      {lista.map(m=>{
        const pct = m.metaMonto>0 ? Math.round(cobradoMes/m.metaMonto*100) : 0;
        return (
          <div key={m.id} className="bg-white rounded-2xl border border-[#e8edf3] p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-[#1f2d3d]" style={{fontFamily:SERIF}}>{pct>=100?<><Ico e="🏆" className="mr-1" /></>:""}{m.titulo}</div>
                <div className="text-xs text-slate-500 mt-0.5">Meta: ${(+m.metaMonto).toLocaleString("en-US")} {m.bono?` · 🎁 ${m.bono}`:""}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={()=>setForm({id:m.id,titulo:m.titulo,metaMonto:m.metaMonto,bono:m.bono||""})} className="w-7 h-7 rounded-lg bg-[#f4f6f9] text-xs"><Ico e="✏" /></button>
                <button onClick={()=>{ if(confirm("¿Eliminar esta meta?")) setMetas(p=>p.filter(x=>x.id!==m.id)); }} className="w-7 h-7 rounded-lg bg-red-50 text-xs"><Ico e="🗑" /></button>
              </div>
            </div>
            <div className="mt-2"><MetaBarInc pct={pct} /></div>
            <div className="text-[11px] font-bold mt-1" style={{color:pct>=100?"#059669":"#7c3aed"}}>
              {pct>=100 ? `✅ ¡Meta lograda! (${pct}%)` : `${pct}% · faltan $${Math.max(0,m.metaMonto-cobradoMes).toLocaleString("en-US",{maximumFractionDigits:0})}`}
            </div>
          </div>
        );
      })}
      {form && (
        <Modal title={form.id?<><Ico e="✏" className="mr-1" />Editar meta</>:<><Ico e="💵" className="mr-1" />Nueva meta de cobranza</>} onClose={()=>setForm(null)}>
          <Field label="Título" required><input className={inpLight} value={form.titulo} onChange={e=>setForm(p=>({...p,titulo:e.target.value}))} placeholder="ej. Recuperar cartera de julio" /></Field>
          <Field label="Meta a cobrar en el mes ($)" required><input type="number" className={inpLight} value={form.metaMonto} onChange={e=>setForm(p=>({...p,metaMonto:e.target.value}))} placeholder="5000" /></Field>
          <Field label="Bono / premio al lograrla"><input className={inpLight} value={form.bono} onChange={e=>setForm(p=>({...p,bono:e.target.value}))} placeholder="ej. $200 extra" /></Field>
          <button onClick={guardar} className="w-full py-3 rounded-xl text-sm font-bold text-white mt-1" style={{background:RP.navy}}><Ico e="✅" className="mr-1.5" />Guardar meta</button>
        </Modal>
      )}
    </div>
  );
}
function IncentivosReclutPanel({ metas, setMetas, socios, reclutamiento }){
  const [form,setForm]=useState(null);
  const DIAS={semanal:7,quincenal:15,mensual:30};
  const hoyMs=Date.now();
  const progresoDe=(m)=>{
    const ini=new Date(m.inicio||m.creado||hoyLocal());
    const fin=new Date(ini.getTime()+ (DIAS[m.periodo]||30)*86400000);
    const dentro=(f)=>{ const d=new Date(f); return !isNaN(d)&&d>=ini&&d<=fin; };
    if(m.tipo==="entrevistas"){
      return (reclutamiento||[]).filter(r=>r.entrevistado && dentro(r.entrevista_fecha||r.creado||m.inicio)).length;
    }
    return (socios||[]).filter(x=>dentro(x.fechaInicio||x.creado)).length;
  };
  const guardar=()=>{
    if(!form.titulo.trim() || !(+form.meta>0)){ alert("Ponle título y número meta."); return; }
    if(form.id) setMetas(p=>p.map(x=>x.id===form.id?{...x,...form,meta:+form.meta}:x));
    else setMetas(p=>[...(p||[]),{id:genId(),titulo:form.titulo,tipo:form.tipo,meta:+form.meta,bono:form.bono||"",periodo:form.periodo,inicio:form.inicio,creado:new Date().toISOString()}]);
    setForm(null);
  };
  const activas=(metas||[]).filter(m=>{
    const ini=new Date(m.inicio||m.creado); const fin=new Date(ini.getTime()+(DIAS[m.periodo]||30)*86400000);
    return hoyMs <= fin.getTime()+86400000*7; // visibles hasta 1 semana después de vencer
  });
  return (
    <div className="space-y-3">
      <button onClick={()=>setForm({titulo:"",tipo:"socios",meta:"",bono:"",periodo:"mensual",inicio:hoyLocal()})} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{background:RP.navy}}>+ Nueva meta de reclutamiento</button>
      {activas.length===0 && <div className="text-center py-8 text-slate-400 text-sm">Sin metas activas. Crea la primera.</div>}
      {activas.map(m=>{
        const prog=progresoDe(m);
        const pct=m.meta>0?Math.round(prog/m.meta*100):0;
        return (
          <div key={m.id} className="bg-white rounded-2xl border border-[#e8edf3] p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-[#1f2d3d]" style={{fontFamily:SERIF}}>{pct>=100?<><Ico e="🏆" className="mr-1" /></>:""}{m.titulo}</div>
                <div className="text-xs text-slate-500 mt-0.5">{m.tipo==="entrevistas"?<><Ico e="🤝" className="mr-1" />Entrevistas</>:<><Ico e="⭐" className="mr-1" />Socios nuevos</>} · {m.periodo} desde {m.inicio} {m.bono?` · 🎁 ${m.bono}`:""}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={()=>setForm({id:m.id,titulo:m.titulo,tipo:m.tipo,meta:m.meta,bono:m.bono||"",periodo:m.periodo,inicio:m.inicio})} className="w-7 h-7 rounded-lg bg-[#f4f6f9] text-xs"><Ico e="✏" /></button>
                <button onClick={()=>{ if(confirm("¿Eliminar esta meta?")) setMetas(p=>p.filter(x=>x.id!==m.id)); }} className="w-7 h-7 rounded-lg bg-red-50 text-xs"><Ico e="🗑" /></button>
              </div>
            </div>
            <div className="mt-2"><MetaBarInc pct={pct} /></div>
            <div className="text-[11px] font-bold mt-1" style={{color:pct>=100?"#059669":"#7c3aed"}}>
              {prog} de {m.meta} {pct>=100?`· ✅ ¡Meta lograda!`:`(${pct}%)`}
            </div>
          </div>
        );
      })}
      {form && (
        <Modal title={form.id?<><Ico e="✏" className="mr-1" />Editar meta</>:<><Ico e="🧲" className="mr-1" />Nueva meta de reclutamiento</>} onClose={()=>setForm(null)}>
          <Field label="Título" required><input className={inpLight} value={form.titulo} onChange={e=>setForm(p=>({...p,titulo:e.target.value}))} placeholder="ej. 3 socios en julio" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Se mide por"><select className={inpLight} value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}><option value="socios"><Ico e="⭐" className="mr-1.5" />Socios nuevos</option><option value="entrevistas"><Ico e="🤝" className="mr-1.5" />Entrevistas</option></select></Field>
            <Field label="Número meta" required><input type="number" className={inpLight} value={form.meta} onChange={e=>setForm(p=>({...p,meta:e.target.value}))} placeholder="3" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Periodo"><select className={inpLight} value={form.periodo} onChange={e=>setForm(p=>({...p,periodo:e.target.value}))}><option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option></select></Field>
            <Field label="Inicia"><input type="date" className={inpLight} value={form.inicio} onChange={e=>setForm(p=>({...p,inicio:e.target.value}))} /></Field>
          </div>
          <Field label="Bono / premio al lograrla"><input className={inpLight} value={form.bono} onChange={e=>setForm(p=>({...p,bono:e.target.value}))} placeholder="ej. cena para dos" /></Field>
          <button onClick={guardar} className="w-full py-3 rounded-xl text-sm font-bold text-white mt-1" style={{background:RP.navy}}><Ico e="✅" className="mr-1.5" />Guardar meta</button>
        </Modal>
      )}
    </div>
  );
}
function IncentivosHub(props){
  const [sub,setSub]=useState("tm");
  const TABS=[["tm","📞","Telemarketing"],["cob","💵","Cobranza"],["rec","🧲","Reclutamiento"]];
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {TABS.map(([id,ico,label])=>(
          <button key={id} onClick={()=>setSub(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition ${sub===id?"text-white":"bg-white text-slate-500 border border-[#e8edf3]"}`}
            style={sub===id?{background:RP.navy}:{}}><span className="inline-flex items-center justify-center gap-1.5"><Ico e={ico} size={13} />{label}</span></button>
        ))}
      </div>
      {sub==="tm" && <IncentivoSection incentivos={props.incentivos} setIncentivos={props.setIncentivos} allData={props.allData} agentes={props.agentes} notify={props.notify} rolActivo={props.rolActivo} agenteActivo={props.agenteActivo} cofreConfig={props.cofreConfig} setCofreConfig={props.setCofreConfig} />}
      {sub==="cob" && <IncentivosCobranzaPanel metas={props.incentivosCobranza} setMetas={props.setIncentivosCobranza} cobranza={props.cobranza} />}
      {sub==="rec" && <IncentivosReclutPanel metas={props.incentivosReclut} setMetas={props.setIncentivosReclut} socios={props.socios} reclutamiento={props.reclutamiento} />}
    </div>
  );
}

function IncentivoSection({ incentivos, setIncentivos, allData, agentes, notify, rolActivo="", agenteActivo="", cofreConfig, setCofreConfig }) {
  const [showForm,setShowForm]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [ajusteId,setAjusteId]=useState(null); // id del incentivo con ajuste abierto
  const [aj,setAj]=useState({citas:0,demos:0,ventas:0,valor:0});
  const [tab,setTab]=useState("normal"); // normal | racha | cofre
  const puedeEditar=puedeCrearIncentivosRol(rolActivo);

  const guardar=(inc)=>{
    if(editItem){
      setIncentivos(p=>p.map(x=>x.id===editItem.id?{...inc,id:editItem.id}:x));
    } else {
      const nuevo={...inc,id:genId(),creado:new Date().toISOString(),estado:"activo"};
      setIncentivos(p=>[nuevo,...p]);
      if(notify && inc.agente){
        notify("incentivo",
          `🏆 Nuevo incentivo para ${inc.agente}`,
          `${inc.nombre}: ${[inc.metaCitas&&`${inc.metaCitas} citas`,inc.metaDemos&&`${inc.metaDemos} demos`,inc.metaVentas&&`${inc.metaVentas} ventas`,inc.metaValor&&`$${inc.metaValor}`].filter(Boolean).join(", ")}. Premio: ${inc.premio||"—"}`,
          "🏆 Incentivo"
        );
      }
    }
    setShowForm(false); setEditItem(null);
  };
  const eliminar=(id)=>{ if(confirm("¿Eliminar este incentivo?")) setIncentivos(p=>p.filter(x=>x.id!==id)); };
  const abrirAjuste=(inc)=>{ setAjusteId(inc.id); setAj(inc.ajusteManual||{citas:0,demos:0,ventas:0,valor:0}); };
  const guardarAjuste=(id)=>{
    setIncentivos(p=>(p||[]).map(i=>i.id===id
      ? {...i, ajusteManual:{citas:Number(aj.citas)||0,demos:Number(aj.demos)||0,ventas:Number(aj.ventas)||0,valor:Number(aj.valor)||0}, ajusteEditadoPor:agenteActivo, ajusteEditado:new Date().toISOString()}
      : i
    ));
    setAjusteId(null);
  };

  const activos=(incentivos||[]).filter(i=>i.estado!=="cancelado");
  const normales=activos.filter(i=>i.tipo!=="racha");
  const rachas=activos.filter(i=>i.tipo==="racha");
  const cofreActivo = !!(cofreConfig && cofreConfig.activo!==false && (cofreConfig.niveles||[]).some(cofreNivelTieneMetas));
  const listaTab = tab==="racha" ? rachas : normales;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}><Ico e="🏆" className="mr-1.5" />Incentivos</h2>
        <p className="text-xs text-slate-400 mt-1">Elige un tipo de meta para configurarla. El progreso de cada agente aparece en su Inicio.</p>
      </div>

      {/* 3 CASILLAS POR TIPO */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {id:"normal", icon:"🎯", label:"Meta normal", badge:String(normales.length), color:"#5b21b6"},
          {id:"racha",  icon:"🔥", label:"Rachas",      badge:String(rachas.length),   color:"#7c3aed"},
          {id:"cofre",  icon:"🎁", label:"Cofres",      badge:(cofreActivo?"Activo":"Apagado"), color:"#c8901f"},
        ].map(c=>(
          <button key={c.id} onClick={()=>setTab(c.id)}
            className={`rounded-2xl p-3 border-2 text-center transition active:scale-95 ${tab===c.id?"shadow-md":"bg-white"}`}
            style={tab===c.id?{borderColor:c.color, background:c.color+"0d"}:{borderColor:"#e8edf3"}}>
            <div className="mb-1 flex justify-center"><Ico e={c.icon} size={22} /></div>
            <div className="text-[11px] font-black leading-tight" style={{color:tab===c.id?c.color:"#475569"}}>{c.label}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">{c.badge}</div>
          </button>
        ))}
      </div>

      {tab==="cofre" ? (
        <CofreConfigCard cofreConfig={cofreConfig} setCofreConfig={setCofreConfig} rolActivo={rolActivo} />
      ) : (
      <div className="space-y-3">
        {puedeEditar && <button onClick={()=>{setEditItem(null);setShowForm(true);}} className="w-full px-4 py-3 rounded-xl text-sm font-black text-white active:scale-95 transition" style={{background: tab==="racha"?"#7c3aed":RP.navy}}>+ Crear {tab==="racha"?"racha":"meta normal"}</button>}
        {listaTab.length===0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
            <div className="text-4xl mb-2"><Ico e={tab==="racha"?"🔥":"🎯"} size={36} strokeWidth={1.4} className="text-[#C8A24A]" /></div>
            <div className="text-sm text-slate-400">{tab==="racha"?"Aún no hay rachas activas. Crea la primera arriba.":"Aún no hay metas normales activas. Crea la primera arriba."}</div>
          </div>
        ) : (
        <div className="space-y-3">
          {listaTab.map(inc=>{
            const esRacha=inc.tipo==="racha";
            const ajActual=inc.ajusteManual||{};
            const tieneAjuste=ajActual.citas||ajActual.demos||ajActual.ventas||ajActual.valor;
            return (
              <div key={inc.id}>
                {/* Botones de acción */}
                <div className="flex justify-end gap-1.5 mb-1.5">
                  {puedeEditar && (
                    <button onClick={()=>{ if(ajusteId===inc.id){setAjusteId(null);}else{abrirAjuste(inc);} }}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border transition ${ajusteId===inc.id?"text-white border-transparent":"border-[#e5def4] bg-white text-[#b45309]"}`}
                      style={ajusteId===inc.id?{background:"#b45309"}:{}}>
                      <Ico e="✏" className="mr-1.5" />Ajuste manual
                    </button>
                  )}
                  <button onClick={()=>{setEditItem(inc);setShowForm(true);}} className="text-[#7c3aed] text-xs px-2 py-1 rounded-lg border border-[#e5def4] bg-white"><Ico e="✏" className="mr-1.5" />Editar</button>
                  <button onClick={()=>eliminar(inc.id)} className="text-red-400 text-xs px-2 py-1 rounded-lg border border-red-100 bg-white"><Ico e="🗑" /></button>
                </div>

                {/* Panel de ajuste manual */}
                {ajusteId===inc.id && puedeEditar && (
                  <div className="mb-2 border-2 border-[#b45309]/20 rounded-xl p-3 bg-amber-50">
                    <div className="text-[11px] font-black text-[#b45309] uppercase tracking-wider mb-2"><Ico e="✏" className="mr-1.5" />Ajuste manual de avance</div>
                    <div className="text-[10px] text-slate-500 mb-2">Suma o resta al conteo automático. Útil para correcciones o citas no registradas en la app.</div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="📅" className="mr-1.5" />Citas (+/-)</div>
                        <input type="number" value={aj.citas} onChange={e=>setAj(p=>({...p,citas:e.target.value}))}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500 bg-white" placeholder="0" />
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="🎬" className="mr-1.5" />Demos (+/-)</div>
                        <input type="number" value={aj.demos} onChange={e=>setAj(p=>({...p,demos:e.target.value}))}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500 bg-white" placeholder="0" />
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="💰" className="mr-1.5" />Ventas (+/-)</div>
                        <input type="number" value={aj.ventas} onChange={e=>setAj(p=>({...p,ventas:e.target.value}))}
                          className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500 bg-white" placeholder="0" />
                      </div>
                      {!esRacha && (
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="💵" className="mr-1.5" />Valor $ (+/-)</div>
                          <input type="number" value={aj.valor} onChange={e=>setAj(p=>({...p,valor:e.target.value}))}
                            className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500 bg-white" placeholder="0" />
                        </div>
                      )}
                    </div>
                    {tieneAjuste && <div className="text-[10px] text-amber-700 bg-amber-100 rounded-lg px-2 py-1 mb-2">Ajuste actual: +{ajActual.citas||0} citas · +{ajActual.demos||0} demos · +{ajActual.ventas||0} ventas{!esRacha?` · +$${ajActual.valor||0}`:""}{inc.ajusteEditadoPor?` (por ${inc.ajusteEditadoPor})`:""}</div>}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>setAjusteId(null)} className="px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500">Cancelar</button>
                      <button onClick={()=>guardarAjuste(inc.id)} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{background:"#b45309"}}>Guardar ajuste</button>
                    </div>
                  </div>
                )}

                {/* Render del incentivo */}
                {esRacha ? (
                  <RachaProgreso inc={inc} allData={allData} />
                ) : (()=>{
                  const p=calcularProgresoIncentivo(inc, allData);
                  return (
                    <div className="bg-white rounded-2xl shadow-sm border border-[#e8edf3] overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between" style={{background:"#f9fafb"}}>
                        <div>
                          <div className="font-black text-[#1f2d3d] text-sm">{inc.nombre}</div>
                          <div className="text-[11px] text-slate-400"><Ico e="👤" className="mr-1.5" />{inc.agente||"Todos"} · {inc.fechaInicio} → {inc.fechaFin}</div>
                        </div>
                      </div>
                      <div className="p-4">
                        {inc.premio && <div className="text-xs text-[#b45309] bg-amber-50 rounded-lg px-2 py-1 mb-2 inline-block font-bold"><Ico e="🎁" className="mr-1.5" />{inc.premio}</div>}
                        {p.completado ? (
                          <div className="text-center py-2"><span className="text-2xl"><Ico e="🎉" /></span> <span className="font-black text-[#16a34a]">¡Completado!</span></div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-bold text-slate-400 uppercase">Progreso {p.diasRestantes!==null?`· ${p.diasRestantes} días restantes`:""}</span>
                              <span className="text-lg font-black text-[#5b21b6]" style={{fontFamily:SERIF}}>{p.pct}%</span>
                            </div>
                            <MetaBar label="📅 Citas" actual={p.citas} meta={p.metaCitas} color="#16a34a" />
                            <MetaBar label="🎬 Demostraciones" actual={p.demos} meta={p.metaDemos} color="#7c3aed" />
                            <MetaBar label="💰 Ventas" actual={p.ventas} meta={p.metaVentas} color="#047857" />
                            <MetaBar label="💵 Valor vendido" actual={p.valor} meta={p.metaValor} color="#b45309" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        )}
      </div>
      )}

      {showForm && <IncentivoForm item={editItem} forzarTipo={editItem?null:(tab==="racha"?"racha":"normal")} agentes={agentes} onSave={guardar} onClose={()=>{setShowForm(false);setEditItem(null);}} />}
    </div>
  );
}

// Formulario de incentivo
function IncentivoForm({ item, agentes, onSave, onClose, forzarTipo }) {
  const [tipoInc,setTipoInc]=useState(item?.tipo||forzarTipo||"normal"); // normal | racha
  const [nombre,setNombre]=useState(item?.nombre||"");
  const [agente,setAgente]=useState(item?.agente||(agentes?.[0]||""));
  const [periodo,setPeriodo]=useState(item?.periodo||"semanal");
  const [fechaInicio,setFechaInicio]=useState(item?.fechaInicio||hoyLocal());
  const [fechaFin,setFechaFin]=useState(item?.fechaFin||"");
  const [metaCitas,setMetaCitas]=useState(item?.metaCitas||"");
  const [metaDemos,setMetaDemos]=useState(item?.metaDemos||"");
  const [metaVentas,setMetaVentas]=useState(item?.metaVentas||"");
  const [metaValor,setMetaValor]=useState(item?.metaValor||"");
  const [premio,setPremio]=useState(item?.premio||"");
  const [descripcion,setDescripcion]=useState(item?.descripcion||"");
  // Racha: 4 semanas con metas y bono enlazado, editables
  const [semanas,setSemanas]=useState(item?.semanas || [
    { metaCitas:"", metaDemos:"", metaVentas:"2", bono:"$10" },
    { metaCitas:"", metaDemos:"", metaVentas:"2", bono:"$20" },
    { metaCitas:"", metaDemos:"", metaVentas:"2", bono:"$30" },
    { metaCitas:"", metaDemos:"", metaVentas:"2", bono:"$50 + cena" },
  ]);
  const setSemana=(i,campo,val)=>setSemanas(p=>p.map((s,j)=>j===i?{...s,[campo]:val}:s));
  const addSemana=()=>setSemanas(p=>[...p,{metaCitas:"",metaDemos:"",metaVentas:"",bono:""}]);
  const delSemana=(i)=>setSemanas(p=>p.length>1?p.filter((_,j)=>j!==i):p);

  // Calcular fecha fin automática según periodo
  const aplicarPeriodo=(p)=>{
    setPeriodo(p);
    if(p==="personalizado") return;
    const ini=new Date(fechaInicio+"T00:00:00");
    let dias=7;
    if(p==="quincenal") dias=15;
    if(p==="mensual") dias=30;
    const fin=new Date(ini); fin.setDate(fin.getDate()+dias-1);
    setFechaFin(fin.toISOString().slice(0,10));
  };

  const guardar=()=>{
    if(!nombre.trim()){alert("Ponle un nombre al incentivo");return;}
    if(tipoInc==="racha"){
      // Validar que cada semana tenga al menos una meta
      const algunaSinMeta=semanas.some(s=>!s.metaCitas && !s.metaDemos && !s.metaVentas);
      if(algunaSinMeta){alert("Cada semana de la racha necesita al menos una meta (citas, demos o ventas)");return;}
      onSave({tipo:"racha",nombre:nombre.trim(),agente,fechaInicio,semanas,descripcion:descripcion.trim(),premio:(semanas[semanas.length-1]?.bono||"").trim()});
      return;
    }
    if(!fechaFin){alert("Define la fecha final");return;}
    if(!metaCitas && !metaDemos && !metaVentas && !metaValor){alert("Define al menos una meta");return;}
    onSave({tipo:"normal",nombre:nombre.trim(),agente,periodo,fechaInicio,fechaFin,metaCitas,metaDemos,metaVentas,metaValor,premio:premio.trim(),descripcion:descripcion.trim()});
  };

  return (
    <Modal title={item?<><Ico e="✏" className="mr-1" />Editar incentivo</>:(forzarTipo==="racha"?<><Ico e="🔥" className="mr-1" />Crear racha</>:(forzarTipo==="normal"?<><Ico e="🎯" className="mr-1" />Crear meta normal</>:<><Ico e="🏆" className="mr-1" />Crear incentivo</>))} onClose={onClose}>
      <div className="space-y-3">
        {/* Selector de tipo: normal o racha */}
        {!forzarTipo && (
        <Field label="Tipo de incentivo">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>setTipoInc("normal")} className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition ${tipoInc==="normal"?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-500"}`}><Ico e="🎯" className="mr-1.5" />Meta normal</button>
            <button type="button" onClick={()=>setTipoInc("racha")} className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition ${tipoInc==="racha"?"border-[#7c3aed] bg-[#7c3aed]/5 text-[#7c3aed]":"border-[#e5def4] text-slate-500"}`}><Ico e="🔥" className="mr-1.5" />Racha (4 semanas)</button>
          </div>
        </Field>
        )}

        <Field label="Nombre del incentivo"><input value={nombre} onChange={e=>setNombre(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="Ej: Reto de la semana" /></Field>
        <Field label="Descripción"><textarea value={descripcion} onChange={e=>setDescripcion(e.target.value)} rows={2} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed] resize-none" placeholder="Describe la misión (opcional)" /></Field>
        <Field label="Agente asignado">
          <select value={agente} onChange={e=>setAgente(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#7c3aed]">
            {(agentes||[]).map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </Field>

        {tipoInc==="racha" ? (
          <>
            <Field label="Inicio de la racha"><input type="date" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" /></Field>
            <div className="text-[11px] font-bold text-[#7c3aed] uppercase tracking-wider pt-1"><Ico e="🔥" className="mr-1.5" />Semanas de la racha (metas y bono editables)</div>
            <div className="text-[10px] text-slate-400 -mt-1">Cumplir la meta de cada semana mantiene la racha. Falla 1 → usa la vida 🛡️. Falla 2 → vuelve a empezar. Completa todas → bono final + reinicia.</div>
            <div className="space-y-2">
              {semanas.map((s,i)=>(
                <div key={i} className="border-2 border-[#7c3aed]/15 rounded-xl p-2.5 bg-[#f9f5ff]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-[#7c3aed]">Semana {i+1}</span>
                    {semanas.length>1 && <button type="button" onClick={()=>delSemana(i)} className="text-red-400 text-xs font-bold"><Ico e="✕" className="mr-1.5" />Quitar</button>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="📅" className="mr-1.5" />Citas</div>
                      <input type="number" value={s.metaCitas} onChange={e=>setSemana(i,"metaCitas",e.target.value)} className="w-full border border-[#e5def4] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" placeholder="0" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="🎬" className="mr-1.5" />Demos</div>
                      <input type="number" value={s.metaDemos} onChange={e=>setSemana(i,"metaDemos",e.target.value)} className="w-full border border-[#e5def4] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" placeholder="0" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="💰" className="mr-1.5" />Ventas</div>
                      <input type="number" value={s.metaVentas} onChange={e=>setSemana(i,"metaVentas",e.target.value)} className="w-full border border-[#e5def4] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 mb-0.5"><Ico e="🎁" className="mr-1.5" />Bono de la semana</div>
                    <input value={s.bono} onChange={e=>setSemana(i,"bono",e.target.value)} className="w-full border border-[#e5def4] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" placeholder="Ej: $10, $50 + cena" />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addSemana} className="w-full px-3 py-2 rounded-xl text-xs font-bold text-[#7c3aed] border-2 border-dashed border-[#7c3aed]/30">+ Agregar semana</button>
          </>
        ) : (
          <>
            <Field label="Periodo">
              <div className="grid grid-cols-4 gap-1.5">
                {[["semanal","Semanal"],["quincenal","Quincenal"],["mensual","Mensual"],["personalizado","Personal."]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>aplicarPeriodo(v)} className={`px-2 py-2 rounded-lg text-[11px] font-bold border-2 ${periodo===v?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-500"}`}>{l}</button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Inicio"><input type="date" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" /></Field>
              <Field label="Fin"><input type="date" value={fechaFin} onChange={e=>setFechaFin(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" /></Field>
            </div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pt-1">Metas (llena las que apliquen)</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={<><Ico e="📅" className="mr-1" />Citas</>}><input type="number" value={metaCitas} onChange={e=>setMetaCitas(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="0" /></Field>
              <Field label={<><Ico e="🎬" className="mr-1" />Demostraciones</>}><input type="number" value={metaDemos} onChange={e=>setMetaDemos(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="0" /></Field>
              <Field label={<><Ico e="💰" className="mr-1" />Ventas</>}><input type="number" value={metaVentas} onChange={e=>setMetaVentas(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="0" /></Field>
              <Field label={<><Ico e="💵" className="mr-1" />Valor vendido $</>}><input type="number" value={metaValor} onChange={e=>setMetaValor(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="0" /></Field>
            </div>
            <Field label={<><Ico e="🎁" className="mr-1" />Premio / recompensa</>}><input value={premio} onChange={e=>setPremio(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="Ej: $100 de bono / cena / día libre" /></Field>
          </>
        )}
        <button onClick={guardar} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:"#16a34a"}}><Ico e="💾" className="mr-1.5" />Guardar incentivo</button>
      </div>
    </Modal>
  );
}


// ─── RUTAS GUARDADAS ──────────────────────────────────────────
// Recolecta TODOS los clientes y referidos como candidatos para rutas.
function recolectarParaRutas(allData) {
  const out = [];
  ["agregados","prospectos","distribucion"].forEach(sec=>{
    (allData[sec]||[]).filter(c=>!c.eliminado).forEach(c=>{
      out.push({
        id: c.id, _tipo: sec, _origen: sec,
        nombre: c.nombre||"(Sin nombre)",
        telefono: c.telefono||c.telefonoMovil||"",
        direccion: c.direccion||"", ciudad: c.ciudad||"", cp: c.cp||"",
        estado: c.estado||"sin_estado",
      });
    });
  });
  (allData.referidos||[]).forEach(anf=>{
    (anf.referidos||[]).forEach((r,i)=>{
      if(!(r.nombre&&r.nombre!=="(Referido sin nombre)")&&!r.telefono) return;
      out.push({
        id: `${anf.id}::${i}`, _tipo: "referidos", _origen: "referidos",
        nombre: r.nombre||"(Referido)", _anfitrion: anf.anfitrion||"",
        telefono: r.telefono||"",
        direccion: r.direccion||"", ciudad: r.ciudad||"", cp: r.cp||"",
        estado: r.estado||"sin_estado",
      });
    });
  });
  return out;
}
// ¿Tiene dirección suficiente para visita? (calle con número)
function dirSuficiente(c) {
  const dir=(c.direccion||"").trim();
  const ciudad=(c.ciudad||"").trim().toLowerCase();
  return dir.length>0 && dir.toLowerCase()!==ciudad && /\d/.test(dir);
}
// Genera link de Google Maps con varias paradas
function rutaMapsLink(clientes) {
  const dirs = clientes.map(c=>{
    const partes=[c.direccion, c.ciudad, c.cp].filter(Boolean);
    return partes.join(", ");
  }).filter(Boolean);
  if(dirs.length===0) return "";
  if(dirs.length===1) return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(dirs[0]);
  const destino=encodeURIComponent(dirs[dirs.length-1]);
  const waypoints=dirs.slice(0,-1).map(encodeURIComponent).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}${waypoints?`&waypoints=${waypoints}`:""}&travelmode=driving`;
}

const ESTADO_RUTA={
  pendiente:{ico:"⏳", label:"Pendiente",bg:"#fef3e2",color:"#b45309"},
  proceso:{ico:"🚗", label:"En proceso",bg:"#e0edff",color:"#1d4ed8"},
  completada:{ico:"✅", label:"Completada",bg:"#e7f6ec",color:"#047857"},
};

function RutasSection({ rutas, setRutas, allData, agentes, agente, notify }) {
  const [showCrear,setShowCrear]=useState(false);
  const candidatos = recolectarParaRutas(allData);

  const guardarRuta=(ruta)=>{
    const nueva={...ruta, id:genId(), creado:new Date().toISOString(), estadoRuta:"pendiente"};
    setRutas(p=>[nueva,...p]);
    setShowCrear(false);
    if(notify) notify("datos", `🗺️ Nueva ruta: ${ruta.nombreRuta}`, `${ruta.clientes.length+ruta.referidos.length} paradas · ${ruta.ciudad||ruta.codigoPostal||"mixta"}`, "🗺️ Rutas");
  };
  const cambiarEstado=(id,estado)=>setRutas(p=>p.map(r=>r.id===id?{...r,estadoRuta:estado}:r));
  const eliminarRuta=(id)=>{ if(confirm("¿Eliminar esta ruta? Los clientes NO se borran, solo la ruta.")) setRutas(p=>p.filter(r=>r.id!==id)); };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}><Ico e="🗺" className="mr-1.5" />Rutas de visita</h2>
        <p className="text-xs text-slate-400 mt-1 mb-3">Agrupa clientes y referidos por zona para planear tus visitas. Los clientes nunca se borran al agregarlos a una ruta.</p>
        <button onClick={()=>setShowCrear(true)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white" style={{background:RP.navy}}>+ Crear ruta</button>
      </div>

      {rutas.length===0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
          <div className="mb-2 flex justify-center"><Ico e="🗺" size={36} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-sm text-slate-400">Aún no hay rutas. Crea la primera para organizar tus visitas por zona.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rutas.map(ruta=>{
            const er=ESTADO_RUTA[ruta.estadoRuta]||ESTADO_RUTA.pendiente;
            const paradas=[...(ruta.clientes||[]),...(ruta.referidos||[])];
            const conDir=paradas.filter(p=>dirSuficiente(p));
            const mapsUrl=rutaMapsLink(conDir);
            return (
              <div key={ruta.id} className="bg-white rounded-2xl shadow-sm border border-[#e8edf3] overflow-hidden">
                <div className="px-4 py-3" style={{background:"#f9fafb"}}>
                  <div className="flex items-center justify-between">
                    <div className="font-black text-[#1f2d3d] text-sm">{ruta.nombreRuta}</div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:er.bg,color:er.color}}>{er.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {ruta.fechaRuta?`📅 ${ruta.fechaRuta} · `:""}{ruta.ciudad?`🏙️ ${ruta.ciudad} · `:""}{ruta.codigoPostal?`📮 ${ruta.codigoPostal} · `:""}{paradas.length} parada(s){ruta.agenteAsignado?` · 👤 ${ruta.agenteAsignado}`:""}
                  </div>
                </div>
                <div className="p-3">
                  <div className="space-y-1 max-h-52 overflow-y-auto mb-3">
                    {paradas.map((p,i)=>{
                      const ok=dirSuficiente(p);
                      return (
                        <div key={i} className="flex items-start gap-2 bg-[#f4f6f9] rounded-lg px-2.5 py-1.5 text-xs">
                          <span className="font-black text-[#7c3aed] shrink-0">{i+1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-700 truncate">{p.nombre}{p._origen==="referidos"?" 🎁":""}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {ok? `📍 ${[p.direccion,p.ciudad,p.cp].filter(Boolean).join(", ")}` : <span className="text-amber-500"><Ico e="⚠" className="mr-1.5" />Dirección incompleta{p.ciudad?` (${p.ciudad})`:""}</span>}
                            </div>
                          </div>
                          {p.telefono && <a href={"tel:"+p.telefono.replace(/[^0-9]/g,"").slice(-10)} className="text-[#16a34a] shrink-0"><Ico e="📞" /></a>}
                        </div>
                      );
                    })}
                  </div>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className="block w-full text-center px-4 py-2.5 rounded-lg text-sm font-bold text-white mb-2" style={{background:"#1a73e8"}}>
                      <Ico e="🗺" className="mr-1.5" />Abrir en Google Maps ({conDir.length} con dirección)
                    </a>
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(ESTADO_RUTA).map(([k,v])=>(
                      <button key={k} onClick={()=>cambiarEstado(ruta.id,k)} className={`flex-1 text-[11px] font-bold py-1.5 px-2 rounded-lg border-2 transition ${ruta.estadoRuta===k?"border-current":"border-transparent"}`} style={{background:v.bg,color:v.color}}>{v.label}</button>
                    ))}
                  </div>
                  <button onClick={()=>eliminarRuta(ruta.id)} className="w-full text-xs font-bold text-red-400 mt-2 py-1"><Ico e="🗑" className="mr-1.5" />Eliminar ruta</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCrear && <RutaCrear candidatos={candidatos} agentes={agentes} agente={agente} onSave={guardarRuta} onClose={()=>setShowCrear(false)} />}
    </div>
  );
}

// Modal para crear una ruta (manual, por ciudad o por ZIP)
function RutaCrear({ candidatos, agentes, agente, onSave, onClose }) {
  const [modo,setModo]=useState("manual");  // manual | ciudad | zip
  const [nombreRuta,setNombreRuta]=useState("");
  const [fechaRuta,setFechaRuta]=useState(hoyLocal());
  const [agenteAsignado,setAgenteAsignado]=useState(agente||(agentes?.[0]||""));
  const [seleccion,setSeleccion]=useState([]);  // ids seleccionados (modo manual)
  const [ciudadSel,setCiudadSel]=useState("");
  const [zipSel,setZipSel]=useState("");

  // Listas de ciudades y ZIPs disponibles con conteo
  const ciudades={}; const zips={};
  candidatos.forEach(c=>{
    if(c.ciudad){ ciudades[c.ciudad]=(ciudades[c.ciudad]||0)+1; }
    if(c.cp){ zips[c.cp]=(zips[c.cp]||0)+1; }
  });
  const ciudadesOrd=Object.entries(ciudades).sort((a,b)=>b[1]-a[1]);
  const zipsOrd=Object.entries(zips).sort((a,b)=>b[1]-a[1]);

  const toggle=(id)=>setSeleccion(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const construir=()=>{
    let elegidos=[];
    let ciudad="", codigoPostal="";
    if(modo==="manual"){
      elegidos=candidatos.filter(c=>seleccion.includes(c.id));
    } else if(modo==="ciudad"){
      if(!ciudadSel){alert("Elige una ciudad");return;}
      ciudad=ciudadSel;
      elegidos=candidatos.filter(c=>(c.ciudad||"").toLowerCase()===ciudadSel.toLowerCase());
    } else if(modo==="zip"){
      if(!zipSel){alert("Elige un código postal");return;}
      codigoPostal=zipSel;
      elegidos=candidatos.filter(c=>(c.cp||"")===zipSel);
    }
    if(elegidos.length===0){alert("No hay clientes para esta ruta");return;}
    if(!nombreRuta.trim()){alert("Ponle un nombre a la ruta");return;}
    const clientes=elegidos.filter(c=>c._origen!=="referidos");
    const referidos=elegidos.filter(c=>c._origen==="referidos");
    onSave({ nombreRuta:nombreRuta.trim(), fechaRuta, ciudad, codigoPostal, clientes, referidos, agenteAsignado });
  };

  const previewCount = modo==="manual" ? seleccion.length
    : modo==="ciudad" ? (ciudadSel?candidatos.filter(c=>(c.ciudad||"").toLowerCase()===ciudadSel.toLowerCase()).length:0)
    : (zipSel?candidatos.filter(c=>(c.cp||"")===zipSel).length:0);

  return (
    <Modal title="🗺️ Crear ruta" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre de la ruta"><input value={nombreRuta} onChange={e=>setNombreRuta(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" placeholder="Ej: Visitas Temple lunes" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha"><input type="date" value={fechaRuta} onChange={e=>setFechaRuta(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed]" /></Field>
          <Field label="Agente"><select value={agenteAsignado} onChange={e=>setAgenteAsignado(e.target.value)} className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#7c3aed]">{(agentes||[]).map(a=><option key={a} value={a}>{a}</option>)}</select></Field>
        </div>
        <Field label="¿Cómo armar la ruta?">
          <div className="grid grid-cols-3 gap-1.5">
            {[["manual","✋ Manual"],["ciudad","🏙️ Por ciudad"],["zip","📮 Por ZIP"]].map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setModo(v)} className={`px-2 py-2 rounded-lg text-[11px] font-bold border-2 ${modo===v?"border-[#5b21b6] bg-[#5b21b6]/5 text-[#5b21b6]":"border-[#e5def4] text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </Field>

        {modo==="manual" && (
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Selecciona clientes ({seleccion.length})</div>
            <div className="max-h-56 overflow-y-auto space-y-1 bg-[#f4f6f9] rounded-xl p-2">
              {candidatos.map(c=>(
                <button key={c.id} type="button" onClick={()=>toggle(c.id)} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition ${seleccion.includes(c.id)?"bg-[#5b21b6] text-white":"bg-white text-slate-700 border border-[#e8edf3]"}`}>
                  <span className="shrink-0">{seleccion.includes(c.id)?"☑️":"⬜"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{c.nombre}{c._origen==="referidos"?" 🎁":""}</div>
                    <div className={`text-[10px] truncate ${seleccion.includes(c.id)?"text-white/70":"text-slate-400"}`}>{[c.ciudad,c.cp].filter(Boolean).join(" · ")||"sin zona"}{dirSuficiente(c)?"":" ⚠️"}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {modo==="ciudad" && (
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Elige ciudad</div>
            <div className="max-h-56 overflow-y-auto space-y-1 bg-[#f4f6f9] rounded-xl p-2">
              {ciudadesOrd.length===0 && <div className="text-xs text-slate-400 p-2">No hay ciudades registradas en tus clientes.</div>}
              {ciudadesOrd.map(([ciu,n])=>(
                <button key={ciu} type="button" onClick={()=>setCiudadSel(ciu)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition ${ciudadSel===ciu?"bg-[#5b21b6] text-white":"bg-white text-slate-700 border border-[#e8edf3]"}`}>
                  <span><Ico e="🏙" className="mr-1.5" />{ciu}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ciudadSel===ciu?"bg-white/20":"bg-[#f1ecfd] text-[#5b21b6]"}`}>{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {modo==="zip" && (
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Elige código postal</div>
            <div className="max-h-56 overflow-y-auto space-y-1 bg-[#f4f6f9] rounded-xl p-2">
              {zipsOrd.length===0 && <div className="text-xs text-slate-400 p-2">No hay códigos postales registrados en tus clientes.</div>}
              {zipsOrd.map(([z,n])=>(
                <button key={z} type="button" onClick={()=>setZipSel(z)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition ${zipSel===z?"bg-[#5b21b6] text-white":"bg-white text-slate-700 border border-[#e8edf3]"}`}>
                  <span><Ico e="📮" className="mr-1.5" />{z}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${zipSel===z?"bg-white/20":"bg-[#f1ecfd] text-[#5b21b6]"}`}>{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#f1ecfd] rounded-xl px-3 py-2 text-xs font-bold text-[#5b21b6] text-center">{previewCount} parada(s) en esta ruta</div>
        <button onClick={construir} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:"#16a34a"}}><Ico e="💾" className="mr-1.5" />Guardar ruta</button>
      </div>
    </Modal>
  );
}


// ─── PESTAÑA SERVICIO ─────────────────────────────────────────
// Los servicios son citas (appts) con tipo "servicio".
// Cada servicio puede marcarse: realizado / no realizado, y guardar nota.
// El servicio SIEMPRE se ve rojo; solo el indicador "se realizó" se pone verde.
const SERVICIO_ESTADO = {
  pendiente:    { ico:"🔧", label:"Pendiente",     bg:"rgba(248,113,113,0.14)", color:"#FCA5A5", dot:"#ef4444" },
  realizado:    { ico:"✅", label:"Se realizó",    bg:"rgba(74,222,128,0.14)",  color:"#6EE7B7", dot:"#16a34a" },
  no_realizado: { ico:"❌", label:"No se realizó", bg:"rgba(248,113,113,0.14)", color:"#FCA5A5", dot:"#ef4444" },
};

// ── CARTUCHOS Y FILTROS (dentro de Servicios): todos los cambios ordenados
// por el más próximo, con ficha del cliente, llamada, WhatsApp listo y agendar cita.
function CartuchosServicioPanel({ allData, appts, setAppts, agente, notify }){
  const [busca,setBusca]=useState("");
  const noE=a=>(a||[]).filter(c=>!c.eliminado);
  const flat=[...noE(allData.agregados),...noE(allData.prospectos),...noE(allData.distribucion),...noE(allData.referidos)];
  const lista=calcularCartuchos(flat, appts, 36500) // ventana infinita → TODOS, del más próximo al más lejano
    .filter(x=>{ const q=(busca||"").toLowerCase(); return !q || (x.nombre||"").toLowerCase().includes(q) || (x.producto||"").toLowerCase().includes(q); });
  const vencidos=lista.filter(x=>x.vencido).length;
  const fFecha=(d)=>d.toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});
  const msgWA=(x)=>encodeURIComponent(`¡Hola ${(x.nombre||"").split(" ")[0]}! 👋 Le saluda ${agente||"su equipo"} de Royal Prestige. Le corresponde el cambio de ${x.producto||"su cartucho"}${x.vencido?" (ya está vencido ⚠️)":` el ${fFecha(x.proxFecha)}`}. ¿Qué día le viene bien para agendar su visita y dejar su agua como nueva? 💧`);
  const agendar=(x)=>{
    const fechaISO=new Date(Math.max(x.proxFecha.getTime(), Date.now())).toISOString().slice(0,10);
    setAppts(p=>[...(p||[]),{ id:genId(), tipo:"servicio", nombre:x.nombre, telefono:x.telefono||"", fecha:fechaISO, hora:"", notas:`🔔 Cambio de cartucho: ${x.producto||""}`.trim(), agente, creado:new Date().toISOString() }]);
    notify && notify("servicio",`📅 Servicio agendado: ${x.nombre}`,`Cambio de ${x.producto||"cartucho"} — ${fechaISO}. Ajusta la hora en Servicios/Agenda.`,"🔧 Servicios");
    alert(`✅ Cita de servicio creada para ${x.nombre} (${fechaISO}). Ajusta la hora en la pestaña Servicios.`);
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input className={inpLight+" flex-1"} placeholder="Buscar por cliente o producto…" value={busca} onChange={e=>setBusca(e.target.value)} />
        {vencidos>0 && <span className="shrink-0 text-[11px] font-black text-white bg-red-500 px-2.5 py-1.5 rounded-full"><Ico e="⚠" className="mr-1.5" />{vencidos} vencido(s)</span>}
      </div>
      {lista.length===0 && <div className="text-center py-12 text-slate-400"><div className="mb-3 flex justify-center"><Ico e="💧" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm font-bold">Sin cambios de cartucho registrados.</div><div className="text-xs mt-1">Se llenan solos al registrar ventas de filtros o purificador.</div></div>}
      <div className="space-y-2">
        {lista.map((x,i)=>{
          const tel=(x.telefono||"").replace(/\D/g,"");
          return (
            <div key={`cs-${i}`} className={`bg-white rounded-2xl border p-3 shadow-sm ${x.vencido?"border-red-300":"border-[#e8edf3]"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#1f2d3d] truncate" style={{fontFamily:SERIF}}>{x.nombre}</div>
                  <div className="text-xs text-slate-500 truncate mt-0.5"><Ico e="💧" className="mr-1.5" />{x.producto||"Filtro"}{x.telefono?` · 📞 ${x.telefono}`:""}</div>
                  <div className="text-xs mt-1">
                    {x.vencido
                      ? <span className="font-black text-red-500"><Ico e="⚠" className="mr-1.5" />VENCIDO hace {Math.abs(x.diasFaltan)} día(s)</span>
                      : <span className="font-black text-teal-600">En {x.diasFaltan} día(s)</span>} · 🗓️ {fFecha(x.proxFecha)} · <span className="text-slate-400">ciclo desde {x.fechaVenta?String(x.fechaVenta).slice(0,10):"—"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div className="flex gap-1.5">
                    {tel && <a href={`tel:${tel}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-white text-sm" style={{background:RP.blue}}><Ico e="📞" /></a>}
                    {tel && <a href={`https://wa.me/${tel}?text=${msgWA(x)}`} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center rounded-lg text-white text-sm" style={{background:"#25D366"}}>💬</a>}
                  </div>
                  <button onClick={()=>agendar(x)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{background:RP.navy}}><Ico e="📅" className="mr-1.5" />Agendar</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-slate-400 mt-3 text-center">Ordenado del cambio más próximo al más lejano · los vencidos van primero.</div>
    </div>
  );
}

function ServicioSection({ appts, setAppts, agente, notify, allData }) {
  const [vista,setVista]=useState("servicios"); // servicios | cartuchos
  const [filtro,setFiltro]=useState("todos"); // todos | pendiente | realizado | no_realizado
  const [expandido,setExpandido]=useState(null);
  const [notaEdit,setNotaEdit]=useState({});const [ventaForm,setVentaForm]=useState(null); // {servId, monto, prod}

  // Solo los appts de tipo servicio
  const servicios=(appts||[]).filter(a=>a.tipo==="servicio");
  const hoyISO=hoyLocal();

  // Estado derivado de cada servicio
  const estadoDe=(s)=> s.servicioResultado || "pendiente";

  const filtrados=servicios.filter(s=>{
    if(filtro==="todos") return true;
    return estadoDe(s)===filtro;
  }).sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));

  const conteos={
    todos: servicios.length,
    pendiente: servicios.filter(s=>estadoDe(s)==="pendiente").length,
    realizado: servicios.filter(s=>estadoDe(s)==="realizado").length,
    no_realizado: servicios.filter(s=>estadoDe(s)==="no_realizado").length,
  };

  // Marcar resultado del servicio — mismo abanico que la agenda:
  // venta (con monto y producto), realizado, no recibió, no se visitó, reset.
  // La venta alimenta ventas/volumen de estadísticas (resultado demo_venta + monto)
  // y, si el producto tiene ciclo de mantenimiento, agenda el recordatorio.
  const marcarResultado=(servId, resultado, extra={})=>{
    const montoNum = resultado==="venta" ? Number(extra.monto)||0 : 0;
    const prodLabel = extra.producto || "";
    const meses = Number(extra.meses)||0;
    const sv = servicios.find(x=>x.id===servId);
    setAppts(p=>{
      let out = p.map(s=>{
        if(s.id!==servId) return s;
        const histPrev=s.servicioHistorial||[];
        const interno = resultado==="venta" ? "realizado" : (resultado==="no_recibio"||resultado==="no_visito") ? "no_realizado" : resultado==="reset" ? "pendiente" : resultado;
        return {
          ...s,
          servicioResultado:interno,
          // resultado estilo agenda → cuenta en Control de Actividad y Estadísticas
          ...(resultado==="venta" ? { resultado:"demo_venta", venta:true, monto:montoNum, producto:prodLabel||s.producto } :
              resultado==="no_recibio" ? { resultado:"no_recibio", venta:false } :
              resultado==="no_visito" ? { resultado:"no_visito", venta:false } :
              resultado==="reset" ? { resultado:"reset" } :
              resultado==="realizado" ? { resultado:"servicio_realizado" } : {}),
          servicioHistorial:[...histPrev,{resultado,monto:montoNum||undefined,producto:prodLabel||undefined,fecha:new Date().toISOString(),agente}],
          actualizado:new Date().toISOString(),
        };
      });
      // Recordatorio de mantenimiento (igual que en agenda): a +N meses
      if(resultado==="venta" && meses>0 && sv){
        const f=new Date(); f.setMonth(f.getMonth()+meses);
        out=[...out,{ id:genId(), tipo:"servicio", nombre:sv.nombre, telefono:sv.telefono||"", direccion:sv.direccion||"", ciudad:sv.ciudad||"",
          fecha:f.toISOString().slice(0,10)+"T09:00", producto:prodLabel, notas:`🔁 Mantenimiento ${prodLabel} (cada ${meses} meses)`, creado_por:agente }];
      }
      return out;
    });
    if(notify){
      const nom = sv?.nombre||"Cliente";
      if(resultado==="venta") notify("resultado", `💰 Venta en servicio por ${agente}`, `${nom} · ${prodLabel}${montoNum?` · $${montoNum}`:""}`, "🔧 Servicio");
      else if(resultado==="realizado") notify("resultado", `🔧 Servicio realizado`, nom, "🔧 Servicio");
    }
  };

  // Guardar nota del servicio (se acumula, no borra anterior)
  const guardarNota=(servId)=>{
    const texto=(notaEdit[servId]||"").trim();
    if(!texto) return;
    setAppts(p=>p.map(s=>{
      if(s.id!==servId) return s;
      const notasPrev=s.servicioNotas||[];
      return {
        ...s,
        servicioUltimaNota:texto,
        servicioNotas:[...notasPrev,{texto,fecha:new Date().toISOString(),agente}],
        actualizado:new Date().toISOString(),
      };
    }));
    setNotaEdit(p=>({...p,[servId]:""}));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-[#5b21b6]" style={{fontFamily:SERIF}}><Ico e="🔧" className="mr-1.5" />Servicios</h2>
        <p className="text-xs text-slate-400 mt-1">Servicios agendados, su resultado y notas. Conectados con el cliente.</p>
        <div className="flex gap-1.5 mt-3">
          {[["servicios","🔧","Servicios"],["cartuchos","💧","Cartuchos y filtros"]].map(([id,ico,label])=>(
            <button key={id} onClick={()=>setVista(id)}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition ${vista===id?"text-white":"bg-white text-slate-500 border border-[#e8edf3]"}`}
              style={vista===id?{background:RP.navy}:{}}><span className="inline-flex items-center justify-center gap-1.5"><Ico e={ico} size={13} />{label}</span></button>
          ))}
        </div>
      </div>

      {vista==="cartuchos" ? (
        <CartuchosServicioPanel allData={allData||{}} appts={appts} setAppts={setAppts} agente={agente} notify={notify} />
      ) : (<>

      {/* Filtros por estado */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          {id:"todos",label:"Todos",n:conteos.todos},
          {id:"pendiente",ico:"⏳", label:"Pend.",n:conteos.pendiente},
          {id:"realizado",ico:"✅", label:"Hechos",n:conteos.realizado},
          {id:"no_realizado",ico:"❌", label:"No",n:conteos.no_realizado},
        ].map(t=>(
          <button key={t.id} onClick={()=>setFiltro(t.id)}
            className={`px-1 py-2.5 rounded-xl text-[11px] font-bold transition flex flex-col items-center gap-0.5 ${filtro===t.id?"text-white":"text-slate-600 bg-[#f4f6f9]"}`}
            style={filtro===t.id?{background:RP.navy}:{}}>
            <span>{t.label}</span>
            <span className={`text-base font-black ${filtro===t.id?"text-white":"text-[#5b21b6]"}`} style={{fontFamily:SERIF}}>{t.n}</span>
          </button>
        ))}
      </div>

      {filtrados.length===0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]">
          <div className="mb-2 flex justify-center"><Ico e="🔧" size={36} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-sm text-slate-400">No hay servicios {filtro!=="todos"?"en este estado":"agendados todavía"}.</div>
          <div className="text-xs text-slate-400 mt-1">Agenda un servicio desde una tarjeta de cliente (botón Agendar → tipo Servicio).</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(s=>{
            const est=estadoDe(s);
            const info=SERVICIO_ESTADO[est];
            const d=s.fecha?new Date(s.fecha):null;
            const fechaStr=d?d.toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"}):"Sin fecha";
            const horaStr=d?d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"";
            const esHoy=s.fecha&&(s.fecha||"").slice(0,10)===hoyISO;
            const abierto=expandido===s.id;
            return (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-[#e8edf3] overflow-hidden">
                <div className="px-4 py-3" style={{background:info.bg}}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{background:info.dot}} />
                      <span className="font-black text-sm" style={{color:"#F4F4F1"}}>{s.nombre||"Cliente"}</span>
                      {esHoy && <span className="text-[9px] font-black text-white bg-[#16a34a] px-1.5 py-0.5 rounded-full">HOY</span>}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{background:est==="realizado"?"#16a34a":"#dc2626"}}>{info.label}</span>
                  </div>
                  <div className="text-[11px] mt-1" style={{color:"#A5A9B0"}}><Ico e="🗓" className="mr-1.5" />{fechaStr}{horaStr?<> · <Ico e="🕐" /> {horaStr}</>:null}{s.agente?<> · <Ico e="👤" /> {s.agente}</>:null}</div>
                </div>
                <div className="p-3">
                  {/* Info del cliente */}
                  <div className="space-y-1 text-xs mb-3">
                    {s.telefono && <div className="flex items-center gap-2"><span className="text-slate-400"><Ico e="📞" /></span><a href={"tel:"+(s.telefono||"").replace(/[^0-9]/g,"").slice(-10)} className="text-[#7c3aed] font-bold">{s.telefono}</a></div>}
                    {(s.direccion||s.ciudad) && <div className="flex items-start gap-2"><span className="text-slate-400"><Ico e="📍" /></span><span className="text-slate-600">{[s.direccion,s.ciudad,s.cp].filter(Boolean).join(", ")}</span></div>}
                    {s.producto && <div className="flex items-center gap-2"><span className="text-slate-400"><Ico e="🔧" /></span><span className="text-slate-600">{s.producto}</span></div>}
                    {s.servicioUltimaNota && <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-2 py-1.5 mt-1"><span><Ico e="📌" /></span><span className="text-slate-700">{s.servicioUltimaNota}</span></div>}
                  </div>

                  {/* Botones de resultado — mismo abanico que la agenda */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button onClick={()=>marcarResultado(s.id,"realizado")}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold transition ${est==="realizado"?"text-white ring-2 ring-offset-1 ring-emerald-500":"text-emerald-700 bg-emerald-50"}`}
                      style={est==="realizado"?{background:"#16a34a"}:{}}><Ico e="✅" className="mr-1.5" />Servicio realizado</button>
                    <button onClick={()=>setVentaForm(ventaForm&&ventaForm.servId===s.id?null:{servId:s.id,monto:"",prod:""})}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-white transition"
                      style={{background:"#047857"}}><Ico e="💰" className="mr-1.5" />Venta</button>
                    <button onClick={()=>marcarResultado(s.id,"no_recibio")}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-white transition" style={{background:"#dc2626"}}><Ico e="🚪" className="mr-1.5" />No recibió</button>
                    <button onClick={()=>marcarResultado(s.id,"no_visito")}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-white transition" style={{background:"#9333ea"}}><Ico e="🚷" className="mr-1.5" />No se visitó</button>
                  </div>
                  <button onClick={()=>marcarResultado(s.id,"reset")}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white mb-2" style={{background:"#0891b2"}}><Ico e="🔄" className="mr-1.5" />Reset servicio (queda pendiente)</button>
                  {ventaForm && ventaForm.servId===s.id && (
                    <div className="mb-2 p-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 space-y-2">
                      <select className="w-full border border-emerald-300 rounded-lg px-2 py-2 text-xs bg-white font-bold"
                        value={ventaForm.prod} onChange={e=>setVentaForm({...ventaForm,prod:e.target.value})}>
                        <option value="">Producto vendido…</option>
                        {PRODUCTOS_VENTA.flatMap(p=>p.sub?p.sub.map(sb=>({id:p.id+"::"+sb.id,label:sb.label,meses:sb.meses||0})):[{id:p.id,label:p.label,meses:p.meses||0}]).map(o=>(
                          <option key={o.id} value={o.label+"|"+o.meses}>{o.label}{o.meses?` (mant. ${o.meses}m)`:""}</option>
                        ))}
                      </select>
                      <input type="number" inputMode="decimal" className="w-full border border-emerald-300 rounded-lg px-2 py-2 text-xs bg-white"
                        placeholder="Monto de la venta" value={ventaForm.monto} onChange={e=>setVentaForm({...ventaForm,monto:e.target.value})} />
                      <button disabled={!ventaForm.prod} onClick={()=>{ const [lbl,ms]=ventaForm.prod.split("|"); marcarResultado(s.id,"venta",{monto:ventaForm.monto,producto:lbl,meses:+ms||0}); setVentaForm(null); }}
                        className="w-full px-3 py-2 rounded-lg text-xs font-black text-white disabled:opacity-40" style={{background:"#047857"}}>Registrar venta ✓</button>
                    </div>
                  )}

                  {/* Detalles + nota */}
                  <button onClick={()=>setExpandido(abierto?null:s.id)} className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-[#e5def4] bg-[#f4f6f9] text-xs font-bold text-[#5b21b6]">
                    <span><Ico e="📝" className="mr-1.5" />{abierto?"Ocultar":"Ver detalles y nota"}</span>
                    <span className={`transition-transform duration-200 ${abierto?"rotate-180":""}`}>▾</span>
                  </button>
                  {abierto && (
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-1.5">
                        <input value={notaEdit[s.id]||""} onChange={e=>setNotaEdit(p=>({...p,[s.id]:e.target.value}))}
                          onKeyDown={e=>{if(e.key==="Enter")guardarNota(s.id);}}
                          placeholder="Escribir nota del servicio…"
                          className="flex-1 border border-[#e5def4] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#7c3aed]" />
                        <button onClick={()=>guardarNota(s.id)} disabled={!(notaEdit[s.id]||"").trim()}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{background:"#16a34a"}}>Guardar</button>
                      </div>
                      {(s.servicioNotas||[]).length>0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Historial de notas</div>
                          {[...(s.servicioNotas||[])].reverse().map((n,i)=>{
                            const nd=new Date(n.fecha);
                            return (
                              <div key={i} className="bg-[#f4f6f9] rounded-lg px-2 py-1.5 text-[11px]">
                                <div className="text-slate-700">{n.texto}</div>
                                <div className="text-[9px] text-slate-400 mt-0.5"><Ico e="📅" className="mr-1.5" />{nd.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} 🕐 {nd.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}{n.agente?<> · <Ico e="👤" /> {n.agente}</>:null}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(s.servicioHistorial||[]).length>0 && (
                        <div className="text-[10px] text-slate-400">
                          Último cambio de resultado: {SERVICIO_ESTADO[s.servicioHistorial[s.servicioHistorial.length-1].resultado]?.label} · {new Date(s.servicioHistorial[s.servicioHistorial.length-1].fecha).toLocaleDateString("es-MX",{day:"numeric",month:"short"})}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}


// ─── CONFIGURACIÓN — cambiar claves de acceso ─────────────────
function ConfigSection({ agenteActivo, onCerrarSesion, rolActivo, emailActivo, cuentasCustom, onSaveCuentas, allData, onLimpiarSinTelefono, onExtraerCP, cumpleMsgTpl, onSaveCumpleMsg }) {
  const esDistribuidor = normalizarRol(rolActivo)==="Distribuidor"; // solo el distribuidor gestiona usuarios
  // ── Panel de usuarios: correo → nombre y rol (vive en Firebase, sin redesplegar) ──
  const [rNombre,setRNombre]=useState("");
  const [rEmail,setREmail]=useState("");
  const [rRol,setRRol]=useState(ROLES_DISPONIBLES[2]);
  const [rMsg,setRMsg]=useState("");
  const [rEdit,setREdit]=useState(null);
  // ── Editor del mensaje de cumpleaños ──
  const [tplDraft,setTplDraft]=useState(cumpleMsgTpl || CUMPLE_MSG_DEFAULT);
  const [tplMsg,setTplMsg]=useState("");
  const guardarTpl=()=>{
    onSaveCumpleMsg((tplDraft||"").trim());
    setTplMsg("✅ Mensaje guardado. Ya se usa en el panel y en la pestaña Cumpleaños.");
    setTimeout(()=>setTplMsg(""),3500);
  };
  const restaurarTpl=()=>{ setTplDraft(CUMPLE_MSG_DEFAULT); onSaveCumpleMsg(""); setTplMsg("✅ Mensaje original restaurado."); setTimeout(()=>setTplMsg(""),3000); };

  const CORREOS_FIJOS = [CUENTA_ROOT];  // solo la llave maestra es intocable
  const guardarCuenta=()=>{
    const em=(rEmail||"").trim().toLowerCase();
    const nom=(rNombre||"").trim();
    if(!nom){ setRMsg("❌ Escribe el nombre."); return; }
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ setRMsg("❌ Correo inválido."); return; }
    if(CORREOS_FIJOS.includes(em)){ setRMsg("❌ Ese correo es un usuario fijo del sistema y no se edita aquí."); return; }
    if(!rEdit && (cuentasCustom||[]).some(u=>(u.email||"").toLowerCase()===em)){ setRMsg("❌ Ese correo ya está en la lista."); return; }
    onSaveCuentas(prev=>{
      const arr=(prev||[]).filter(u=>(u.email||"").toLowerCase()!==em);
      return [...arr, { email:em, nombre:nom, rol:rRol, creado:new Date().toISOString() }];
    });
    setRMsg(rEdit?"✅ Rol actualizado.":"✅ Usuario autorizado. Recuerda crear su credencial en Firebase.");
    setRNombre("");setREmail("");setRRol(ROLES_DISPONIBLES[2]);setREdit(null);
    setTimeout(()=>setRMsg(""),3500);
  };
  const editarCuenta=(u)=>{ setREdit(u.email); setRNombre(u.nombre||""); setREmail(u.email||""); setRRol(u.rol||ROLES_DISPONIBLES[2]); setRMsg(""); };
  const eliminarCuenta=(em)=>{
    if(!confirm("¿Quitar el acceso de "+em+" a la app?\n\nSus clientes, llamadas e historial se conservan.\n\nPara bloqueo TOTAL recuerda también:\n1. Quitar su correo de las reglas de Firestore\n2. Deshabilitar su cuenta en Firebase Authentication")) return;
    onSaveCuentas(prev=>(prev||[]).filter(u=>(u.email||"").toLowerCase()!==(em||"").toLowerCase()));
  };

  return (
    <div className="space-y-5">
      {esDistribuidor && (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e8edf3]">
        <div className="text-base font-bold text-[#1f2d3d] mb-1"><Ico e="👥" className="mr-1.5" />Usuarios y roles</div>
        <div className="text-xs text-slate-400 mb-3">Aquí administras quién entra a la app y con qué rol. Los cambios se sincronizan al instante en todos los dispositivos — sin tocar código ni redesplegar.</div>
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 leading-relaxed">
          <div className="font-black mb-1">Para dar de alta a alguien (3 pasos):</div>
          <div className="mb-0.5"><b>1.</b> Firebase Console → <b>Authentication</b> → Add user (su correo y clave)</div>
          <div className="mb-0.5"><b>2.</b> Firebase Console → <b>Firestore → Reglas</b> → agrega su correo a la lista</div>
          <div><b>3.</b> Aquí abajo: escribe su nombre, correo y rol → <b>Autorizar</b></div>
        </div>
        {rMsg && <div className={`mb-3 text-sm font-bold rounded-xl px-3 py-2 ${rMsg.startsWith("✅")?"text-emerald-700 bg-emerald-50 border border-emerald-200":"text-red-500 bg-red-50 border border-red-200"}`}><Msg>{rMsg}</Msg></div>}
        <div className="space-y-2 mb-4">
          <input type="text" value={rNombre} onChange={e=>setRNombre(e.target.value)} placeholder="Nombre (ej. María Pérez)"
            className="w-full border-2 border-[#e8edf3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2f6fed]" />
          <input type="email" inputMode="email" autoCapitalize="none" value={rEmail} onChange={e=>setREmail(e.target.value)} placeholder="correo@gmail.com" disabled={!!rEdit}
            className="w-full border-2 border-[#e8edf3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2f6fed] disabled:bg-slate-50 disabled:text-slate-400" />
          <select value={rRol} onChange={e=>setRRol(e.target.value)}
            className="w-full border-2 border-[#e8edf3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2f6fed] bg-white">
            {ROLES_DISPONIBLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={guardarCuenta} className="flex-1 text-white font-bold px-3 py-2 rounded-lg text-sm" style={{background:RP.blue}}>{rEdit?"Guardar cambios":"+ Autorizar usuario"}</button>
            {rEdit && <button onClick={()=>{setREdit(null);setRNombre("");setREmail("");setRRol(ROLES_DISPONIBLES[2]);setRMsg("");}} className="px-3 py-2 rounded-lg text-sm font-bold text-slate-400 border-2 border-[#e8edf3]">Cancelar</button>}
          </div>
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">Usuarios autorizados</div>
        <div className="space-y-2">
          {/* UNA sola lista: la llave maestra primero (🔑, intocable) y después
              todos los demás, cada uno con Editar y Eliminar. */}
          {[
            { email:CUENTA_ROOT, ...(CUENTAS_DINAMICAS[CUENTA_ROOT]||CUENTA_ROOT_DATOS), _root:true },
            ...(cuentasCustom||[]).filter(u=>(u.email||"").toLowerCase()!==CUENTA_ROOT)
          ].map(u=>(
            <div key={u.email} className={`flex items-center justify-between border-2 rounded-xl p-2.5 ${u._root?"border-[#eef1f5] bg-slate-50/50":"border-[#e8edf3]"}`}>
              <div className="min-w-0">
                <div className="font-bold text-sm text-[#1f2d3d] truncate">{u.nombre}</div>
                <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-black text-slate-500 uppercase">{u.rol}</span>
                {u._root
                  ? <span className="text-[9px] text-slate-300 font-bold" title="Llave maestra — no se puede quitar"><Ico e="🔑" /></span>
                  : <>
                      <button onClick={()=>editarCuenta(u)} className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{background:RP.blue}}>Editar</button>
                      <button onClick={()=>eliminarCuenta(u.email)} className="text-sm px-1" title="Quitar acceso"><Ico e="🗑" /></button>
                    </>}
              </div>
            </div>
          ))}
          {!(cuentasCustom||[]).filter(u=>(u.email||"").toLowerCase()!==CUENTA_ROOT).length && <div className="text-[11px] text-slate-400 text-center py-2">Solo está la llave maestra. Autoriza usuarios con el formulario de arriba.</div>}
        </div>
      </div>
      )}
      {/* 🎂 MENSAJE DE CUMPLEAÑOS — editable, se sincroniza a todos los teléfonos */}
      {esDistribuidor && (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e8edf3]">
        <div className="text-base font-bold text-[#1f2d3d] mb-1"><Ico e="🎂" className="mr-1.5" />Mensaje de cumpleaños</div>
        <div className="text-xs text-slate-400 mb-3">Este texto se envía con los botones 💬 WA y SMS de cumpleaños (panel y pestaña). Escribe <b>{"{nombre}"}</b> donde quieras que aparezca el primer nombre del cumpleañero.</div>
        {tplMsg && <div className="mb-3 text-sm font-bold rounded-xl px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200"><Msg>{tplMsg}</Msg></div>}
        <textarea value={tplDraft} onChange={e=>setTplDraft(e.target.value)} rows={8}
          className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed] leading-relaxed" />
        <div className="mt-2 text-[11px] text-slate-400 bg-[#f4f6f9] rounded-xl px-3 py-2 leading-relaxed">
          <b>Vista previa:</b> {(tplDraft||"").split("{nombre}").join("María").slice(0,220)}{(tplDraft||"").length>220?"…":""}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={guardarTpl} className="flex-1 text-white font-bold px-3 py-2.5 rounded-xl text-sm" style={{background:"#16a34a"}}><Ico e="💾" className="mr-1.5" />Guardar mensaje</button>
          <button onClick={restaurarTpl} className="px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 border-2 border-[#e8edf3]">Restaurar original</button>
        </div>
      </div>
      )}

      {/* Claves locales, crear usuario y preguntas de seguridad: ELIMINADOS.
          El acceso es 100% Firebase: la clave se cambia con "¿Olvidaste tu clave?"
          en la pantalla de entrada, y los usuarios se gestionan arriba. */}

      {/* Herramienta: limpiar registros sin teléfono (solo admin/distribuidor) */}
      {(normalizarRol(rolActivo)==="Distribuidor"||normalizarRol(rolActivo)==="Supervisor") && (()=>{
        const sinTel=(arr)=>(allData?.[arr]||[]).filter(c=>!c.eliminado && (c.telefono||"").replace(/[^0-9]/g,"").length<10).length;
        const total=sinTel("agregados")+sinTel("prospectos")+sinTel("distribucion");
        return (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e8edf3]">
            <div className="text-base font-bold text-[#1f2d3d] mb-1"><Ico e="🧹" className="mr-1.5" />Limpiar datos sin teléfono</div>
            <div className="text-sm text-slate-500 mb-3">
              {total>0
                ? <>Hay <strong className="text-red-500">{total}</strong> registro(s) sin teléfono válido. Puedes moverlos a la papelera.</>
                : <><Ico e="✅" className="mr-1.5" />Todos los registros tienen teléfono. Nada que limpiar.</>}
            </div>
            <button onClick={onLimpiarSinTelefono} disabled={total===0}
              className={`w-full px-4 py-3 rounded-xl text-sm font-bold border ${total>0?"text-amber-700 bg-amber-50 border-amber-200":"text-slate-400 bg-slate-50 border-slate-200"}`}>
              🧹 Revisar y limpiar sin teléfono{total>0?` (${total})`:""}
            </button>
          </div>
        );
      })()}

      {/* Herramienta: extraer código postal de la dirección a su casilla (solo admin/distribuidor) */}
      {(normalizarRol(rolActivo)==="Distribuidor"||normalizarRol(rolActivo)==="Supervisor") && (()=>{
        // Cuenta registros que NO tienen cp en su casilla pero SÍ tienen un CP de 5 dígitos en la dirección
        const sinCP=(arr)=>(allData?.[arr]||[]).filter(c=>{
          if(c.eliminado) return false;
          const yaCP=String(c.cp||"").replace(/\D/g,"").length===5;
          if(yaCP) return false;
          return zipDesdeTexto(c.direccion||"").length===5;
        }).length;
        const total=sinCP("agregados")+sinCP("prospectos")+sinCP("distribucion");
        return (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e8edf3]">
            <div className="text-base font-bold text-[#1f2d3d] mb-1"><Ico e="📮" className="mr-1.5" />Separar código postal de la dirección</div>
            <div className="text-sm text-slate-500 mb-3">
              {total>0
                ? <>Hay <strong className="text-[#5b21b6]">{total}</strong> cliente(s) que tienen el código postal escrito dentro de la dirección. Puedo copiarlo a su casilla de C.P. para que la búsqueda sea más fácil.</>
                : <><Ico e="✅" className="mr-1.5" />Todos los códigos postales ya están en su casilla. Nada que separar.</>}
            </div>
            <button onClick={onExtraerCP} disabled={total===0}
              className={`w-full px-4 py-3 rounded-xl text-sm font-bold border ${total>0?"text-[#5b21b6] bg-[#f1ecfd] border-[#ddd1f7]":"text-slate-400 bg-slate-50 border-slate-200"}`}>
              📮 Separar código postal{total>0?` (${total})`:""}
            </button>
          </div>
        );
      })()}

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e8edf3]">
        <div className="text-base font-bold text-[#1f2d3d] mb-1"><Ico e="👤" className="mr-1.5" />Sesión actual</div>
        <div className="text-sm text-slate-500 mb-4">Estás dentro como <strong className="text-[#5b21b6]">{agenteActivo}</strong></div>
        <button onClick={onCerrarSesion} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-red-500 bg-red-50 border border-red-200"><Ico e="🚪" className="mr-1.5" />Cerrar sesión</button>
      </div>
    </div>
  );
}

// ─── PANTALLA DE LOGIN ────────────────────────────────────────
// ─── LOGIN CON FIREBASE (correo + clave) ──────────────────────
function FirebaseLoginScreen({ onGoogle, error, busy }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{background:RP.navyDark}}>
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full opacity-[0.06]"
        style={{background:"radial-gradient(circle, #C7CCD1 0%, transparent 60%)"}} />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 flex flex-col items-center">
          <Brand />
          <div className="text-[#717680] text-xs mt-3 font-semibold uppercase tracking-[0.22em]">CRM de Telemarketing</div>
        </div>

        <div className="rounded-2xl p-7 shadow-2xl" style={{background:RP.navy,border:`1px solid ${RP.silver2}`}}>
          <div className="text-center mb-5">
            <div className="text-lg font-extrabold tracking-tight text-[#F4F4F1]">Iniciar sesión</div>
            <div className="text-sm text-[#A5A9B0] mt-1">Usa la cuenta de Google autorizada para ImpactOS.</div>
          </div>

          {error && <div className="mb-4 text-sm font-semibold text-[#FCA5A5] bg-[#F87171]/10 border border-[#F87171]/30 rounded-xl px-3 py-2">{error}</div>}

          <button onClick={onGoogle} disabled={busy}
            className="w-full px-4 py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-3 transition active:scale-[0.98] disabled:opacity-40 bg-white text-[#1f2d3d] hover:bg-slate-50">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/>
              <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/>
              <path fill="#FBBC05" d="M6.39 13.86A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"/>
              <path fill="#EA4335" d="M12 6.01c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"/>
            </svg>
            {busy ? "Conectando…" : "Continuar con Google"}
          </button>

          <div className="mt-5 pt-4 border-t border-white/10 text-[11px] text-[#717680] text-center leading-relaxed">
            Solo las cuentas autorizadas por el administrador pueden entrar.
          </div>
        </div>
      </div>
    </div>
  );
}

// (El LoginScreen viejo de claves locales fue eliminado — el login es 100% Firebase.)

export default function App() {
  const [tab,setTab]=useState("inicio");const [sideOpen,setSideOpen]=useState(false);const [showAI,setShowAI]=useState(false);const [showCSV,setShowCSV]=useState(false);
  const [dbOpen,setDbOpen]=useState(false); // grupo desplegable "Base de datos" en el menú lateral
  const role="admin"; // todos tienen acceso completo
  // ── Firebase Auth: estado de sesión ──
  const [authUser,setAuthUser]=useState(null);     // usuario de Firebase, o null
  const [authReady,setAuthReady]=useState(false);  // ya sabemos si hay sesión o no
  const [loginError,setLoginError]=useState("");
  const [loginBusy,setLoginBusy]=useState(false);
  useEffect(()=>{
    let alive=true;
    getAuth().then(auth=>{ if(alive) auth.onAuthStateChanged(u=>{ setAuthUser(u||null); setAuthReady(true); }); })
             .catch(()=>{ if(alive) setAuthReady(true); });
    return ()=>{ alive=false; };
  },[]);

  // Identidad y rol salen del correo autenticado (no de claves en el código)
  const email=(authUser?.email||"").trim().toLowerCase();

  // El estado se carga para cualquier usuario autenticado en Firebase; la autorización
  // (fija o dinámica) se resuelve después, cuando ya tenemos state.cuentasCustom.
  const [state,setState,synced,fbError,reintentarFb]=useSharedState(authReady && !!authUser);
  // Sincroniza el mapa dinámico ANTES de resolver el rol (corre en cada render, es barato)
  setCuentasDinamicas(state?.cuentasCustom||[]);
  setCumpleMsgTpl(state?.cumpleMsgTpl||"");
  // ── MIGRACIÓN ÚNICA: si Firebase todavía no tiene la lista de cuentas, se
  // siembra con SEMILLA_CUENTAS. Corre una sola vez; después el panel manda. ──
  const semillaHecha=useRef(false);
  useEffect(()=>{
    if(semillaHecha.current) return;
    if(!authReady || !authUser || !synced || !state) return;
    if((state.cuentasCustom||[]).length>0){ semillaHecha.current=true; return; }
    semillaHecha.current=true;
    setState(s=>((s.cuentasCustom||[]).length>0 ? s : {...s, cuentasCustom:SEMILLA_CUENTAS}));
  },[authReady, authUser, synced, state, setState]);
  const emailOk=cuentaAutorizada(email);
  const cuenta=cuentaDeEmail(email);
  const agenteActivo=cuenta.nombre;
  const rolUsuario=cuenta.rol;
  const puedeGestionarIncentivos = puedeCrearIncentivosRol(rolUsuario);
  const [showNotifs,setShowNotifs]=useState(false);

  const iniciarSesionGoogle=async()=>{
    setLoginError(""); setLoginBusy(true);
    try {
      const auth=await getAuth();
      const provider=new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      await auth.signInWithPopup(provider);
      // onAuthStateChanged actualiza authUser; después ImpactOS valida si el correo está autorizado.
    } catch(e){
      const c=e?.code||"";
      if(c.includes("popup-closed") || c.includes("cancelled-popup")) setLoginError("Inicio de sesión cancelado.");
      else if(c.includes("popup-blocked")) setLoginError("El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo otra vez.");
      else setLoginError("No se pudo iniciar sesión con Google. Inténtalo de nuevo.");
    } finally { setLoginBusy(false); }
  };
  const cerrarSesion=async()=>{ try { const auth=await getAuth(); await auth.signOut(); } catch {} };

  // ── RESET AUTOMÁTICO A LAS 12:00 AM (zona horaria local) ──
  // Solo refresca las VISTAS y CONTADORES diarios (llamadas de hoy, agenda del día,
  // estadísticas diarias). NO borra datos históricos: citas, llamadas, servicios,
  // ventas e incentivos se conservan porque viven en el estado compartido.
  const [hoyTick,setHoyTick]=useState(()=>hoyLocal());
  useEffect(()=>{
    // Calcular ms hasta la próxima medianoche local
    const programarMedianoche=()=>{
      const ahora=new Date();
      const manana=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()+1,0,0,5,0); // 00:00:05
      return manana.getTime()-ahora.getTime();
    };
    let timeout;
    const tick=()=>{
      setHoyTick(hoyLocal()); // cambia el día → re-render de vistas diarias
      timeout=setTimeout(tick, programarMedianoche());
    };
    timeout=setTimeout(tick, programarMedianoche());
    // Respaldo: revisar cada minuto por si el dispositivo estuvo suspendido
    const intervalo=setInterval(()=>{
      const hoyReal=hoyLocal();
      setHoyTick(prev=> prev!==hoyReal ? hoyReal : prev);
    }, 60000);
    return ()=>{ clearTimeout(timeout); clearInterval(intervalo); };
  },[]);

  useNotifPermission();
  const {notifs,noLeidas,notify,marcarLeidas,marcarUnaLeida}=useNotificaciones(state,setState,agenteActivo);

  // ── Revisar cumpleaños y notificar 2 días antes + el día ──
  useEffect(()=>{
    if(!synced) return;
    const parseMesDia=(fc)=>{
      if(!fc) return null; let m,d;
      if(/^\d{4}-\d{2}-\d{2}$/.test(fc)){const p=fc.split("-");m=+p[1]-1;d=+p[2];}
      else if(/^\d{1,2}-\d{1,2}$/.test(fc)){const p=fc.split("-");m=+p[0]-1;d=+p[1];}
      else if(/^\d{1,2}\/\d{1,2}$/.test(fc)){const p=fc.split("/");m=+p[0]-1;d=+p[1];}
      else return null;
      return {mes:m,dia:d};
    };
    // Combinar manuales + distribución
    const normN=(s)=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
    const manuales=(state.cumpleanos||[]).map(c=>{
      let tel=c.telefono;
      if(!tel || !tel.replace(/[^0-9]/g,"")){
        const m=(state.distribucion||[]).find(d=>normN(d.nombre)===normN(c.nombre));
        if(m && m.telefono) tel=m.telefono;
      }
      return {...c, telefono:tel};
    });
    const desdeDistribucion=(state.distribucion||[]).filter(c=>c.fecha_cumple).map(c=>({nombre:c.nombre,telefono:c.telefono,fecha_cumple:c.fecha_cumple}));
    const todos=[...manuales,...desdeDistribucion];
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const yaNotificado=(state.cumpleNotifs||{});
    const nuevos={...yaNotificado};
    let huboNuevo=false;
    todos.forEach(c=>{
      const md=parseMesDia(c.fecha_cumple); if(!md) return;
      // Fecha del cumple este año
      let fechaCumple=new Date(hoy.getFullYear(),md.mes,md.dia); fechaCumple.setHours(0,0,0,0);
      const diff=Math.round((fechaCumple-hoy)/(1000*60*60*24));
      const claveBase=(c.nombre||"")+"_"+c.fecha_cumple+"_"+hoy.getFullYear();
      // 2 días antes
      if(diff===2){
        const k=claveBase+"_2d";
        if(!nuevos[k]){ notify("cumple",`🎂 Cumpleaños en 2 días: ${c.nombre}`,`Es el ${md.dia} de ${["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][md.mes]}. Planea el detalle. 🎁`,"🎂 Cumpleaños"); nuevos[k]=true; huboNuevo=true; }
      }
      // El día
      if(diff===0){
        const k=claveBase+"_0d";
        if(!nuevos[k]){ notify("cumple",`🎉 ¡Hoy cumple ${c.nombre}!`,`Felicítalo por WhatsApp, SMS o llamada. 🥳`,"🎂 Cumpleaños"); nuevos[k]=true; huboNuevo=true; }
      }
    });
    if(huboNuevo) setState(s=>({...s,cumpleNotifs:nuevos}));
  },[synced,state.cumpleanos,state.distribucion]);

  const setSection=(section,fn)=>setState(s=>({...s,[section]: typeof fn==="function"?fn(s[section]):fn}));
  const setAppts=fn=>setState(s=>({...s,appts: typeof fn==="function"?fn(s.appts||[]):fn}));
  // ── SINCRONIZACIÓN Agenda → bases de datos ──
  // Cuando una cita de la Agenda se marca como VENTA, la atribuimos a una base:
  // si el teléfono coincide con un cliente existente, le sumamos la venta a su
  // historial; si no existe en ninguna base, creamos una tarjeta en Prospección.
  // El appt queda marcado _sincronizado para que NO se cuente doble (la venta
  // ya vive en el historial del cliente y la estadística sabe de qué base viene).
  const sincronizarVentaAgenda=(appt)=>{
    if(!appt || appt._sincronizado) return;
    setState(s=>{
      const tel=soloNum(appt.telefono||"");
      const monto=Number(appt.monto)||0;
      const histEntry=makeHistorialEntry({ tipo:"cita", cita_resultado:"demo_venta", notas:`💰 Venta agendada en Agenda${appt.producto?` — ${appt.producto}`:""}`, agente:appt.agente||"", monto, producto:appt.producto||"", cartucho_meses:appt.cartucho_meses||0 });
      let grupo=null, encontradoId=null;
      for(const g of ["agregados","prospectos","distribucion"]){
        const arr=s[g]||[];
        const m=tel?arr.find(c=>soloNum(c.telefono||"")===tel):null;
        if(m){ grupo=g; encontradoId=m.id; break; }
      }
      const patch={};
      if(grupo && encontradoId){
        patch[grupo]=(s[grupo]||[]).map(c=>c.id===encontradoId?{...c, venta:true, resultado:"demo_venta", ultimo_monto_venta:monto||c.ultimo_monto_venta, ultimo_producto:appt.producto||c.ultimo_producto, ultimo_cartucho_meses:appt.cartucho_meses||c.ultimo_cartucho_meses, historial:[...(c.historial||[]), histEntry]}:c);
      } else {
        const nuevo={ id:genId(), nombre:appt.nombre||"(Cliente de agenda)", telefono:appt.telefono||"", fuente:"Agenda", producto:appt.producto||"", ciudad:appt.ciudad||"", cp:"", direccion:appt.direccion||"", observaciones:"Venta agendada directo en Agenda", detalles:"", estado:"verde", venta:true, resultado:"demo_venta", ultimo_monto_venta:monto, ultimo_producto:appt.producto||"", ultimo_cartucho_meses:appt.cartucho_meses||0, ultimaNota:"", notas:[], historial:[histEntry], proximo_seguimiento:"", creado:new Date().toISOString(), actualizado:"", _origenAgenda:true };
        grupo="prospectos"; encontradoId=nuevo.id;
        patch.prospectos=[nuevo, ...(s.prospectos||[])];
      }
      patch.appts=(s.appts||[]).map(a=>a.id===appt.id?{...a, _sincronizado:true, _clienteId:encontradoId, _clienteGrupo:grupo}:a);
      return {...s, ...patch};
    });
  };
  const onCallLog=()=>{const today=hoyLocal();const ag=agenteActivo||"Equipo";setState(s=>{const dia=clObj((s.callLog||{})[today]);return {...s,callLog:{...(s.callLog||{}),[today]:{...dia,[ag]:(+dia[ag]||0)+1}}};});};
  // navegación rápida desde el dashboard
  const goTo=(t)=>{ if(!puedeVerTabRol(rolUsuario,t)){ alert("🔒 Tu rol no tiene acceso a esa sección"); return; } setTab(t); setSideOpen(false); };
  const setCofreConfig=(fn)=>setState(s=>({...s, cofreConfig: typeof fn==="function"? fn(s.cofreConfig||{activo:true,niveles:COFRE_NIVELES_DEFAULT.map(n=>({...n,premios:[]}))}) : fn }));
  const abrirCofre=(agente,nivel,premio)=>{
    const semana=lunesDeLaSemana(new Date()).toISOString().slice(0,10);
    setState(s=>{
      const ap=s.cofreAperturas||[];
      if(ap.some(a=>a.agente===agente && a.semana===semana)) return s;
      return {...s, cofreAperturas:[{id:genId(),agente,semana,nivelId:nivel.id,nivelNombre:nivel.nombre,emoji:nivel.emoji,premio,fecha:new Date().toISOString()},...ap]};
    });
  };
  const registrarRespaldo=(mes,tipo)=>{ setState(s=>({...s, respaldos:[{id:genId(),mes,tipo,fecha:new Date().toISOString(),por:agenteActivo},...(s.respaldos||[])]})); };

  // Al tocar una notificación: marcarla leída + ir a la sección correspondiente
  const handleNotifClick=(n)=>{
    marcarUnaLeida(n.id);
    setShowNotifs(false);
    // Mapear la sección de la notificación a una pestaña
    const sec=(n.seccion||"").toLowerCase();
    let destino="inicio";
    if(n.tipo==="resultado") destino="agenda";                    // resultado de cita → Agenda
    else if(sec.includes("agregados")) destino="agregados";
    else if(sec.includes("prospec")) destino="prospectos";
    else if(sec.includes("distribuci")) destino="distribucion";
    else if(sec.includes("referido")) destino="referidos";
    else if(n.tipo==="obsequio") destino="referidos";             // obsequio → Referidos
    else if(n.tipo==="cumple") destino="cumpleanos";              // cumpleaños → Cumpleaños
    else if(n.tipo==="incentivo") destino="inicio";              // incentivo → Inicio (ve su progreso)
    setTab(destino);
  };

  // Memoizado: solo se reconstruye cuando cambian los datos, no en cada render.
  // Sin esto, cada toque recreaba el objeto y rompía la memoización aguas abajo.
  const allData=useMemo(()=>({agregados:state.agregados||[],referidos:state.referidos||[],prospectos:state.prospectos||[],distribucion:state.distribucion||[], appts:state.appts||[]}),
    [state.agregados, state.referidos, state.prospectos, state.distribucion, state.appts]);
  const [importMsg,setImportMsg]=useState("");
  const [dupReview,setDupReview]=useState(null);  // {dest, fresh:[], dups:[]}
  const [refReview,setRefReview]=useState(null);  // referidos a revisar/editar antes de guardar
  const SLABEL = {agregados:"📂 Agregados", prospectos:"🔍 Prospección", distribucion:"🏠 Distribución", referidos:"🎁 Referidos"};

  // Importación masiva (CSV/PDF): los registros ya vienen separados por
  // canal. Se deduplica cada uno contra la base Y contra el propio archivo,
  // y TODO se guarda en una sola actualización de estado — hacerlo en
  // varias seguidas provocaba que una pisara a la otra.
  const guardarImportacionMasiva=(grupos)=>{
    setShowCSV(false);
    const secciones=["agregados","prospectos","distribucion"];
    const vistos=new Set();
    const nuevos={}; let totalNuevos=0, totalDup=0;
    const resumen=[];

    secciones.forEach(sec=>{
      const entrantes=grupos[sec]||[];
      if(!entrantes.length) return;
      const base = sec==="prospectos" ? emptyProspecto : sec==="distribucion" ? emptyDistribucion : emptyClient;
      const frescos=[];
      entrantes.forEach(r0=>{
        const r={ ...base(), ...r0, id:genId(), creado:new Date().toISOString() };
        const kNom=contactKey(r);
        const kCta=normCuenta(r.cuenta);
        const repetidoEnArchivo = vistos.has("n:"+kNom) || (kCta && vistos.has("c:"+kCta));
        const repetidoEnBase = findDuplicate(r, allData);
        if(repetidoEnArchivo || repetidoEnBase){ totalDup++; return; }
        vistos.add("n:"+kNom); if(kCta) vistos.add("c:"+kCta);
        frescos.push(r);
      });
      if(frescos.length){ nuevos[sec]=frescos; totalNuevos+=frescos.length; resumen.push(`${frescos.length} en ${SLABEL[sec]||sec}`); }
    });

    // Referidos: cada anfitrión con su gente. Sin anfitrión indicado, la
    // propia persona encabeza su programa (así no se pierde el registro).
    const refs=grupos.referidos||[];
    let progNuevos=[];
    if(refs.length){
      const porAnfitrion={};
      refs.forEach(r=>{
        const anf=(r._anfitrion||"").trim() || (r.nombre||"").trim();
        if(!porAnfitrion[anf]) porAnfitrion[anf]={ ...emptyReferido(), id:genId(), anfitrion:anf, referidos:[] };
        // Si la fila ES el anfitrión mismo, sus datos van a la cabecera.
        if(!(r._anfitrion||"").trim()){
          porAnfitrion[anf].anfitrion_telefono = porAnfitrion[anf].anfitrion_telefono || r.telefono || "";
          porAnfitrion[anf].anfitrion_ciudad   = porAnfitrion[anf].anfitrion_ciudad   || r.ciudad   || "";
          porAnfitrion[anf].anfitrion_cuenta   = porAnfitrion[anf].anfitrion_cuenta   || r.cuenta   || "";
        } else {
          porAnfitrion[anf].referidos.push({
            nombre:r.nombre||"", telefono:r.telefono||"", direccion:r.direccion||"", ciudad:r.ciudad||"",
            cp:r.cp||"", producto:r.producto||"", observaciones:r.observaciones||"", detalles:r.otrosDetalles||"",
            parentesco:"", estado:"sin_estado", ultimaNota:"", notas:[], historial:[],
            proximo_seguimiento:"", creado:new Date().toISOString(), actualizado:"",
          });
        }
      });
      progNuevos=Object.values(porAnfitrion).filter(p=>p.anfitrion || (p.referidos||[]).length);
      if(progNuevos.length){ totalNuevos+=progNuevos.length; resumen.push(`${progNuevos.length} programa(s) de referidos`); }
    }

    if(!totalNuevos && !totalDup){ setImportMsg("No se importó nada — revisa el mapeo de columnas."); setTimeout(()=>setImportMsg(""),6000); return; }

    // UNA sola actualización con todas las secciones tocadas.
    setState(prev=>{
      const sig={ ...prev };
      Object.keys(nuevos).forEach(sec=>{ sig[sec]=[...nuevos[sec], ...(prev[sec]||[])]; });
      if(progNuevos.length) sig.referidos=[...progNuevos, ...(prev.referidos||[])];
      return sig;
    });

    setImportMsg(`✅ ${totalNuevos} registro(s) importados · ${resumen.join(" · ")}${totalDup?` · ${totalDup} duplicado(s) omitido(s)`:""}`);
    if(totalNuevos) notify("datos", `📂 Importación masiva de ${agenteActivo}`, `${totalNuevos} registro(s) · ${resumen.join(" · ")}`, "Base de datos");
    setTimeout(()=>setImportMsg(""),9000);
  };

  const handleAIExtracted=(records,dest)=>{
    if(dest==="referidos"){ setShowAI(false); setRefReview(records); return; }
    const recs=records.map(r=>({...emptyClient(),...r,id:genId(),creado:new Date().toISOString(),...(dest==="prospectos"?{fuente:r.fuente||"Importado IA"}:{}),...(dest==="distribucion"?{ultima_compra:""}:{})}));
    // Separar nuevos de duplicados (contra la base Y entre ellos mismos)
    const seen=new Set();
    const fresh=[]; const dups=[];
    for(const r of recs){
      const key=contactKey(r);
      const cuentaKey=normCuenta(r.cuenta);
      const dupEntre = seen.has("n:"+key) || (cuentaKey && seen.has("c:"+cuentaKey));
      const dupExistente = findDuplicate(r, allData);
      if(dupEntre || dupExistente){
        dups.push({
          ...r,
          _razon: dupExistente ? dupExistente.motivo : "repetido en este archivo",
          _existente: dupExistente ? dupExistente.match : null,
          _sec: dupExistente ? dupExistente.sec : null,
        });
      } else {
        seen.add("n:"+key); if(cuentaKey) seen.add("c:"+cuentaKey);
        fresh.push(r);
      }
    }
    setShowAI(false);
    if(dups.length>0){
      // Mostrar modal de revisión de duplicados
      setDupReview({dest, fresh, dups});
    } else {
      guardarImportados(dest, fresh, 0);
    }
  };

  // Fusiona un duplicado con su cliente existente en la base
  const fusionarDuplicado=(dup)=>{
    if(!dup._existente || !dup._sec) return;
    const fusionado = fusionarClientes(dup._existente, dup);
    setSection(dup._sec, p=>p.map(x=> x.id===dup._existente.id ? fusionado : x));
  };

  const guardarReferidos=(revisados)=>{
    // Limpiar anfitriones vacíos y referidos vacíos
    const limpios=revisados
      .map(anf=>({...anf, referidos:(anf.referidos||[]).filter(r=>r.nombre?.trim()||r.telefono?.trim())}))
      .filter(anf=>anf.anfitrion?.trim() || (anf.referidos||[]).length>0);
    const totalRefs=limpios.reduce((a,anf)=>a+(anf.referidos||[]).length,0);
    if(limpios.length) setSection("referidos",p=>[...limpios,...p]);
    setImportMsg(`✅ ${limpios.length} anfitrión(es) · ${totalRefs} referido(s) guardado(s)`);
    if(limpios.length){
      notify("datos",
        `🎁 Referidos subidos por ${agenteActivo}`,
        `${limpios.length} anfitrión(es) con ${totalRefs} referido(s) importados`,
        "🎁 Referidos"
      );
    }
    setRefReview(null);
    setTimeout(()=>setImportMsg(""),5000);
  };

  const guardarImportados=(dest, fresh, nDups)=>{
    if(fresh.length) setSection(dest,p=>[...fresh,...p]);
    setImportMsg(`✅ ${fresh.length} agregado(s)${nDups?` · ${nDups} duplicado(s) suprimido(s)`:""}`);
    if(fresh.length) {
      notify("datos",
        `📂 Datos nuevos subidos por ${agenteActivo}`,
        `${fresh.length} registro(s) importados en ${SLABEL[dest]||dest}${nDups?` · ${nDups} duplicado(s) suprimido(s)`:""}`,
        SLABEL[dest]||dest
      );
    }
    setDupReview(null);
    setTimeout(()=>setImportMsg(""),5000);
  };

  const navLabel=NAV.find(n=>n.id===tab);
  const total=allData.agregados.length+allData.referidos.length+allData.prospectos.length+allData.distribucion.length;
  // Badge llamadas: solo clientes SIN ESTADO (pendientes reales por llamar)
  const pendientes=[...allData.prospectos,...allData.agregados,...allData.distribucion].filter(c=>c.estado==="sin_estado").length;
  // Badge agenda: citas agendadas HOY (tipo "cita" en appts con fecha de hoy)
  const hoyNavStr=hoyLocal();
  const citas=(state.appts||[]).filter(a=>a.tipo==="cita" && (a.fecha||"").slice(0,10)===hoyNavStr).length;
  // Memoizado: antes recorría TODO el historial en cada render de la app.
  const conteoHdr=useMemo(()=>conteoLlamadas(allData, state.callLog), [allData, state.callLog]);
  const callsToday=sumDia(conteoHdr[hoyLocal()]);

  // Mientras Firebase confirma si hay sesión, mostramos una pantalla de carga
  if(!authReady){
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:RP.navyDark}}>
        <div className="text-[#A5A9B0] font-bold text-sm flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-white/20 border-t-[#F4F4F1] rounded-full animate-spin" /> Cargando…
        </div>
      </div>
    );
  }
  // Sin sesión → pantalla de login de Firebase
  if(!authUser){
    return <FirebaseLoginScreen onGoogle={iniciarSesionGoogle} error={loginError} busy={loginBusy} />;
  }
  // Con sesión de Firebase, NO mostrar el CRM hasta recibir el primer estado
  // de Firestore. Evita que la interfaz parezca vacía (0 registros) mientras
  // los documentos fragmentados sec_* todavía están llegando de la nube.
  if(authUser && !synced){
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{background:RP.navyDark}}>
        <div className="text-center">
          <div className="mx-auto mb-3 w-6 h-6 border-2 border-white/20 border-t-[#F4F4F1] rounded-full animate-spin" />
          <div className="text-[#F4F4F1] font-bold text-sm">Cargando tus datos…</div>
          <div className="text-[#717680] text-xs mt-1">Sincronizando ImpactOS con Firebase</div>
        </div>
      </div>
    );
  }

  // Si Firestore rechazó la sesión, no mostrar un CRM vacío como si no hubiera datos.
  if(authUser && fbError && fbError.startsWith("⛔")){
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{background:RP.navyDark}}>
        <div className="rounded-2xl p-7 shadow-2xl max-w-md w-full text-center" style={{background:RP.navy,border:`1px solid ${RP.silver2}`}}>
          <div className="mb-3 flex justify-center"><Ico e="🔒" size={36} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-lg font-extrabold text-[#F4F4F1] mb-2">No se pudieron cargar los datos</div>
          <div className="text-sm text-[#A5A9B0] mb-5">{fbError}</div>
          <button onClick={reintentarFb} className="w-full px-4 py-3 rounded-xl text-sm font-bold" style={{background:RP.btn,color:RP.btnText}}>Reintentar conexión</button>
        </div>
      </div>
    );
  }

  // Correo autenticado pero no autorizado en esta app
  if(!emailOk){
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{background:RP.navyDark}}>
        <div className="rounded-2xl p-7 shadow-2xl max-w-md w-full text-center" style={{background:RP.navy,border:`1px solid ${RP.silver2}`}}>
          <div className="mb-3 flex justify-center"><Ico e="🔒" size={36} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-lg font-extrabold tracking-tight text-[#F4F4F1] mb-2">Cuenta sin acceso</div>
          <div className="text-sm text-[#A5A9B0] mb-5">El correo <strong className="text-[#F4F4F1]">{authUser.email}</strong> no está autorizado en esta app. Pídele acceso a tu administrador.</div>
          <button onClick={cerrarSesion} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-[#FCA5A5] bg-[#F87171]/10 border border-[#F87171]/30 hover:bg-[#F87171]/20 transition">Cerrar sesión</button>
        </div>
      </div>
    );
  }

  return (
    <div className="impactos-shell min-h-screen bg-[#F7F8FA] text-slate-950" style={{fontFamily:SANS}}>
      {sideOpen && <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] lg:hidden" onClick={()=>setSideOpen(false)} />}

      {/* SIDEBAR — navy header band like the app */}
      <aside className={`fixed top-0 left-0 h-full w-[86vw] max-w-[300px] lg:w-[252px] lg:max-w-none z-50 flex flex-col transition-transform duration-300 ${sideOpen?"translate-x-0":"-translate-x-full"} lg:translate-x-0 bg-[#080D16] border-r border-[#182231] shadow-2xl lg:shadow-none`}>
        <div className="px-4 py-4 border-b border-white/[0.07]"><Brand small /></div>
        <div className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.filter(n=>puedeVerTabRol(rolUsuario,n.id) && (n.id!=="incentivo"||puedeGestionarIncentivos)).map(n=>{
            const sectionLabel =
              n.id==="inicio" ? "Resumen" :
              n.id==="llamadas" ? "Operación" :
              n.id===DB_TABS[0] ? "Base de datos" :
              n.id==="reclutamiento" ? "Gestión" :
              n.id==="config" ? "Sistema" : "";
            const heading = sectionLabel ? (
              <div className="px-2 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#667085]">{sectionLabel}</div>
            ) : null;

            if(DB_TABS.includes(n.id)){
              if(n.id!==DB_TABS[0]) return null;
              const dbActivo=DB_TABS.includes(tab);
              const dbAbierto=dbOpen||dbActivo;
              return (
                <div key="grupo-base-datos" className="mb-1">
                  {heading}
                  <button onClick={()=>setDbOpen(o=>!o)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition ${dbActivo?"text-white bg-[#172033] shadow-sm":"text-[#A8B0BF] hover:bg-white/[0.055] hover:text-white"}`}>
                    <span className="w-5 flex items-center justify-center"><Ico e="🗄" size={16} /></span>
                    <span>Clientes y prospectos</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${dbActivo?"bg-white/10 text-white":"bg-white/[0.06] text-[#8892A4]"}`}>{total}</span>
                      <span className={`text-[10px] transition-transform duration-200 ${dbAbierto?"rotate-180":""}`}>⌄</span>
                    </span>
                  </button>
                  {dbAbierto && (
                    <div className="mt-1.5 ml-4 pl-2 border-l border-white/[0.08] space-y-1">
                      {NAV.filter(x=>DB_TABS.includes(x.id)).map(s=>(
                        <button key={s.id} onClick={()=>{setTab(s.id);setSideOpen(false);}} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition ${tab===s.id?"text-white bg-[#1E2B43]":"text-[#8F9AAD] hover:bg-white/[0.05] hover:text-white"}`}>
                          <Ico e={s.icon} size={14} />{s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={n.id}>
                {heading}
                <button onClick={()=>{setTab(n.id);setSideOpen(false);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold mb-1 transition ${tab===n.id?"text-white bg-[#172033] shadow-sm":"text-[#A8B0BF] hover:bg-white/[0.055] hover:text-white"}`}>
                  <span className="w-5 flex items-center justify-center"><Ico e={n.icon} size={16} /></span>
                  <span className="truncate">{n.label}</span>
                  {n.id==="llamadas"&&pendientes>0&&<span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-bold ${tab===n.id?"bg-[#2563EB] text-white":"bg-white/[0.07] text-[#A8B0BF]"}`}>{pendientes}</span>}
                  {n.id==="agenda"&&citas>0&&<span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-[#123B2B] text-[#6EE7B7]">{citas}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-3 pb-4 border-t border-white/[0.07] pt-3">
          {/* USUARIO ACTIVO — muestra quién inició sesión */}
          <div className="mb-3">
            <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-[0.16em] mb-1.5 px-1">Sesión activa</div>
            {/* Toda la tarjeta es un botón: lleva directo a Configuración */}
            <button onClick={()=>{setSideOpen(false);setTab("config");}} className="w-full flex items-center gap-2.5 bg-white/[0.035] border border-white/[0.07] rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.065] active:scale-[0.98] transition">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#111318] font-black text-sm shrink-0 bg-[#F2F1ED]">{(agenteActivo||"T")[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-[#F4F4F1] truncate">{agenteActivo==="Tomas"?"Tomás Flores":agenteActivo==="Angie"?"Angy Paredes":agenteActivo}</div>
                <div className="text-[10px] text-[#717680] font-bold">{rolUsuario}</div>
              </div>
              <span className="text-[10px] text-[#A5A9B0] font-bold"><Ico e="⚙" /></span>
            </button>
          </div>
          <PrimaryBtn onClick={()=>{setShowAI(true);setSideOpen(false);}} full><Ico e="🤖" className="mr-1.5" />Importar con IA</PrimaryBtn>
          <button onClick={()=>{setShowCSV(true);setSideOpen(false);}} className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold border border-white/[0.09] text-[#A8B0BF] hover:text-white hover:bg-white/[0.04] active:scale-[0.98] transition"><Ico e="📄" className="mr-1.5" />Importar CSV o PDF</button>
        </div>
      </aside>

      <div className="lg:ml-[252px] flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 h-[62px] px-4 sm:px-6 lg:px-8 flex items-center gap-3 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <button className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={()=>setSideOpen(true)}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <div className="flex items-center gap-2 flex-1 min-w-0"><span className="text-slate-400"><Ico e={navLabel?.icon} size={17} /></span><span className="font-bold text-slate-950 text-[15px] sm:text-base truncate tracking-tight">{navLabel?.label}</span></div>
          <span className="hidden sm:inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"><Ico e="📞" size={13} />{callsToday} hoy</span>
          {/* Campana de notificaciones */}
          <button onClick={()=>setShowNotifs(p=>!p)} aria-label="Notificaciones"
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-600 hover:bg-slate-100 transition">
            <Ico e="🔔" size={19} />
            {noLeidas>0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2563EB] border border-white text-white text-[9px] font-black flex items-center justify-center">
                {noLeidas>9?"9+":noLeidas}
              </span>
            )}
          </button>
          <button onClick={()=>setShowAI(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold hover:bg-[#1D4ED8] active:scale-[0.98] transition"><Ico e="🤖" size={14} />IA</button>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="w-full max-w-[1480px] mx-auto min-h-[70vh]">
            {importMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-bold flex items-center justify-between"><Msg>{importMsg}</Msg><button onClick={()=>setImportMsg("")} className="ml-2"><Ico e="✕" /></button></div>}
            {fbError && <div className="mb-4 flex items-start gap-2 bg-red-50 border-2 border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
              <span className="shrink-0"><Ico e="🚨" /></span>
              <span className="flex-1">{sinEmoji(fbError)}</span>
              <button onClick={reintentarFb} className="shrink-0 text-xs px-2 py-1 rounded-lg bg-red-600 text-white">Reintentar ahora</button>
            </div>}
            {tab==="inicio" && <Dashboard allData={allData} appts={state.appts||[]} setAppts={setAppts} callLog={state.callLog} agente={agenteActivo} goTo={goTo} incentivos={state.incentivos||[]} cofreConfig={state.cofreConfig} cofreAperturas={state.cofreAperturas||[]} abrirCofre={abrirCofre} rolActivo={rolUsuario} respaldos={state.respaldos||[]} registrarRespaldo={registrarRespaldo} cumpleanos={state.cumpleanos||[]} />}
            {tab==="agenda" && <Agenda appts={state.appts||[]} setAppts={setAppts} agente={agenteActivo} onVentaSync={sincronizarVentaAgenda} />}
            {tab==="llamadas" && <CallControl data={allData} setData={setSection} onCallLog={onCallLog} role={role} agente={agenteActivo} notify={notify} setAppts={setAppts} rolActivo={rolUsuario} />}
            {tab==="agregados" && <DBSection data={allData.agregados} setData={fn=>setSection("agregados",fn)} type="agregado" title="Clientes Agregados" onCallLog={onCallLog} role={role} allData={allData} agente={agenteActivo} notify={notify} setAppts={setAppts} rolActivo={rolUsuario} />}
            {tab==="referidos" && <DBSection data={allData.referidos} setData={fn=>setSection("referidos",fn)} type="referido" title="Programa Referidos" onCallLog={onCallLog} role={role} allData={allData} agente={agenteActivo} notify={notify} setAppts={setAppts} rolActivo={rolUsuario} />}
            {tab==="prospectos" && <DBSection data={allData.prospectos} setData={fn=>setSection("prospectos",fn)} type="prospecto" title="Prospección" onCallLog={onCallLog} role={role} allData={allData} agente={agenteActivo} notify={notify} setAppts={setAppts} rolActivo={rolUsuario} />}
            {tab==="distribucion" && <DBSection data={allData.distribucion} setData={fn=>setSection("distribucion",fn)} type="distribucion" title="Bajo Distribución" onCallLog={onCallLog} role={role} allData={allData} agente={agenteActivo} notify={notify} setAppts={setAppts} rolActivo={rolUsuario} cobranzaClientes={(state.cobranza||{}).clientesData||{}} />}
            {tab==="reclutamiento" && <RecruitmentSection reclutamiento={state.reclutamiento||[]} setReclutamiento={(fn)=>setState(s=>({...s,reclutamiento:typeof fn==="function"?fn(s.reclutamiento||[]):fn}))} agente={agenteActivo} notify={notify} rolActivo={rolUsuario} setAppts={setAppts} socios={state.socios||[]} setSocios={fn=>setSection("socios",fn)} docsSocios={state.docsSocios||{}} setDocsSocios={fn=>setSection("docsSocios",fn)} />}
            {tab==="cobranza" && <CobranzaSection distribucion={(state.distribucion||[]).filter(c=>!c.eliminado)} cobranza={state.cobranza||{}} setCobranza={(fn)=>setSection("cobranza",fn)} />}
            {tab==="catalogo" && <BuscadorCodigos catalogoCustom={state.catalogoCustom||{}} setCatalogoCustom={(fn)=>setState(st=>({...st,catalogoCustom:typeof fn==="function"?fn(st.catalogoCustom||{}):fn}))} puedeEditar={puedeExportarRol(rolUsuario)} />}
            {tab==="simulador" && <SimuladorCompra />}
            {tab==="rutas" && <RutasSection rutas={state.rutas||[]} setRutas={(fn)=>setState(s=>({...s,rutas:typeof fn==="function"?fn(s.rutas||[]):fn}))} allData={allData} agentes={AGENTES} agente={agenteActivo} notify={notify} />}
            {tab==="servicio" && <ServicioSection appts={state.appts||[]} setAppts={setAppts} agente={agenteActivo} notify={notify} allData={allData} />}
            {tab==="control" && <ControlActividad allData={allData} appts={state.appts||[]} reclutamiento={state.reclutamiento||[]} cierres={state.controlCierres||[]} onGuardarCierre={(c)=>setSection("controlCierres",p=>[c,...(p||[])])} />}
            {tab==="stats" && <Stats data={allData} callLog={state.callLog} appts={state.appts||[]} />}
            {tab==="cumpleanos" && <CumpleSection cumpleanos={state.cumpleanos||[]} setCumple={(fn)=>setState(s=>({...s,cumpleanos:typeof fn==="function"?fn(s.cumpleanos||[]):fn}))} allData={allData} agente={agenteActivo} notify={notify} puedeImportar={true} />}
            {tab==="incentivo" && (puedeGestionarIncentivos
              ? <IncentivosHub incentivos={state.incentivos||[]} setIncentivos={(fn)=>setState(s=>({...s,incentivos:typeof fn==="function"?fn(s.incentivos||[]):fn}))} allData={allData} agentes={AGENTES} notify={notify} rolActivo={rolUsuario} agenteActivo={agenteActivo} cofreConfig={state.cofreConfig} setCofreConfig={setCofreConfig} incentivosCobranza={state.incentivosCobranza||[]} setIncentivosCobranza={(fn)=>setState(s=>({...s,incentivosCobranza:typeof fn==="function"?fn(s.incentivosCobranza||[]):fn}))} incentivosReclut={state.incentivosReclut||[]} setIncentivosReclut={(fn)=>setState(s=>({...s,incentivosReclut:typeof fn==="function"?fn(s.incentivosReclut||[]):fn}))} cobranza={state.cobranza||{}} socios={state.socios||[]} reclutamiento={state.reclutamiento||[]} />
              : <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3]"><div className="mb-2 flex justify-center"><Ico e="🔒" size={36} strokeWidth={1.25} className="opacity-40" /></div><div className="text-sm text-slate-500 font-bold">Solo el administrador o distribuidor encargado puede gestionar incentivos.</div><div className="text-xs text-slate-400 mt-1">Tu progreso aparece en tu pantalla de Inicio.</div></div>
            )}
            {tab==="config" && <ConfigSection agenteActivo={agenteActivo} onCerrarSesion={cerrarSesion} rolActivo={rolUsuario} emailActivo={email} cumpleMsgTpl={state.cumpleMsgTpl||""} onSaveCumpleMsg={(t)=>setState(s=>({...s,cumpleMsgTpl:t}))} cuentasCustom={state.cuentasCustom||[]} onSaveCuentas={(u)=>setState(s=>({...s,cuentasCustom:typeof u==="function"?u(s.cuentasCustom||[]):u}))} allData={allData} onLimpiarSinTelefono={()=>{
              const sinTel=(arr)=>(arr||[]).filter(c=>!c.eliminado && soloDigitos(c.telefono).length<10).length;
              const totalSinTel=sinTel(state.agregados)+sinTel(state.prospectos)+sinTel(state.distribucion);
              if(totalSinTel===0){ alert("✅ No hay registros sin teléfono. Todo está limpio."); return; }
              if(!confirm(`Se encontraron ${totalSinTel} registro(s) sin teléfono válido (Agregados, Prospectos y Distribución).\n\n¿Moverlos a la papelera? Podrás restaurarlos si fue un error.`)) return;
              const marcar=(arr)=>(arr||[]).map(c=>(!c.eliminado && soloDigitos(c.telefono).length<10)?{...c,eliminado:true}:c);
              setState(s=>({...s, agregados:marcar(s.agregados), prospectos:marcar(s.prospectos), distribucion:marcar(s.distribucion)}));
              alert(`✅ ${totalSinTel} registro(s) sin teléfono movidos a la papelera.`);
            }} onExtraerCP={()=>{
              // Copia el CP de 5 dígitos que esté dentro de la dirección a la casilla cp (sin tocar la dirección)
              const cuenta=(arr)=>(arr||[]).filter(c=>{
                if(c.eliminado) return false;
                if(String(c.cp||"").replace(/\D/g,"").length===5) return false;
                return zipDesdeTexto(c.direccion||"").length===5;
              }).length;
              const totalCP=cuenta(state.agregados)+cuenta(state.prospectos)+cuenta(state.distribucion);
              if(totalCP===0){ alert("✅ No hay códigos postales por separar. Todo está en orden."); return; }
              if(!confirm(`Se encontraron ${totalCP} cliente(s) con el código postal dentro de la dirección.\n\n¿Copiar ese código postal a su casilla de C.P.? La dirección NO se modifica, solo se llena la casilla vacía.`)) return;
              const arreglar=(arr)=>(arr||[]).map(c=>{
                if(c.eliminado) return c;
                if(String(c.cp||"").replace(/\D/g,"").length===5) return c;
                const zip=zipDesdeTexto(c.direccion||"");
                return zip.length===5 ? {...c, cp:zip} : c;
              });
              setState(s=>({...s, agregados:arreglar(s.agregados), prospectos:arreglar(s.prospectos), distribucion:arreglar(s.distribucion)}));
              alert(`✅ Código postal separado en ${totalCP} cliente(s). Ahora puedes filtrar por C.P. más fácil.`);
            }} />}
          </div>
        </main>
      </div>
      {showAI && <Modal title="🤖 Importar datos con IA" onClose={()=>setShowAI(false)}><AIExtractor onExtracted={handleAIExtracted} onClose={()=>setShowAI(false)} /></Modal>}
      {showCSV && <Modal title="📄 Importar CSV o PDF — sin IA" onClose={()=>setShowCSV(false)}><ImportadorMasivo onListo={guardarImportacionMasiva} onClose={()=>setShowCSV(false)} /></Modal>}
      {refReview && <RefReviewModal records={refReview} onSave={guardarReferidos} onClose={()=>setRefReview(null)} />}
      {dupReview && <Modal title="⚠️ Datos duplicados detectados" onClose={()=>setDupReview(null)}>
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-800">
            Se encontraron <strong>{dupReview.dups.length} dato(s) duplicado(s)</strong> que ya existen en tu base (mismo nombre y teléfono, o mismo número de cuenta).
            {dupReview.fresh.length>0 && <> También hay <strong>{dupReview.fresh.length} dato(s) nuevo(s)</strong> listos para guardar.</>}
          </div>

          {dupReview.dups.length>0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duplicados encontrados</div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 bg-[#f4f6f9] rounded-xl p-2">
                {dupReview.dups.map((d,i)=>(
                  <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs border border-[#e8edf3]">
                    <div className="font-bold text-[#1f2d3d]">{d.nombre||"(Sin nombre)"}</div>
                    <div className="text-slate-400">{d.telefono||"Sin tel."}{d.cuenta?` · Cuenta ${d.cuenta}`:""} · <span className="text-amber-600 font-bold">repite {d._razon}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dupReview.fresh.length>0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nuevos que se guardarán</div>
              <div className="max-h-32 overflow-y-auto space-y-1.5 bg-emerald-50/50 rounded-xl p-2">
                {dupReview.fresh.slice(0,20).map((d,i)=>(
                  <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs border border-emerald-100">
                    <div className="font-bold text-[#1f2d3d]">{d.nombre||"(Sin nombre)"}</div>
                    <div className="text-slate-400">{d.telefono||"Sin tel."}{d.cuenta?` · Cuenta ${d.cuenta}`:""}</div>
                  </div>
                ))}
                {dupReview.fresh.length>20 && <div className="text-center text-xs text-slate-400 py-1">+{dupReview.fresh.length-20} más</div>}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {/* Opción recomendada: fusionar (completa la info de los existentes) + guardar nuevos */}
            <button onClick={()=>{
                const conExistente = dupReview.dups.filter(d=>d._existente);
                conExistente.forEach(d=>fusionarDuplicado(d));
                guardarImportados(dupReview.dest, dupReview.fresh, 0);
                setImportMsg(`✅ ${dupReview.fresh.length} nuevo(s) · ${conExistente.length} completado(s) con info nueva`);
                setTimeout(()=>setImportMsg(""),5000);
              }}
              className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:"#047857"}}>
              🔗 Completar existentes con info nueva{dupReview.fresh.length>0?` + guardar ${dupReview.fresh.length} nuevo(s)`:""}
            </button>
            {dupReview.fresh.length>0 && (
              <button onClick={()=>guardarImportados(dupReview.dest, dupReview.fresh, dupReview.dups.length)}
                className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white" style={{background:RP.navy}}>
                <Ico e="✅" className="mr-1.5" />Solo guardar {dupReview.fresh.length} nuevo(s) (ignorar duplicados)
              </button>
            )}
            <button onClick={()=>setDupReview(null)}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-[#f4f6f9]">
              Cancelar — no guardar nada
            </button>
          </div>
        </div>
      </Modal>}
      {showNotifs && <NotifPanel notifs={notifs} agenteActivo={agenteActivo} onClose={()=>setShowNotifs(false)} onMarcarLeidas={()=>{marcarLeidas();setShowNotifs(false);}} onNotifClick={handleNotifClick} onLimpiar={()=>{ if(confirm("¿Borrar todas las notificaciones? (no afecta clientes ni datos)")){ setState(s=>({...s,notificaciones:[]})); setShowNotifs(false); } }} />}
    </div>
  );
}

// Agente activo (quién usa este dispositivo) — para registrar quién hizo cada acción
function useAgenteActivo() {
  const [a,setA]=useState(()=>{ try { return localStorage.getItem("crm_agente")||"Tomas"; } catch { return "Tomas"; } });
  useEffect(()=>{ try { localStorage.setItem("crm_agente",a); } catch {} },[a]);
  return [a,setA];
}
