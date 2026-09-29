// ═══ LLAMADAS v2 — LÓGICA PURA (probada en tests/callWorkflow.test.ts) ═════
// Bandeja de trabajo por prioridad para cada especialidad de telemarketing.
//   Ventas:        DATO → CONTACTO → VISITA AGENDADA
//   Cobranza:      CLIENTE → CONTACTO → COMPROMISO DE PAGO
//   Reclutamiento: PROSPECTO → CONTACTO → ENTREVISTA → NUEVO SOCIO
// Reglas de oro:
//  • Identidad por UID (agenteUid), nunca por nombre.
//  • Un seguimiento vencido NUNCA desaparece por antigüedad: solo se cierra al
//    completarlo, reprogramarlo, o con un resultado final.
//  • Cambiar el estado no borra proximo_seguimiento.
//  • Cobranza: las llamadas van en `gestiones` (el `historial` de Cobranza es de
//    pagos/promesas y su pantalla lo pinta así); compromiso y promesa incumplida
//    usan el formato que Cobranza ya entiende.
import { asList, lastContactAt } from "./assignments";

export type Especialidad = "ventas" | "cobranza" | "reclutamiento";
export const especialidadDe = (role: string): Especialidad | null =>
  role === "telemarketing_ventas" ? "ventas" : role === "telemarketing_cobranza" ? "cobranza" : role === "telemarketing_reclutamiento" ? "reclutamiento" : null;

const p2 = (n: number) => String(n).padStart(2, "0");
export const diaLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const diaDe = (f: any) => { if (!f) return ""; const s = String(f); if (!s.includes("T")) return s.slice(0, 10); const d = new Date(s); return isNaN(d.getTime()) ? s.slice(0, 10) : diaLocal(d); };
export const diasEntre = (desde: string, hasta: string) => Math.round((new Date(hasta + "T00:00:00").getTime() - new Date(desde + "T00:00:00").getTime()) / 86400000);

// ── Resultados de llamada por especialidad ──────────────────────────────────
// contacto  = hubo conversación con la persona (contacto efectivo)
// productivo= el resultado que busca la especialidad (cita / compromiso / entrevista)
// requiere  = qué datos exige antes de guardar
// cierra    = cierra el seguimiento abierto (resultado final o meta lograda)
export type Requiere = null | "fecha" | "fecha_paso" | "compromiso" | "cita" | "entrevista";
export type Resultado = { id: string; label: string; contacto: boolean; productivo: boolean; requiere: Requiere; cierra: boolean; estado?: string; etapa?: string; color: string };

