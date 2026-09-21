// ═══ EQUIPO EN TIEMPO REAL (users/ + invitations/ + workspaces/) ═══════════
// Solo lectura desde la app. Crear/cambiar pasa por /api/users.
import { useEffect, useState } from "react";

export type Member = { uid: string; email: string; nombre: string; role: string; appId: string; status: string; lastActiveAt?: string; createdAt?: string };
export type Invitation = { email: string; nombre: string; role: string; appId: string; status: string; createdAt?: string };
export type Workspace = { id: string; nombre?: string; limits?: any; counts?: any };

export function useTeam(getDB: () => Promise<any>, me: { role: string; appId: string } | null, appId: string) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!me || !["super_admin", "distribuidor", "supervisor"].includes(me.role)) return;
    let vivo = true; const unsubs: any[] = [];
    (async () => {
      const db = await getDB();
      const onErr = () => vivo && setError("No se pudo leer el equipo (permisos).");
      unsubs.push(db.collection("users").where("appId", "==", appId).onSnapshot((s: any) => {
        const out: Member[] = []; s.forEach((d: any) => out.push({ uid: d.id, ...d.data() })); vivo && setMembers(out);
      }, onErr));
      unsubs.push(db.collection("invitations").where("appId", "==", appId).where("status", "==", "invited").onSnapshot((s: any) => {
        const out: Invitation[] = []; s.forEach((d: any) => out.push({ email: d.id, ...d.data() })); vivo && setInvitations(out);
      }, onErr));
      const wsQ = me.role === "super_admin" ? db.collection("workspaces") : null;
      if (wsQ) unsubs.push(wsQ.onSnapshot((s: any) => { const out: Workspace[] = []; s.forEach((d: any) => out.push({ id: d.id, ...d.data() })); vivo && setWorkspaces(out); }, onErr));
      else unsubs.push(db.collection("workspaces").doc(appId).onSnapshot((d: any) => vivo && setWorkspaces(d.exists ? [{ id: d.id, ...d.data() }] : []), onErr));
    })();
    return () => { vivo = false; unsubs.forEach((u) => { try { u(); } catch {} }); };
  }, [me?.role, me?.appId, appId]);
  return { members, invitations, workspaces, error };
}
