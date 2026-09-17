import { RP, SERIF } from "../theme";
import { Msg } from "../iconos";

export const inpLight = "w-full rounded-xl px-3.5 py-2.5 text-base sm:text-sm bg-white text-[#111827] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition placeholder:text-[#94A3B8]";

export function PrimaryBtn({ children, onClick, type, disabled, full }) {
  return (
    <button type={type||"button"} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold tracking-tight hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none ${full?"w-full":""}`}
      style={{background:RP.btn,color:RP.btnText}}>{children}</button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col bg-white border border-[#E2E8F0]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF1F5]">
          <h2 className="text-lg font-extrabold tracking-tight text-[#111827] flex items-center gap-1.5" style={{fontFamily:SERIF}}>{typeof title==="string"?<Msg>{title}</Msg>:title}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-[#667085] text-2xl transition">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085] mb-1.5">
        {label}{required && <span className="text-[#DC2626] ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
