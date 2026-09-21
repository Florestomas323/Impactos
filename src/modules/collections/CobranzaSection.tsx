import { useState, useEffect, useRef, useMemo } from "react";
import * as LU from "lucide-react";
import { Ico } from "../../iconos";
import { unirHistorial } from "../../utils/history";
import { ACCESS_V2 } from "../../config/flags";
import { asList } from "../../services/assignments";
// Modo v2: historial de cobranza leído de forma segura (mapa → lista). Producción: `v || []`.
const lstCob = ACCESS_V2 ? asList : (v) => v || [];
import { genId } from "../../utils/ids";

const __CobranzaModule = (function () {
// ── Iconos de línea reales (Lucide). Antes eran emojis dentro de un <span>,
//    lo que rompía la estética y no heredaba el color del texto. Ahora son
//    SVG con trazo uniforme que sí toman currentColor y el tamaño indicado.
const mkIcon = (Comp) => (p) => {
  p = p || {};
  const t = p.size || 15;
  return <Comp className={p.className} width={t} height={t} strokeWidth={1.75}
    style={{ display: "inline-block", verticalAlign: "-0.125em", ...(p.style || {}) }} aria-hidden="true" />;
};
const LayoutDashboard = mkIcon(LU.LayoutDashboard);
const Users = mkIcon(LU.Users);
const DollarSign = mkIcon(LU.DollarSign);
const RefreshCw = mkIcon(LU.RefreshCw);
const FileText = mkIcon(LU.FileText);
const Settings = mkIcon(LU.Settings);
const Search = mkIcon(LU.Search);
const Plus = mkIcon(LU.Plus);
const Phone = mkIcon(LU.Phone);
const MessageCircle = mkIcon(LU.MessageCircle);
const Mail = mkIcon(LU.Mail);
const CheckCircle2 = mkIcon(LU.CheckCircle2);
const XCircle = mkIcon(LU.XCircle);
const AlertTriangle = mkIcon(LU.AlertTriangle);
const ChevronRight = mkIcon(LU.ChevronRight);
const ChevronLeft = mkIcon(LU.ChevronLeft);
const Download = mkIcon(LU.Download);
const Trash2 = mkIcon(LU.Trash2);
const Edit3 = mkIcon(LU.PenLine);
const Undo2 = mkIcon(LU.Undo2);
const CreditCard = mkIcon(LU.CreditCard);
const Calendar = mkIcon(LU.Calendar);
const TrendingUp = mkIcon(LU.TrendingUp);
const Shield = mkIcon(LU.Shield);
const Zap = mkIcon(LU.Zap);
const Clock = mkIcon(LU.Clock);
const Target = mkIcon(LU.Target);
const Camera = mkIcon(LU.Camera);
const Upload = mkIcon(LU.Upload);
const X = mkIcon(LU.X);

const T = {
  bg: "#f0f2f5",
  panel: "#ffffff",
  panel2: "#f0f2f5",
  border: "#d0d4dc",
  borderHi: "#b8cae8",
  blue: "#1a3a6b",
  blueMid: "#2756a8",
  blueLight: "#4a7fd4",
  bluePale: "#e8edf8",
  green: "#1d8a4f",
  greenDim: "#e6f4ec",
  red: "#c0392b",
  yellow: "#c79100",
  orange: "#d97706",
  text: "#2c2c2c",
  mut: "#8a8a8a",
  mono: "'Inter', sans-serif",
  serif: "'Playfair Display', serif",
  glow: "0 2px 12px rgba(26,58,107,.10)",
  glowLg: "0 6px 28px rgba(26,58,107,.14)",
};
const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso) => Math.max(0, Math.floor((new Date(todayISO()).getTime() - new Date(iso).getTime()) / 86400000));
const validPhone = (p) => /^\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test((p || "").trim());
const cleanPhone = (p) => {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10 ? "1" + d : d;
};
const maskCard = (last4) => "•••• •••• •••• " + (last4 || "????");
const validExp = (e) => {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(e || "");
  if (!m) return false;
  const exp = new Date(2000 + +m[2], +m[1], 0);
  return exp >= new Date();
};
const DEFAULT_THRESHOLDS = { verde: 30, amarillo: 60, naranja: 90 };
const semaforoDe = (dias, th) => {
  if (dias <= th.verde) return { key: "verde", label: "AL CORRIENTE", color: T.green, accion: "Seguimiento preventivo" };
  if (dias <= th.amarillo) return { key: "amarillo", label: "MORA 31-60", color: T.yellow, accion: "Recordatorio firme — cuenta ya morosa para Hy Cite" };
  if (dias <= th.naranja) return { key: "naranja", label: "MORA 61-90", color: T.orange, accion: "Acción inmediata — alto riesgo de cesión" };
  return { key: "rojo", label: "CRÍTICO 90+", color: T.red, accion: "Cobranza formal urgente" };
};
// Rango del reporte Hy Cite (0-30/31-60/61-90/91+/colección) → manda sobre los días calculados
const RANGO_A_DIAS = { "0-30": 15, "31-60": 45, "61-90": 75, "91+": 120, "coleccion": 150 };
// Convierte CUALQUIER forma del atraso a nuestro código de rango: acepta el código
// exacto ("61-90"), el texto del badge de Hy Cite ("De 61 a 90 días de atraso"),
// inglés ("Over 90"), colección/charge back, "al día", etc. Nunca inventa.
function normalizarRangoHC(txt){
  const t = String(txt||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(!t.trim()) return "";
  if(/coleccion|charge\s*back|cargo\s*de\s*vuelta/.test(t)) return "coleccion";
  if(/91|over\s*90|mas\s*de\s*90|90\s*\+|\+\s*90/.test(t)) return "91+";
  if(/61/.test(t) && /90/.test(t)) return "61-90";
  if(/31/.test(t) && /60/.test(t)) return "31-60";
  if(/al\s*dia|current|corriente/.test(t)) return "0-30";
  if(/\b0\b.*30|1\s*a\s*30|0-30/.test(t)) return "0-30";
  return "";
}
// A prueba de balas: busca el rango de atraso en CUALQUIER campo del registro que
// devuelva la IA — no importa si lo puso en "rango", "estado", "status" o en un
// campo con nombre inesperado. Primero los campos conocidos (más fiables), luego
// un barrido total de todos los valores de texto. Así el atraso NUNCA se pierde
// por culpa del nombre del campo.
function rangoDeRegistro(r){
  if(!r || typeof r !== "object") return "";
  const conocidos = ["rango","estadoTexto","estado","status","situacion","dias_atraso","diasAtraso","atrasoDias","dias","aging","bucket"];
  for(const k of conocidos){ const v = normalizarRangoHC(r[k]); if(v) return v; }
  // barrido: cualquier valor de texto del objeto que mencione el atraso
  for(const val of Object.values(r)){
    if(typeof val === "string"){ const v = normalizarRangoHC(val); if(v) return v; }
  }
  return "";
}
const semDeCliente = (c, th) => {
  // 1) El RANGO del reporte Hy Cite manda (0-30/31-60/61-90/91+/colección).
  // 2) Sin rango: los días desde el último pago registrado.
  // 3) Sin rango NI fecha válida → NO se marca crítico: queda "al corriente /
  //    sin datos" para que la lista de CRÍTICOS solo tenga atrasados REALES.
  const d = daysSince(c.ultimoPago);
  const base = (c.rango && RANGO_A_DIAS[c.rango] !== undefined)
    ? semaforoDe(RANGO_A_DIAS[c.rango], th)
    : (Number.isFinite(d) ? semaforoDe(d, th) : { ...semaforoDe(0, th), sinDatos: true });
  if(c.rango === "coleccion") return { ...base, label: "COLECCIÓN (cargo de vuelta)", coleccion: true };
  // "0-30" es un ATRASO (1 cuota) — no es lo mismo que estar al corriente.
  if(c.rango === "0-30") return { ...base, label: "0-30 DÍAS", r030: true };
  return base;
};
const mesesVencidos = c => c.pagoMensual > 0 ? Math.min(24, Math.floor(daysSince(c.ultimoPago) / 30)) : 0;
const montoVencido = c => Math.min(c.saldo, mesesVencidos(c) * c.pagoMensual);
const pagoEsteMes = (c, mesKey) => (c.historial || []).some(h => h.tipo === "pago" && h.fecha.startsWith(mesKey));
const enRiesgoCesion = (c, mesKey) => mesesVencidos(c) >= 2 && !pagoEsteMes(c, mesKey);
const scoreDe = (c, th) => {
  const d = daysSince(c.ultimoPago);
  const sDias = Math.min(90, d);
  const sSaldo = Math.min(60, Math.round(c.saldo / 1500 * 60));
  const fallidos = (c.historial || []).filter(h => h.tipo === "promesa_rota").length;
  const sHist = Math.min(30, fallidos * 10 + (d > th.naranja ? 10 : 0));
  const sCesion = mesesVencidos(c) >= 2 ? 30 : 0;
  return sDias + sSaldo + sHist + sCesion;
};

/* ── Seed data ── */
const PLANTILLAS_DEFAULT = {
  verde: "Hola {nombre} 👋 Le saluda {usuario} de Royal Prestige. Le recuerdo con cariño que su próximo pago de {cuota} está por vencer. ¡Gracias por mantener su cuenta al día! 🙌\n\n💳 Si gusta, solicite por este mismo medio su LINK DE PAGO para pagar directo con su tarjeta, o indíquenos un horario y le llamamos para procesar su pago por teléfono.",
  amarillo: "Hola {nombre}, le saluda {usuario} de Royal Prestige. Su cuenta tiene un saldo de {saldo} y {dias} días sin registrar pago. ¿Le funciona ponerse al corriente esta semana con {cuota}? Puede pagar por {pago}. Quedo al pendiente 📲\n\n💳 Si gusta, solicite por este mismo medio su LINK DE PAGO para pagar directo con su tarjeta, o indíquenos un horario y le llamamos para procesar su pago por teléfono.",
  naranja: "{nombre}, buen día. Le escribe {usuario} de Royal Prestige. Su cuenta presenta {dias} días sin pago y un saldo de {saldo}. Es importante regularizarla esta semana para evitar cargos por demora. ¿Podemos acordar un abono hoy? Pague por {pago}.\n\n💳 Si gusta, solicite por este mismo medio su LINK DE PAGO para pagar directo con su tarjeta, o indíquenos un horario y le llamamos para procesar su pago por teléfono.",
  rojo: "{nombre}, le contacta {usuario}, distribuidor autorizado de Royal Prestige. Su cuenta tiene {dias} días de atraso con saldo de {saldo} y está en riesgo de pasar a cobranza formal. Necesito que nos comuniquemos HOY para establecer un plan. Puede abonar por {pago}.\n\n💳 Si gusta, solicite por este mismo medio su LINK DE PAGO para pagar directo con su tarjeta, o indíquenos un horario y le llamamos para procesar su pago por teléfono."
};
const renderPlantilla = (tpl, c, cfg) => {
  const formas = [cfg.zelle && `Zelle ${cfg.zelle}${cfg.zelleTitular ? " (" + cfg.zelleTitular + ")" : ""}`, cfg.cashapp && `Cash App ${cfg.cashapp}${cfg.cashappTitular ? " (" + cfg.cashappTitular + ")" : ""}`].filter(Boolean).join(" o ") || "Zelle o Cash App";
  return (tpl || "").replace(/{nombre}/g, c.nombre.split(" ")[0]).replace(/{nombreCompleto}/g, c.nombre).replace(/{saldo}/g, fmt(c.saldo)).replace(/{cuota}/g, fmt(c.pagoMensual)).replace(/{dias}/g, String(daysSince(c.ultimoPago))).replace(/{usuario}/g, cfg.usuario || "").replace(/{pago}/g, formas);
};
const plantillaLocal = (c, sem, cfgOuser) => {
  const cfg = typeof cfgOuser === "string" ? {
    usuario: cfgOuser,
    plantillas: PLANTILLAS_DEFAULT
  } : cfgOuser;
  const tpls = cfg && cfg.plantillas || PLANTILLAS_DEFAULT;
  return renderPlantilla(tpls[sem.key] || PLANTILLAS_DEFAULT[sem.key], c, cfg || {
    usuario: ""
  });
};
const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesKeyHoy = () => todayISO().slice(0, 7);
const nombreMes = ym => MESES_ES[+ym.split("-")[1] - 1] + " " + ym.split("-")[0];
const diasRestantesMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
};
const CARTERAS = {
  dist: {
    id: "dist",
    nombre: "DISTRIBUCIÓN",
    corto: "DIST",
    desc: "Clientes activos dentro de Royal Prestige / Hy Cite"
  },
  fin: {
    id: "fin",
    nombre: "MI FINANCIERA",
    corto: "FINANCIERA",
    desc: "Clientes en colección o financiados directamente por mí"
  }
};
const genFactura = (c, cfg) => {
  const dias = daysSince(c.ultimoPago);
  return `🧾 ESTADO DE CUENTA — ROYAL PRESTIGE
IMPACT ENTERPRISES · Distribuidor Autorizado FLOT0030
━━━━━━━━━━━━━━━━━━━━━━
Fecha: ${todayISO()}
Cliente: ${c.nombre}${c.nroCuenta ? " · Cta " + c.nroCuenta : ""}
Cartera: ${CARTERAS[c.cartera || "dist"].nombre}
━━━━━━━━━━━━━━━━━━━━━━
Saldo pendiente: ${fmt(c.saldo)}
Pago mensual: ${fmt(c.pagoMensual)}
Días desde su último pago: ${dias}
${dias > 30 ? "⚠ Su cuenta puede generar intereses y cargos por demora.\n" : ""}━━━━━━━━━━━━━━━━━━━━━━
FORMAS DE PAGO
${cfg.zelle ? "• Zelle: " + cfg.zelle + (cfg.zelleTitular ? " — " + cfg.zelleTitular : "") + "\n" : ""}${cfg.cashapp ? "• Cash App: " + cfg.cashapp + (cfg.cashappTitular ? " — " + cfg.cashappTitular : "") + "\n" : ""}• Efectivo o tarjeta en su visita

Para realizar su pago o acordar un plan:
${cfg.usuario || ""}${cfg.telDistribuidor ? " · " + cfg.telDistribuidor : ""}
Gracias por su preferencia 🙏`;
};
const waLink = (tel, msg) => `https://wa.me/${cleanPhone(tel)}?text=${encodeURIComponent(msg)}`;
const smsLink = (tel, msg) => `sms:${cleanPhone(tel)}?&body=${encodeURIComponent(msg)}`;
const csvDownload = (nombre, filas) => {
  const csv = filas.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8"
  }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
};
// Genera un reporte imprimible: en iPhone, desde el diálogo de imprimir se
// comparte/guarda como PDF (pellizca la vista previa o usa el botón compartir).
const pdfPrint = (titulo, cols, filas) => {
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2d3d}
    h1{font-size:18px;margin:0 0 2px}.sub{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#eef2f7;text-align:left;padding:6px 7px;border:1px solid #d6dee8}
    td{padding:5px 7px;border:1px solid #e2e8f0}
    tr:nth-child(even) td{background:#f8fafc}
    @media print{body{margin:8mm}}
  </style></head><body>
  <h1>${esc(titulo)}</h1><div class="sub">Impact Enterprises · Cobranza · ${todayISO()} · ${filas.length} registro(s)</div>
  <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
  <tbody>${filas.map(f => `<tr>${f.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};</scr` + `ipt></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Permite ventanas emergentes en Safari para generar el PDF"); return; }
  w.document.write(html);
  w.document.close();
};
async function generarMensajeIA(c, sem, cfg) {
  try {
    const res = await fetch("/api/anthropic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Eres asistente de cobranza de Royal Prestige para el distribuidor ${cfg.usuario}. Genera UN mensaje de WhatsApp en español para este cliente. Responde SOLO con el texto del mensaje, sin comillas ni preámbulo.\n\nCliente: ${c.nombre} (${c.ciudad})\nSaldo: ${fmt(c.saldo)} | Pago mensual: ${fmt(c.pagoMensual)}\nDías sin pagar: ${daysSince(c.ultimoPago)} | Nivel: ${sem.label}\n\nMáximo 90 palabras. Incluye opciones de pago Zelle/Cash App.`
        }]
      })
    });
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!txt) throw new Error("vacío");
    return {
      texto: txt,
      fuente: "IA"
    };
  } catch {
    return {
      texto: plantillaLocal(c, sem, cfg),
      fuente: "Plantilla local"
    };
  }
}

/* ── localStorage hook ── */
const Card = ({
  children,
  style,
  glow,
  onClick
}) => <div onClick={onClick} style={{
  background: T.panel,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  padding: 20,
  boxShadow: glow ? T.glowLg : T.glow,
  animation: "fadeUp .4s ease both",
  ...style
}}>{children}</div>;
const Btn = ({
  children,
  onClick,
  variant = "primary",
  style,
  disabled,
  title
}) => {
  const base = {
    fontFamily: T.mono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.3,
    padding: "10px 16px",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all .15s",
    opacity: disabled ? 0.4 : 1
  };
  const v = {
    primary: {
      background: T.blueMid,
      color: "#fff",
      borderColor: T.blueMid,
      boxShadow: T.glow
    },
    ghost: {
      background: "#fff",
      color: T.blueMid,
      borderColor: T.borderHi
    },
    danger: {
      background: "transparent",
      color: T.red,
      borderColor: T.red
    },
    dim: {
      background: T.panel2,
      color: T.mut,
      borderColor: T.border
    }
  };
  return <button title={title} disabled={disabled} onClick={onClick} style={{
    ...base,
    ...v[variant],
    ...style
  }}>{children}</button>;
};
const Input = ({
  label,
  error,
  ...p
}) => <label style={{
  display: "block",
  marginBottom: 12
}}>
    <span style={{
    fontSize: 11,
    color: T.blueMid,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase"
  }}>{label}</span>
    <input {...p} style={{
    width: "100%",
    boxSizing: "border-box",
    marginTop: 4,
    background: "#fff",
    border: `2px solid ${error ? T.red : T.border}`,
    borderRadius: 7,
    color: T.text,
    fontFamily: T.mono,
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 12px",
    outline: "none",
    ...p.style
  }} />
    {error && <span style={{
    fontSize: 10,
    color: T.red
  }}>{error}</span>}
  </label>;
const Badge = ({
  sem
}) => <span style={{
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 1,
  color: sem.color,
  background: sem.color + "14",
  border: `1.5px solid ${sem.color}`,
  borderRadius: 12,
  padding: "3px 10px",
  whiteSpace: "nowrap"
}}>{sem.label}</span>;
const Modal = ({
  title,
  onClose,
  children,
  wide
}) => <div onClick={onClose} style={{
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.8)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16
}}>
    <div onClick={e => e.stopPropagation()} style={{
    background: T.panel,
    border: `1px solid ${T.borderHi}`,
    borderRadius: 10,
    width: "100%",
    maxWidth: wide ? 720 : 460,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: T.glowLg
  }}>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 18px",
      borderBottom: `1px solid ${T.border}`
    }}>
        <span style={{
        fontFamily: T.serif,
        fontSize: 17,
        fontWeight: 700,
        color: T.blue
      }}>{title}</span>
        <button onClick={onClose} aria-label="Cerrar" style={{
        background: "none",
        border: "none",
        color: T.mut,
        cursor: "pointer"
      }}><X size={16} /></button>
      </div>
      <div style={{
      padding: 18
    }}>{children}</div>
    </div>
  </div>;
const H1 = ({
  children
}) => <h1 style={{
  fontFamily: T.serif,
  fontSize: 24,
  fontWeight: 700,
  color: T.blue,
  margin: "0 0 18px"
}}>{children}</h1>;
const SubT = ({
  children,
  style
}) => <div style={{
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: T.blueMid,
  marginBottom: 12,
  ...style
}}>{children}</div>;

/* ── Toasts ── */
let toastFn = null;
const toast = (msg, type = "ok") => toastFn && toastFn(msg, type);
const ToastHost = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastFn = (msg, type = "ok") => {
      const id = Date.now() + Math.random();
      setItems(x => [...x, {
        id,
        msg,
        type
      }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3500);
    };
    return () => {
      toastFn = null;
    };
  }, []);
  return <div style={{
    position: "fixed",
    bottom: 90,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 200,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "min(92vw, 380px)"
  }}>
      {items.map(i => <div key={i.id} style={{
      background: "#fff",
      border: `1px solid ${i.type === "err" ? T.red : T.green}`,
      color: i.type === "err" ? T.red : T.green,
      borderRadius: 7,
      padding: "10px 14px",
      fontFamily: T.mono,
      fontSize: 12,
      fontWeight: 600,
      boxShadow: T.glowLg,
      display: "flex",
      gap: 8,
      alignItems: "center"
    }}>
          {i.type === "err" ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {i.msg}
        </div>)}
    </div>;
};

/* ── CarteraChips ── */
const CarteraChips = ({
  value,
  onChange,
  conTodas
}) => <div style={{
  display: "flex",
  gap: 7,
  marginBottom: 12,
  flexWrap: "wrap"
}}>
    {(conTodas ? [["todas", "Todas"]] : []).concat([["dist", "Distribución"], ["fin", "Mi Financiera"]]).map(([k, n]) => <button key={k} onClick={() => onChange(k)} style={{
    background: value === k ? T.blueMid : T.bg,
    border: `1.5px solid ${value === k ? T.blueMid : T.border}`,
    color: value === k ? "#fff" : "#5a5a5a",
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 20,
    cursor: "pointer",
    fontFamily: T.mono,
    transition: "all .2s"
  }}>{n}</button>)}
  </div>;

/* ── ConfigMes ── */
const ConfigMes = ({
  mesKey,
  mesCfg,
  setMeses,
  onClose
}) => {
  const [f, setF] = useState({
    dist: mesCfg?.dist ?? "",
    fin: mesCfg?.fin ?? "",
    metaPct: mesCfg?.metaPct ?? 8
  });
  const [err, setErr] = useState("");
  const guardar = () => {
    if (isNaN(+f.dist) || +f.dist < 0 || f.dist === "" || isNaN(+f.fin) || +f.fin < 0 || f.fin === "") return setErr("Captura montos válidos en ambas carteras");
    if (isNaN(+f.metaPct) || +f.metaPct <= 0 || +f.metaPct > 100) return setErr("La meta debe ser entre 1 y 100");
    setMeses(m => ({
      ...m,
      [mesKey]: {
        dist: +f.dist,
        fin: +f.fin,
        metaPct: +f.metaPct
      }
    }));
    toast(`Cartera de ${nombreMes(mesKey)} actualizada`);
    onClose();
  };
  return <Modal title={"CARTERA DE " + nombreMes(mesKey).toUpperCase()} onClose={onClose}>
      <div style={{
      fontSize: 11,
      color: T.mut,
      marginBottom: 14,
      lineHeight: 1.6
    }}>Captura el monto real con el que arranca cada cartera este mes.</div>
      <Input label={"Cartera Distribución ($)"} type="number" value={f.dist} onChange={e => {
      setF({
        ...f,
        dist: e.target.value
      });
      setErr("");
    }} placeholder="200000" />
      <Input label={"Cartera Mi Financiera ($)"} type="number" value={f.fin} onChange={e => {
      setF({
        ...f,
        fin: e.target.value
      });
      setErr("");
    }} placeholder="35000" />
      <Input label="Meta del mes (% de la cartera)" type="number" value={f.metaPct} onChange={e => {
      setF({
        ...f,
        metaPct: e.target.value
      });
      setErr("");
    }} />
      {err && <div style={{
      color: T.red,
      fontSize: 11,
      marginBottom: 10
    }}>{err}</div>}
      <Btn onClick={guardar} style={{
      width: "100%",
      justifyContent: "center"
    }}><CheckCircle2 size={14} /> GUARDAR MES</Btn>
    </Modal>;
};