export const RESULTADOS: Record<Especialidad, Resultado[]> = {
  ventas: [
    { id: "cita_agendada", label: "Cita agendada", contacto: true, productivo: true, requiere: "cita", cierra: true, estado: "verde", color: "#16a34a" },
    { id: "no_contesto", label: "No contestó", contacto: false, productivo: false, requiere: null, cierra: false, estado: "naranja", color: "#f97316" },
    { id: "buzon", label: "Buzón", contacto: false, productivo: false, requiere: null, cierra: false, estado: "buzon", color: "#0d9488" },
    { id: "llamar_despues", label: "Llamar después", contacto: true, productivo: false, requiere: "fecha", cierra: false, estado: "naranja", color: "#d97706" },
    { id: "en_proceso", label: "En proceso", contacto: true, productivo: false, requiere: "fecha_paso", cierra: false, estado: "naranja", color: "#7c3aed" },
    { id: "no_interesado", label: "No interesado", contacto: true, productivo: false, requiere: null, cierra: true, estado: "rojo", color: "#dc2626" },
    { id: "numero_equivocado", label: "Número equivocado", contacto: false, productivo: false, requiere: null, cierra: true, estado: "numero_equivocado", color: "#64748b" },
  ],
  cobranza: [
    { id: "compromiso_pago", label: "Compromiso de pago", contacto: true, productivo: true, requiere: "compromiso", cierra: false, color: "#16a34a" },
    { id: "pago_informado", label: "Pago realizado / informa que pagó", contacto: true, productivo: true, requiere: null, cierra: true, color: "#047857" },
    { id: "llamar_despues", label: "Llamar después", contacto: true, productivo: false, requiere: "fecha", cierra: false, color: "#d97706" },
    { id: "no_contesto", label: "No contestó", contacto: false, productivo: false, requiere: null, cierra: false, color: "#f97316" },
    { id: "buzon", label: "Buzón", contacto: false, productivo: false, requiere: null, cierra: false, color: "#0d9488" },
    { id: "promesa_incumplida", label: "Promesa incumplida", contacto: false, productivo: false, requiere: null, cierra: false, color: "#dc2626" },
    { id: "en_seguimiento", label: "En seguimiento", contacto: true, productivo: false, requiere: "fecha", cierra: false, color: "#7c3aed" },
    { id: "numero_equivocado", label: "Número equivocado", contacto: false, productivo: false, requiere: null, cierra: true, color: "#64748b" },
  ],
  reclutamiento: [
    { id: "no_contesto", label: "No contestó", contacto: false, productivo: false, requiere: null, cierra: false, color: "#f97316" },
    { id: "buzon", label: "Buzón", contacto: false, productivo: false, requiere: null, cierra: false, color: "#0d9488" },
    { id: "llamar_despues", label: "Llamar después", contacto: true, productivo: false, requiere: "fecha", cierra: false, etapa: "contactado", color: "#d97706" },
    { id: "interesado", label: "Interesado", contacto: true, productivo: false, requiere: "fecha", cierra: false, etapa: "interesado", color: "#7c3aed" },
    { id: "entrevista_agendada", label: "Entrevista agendada", contacto: true, productivo: true, requiere: "entrevista", cierra: true, etapa: "entrevista_agendada", color: "#0d9488" },
    { id: "no_interesado", label: "No interesado", contacto: true, productivo: false, requiere: null, cierra: true, color: "#dc2626" },
    { id: "numero_equivocado", label: "Número equivocado", contacto: false, productivo: false, requiere: null, cierra: true, color: "#64748b" },
  ],
};
export const resultadoDe = (esp: Especialidad, id: string) => RESULTADOS[esp].find((r) => r.id === id) || null;
export const PASOS_EN_PROCESO = [
  { id: "llamar_nuevamente", label: "Llamar nuevamente" },
  { id: "enviar_informacion", label: "Enviar información" },
  { id: "esperando_respuesta", label: "Esperando respuesta" },
];

export type Datos = { fecha?: string; hora?: string; nota?: string; paso?: string; monto?: string | number; fechaCita?: string };
// Qué falta para poder guardar ("" = listo)
// ¿Tiene una promesa de pago identificable (activa o vencida)?
export const tienePromesa = (rec: any) => !!String(rec?.promesa?.fecha || "").trim();
// Resultados que se pueden elegir para este registro.
export const resultadosPara = (esp: Especialidad, rec: any) =>
  RESULTADOS[esp].filter((r) => !(r.id === "promesa_incumplida" && !tienePromesa(rec)));

export function validarResultado(esp: Especialidad, id: string, d: Datos = {}, rec?: any): string {
  const r = resultadoDe(esp, id);
  if (!r) return "Resultado desconocido.";
  if (id === "promesa_incumplida" && !tienePromesa(rec)) return "Este cliente no tiene una promesa de pago registrada.";
  if (r.requiere === "fecha" && !d.fecha) return "Indica la fecha del próximo contacto.";
  if (r.requiere === "fecha_paso") {
    if (!d.paso) return "Indica el próximo paso.";
    if (!d.fecha) return "Indica la fecha del seguimiento.";
  }
  if (r.requiere === "compromiso" && !d.fecha) return "Indica la fecha prometida de pago.";
  return "";
}

