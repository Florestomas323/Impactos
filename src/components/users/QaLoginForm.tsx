// ═══ ACCESO QA — correo + contraseña (SOLO entorno de prueba) ══════════════
// Se muestra debajo del botón de Google únicamente si QA_LOGIN está encendido
// (ver src/config/flags.ts). Después de entrar, la cuenta pasa por el MISMO
// resolveAccess que los usuarios de Google: users/{uid} o su invitación.
import { useState } from "react";

export function QaLoginForm({ onSubmit, busy }: { onSubmit: (email: string, password: string) => void; busy: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const listo = email.trim() !== "" && password !== "" && !busy;
  return (
    <form
      className="mt-5 pt-4 border-t border-dashed border-[#F59E0B]/50"
      onSubmit={(e) => { e.preventDefault(); if (listo) onSubmit(email.trim(), password); }}
    >
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#B45309] text-center">Acceso QA · solo entorno de prueba</div>
      <input
        type="email" autoComplete="username" placeholder="Correo" value={email}
        onChange={(e) => setEmail(e.target.value)} disabled={busy}
        className="w-full mb-2 px-3 py-3 rounded-xl text-sm border border-[#E5E7EB] bg-white text-[#111827] outline-none focus:border-[#F59E0B]"
      />
      <input
        type="password" autoComplete="current-password" placeholder="Contraseña" value={password}
        onChange={(e) => setPassword(e.target.value)} disabled={busy}
        className="w-full mb-3 px-3 py-3 rounded-xl text-sm border border-[#E5E7EB] bg-white text-[#111827] outline-none focus:border-[#F59E0B]"
      />
      <button
        type="submit" disabled={!listo}
        className="w-full px-4 py-3 rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40 bg-[#FFFBEB] text-[#92400E] border border-[#FCD34D] hover:bg-[#FEF3C7]"
      >
        {busy ? "Entrando…" : "Entrar con correo (QA)"}
      </button>
    </form>
  );
}