/* ── QuickPago ── */
/* ── BuscadorCliente: buscar por nombre o número de cuenta ── */
const BuscadorCliente = ({ clientes, value, onChange, compact, placeholder }) => {
  const [q, setQ] = useState("");
  const sel = clientes.find(c => String(c.id) === String(value));
  const t = q.toLowerCase().trim();
  const matches = t ? clientes.filter(c => c.nombre.toLowerCase().includes(t) || String(c.nroCuenta || "").includes(t)).slice(0, 8) : [];
  const fz = compact ? 11 : 13;
  if (sel) return <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.bluePale, border: `1.5px solid ${T.blueMid}`, borderRadius: 7, padding: compact ? "5px 8px" : "9px 12px" }}>
    <span style={{ flex: 1, fontFamily: T.mono, fontSize: fz, fontWeight: 700, color: T.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.nombre}{sel.nroCuenta ? ` · cta ${sel.nroCuenta}` : ""} · {fmt(sel.saldo)}</span>
    <button onClick={() => { onChange(""); setQ(""); }} title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", color: T.mut, fontSize: fz + 3, fontWeight: 700, padding: 0, lineHeight: 1 }}><Ico e="✕" /></button>
  </div>;
  return <div style={{ position: "relative" }}>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder || "Buscar por nombre o cuenta…"} inputMode="search" style={{
      width: "100%", boxSizing: "border-box", background: "#fff", border: `1.5px solid ${t ? T.blueMid : T.border}`,
      borderRadius: 7, padding: compact ? "6px 8px" : "10px 12px", fontFamily: T.mono, fontSize: fz, color: T.text, outline: "none"
    }} />
    {matches.length > 0 && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, background: "#fff", border: `1.5px solid ${T.blueMid}`, borderRadius: 7, marginTop: 3, maxHeight: 200, overflowY: "auto", boxShadow: T.glowLg }}>
      {matches.map(c => <button key={c.id} onClick={() => { onChange(c.id); setQ(""); }} style={{
        display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${T.bg}`,
        padding: compact ? "7px 9px" : "9px 12px", cursor: "pointer", fontFamily: T.mono, fontSize: fz, color: T.text
      }}><b>{c.nombre}</b>{c.nroCuenta ? ` · cta ${c.nroCuenta}` : ""} · <span style={{ color: T.blueMid, fontWeight: 700 }}>{fmt(c.saldo)}</span></button>)}
    </div>}
    {t && !matches.length && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 7, marginTop: 3, padding: "8px 12px", fontFamily: T.mono, fontSize: 11, color: T.mut }}>Sin coincidencias</div>}
  </div>;
};
const QuickPago = ({
  clientes,
  onPago,
  onClose
}) => {
  const [id, setId] = useState("");
  const sel = clientes.find(c => String(c.id) === String(id));
  const [monto, setMonto] = useState(sel?.pagoMensual || "");
  const [metodo, setMetodo] = useState("Zelle");
  const [err, setErr] = useState("");
  const ok = () => {
    const m = +monto;
    if (!sel) return setErr("Selecciona un cliente");
    if (isNaN(m) || m <= 0) return setErr("Ingresa un monto mayor a cero");
    onPago(sel.id, m, metodo);
    onClose();
  };
  return <Modal title="REGISTRAR PAGO DEL DÍA" onClose={onClose}>
      <label style={{
      display: "block",
      marginBottom: 12
    }}>
        <span style={{
        fontSize: 11,
        color: T.blueMid,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase"
      }}>Cliente</span>
        <div style={{
        marginTop: 4
      }}>
          <BuscadorCliente clientes={clientes} value={id} onChange={nid => {
          setId(nid);
          const s = clientes.find(c => String(c.id) === String(nid));
          setMonto(s?.pagoMensual || "");
          setErr("");
        }} />
        </div>
      </label>
      <Input label="Monto ($)" type="number" value={monto} onChange={e => {
      setMonto(e.target.value);
      setErr("");
    }} error={err} />
      <SubT>MÉTODO</SubT>
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 16
    }}>
        {["Zelle", "Cash App", "Efectivo", "Tarjeta"].map(m => <button key={m} onClick={() => setMetodo(m)} style={{
        padding: 10,
        background: metodo === m ? T.bluePale : "#fff",
        border: `2px solid ${metodo === m ? T.blueMid : T.border}`,
        borderRadius: 7,
        color: metodo === m ? T.blueMid : T.mut,
        fontFamily: T.mono,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer"
      }}>{m.toUpperCase()}</button>)}
      </div>
      <Btn onClick={ok} style={{
      width: "100%",
      justifyContent: "center"
    }}><DollarSign size={14} /> CONFIRMAR PAGO</Btn>
    </Modal>;
};

/* ── FacturaModal ── */
const FacturaModal = ({
  c,
  cfg,
  onClose
}) => {
  const [txt, setTxt] = useState(genFactura(c, cfg));
  return <Modal title={"FACTURA DE COBRO · " + c.nombre.split(" ")[0].toUpperCase()} onClose={onClose} wide>
      <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={15} style={{
      width: "100%",
      boxSizing: "border-box",
      background: "#fff",
      border: `2px solid ${T.border}`,
      borderRadius: 7,
      color: T.text,
      fontFamily: T.mono,
      fontSize: 12.5,
      padding: 14,
      outline: "none",
      resize: "vertical",
      lineHeight: 1.55
    }} />
      <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 12
    }}>
        <a href={waLink(c.tel, txt)} target="_blank" rel="noreferrer" style={{
        textDecoration: "none"
      }}><Btn><MessageCircle size={13} /> WHATSAPP</Btn></a>
        <a href={`mailto:${c.email}?subject=${encodeURIComponent("Estado de cuenta — Royal Prestige · " + c.nombre)}&body=${encodeURIComponent(txt)}`} style={{
        textDecoration: "none"
      }}><Btn variant="ghost"><Mail size={13} /> EMAIL</Btn></a>
        <a href={`tel:${cleanPhone(c.tel)}`} style={{
        textDecoration: "none"
      }}><Btn variant="ghost"><Phone size={13} /> LLAMAR</Btn></a>
        <Btn variant="ghost" onClick={() => {
        navigator.clipboard?.writeText(txt);
        toast("Factura copiada");
      }}>COPIAR</Btn>
      </div>
    </Modal>;
};

/* ── PromesaModal ── */
const PromesaModal = ({
  c,
  onSave,
  onClose
}) => {
  const [fecha, setFecha] = useState(todayISO());
  const [hora, setHora] = useState("15:00");
  const [monto, setMonto] = useState(c.pagoMensual);
  const [err, setErr] = useState("");
  const ok = () => {
    if (!fecha || fecha < todayISO()) return setErr("La fecha debe ser hoy o futura");
    if (monto !== "" && (isNaN(+monto) || +monto <= 0)) return setErr("Monto inválido");
    onSave(fecha, hora || "12:00", monto === "" ? null : +monto);
    onClose();
  };
  return <Modal title={"🤝 PROMESA DE PAGO · " + c.nombre.split(" ")[0].toUpperCase()} onClose={onClose}>
      <div style={{
      fontSize: 11,
      color: T.mut,
      marginBottom: 14
    }}>Registra cuándo se comprometió a pagar.</div>
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }}>
        <Input label="Fecha prometida" type="date" value={fecha} onChange={e => {
        setFecha(e.target.value);
        setErr("");
      }} />
        <Input label="Hora" type="time" value={hora} onChange={e => setHora(e.target.value)} />
      </div>
      <Input label="Monto prometido ($, opcional)" type="number" value={monto} onChange={e => {
      setMonto(e.target.value);
      setErr("");
    }} />
      {err && <div style={{
      color: T.red,
      fontSize: 11,
      marginBottom: 10
    }}>{err}</div>}
      <Btn onClick={ok} style={{
      width: "100%",
      justifyContent: "center"
    }}><CheckCircle2 size={14} /> GUARDAR PROMESA</Btn>
    </Modal>;
};

/* ── LlamarModal ── */
const LlamarModal = ({
  tel,
  cfg,
  onClose
}) => {
  const num = cleanPhone(tel);
  const opciones = [{
    label: "Teléfono / celular",
    desc: "App de llamadas normal",
    href: `tel:${num}`,
    icon: Phone,
    ext: false
  }, cfg.crmTelemarketingUrl ? {
    label: "CRM Telemarketing",
    desc: "Marcar desde tu CRM",
    href: cfg.crmTelemarketingUrl.replace("{tel}", num).replace("{tel10}", num.replace(/^1/, "")),
    icon: Target,
    ext: true
  } : null, {
    label: "WhatsApp (llamada)",
    desc: "Abre el chat para llamar",
    href: `https://wa.me/${num}`,
    icon: MessageCircle,
    ext: true
  }].filter(Boolean);
  return <Modal title={"LLAMAR · " + tel} onClose={onClose}>
      <div style={{
      fontSize: 11,
      color: T.mut,
      marginBottom: 14
    }}>Elige por dónde quieres llamar:</div>
      {opciones.map((o, i) => <a key={i} href={o.href} target={o.ext ? "_blank" : undefined} rel="noreferrer" onClick={() => setTimeout(onClose, 300)} style={{
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      marginBottom: 8,
      background: "#fff",
      border: `2px solid ${T.border}`,
      borderRadius: 8,
      cursor: "pointer"
    }}>
          <o.icon size={18} color={T.blueMid} />
          <div style={{
        flex: 1
      }}>
            <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: T.text
        }}>{o.label}</div>
            <div style={{
          fontSize: 10,
          color: T.mut
        }}>{o.desc}</div>
          </div>
          <ChevronRight size={15} color={T.mut} />
        </a>)}
    </Modal>;
};

/* ── IA compartida: leer foto/PDF y devolver JSON ── */
const leerConIA = (file, prompt, maxTokens = 4096) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = async () => {
    try {
      const b64 = String(r.result).split(",")[1];
      const esPDF = file.type === "application/pdf";
      const bloque = esPDF
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } };
      const res = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens,
          messages: [{ role: "user", content: [bloque, { type: "text", text: prompt }] }] })
      });
      if (!res.ok) throw new Error("Servidor " + res.status);
      const data = await res.json();
      const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/```json|```/g, "").trim();
      resolve(JSON.parse(txt));
    } catch (e) { reject(e); }
  };
  r.onerror = () => reject(new Error("No se pudo leer el archivo"));
  r.readAsDataURL(file);
});
const BotonSubirIA = ({ leyendo, onFile, texto }) => {
  const ref = useRef(null);
  return <>
    <button onClick={() => ref.current?.click()} disabled={leyendo} style={{
      width: "100%", boxSizing: "border-box", background: T.bluePale, border: `2px dashed ${T.blueMid}`,
      borderRadius: 7, padding: 26, cursor: leyendo ? "wait" : "pointer", fontFamily: T.mono,
      color: T.blueMid, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center",
      justifyContent: "center", gap: 8, animation: leyendo ? "pulse 1s infinite" : "none"
    }}><Camera size={16} /> {leyendo ? "LEYENDO CON IA…" : texto}</button>
    <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
      onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
  </>;
};