// ── Reclutamiento: etapa del candidato (separada del resultado de llamada) ──
export const ETAPAS = [
  { id: "nuevo", label: "Nuevo" }, { id: "contactado", label: "Contactado" }, { id: "interesado", label: "Interesado" },
  { id: "entrevista_agendada", label: "Entrevista agendada" }, { id: "entrevistado", label: "Entrevistado" },
  { id: "segunda_entrevista", label: "2da entrevista" }, { id: "nuevo_socio", label: "Nuevo socio" },
  { id: "no_contratado", label: "No contratado" }, { id: "no_se_presento", label: "No se presentó" }, { id: "seguimiento", label: "Seguimiento" },
];
// Compatibilidad con el campo viejo `resultado` (no se renombra ni se borra).
const LEGACY_A_ETAPA: Record<string, string> = { "Nuevo socio": "nuevo_socio", "No contratado": "no_contratado", "No se presentó": "no_se_presento", "2da entrevista": "segunda_entrevista" };
// Orden del flujo principal (para que un dato posterior gane a uno anterior).
const FLUJO = ["nuevo", "contactado", "interesado", "seguimiento", "entrevista_agendada", "entrevistado"];
export function etapaDe(r: any): string {
  // 1) Lo que se decide en la pantalla de Reclutamiento (campo `resultado`) manda:
  //    Nuevo socio, No contratado, No se presentó, 2da entrevista.
  if (LEGACY_A_ETAPA[r?.resultado]) return LEGACY_A_ETAPA[r.resultado];
  // 2) Entre la etapa guardada y lo que dicen los datos, gana la más avanzada.
  const deDatos = r?.entrevistado ? "entrevistado" : r?.entrevista_agendada ? "entrevista_agendada"
    : asList(r?.historial).some((h: any) => h?.contacto === true) ? "contactado" : "nuevo";
  const guardada = r?.etapa && FLUJO.includes(r.etapa) ? r.etapa : null;
  if (!guardada) return deDatos;
  return FLUJO.indexOf(guardada) >= FLUJO.indexOf(deDatos) ? guardada : deDatos;
}
// Finales: no vuelven solos a Prioridad. Siguen visibles en Etapas e historial.
// Reactivar = acción explícita en Reclutamiento (volver `resultado` a "Pendiente").
export const ETAPAS_CERRADAS = ["nuevo_socio", "no_contratado", "no_se_presento"];

// ── Aplicar un resultado a un registro (sin mutar) ──────────────────────────
export type Autor = { uid: string; nombre: string };
const genIdLocal = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function aplicarResultado(rec: any, esp: Especialidad, id: string, d: Datos, autor: Autor, now = new Date()): any {
  const r = resultadoDe(esp, id);
  if (!r) return rec;
  const iso = now.toISOString(), hoy = diaLocal(now);
  const entrada: any = {
    id: genIdLocal(), tipo: "llamada", fecha: iso, agente: autor.nombre, agenteUid: autor.uid,
    resultadoLlamada: id, contacto: r.contacto, productivo: r.productivo, notas: (d.nota || "").trim(),
  };
  if (d.fecha) entrada.seguimiento = d.fecha + (d.hora ? `T${d.hora}` : "");
  if (d.paso) entrada.proximoPaso = d.paso;
  const out: any = { ...rec, ultimo_llamado: iso, ultimoResultado: id, actualizado: iso };

  // Seguimiento: reprogramar sustituye; cerrar solo con resultado final/meta.
  if (r.requiere === "fecha" || r.requiere === "fecha_paso") {
    out.proximo_seguimiento = d.fecha;
    if (d.hora) out.seguimiento_hora = d.hora; else delete out.seguimiento_hora;
    if (d.paso) out.proximo_paso = d.paso;
  } else if (r.cierra) {
    out.proximo_seguimiento = "";
    delete out.seguimiento_hora; delete out.proximo_paso;
  } // no contestó / buzón / promesa incumplida: el seguimiento abierto se conserva

  if (esp === "cobranza") {
    entrada.tipo = "gestion";
    if (id === "compromiso_pago") {
      const monto = Number(d.monto) || 0;
      out.promesa = { fecha: d.fecha, hora: d.hora || "", monto };                 // formato de Cobranza
      out.historial = [...asList(rec.historial), { fecha: hoy, monto, metodo: `para ${d.fecha} ${d.hora || ""}`.trim(), tipo: "promesa" }];
      out.proximo_seguimiento = d.fecha;                                          // se llama ese día
      delete out.promesa_incumplida;
      entrada.compromiso = { fecha: d.fecha, monto };
    }
    if (id === "promesa_incumplida") {
      out.promesa = null;
      out.historial = [...asList(rec.historial), { fecha: hoy, monto: 0, metodo: "", tipo: "promesa_rota" }];
      out.promesa_incumplida = iso;                                               // vuelve a prioridad ya
    }
    if (id === "pago_informado") { out.pago_informado = iso; delete out.promesa_incumplida; }
    if (id === "numero_equivocado") out.telefono_invalido = true;
    out.gestiones = [...asList(rec.gestiones), entrada];
    return out;
  }

  out.historial = [...asList(rec.historial), entrada];
  if (esp === "ventas") {
    if (r.estado) out.estado = r.estado;
    if (id === "numero_equivocado") out.telefono_invalido = true;
    if (id === "cita_agendada" && d.fechaCita) out.ultima_cita_programada = d.fechaCita.slice(0, 16);
  }
  if (esp === "reclutamiento") {
    if (r.etapa) out.etapa = r.etapa;
    else if (r.contacto && etapaDe(rec) === "nuevo") out.etapa = "contactado";
    if (id === "entrevista_agendada" && d.fechaCita) out.entrevista_agendada = d.fechaCita; // lo que lee Reclutamiento → Entrevistas
    if (id === "no_interesado") out.cerrado = "no_interesado";
    if (id === "numero_equivocado") { out.cerrado = "numero_equivocado"; out.telefono_invalido = true; }
  }
  return out;
}

