// Pantallas del login v2: verificando / sin invitación / desactivado / error.
import { RP } from "../../theme";

export function AccessScreen({ access, email, onSignOut, onRetry }: { access: any; email: string; onSignOut: () => void; onRetry: () => void }) {
  if (!access) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-[#667085] font-bold text-sm flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-[#E5E7EB] border-t-[#2563EB] rounded-full animate-spin" /> Verificando tu acceso…
        </div>
      </div>
    );
  }
  const txt = access.status === "no_invite"
    ? { t: "Cuenta sin acceso", d: <>El correo <strong>{email}</strong> no tiene invitación en ImpactOS. Pídele a tu distribuidor que te invite con este mismo correo de Google.</> }
    : access.status === "inactive"
    ? { t: "Acceso desactivado", d: <>Tu cuenta <strong>{email}</strong> está {access.user?.status === "suspended" ? "suspendida" : "desactivada"}. Si crees que es un error, habla con tu distribuidor.</> }
    : { t: "No se pudo verificar tu acceso", d: <>{access.message}</> };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]">
      <div className="rounded-2xl p-7 shadow-lg max-w-md w-full text-center bg-white border border-[#E5E7EB]">
        <div className="text-4xl mb-3 opacity-50">🔒</div>
        <div className="text-lg font-extrabold text-[#111827] mb-2">{txt.t}</div>
        <div className="text-sm text-[#667085] mb-5">{txt.d}</div>
        {access.status === "error" && <button onClick={onRetry} className="w-full px-4 py-3 rounded-xl text-sm font-bold mb-2" style={{ background: RP.btn, color: RP.btnText }}>Reintentar</button>}
        <button onClick={onSignOut} className="w-full px-4 py-3 rounded-xl text-sm font-bold text-red-700 bg-red-50 border border-red-200">Cerrar sesión</button>
      </div>
    </div>
  );
}