/* ── ImportReporteFin: Resumen de métricas Hy Cite (cartera + atrasos + niveles) ── */
const ImportReporteFin = ({ onGuardar, onClose }) => {
  const [leyendo, setLeyendo] = useState(false);
  const [snap, setSnap] = useState(null);
  const [fecha, setFecha] = useState(todayISO());
  const PROMPT = 'Esta imagen o documento es un "Resumen de métricas" de cuentas por cobrar de Hy Cite / Royal Prestige. Tiene una tabla con columnas: Nivel, Cuentas por cobrar, (0-30), (31-60), (61-90), (Over 90) y una fila TOTAL. Devuelve SOLO JSON válido, sin texto ni backticks: {"niveles":[{"nivel":1,"cxc":0,"d0":0,"d31":0,"d61":0,"d90":0}],"total":{"cxc":0,"d0":0,"d31":0,"d61":0,"d90":0},"cesion":{"cuentas":0,"monto":0}}. Montos como números sin $ ni comas. cxc=Cuentas por cobrar, d0=(0-30), d31=(31-60), d61=(61-90), d90=(Over 90). Incluye todos los niveles que aparezcan, en orden. Si el reporte menciona cuentas en cesión (cedidas o por ceder) pon su cantidad en cesion.cuentas y su monto en cesion.monto; si no aparece, deja ambos en 0.';
  const leer = async (f) => {
    setLeyendo(true);
    try {
      const j = await leerConIA(f, PROMPT);
      const num = v => +(+v || 0).toFixed(2);
      const tot = j.total || {};
      const niveles = (j.niveles || []).map(n => ({ nivel: +n.nivel || 0, cxc: num(n.cxc), d0: num(n.d0), d31: num(n.d31), d61: num(n.d61), d90: num(n.d90) }));
      const total = { cxc: num(tot.cxc), d0: num(tot.d0), d31: num(tot.d31), d61: num(tot.d61), d90: num(tot.d90) };
      if (!(total.cxc > 0)) throw new Error("no encontré el total de Cuentas por cobrar");
      const ces = j.cesion || {};
      setSnap({ total, niveles, cesion: { cuentas: Math.max(0, Math.round(+ces.cuentas || 0)), monto: num(ces.monto) } });
    } catch (e) { toast("No pude leer el reporte: " + (e.message || e), "err"); }
    setLeyendo(false);
  };
  const sumaNiv = snap ? snap.niveles.reduce((s, n) => s + n.cxc, 0) : 0;
  const difiere = snap && snap.niveles.length > 0 && Math.abs(sumaNiv - snap.total.cxc) > 1;
  const atr = snap ? snap.total.d0 + snap.total.d31 + snap.total.d61 + snap.total.d90 : 0;
  const celda = { padding: "5px 8px", fontSize: 11, textAlign: "right", borderBottom: `1px solid ${T.bg}` };
  return <Modal title="IMPORTAR REPORTE FINANCIERO" onClose={onClose} wide>
    {!snap ? <>
      <div style={{ fontSize: 11, color: T.mut, marginBottom: 12, lineHeight: 1.6 }}>
        Sube la foto o PDF del <b>Resumen de métricas</b> de Hy Cite. La IA extrae la cartera exacta de Distribución, los atrasos por rango y el desglose por nivel. El <b>primer reporte del mes</b> fija automáticamente la cartera inicial.
      </div>
      <BotonSubirIA leyendo={leyendo} onFile={leer} texto="SUBIR FOTO O PDF DEL REPORTE" />
    </> : <>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.mut, marginBottom: 4 }}>FECHA DEL REPORTE</div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{
            width: "100%", boxSizing: "border-box", background: "#fff", border: `2px solid ${T.border}`,
            borderRadius: 7, padding: "8px 10px", fontFamily: T.mono, fontSize: 13, color: T.text, outline: "none" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.mut }}>CARTERA (CxC)</div>
          <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 700, color: T.blue }}>{fmt(snap.total.cxc)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        {[["0-30", snap.total.d0, T.yellow], ["31-60", snap.total.d31, T.orange], ["61-90", snap.total.d61, T.red], ["+90", snap.total.d90, "#7f1d1d"]].map(([l, v, c]) =>
          <div key={l} style={{ background: T.bg, border: `1px solid ${T.border}`, borderLeft: `3px solid ${c}`, borderRadius: 7, padding: "7px 9px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.mut }}>ATRASO {l}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmt(v)}</div>
          </div>)}
      </div>
      <div style={{ fontSize: 11, color: T.mut, marginBottom: 10 }}>Atrasos totales: <b style={{ color: T.red }}>{fmt(atr)}</b> · Mora: <b style={{ color: T.red }}>{snap.total.cxc > 0 ? (atr / snap.total.cxc * 100).toFixed(1) : 0}%</b></div>
      {snap.niveles.length > 0 && <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono }}>
          <thead><tr>{["Nivel", "CxC", "0-30", "31-60", "61-90", "+90"].map(h => <th key={h} style={{ ...celda, textAlign: h === "Nivel" ? "left" : "right", background: T.bluePale, color: T.blue, fontWeight: 700, position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
          <tbody>{snap.niveles.map(n => <tr key={n.nivel}>
            <td style={{ ...celda, textAlign: "left", fontWeight: 700 }}>{n.nivel}</td>
            <td style={celda}>{fmt(n.cxc)}</td><td style={celda}>{fmt(n.d0)}</td><td style={celda}>{fmt(n.d31)}</td><td style={celda}>{fmt(n.d61)}</td><td style={celda}>{fmt(n.d90)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {difiere && <div style={{ fontSize: 10, color: T.orange, marginBottom: 10 }}><Ico e="⚠" className="mr-1.5" />La suma de niveles ({fmt(sumaNiv)}) difiere del TOTAL leído — se usará la fila TOTAL del reporte.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={() => setSnap(null)} style={{ flex: 1, justifyContent: "center" }}>VOLVER A LEER</Btn>
        <Btn onClick={() => { if (!fecha) return toast("Selecciona la fecha del reporte", "err"); onGuardar({ fecha, total: snap.total, niveles: snap.niveles }); onClose(); }} style={{ flex: 2, justifyContent: "center" }}><CheckCircle2 size={14} /> GUARDAR REPORTE</Btn>
      </div>
    </>}
  </Modal>;
};

/* ── ImportPagosDia: reporte de pagos diarios con IA → registra pago por cliente ── */
const ImportPagosDia = ({ clientes, onPago, onPagoExterno, onClose }) => {
  const [leyendo, setLeyendo] = useState(false);
  const [filas, setFilas] = useState(null);
  const PROMPT = 'Este documento o imagen es un reporte de pagos diarios de clientes de Royal Prestige / Hy Cite (Recibo de Pagos). Extrae cada pago que aparezca. Devuelve SOLO un arreglo JSON válido, sin texto ni backticks: [{"cuenta":"número de cuenta solo dígitos","nombre":"nombre del cliente","monto":número,"fecha":"YYYY-MM-DD"}]. Montos como números sin $ ni comas. fecha = la FECHA DE PAGO de esa fila convertida a formato YYYY-MM-DD (ej. 7/3/2026 → 2026-07-03); si no aparece usa "". Si falta otro dato usa "" o 0. No inventes filas ni incluyas totales.';
  const emparejar = rows => rows.map(r => {
    const porCuenta = clientes.find(c => c.nroCuenta && String(c.nroCuenta) === String(r.cuenta));
    const porNombre = !porCuenta && clientes.find(c => {
      const parts = String(r.nombre || "").toLowerCase().split(" ").filter(Boolean);
      return parts.length >= 1 && c.nombre.toLowerCase().includes(parts[0]) && (parts.length < 2 || c.nombre.toLowerCase().includes(parts[parts.length - 1]));
    });
    const f = String(r.fecha || "").slice(0, 10);
    return { ...r, monto: +(+r.monto || 0).toFixed(2), fecha: /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : "", clienteId: (porCuenta || porNombre)?.id || "", incluir: true };
  });
  const leer = async (f) => {
    setLeyendo(true);
    try {
      const arr = await leerConIA(f, PROMPT);
      if (!Array.isArray(arr) || !arr.length) throw new Error("no encontré pagos en el documento");
      setFilas(emparejar(arr.filter(r => +r.monto > 0)));
    } catch (e) { toast("No pude leer los pagos: " + (e.message || e), "err"); }
    setLeyendo(false);
  };
  const upd = (i, k, v) => setFilas(filas.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const marcados = filas ? filas.filter(f => f.incluir && +f.monto > 0) : [];
  const listos = marcados.filter(f => f.clienteId);      // con cliente en la app: baja su saldo
  const externos = marcados.filter(f => !f.clienteId);   // sin cliente: igual suman al cobrado del mes
  const confirmar = () => {
    if (!marcados.length) return toast("Marca al menos un pago con monto", "err");
    listos.forEach(f => onPago(+f.clienteId || f.clienteId, +f.monto, "Hy Cite", f.fecha));
    if (externos.length && onPagoExterno) onPagoExterno(externos);
    const tot = marcados.reduce((s, f) => s + +f.monto, 0);
    toast(`${marcados.length} pago(s) del día registrados ✓ (${fmt(tot)})${externos.length ? ` · ${externos.length} sin cliente, sumados al mes` : ""}`);
    onClose();
  };
  return <Modal title="IMPORTAR PAGOS DEL DÍA (IA)" onClose={onClose} wide>
    {!filas ? <>
      <div style={{ fontSize: 11, color: T.mut, marginBottom: 12, lineHeight: 1.6 }}>
        Sube la foto o PDF del <b>reporte de pagos diarios</b>. La IA lee cada pago, lo empareja con tu cliente por cuenta o nombre, y tú confirmas antes de registrar. Cada pago baja el saldo del cliente y suma al cobrado del mes.
      </div>
      <BotonSubirIA leyendo={leyendo} onFile={leer} texto="SUBIR FOTO O PDF DE PAGOS" />
    </> : <>
      <div style={{ fontSize: 11, color: T.mut, marginBottom: 12 }}>Revisa el emparejamiento. Los pagos con cliente bajan su saldo; los que queden sin cliente igual se registran y suman al cobrado del mes.</div>
      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {filas.map((f, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr 90px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
          <input type="checkbox" checked={f.incluir} onChange={e => upd(i, "incluir", e.target.checked)} style={{ width: 16, height: 16, accentColor: T.blueMid }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{f.nombre || "(sin nombre)"} <span style={{ color: T.mut, fontWeight: 500 }}>· cta {f.cuenta || "—"}</span></div>
            <div style={{ marginTop: 3 }}>
              <BuscadorCliente clientes={clientes} value={f.clienteId} onChange={v => upd(i, "clienteId", v)} compact placeholder="Asignar: nombre o cuenta…" />
            </div>
          </div>
          <input type="number" value={f.monto} onChange={e => upd(i, "monto", e.target.value)} style={{
            background: "#fff", border: `1.5px solid ${T.border}`, borderRadius: 6, padding: "6px 8px",
            fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.text, outline: "none", textAlign: "right", width: "100%", boxSizing: "border-box" }} />
        </div>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 11, color: T.mut }}>{marcados.length} de {filas.length} listos · total <b style={{ color: T.green }}>{fmt(listos.reduce((s, f) => s + +f.monto, 0))}</b></div>
        <Btn onClick={confirmar}><CheckCircle2 size={14} /> REGISTRAR {marcados.length} PAGO(S)</Btn>
      </div>
    </>}
  </Modal>;
};

/* ── TendenciaCartera: control diario de cartera y atrasos (snapshots del mes) ── */
const TendenciaCartera = ({ snaps, isMobile, pagosDespues = 0 }) => {
  const [verNiv, setVerNiv] = useState(false);
  if (!snaps || !snaps.length) return null;
  const ult = snaps[snaps.length - 1];
  const ant = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const atrDe = t => t.d0 + t.d31 + t.d61 + t.d90;
  const atr = atrDe(ult.total);
  const mora = ult.total.cxc > 0 ? atr / ult.total.cxc * 100 : 0;
  const alerta61 = ant && ult.total.d61 > ant.total.d61;
  const deltaCart = ant ? ult.total.cxc - ant.total.cxc : 0;
  const carteraViva = Math.max(0, +(ult.total.cxc - (+pagosDespues || 0)).toFixed(2)); // sincronizada con los pagos de la app
  /* mini gráfica SVG: cartera (azul) y atrasos (naranja) */
  const W = 300, H = 70, PAD = 6;
  const maxY = Math.max(...snaps.map(s => s.total.cxc), 1);
  const px = i => snaps.length > 1 ? PAD + i * (W - PAD * 2) / (snaps.length - 1) : W / 2;
  const py = v => H - PAD - (v / maxY) * (H - PAD * 2);
  const linea = f => snaps.map((s, i) => `${px(i).toFixed(1)},${py(f(s)).toFixed(1)}`).join(" ");
  const celda = { padding: "4px 7px", fontSize: 10, textAlign: "right", borderBottom: `1px solid ${T.bg}` };
  return <Card glow style={{ marginBottom: 20, borderLeft: `3px solid ${alerta61 ? T.red : T.blueMid}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      <div>
        <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 700, color: T.blue }}>Control de cartera</div>
        <div style={{ fontSize: 10, color: T.mut, marginTop: 2 }}>Último reporte: {ult.fecha} · {snaps.length} reporte(s) este mes{pagosDespues > 0 ? " · − " + fmt(pagosDespues) + " pagados en la app desde el reporte" : ""}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.mut }}>MORA ACTUAL</div>
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: mora >= 25 ? T.red : mora >= 15 ? T.orange : T.green }}>{mora.toFixed(1)}%</div>
      </div>
    </div>
    {alerta61 && <div style={{ background: "#fdecea", border: `1px solid ${T.red}`, borderRadius: 7, padding: "8px 12px", fontSize: 11, color: T.red, fontWeight: 700, marginBottom: 10 }}>
      <Ico e="⚠" className="mr-1.5" />Los atrasos 61-90 subieron de {fmt(ant.total.d61)} a {fmt(ult.total.d61)} desde el reporte anterior. Prioriza esos clientes antes de que pasen a +90.
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
      {[["Cartera" + (pagosDespues > 0 ? " (viva)" : ""), carteraViva, T.blue, ant ? deltaCart : null], ["Atrasos", atr, T.orange, ant ? atr - atrDe(ant.total) : null], ["61-90 días", ult.total.d61, T.red, ant ? ult.total.d61 - ant.total.d61 : null], ["+90 días", ult.total.d90, "#7f1d1d", ant ? ult.total.d90 - ant.total.d90 : null]].map(([l, v, c, d]) =>
        <div key={l} style={{ background: T.bg, border: `1px solid ${T.border}`, borderLeft: `3px solid ${c}`, borderRadius: 7, padding: "8px 10px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.mut, textTransform: "uppercase" }}>{l}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmt(v)}</div>
          {d !== null && Math.abs(d) >= 0.01 && <div style={{ fontSize: 9, fontWeight: 700, color: d > 0 ? T.red : T.green }}>{d > 0 ? "▲" : "▼"} {fmt(Math.abs(d))}</div>}
        </div>)}
    </div>
    {snaps.length > 1 && <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 10px 4px", marginBottom: 10 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <polyline points={linea(s => s.total.cxc)} fill="none" stroke={T.blueMid} strokeWidth="2" />
        <polyline points={linea(s => atrDe(s.total))} fill="none" stroke={T.orange} strokeWidth="2" strokeDasharray="4 3" />
        {snaps.map((s, i) => <circle key={"c" + i} cx={px(i)} cy={py(s.total.cxc)} r="2.5" fill={T.blueMid} />)}
        {snaps.map((s, i) => <circle key={"a" + i} cx={px(i)} cy={py(atrDe(s.total))} r="2.5" fill={T.orange} />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.mut, padding: "2px 2px 4px" }}>
        <span>{snaps[0].fecha}</span>
        <span><span style={{ color: T.blueMid, fontWeight: 700 }}>― Cartera</span> · <span style={{ color: T.orange, fontWeight: 700 }}>┅ Atrasos</span></span>
        <span>{ult.fecha}</span>
      </div>
    </div>}
    {ult.niveles && ult.niveles.length > 0 && <>
      <button onClick={() => setVerNiv(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: T.blueMid, padding: 0 }}>
        {verNiv ? "▾ Ocultar niveles" : "▸ Ver desglose por nivel (" + ult.niveles.length + ")"}
      </button>
      {verNiv && <div style={{ maxHeight: 170, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 7, marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono }}>
          <thead><tr>{["Nivel", "CxC", "0-30", "31-60", "61-90", "+90"].map(h => <th key={h} style={{ ...celda, textAlign: h === "Nivel" ? "left" : "right", background: T.bluePale, color: T.blue, fontWeight: 700, position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
          <tbody>{ult.niveles.map(n => <tr key={n.nivel} style={{ background: n.d61 + n.d90 > 0 ? "#fff7ed" : "#fff" }}>
            <td style={{ ...celda, textAlign: "left", fontWeight: 700 }}>{n.nivel}</td>
            <td style={celda}>{fmt(n.cxc)}</td><td style={celda}>{fmt(n.d0)}</td><td style={celda}>{fmt(n.d31)}</td><td style={celda}>{fmt(n.d61)}</td><td style={celda}>{fmt(n.d90)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </Card>;
};

/* ── PromesasCard ── */
const PromesasCard = ({
  clientes,
  cfg,
  onPago,
  onRomper
}) => {
  const conPromesa = clientes.filter(c => c.promesa);
  if (!conPromesa.length) return null;
  const hoy = todayISO();
  const estado = p => p.fecha < hoy ? "vencida" : p.fecha === hoy ? "hoy" : "próxima";
  const orden = [...conPromesa].sort((a, b) => (a.promesa.fecha + a.promesa.hora).localeCompare(b.promesa.fecha + b.promesa.hora));
  return <Card style={{
    marginBottom: 20
  }}>
      <SubT><Ico e="🤝" className="mr-1.5" />PROMESAS DE PAGO ({conPromesa.length})</SubT>
      {orden.map((c, i) => {
      const st = estado(c.promesa);
      const col = st === "vencida" ? T.red : st === "hoy" ? T.orange : T.blueMid;
      return <div key={c.id} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: i < orden.length - 1 ? `1px solid ${T.border}` : "none",
        flexWrap: "wrap"
      }}>
            <div style={{
          flex: 1,
          minWidth: 140
        }}>
              <div style={{
            fontSize: 12,
            fontWeight: 700
          }}>{c.nombre}</div>
              <div style={{
            fontSize: 10,
            color: col,
            fontWeight: 700
          }}>{st === "vencida" ? <><Ico e="⚠" className="mr-1" />VENCIDA</> : st === "hoy" ? "● HOY" : "PRÓXIMA"} · {c.promesa.fecha} {c.promesa.hora}{c.promesa.monto ? " · " + fmt(c.promesa.monto) : ""}</div>
            </div>
            <Btn style={{
          padding: "6px 10px",
          fontSize: 10
        }} onClick={() => onPago(c.id, c.promesa.monto || c.pagoMensual, "Zelle")}><DollarSign size={12} /> PAGÓ</Btn>
            <a href={waLink(c.tel, `Hola ${c.nombre.split(" ")[0]}, le saluda ${cfg.usuario} de Royal Prestige. Le recuerdo su pago acordado para ${c.promesa.fecha === hoy ? "hoy" : "el " + c.promesa.fecha} a las ${c.promesa.hora}. ¡Gracias! 🙌`)} target="_blank" rel="noreferrer" style={{
          textDecoration: "none"
        }}><Btn variant="ghost" style={{
            padding: "6px 10px"
          }}><MessageCircle size={12} /></Btn></a>
            {st === "vencida" && <Btn variant="danger" style={{
          padding: "6px 10px",
          fontSize: 10
        }} onClick={() => onRomper(c.id)}><XCircle size={12} /> NO CUMPLIÓ</Btn>}
          </div>;
    })}
    </Card>;
};

/* ── MetaMes ── */
const MetaMes = ({
  onPagoExterno,
  mesKey,
  mesCfg,
  setMeses,
  onReporteFin,
  cobradoCartera,
  clientes,
  onPago,
  isMobile,
  puedeEditar = true
}) => {
  const [cfgOpen, setCfgOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [repOpen, setRepOpen] = useState(false);
  const [pagosIAOpen, setPagosIAOpen] = useState(false);
  if (!mesCfg) return <Card glow style={{
    marginBottom: 20,
    borderLeft: `3px solid ${T.orange}`
  }}>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10
    }}>
        <div>
          <div style={{
          fontFamily: T.serif,
          fontSize: 17,
          fontWeight: 700,
          color: T.blue
        }}>Nuevo mes: {nombreMes(mesKey)}</div>
          <div style={{
          fontSize: 11,
          color: T.mut,
          marginTop: 3
        }}>Captura la cartera inicial del mes para medir tu avance diario.</div>
        </div>
        {puedeEditar ? <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap"
      }}>
          <Btn onClick={() => setRepOpen(true)}><FileText size={13} /> IMPORTAR REPORTE FINANCIERO</Btn>
          <Btn variant="ghost" onClick={() => setCfgOpen(true)}><Edit3 size={13} /> CAPTURA MANUAL</Btn>
        </div> : <span style={{
        fontSize: 11,
        color: T.mut
      }}>Pídele al admin configurar el mes</span>}
      </div>
      {cfgOpen && <ConfigMes mesKey={mesKey} mesCfg={mesCfg} setMeses={setMeses} onClose={() => setCfgOpen(false)} />}
      {repOpen && <ImportReporteFin onGuardar={onReporteFin} onClose={() => setRepOpen(false)} />}
    </Card>;
  const metaTotal = (mesCfg.dist + mesCfg.fin) * mesCfg.metaPct / 100;
  const cobradoTotal = cobradoCartera.dist + cobradoCartera.fin;
  const ritmo = Math.max(0, metaTotal - cobradoTotal) / diasRestantesMes();
  const Fila = ({
    k
  }) => {
    const ini = mesCfg[k],
      cob = cobradoCartera[k],
      meta = ini * mesCfg.metaPct / 100;
    const pct = meta > 0 ? Math.min(100, cob / meta * 100) : 100;
    const col = pct >= 100 ? T.green : pct >= 60 ? T.blueMid : T.orange;
    return <div style={{
      marginBottom: 14
    }}>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        marginBottom: 5,
        flexWrap: "wrap",
        gap: 4
      }}>
          <span style={{
          fontWeight: 700,
          color: T.blue
        }}>{CARTERAS[k].nombre} <span style={{
            color: T.mut,
            fontWeight: 500
          }}>· cartera {fmt(ini)}</span></span>
          <span style={{
          color: T.mut
        }}>{fmt(cob)} de <b style={{
            color: T.text
          }}>{fmt(meta)}</b> ({Math.round(pct)}%)</span>
        </div>
        <div style={{
        height: 9,
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        overflow: "hidden"
      }}>
          <div style={{
          width: pct + "%",
          height: "100%",
          background: col,
          borderRadius: 6,
          transition: "width .4s"
        }} />
        </div>
      </div>;
  };
  return <Card glow style={{
    marginBottom: 20,
    border: `2px solid ${T.blue}`
  }}>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
      flexWrap: "wrap",
      gap: 8
    }}>
        <div>
          <div style={{
          fontFamily: T.serif,
          fontSize: 18,
          fontWeight: 700,
          color: T.blue
        }}>Meta de {nombreMes(mesKey)} <em style={{
            color: T.blueLight
          }}>· {mesCfg.metaPct}% de la cartera</em></div>
          <div style={{
          fontSize: 11,
          color: T.mut,
          marginTop: 3
        }}>Quedan {diasRestantesMes()} días · ritmo necesario: <b style={{
            color: T.blue
          }}>{fmt(ritmo)}/día</b></div>
        </div>
        <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap"
      }}>
          <Btn onClick={() => setRepOpen(true)} style={{
          padding: "8px 12px",
          fontSize: 11
        }}><FileText size={13} /> REPORTE FINANCIERO</Btn>
          <Btn onClick={() => setPagosIAOpen(true)} style={{
          padding: "8px 12px",
          fontSize: 11
        }}><Camera size={13} /> PAGOS DEL DÍA (IA)</Btn>
          <Btn variant="ghost" onClick={() => setPagoOpen(true)} style={{
          padding: "8px 12px",
          fontSize: 11
        }}><Plus size={13} /> PAGO DEL DÍA</Btn>
          {puedeEditar && <Btn variant="ghost" onClick={() => setCfgOpen(true)} style={{
          padding: "8px 12px",
          fontSize: 11
        }}><Edit3 size={13} /> EDITAR MES</Btn>}
        </div>
      </div>
      <Fila k="dist" />
      <Fila k="fin" />
      <div style={{
      borderTop: `2px solid ${T.blue}`,
      paddingTop: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      flexWrap: "wrap",
      gap: 6
    }}>
        <span style={{
        fontFamily: T.serif,
        fontSize: 15,
        fontWeight: 700,
        color: T.blue
      }}>Total cobrado del mes</span>
        <span style={{
        fontSize: 17,
        fontWeight: 700,
        color: cobradoTotal >= metaTotal ? T.green : T.text
      }}>{fmt(cobradoTotal)} <span style={{
          fontSize: 11,
          color: T.mut,
          fontWeight: 500
        }}>de {fmt(metaTotal)} · faltan {fmt(Math.max(0, metaTotal - cobradoTotal))}</span></span>
      </div>
      {cfgOpen && <ConfigMes mesKey={mesKey} mesCfg={mesCfg} setMeses={setMeses} onClose={() => setCfgOpen(false)} />}
      {pagoOpen && <QuickPago clientes={clientes} onPago={onPago} onClose={() => setPagoOpen(false)} />}
      {repOpen && <ImportReporteFin onGuardar={onReporteFin} onClose={() => setRepOpen(false)} />}
      {pagosIAOpen && <ImportPagosDia clientes={clientes} onPago={onPago} onPagoExterno={onPagoExterno} onClose={() => setPagosIAOpen(false)} />}
    </Card>;
};

/* ── KpisHyCite ── */
const KpisHyCite = ({
  kpi,
  isMobile,
  irCobranza
}) => {
  const tile = (label, val, meta) => {
    const ok = val < meta;
    return <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 7,
      padding: 12
    }}>
        <div style={{
        fontSize: 9,
        color: T.mut,
        fontWeight: 700,
        letterSpacing: 0.8
      }}>{label}</div>
        <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: ok ? T.green : T.red,
        marginTop: 4
      }}>{val.toFixed(2)}%</div>
        <div style={{
        fontSize: 9,
        color: T.mut,
        marginTop: 2
      }}>meta Hy Cite &lt; {meta}% {ok ? <><Ico e="✓" className="mr-1" />en verde</> : <><Ico e="⚠" className="mr-1" />fuera de meta</>}</div>
      </div>;
  };
  // Qué se muestra en el tile de cesión: 1º cesión explícita del reporte,
  // 2º el monto +61 días del reporte, 3º el cálculo con los clientes de la app.
  const tieneRep = kpi.rep61 != null;
  const cesMonto = kpi.repCesion ? kpi.repCesion.monto : (tieneRep ? kpi.rep61 : kpi.saldoRiesgo);
  const cesCuentas = kpi.repCesion ? kpi.repCesion.cuentas : (tieneRep ? null : kpi.riesgo.length);
  const cesActivo = (+cesMonto > 0) || ((cesCuentas || 0) > 0);
  return <Card style={{
    marginBottom: 20
  }}>
      <SubT>INDICADORES HY CITE · {kpi.desdeReporte ? "SEGÚN REPORTE" : "ESTIMADOS"}</SubT>
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)",
      gap: 10
    }}>
        {tile("% MOROSIDAD 31+", kpi.mora31, 12)}
        {tile("MOROSIDAD TOTAL", kpi.moraTotal, 40)}
        <button onClick={irCobranza} style={{
        textAlign: "left",
        background: cesActivo ? "#fdf3f2" : T.bg,
        border: `1px solid ${cesActivo ? T.red : T.border}`,
        borderRadius: 7,
        padding: 12,
        cursor: "pointer",
        fontFamily: T.mono,
        gridColumn: isMobile ? "1 / -1" : "auto"
      }}>
          <div style={{
          fontSize: 9,
          color: cesActivo ? T.red : T.mut,
          fontWeight: 700,
          letterSpacing: 0.8
        }}>{tieneRep ? <><Ico e="🚨" className="mr-1" />EN CESIÓN · +61 DÍAS · SEGÚN REPORTE</> : <><Ico e="🚨" className="mr-1" />RIESGO DE CESIÓN ESTE MES</>}</div>
          <div style={{
          fontSize: 22,
          fontWeight: 800,
          color: cesActivo ? T.red : T.green,
          marginTop: 4
        }}>{cesCuentas != null ? cesCuentas : fmt(cesMonto)} <span style={{
            fontSize: 12,
            fontWeight: 600
          }}>{cesCuentas != null ? `cuentas · ${fmt(cesMonto)}` : "en cuentas con +61 días"}</span></div>
          <div style={{
          fontSize: 9,
          color: T.mut,
          marginTop: 2
        }}>{tieneRep ? `📄 Reporte Hy Cite del ${kpi.repFecha} — tu cartera a trabajar este mes` : (kpi.riesgo.length ? "Un pago las salva → ir a Rescate" : "Sin cuentas por ceder ✓")}{kpi.salvadas.length ? ` · ${kpi.salvadas.length} salvada(s) ✓` : ""}</div>
          {kpi.atraso60Count > 0 && <div style={{
          fontSize: 10,
          color: T.orange,
          fontWeight: 700,
          marginTop: 6,
          paddingTop: 6,
          borderTop: `1px solid ${T.border}`
        }}>⚠ +60 días de atraso: {kpi.atraso60Count} cuenta(s) · {fmt(kpi.atraso60Saldo)}</div>}
        </button>
      </div>
    </Card>;
};

/* ── Dashboard ── */
const Dashboard = ({
  resumen,
  prioritarios,
  onPagoExterno,
  pagosExternos,
  isMobile,
  irCobranza,
  mesKey,
  mesCfg,
  setMeses,
  cobradoCartera,
  clientes,
  onPago,
  kpi,
  cfg,
  onRomper,
  puedeEditarMes,
  snapsMes,
  onReporteFin,
  pagosDespues
}) => {
  const [verPagosMes, setVerPagosMes] = useState(false);
  const kpis = [{
    label: "COBRADO ESTE MES",
    val: fmt(resumen.cobradoMes),
    icon: TrendingUp,
    color: T.green,
    onClick: () => setVerPagosMes(v => !v)
  }, {
    label: "CRÍTICOS",
    val: resumen.cats.rojo.length,
    icon: Zap,
    color: T.red
  }];
  const catList = [{
    k: "corriente",
    c: T.green,
    n: "AL CORRIENTE",
    sel: cats => cats.verde.filter(c => c.rango !== "0-30")
  }, {
    k: "r030",
    c: "#65a30d",
    n: "ATRASO 0-30",
    sel: cats => cats.verde.filter(c => c.rango === "0-30")
  }, {
    k: "amarillo",
    c: T.yellow,
    n: "MORA 31-60",
    sel: cats => cats.amarillo
  }, {
    k: "naranja",
    c: T.orange,
    n: "MORA 61-90",
    cesion: true,
    sel: cats => cats.naranja
  }, {
    k: "rojo",
    c: T.red,
    n: "CRÍTICO 90+",
    cesion: true,
    sel: cats => cats.rojo
  }];
  const totalClientes = (resumen.cats.verde.length + resumen.cats.amarillo.length + resumen.cats.naranja.length + resumen.cats.rojo.length) || 1;
  // ── Lista de pagos del mes por cliente (para el desglose de "Cobrado este mes") ──
  const mesActual = todayISO().slice(0, 7);
  const pagosMes = [
    ...(clientes || []).flatMap(c => (c.historial || [])
      .filter(h => h.tipo === "pago" && h.fecha && h.fecha.startsWith(mesActual))
      .map(h => ({ nombre: c.nombre, monto: h.monto, fecha: h.fecha, metodo: h.metodo || "" }))),
    ...((pagosExternos || []).filter(h => h.fecha && h.fecha.startsWith(mesActual))
      .map(h => ({ nombre: (h.nombre || "(sin nombre)") + " · Hy Cite", monto: h.monto, fecha: h.fecha, metodo: h.origen || "" })))
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return <div>
      <H1>Panel de Control</H1>
      <MetaMes mesKey={mesKey} mesCfg={mesCfg} setMeses={setMeses} cobradoCartera={cobradoCartera} clientes={clientes} onPago={onPago} onPagoExterno={onPagoExterno} isMobile={isMobile} puedeEditar={puedeEditarMes} onReporteFin={onReporteFin} />
      <TendenciaCartera snaps={snapsMes} isMobile={isMobile} pagosDespues={pagosDespues} />
      <KpisHyCite kpi={kpi} isMobile={isMobile} irCobranza={irCobranza} />
      <PromesasCard clientes={clientes} cfg={cfg} onPago={onPago} onRomper={onRomper} />
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginBottom: 20
    }}>
        {kpis.map(k => <Card key={k.label} onClick={k.onClick} style={k.onClick ? { cursor: "pointer" } : undefined}>
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
              <span style={{
            fontSize: 9,
            color: T.mut,
            letterSpacing: 1
          }}>{k.label}</span><k.icon size={14} color={k.color} />
            </div>
            <div style={{
          fontSize: isMobile ? 17 : 22,
          fontWeight: 800,
          color: k.color,
          marginTop: 8
        }}>{k.val}</div>
            {k.onClick && <div style={{
          fontSize: 9,
          color: T.blueMid,
          fontWeight: 700,
          marginTop: 4
        }}>{verPagosMes ? "▲ ocultar detalle" : `▼ ver ${pagosMes.length} pago(s)`}</div>}
          </Card>)}
      </div>
      {verPagosMes && <Card style={{ marginBottom: 20 }}>
        <SubT>PAGOS DE {nombreMes(mesKey).toUpperCase()} · {pagosMes.length}</SubT>
        {pagosMes.length === 0 && <div style={{ fontSize: 12, color: T.mut, padding: "8px 0" }}>Aún no hay pagos registrados este mes.</div>}
        {pagosMes.map((p, i) => <div key={i} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 0",
          borderBottom: `1px solid ${T.border}`,
          gap: 10
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</div>
              <div style={{ fontSize: 10, color: T.mut }}>{p.fecha}{p.metodo ? ` · ${p.metodo}` : ""}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.green }}>{fmt(p.monto)}</div>
          </div>)}
        {pagosMes.length > 0 && <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 0 0",
          fontSize: 13,
          fontWeight: 800
        }}><span>TOTAL</span><span style={{ color: T.green }}>{fmt(pagosMes.reduce((s, p) => s + p.monto, 0))}</span></div>}
      </Card>}
      <Card style={{
      marginBottom: 20
    }}>
        <SubT>SEMÁFORO DE CARTERA</SubT>
        {(() => {
        // Con reporte del mes: los montos y % salen DIRECTO del Control de
        // Cartera (Hy Cite) → verde = cxc − mora, y cada rango con su monto.
        const ultRep = snapsMes && snapsMes.length ? snapsMes[snapsMes.length - 1] : null;
        const repMap = ultRep ? {
          verde: Math.max(0, +(ultRep.total.cxc - ultRep.total.d31 - ultRep.total.d61 - ultRep.total.d90).toFixed(2)),
          amarillo: ultRep.total.d31, naranja: ultRep.total.d61, rojo: ultRep.total.d90
        } : null;
        return <>
        {ultRep && <div style={{ fontSize: 9, color: T.mut, marginBottom: 8 }}>Proporcional al Control de Cartera · reporte del {ultRep.fecha}</div>}
        {catList.map(x => {
        const arr = x.sel(resumen.cats);
        const monto = (() => {
          if (!repMap) return arr.reduce((s, c) => s + c.saldo, 0);
          if (x.k !== "corriente" && x.k !== "r030") return repMap[x.k];
          // El reporte Hy Cite no separa 0-30 de al corriente: se reparte el monto verde
          // proporcional al saldo real de cada grupo de clientes.
          const sC = resumen.cats.verde.filter(c => c.rango !== "0-30").reduce((s, c) => s + c.saldo, 0);
          const s3 = resumen.cats.verde.filter(c => c.rango === "0-30").reduce((s, c) => s + c.saldo, 0);
          const tot = sC + s3;
          if (tot <= 0) return x.k === "corriente" ? repMap.verde : 0;
          return repMap.verde * (x.k === "corriente" ? sC : s3) / tot;
        })();
        const pct = repMap
          ? (ultRep.total.cxc > 0 ? Math.round(monto / ultRep.total.cxc * 100) : 0)
          : Math.round(arr.length / totalClientes * 100);
        return <div key={x.k} style={{
          marginBottom: 12
        }}>
              <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            marginBottom: 4
          }}>
                <span style={{
              color: x.c,
              fontWeight: 700
            }}>● {x.n}{x.cesion ? " · ⚠ CESIÓN" : ""} <span style={{
                color: T.mut
              }}>({arr.length})</span></span>
                <span style={{
              color: T.mut
            }}>{fmt(monto)}</span>
              </div>
              <div style={{
            height: 5,
            background: T.panel2,
            borderRadius: 2
          }}>
                <div style={{
              width: pct + "%",
              height: "100%",
              background: x.c,
              borderRadius: 2,
              boxShadow: `0 0 8px ${x.c}55`
            }} />
              </div>
            </div>;
      })}
        {(() => {
        const rc = [...resumen.cats.naranja, ...resumen.cats.rojo];
        const m = rc.reduce((s, c) => s + c.saldo, 0);
        return rc.length > 0 && <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: T.red,
          background: "#fef2f2",
          border: `1.5px solid ${T.red}`,
          borderRadius: 8,
          padding: "6px 10px",
          marginTop: 4
        }}><Ico e="⚠" className="mr-1.5" />RIESGO DE CESIÓN (más de 60 días): {rc.length} cliente(s) · {fmt(m)}</div>;
      })()}
        </>;
      })()}
      </Card>
      <Card glow>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12
      }}>
          <SubT style={{
          margin: 0
        }}><Ico e="🔥" className="mr-1.5" />Prioritarios de Hoy</SubT>
          <Btn variant="ghost" onClick={irCobranza} style={{
          padding: "6px 12px",
          fontSize: 10
        }}>IR A COBRANZA <ChevronRight size={12} /></Btn>
        </div>
        {prioritarios.slice(0, 5).map((c, i) => <div key={c.id} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: i < 4 ? `1px solid ${T.border}` : "none"
      }}>
            <span style={{
          color: T.mut,
          fontSize: 11,
          width: 18
        }}>{i + 1}.</span>
            <div style={{
          flex: 1,
          minWidth: 0
        }}>
              <div style={{
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}>{c.nombre}</div>
              <div style={{
            fontSize: 10,
            color: T.mut
          }}>{c.rango ? `atraso ${c.rango==="coleccion"?"colección":c.rango}` : Number.isFinite(c.dias) ? `${c.dias}d sin pago` : "sin datos de pago"} · {fmt(c.saldo)}</div>
            </div>
            <span style={{
          fontSize: 10,
          color: c.sem.color,
          fontWeight: 700
        }}>SCORE {c.score}</span>
            <Badge sem={c.sem} />
          </div>)}
      </Card>
    </div>;
};

/* ── FormCliente ── */
const FormCliente = ({
  c,
  onClose,
  onGuardar,
  disponibles
}) => {
  const nuevo = !c;
  const [pick, setPick] = useState(null);
  const [busq, setBusq] = useState("");
  const base = c || pick;
  const [f, setF] = useState(() => ({
    cartera: c && c.cartera || "dist",
    nombre: c && c.nombre || "",
    tel: c && c.tel || "",
    nroCuenta: c && c.nroCuenta || "",
    ciudad: c && c.ciudad || "",
    direccion: c && c.direccion || "",
    saldo: c && c.saldo != null && c.saldo !== "" ? c.saldo : "",
    pagoMensual: c && c.pagoMensual ? c.pagoMensual : "",
    nivel: c && c.nivel ? c.nivel : "",
    ultimoPago: c && c.ultimoPago || todayISO(),
    email: c && c.email || "",
    tipoCuenta: c && c.tipoCuenta || "",
    metodoPago: c && c.metodoPago || "",
    estado: c && c.estado || "Activo",
    cargoVueltaFecha: c && c.cargoVueltaFecha || "",
    cargoVueltaMonto: c && c.cargoVueltaMonto || "",
    nota: c && c.nota || "",
    referencias: c && c.referencias || []
  }));
  const [errs, setErrs] = useState({});
  const lista = (disponibles || []).filter(d => ((d.nombre || "") + (d.ciudad || "") + (d.telefono || "") + (d.cuenta || "")).toLowerCase().includes(busq.toLowerCase())).slice(0, 40);
  const guardar = () => {
    const e = {};
    if (nuevo && f.cartera !== "fin" && !pick) e.pick = "Elige un cliente de Distribución";
    if (nuevo && f.cartera === "fin" && !(f.nombre || "").trim()) e.nombre = "Nombre requerido";
    if (f.saldo === "" || isNaN(+f.saldo) || +f.saldo < 0) e.saldo = "Monto válido requerido";
    if (f.pagoMensual === "" || isNaN(+f.pagoMensual) || +f.pagoMensual <= 0) e.pagoMensual = "Monto válido requerido";
    if (f.nivel !== "" && (+f.nivel < 1 || +f.nivel > 9)) e.nivel = "Nivel entre 1 y 9";
    setErrs(e);
    if (Object.keys(e).length) return;
    const ident = c ? {
      nombre: (f.nombre || "").trim() || c.nombre || "",
      tel: (f.tel || "").trim(),
      nroCuenta: (f.nroCuenta || "").trim(),
      ciudad: (f.ciudad || "").trim(),
      direccion: (f.direccion || "").trim()
    } : (nuevo && f.cartera === "fin") ? {
      nombre: (f.nombre || "").trim(),
      tel: (f.tel || "").trim(),
      nroCuenta: (f.nroCuenta || "").trim(),
      ciudad: (f.ciudad || "").trim(),
      direccion: (f.direccion || "").trim()
    } : base ? {
      nombre: base.nombre || "",
      tel: base.telefono || base.tel || "",
      nroCuenta: base.cuenta || base.nroCuenta || "",
      ciudad: base.ciudad || "",
      direccion: base.direccion || ""
    } : {};
    const payload = {
      ...ident,
      cartera: f.cartera,
      saldo: +f.saldo,
      pagoMensual: +f.pagoMensual,
      nivel: f.nivel === "" ? "" : +f.nivel,
      ultimoPago: f.ultimoPago,
      email: f.email,
      tipoCuenta: f.tipoCuenta,
      metodoPago: f.metodoPago,
      estado: f.estado,
      cargoVueltaFecha: f.cargoVueltaFecha,
      cargoVueltaMonto: f.cargoVueltaMonto,
      nota: f.nota,
      referencias: (f.referencias || []).filter(r => (r.nombre || "").trim())
    };
    if (nuevo) payload._pickId = pick ? pick.id : "fin-" + genId();
    onGuardar(payload, c ? c.id : null);
  };
  const set = k => e => setF({
    ...f,
    [k]: e.target.value
  });
  const setRef = (i, k, v) => setF({
    ...f,
    referencias: f.referencias.map((r, j) => j === i ? {
      ...r,
      [k]: v
    } : r)
  });
  const inpBox = {
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    border: `2px solid ${T.border}`,
    borderRadius: 7,
    color: T.text,
    fontFamily: T.mono,
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 10px",
    outline: "none"
  };
  const lbl = {
    fontSize: 11,
    color: T.blueMid,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase"
  };
  return <Modal title={c ? "FICHA DE COBRANZA" : "AGREGAR CLIENTE A COBRANZA"} onClose={onClose} wide>
      {nuevo && !pick && f.cartera !== "fin" && <div style={{
      marginBottom: 14
    }}>
          <SubT>ELIGE UN CLIENTE DE DISTRIBUCIÓN</SubT>
          <div style={{
        position: "relative",
        marginBottom: 8
      }}>
            <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: T.mut
        }} />
            <input autoFocus value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar por nombre, ciudad, teléfono o cuenta…" style={{
          ...inpBox,
          padding: "10px 12px 10px 32px"
        }} />
          </div>
          {errs.pick && <div style={{
        color: T.red,
        fontSize: 11,
        fontWeight: 700,
        marginBottom: 6
      }}>{errs.pick}</div>}
          <div style={{
        maxHeight: 260,
        overflowY: "auto",
        border: `1px solid ${T.border}`,
        borderRadius: 7
      }}>
            {lista.map(d => <div key={d.id} onClick={() => setPick(d)} style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${T.border}`,
          cursor: "pointer"
        }}>
                <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.text
          }}>{d.nombre || "(sin nombre)"}</div>
                <div style={{
            fontSize: 10,
            color: T.mut
          }}>{[d.ciudad, d.telefono, d.cuenta && "Cta " + d.cuenta].filter(Boolean).join(" · ")}</div>
              </div>)}
            {!lista.length && <div style={{
          padding: 16,
          textAlign: "center",
          color: T.mut,
          fontSize: 12
        }}>{(disponibles || []).length ? "Sin coincidencias." : "No hay clientes de Distribución disponibles (o ya están todos en cobranza)."}</div>}
          </div>
          <button onClick={() => setF({ ...f, cartera: "fin" })} style={{
        width: "100%",
        marginTop: 10,
        padding: "10px 12px",
        background: "#fff",
        border: `2px dashed ${T.blueMid}`,
        borderRadius: 8,
        color: T.blueMid,
        fontFamily: T.mono,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer"
      }}><Ico e="🏦" className="mr-1.5" />¿ES DE TU FINANCIERA? AGRÉGALO MANUAL AQUÍ</button>
        </div>}

      {(base || (nuevo && f.cartera === "fin")) && <div>
          {(!nuevo || f.cartera === "fin") && <div style={{ marginBottom: 6 }}>
            <SubT>{nuevo ? "DATOS DEL CLIENTE DE TU FINANCIERA" : "DATOS DEL CLIENTE · EDITABLES"}</SubT>
            <Input label="Nombre completo" value={f.nombre} onChange={set("nombre")} error={errs.nombre} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Teléfono" value={f.tel} onChange={set("tel")} />
              <Input label="Nº de cuenta" value={f.nroCuenta} onChange={set("nroCuenta")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Ciudad" value={f.ciudad} onChange={set("ciudad")} />
              <Input label="Dirección" value={f.direccion} onChange={set("direccion")} />
            </div>
          </div>}
          {nuevo && base && <div style={{
        background: T.bluePale,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 14
      }}>
            <div style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 1,
          color: T.blueMid,
          marginBottom: 6
        }}>DATOS DESDE DISTRIBUCIÓN · SE SINCRONIZAN SOLOS</div>
            <div style={{
          fontSize: 15,
          fontWeight: 800,
          color: T.blue
        }}>{base.nombre || "—"}</div>
            <div style={{
          fontSize: 11,
          color: T.text,
          marginTop: 3,
          lineHeight: 1.6
        }}>
              {[base.telefono || base.tel, base.ciudad, (base.cuenta || base.nroCuenta) && "Cuenta " + (base.cuenta || base.nroCuenta), base.direccion].filter(Boolean).join(" · ") || "—"}
            </div>
            {nuevo && <button onClick={() => setPick(null)} style={{
          marginTop: 8,
          background: "transparent",
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          color: T.mut,
          fontSize: 10,
          fontWeight: 700,
          padding: "5px 9px",
          cursor: "pointer"
        }}>← Cambiar cliente</button>}
          </div>}

          <SubT>CARTERA</SubT>
          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginBottom: 14
      }}>
            {["dist", "fin"].map(k => <button key={k} onClick={() => setF({
          ...f,
          cartera: k
        })} style={{
          padding: 10,
          background: (f.cartera || "dist") === k ? T.bluePale : "#fff",
          border: `2px solid ${(f.cartera || "dist") === k ? T.blueMid : T.border}`,
          borderRadius: 7,
          color: (f.cartera || "dist") === k ? T.blueMid : T.mut,
          fontFamily: T.mono,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer"
        }}>{CARTERAS[k].nombre}</button>)}
          </div>

          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10
      }}>
            <Input label="Cuota mensual ($)" type="number" value={f.pagoMensual} onChange={set("pagoMensual")} error={errs.pagoMensual} />
            <Input label="Valor total pendiente ($)" type="number" value={f.saldo} onChange={set("saldo")} error={errs.saldo} />
            <label style={{
          display: "block",
          marginBottom: 12
        }}>
              <span style={lbl}>Nivel crédito (1-9)</span>
              <select value={f.nivel} onChange={set("nivel")} style={{
            ...inpBox,
            fontSize: 14,
            padding: "10px 12px",
            border: `2px solid ${errs.nivel ? T.red : T.border}`
          }}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }}>
            <Input label="Email" value={f.email} onChange={set("email")} />
            <Input label="Último pago" type="date" value={f.ultimoPago} onChange={set("ultimoPago")} />
          </div>

          <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10
      }}>
            <label style={{
          display: "block",
          marginBottom: 12
        }}>
              <span style={lbl}>Tipo de cuenta</span>
              <select value={f.tipoCuenta} onChange={set("tipoCuenta")} style={{
            ...inpBox,
            fontSize: 13,
            padding: "10px 12px"
          }}>
                <option value="">—</option><option>Revolving</option><option>Installment</option>
              </select>
            </label>
            <label style={{
          display: "block",
          marginBottom: 12
        }}>
              <span style={lbl}>Método de pago</span>
              <select value={f.metodoPago} onChange={set("metodoPago")} style={{
            ...inpBox,
            fontSize: 13,
            padding: "10px 12px"
          }}>
                <option value="">—</option><option>Tarjeta de crédito</option><option>Tarjeta de débito</option><option>Cheque</option><option>Efectivo</option>
              </select>
            </label>
            <label style={{
          display: "block",
          marginBottom: 12
        }}>
              <span style={lbl}>Estado</span>
              <select value={f.estado} onChange={set("estado")} style={{
            ...inpBox,
            fontSize: 13,
            padding: "10px 12px",
            border: `2px solid ${f.estado === "Cargo de Vuelta" ? T.red : T.border}`,
            color: f.estado === "Cargo de Vuelta" ? T.red : T.text
          }}>
                <option>Activo</option><option>Cargo de Vuelta</option><option>Colección</option>
              </select>
            </label>
          </div>

          {f.estado === "Cargo de Vuelta" && <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }}>
              <Input label="Fecha del cargo de vuelta" type="date" value={f.cargoVueltaFecha} onChange={set("cargoVueltaFecha")} />
              <Input label="Monto del cargo ($)" type="number" value={f.cargoVueltaMonto} onChange={set("cargoVueltaMonto")} />
            </div>}

          <SubT>REFERENCIAS</SubT>
          {(f.referencias || []).map((r, i) => <div key={i} style={{
        display: "grid",
        gridTemplateColumns: "2fr 2fr auto",
        gap: 8,
        marginBottom: 8
      }}>
              <input value={r.nombre} onChange={e => setRef(i, "nombre", e.target.value)} placeholder="Nombre de la referencia" style={{
          ...inpBox,
          fontWeight: 500
        }} />
              <input value={r.tel} onChange={e => setRef(i, "tel", e.target.value)} placeholder="Teléfono" style={{
          ...inpBox,
          fontWeight: 500
        }} />
              <Btn variant="danger" style={{
          padding: "6px 10px"
        }} onClick={() => setF({
          ...f,
          referencias: f.referencias.filter((_, j) => j !== i)
        })}><Trash2 size={12} /></Btn>
            </div>)}
          <Btn variant="ghost" style={{
        marginBottom: 14,
        padding: "7px 12px",
        fontSize: 11
      }} onClick={() => setF({
        ...f,
        referencias: [...(f.referencias || []), {
          nombre: "",
          tel: ""
        }]
      })}><Plus size={12} /> AGREGAR REFERENCIA</Btn>

          <label style={{
        display: "block",
        marginBottom: 16
      }}>
            <span style={lbl}>Nota de cobranza</span>
            <textarea value={f.nota} onChange={set("nota")} rows={3} placeholder="Ej. Pagar después del día 15, contestar por la tarde…" style={{
          ...inpBox,
          fontWeight: 500,
          padding: 12,
          resize: "vertical",
          lineHeight: 1.5
        }} />
          </label>

          <Btn onClick={guardar} style={{
        width: "100%",
        justifyContent: "center"
      }}><CheckCircle2 size={14} /> {c ? "GUARDAR FICHA" : "AGREGAR A COBRANZA"}</Btn>
        </div>}
    </Modal>;
};
const FormPago = ({
  c,
  onClose,
  onPago
}) => {
  const [monto, setMonto] = useState(c.pagoMensual);
  const [metodo, setMetodo] = useState("Zelle");
  const [err, setErr] = useState("");
  const ok = () => {
    const m = +monto;
    if (isNaN(m) || m <= 0) return setErr("Ingresa un monto mayor a cero");
    if (m > c.saldo) return setErr(`El monto excede el saldo (${fmt(c.saldo)})`);
    onPago(m, metodo);
  };
  return <Modal title={"REGISTRAR PAGO · " + c.nombre.split(" ")[0].toUpperCase()} onClose={onClose}>
      <div style={{
      fontSize: 11,
      color: T.mut,
      marginBottom: 12
    }}>Balance actual: <b style={{
        color: T.text
      }}>{fmt(c.saldo)}</b></div>
      <Input label="Monto ($)" type="number" value={monto} onChange={e => {
      setMonto(e.target.value);
      setErr("");
    }} error={err} />
      <SubT>MÉTODO</SubT>
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 16
    }}>
        {["Zelle", "Cash App", "Efectivo", "Tarjeta"].map(m => <button key={m} onClick={() => setMetodo(m)} style={{
        padding: 10,
        background: metodo === m ? T.bluePale : "#fff",
        border: `2px solid ${metodo === m ? T.blueMid : T.border}`,
        borderRadius: 7,
        color: metodo === m ? T.blueMid : T.mut,
        fontFamily: T.mono,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer"
      }}>{m.toUpperCase()}</button>)}
      </div>
      <Btn onClick={ok} style={{
      width: "100%",
      justifyContent: "center"
    }}><DollarSign size={14} /> CONFIRMAR PAGO</Btn>
    </Modal>;
};