// Completar explícitamente un seguimiento (sin llamada nueva).
export function completarSeguimiento(rec: any, esp: Especialidad, autor: Autor, now = new Date()): any {
  const iso = now.toISOString();
  const entrada = { id: genIdLocal(), tipo: "seguimiento_completado", fecha: iso, agente: autor.nombre, agenteUid: autor.uid, seguimiento: rec.proximo_seguimiento || "" };
  const out: any = { ...rec, proximo_seguimiento: "", actualizado: iso };
  delete out.seguimiento_hora; delete out.proximo_paso;
  if (esp === "cobranza") out.gestiones = [...asList(rec.gestiones), entrada];
  else out.historial = [...asList(rec.historial), entrada];
  return out;
}

// Nota (mismo criterio que agregarNota de App.tsx; un texto viejo cuenta como UNA nota).
export function agregarNotaV2(rec: any, texto: string, autor: Autor, esp: Especialidad, now = new Date()): any {
  const t = (texto || "").trim();
  if (!t) return rec;
  const iso = now.toISOString();
  if (esp === "reclutamiento" || esp === "cobranza") {
    // En estas bases `notas` es texto libre de su pantalla: la nota va al historial de gestiones.
    const campo = esp === "cobranza" ? "gestiones" : "historial";
    return { ...rec, ultimaNota: t, actualizado: iso, [campo]: [...asList(rec[campo]), { id: genIdLocal(), tipo: "nota", fecha: iso, agente: autor.nombre, agenteUid: autor.uid, notas: t }] };
  }
  const previas = typeof rec.notas === "string" ? (rec.notas.trim() ? [{ texto: rec.notas.trim(), fecha: "", agente: "", legado: true }] : []) : asList(rec.notas);
  return { ...rec, ultimaNota: t, actualizado: iso, notas: [...previas, { texto: t, fecha: iso, agente: autor.nombre, agenteUid: autor.uid }] };
}

// ── Última nota a mostrar ───────────────────────────────────────────────────
// 1) ultimaNota explícita · 2) notas en texto (legacy) · 3) última nota válida de
// notas[] (por fecha; a igual fecha, la posición) · 4) última entrada del
// historial con nota. Solo calcula: nunca modifica el registro.
const textoNota = (n: any) => (typeof n === "string" ? n : (n && (n.texto || n.notas || n.nota)) || "").toString().trim();
export function ultimaNotaDe(r: any): string {
  if (typeof r?.ultimaNota === "string" && r.ultimaNota.trim()) return r.ultimaNota.trim();
  if (typeof r?.notas === "string" && r.notas.trim()) return r.notas.trim();
  const ultimaDe = (lista: any[]) => lista
    .map((n, i) => ({ t: textoNota(n), f: String((n && n.fecha) || ""), i }))
    .filter((x) => x.t)
    .sort((a, b) => (a.f === b.f ? a.i - b.i : a.f.localeCompare(b.f)))
    .pop()?.t || "";
  return ultimaDe(asList(r?.notas)) || ultimaDe(asList(r?.historial)) || ultimaDe(asList(r?.gestiones));
}

