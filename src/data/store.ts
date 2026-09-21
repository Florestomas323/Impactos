// ═══ STORE NUEVO (React + Firestore) — reemplaza a useSharedState en modo v2 ═
// Mismo contrato que useSharedState: [state, setState, synced, fbError, reintentar, hydrated]
// para que App.tsx y los módulos no cambien.
//
//  • Lee con las consultas de queriesFor(): el telemarketing solo recibe lo suyo.
//  • Escribe por DOCUMENTO (no por bloque) con diffState(), agrupando cambios
//    rápidos (tecleo) en una sola escritura cada ~0.5 s.
//  • Nunca normaliza los datos comerciales: lo que llega es lo que se guarda.
import { useCallback, useEffect, useRef, useState } from "react";
import { buildState, diffState, emptyDocs, Docs, Ctx, Op } from "./storeCore";
import { queriesFor } from "./schema";

const STAFF = ["super_admin", "distribuidor", "supervisor"];
const LOTE = 400;
const ESPERA_MS = 500;

let persistenciaPedida = false;
// Debe llamarse ANTES de cualquier lectura con esa instancia de Firestore.
export async function prepareDbV2(db: any) {
  if (persistenciaPedida) return;
  persistenciaPedida = true;
  try { await db.enablePersistence({ synchronizeTabs: true }); } catch { /* otra pestaña o navegador sin soporte: sigue sin caché */ }
}

type User = { uid: string; role: string; appId: string; nombre: string } | null;

async function commitOps(db: any, appId: string, ops: Op[]) {
  const ws = db.collection("workspaces").doc(appId);
  for (let i = 0; i < ops.length; i += LOTE) {
    const b = db.batch();
    ops.slice(i, i + LOTE).forEach((op) => {
      if (op.kind === "set") b.set(ws.collection(op.col).doc(op.id), op.data);
      else if (op.kind === "delete") b.delete(ws.collection(op.col).doc(op.id));
      else if (op.kind === "shared") b.set(ws.collection("shared").doc(op.key), { payload: op.data, updatedAt: new Date().toISOString() });
      else if (op.kind === "userCallLog") b.set(ws.collection("userData").doc(op.uid), { callLog: op.callLog, updatedAt: new Date().toISOString() }, { merge: true });
    });
    await b.commit();
  }
}