/* ── Clientes ── */
/* ── IMPORTAR CLIENTES CON IA (documentos o fotos → Mi Financiera o Distribución) ── */
const ImportClientesIA = ({ onClose, onImportar }) => {
  const [files, setFiles] = useState([]);
  const [cartera, setCartera] = useState("dist");
  const [modelo, setModelo] = useState("sonnet"); // fotos Hy Cite: Sonnet lee mucho mejor el ESTADO
  const [loading, setLoading] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const MODELOS_IA = {
    haiku:  { id: "claude-haiku-4-5-20251001", ico:"⚡", label: "Rápido",  desc: "Listas digitales y PDFs claros" },
    sonnet: { id: "claude-sonnet-4-5",         ico:"🧠", label: "Preciso", desc: "Fotos y letra a mano" },
  };
  const handleFiles = e => {
    const nuevos = Array.from(e.target.files || []);
    if (!nuevos.length) return;
    setFiles(prev => [...prev, ...nuevos].slice(0, 20));
    setPreview(null); setError("");
  };
  const quitar = i => setFiles(prev => prev.filter((_, j) => j !== i));
  const quitarReg = i => setPreview(prev => prev.filter((_, j) => j !== i));

  const prepararArchivo = async file => {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = () => rej(new Error("No se pudo leer el archivo")); r.readAsDataURL(file); });
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    let mediaType = (file.type || "").toLowerCase();
    if (!isPdf) {
      const name = (file.name || "").toLowerCase();
      if (mediaType === "image/jpg") mediaType = "image/jpeg";
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
        if (/\.(jpe?g)$/i.test(name)) mediaType = "image/jpeg";
        else if (/\.png$/i.test(name)) mediaType = "image/png";
        else if (/\.gif$/i.test(name)) mediaType = "image/gif";
        else if (/\.webp$/i.test(name)) mediaType = "image/webp";
        else if (/\.(heic|heif)$/i.test(name)) { throw new Error("El formato HEIC del iPhone no es compatible (" + file.name + "). En tu iPhone ve a Ajustes → Cámara → Formatos → 'Más compatible', o usa una captura de pantalla."); }
        else mediaType = "image/jpeg";
      }
    }
    const sizeMB = b64.length * 0.75 / (1024 * 1024);
    if (sizeMB > 4.5) throw new Error("Una imagen es muy grande (" + sizeMB.toFixed(1) + "MB: " + file.name + "). Usa una captura de pantalla o redúcela.");
    return isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };
  };

  const extraerUno = async block => {
    const sys = `Extrae TODOS los clientes con datos de cobranza del documento (portal Hy Cite / distributors.hycite.com) para Royal Prestige. Responde SOLO JSON compacto sin backticks ni explicaciones.

Cada cliente aparece como una tarjeta con un encabezado tipo "HC - Nombre Apellido" y una lista de campos. Mapea así:
- "HC - <Nombre>"  → el nombre del cliente (quita el prefijo "HC -").
- "N.° DE CLIENTE" / "N.º DE CLIENTE" / "Customer #"  → numeroCuenta (solo dígitos).
- "DIRECCIÓN DE CORREO ELECTRÓNICO" / "Email"  → email.
- "TELÉFONO MÓVIL" / "Mobile Phone"  → telefono.
- "SALDO ACTUAL" / "Current Balance"  → saldo (solo el número, sin $ ni "USD").
- "MOROSO" / "Past Due"  → atraso (solo el número; ESTE es el monto en atraso/mora del cliente).
- "EMPRENDEDORES" / "Entrepreneur"  → código del emprendedor, guárdalo en "emprendedor".
- "ESTADO" / "Status"  → ⚠️ CAMPO MÁS IMPORTANTE: aquí viene el ATRASO EN DÍAS como texto (suele estar en un recuadro de color rojo/azul). LÉELO SIEMPRE y conviértelo al campo "rango". Copia además el texto EXACTO en "estadoTexto". Conversión:
    · "Al día" / "Current" / "0 a 30" / "1 a 30 días"  → "0-30"
    · "De 31 a 60 días de atraso"  → "31-60"
    · "De 61 a 90 días de atraso"  → "61-90"
    · "De 91" o más / "Over 90" / "91 y más" / "más de 90"  → "91+"
    · "Cargo de vuelta" / "Colección" / "Charge back"  → "coleccion"
  Y si el texto da un número de días concreto, ponlo también en "diasAtraso".

IMPORTANTÍSIMO: el campo "MOROSO" es el monto en atraso → va en "atraso". El "SALDO ACTUAL" es el total → va en "saldo". NO los confundas.
La línea "Fecha del último pedido" / "último pedido" / "last order" NO es un pago: IGNÓRALA por completo. En este formato de tarjetas NO existe fecha de pago, así que el campo "ultimoPago" SIEMPRE va vacío "".
Si el documento tuviera un formato de tabla con columnas 0-30 / 31-60 / 61-90 / 91+, ubica al cliente en la columna donde tenga monto y usa eso como "rango".
NO inventes datos. Si un campo no aparece, déjalo vacío "".
ADEMÁS: copia el texto del ESTADO tal cual aparece (ej. "De 61 a 90 días de atraso") en el campo "estadoTexto".
Formato EXACTO: {"registros":[{"nombre":"","telefono":"","numeroCuenta":"","direccion":"","ciudad":"","email":"","saldo":"","pagoMensual":"","ultimoPago":"","rango":"","diasAtraso":"","atraso":"","emprendedor":"","estadoTexto":""}]}. Incluye TODOS los clientes visibles, no te detengas.`;
    let resp;
    try {
      resp = await fetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELOS_IA[modelo].id, max_tokens: 8000, system: sys, messages: [{ role: "user", content: [block, { type: "text", text: "Extrae los datos. Solo JSON." }] }] }) });
    } catch (netErr) {
      throw new Error("No se pudo conectar con el servicio de IA. Revisa tu conexión a internet.");
    }
    if (!resp.ok) {
      let msg = "Error " + resp.status;
      try { const e = await resp.json(); msg = e.error && e.error.message || msg; } catch {}
      if (resp.status === 401) msg = "API key inválida o sin créditos. Revisa tu cuenta de Anthropic.";
      if (resp.status === 400) msg = "Una imagen no se pudo procesar. Intenta con una captura más clara.";
      if (resp.status === 413) msg = "Una imagen es muy grande. Usa captura de pantalla.";
      if (resp.status === 529 || resp.status === 429) msg = "El servicio est�� ocupado. Espera unos segundos e intenta de nuevo.";
      throw new Error(msg);
    }
    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || "").join("");
    if (!text.trim()) return { registros: [] };
    let clean = text.replace(/```json|```/g, "").trim();
    const fb = clean.indexOf("{"); const lb = clean.lastIndexOf("}");
    if (fb >= 0 && lb > fb) clean = clean.slice(fb, lb + 1);
    try { return JSON.parse(clean); }
    catch {
      const objs = clean.match(/\{[^{}]*\}/g) || [];
      return { registros: objs.map(o => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean) };
    }
  };

  const num = v => { const n = parseFloat(String(v || "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const extraer = async () => {
    if (!files.length) { setError("Primero selecciona uno o más archivos."); return; }
    setLoading(true); setError(""); setProgreso("");
    try {
      let acum = [];
      for (let i = 0; i < files.length; i++) {
        setProgreso(`Procesando ${i + 1} de ${files.length}…`);
        const block = await prepararArchivo(files[i]);
        const parsed = await extraerUno(block);
        acum = acum.concat(parsed.registros || []);
      }
      setProgreso("");
      const validos = acum.filter(r => (r.nombre || "").trim() || String(r.telefono || "").replace(/\D/g, ""));
      if (!validos.length) throw new Error("No se encontraron clientes en los archivos.");
      setPreview(validos.map(r => ({
        nombre: (r.nombre || "").trim(),
        telefono: (r.telefono || "").trim(),
        numeroCuenta: (r.numeroCuenta || "").trim(),
        direccion: (r.direccion || "").trim(),
        ciudad: (r.ciudad || "").trim(),
        email: (r.email || "").trim(),
        saldo: num(r.saldo),
        pagoMensual: num(r.pagoMensual),
        ultimoPago: /^\d{4}-\d{2}-\d{2}$/.test(r.ultimoPago || "") ? r.ultimoPago : "",
        // CAMPOS DE ATRASO del reporte Hy Cite — antes se perdían aquí y el
        // cliente nunca quedaba en su zona (0-30/31-60/61-90/91+).
        rango: rangoDeRegistro(r),
        estadoTexto: (r.estadoTexto || r.estado || r.status || "").toString().trim(),
        diasAtraso: r.diasAtraso,
        atraso: num(r.atraso),
        emprendedor: (r.emprendedor || "").trim()
      })));
    } catch (err) {
      setError("⚠️ " + (err.message || "No se pudo extraer. Verifica los archivos e intenta de nuevo."));
      setProgreso("");
    }
    setLoading(false);
  };
  const confirmar = () => { if (!preview || !preview.length) return; onImportar(preview, cartera); };

  const chip = act => ({ padding: 10, background: act ? T.bluePale : "#fff", border: `2px solid ${act ? T.blueMid : T.border}`, borderRadius: 7, color: act ? T.blueMid : T.mut, fontFamily: T.mono, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" });

  return <Modal title="🤖 IMPORTAR CLIENTES CON IA" onClose={onClose} wide>
      {!preview && <div>
        <SubT>¿A QUÉ CARTERA VAN LOS CLIENTES?</SubT>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {["dist", "fin"].map(k => <button key={k} onClick={() => setCartera(k)} style={chip(cartera === k)}>{CARTERAS[k].nombre}</button>)}
        </div>
        <SubT>MODO DE LECTURA</SubT>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {Object.keys(MODELOS_IA).map(k => <button key={k} onClick={() => setModelo(k)} style={chip(modelo === k)}>
            <div>{MODELOS_IA[k].label}</div>
            <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2, color: T.mut }}>{MODELOS_IA[k].desc}</div>
          </button>)}
        </div>
        <SubT>DOCUMENTOS O FOTOS (hasta 20)</SubT>
        <label style={{ display: "block", border: `2px dashed ${T.borderHi}`, borderRadius: 8, padding: "18px 12px", textAlign: "center", cursor: "pointer", marginBottom: 10, background: T.bluePale }}>
          <div style={{ fontSize: 22 }}>📷 📄</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.blueMid, marginTop: 4 }}>Toca para elegir fotos o PDF</div>
          <div style={{ fontSize: 10, color: T.mut, marginTop: 2 }}>Estados de cuenta, listas, contratos, capturas…</div>
          <input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: "none" }} />
        </label>
        {files.map((fl, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fl.type === "application/pdf" || /\.pdf$/i.test(fl.name) ? "📄" : "🖼️"} {fl.name}</span>
          <button onClick={() => quitar(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontWeight: 800 }}><Ico e="✕" /></button>
        </div>)}
        {error && <div style={{ color: T.red, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{error}</div>}
        {progreso && <div style={{ color: T.blueMid, fontSize: 11, fontWeight: 700, marginBottom: 8 }}><Ico e="⏳" className="mr-1.5" />{progreso}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>CANCELAR</Btn>
          <Btn onClick={extraer} disabled={loading}>{loading ? "LEYENDO…" : <><Ico e="🤖" className="mr-1" />EXTRAER DATOS</>}</Btn>
        </div>
      </div>}
      {preview && <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.blueMid, marginBottom: 10 }}>La IA encontró <b>{preview.length}</b> cliente(s). Revisa y confirma → irán a <b>{CARTERAS[cartera].nombre}</b>. Si ya existen (por cuenta, teléfono o nombre) solo se actualizan.</div>
        <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 12 }}>
          {preview.map((r, i) => {
            const RANGO_LBL = { "0-30":"0-30 días", "31-60":"31-60 días", "61-90":"61-90 días", "91+":"91+ días", "coleccion":"colección" };
            const RANGO_COL = { "0-30":"#16a34a", "31-60":"#f59e0b", "61-90":"#f97316", "91+":"#dc2626", "coleccion":"#7c2d12" };
            return <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                {r.nombre || "(sin nombre)"}
                {r.rango
                  ? <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: RANGO_COL[r.rango]||"#64748b", borderRadius: 8, padding: "1px 7px" }}><Ico e="⏱" className="mr-1.5" />{RANGO_LBL[r.rango]||r.rango}</span>
                  : <span style={{ fontSize: 9, fontWeight: 800, color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "1px 7px" }}><Ico e="⚠" className="mr-1.5" />sin atraso leído</span>}
              </div>
              <div style={{ fontSize: 10, color: T.mut }}>{[r.telefono, r.numeroCuenta && "Cta " + r.numeroCuenta, r.ciudad, r.saldo ? "Saldo " + fmt(r.saldo) : "", r.atraso ? "Moroso " + fmt(r.atraso) : "", r.pagoMensual ? "Cuota " + fmt(r.pagoMensual) : ""].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <button onClick={() => quitarReg(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontWeight: 800 }}><Ico e="✕" /></button>
          </div>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setPreview(null)}>← VOLVER</Btn>
          <Btn onClick={confirmar} disabled={!preview.length}><Ico e="✅" className="mr-1.5" />AGREGAR {preview.length} A {CARTERAS[cartera].corto}</Btn>
        </div>
      </div>}
    </Modal>;
};