// ── Bandeja: registros de trabajo de cada especialidad ──────────────────────
export type Item = {
  key: string; section: string; recId: string; refIdx?: number; raw: any;
  nombre: string; telefono: string; ciudad: string; cp: string; direccion: string;
  fuente: string; anfitrion?: string; estado: string; ultimaNota: string; ultimoContacto: string;
  proximo: string; promesa?: string; etapa?: string; cerrado: boolean; invalido: boolean;
  sinDatos?: boolean;   // cuenta de cobranza sin nombre ni teléfono: no entra a la cola (no hay a quién llamar)
};
const FUENTE: Record<string, string> = { agregados: "Agregado", referidos: "Referido", prospectos: "Prospección", distribucion: "Distribución", cobranza: "Cobranza", reclutamiento: "Reclutamiento" };
const vivos = (a: any) => asList(a).filter((r: any) => r && !r.eliminado);
const mio = (uid: string) => (r: any) => r.assignedTo === uid;

function itemDe(r: any, section: string, extra: Partial<Item> = {}): Item {
  const hist = section === "cobranza" ? asList(r.gestiones) : asList(r.historial);
  const ultimo = [r.ultimo_llamado || "", ...hist.map((h: any) => h?.fecha || ""), lastContactAt(r)].sort().pop() || "";
  const ultNota = ultimaNotaDe(r);
  const estado = r.estado || "sin_estado";
  const cerrado = section === "reclutamiento"
    ? (!!r.cerrado || ETAPAS_CERRADAS.includes(etapaDe(r)))
    : section === "cobranza" ? false
    : ["rojo", "magenta"].includes(estado);
  return {
    key: `${section}:${r.id}`, section, recId: String(r.id), raw: r,
    nombre: r.nombre || r.anfitrion || "(sin nombre)", telefono: r.telefono || r.tel || "",
    ciudad: r.ciudad || "", cp: r.cp || r.zip || "", direccion: r.direccion || "",
    fuente: FUENTE[section] || section, estado, ultimaNota: ultNota, ultimoContacto: ultimo,
    proximo: r.proximo_seguimiento || "", cerrado, invalido: !!r.telefono_invalido || estado === "numero_equivocado",
    ...extra,
  };
}

export function itemsDe(state: any, esp: Especialidad, uid: string): Item[] {
  if (esp === "ventas") {
    const refs: Item[] = [];
    vivos(state?.referidos).filter(mio(uid)).forEach((anf: any) => asList(anf.referidos).forEach((r: any, idx: number) => {
      if (!r || (!r.nombre && !r.telefono)) return;
      refs.push({ ...itemDe(r, "referidos"), key: `referidos:${anf.id}::${idx}`, recId: String(anf.id), refIdx: idx, anfitrion: anf.anfitrion || "", ciudad: r.ciudad || anf.anfitrion_ciudad || "" });
    }));
    return [
      ...vivos(state?.agregados).filter(mio(uid)).map((r: any) => itemDe(r, "agregados")),
      ...vivos(state?.prospectos).filter(mio(uid)).map((r: any) => itemDe(r, "prospectos")),
      ...vivos(state?.distribucion).filter(mio(uid)).map((r: any) => itemDe(r, "distribucion")),   // Distribución ES ventas
      ...refs,
    ];
  }
  if (esp === "cobranza") {
    // SOLO cuentas de Cobranza. La cuenta es autosuficiente (sus datos de contacto
    // se copian del cliente al migrar/guardar); nunca se lee Distribución (es Ventas).
    return Object.entries(state?.cobranza?.clientesData || {})
      .map(([k, v]: any) => ({ ...v, id: k })).filter((r: any) => !r.eliminado && r.assignedTo === uid)
      .map((c: any) => {
        const telefono = c.telefono || c.tel;
        return itemDe({ ...c, telefono }, "cobranza", { promesa: String(c?.promesa?.fecha || "").slice(0, 10), sinDatos: !c.nombre && !telefono });
      });
  }
  return vivos(state?.reclutamiento).filter(mio(uid)).map((r: any) => itemDe(r, "reclutamiento", { etapa: etapaDe(r) }));
}

// ── Prioridad (con la RAZÓN visible) ────────────────────────────────────────
export type Priorizado = Item & { rank: number; motivo: string; dias?: number };
const nuncaContactado = (it: Item) => !it.ultimoContacto && it.estado === "sin_estado";