export function useV2Store(user: User, getDB: () => Promise<any>, defaults: Record<string, any>) {
  const [state, setLocal] = useState<any>(() => buildState(emptyDocs(), defaults));
  const [synced, setSynced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [fbError, setFbError] = useState("");
  const [tick, setTick] = useState(0);

  const docsRef = useRef<Docs>(emptyDocs());
  const localRef = useRef<any>(state);        // lo que ve la pantalla
  const committedRef = useRef<any>(state);    // última versión alineada con Firestore
  // Versión sobre la que el usuario EMPEZÓ a editar. El diff se hace contra ella,
  // no contra lo último que llegó: así un cambio de otra persona que llega a
  // mitad de tu edición nunca se interpreta como "lo borraste tú".
  const baseRef = useRef<any>(null);
  const timer = useRef<any>(null);
  const flushing = useRef(false);
  const dbRef = useRef<any>(null);

  const ctx = useCallback((): Ctx | null => user ? { uid: user.uid, role: user.role, appId: user.appId, nombre: user.nombre } : null, [user?.uid, user?.role, user?.appId, user?.nombre]);

  const rebuild = useCallback(() => {
    const st = buildState(docsRef.current, defaults);
    committedRef.current = st;
    if (!timer.current && !flushing.current) { localRef.current = st; setLocal(st); }
  }, [defaults]);

  // ── Guardado ──
  const flush = useCallback(async () => {
    timer.current = null;
    const c = ctx(); const db = dbRef.current;
    if (!c || !db || flushing.current) return;
    const prev = baseRef.current ?? committedRef.current, next = localRef.current;
    const { ops, blocked } = diffState(prev, next, docsRef.current, c);
    if (blocked.length) setFbError(`🔒 Tu rol no puede cambiar: ${blocked.slice(0, 3).join(", ")}${blocked.length > 3 ? "…" : ""}`);
    if (!ops.length) { baseRef.current = null; rebuild(); return; }
    flushing.current = true;
    let reintentar = false;
    try {
      await commitOps(db, c.appId, ops);
      // Si siguió editando mientras se guardaba, lo nuevo se compara contra lo recién guardado.
      baseRef.current = localRef.current !== next ? next : null;
      if (!blocked.length) setFbError("");
    } catch (e: any) {
      const denied = String(e?.code || "").includes("permission-denied");
      setFbError(denied
        ? "🔒 Firestore rechazó un cambio (puede que el registro ya no esté asignado a ti). Se recargaron los datos."
        : "⚠️ No se pudo guardar. Se reintentará en unos segundos.");
      if (denied) { baseRef.current = null; }
      else reintentar = true;                      // baseRef se conserva: el reintento manda lo mismo
    } finally {
      flushing.current = false;
      if (reintentar) timer.current = setTimeout(flush, 5000);
      else if (baseRef.current && !timer.current) timer.current = setTimeout(flush, ESPERA_MS);
      if (!timer.current) { const st = buildState(docsRef.current, defaults); committedRef.current = st; localRef.current = st; setLocal(st); }
    }
  }, [ctx, rebuild]);

  const setState = useCallback((fnOrValue: any) => {
    const next = typeof fnOrValue === "function" ? fnOrValue(localRef.current) : fnOrValue;
    if (next === localRef.current) return;
    if (baseRef.current === null) baseRef.current = localRef.current;
    localRef.current = next;
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, ESPERA_MS);
  }, [flush]);

  // Guardar lo pendiente si se cierra la pestaña.
  useEffect(() => {
    const h = () => { if (timer.current) { clearTimeout(timer.current); flush(); } };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [flush]);

  // ── Lectura en tiempo real ──
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const unsubs: Array<() => void> = [];
    const pendientes = new Set<string>();
    const deCache = new Set<string>();
    const porListener: Record<string, Record<string, any>> = {};
    const marcar = (key: string, fromCache: boolean) => {
      pendientes.delete(key);
      if (fromCache) deCache.add(key); else deCache.delete(key);
      if (pendientes.size === 0) { setHydrated(true); if (deCache.size === 0) setSynced(true); }
    };
    const onErr = (key: string) => (e: any) => {
      pendientes.delete(key);
      setFbError(String(e?.code || "").includes("permission-denied")
        ? "⛔ Firestore rechazó la lectura de tus datos. Pide al administrador que revise tu rol."
        : "📡 Se perdió la conexión. Reintentando…");
      if (vivo) setTimeout(() => vivo && setTick((t) => t + 1), 8000);
    };
    (async () => {
      const db = await getDB();
      dbRef.current = db;
      const ws = db.collection("workspaces").doc(user.appId);
      const escuchar = (key: string, q: any, destino: "records" | "appts") => {
        pendientes.add(key);
        unsubs.push(q.onSnapshot({ includeMetadataChanges: false }, (snap: any) => {
          if (!vivo) return;
          const m: Record<string, any> = {};
          snap.forEach((d: any) => { m[d.id] = { ...d.data(), id: d.data()?.id ?? d.id }; });
          porListener[key] = m;
          const todo: Record<string, any> = {};
          Object.keys(porListener).filter((k) => k.startsWith(destino + ":")).forEach((k) => Object.assign(todo, porListener[k]));
          docsRef.current = { ...docsRef.current, [destino]: todo };
          marcar(key, snap.metadata?.fromCache);
          rebuild();
        }, onErr(key)));
      };
      const aplicar = (col: string, specs: ReturnType<typeof queriesFor>) => specs.forEach((s, i) => {
        let q: any = ws.collection(col);
        s.where.forEach(([f, op, v]) => { q = q.where(f, op, v); });
        escuchar(`${col}:${i}`, q, col as any);
      });
      aplicar("records", queriesFor(user, "records"));
      aplicar("appts", queriesFor(user, "appts"));
      // shared: config de la app
      pendientes.add("shared");
      unsubs.push(ws.collection("shared").onSnapshot((snap: any) => {
        const sh: Record<string, any> = {};
        snap.forEach((d: any) => { sh[d.id] = d.data()?.payload; });
        docsRef.current = { ...docsRef.current, shared: sh };
        marcar("shared", snap.metadata?.fromCache); rebuild();
      }, onErr("shared")));
      // userData: staff ve el de todos (conteos del equipo); cada quien, el suyo
      pendientes.add("userData");
      const setUD = (m: Record<string, any>, fromCache: boolean) => { docsRef.current = { ...docsRef.current, userData: m }; marcar("userData", fromCache); rebuild(); };
      if (STAFF.includes(user.role)) {
        unsubs.push(ws.collection("userData").onSnapshot((snap: any) => {
          const m: Record<string, any> = {}; snap.forEach((d: any) => { m[d.id] = d.data(); }); setUD(m, snap.metadata?.fromCache);
        }, onErr("userData")));
      } else {
        unsubs.push(ws.collection("userData").doc(user.uid).onSnapshot((d: any) => setUD(d.exists ? { [user.uid]: d.data() } : {}, d.metadata?.fromCache), onErr("userData")));
      }
    })();
    return () => { vivo = false; unsubs.forEach((u) => { try { u(); } catch {} }); };
  }, [user?.uid, user?.role, user?.appId, tick]);

  const reintentar = useCallback(() => { setFbError("📡 Reintentando conexión…"); setTick((t) => t + 1); }, []);
  return [state, setState, synced, fbError, reintentar, hydrated] as const;
}