const Clientes = ({
  data,
  isMobile,
  onGuardar,
  onEliminar,
  onPago,
  onDeshacer,
  cfg,
  puedeBorrar = true,
  mesKey,
  onPromesa,
  onRomper,
  disponibles,
  onAgregarTodos,
  onImportarIA,
  onFusionarDuplicados,
  onEliminarVarios
}) => {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [cart, setCart] = useState("todas");
  const [editar, setEditar] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [ia, setIa] = useState(false);
  const [confTodos, setConfTodos] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [selMode, setSelMode] = useState(false);
  const [selIds, setSelIds] = useState([]); // ids seleccionados para eliminar
  const [pagar, setPagar] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [promesaDe, setPromesaDe] = useState(null);
  const [llamar, setLlamar] = useState(null);
  const [factura, setFactura] = useState(null);
  // "Al corriente" = verde SIN rango 0-30 · "r030" = clientes con 1 cuota atrasada (rango 0-30)
  const pasaFiltroSem = c => filtro === "todos" ? true
    : filtro === "verde" ? (c.sem.key === "verde" && c.rango !== "0-30")
    : filtro === "r030" ? (c.rango === "0-30")
    : c.sem.key === filtro;
  const vis = data.filter(c => (cart === "todas" || (c.cartera || "dist") === cart) && pasaFiltroSem(c) && (c.nombre + c.ciudad + c.tel + (c.nroCuenta || "")).toLowerCase().includes(q.toLowerCase()));
  const detalleC = detalle ? data.find(c => c.id === detalle) : null;
  return <div>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10
    }}>
        <H1>Clientes ({data.length})</H1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {disponibles && disponibles.length > 0 && <Btn variant="ghost" onClick={() => setConfTodos(true)}><Plus size={14} /> TODOS ({disponibles.length})</Btn>}
          <Btn variant="ghost" onClick={() => setIa(true)}><Ico e="🤖" className="mr-1.5" />IA</Btn>
          {onFusionarDuplicados && <Btn variant="ghost" onClick={() => { if(confirm("¿Buscar clientes duplicados (misma cuenta, teléfono o nombre) y fusionarlos en uno solo? Los historiales se unen, nada se pierde.")) onFusionarDuplicados(); }}><Ico e="🧹" className="mr-1.5" />DUP</Btn>}
          {onEliminarVarios && <Btn variant="ghost" onClick={() => { setSelMode(p=>!p); setSelIds([]); }}>{selMode?<><Ico e="✕" className="mr-1" />Cancelar</>:<><Ico e="☑" className="mr-1" />Seleccionar</>}</Btn>}
          <Btn onClick={() => setNuevo(true)}><Plus size={14} /> NUEVO</Btn>
        </div>
      </div>
      <CarteraChips value={cart} onChange={setCart} conTodas />
      <div style={{
      position: "relative",
      marginBottom: 10
    }}>
        <Search size={14} style={{
        position: "absolute",
        left: 10,
        top: "50%",
        transform: "translateY(-50%)",
        color: T.mut
      }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, ciudad, teléfono o cuenta…" style={{
        width: "100%",
        boxSizing: "border-box",
        background: "#fff",
        border: `2px solid ${T.border}`,
        borderRadius: 7,
        color: T.text,
        fontFamily: T.mono,
        fontSize: 13,
        padding: "10px 12px 10px 32px",
        outline: "none"
      }} />
      </div>
      <div style={{
      display: "flex",
      gap: 7,
      marginBottom: 12,
      flexWrap: "wrap"
    }}>
        {[["todos", "Todos"], ["verde", "Al corriente"], ["r030", "0-30d"], ["amarillo", "31-60d"], ["naranja", "61-90d"], ["rojo", "Críticos"]].map(([k, n]) => <button key={k} onClick={() => setFiltro(k)} style={{
        background: filtro === k ? T.blueMid : T.bg,
        border: `1.5px solid ${filtro === k ? T.blueMid : T.border}`,
        color: filtro === k ? "#fff" : "#5a5a5a",
        padding: "5px 12px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 20,
        cursor: "pointer",
        fontFamily: T.mono
      }}>{n}</button>)}
      </div>
      {selMode && (
        <div style={{display:"flex",gap:8,alignItems:"center",margin:"10px 0",flexWrap:"wrap"}}>
          <button onClick={()=>setSelIds(selIds.length===vis.length?[]:vis.map(c=>c.id))}
            style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${T.blueMid}`,background:"#fff",color:T.blueMid,fontSize:12,fontWeight:800,cursor:"pointer"}}>
            {selIds.length===vis.length?"Quitar todos":"Seleccionar todos"} ({vis.length})</button>
          <button disabled={!selIds.length}
            onClick={()=>{ if(confirm(`¿Eliminar ${selIds.length} cliente(s) de cobranza? Esta acción no se puede deshacer. Después puedes volver a subirlos con la foto.`)){ onEliminarVarios(selIds); setSelIds([]); setSelMode(false); } }}
            style={{padding:"8px 14px",borderRadius:10,border:"none",background:selIds.length?"#dc2626":"#e5e7eb",color:"#fff",fontSize:12,fontWeight:800,cursor:selIds.length?"pointer":"default"}}>
            <Ico e="🗑" className="mr-1.5" />Eliminar ({selIds.length})</button>
        </div>
      )}
      <div>
        {vis.map((c, i) => <div key={c.id} onClick={() => selMode ? setSelIds(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id]) : setDetalle(c.id)} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        borderBottom: `1px solid ${T.border}`,
        cursor: "pointer"
      }}>
            {selMode && <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${selIds.includes(c.id)?"#dc2626":T.border}`,
          background: selIds.includes(c.id)?"#dc2626":"#fff",
          color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontWeight:900
        }}>{selIds.includes(c.id)?"✓":""}</div>}
            <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c.sem.color,
          flexShrink: 0
        }} />
            <div style={{
          flex: 1,
          minWidth: 0
        }}>
              <div style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}>{c.nombre}</div>
              <div style={{
            fontSize: 10,
            color: T.mut
          }}>{c.ciudad} · {c.rango ? `atraso ${c.rango==="coleccion"?"colección":c.rango}` : Number.isFinite(c.dias) ? `${c.dias}d sin pago` : "sin datos"} · {fmt(c.saldo)}</div>
            </div>
            {enRiesgoCesion(c, mesKey) && <span style={{
          fontSize: 8,
          color: T.red,
          fontWeight: 700,
          border: `1.5px solid ${T.red}`,
          borderRadius: 10,
          padding: "2px 6px"
        }}><Ico e="⚠" className="mr-1.5" />CESIÓN</span>}
            <Badge sem={c.sem} />
            <ChevronRight size={14} color={T.mut} />
          </div>)}
        {!vis.length && <div style={{
        color: T.mut,
        fontSize: 12,
        padding: 20,
        textAlign: "center"
      }}>Sin clientes que coincidan con el filtro.</div>}
      </div>

      {confTodos && <Modal title="AGREGAR TODOS" onClose={() => setConfTodos(false)}>
          <p style={{ fontSize: 12, color: T.text, marginBottom: 16 }}>Se agregarán <b>{disponibles.length}</b> clientes de Distribución a Cobranza con saldo en $0. Podrás ponerles saldo y registrar pagos después. ¿Continuar?</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setConfTodos(false)}>Cancelar</Btn>
            <Btn onClick={() => { onAgregarTodos(); setConfTodos(false); }}>Agregar {disponibles.length}</Btn>
          </div>
        </Modal>}
      {ia && <ImportClientesIA onClose={() => setIa(false)} onImportar={(regs, cartera) => {
      onImportarIA(regs, cartera);
      setIa(false);
    }} />}
      {nuevo && <FormCliente disponibles={disponibles} onClose={() => setNuevo(false)} onGuardar={data => {
      onGuardar(data, null);
      setNuevo(false);
    }} />}
      {editar && <FormCliente c={editar} onClose={() => setEditar(null)} onGuardar={data => {
      onGuardar(data, editar.id);
      setEditar(null);
    }} />}
      {pagar && <FormPago c={pagar} onClose={() => setPagar(null)} onPago={(m, met) => {
      onPago(pagar.id, m, met);
      setPagar(null);
    }} />}
      {borrar && <Modal title="CONFIRMAR ELIMINACIÓN" onClose={() => setBorrar(null)}>
          <p style={{
        fontSize: 12,
        color: T.text,
        marginBottom: 16
      }}>Eliminar a <b>{borrar.nombre}</b> borra también su historial. Esta acción no se puede deshacer.</p>
          <div style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end"
      }}>
            <Btn variant="ghost" onClick={() => setBorrar(null)}>CANCELAR</Btn>
            <Btn variant="danger" onClick={() => {
          onEliminar(borrar.id);
          setBorrar(null);
          setDetalle(null);
        }}><Trash2 size={13} /> ELIMINAR</Btn>
          </div>
        </Modal>}
      {factura && <FacturaModal c={factura} cfg={cfg} onClose={() => setFactura(null)} />}
      {promesaDe && <PromesaModal c={promesaDe} onSave={(f, h, m) => {
      onPromesa(promesaDe.id, f, h, m);
      setPromesaDe(null);
    }} onClose={() => setPromesaDe(null)} />}
      {llamar && <LlamarModal tel={llamar} cfg={cfg} onClose={() => setLlamar(null)} />}

      {detalleC && <Modal title={detalleC.nombre.toUpperCase() + " · " + fmt(detalleC.saldo)} onClose={() => setDetalle(null)} wide>
          <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 6,
        alignItems: "center"
      }}>
            <Badge sem={detalleC.sem} />
            {detalleC.nivel && <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: +detalleC.nivel >= 7 ? T.red : +detalleC.nivel >= 4 ? T.orange : T.green,
          border: `1.5px solid currentColor`,
          borderRadius: 12,
          padding: "3px 10px"
        }}>NIVEL {detalleC.nivel}</span>}
            {enRiesgoCesion(detalleC, mesKey) && <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: T.red,
          background: "#fdecea",
          border: `1.5px solid ${T.red}`,
          borderRadius: 12,
          padding: "3px 10px"
        }}><Ico e="⚠" className="mr-1.5" />RIESGO DE CESIÓN</span>}
            {detalleC.estado && detalleC.estado !== "Activo" && <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#fff",
          background: T.red,
          borderRadius: 12,
          padding: "4px 10px"
        }}>{detalleC.estado.toUpperCase()}{detalleC.cargoVueltaMonto ? " · " + fmt(detalleC.cargoVueltaMonto) : ""}</span>}
          </div>
          <div style={{
        fontSize: 11,
        color: T.mut,
        marginBottom: 6
      }}>{detalleC.nroCuenta ? "Cta " + detalleC.nroCuenta + " · " : ""}{detalleC.direccion ? detalleC.direccion + ", " : ""}{detalleC.ciudad} · {detalleC.tel} · {detalleC.email}</div>
          {detalleC.nota && <div style={{
        fontSize: 11,
        color: "#5a5a5a",
        background: "#fffbe8",
        border: "1px solid #f0e0a0",
        borderRadius: 7,
        padding: "8px 12px",
        marginBottom: 8,
        lineHeight: 1.5
      }}><Ico e="📝" className="mr-1.5" />{detalleC.nota}</div>}
          {detalleC.promesa && <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        fontSize: 11,
        color: T.blueMid,
        background: T.bluePale,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 7,
        padding: "8px 12px",
        marginBottom: 8
      }}>
              <span><Ico e="🤝" /> <b>Prometió pagar:</b> {detalleC.promesa.fecha} a las {detalleC.promesa.hora}{detalleC.promesa.monto ? " · " + fmt(detalleC.promesa.monto) : ""}</span>
              {detalleC.promesa.fecha < todayISO() && <Btn variant="danger" style={{
          padding: "4px 9px",
          fontSize: 9
        }} onClick={() => onRomper(detalleC.id)}><XCircle size={11} /> NO CUMPLIÓ</Btn>}
            </div>}
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: 10,
        marginBottom: 16
      }}>
            {[["BALANCE TOTAL", fmt(detalleC.saldo), detalleC.sem.color], ["CUOTA MENSUAL", fmt(detalleC.pagoMensual), T.text], ["DÍAS SIN PAGO", detalleC.dias + "d", detalleC.sem.color]].map(([l, v, col]) => <div key={l} style={{
          background: T.bg,
          border: `1px solid ${T.border}`,
          borderRadius: 7,
          padding: 10
        }}>
                <div style={{
            fontSize: 9,
            color: T.blueMid,
            fontWeight: 700,
            letterSpacing: 1
          }}>{l}</div>
                <div style={{
            fontSize: 15,
            fontWeight: 800,
            color: col
          }}>{v}</div>
              </div>)}
          </div>
          <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 16
      }}>
            <Btn onClick={() => setPagar(detalleC)}><DollarSign size={13} /> PAGO</Btn>
            <Btn variant="ghost" onClick={() => {
          setEditar(detalleC);
          setDetalle(null);
        }}><Edit3 size={13} /> EDITAR</Btn>
            <a href={waLink(detalleC.tel, plantillaLocal(detalleC, detalleC.sem, cfg))} target="_blank" rel="noreferrer" style={{
          textDecoration: "none"
        }}><Btn variant="ghost"><MessageCircle size={13} /> WHATSAPP</Btn></a>
            <a href={smsLink(detalleC.tel, plantillaLocal(detalleC, detalleC.sem, cfg))} style={{
          textDecoration: "none"
        }}><Btn variant="ghost">SMS</Btn></a>
            <Btn variant="ghost" onClick={() => setLlamar(detalleC.tel)}><Phone size={13} /> LLAMAR</Btn>
            <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(detalleC.email||"")}&su=${encodeURIComponent("Estado de cuenta — Royal Prestige")}&body=${encodeURIComponent(plantillaLocal(detalleC, detalleC.sem, cfg))}`} target="_blank" rel="noreferrer" style={{
          textDecoration: "none"
        }}><Btn variant="ghost"><Mail size={13} /> GMAIL</Btn></a>
            <Btn onClick={() => setFactura(detalleC)}><FileText size={13} /> FACTURA</Btn>
            <Btn variant="ghost" onClick={() => setPromesaDe(detalleC)}><Ico e="🤝" className="mr-1.5" />PROMESA</Btn>
            {puedeBorrar && <Btn variant="danger" onClick={() => setBorrar(detalleC)}><Trash2 size={13} /></Btn>}
          </div>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
            <SubT style={{
          margin: 0
        }}>HISTORIAL</SubT>
            {(detalleC.historial || []).some(h => h.tipo === "pago") && <Btn variant="dim" style={{
          padding: "5px 10px",
          fontSize: 10
        }} onClick={() => onDeshacer(detalleC.id)}><Undo2 size={12} /> DESHACER ÚLTIMO PAGO</Btn>}
          </div>
          <div style={{
        marginTop: 10
      }}>
            {(detalleC.historial || []).slice().reverse().map((h, i) => <div key={i} style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          padding: "8px 0",
          borderBottom: `1px solid ${T.border}`
        }}>
                <span style={{
            color: h.tipo === "pago" ? T.text : h.tipo === "promesa" ? T.blueMid : T.red
          }}>{h.tipo === "pago" ? `Pago · ${h.metodo}` : h.tipo === "promesa" ? `🤝 Promesa ${h.metodo}` : <><Ico e="⚠" className="mr-1" />Promesa incumplida</>}</span>
                <span style={{
            color: T.mut
          }}>{h.fecha}{h.tipo === "pago" && <b style={{
              color: T.green,
              marginLeft: 10
            }}>{fmt(h.monto)}</b>}</span>
              </div>)}
            {!(detalleC.historial || []).length && <div style={{
          fontSize: 11,
          color: T.mut
        }}>Sin movimientos aún.</div>}
          </div>
        </Modal>}
    </div>;
};

/* ── Cobranza ── */
const Cobranza = ({
  data,
  resumen,
  cfg,
  onPago,
  isMobile,
  th,
  kpi,
  mesKey,
  onPromesa
}) => {
  const [sesion, setSesion] = useState(null);
  const [cart, setCart] = useState("todas");
  const [factura, setFactura] = useState(null);
  const [promesaDe, setPromesaDe] = useState(null);
  const [llamar, setLlamar] = useState(null);
  const dataF = data.filter(c => cart === "todas" || (c.cartera || "dist") === cart);
  const pendientes = dataF.filter(c => c.sem.key !== "verde");
  const riesgoList = dataF.filter(c => enRiesgoCesion(c, mesKey));
  const salvadas = dataF.filter(c => mesesVencidos(c) >= 2 && pagoEsteMes(c, mesKey));
  const iniciarSesion = async lista => {
    const l = lista || pendientes;
    if (!l.length) return toast("No hay clientes pendientes hoy 🎉");
    const s = {
      lista: l,
      idx: 0,
      msg: "",
      fuente: "",
      cargando: false,
      resultados: []
    };
    setSesion(s);
    cargar(s, 0);
  };
  const cargar = (s, idx) => {
    const c = s.lista[idx];
    setSesion(prev => prev && {
      ...prev,
      idx,
      msg: plantillaLocal(c, c.sem, cfg),
      fuente: "Plantilla " + c.sem.label,
      cargando: false
    });
  };
  const mejorarConIA = async () => {
    const c = sesion.lista[sesion.idx];
    setSesion(prev => ({
      ...prev,
      cargando: true
    }));
    const r = await generarMensajeIA(c, c.sem, cfg);
    setSesion(prev => ({
      ...prev,
      msg: r.texto,
      fuente: r.fuente,
      cargando: false
    }));
  };
  const avanzar = resultado => {
    setSesion(prev => {
      if (!prev) return prev;
      const res = [...prev.resultados, {
        id: prev.lista[prev.idx].id,
        nombre: prev.lista[prev.idx].nombre,
        resultado
      }];
      const next = prev.idx + 1;
      if (next >= prev.lista.length) {
        toast(`Sesión completa: ${res.length} clientes gestionados`);
        return {
          ...prev,
          resultados: res,
          idx: next
        };
      }
      const ns = {
        ...prev,
        resultados: res,
        idx: next,
        cargando: true,
        msg: "",
        fuente: ""
      };
      cargar(ns, next);
      return ns;
    });
  };
  if (sesion) {
    if (sesion.idx >= sesion.lista.length) {
      const cobrados = sesion.resultados.filter(r => r.resultado === "pagó").length;
      return <div>
          <H1>Sesión Completada ✓</H1>
          <Card glow>
            <div style={{
            fontSize: 13,
            marginBottom: 14
          }}>Gestionaste <b style={{
              color: T.green
            }}>{sesion.resultados.length}</b> clientes · <b style={{
              color: T.green
            }}>{cobrados}</b> pagaron en sesión.</div>
            {sesion.resultados.map(r => <div key={r.id} style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            padding: "8px 0",
            borderBottom: `1px solid ${T.border}`
          }}>
                <span>{r.nombre}</span>
                <span style={{
              color: r.resultado === "pagó" ? T.green : r.resultado === "promesa" ? T.blueMid : r.resultado === "contactado" ? T.yellow : T.mut,
              fontWeight: 700
            }}>{r.resultado.toUpperCase()}</span>
              </div>)}
            <Btn onClick={() => setSesion(null)} style={{
            marginTop: 16
          }}><ChevronLeft size={14} /> VOLVER A COBRANZA</Btn>
          </Card>
        </div>;
    }
    const c = sesion.lista[sesion.idx];
    return <div>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14
      }}>
          <H1>Cobrar Hoy · {sesion.idx + 1}/{sesion.lista.length}</H1>
          <Btn variant="dim" onClick={() => setSesion(null)} style={{
          padding: "6px 12px",
          fontSize: 10
        }}>SALIR</Btn>
        </div>
        <div style={{
        height: 4,
        background: T.panel2,
        borderRadius: 2,
        marginBottom: 18
      }}>
          <div style={{
          width: `${sesion.idx / sesion.lista.length * 100}%`,
          height: "100%",
          background: T.blueMid,
          borderRadius: 2,
          transition: "width .3s"
        }} />
        </div>
        <Card glow style={{
        borderLeft: `3px solid ${c.sem.color}`
      }}>
          <div style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8
        }}>
            <div>
              <div style={{
              fontSize: 16,
              fontWeight: 800
            }}>{c.nombre}</div>
              <div style={{
              fontSize: 11,
              color: T.mut,
              marginTop: 3
            }}>{c.ciudad} · {c.tel} · SCORE {c.score}</div>
            </div>
            <Badge sem={c.sem} />
          </div>
          <div style={{
          display: "flex",
          gap: 18,
          margin: "14px 0",
          flexWrap: "wrap"
        }}>
            <span style={{
            fontSize: 12
          }}>SALDO <b style={{
              color: c.sem.color,
              fontSize: 15
            }}>{fmt(c.saldo)}</b></span>
            <span style={{
            fontSize: 12
          }}>SIN PAGO <b style={{
              color: c.sem.color,
              fontSize: 15
            }}>{c.dias}d</b></span>
            <span style={{
            fontSize: 12,
            color: T.mut
          }}>→ {c.sem.accion}</span>
          </div>
          {c.nota && <div style={{
          fontSize: 11,
          color: "#5a5a5a",
          background: "#fffbe8",
          border: "1px solid #f0e0a0",
          borderRadius: 7,
          padding: "8px 12px",
          marginBottom: 12,
          lineHeight: 1.5
        }}><Ico e="📝" className="mr-1.5" />{c.nota}</div>}
          <SubT>MENSAJE SUGERIDO {sesion.fuente && <span style={{
            color: sesion.fuente === "IA" ? T.green : T.orange
          }}>· {sesion.fuente}</span>}</SubT>
          {sesion.cargando ? <div style={{
          color: T.blueMid,
          fontSize: 12,
          fontWeight: 600,
          padding: 16,
          animation: "pulse 1s infinite"
        }}>Generando mensaje…</div> : <textarea value={sesion.msg} onChange={e => setSesion({
          ...sesion,
          msg: e.target.value
        })} rows={5} style={{
          width: "100%",
          boxSizing: "border-box",
          background: "#fff",
          border: `2px solid ${T.border}`,
          borderRadius: 7,
          color: T.text,
          fontFamily: T.mono,
          fontSize: 13,
          padding: 12,
          outline: "none",
          resize: "vertical",
          lineHeight: 1.5
        }} />}
          <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginTop: 14
        }}>
            <a href={waLink(c.tel, sesion.msg)} target="_blank" rel="noreferrer" style={{
            textDecoration: "none"
          }}><Btn disabled={sesion.cargando}><MessageCircle size={13} /> WHATSAPP</Btn></a>
            <a href={smsLink(c.tel, sesion.msg)} style={{
            textDecoration: "none"
          }}><Btn variant="ghost" disabled={sesion.cargando}>SMS</Btn></a>
            <Btn variant="ghost" disabled={sesion.cargando} onClick={mejorarConIA} title="Reescribir con IA"><Zap size={13} /> IA</Btn>
            <Btn variant="ghost" disabled={sesion.cargando} onClick={() => {
            navigator.clipboard?.writeText(sesion.msg);
            toast("Mensaje copiado");
          }}>COPIAR</Btn>
            <Btn variant="ghost" onClick={() => setLlamar(c.tel)}><Phone size={13} /></Btn>
            <Btn variant="ghost" onClick={() => setFactura(c)}><FileText size={13} /> FACTURA</Btn>
          </div>
          <div style={{
          borderTop: `1px solid ${T.border}`,
          marginTop: 16,
          paddingTop: 14,
          display: "flex",
          gap: 8,
          flexWrap: "wrap"
        }}>
            <Btn onClick={() => {
            onPago(c.id, c.pagoMensual, "Zelle");
            avanzar("pagó");
          }}><DollarSign size={13} /> PAGÓ {fmt(c.pagoMensual)}</Btn>
            <Btn variant="ghost" onClick={() => setPromesaDe(c)}><Ico e="🤝" className="mr-1.5" />PROMETIÓ</Btn>
            <Btn variant="ghost" onClick={() => avanzar("contactado")}>CONTACTADO →</Btn>
            <Btn variant="dim" onClick={() => avanzar("omitido")}>OMITIR →</Btn>
          </div>
        </Card>
        {factura && <FacturaModal c={factura} cfg={cfg} onClose={() => setFactura(null)} />}
        {promesaDe && <PromesaModal c={promesaDe} onSave={(f, h, m) => {
        onPromesa(promesaDe.id, f, h, m);
        avanzar("promesa");
      }} onClose={() => setPromesaDe(null)} />}
        {llamar && <LlamarModal tel={llamar} cfg={cfg} onClose={() => setLlamar(null)} />}
      </div>;
  }
  const catList = [{
    k: "corriente",
    c: T.green,
    n: "AL CORRIENTE",
    r: "sin atraso",
    filt: c => c.sem.key === "verde" && c.rango !== "0-30"
  }, {
    k: "r030",
    c: "#65a30d",
    n: "ATRASO 0-30",
    r: `0–${th.verde}d`,
    filt: c => c.sem.key === "verde" && c.rango === "0-30"
  }, {
    k: "amarillo",
    c: T.yellow,
    n: "MORA 31-60",
    r: `${th.verde + 1}–${th.amarillo}d`,
    filt: c => c.sem.key === "amarillo"
  }, {
    k: "naranja",
    c: T.orange,
    n: "MORA 61-90",
    r: `${th.amarillo + 1}–${th.naranja}d · ⚠ cesión`,
    filt: c => c.sem.key === "naranja"
  }, {
    k: "rojo",
    c: T.red,
    n: "CRÍTICO 90+",
    r: `${th.naranja + 1}d+ · ⚠ cesión`,
    filt: c => c.sem.key === "rojo"
  }];
  return <div>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10
    }}>
        <H1>Cobranza</H1>
        <Btn onClick={() => iniciarSesion()}><Zap size={14} /> COBRAR HOY ({pendientes.length})</Btn>
      </div>
      <CarteraChips value={cart} onChange={setCart} conTodas />
      {(riesgoList.length > 0 || salvadas.length > 0) && <Card style={{
      marginBottom: 18,
      border: `2px solid ${T.red}`,
      background: "#fffafa"
    }}>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: riesgoList.length ? 12 : 0
      }}>
            <div>
              <div style={{
            fontFamily: T.serif,
            fontSize: 17,
            fontWeight: 700,
            color: T.red
          }}><Ico e="🚨" className="mr-1.5" />Rescate de Cesiones — {nombreMes(mesKey)}</div>
              <div style={{
            fontSize: 11,
            color: "#5a5a5a",
            marginTop: 3,
            lineHeight: 1.5
          }}>Hy Cite cede toda cuenta con <b>2+ pagos vencidos</b>. <b style={{
              color: T.red
            }}>{riesgoList.length} cuenta(s)</b> — un solo pago las salva.</div>
            </div>
            {riesgoList.length > 0 && <Btn variant="danger" style={{
          background: T.red,
          color: "#fff"
        }} onClick={() => iniciarSesion(riesgoList)}><Zap size={13} /> RESCATE ({riesgoList.length})</Btn>}
          </div>
          {riesgoList.map(c => <div key={c.id} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderTop: `1px solid #f3d9d6`
      }}>
              <div style={{
          flex: 1,
          minWidth: 0
        }}>
                <span style={{
            fontSize: 12,
            fontWeight: 700
          }}>{c.nombre}</span>
                <span style={{
            fontSize: 10,
            color: T.mut,
            marginLeft: 8
          }}>{mesesVencidos(c)} pagos vencidos · {c.dias}d · {fmt(c.saldo)}</span>
              </div>
              <Btn variant="ghost" style={{
          padding: "5px 8px"
        }} onClick={() => setFactura(c)}><FileText size={12} /></Btn>
              <a href={waLink(c.tel, plantillaLocal(c, c.sem, cfg))} target="_blank" rel="noreferrer" style={{
          textDecoration: "none"
        }}><Btn variant="ghost" style={{
            padding: "5px 8px"
          }}><MessageCircle size={12} /></Btn></a>
            </div>)}
          {salvadas.length > 0 && <div style={{
        marginTop: 10,
        display: "flex",
        gap: 6,
        flexWrap: "wrap"
      }}>
              {salvadas.map(c => <span key={c.id} style={{
          fontSize: 10,
          fontWeight: 700,
          color: T.green,
          background: T.greenDim,
          border: `1.5px solid ${T.green}`,
          borderRadius: 12,
          padding: "3px 10px"
        }}><Ico e="✓" className="mr-1.5" />Salvada: {c.nombre.split(" ")[0]}</span>)}
            </div>}
        </Card>}
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,1fr)",
      gap: 10,
      marginBottom: 18
    }}>
        {catList.map(x => {
        const arr = dataF.filter(x.filt);
        return <Card key={x.k} style={{
          borderTop: `2px solid ${x.c}`
        }}>
              <div style={{
            fontSize: 9,
            color: x.c,
            fontWeight: 700,
            letterSpacing: 1
          }}>{x.n}</div>
              <div style={{
            fontSize: 9,
            color: T.mut
          }}>{x.r}</div>
              <div style={{
            fontSize: 19,
            fontWeight: 800,
            marginTop: 6
          }}>{arr.length}</div>
              <div style={{
            fontSize: 10,
            color: T.mut
          }}>{fmt(arr.reduce((s, c) => s + c.saldo, 0))}</div>
            </Card>;
      })}
      </div>
      <Card>
        <SubT>LISTA PRIORIZADA POR SCORE</SubT>
        {dataF.map((c, i) => <div key={c.id} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: i < dataF.length - 1 ? `1px solid ${T.border}` : "none"
      }}>
            <span style={{
          color: T.mut,
          fontSize: 10,
          width: 22
        }}>{String(i + 1).padStart(2, "0")}</span>
            <div style={{
          flex: 1,
          minWidth: 0
        }}>
              <span style={{
            fontSize: 12,
            fontWeight: 700
          }}>{c.nombre}</span>
              <span style={{
            fontSize: 10,
            color: T.mut,
            marginLeft: 8
          }}>{c.dias}d · {fmt(c.saldo)}</span>
              {enRiesgoCesion(c, mesKey) && <b style={{
            fontSize: 9,
            color: T.red,
            marginLeft: 6
          }}><Ico e="⚠" className="mr-1.5" />CESIÓN</b>}
            </div>
            {!isMobile && <span style={{
          fontSize: 10,
          color: c.sem.color,
          fontWeight: 700
        }}>SCORE {c.score}</span>}
            <Badge sem={c.sem} />
            <a href={waLink(c.tel, plantillaLocal(c, c.sem, cfg))} target="_blank" rel="noreferrer" style={{
          textDecoration: "none"
        }}><Btn variant="ghost" style={{
            padding: "5px 8px"
          }}><MessageCircle size={12} /></Btn></a>
            <Btn variant="ghost" style={{
          padding: "5px 8px"
        }} onClick={() => setFactura(c)}><FileText size={12} /></Btn>
          </div>)}
      </Card>
      {factura && <FacturaModal c={factura} cfg={cfg} onClose={() => setFactura(null)} />}
    </div>;
};