export function priorizar(items: Item[], esp: Especialidad, now = new Date()): Priorizado[] {
  const hoy = diaLocal(now), manana = diaLocal(new Date(now.getTime() + 86400000));
  const out: Priorizado[] = [];
  items.forEach((it) => {
    if (it.cerrado || it.invalido || it.sinDatos) return;          // finales / sin persona a quien llamar: fuera de la cola
    const p = it.proximo, r = it.raw;
    // Cobranza: promesas primero
    if (esp === "cobranza") {
      // Hoy dijo que pagó: queda en "Trabajados hoy" y no vuelve a la cola hasta mañana
      // (Cobranza confirma el pago real; saldo y último pago no se tocan).
      if (r.pago_informado && diaDe(r.pago_informado) === hoy) return;
      if (r.promesa_incumplida) return void out.push({ ...it, rank: 1, motivo: "Promesa incumplida" });
      if (it.promesa === hoy && !r.pago_informado) return void out.push({ ...it, rank: 1, motivo: "Promesa de pago hoy" });
      if (it.promesa && it.promesa < hoy && !(r.pago_informado && diaDe(r.pago_informado) >= it.promesa)) {
        const dias = diasEntre(it.promesa, hoy);
        return void out.push({ ...it, rank: 2, dias, motivo: `Promesa vencida · ${dias} día${dias !== 1 ? "s" : ""}` });
      }
    }
    if (esp === "reclutamiento" && r.entrevista_agendada) {
      const de = String(r.entrevista_agendada).slice(0, 10);
      if ((de === hoy || de === manana) && etapaDe(r) === "entrevista_agendada")
        return void out.push({ ...it, rank: 1, motivo: de === hoy ? "Entrevista hoy · confirmar" : "Entrevista mañana · confirmar" });
    }
    if (p && p === hoy) return void out.push({ ...it, rank: 1, motivo: "Seguimiento hoy" });
    if (p && p < hoy) {                                            // SIN tope de días
      const dias = diasEntre(p, hoy);
      return void out.push({ ...it, rank: 2, dias, motivo: `Seguimiento vencido · ${dias} día${dias !== 1 ? "s" : ""}` });
    }
    if (p && p > hoy) return;                                      // agendado a futuro: va en Seguimientos
    if (esp === "ventas" && it.estado === "verde") return;         // ya tiene cita
    if (nuncaContactado(it)) return void out.push({ ...it, rank: 3, motivo: "Nunca llamado" });
    const ult = r.ultimoResultado;
    if (["en_proceso", "interesado", "en_seguimiento", "llamar_despues"].includes(ult) || it.estado === "naranja")
      return void out.push({ ...it, rank: 4, motivo: "En proceso" });
    if (r.workStatus === "recontact" && (!r.assignedAt || (it.ultimoContacto || "") < r.assignedAt))
      return void out.push({ ...it, rank: 5, motivo: "Recontacto" });
    out.push({ ...it, rank: 6, motivo: "Rotación" });
  });
  return out.sort((a, b) =>
    a.rank - b.rank
    || (a.rank === 2 ? (b.dias || 0) - (a.dias || 0) : 0)          // más vencido arriba
    || (a.rank === 3 ? String(b.raw.creado || "").localeCompare(String(a.raw.creado || "")) : 0)
    || (a.ultimoContacto || "").localeCompare(b.ultimoContacto || ""));   // rotación: el más antiguo primero
}

// ── Métricas: intento / contacto efectivo / resultado productivo ────────────
// Solo cuentan entradas registradas como llamada v2 (con resultadoLlamada).
// Un cambio manual de estado NO es una llamada. Entradas viejas → "sin clasificar".
export function clasificar(h: any) {
  if (!h || !["llamada", "gestion"].includes(h.tipo) || !h.resultadoLlamada) return null;
  return { intento: true, contacto: !!h.contacto, productivo: !!h.productivo };
}
export function metricas(items: Item[], uid: string, dia: string) {
  let intentos = 0, contactos = 0, productivos = 0, sinClasificar = 0;
  items.forEach((it) => {
    const hist = it.section === "cobranza" ? asList(it.raw.gestiones) : asList(it.raw.historial);
    hist.forEach((h: any) => {
      if (!h || diaDe(h.fecha) !== dia) return;
      if (h.agenteUid && h.agenteUid !== uid) return;
      const c = clasificar(h);
      if (!c) { if (["llamada", "estado"].includes(h?.tipo)) sinClasificar++; return; }
      if (!h.agenteUid) return;
      intentos++; if (c.contacto) contactos++; if (c.productivo) productivos++;
    });
  });
  return { intentos, contactos, productivos, sinClasificar, conversion: contactos ? Math.round((productivos / contactos) * 100) : 0 };
}

export function kpis(items: Item[], esp: Especialidad, uid: string, now = new Date()) {
  const hoy = diaLocal(now);
  const abiertos = items.filter((i) => !i.cerrado && !i.invalido);
  const m = metricas(items, uid, hoy);
  const segHoy = abiertos.filter((i) => i.proximo === hoy).length;
  const vencidos = abiertos.filter((i) => i.proximo && i.proximo < hoy).length;
  if (esp === "cobranza") {
    const gestionHoy = (i: Item) => asList(i.raw.gestiones).some((g: any) => diaDe(g?.fecha) === hoy);
    return { cartera: items.length, pendientes: abiertos.filter((i) => !gestionHoy(i)).length,
      seguimientosHoy: segHoy + abiertos.filter((i) => i.promesa === hoy && i.proximo !== hoy).length,
      vencidos, productivosHoy: m.productivos, m };
  }
  if (esp === "reclutamiento") {
    return { cartera: items.length, porContactar: abiertos.filter((i) => i.etapa === "nuevo").length,
      seguimientos: segHoy + vencidos, productivosHoy: m.productivos, m };
  }
  return { cartera: items.length, seguimientosHoy: segHoy, vencidos, productivosHoy: m.productivos, m };
}

// ── Estado nuevo SIN tocar el seguimiento (v2) ──────────────────────────────
export const cambiarEstadoV2 = (rec: any, estado: string) => ({ ...rec, estado, actualizado: new Date().toISOString() });

// ════════ FILTROS Y RESUMEN DE CARTERA (pantalla Llamadas v2) ════════
// Todo se calcula sobre itemsDe(...): la cartera REAL asignada. Nunca amplía assignedTo.
export const PAGINA = 40;                                   // resultados por tanda ("Ver más")

export type Filtros = { q?: string; estados?: string[]; resultados?: string[]; ciudades?: string[]; zips?: string[] };
export const sinFiltros = (f: Filtros = {}) => !(f.q || "").trim() && !(f.estados || []).length && !(f.resultados || []).length && !(f.ciudades || []).length && !(f.zips || []).length;

const normTxt = (s: any) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
export const claveCiudad = (s: any) => normTxt(s);
export const zip5 = (s: any) => String(s ?? "").replace(/\D/g, "").slice(0, 5);

// Búsqueda por nombre, teléfono o cuenta (mismo criterio que la pantalla).
export function coincideTexto(it: Item, q: string) {
  const t = normTxt(q), d = String(q || "").replace(/\D/g, "");
  if (!t) return true;
  return normTxt(it.nombre).includes(t) || normTxt(it.ciudad).includes(t)
    || (d.length >= 3 && String(it.telefono || "").replace(/\D/g, "").includes(d))
    || normTxt(it.raw?.cuenta || it.raw?.nroCuenta || it.raw?.numeroCuenta).includes(t);
}

// Zona: ciudades elegidas; si en una ciudad se eligieron ZIPs, esa ciudad se
// limita a esos ZIPs (las demás ciudades elegidas van completas).
function coincideZona(it: Item, ciudades: string[], zips: string[], zipsDeCiudad: Map<string, Set<string>>) {
  const c = claveCiudad(it.ciudad), z = zip5(it.cp);
  if (ciudades.length && !ciudades.includes(c)) return false;
  if (!zips.length) return true;
  if (!ciudades.length) return zips.includes(z);
  // ¿esta ciudad tiene ZIPs elegidos? (un ZIP "pertenece" a las ciudades donde aparece)
  const propios = zipsDeCiudad.get(c) || new Set<string>();
  return zips.includes(z) || !zips.some((zz) => propios.has(zz));
}