/* ── Recurrentes ── */
const _cargarScript = src => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement("script");
  s.src = src;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error("No se pudo cargar la librería"));
  document.head.appendChild(s);
});
const _digits = s => String(s == null ? "" : s).replace(/\D/g, "");
const _last4 = s => _digits(s).slice(-4);
const _normExp = s => {
  const raw = String(s == null ? "" : s).trim();
  let m = raw.match(/(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  if (m) return m[1].padStart(2, "0") + "/" + (m[2].length === 4 ? m[2].slice(2) : m[2]);
  m = raw.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return m[2].padStart(2, "0") + "/" + m[1].slice(2);
  return raw;
};
const _diaDe = s => {
  const raw = String(s == null ? "" : s).trim();
  let m = raw.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return Math.min(28, Math.max(1, +m[3]));
  m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) return Math.min(28, Math.max(1, +m[1]));
  const n = parseInt(raw, 10);
  return isNaN(n) ? 1 : Math.min(28, Math.max(1, n));
};
const _monto = s => {
  const n = parseFloat(String(s == null ? "" : s).replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
};
const ImportAutos = ({
  distribucion,
  onImport,
  onClose
}) => {
  const [modo, setModo] = useState("excel");
  const [filas, setFilas] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const fileRef = useRef(null);
  const emparejar = rows => rows.map(r => {
    const ctaR = _digits(r.cuenta);
    const porCuenta = ctaR && distribucion.find(c => _digits(c.cuenta) && _digits(c.cuenta) === ctaR);
    const porNombre = !porCuenta && distribucion.find(c => {
      const parts = String(r.nombre || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
      const nom = String(c.nombre || "").toLowerCase();
      return parts.length >= 1 && nom.includes(parts[0]) && (parts.length < 2 || nom.includes(parts[parts.length - 1]));
    });
    const match = porCuenta || porNombre;
    return {
      nombre: r.nombre || (match ? match.nombre : ""),
      cuenta: r.cuenta || (match ? match.cuenta : ""),
      last4: _last4(r.last4),
      exp: _normExp(r.exp),
      dia: r.dia || 1,
      monto: _monto(r.monto),
      clienteId: match ? String(match.id) : "",
      incluir: true
    };
  });
  const leerExcel = async file => {
    setLeyendo(true);
    try {
      await _cargarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, {
        type: "array"
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = window.XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: ""
      });
      if (!aoa.length) {
        toast("La hoja está vacía", "err");
        setLeyendo(false);
        return;
      }
      let hIdx = aoa.findIndex(row => row.filter(x => String(x).trim()).length >= 3);
      if (hIdx < 0) hIdx = 0;
      const headers = aoa[hIdx].map(h => String(h || "").toLowerCase());
      const col = keys => headers.findIndex(h => keys.some(k => h.includes(k)));
      const cN = col(["nombre", "titular", "cliente", "name", "apellido"]);
      const cC = col(["cuenta", "account", "acct", "cta", "hy cite", "hycite"]);
      const cL = col(["últim", "ultim", "last", "dígit", "digit", "tarjeta", "card"]);
      const cE = col(["exp", "venc", "expir"]);
      const cD = col(["cobro", "fecha", "día", "dia", "day", "corte"]);
      const cM = col(["monto", "amount", "valor", "importe", "cuota", "pago", "total"]);
      const rows = [];
      for (let i = hIdx + 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row || !row.filter(x => String(x).trim()).length) continue;
        const g = idx => idx >= 0 ? row[idx] : "";
        const nombre = String(g(cN) || "").trim();
        const cuenta = _digits(g(cC));
        if (!nombre && !cuenta) continue;
        rows.push({
          nombre,
          cuenta,
          last4: g(cL),
          exp: g(cE),
          dia: _diaDe(g(cD)),
          monto: g(cM)
        });
      }
      if (!rows.length) {
        toast("No encontré filas con datos. Revisa que la hoja tenga encabezados.", "err");
        setLeyendo(false);
        return;
      }
      setFilas(emparejar(rows));
    } catch (e) {
      toast("No pude leer el archivo: " + (e.message || e), "err");
    }
    setLeyendo(false);
  };
  const leerPDF = file => {
    setLeyendo(true);
    const r = new FileReader();
    r.onload = async () => {
      try {
        const b64 = String(r.result).split(",")[1];
        const res = await fetch("/api/anthropic", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            messages: [{
              role: "user",
              content: [{
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: b64
                }
              }, {
                type: "text",
                text: 'Extrae las filas de cobros automáticos de este documento. Devuelve SOLO un arreglo JSON válido, sin texto ni backticks. Cada objeto: {"nombre":"nombre y apellido","cuenta":"número de cuenta solo dígitos","last4":"últimos 4 dígitos de la tarjeta","exp":"MM/AA","dia":día del mes 1-28,"monto":número}. NUNCA incluyas el número completo de la tarjeta ni el CVV: solo los últimos 4 dígitos. Si falta un dato usa "" o 0.'
              }]
            }]
          })
        });
        if (!res.ok) throw new Error("Servidor " + res.status);
        const data = await res.json();
        const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/```json|```/g, "").trim();
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr) || !arr.length) throw new Error("sin filas");
        setFilas(emparejar(arr));
      } catch (e) {
        toast("No pude leer el PDF con IA. ¿Está activo el proxy /api/anthropic? (" + (e.message || e) + ")", "err");
      }
      setLeyendo(false);
    };
    r.readAsDataURL(file);
  };
  const upd = (i, k, v) => setFilas(filas.map((f, j) => j === i ? {
    ...f,
    [k]: v
  } : f));
  const validos = filas ? filas.filter(f => f.incluir && f.clienteId && /^\d{4}$/.test(f.last4)).length : 0;
  const confirmar = () => {
    if (!filas) return;
    const listos = filas.filter(f => f.incluir && f.clienteId && /^\d{4}$/.test(f.last4));
    if (!listos.length) return toast("Empareja al menos una fila (cliente + últimos 4 válidos)", "err");
    onImport(listos.map(f => ({
      clienteId: f.clienteId,
      nombre: f.nombre,
      cuenta: f.cuenta,
      last4: f.last4,
      exp: f.exp,
      dia: +f.dia || 1,
      monto: _monto(f.monto)
    })));
    toast(`${listos.length} pago(s) automático(s) importado(s) ✓`);
    onClose();
  };
  const inpS = {
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    border: `1.5px solid ${T.border}`,
    borderRadius: 6,
    color: T.text,
    fontFamily: T.mono,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 8px",
    outline: "none"
  };
  return <Modal title="IMPORTAR PAGOS AUTOMÁTICOS" onClose={onClose} wide>
      {!filas ? <div>
          <div style={{
        display: "flex",
        gap: 7,
        marginBottom: 14
      }}>
            {[["excel", "📊 Excel / CSV"], ["pdf", "📄 PDF (IA)"]].map(([k, n]) => <button key={k} onClick={() => setModo(k)} style={{
          background: modo === k ? T.blueMid : T.bg,
          border: `1.5px solid ${modo === k ? T.blueMid : T.border}`,
          color: modo === k ? "#fff" : "#5a5a5a",
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 20,
          cursor: "pointer",
          fontFamily: T.mono
        }}>{n}</button>)}
          </div>
          <input ref={fileRef} type="file" accept={modo === "excel" ? ".xlsx,.xls,.csv" : "application/pdf"} style={{
        display: "none"
      }} onChange={e => {
        const f = e.target.files && e.target.files[0];
        if (f) modo === "excel" ? leerExcel(f) : leerPDF(f);
        e.target.value = "";
      }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={leyendo} style={{
        width: "100%",
        boxSizing: "border-box",
        background: T.bluePale,
        border: `2px dashed ${T.blueMid}`,
        borderRadius: 8,
        padding: 22,
        cursor: leyendo ? "wait" : "pointer",
        fontFamily: T.mono,
        color: T.blueMid,
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8
      }}>
            <Upload size={16} /> {leyendo ? "LEYENDO…" : modo === "excel" ? "SUBIR EXCEL O CSV" : "SUBIR PDF (lo lee la IA)"}
          </button>
          <div style={{
        fontSize: 10,
        color: T.mut,
        marginTop: 12,
        lineHeight: 1.6
      }}>
            Columnas esperadas: <b>nombre y apellido</b>, <b>número de cuenta</b>, <b>últimos 4 dígitos</b>, <b>expiración</b>, <b>fecha de cobro</b> y <b>monto</b>. Se empareja por número de cuenta; si coincide, el cliente se agrega a cobranza. 🔒 Nunca se guarda el número completo ni el CVV.
          </div>
        </div> : <div>
          <div style={{
        fontSize: 11,
        color: T.mut,
        marginBottom: 10
      }}>Revisa y empareja. Solo se importan las filas marcadas y con cliente asignado.</div>
          <div style={{
        maxHeight: 340,
        overflowY: "auto",
        border: `1px solid ${T.border}`,
        borderRadius: 7
      }}>
            {filas.map((f, i) => {
          const ok = f.clienteId && /^\d{4}$/.test(f.last4);
          return <div key={i} style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${T.border}`,
            background: f.incluir ? ok ? "#fff" : "#fff8f0" : "#f4f4f4"
          }}>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6
            }}>
                    <input type="checkbox" checked={f.incluir} onChange={e => upd(i, "incluir", e.target.checked)} />
                    <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.text,
                flex: 1
              }}>{f.nombre || "(sin nombre)"}{f.cuenta && <span style={{
                  color: T.mut,
                  fontWeight: 500
                }}> · Cta {f.cuenta}</span>}</div>
                    {ok ? <span style={{
                fontSize: 9,
                color: T.green,
                fontWeight: 700
              }}><Ico e="✓" className="mr-1.5" />match</span> : <span style={{
                fontSize: 9,
                color: T.orange,
                fontWeight: 700
              }}><Ico e="⚠" className="mr-1.5" />revisar</span>}
                  </div>
                  <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 0.7fr 1fr",
              gap: 6
            }}>
                    <select value={f.clienteId} onChange={e => upd(i, "clienteId", e.target.value)} style={inpS}>
                      <option value="">— Sin cliente —</option>
                      {distribucion.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}{c.cuenta ? " · " + c.cuenta : ""}</option>)}
                    </select>
                    <input value={f.last4} onChange={e => upd(i, "last4", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="últ. 4" style={inpS} />
                    <input value={f.exp} onChange={e => upd(i, "exp", e.target.value)} placeholder="MM/AA" style={inpS} />
                    <input value={f.dia} onChange={e => upd(i, "dia", e.target.value.replace(/\D/g, ""))} placeholder="día" style={inpS} />
                    <input value={f.monto} onChange={e => upd(i, "monto", e.target.value)} placeholder="$ monto" style={inpS} />
                  </div>
                </div>;
        })}
          </div>
          <div style={{
        display: "flex",
        gap: 10,
        marginTop: 14
      }}>
            <Btn variant="ghost" onClick={() => setFilas(null)}><ChevronLeft size={13} /> ATRÁS</Btn>
            <Btn onClick={confirmar} style={{
          flex: 1,
          justifyContent: "center"
        }}><CheckCircle2 size={14} /> IMPORTAR {validos} PAGO(S)</Btn>
          </div>
        </div>}
    </Modal>;
};
const Recurrentes = ({
  recurrentes,
  setRecurrentes,
  clientes,
  isMobile,
  distribucion,
  onImport
}) => {
  const [nuevo, setNuevo] = useState(false);
  const [imp, setImp] = useState(false);
  const [hora, setHora] = useState(new Date().getHours());
  useEffect(() => {
    const i = setInterval(() => setHora(new Date().getHours()), 60000);
    return () => clearInterval(i);
  }, []);
  const hoyDia = new Date().getDate();
  const cobrosHoy = recurrentes.filter(r => r.activo && r.dia === hoyDia);
  const nombreDe = id => clientes.find(c => String(c.id) === String(id))?.nombre || "—";
  return <div>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10
    }}>
        <H1>Pagos Automáticos</H1>
        <div style={{
        display: "flex",
        gap: 8
      }}><Btn variant="ghost" onClick={() => setImp(true)}><Upload size={14} /> IMPORTAR</Btn><Btn onClick={() => setNuevo(true)}><Plus size={14} /> AGREGAR</Btn></div>
      </div>
      {hora >= 13 && cobrosHoy.length > 0 && <div style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      background: "#fdecea",
      border: `1px solid ${T.red}`,
      borderRadius: 7,
      padding: "10px 14px",
      marginBottom: 14,
      fontSize: 12,
      color: T.red
    }}>
          <Clock size={15} /> Recordatorio 1PM: hoy toca procesar {cobrosHoy.length} pago(s) — {cobrosHoy.map(r => nombreDe(r.clienteId)).join(", ")}
        </div>}
      <div style={{
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      background: T.bluePale,
      border: `1px solid ${T.borderHi}`,
      borderRadius: 7,
      padding: "12px 14px",
      marginBottom: 16,
      fontSize: 11,
      color: "#5a5a5a",
      lineHeight: 1.6
    }}>
        <Shield size={16} color={T.green} style={{
        flexShrink: 0,
        marginTop: 1
      }} />
        <span><b style={{
          color: T.blue
        }}>Seguridad:</b> solo se guardan los <b>últimos 4 dígitos</b> y la expiración. Nunca el número completo ni el CVV.</span>
      </div>
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
      gap: 10
    }}>
        {recurrentes.map(r => <Card key={r.id} style={{
        opacity: r.activo ? 1 : 0.55
      }}>
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        }}>
              <div>
                <div style={{
              fontSize: 13,
              fontWeight: 700
            }}>{nombreDe(r.clienteId)}</div>
                <div style={{
              fontSize: 11,
              color: T.mut,
              marginTop: 4
            }}><CreditCard size={11} style={{
                verticalAlign: -1
              }} /> {maskCard(r.last4)} · exp {r.exp}{!validExp(r.exp) && <span style={{
                color: T.red
              }}> <Ico e="⚠" className="mr-1.5" />VENCIDA</span>}</div>
              </div>
              <button onClick={() => setRecurrentes(rs => rs.map(x => x.id === r.id ? {
            ...x,
            activo: !x.activo
          } : x))} style={{
            background: r.activo ? T.greenDim : T.panel2,
            border: `1.5px solid ${r.activo ? T.green : T.border}`,
            borderRadius: 12,
            color: r.activo ? T.green : T.mut,
            fontFamily: T.mono,
            fontSize: 9,
            fontWeight: 700,
            padding: "4px 8px",
            cursor: "pointer"
          }}>{r.activo ? "ACTIVO" : "PAUSADO"}</button>
            </div>
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12
        }}>
              <span style={{
            fontSize: 11,
            color: T.mut
          }}><Calendar size={11} style={{
              verticalAlign: -1
            }} /> Día {r.dia} de cada mes</span>
              <span style={{
            fontSize: 15,
            fontWeight: 800,
            color: T.green
          }}>{fmt(r.monto)}</span>
            </div>
            <Btn variant="danger" style={{
          marginTop: 12,
          padding: "5px 10px",
          fontSize: 10
        }} onClick={() => {
          setRecurrentes(rs => rs.filter(x => x.id !== r.id));
          toast("Pago automático eliminado");
        }}><Trash2 size={11} /> ELIMINAR</Btn>
          </Card>)}
      </div>
      {!recurrentes.length && <Card><div style={{
        color: T.mut,
        fontSize: 12,
        textAlign: "center",
        padding: 12
      }}>Sin pagos automáticos. Agrega el primero con AGREGAR.</div></Card>}
      {nuevo && <FormRecurrente clientes={clientes} onClose={() => setNuevo(false)} onGuardar={r => {
      setRecurrentes(rs => [...rs, {
        ...r,
        id: Date.now(),
        activo: true
      }]);
      setNuevo(false);
      toast("Pago automático creado");
    }} />}
      {imp && <ImportAutos distribucion={distribucion} onImport={onImport} onClose={() => setImp(false)} />}
    </div>;
};
const FormRecurrente = ({
  clientes,
  onClose,
  onGuardar
}) => {
  const [f, setF] = useState({
    clienteId: clientes[0]?.id || "",
    dia: 1,
    monto: "",
    last4: "",
    exp: ""
  });
  const [errs, setErrs] = useState({});
  const guardar = () => {
    const e = {};
    if (isNaN(+f.monto) || +f.monto <= 0) e.monto = "Monto válido requerido";
    if (!/^\d{4}$/.test(f.last4)) e.last4 = "Solo los últimos 4 dígitos";
    if (!validExp(f.exp)) e.exp = "MM/AA vigente, ej. 09/27";
    if (+f.dia < 1 || +f.dia > 28) e.dia = "Usa día 1–28";
    setErrs(e);
    if (Object.keys(e).length) return;
    onGuardar({
      ...f,
      clienteId: +f.clienteId,
      dia: +f.dia,
      monto: +f.monto
    });
  };
  return <Modal title="NUEVO PAGO AUTOMÁTICO" onClose={onClose}>
      <label style={{
      display: "block",
      marginBottom: 12
    }}>
        <span style={{
        fontSize: 10,
        color: T.mut,
        letterSpacing: 1,
        textTransform: "uppercase"
      }}>CLIENTE</span>
        <select value={f.clienteId} onChange={e => setF({
        ...f,
        clienteId: e.target.value
      })} style={{
        width: "100%",
        marginTop: 4,
        background: "#fff",
        border: `2px solid ${T.border}`,
        borderRadius: 7,
        color: T.text,
        fontFamily: T.mono,
        fontSize: 14,
        fontWeight: 600,
        padding: "10px 12px"
      }}>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }}>
        <Input label="Día del mes (1–28)" type="number" value={f.dia} onChange={e => setF({
        ...f,
        dia: e.target.value
      })} error={errs.dia} />
        <Input label="Monto ($)" type="number" value={f.monto} onChange={e => setF({
        ...f,
        monto: e.target.value
      })} error={errs.monto} />
      </div>
      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }}>
        <Input label="Últimos 4 de la tarjeta" maxLength={4} value={f.last4} onChange={e => setF({
        ...f,
        last4: e.target.value.replace(/\D/g, "")
      })} error={errs.last4} placeholder="4242" />
        <Input label="Expiración (MM/AA)" maxLength={5} value={f.exp} onChange={e => {
        let v = e.target.value.replace(/[^\d]/g, "");
        if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2, 4);
        setF({
          ...f,
          exp: v
        });
      }} error={errs.exp} placeholder="09/27" />
      </div>
      <div style={{
      fontSize: 10,
      color: T.mut,
      marginBottom: 14
    }}><Ico e="🔒" className="mr-1.5" />Por seguridad no se captura número completo ni CVV.</div>
      <Btn onClick={guardar} style={{
      width: "100%",
      justifyContent: "center"
    }}><CheckCircle2 size={14} /> CREAR</Btn>
    </Modal>;
};

/* ── Reportes ── */
const Reportes = ({
  data,
  recurrentes,
  clientes,
  resumen
}) => {
  const expCartera = () => csvDownload(`cartera-${todayISO()}.csv`, [["Cliente", "Nro Cuenta", "Nivel", "Cartera", "Ciudad", "Teléfono", "Valor pendiente", "Cuota", "Días sin pago", "Estado", "Score"], ...data.map(c => [c.nombre, c.nroCuenta || "", c.nivel || "", CARTERAS[c.cartera || "dist"].nombre, c.ciudad, c.tel, c.saldo, c.pagoMensual, c.dias, c.sem.label, c.score])]);
  const expPagos = () => csvDownload(`pagos-${todayISO()}.csv`, [["Fecha", "Cliente", "Monto", "Método"], ...clientes.flatMap(c => (c.historial || []).filter(h => h.tipo === "pago").map(h => [h.fecha, c.nombre, h.monto, h.metodo])).sort((a, b) => a[0] < b[0] ? 1 : -1)]);
  const expRec = () => csvDownload(`pagos-automaticos-${todayISO()}.csv`, [["Cliente", "Día", "Monto", "Tarjeta", "Expiración", "Estado"], ...recurrentes.map(r => [clientes.find(c => c.id === r.clienteId)?.nombre || "—", r.dia, r.monto, maskCard(r.last4), r.exp, r.activo ? "Activo" : "Pausado"])]);
  // Reporte a la mano: clientes atrasados agrupados por rango de mora
  const RANGOS_REP = [
    { n: "Atraso 0-30", e: "🟢", filt: c => c.sem.key === "verde" && c.rango === "0-30" },
    { n: "Mora 31-60", e: "🟡", filt: c => c.sem.key === "amarillo" },
    { n: "Mora 61-90", e: "🟠", filt: c => c.sem.key === "naranja" },
    { n: "Crítico 90+", e: "🔴", filt: c => c.sem.key === "rojo" }
  ];
  const COLS_ATRASO = ["Cliente", "Nro Cuenta", "Nivel", "Cartera", "Ciudad", "Teléfono", "Valor pendiente", "Cuota", "Días sin pago", "Rango"];
  const filaAtraso = c => [c.nombre, c.nroCuenta || "", c.nivel || "", CARTERAS[c.cartera || "dist"].nombre, c.ciudad, c.tel, c.saldo, c.pagoMensual, c.dias, c.sem.label];
  const expAtraso = (nombre, lista) => csvDownload(`atrasados-${nombre.replace(/\s+/g, "-").toLowerCase()}-${todayISO()}.csv`, [COLS_ATRASO, ...lista.map(filaAtraso)]);
  const todosAtrasados = data.filter(c => RANGOS_REP.some(r => r.filt(c)));
  return <div>
      <H1>Reportes</H1>
      <Card style={{ marginBottom: 18 }}>
        <SubT>CLIENTES ATRASADOS · POR RANGO</SubT>
        {RANGOS_REP.map(r => {
        const lista = data.filter(r.filt);
        return <div key={r.n} style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "9px 0",
          borderBottom: `1px solid ${T.border}`
        }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{r.e} {r.n}</div>
            <div style={{ fontSize: 11, color: T.mut }}>{lista.length} cliente(s) · {fmt(lista.reduce((s, c) => s + (+c.saldo || 0), 0))}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="ghost" onClick={() => expAtraso(r.n, lista)} disabled={!lista.length} style={{ padding: "5px 8px", fontSize: 10 }}><Download size={12} /> CSV</Btn>
              <Btn variant="ghost" onClick={() => pdfPrint(`Clientes atrasados — ${r.n}`, COLS_ATRASO, lista.map(filaAtraso))} disabled={!lista.length} style={{ padding: "5px 8px", fontSize: 10 }}><Ico e="🖨" className="mr-1.5" />PDF</Btn>
            </div>
          </div>;
      })}
        <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 0 2px"
      }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}><Ico e="📋" className="mr-1.5" />TODOS LOS ATRASADOS</div>
          <div style={{ fontSize: 11, color: T.mut, fontWeight: 700 }}>{todosAtrasados.length} cliente(s) · {fmt(todosAtrasados.reduce((s, c) => s + (+c.saldo || 0), 0))}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={() => expAtraso("todos", todosAtrasados)} disabled={!todosAtrasados.length} style={{ padding: "5px 8px", fontSize: 10 }}><Download size={12} /> CSV</Btn>
            <Btn onClick={() => pdfPrint("Clientes atrasados — Todos", COLS_ATRASO, todosAtrasados.map(filaAtraso))} disabled={!todosAtrasados.length} style={{ padding: "5px 8px", fontSize: 10 }}><Ico e="🖨" className="mr-1.5" />PDF</Btn>
          </div>
        </div>
      </Card>
      <Card>
        <SubT>EXPORTAR (CSV → ABRE EN EXCEL)</SubT>
        <div style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap"
      }}>
          <Btn variant="ghost" onClick={expCartera}><Download size={13} /> CARTERA COMPLETA</Btn>
          <Btn variant="ghost" onClick={() => pdfPrint("Cartera completa", ["Cliente", "Nro Cuenta", "Nivel", "Cartera", "Ciudad", "Teléfono", "Valor pendiente", "Cuota", "Días sin pago", "Estado"], data.map(c => [c.nombre, c.nroCuenta || "", c.nivel || "", CARTERAS[c.cartera || "dist"].nombre, c.ciudad, c.tel, c.saldo, c.pagoMensual, c.dias, c.sem.label]))}><Ico e="🖨" className="mr-1.5" />CARTERA PDF</Btn>
          <Btn variant="ghost" onClick={expPagos}><Download size={13} /> HISTORIAL DE PAGOS</Btn>
          <Btn variant="ghost" onClick={() => pdfPrint("Historial de pagos", ["Fecha", "Cliente", "Monto", "Método"], clientes.flatMap(c => (c.historial || []).filter(h => h.tipo === "pago").map(h => [h.fecha, c.nombre, h.monto, h.metodo])).sort((a, b) => a[0] < b[0] ? 1 : -1))}><Ico e="🖨" className="mr-1.5" />PAGOS PDF</Btn>
          <Btn variant="ghost" onClick={expRec}><Download size={13} /> PAGOS AUTOMÁTICOS</Btn>
        </div>
        <div style={{
        fontSize: 10,
        color: T.mut,
        marginTop: 12
      }}>Los CSV abren directo en Excel y conservan acentos (UTF-8 BOM).</div>
      </Card>
    </div>;
};

/* ── Config ── */
const Config = ({
  cfg,
  setCfg,
  onBackup,
  onRestore,
  onReset
}) => {
  const [f, setF] = useState({
    ...cfg
  });
  const fileRef = useRef(null);
  const guardar = () => {
    const t = f.thresholds;
    if (!(t.verde > 0 && t.amarillo > t.verde && t.naranja > t.amarillo)) return toast("Umbrales: verde < amarillo < naranja", "err");
    setCfg(f);
    toast("Configuración guardada");
  };
  return <div>
      <H1>Configuración</H1>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>NEGOCIO</SubT>
        <Input label="Nombre del distribuidor (sale en mensajes y facturas)" value={f.usuario || ""} onChange={e => setF({
        ...f,
        usuario: e.target.value
      })} placeholder="Impact Enterprises" />
      </Card>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>UMBRALES DEL SEMÁFORO (DÍAS SIN PAGO)</SubT>
        <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10
      }}>
          <Input label="🟢 hasta" type="number" value={f.thresholds.verde} onChange={e => setF({
          ...f,
          thresholds: {
            ...f.thresholds,
            verde: +e.target.value
          }
        })} />
          <Input label="🟡 hasta" type="number" value={f.thresholds.amarillo} onChange={e => setF({
          ...f,
          thresholds: {
            ...f.thresholds,
            amarillo: +e.target.value
          }
        })} />
          <Input label="🟠 hasta" type="number" value={f.thresholds.naranja} onChange={e => setF({
          ...f,
          thresholds: {
            ...f.thresholds,
            naranja: +e.target.value
          }
        })} />
        </div>
        <div style={{
        fontSize: 10,
        color: T.mut
      }}>Alineados a los buckets de Hy Cite: 0-30 / 31-60 / 61-90 / 🔴 90+.</div>
      </Card>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>FORMAS DE PAGO (SALEN EN FACTURAS Y MENSAJES)</SubT>
        <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }}>
          <Input label="Zelle (tel o email)" value={f.zelle || ""} onChange={e => setF({
          ...f,
          zelle: e.target.value
        })} placeholder="(254) 555-0100" />
          <Input label="Titular del Zelle" value={f.zelleTitular || ""} onChange={e => setF({
          ...f,
          zelleTitular: e.target.value
        })} placeholder="Tomás Flores" />
        </div>
        <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }}>
          <Input label="Cash App ($cashtag)" value={f.cashapp || ""} onChange={e => setF({
          ...f,
          cashapp: e.target.value
        })} placeholder="$ImpactEnterprises" />
          <Input label="Titular del Cash App" value={f.cashappTitular || ""} onChange={e => setF({
          ...f,
          cashappTitular: e.target.value
        })} placeholder="Tomás Flores" />
        </div>
        <Input label="Teléfono de contacto (sale en la factura)" value={f.telDistribuidor || ""} onChange={e => setF({
        ...f,
        telDistribuidor: e.target.value
      })} placeholder="(254) 555-0100" />
      </Card>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>WHATSAPP (ULTRAMSG · OPCIONAL)</SubT>
        <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }}>
          <Input label="Instance ID" value={f.ultramsgInstance || ""} onChange={e => setF({
          ...f,
          ultramsgInstance: e.target.value
        })} placeholder="instance12345" />
          <Input label="Token" value={f.ultramsgToken || ""} onChange={e => setF({
          ...f,
          ultramsgToken: e.target.value
        })} placeholder="token…" />
        </div>
        <div style={{
        fontSize: 10,
        color: T.mut,
        lineHeight: 1.6
      }}>Si lo dejas vacío, los mensajes se abren en WhatsApp con el texto ya escrito, listo para enviar (wa.me).</div>
      </Card>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>CRM DE TELEMARKETING</SubT>
        <Input label="URL del CRM para marcar" value={f.crmTelemarketingUrl || ""} onChange={e => setF({
        ...f,
        crmTelemarketingUrl: e.target.value
      })} placeholder="https://mi-crm.replit.app/llamar?num={tel}" />
        <div style={{
        fontSize: 10,
        color: T.mut,
        lineHeight: 1.6
      }}>Usa <b>{`{tel}`}</b> para número con código de país o <b>{`{tel10}`}</b> para 10 dígitos.</div>
      </Card>
      <Card style={{
      marginBottom: 14
    }}>
        <SubT>PLANTILLAS DE COBRANZA</SubT>
        <div style={{
        fontSize: 10,
        color: T.mut,
        marginBottom: 12,
        lineHeight: 1.6
      }}>Variables: <b>{`{nombre}`} {`{saldo}`} {`{cuota}`} {`{dias}`} {`{usuario}`} {`{pago}`}</b></div>
        {[["verde", "🟢 MORA 0-30 (1 mes de atraso)"], ["amarillo", "🟡 MORA 31-60"], ["naranja", "🟠 MORA 61-90"], ["rojo", "🔴 CRÍTICO 90+"]].map(([k, n]) => <div key={k} style={{
        marginBottom: 12
      }}>
            <div style={{
          fontSize: 10,
          color: T.blueMid,
          fontWeight: 700,
          marginBottom: 4
        }}>{n}</div>
            <textarea value={(f.plantillas || PLANTILLAS_DEFAULT)[k]} onChange={e => setF({
          ...f,
          plantillas: {
            ...(f.plantillas || PLANTILLAS_DEFAULT),
            [k]: e.target.value
          }
        })} rows={3} style={{
          width: "100%",
          boxSizing: "border-box",
          background: "#fff",
          border: `2px solid ${T.border}`,
          borderRadius: 7,
          color: T.text,
          fontFamily: T.mono,
          fontSize: 11,
          padding: 10,
          outline: "none",
          resize: "vertical",
          lineHeight: 1.5
        }} />
          </div>)}
      </Card>
      <Btn onClick={guardar} style={{
      width: "100%",
      justifyContent: "center",
      marginBottom: 14
    }}><CheckCircle2 size={14} /> GUARDAR CONFIGURACIÓN</Btn>
      <Card>
        <SubT>RESPALDO DE DATOS</SubT>
        <div style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap"
      }}>
          <Btn variant="ghost" onClick={onBackup}><Download size={13} /> DESCARGAR BACKUP JSON</Btn>
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={13} /> RESTAURAR BACKUP</Btn>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{
        display: "none"
      }} onChange={e => e.target.files?.[0] && onRestore(e.target.files[0])} />
        <div style={{
        fontSize: 10,
        color: T.mut,
        marginTop: 10
      }}>El backup incluye los datos de cobranza: saldos, historial de pagos y pagos automáticos.</div>
      </Card>
      <Card style={{ borderLeft: `3px solid ${T.red}` }}>
        <SubT>ZONA DE PELIGRO</SubT>
        <div style={{ fontSize: 11, color: T.mut, marginBottom: 10, lineHeight: 1.6 }}>
          Deja TODO el módulo de cobranza en cero: clientes, pagos, reportes, metas del mes, pagos automáticos y pagos externos. La configuración (plantillas, Zelle, umbrales) se conserva. <b>No afecta Telemarketing, Agenda ni las bases de datos.</b> Descarga un backup antes, por si acaso.
        </div>
        <Btn variant="ghost" onClick={() => {
        if (!confirm("⚠️ Esto deja TODA la cobranza en 0: clientes, pagos, reportes y metas. ¿Continuar?")) return;
        if (!confirm("Última confirmación: los datos de cobranza se borrarán en todos los dispositivos. ¿Seguro?")) return;
        onReset && onReset();
      }} style={{ borderColor: T.red, color: T.red }}><Ico e="🧹" className="mr-1.5" />REINICIAR COBRANZA EN 0</Btn>
      </Card>
    </div>;
};
function CobranzaSection({
  distribucion,
  cobranza,
  setCobranza: setCobranzaRaw
}) {
  // Sello de tiempo automático: TODO cambio en un cliente de cobranza queda
  // marcado con _t. El merge protector usa esa marca para que la versión más
  // reciente (incluidos los borrados) gane siempre en la sincronización.
  const setCobranza = fn => setCobranzaRaw(prev => {
    const p = prev || {};
    const next = typeof fn === "function" ? fn(p) : fn;
    if (!next || next.clientesData === p.clientesData) return next;
    const antes = p.clientesData || {};
    const cd = { ...(next.clientesData || {}) };
    let hubo = false;
    Object.keys(cd).forEach(id => {
      const a = antes[id], b = cd[id];
      if (!b) return;
      if (!a || JSON.stringify(a) !== JSON.stringify(b)) { cd[id] = { ...b, _t: Date.now() }; hubo = true; }
    });
    return hubo ? { ...next, clientesData: cd } : next;
  });
  const [tab, setTab] = useState("dashboard");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onR = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const dist = distribucion || [];
  const cb = cobranza || {};
  const clientesData = cb.clientesData || {};
  const recurrentes = cb.recurrentes || [];
  const pagosExternos = cb.pagosExternos || []; // pagos del recibo diario sin cliente en la app
  const cfg = {
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...(cb.cfg && cb.cfg.thresholds)
    },
    plantillas: {
      ...PLANTILLAS_DEFAULT,
      ...(cb.cfg && cb.cfg.plantillas)
    },
    ultramsgInstance: "",
    ultramsgToken: "",
    metaPct: 8,
    zelle: "",
    zelleTitular: "",
    cashapp: "",
    cashappTitular: "",
    telDistribuidor: "",
    crmTelemarketingUrl: "",
    usuario: "",
    ...(cb.cfg || {})
  };
  const meses = cb.meses || {
    [mesKeyHoy()]: {
      dist: 0,
      fin: 0,
      metaPct: 8
    }
  };
  const th = cfg.thresholds;
  const mesKey = mesKeyHoy();
  const mesCfg = meses[mesKey] || null;
  const reportesFin = cb.reportesFin || {};
  const snapsMes = [...(reportesFin[mesKey] || [])].sort((x, y) => x.fecha < y.fecha ? -1 : 1);
  // Pagos registrados en la app DESPUÉS del último reporte → cartera viva
  const pagosDesdeReporte = useMemo(() => {
    const ult = snapsMes[snapsMes.length - 1];
    if (!ult) return 0;
    let t = 0;
    Object.values(clientesData || {}).forEach(c => lstCob(c.historial).forEach(h => {
      if (h.tipo === "pago" && h.fecha > ult.fecha) t += +h.monto || 0;
    }));
    pagosExternos.forEach(h => { if (h.fecha > ult.fecha) t += +h.monto || 0; });
    return +t.toFixed(2);
  }, [clientesData, snapsMes, pagosExternos]);
  const cfgSesion = {
    ...cfg,
    usuario: cfg.usuario || ""
  };
  const setCfg = fn => setCobranza(prev => {
    const p = prev || {};
    const nc = typeof fn === "function" ? fn({
      ...cfg
    }) : fn;
    return {
      ...p,
      cfg: nc
    };
  });
  const setMeses = fn => setCobranza(prev => {
    const p = prev || {};
    const nm = typeof fn === "function" ? fn(p.meses || meses) : fn;
    return {
      ...p,
      meses: nm
    };
  });
  const setRecurrentes = fn => setCobranza(prev => {
    const p = prev || {};
    const nr = typeof fn === "function" ? fn(p.recurrentes || []) : fn;
    return {
      ...p,
      recurrentes: nr
    };
  });
  const updCliente = (id, fn) => setCobranza(prev => {
    const p = prev || {};
    const cd = {
      ...(p.clientesData || {})
    };
    cd[String(id)] = fn(cd[String(id)] || {});
    return {
      ...p,
      clientesData: cd
    };
  });
  const removeCliente = id => setCobranza(prev => {
    const p = prev || {};
    const cd = {
      ...(p.clientesData || {})
    };
    // LÁPIDA en vez de borrar la clave: si se elimina la clave, cualquier eco de
    // sincronización de otro dispositivo puede "resucitar" al cliente. La marca
    // _oculto sobrevive a las fusiones y además no mueve claves entre fragmentos.
    const cid = String(id);
    if (cd[cid]) cd[cid] = { ...cd[cid], _oculto: true };
    return {
      ...p,
      clientesData: cd,
      recurrentes: (p.recurrentes || []).filter(r => String(r.clienteId) !== cid)
    };
  });
  // Reinicio TOTAL del módulo (para pruebas o empezar de cero). Conserva cfg.
  const reiniciarCobranza = () => {
    setCobranza(prev => ({
      cfg: (prev || {}).cfg || {},
      clientesData: {},
      recurrentes: [],
      reportesFin: {},
      meses: {},
      pagosExternos: []
    }));
    toast("🧹 Cobranza reiniciada en 0 — lista para empezar limpio");
  };
  // Pagos del recibo diario que NO hacen match con ningún cliente de la app:
  // se guardan en un libro aparte y SUMAN al cobrado del mes de todas formas.
  const registrarPagosExternos = rows => setCobranza(prev => {
    const p = prev || {};
    const arr = [...(p.pagosExternos || [])];
    rows.forEach(r => {
      const f = (typeof r.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) ? r.fecha : todayISO();
      arr.push({ fecha: f, nombre: r.nombre || "(sin nombre)", cuenta: String(r.cuenta || ""), monto: +(+r.monto || 0).toFixed(2), origen: "Hy Cite" });
    });
    return { ...p, pagosExternos: arr };
  });
  const idxDist = useMemo(() => {
    const m = {};
    dist.forEach(d => {
      m[String(d.id)] = d;
    });
    return m;
  }, [dist]);
  const clientes = useMemo(() => Object.keys(clientesData).filter(id => !(clientesData[id] || {})._oculto).map(id => {
    const ov = clientesData[id] || {};
    const d = idxDist[id];
    return {
      id,
      nombre: ov.nombre || d && d.nombre || "—",
      tel: ov.tel || d && d.telefono || "",
      nroCuenta: ov.nroCuenta || d && d.cuenta || "",
      ciudad: ov.ciudad || d && d.ciudad || "",
      direccion: ov.direccion || d && d.direccion || "",
      email: ov.email || "",
      saldo: +ov.saldo || 0,
      pagoMensual: +ov.pagoMensual || 0,
      ultimoPago: ov.ultimoPago || "",
      // CAMPOS DE ATRASO del reporte Hy Cite — antes se PERDÍAN aquí: aunque
      // importarClientesIA los guardaba en clientesData, este map los descartaba
      // y por eso el cliente salía "sin datos / Al corriente" en la lista.
      rango: ov.rango || "",
      diasAtraso: (ov.diasAtraso ?? null),
      atraso: +ov.atraso || 0,
      emprendedor: ov.emprendedor || "",
      cuotaEstimada: ov.cuotaEstimada || false,
      historial: lstCob(ov.historial),
      promesa: ov.promesa || null,
      cartera: ov.cartera || "dist",
      nivel: ov.nivel || "",
      tipoCuenta: ov.tipoCuenta || "",
      metodoPago: ov.metodoPago || "",
      estado: ov.estado || "Activo",
      cargoVueltaFecha: ov.cargoVueltaFecha || "",
      cargoVueltaMonto: ov.cargoVueltaMonto || "",
      nota: ov.nota || "",
      referencias: ov.referencias || [],
      _enBase: !!d
    };
  }), [clientesData, idxDist]);
  const disponibles = useMemo(() => dist.filter(d => { const e = clientesData[String(d.id)]; return !e || e._oculto; }).map(d => ({
    id: d.id,
    nombre: d.nombre,
    telefono: d.telefono,
    cuenta: d.cuenta,
    ciudad: d.ciudad,
    direccion: d.direccion
  })), [dist, clientesData]);
  const enriquecidos = useMemo(() => clientes.map(c => {
    const dias = daysSince(c.ultimoPago);
    return {
      ...c,
      dias,
      sem: semDeCliente(c, th), // respeta el rango del reporte Hy Cite si existe
      score: scoreDe(c, th)
    };
  }), [clientes, th]);
  const resumen = useMemo(() => {
    const cats = {
      verde: [],
      amarillo: [],
      naranja: [],
      rojo: []
    };
    enriquecidos.forEach(c => cats[c.sem.key].push(c));
    const total = enriquecidos.reduce((s, c) => s + c.saldo, 0);
    const mes = todayISO().slice(0, 7);
    const cobradoMes = clientes.flatMap(c => c.historial || []).filter(h => h.tipo === "pago" && h.fecha.startsWith(mes)).reduce((s, h) => s + h.monto, 0)
      + pagosExternos.filter(h => h.fecha && h.fecha.startsWith(mes)).reduce((s, h) => s + h.monto, 0);
    const vencido = [...cats.naranja, ...cats.rojo].reduce((s, c) => s + c.saldo, 0);
    return {
      cats,
      total,
      cobradoMes,
      vencido
    };
  }, [enriquecidos, clientes, pagosExternos]);
  const cobradoCartera = useMemo(() => {
    const g = cart => clientes.filter(c => (c.cartera || "dist") === cart).flatMap(c => c.historial || []).filter(h => h.tipo === "pago" && h.fecha.startsWith(mesKey)).reduce((s, h) => s + h.monto, 0);
    const ext = pagosExternos.filter(h => h.fecha && h.fecha.startsWith(mesKey)).reduce((s, h) => s + h.monto, 0);
    return {
      dist: g("dist") + ext,
      fin: g("fin")
    };
  }, [clientes, mesKey, pagosExternos]);
  const prioritarios = useMemo(() => [...enriquecidos].sort((a, b) => b.score - a.score), [enriquecidos]);
  const kpiHyCite = useMemo(() => {
    const riesgo = enriquecidos.filter(c => enRiesgoCesion(c, mesKey));
    const salvadas = enriquecidos.filter(c => mesesVencidos(c) >= 2 && pagoEsteMes(c, mesKey));
    // ── Morosidad: sale DIRECTO del último reporte financiero (Control de
    // Cartera Hy Cite) si existe; así los indicadores se mueven al subir el
    // reporte. Sin reporte, se estima desde los clientes individuales. ──
    const ultRep = snapsMes && snapsMes.length ? snapsMes[snapsMes.length - 1] : null;
    let mora31, moraTotal;
    if (ultRep && ultRep.total && ultRep.total.cxc > 0) {
      const cxc = ultRep.total.cxc;
      const t = ultRep.total;
      moraTotal = (t.d0 + t.d31 + t.d61 + t.d90) / cxc * 100;
      mora31 = (t.d31 + t.d61 + t.d90) / cxc * 100;
    } else {
      const total = clientes.reduce((s, c) => s + c.saldo, 0) || 1;
      let v31 = 0, vTot = 0;
      clientes.forEach(c => {
        const v = montoVencido(c);
        vTot += v;
        if (daysSince(c.ultimoPago) >= 31) v31 += v;
      });
      mora31 = v31 / total * 100;
      moraTotal = vTot / total * 100;
    }
    // Riesgo por atraso: TODO lo que esté a más de 60 días (naranja 61-90 + rojo 90+)
    const atraso60 = enriquecidos.filter(c => c.sem.key === "naranja" || c.sem.key === "rojo");
    return {
      mora31,
      moraTotal,
      desdeReporte: !!ultRep,
      riesgo,
      salvadas,
      saldoRiesgo: riesgo.reduce((s, c) => s + c.saldo, 0),
      atraso60Count: atraso60.length,
      atraso60Saldo: atraso60.reduce((s, c) => s + c.saldo, 0),
      // Cesión SEGÚN EL REPORTE Hy Cite (si el último reporte del mes la trae explícita)
      repCesion: (ultRep && ultRep.cesion && (+ultRep.cesion.cuentas > 0 || +ultRep.cesion.monto > 0)) ? ultRep.cesion : null,
      // Monto en +61 días SEGÚN EL REPORTE (61-90 + Over 90): la cartera en cesión a trabajar el mes
      rep61: ultRep ? +(((+ultRep.total.d61) || 0) + ((+ultRep.total.d90) || 0)).toFixed(2) : null,
      repFecha: ultRep ? (ultRep.fecha || "") : ""
    };
  }, [clientes, enriquecidos, mesKey, snapsMes]);
  const guardarReporteFin = snap => {
    const mk = String(snap.fecha || "").slice(0, 7) || mesKey;
    const esPrimero = !((cb.reportesFin || {})[mk] || []).length;
    setCobranza(prev => {
      const p = prev || {};
      const rf = { ...(p.reportesFin || {}) };
      const arr = (rf[mk] || []).filter(x => x.fecha !== snap.fecha);
      rf[mk] = [...arr, snap].sort((x, y) => x.fecha < y.fecha ? -1 : 1);
      let ms = p.meses || {};
      if (esPrimero) ms = { ...ms, [mk]: { fin: 0, metaPct: 8, ...(ms[mk] || {}), dist: +(+snap.total.cxc).toFixed(2) } };
      return { ...p, reportesFin: rf, meses: ms };
    });
    toast(esPrimero
      ? `Reporte guardado ✓ Cartera inicial de Distribución fijada: ${fmt(snap.total.cxc)}`
      : `Reporte del ${snap.fecha} guardado ✓`);
  };
  const registrarPago = (id, monto, metodo, fecha) => {
    const fechaPago = (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) ? fecha : todayISO();
    updCliente(id, ov => {
      // El pago MUEVE al cliente de zona de atraso según las cuotas que cubra:
      // 0-30 = 1 cuota · 31-60 = 2 · 61-90 = 3 · 91+ = 4 o más.
      // Si paga todas, queda AL CORRIENTE. Colección NO cambia con pagos (estado especial).
      const RANGO_CUOTAS = { "0-30": 1, "31-60": 2, "61-90": 3, "91+": 4 };
      const CUOTAS_RANGO = { 1: "0-30", 2: "31-60", 3: "61-90" };
      let nuevoRango = ov.rango || "";
      let nuevoAtraso = Math.max(0, +(((+ov.atraso) || 0) - monto).toFixed(2));
      if(RANGO_CUOTAS[ov.rango]){
        const atrasoTotal = (+ov.atraso) || 0;
        const cuota = +ov.pagoMensual > 0 ? +ov.pagoMensual : 0;
        // Si paga el MOROSO COMPLETO (o más), queda al corriente — sin líos de redondeo.
        const pagaTodo = atrasoTotal > 0 && (+monto) >= atrasoTotal - 0.01;
        // cuotas que cubre este pago (tolerancia de centavos; mínimo 1; sin cuota conocida = 1)
        const k = cuota > 0 ? Math.max(1, Math.floor((+monto) / cuota + 0.01)) : 1;
        const restantes = pagaTodo ? 0 : RANGO_CUOTAS[ov.rango] - k;
        nuevoRango = restantes <= 0 ? "" : (CUOTAS_RANGO[restantes] || "91+");
        if(restantes <= 0) nuevoAtraso = 0;
      }
      return {
        ...ov,
        saldo: Math.max(0, +((+ov.saldo || 0) - monto).toFixed(2)),
        ultimoPago: fechaPago,
        promesa: null,
        rango: nuevoRango,
        atraso: nuevoAtraso,
        historial: [...lstCob(ov.historial), {
          fecha: fechaPago,
          monto,
          metodo,
          tipo: "pago",
          // respaldo para poder DESHACER el pago restaurando la zona anterior
          rangoPrev: ov.rango || "",
          atrasoPrev: (+ov.atraso) || 0
        }]
      };
    });
    toast(`Pago de ${fmt(monto)} registrado`);
  };
  const deshacerPago = id => {
    updCliente(id, ov => {
      const h = [...lstCob(ov.historial)];
      const i = h.map(x => x.tipo).lastIndexOf("pago");
      if (i < 0) return ov;
      const p = h.splice(i, 1)[0];
      const prev = h.filter(x => x.tipo === "pago").slice(-1)[0];
      toast(`Pago de ${fmt(p.monto)} deshecho`);
      return {
        ...ov,
        saldo: +((+ov.saldo || 0) + p.monto).toFixed(2),
        ultimoPago: prev ? prev.fecha : ov.ultimoPago,
        // deshacer también RESTAURA la zona de atraso y el moroso previos
        ...(p.rangoPrev !== undefined ? { rango: p.rangoPrev } : {}),
        ...(p.atrasoPrev !== undefined ? { atraso: p.atrasoPrev } : {}),
        historial: h
      };
    });
  };
  const guardarPromesa = (id, fecha, hora, monto) => {
    updCliente(id, ov => ({
      ...ov,
      promesa: {
        fecha,
        hora,
        monto
      },
      historial: [...lstCob(ov.historial), {
        fecha: todayISO(),
        monto: monto || 0,
        metodo: `para ${fecha} ${hora}`,
        tipo: "promesa"
      }]
    }));
    toast("Promesa de pago registrada 🤝");
  };
  const romperPromesa = id => {
    updCliente(id, ov => ({
      ...ov,
      promesa: null,
      historial: [...lstCob(ov.historial), {
        fecha: todayISO(),
        monto: 0,
        metodo: "",
        tipo: "promesa_rota"
      }]
    }));
    toast("Promesa incumplida registrada", "err");
  };
  // Importar clientes extraídos por IA (documentos/fotos) a la cartera elegida.
  // Si el cliente ya existe en Distribución (por cuenta, teléfono o nombre) se enlaza a su id;
  // si no, se crea independiente (útil para MI FINANCIERA). Nunca pisa saldos/historial existentes.
  // Fusiona clientes DUPLICADOS que ya estén en cobranza (misma cuenta, mismo
  // teléfono o mismo nombre normalizado): une historiales, conserva la mejor
  // información y deja UN solo registro por persona.
  const fusionarDuplicadosCobranza = () => {
    const t10 = t => { let d = String(t || "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
    const nK = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean).sort().join(" ");
    const cK = t => String(t || "").replace(/\W/g, "").toLowerCase();
    let fusionados = 0;
    setCobranza(prev => {
      const p = prev || {};
      const cd = { ...(p.clientesData || {}) };
      const porLlave = {};
      const llaveDe = c => cK(c.numeroCuenta || c.nroCuenta) || t10(c.telefono || c.tel) || nK(c.nombre) || null;
      Object.entries(cd).forEach(([id, c]) => {
        const k = llaveDe(c || {});
        if(!k) return;
        if(!porLlave[k]) porLlave[k] = [];
        porLlave[k].push(id);
      });
      Object.values(porLlave).forEach(ids => {
        if(ids.length < 2) return;
        // principal: el que tenga MÁS historial (empate: más campos llenos)
        ids.sort((a, b) => ((cd[b].historial||[]).length - (cd[a].historial||[]).length) || (Object.values(cd[b]).filter(Boolean).length - Object.values(cd[a]).filter(Boolean).length));
        const base = { ...cd[ids[0]] };
        for(let i = 1; i < ids.length; i++){
          const otro = cd[ids[i]];
          Object.keys(otro || {}).forEach(k2 => { if(base[k2] === undefined || base[k2] === "" || base[k2] === 0) base[k2] = otro[k2]; });
          base.historial = unirHistorial(base.historial, otro.historial);
          if(otro.promesa && !base.promesa) base.promesa = otro.promesa;
          delete cd[ids[i]];
          fusionados++;
        }
        cd[ids[0]] = base;
      });
      return { ...p, clientesData: cd };
    });
    setTimeout(() => toast(fusionados ? `🧹 ${fusionados} duplicado(s) fusionado(s) — historiales unidos` : "Sin duplicados que fusionar ✓"), 50);
  };
  // Eliminar VARIOS clientes de una (selección múltiple)
  const eliminarVariosClientes = (ids) => {
    if(!ids || !ids.length) return;
    setCobranza(prev => {
      const cd = { ...(prev?.clientesData || {}) };
      ids.forEach(id => { const k = String(id); if (cd[k]) cd[k] = { ...cd[k], _oculto: true }; });
      return { ...prev, clientesData: cd };
    });
    setTimeout(()=>toast(`🗑️ ${ids.length} cliente(s) eliminado(s)`), 50);
  };
  const importarClientesIA = (registros, cartera) => {
    const tel10 = t => { let d = String(t || "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
    const nCta = t => String(t || "").replace(/\W/g, "").toLowerCase();
    // Llave de nombre robusta: sin acentos, sin puntuación y con las palabras
    // ORDENADAS — "GARCIA, MARIA" y "María García" producen la misma llave.
    const nNom = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean).sort().join(" ");
    let agregados = 0, actualizados = 0;
    const entradas = [];
    // Índice de los clientes que YA existen en cobranza (por cuenta / teléfono /
    // nombre) para no duplicar cuando el reporte trae el mismo cliente otra vez.
    const idxCob = { cuenta:{}, tel:{}, nom:{} };
    Object.entries(clientesData || {}).forEach(([cid, c]) => {
      if (nCta(c.numeroCuenta || c.cuenta)) idxCob.cuenta[nCta(c.numeroCuenta || c.cuenta)] = cid;
      if (tel10(c.telefono)) idxCob.tel[tel10(c.telefono)] = cid;
      if (nNom(c.nombre)) idxCob.nom[nNom(c.nombre)] = cid;
    });
    // IDs ya asignados EN ESTE MISMO lote → evita duplicar filas repetidas del reporte.
    const enLote = { cuenta:{}, tel:{}, nom:{} };
    const vistos = new Set();
    (registros || []).forEach(r => {
      if (!(r.nombre || "").trim() && !tel10(r.telefono)) return;
      const kCta = nCta(r.numeroCuenta), kTel = tel10(r.telefono), kNom = nNom(r.nombre);
      // 1) ¿ya lo vimos en este mismo reporte? → mismo id, solo se actualiza
      let id = (kCta && enLote.cuenta[kCta]) || (kTel && enLote.tel[kTel]) || (kNom && enLote.nom[kNom]) || null;
      let match = null;
      if (!id) {
        // 2) ¿ya existe en cobranza? (cuenta → teléfono → nombre)
        id = (kCta && idxCob.cuenta[kCta]) || (kTel && idxCob.tel[kTel]) || (kNom && idxCob.nom[kNom]) || null;
        // 3) ¿existe en la base de Distribución? → reusar su id
        if (!id) {
          if (kCta) match = dist.find(d => nCta(d.cuenta) === kCta);
          if (!match && kTel) match = dist.find(d => tel10(d.telefono) === kTel);
          if (!match && kNom) match = dist.find(d => nNom(d.nombre) === kNom);
          id = match ? String(match.id) : genId();
        }
      }
      // registrar el id para las tres llaves (dedup dentro del lote)
      if (kCta) enLote.cuenta[kCta] = id;
      if (kTel) enLote.tel[kTel] = id;
      if (kNom) enLote.nom[kNom] = id;
      if (vistos.has(id)) { /* misma persona, fila repetida: no cuenta doble */ }
      else if (clientesData[id]) { actualizados++; vistos.add(id); }
      else { agregados++; vistos.add(id); }
      entradas.push({ id, r, esNuevoEnBase: !match && !clientesData[id] });
    });
    if (!entradas.length) { toast("No hay registros válidos para agregar", "err"); return; }
    setCobranza(prev => {
      const p = prev || {};
      const cd = { ...(p.clientesData || {}) };
      entradas.forEach(({ id, r, esNuevoEnBase }) => {
        const ov = cd[id] || {};
        // Rango final: el que dijo la IA; si no vino pero sí los DÍAS, se deriva.
        const rangoDeDias = d => { if(d === "" || d === null || d === undefined) return ""; const n = +d; if(!(n >= 0) || isNaN(n)) return ""; if(n <= 30) return "0-30"; if(n <= 60) return "31-60"; if(n <= 90) return "61-90"; return "91+"; };
        const rangoFinal = rangoDeRegistro(r) || rangoDeDias(r.diasAtraso) || ov.rango || "";
        // Foto nueva = información nueva: SIEMPRE actualiza saldo, cuota, último
        // pago y rango. NUNCA toca historial de pagos ni promesas existentes.
        // Si el reporte NO trae la cuota pero sí el monto en atraso + rango,
        // se ESTIMA: 0-30 → cuota ≈ atraso · 31-60 → atraso/2 · 61-90 → atraso/3 · 91+/colección → atraso/4.
        const divisorCuota = { "0-30": 1, "31-60": 2, "61-90": 3, "91+": 4, "coleccion": 4 }[rangoFinal];
        const cuotaEstim = (!( +r.pagoMensual > 0) && +r.atraso > 0 && divisorCuota)
          ? +((+r.atraso) / divisorCuota).toFixed(2) : 0;
        cd[id] = {
          ...ov,
          _oculto: false,
          cartera: ov.cartera || cartera,
          saldo: (r.saldo !== undefined && r.saldo !== "" && !isNaN(+r.saldo)) ? +(+r.saldo).toFixed(2) : (+ov.saldo || 0),
          pagoMensual: (+r.pagoMensual > 0) ? +(+r.pagoMensual).toFixed(2)
            : (cuotaEstim > 0 ? cuotaEstim : (+ov.pagoMensual || 0)),
          cuotaEstimada: (+r.pagoMensual > 0) ? false : (cuotaEstim > 0 ? true : (ov.cuotaEstimada || false)),
          atraso: (+r.atraso > 0) ? +(+r.atraso).toFixed(2) : (ov.atraso || 0),
          // Si el reporte trae RANGO (formato Hy Cite), su única fecha es la del
          // ÚLTIMO PEDIDO — que NO es un pago. En ese caso se descarta cualquier
          // fecha que la IA haya puesto y se conserva la que ya tenía el cliente.
          // El rango de la foto es lo que manda para el atraso.
          ultimoPago: rangoFinal ? (ov.ultimoPago || "") : (r.ultimoPago || ov.ultimoPago || todayISO()),
          rango: rangoFinal,  // ubica al cliente en su zona de atraso (0-30/31-60/61-90/91+) según el reporte
          diasAtraso: (+r.diasAtraso >= 0 && r.diasAtraso !== "") ? +r.diasAtraso : (ov.diasAtraso ?? null),
          emprendedor: r.emprendedor || ov.emprendedor || "",
          email: r.email || ov.email || "",
          historial: lstCob(ov.historial),
          // Identidad: se ACTUALIZA con lo que traiga el reporte (suplantar), pero
          // nunca se borra si el reporte viene vacío. Se guardan en las mismas
          // llaves que usa el índice anti-duplicados (nombre/telefono/numeroCuenta).
          nombre: r.nombre || ov.nombre || "",
          telefono: r.telefono || ov.telefono || ov.tel || "",
          numeroCuenta: r.numeroCuenta || ov.numeroCuenta || ov.nroCuenta || "",
          tel: r.telefono || ov.tel || ov.telefono || "",
          nroCuenta: r.numeroCuenta || ov.nroCuenta || ov.numeroCuenta || "",
          ciudad: r.ciudad || ov.ciudad || "",
          direccion: r.direccion || ov.direccion || ""
        };
      });
      return { ...p, clientesData: cd };
    });
    const conRango = (registros||[]).filter(r=>rangoDeRegistro(r)).length;
    toast(`🤖 IA: ${agregados} agregado(s)` + (actualizados ? ` · ${actualizados} actualizado(s)` : "") + (conRango ? ` · ${conRango} con rango de atraso` : " · ⚠️ sin rango detectado"));
  };
  const guardarCliente = (data, id) => {
    const targetId = id || data._pickId;
    if (!targetId) return;
    const clean = {
      ...data
    };
    delete clean._pickId;
    updCliente(targetId, ov => ({
      ...ov,
      ...clean,
      _oculto: false,
      historial: lstCob(ov.historial)
    }));
    toast(id ? "Ficha actualizada" : "Cliente agregado a cobranza");
  };
  const eliminarCliente = id => {
    removeCliente(id);
    toast("Cliente quitado de cobranza");
  };
  const agregarTodos = () => {
    setCobranza(prev => {
      const p = prev || {};
      const cd = { ...(p.clientesData || {}) };
      (dist || []).forEach(d => {
        const cid = String(d.id);
        if (!cid) return;
        if (!cd[cid]) { cd[cid] = { cartera: "dist", saldo: 0, pagoMensual: 0, historial: [] }; }
        else if (cd[cid]._oculto) { cd[cid] = { ...cd[cid], _oculto: false }; }
      });
      return { ...p, clientesData: cd };
    });
    toast("Clientes de Distribución agregados a cobranza");
  };

  // Importación de pagos automáticos: agrega el cliente a cobranza (si hace match) y crea/actualiza el auto
  const procesarAutos = items => {
    setCobranza(prev => {
      const p = prev || {};
      const cd = {
        ...(p.clientesData || {})
      };
      let recs = [...(p.recurrentes || [])];
      let nuevos = 0,
        actualizados = 0,
        agregados = 0;
      items.forEach(it => {
        const id = String(it.clienteId);
        if (!id) return;
        if (!cd[id]) {
          cd[id] = {
            cartera: "dist",
            saldo: 0,
            pagoMensual: +it.monto || 0,
            historial: []
          };
          agregados++;
        } else if ((!cd[id].pagoMensual || +cd[id].pagoMensual === 0) && it.monto) cd[id] = {
          ...cd[id],
          pagoMensual: +it.monto
        };
        const base = {
          clienteId: id,
          dia: +it.dia || 1,
          monto: +it.monto || 0,
          last4: it.last4,
          exp: it.exp,
          activo: true
        };
        const k = recs.findIndex(r => String(r.clienteId) === id && r.last4 === it.last4 && r.exp === it.exp);
        if (k >= 0) {
          recs[k] = {
            ...recs[k],
            ...base
          };
          actualizados++;
        } else {
          recs.push({
            ...base,
            id: Date.now() + Math.floor(Math.random() * 100000)
          });
          nuevos++;
        }
      });
      return {
        ...p,
        clientesData: cd,
        recurrentes: recs
      };
    });
  };
  const backupJSON = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({
      clientesData,
      recurrentes,
      meses,
      cfg
    }, null, 2)], {
      type: "application/json"
    }));
    a.download = `cobranza-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Respaldo descargado");
  };
  const restoreJSON = file => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        setCobranza(prev => ({
          ...(prev || {}),
          clientesData: d.clientesData || (prev || {}).clientesData || {},
          recurrentes: d.recurrentes || (prev || {}).recurrentes || [],
          meses: d.meses || (prev || {}).meses || {},
          cfg: d.cfg || (prev || {}).cfg || {}
        }));
        toast("Respaldo restaurado");
      } catch {
        toast("Archivo inválido", "err");
      }
    };
    r.readAsText(file);
  };
  const tabs = [{
    id: "dashboard",
    icon: LayoutDashboard,
    label: "Panel"
  }, {
    id: "clientes",
    icon: Users,
    label: "Clientes"
  }, {
    id: "cobranza",
    icon: Target,
    label: "Cobranza"
  }, {
    id: "recurrentes",
    icon: RefreshCw,
    label: "Auto"
  }, {
    id: "reportes",
    icon: FileText,
    label: "Reportes"
  }, {
    id: "config",
    icon: Settings,
    label: "Config"
  }];
  return <div style={{
    fontFamily: T.mono,
    color: T.text
  }}>
      <div style={{
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 18,
      borderBottom: `1px solid ${T.border}`,
      paddingBottom: 12
    }}>
        {tabs.map(t => {
        const act = tab === t.id;
        const crit = t.id === "cobranza" ? resumen.cats.rojo.length : 0;
        return <button key={t.id} onClick={() => setTab(t.id)} style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 14px",
          background: act ? T.blue : T.bluePale,
          border: `1px solid ${act ? T.blue : T.borderHi}`,
          borderRadius: 20,
          color: act ? "#fff" : T.blueMid,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer"
        }}>
              <t.icon size={14} /> {t.label}
              {crit > 0 && <span style={{
            background: act ? "rgba(255,255,255,.25)" : T.red,
            color: "#fff",
            borderRadius: 10,
            fontSize: 9,
            fontWeight: 800,
            padding: "1px 6px"
          }}>{crit}</span>}
            </button>;
      })}
      </div>

      {tab === "dashboard" && <Dashboard resumen={resumen} prioritarios={prioritarios} isMobile={isMobile} irCobranza={() => setTab("cobranza")} mesKey={mesKey} mesCfg={mesCfg} setMeses={setMeses} cobradoCartera={cobradoCartera} clientes={enriquecidos} onPago={registrarPago} onPagoExterno={registrarPagosExternos} pagosExternos={pagosExternos} kpi={kpiHyCite} cfg={cfgSesion} onRomper={romperPromesa} puedeEditarMes={true} snapsMes={snapsMes} onReporteFin={guardarReporteFin} pagosDespues={pagosDesdeReporte} />}
      {tab === "clientes" && <Clientes data={enriquecidos} isMobile={isMobile} onGuardar={guardarCliente} onEliminar={eliminarCliente} onPago={registrarPago} onDeshacer={deshacerPago} cfg={cfgSesion} puedeBorrar={true} mesKey={mesKey} onPromesa={guardarPromesa} onRomper={romperPromesa} onAgregarTodos={agregarTodos} disponibles={disponibles} onImportarIA={importarClientesIA} onFusionarDuplicados={fusionarDuplicadosCobranza} onEliminarVarios={eliminarVariosClientes} />}
      {tab === "cobranza" && <Cobranza data={prioritarios} resumen={resumen} cfg={cfgSesion} onPago={registrarPago} isMobile={isMobile} th={th} kpi={kpiHyCite} mesKey={mesKey} onPromesa={guardarPromesa} />}
      {tab === "recurrentes" && <Recurrentes recurrentes={recurrentes} setRecurrentes={setRecurrentes} clientes={clientes} isMobile={isMobile} distribucion={dist} onImport={procesarAutos} />}
      {tab === "reportes" && <Reportes data={enriquecidos} recurrentes={recurrentes} clientes={clientes} resumen={resumen} />}
      {tab === "config" && <Config cfg={cfgSesion} setCfg={setCfg} onBackup={backupJSON} onRestore={restoreJSON} onReset={reiniciarCobranza} />}

      <ToastHost />
    </div>;
}
  return { CobranzaSection };
})();
export const CobranzaSection = __CobranzaModule.CobranzaSection;