// Aplica TODOS los filtros a la vez (intersección). Sin filtros → la misma lista.
export function filtrarItems<T extends Item>(items: T[], f: Filtros = {}): T[] {
  const estados = f.estados || [], resultados = f.resultados || [];
  const ciudades = (f.ciudades || []).map(claveCiudad), zips = (f.zips || []).map(zip5);
  const zipsDeCiudad = new Map<string, Set<string>>();
  items.forEach((it) => { const c = claveCiudad(it.ciudad); if (!zipsDeCiudad.has(c)) zipsDeCiudad.set(c, new Set()); const z = zip5(it.cp); if (z) zipsDeCiudad.get(c)!.add(z); });
  return items.filter((it) =>
    coincideTexto(it, f.q || "")
    && (!estados.length || estados.includes(it.estado || "sin_estado"))          // ESTADO del registro
    && (!resultados.length || resultados.includes(it.raw?.ultimoResultado))     // ÚLTIMO RESULTADO de llamada (otro dato)
    && coincideZona(it, ciudades, zips, zipsDeCiudad));
}

// Conteo por estado sobre el catálogo real (incluye los de 0) + estados fuera de catálogo.
export function conteoEstados(items: Item[], catalogo: string[]) {
  const n: Record<string, number> = {};
  items.forEach((it) => { const e = it.estado || "sin_estado"; n[e] = (n[e] || 0) + 1; });
  const extras = Object.keys(n).filter((e) => !catalogo.includes(e));
  return [...catalogo, ...extras].map((id) => ({ id, n: n[id] || 0 }));
}
export function conteoResultados(items: Item[], esp: Especialidad) {
  return RESULTADOS[esp].map((r) => ({ id: r.id, label: r.label, n: items.filter((it) => it.raw?.ultimoResultado === r.id).length }));
}
// Ciudades (con su nombre como aparece más veces) y sus ZIPs, solo de la cartera dada.
export function opcionesZona(items: Item[]) {
  const m = new Map<string, { nombres: Record<string, number>; n: number; zips: Record<string, number> }>();
  items.forEach((it) => {
    const nombre = String(it.ciudad || "").trim(); const c = claveCiudad(nombre);
    if (!m.has(c)) m.set(c, { nombres: {}, n: 0, zips: {} });
    const g = m.get(c)!; g.n++; g.nombres[nombre || "Sin ciudad"] = (g.nombres[nombre || "Sin ciudad"] || 0) + 1;
    const z = zip5(it.cp); if (z) g.zips[z] = (g.zips[z] || 0) + 1;
  });
  return [...m.entries()].map(([clave, g]) => ({
    clave, nombre: Object.entries(g.nombres).sort((a, b) => b[1] - a[1])[0][0], n: g.n,
    zips: Object.entries(g.zips).map(([zip, n]) => ({ zip, n })).sort((a, b) => b.n - a.n || a.zip.localeCompare(b.zip)),
  })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
}

// ¿Dónde está cada registro de la cartera? Una sola categoría por registro, con precedencia:
// En prioridad > Número inválido > Sin datos > Cerrado > Cita agendada > Seguimiento futuro > Otros
export type Categoria = "prioridad" | "invalido" | "sinDatos" | "cerrado" | "cita" | "seguimientoFuturo" | "otros";
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  prioridad: "para trabajar ahora", invalido: "número inválido", sinDatos: "sin datos", cerrado: "cerrados",
  cita: "con cita", seguimientoFuturo: "seguimiento futuro", otros: "otros",
};
export function categoriaDe(it: Item, enPrioridad: boolean, esp: Especialidad, now = new Date()): Categoria {
  if (enPrioridad) return "prioridad";
  if (it.invalido) return "invalido";
  if (it.sinDatos) return "sinDatos";
  if (it.cerrado) return "cerrado";
  if (esp === "ventas" && it.estado === "verde") return "cita";
  if (it.proximo && it.proximo > diaLocal(now)) return "seguimientoFuturo";
  return "otros";
}
export function resumenCartera(items: Item[], prio: Array<{ key: string }>, esp: Especialidad, now = new Date()) {
  const enPrio = new Set(prio.map((p) => p.key));
  const cuenta: Record<Categoria, number> = { prioridad: 0, invalido: 0, sinDatos: 0, cerrado: 0, cita: 0, seguimientoFuturo: 0, otros: 0 };
  items.forEach((it) => { cuenta[categoriaDe(it, enPrio.has(it.key), esp, now)]++; });
  return { total: items.length, ...cuenta };
}
