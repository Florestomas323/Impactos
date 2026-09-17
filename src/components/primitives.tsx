import { RP, SERIF } from "../theme";

export const inpLight = "w-full rounded-xl px-3.5 py-2.5 text-sm bg-[#0B0E12] text-[#F4F4F1] border border-white/12 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition placeholder:text-[#717680]";

export function PrimaryBtn({ children, onClick, type, disabled, full }) {
  return (
    <button type={type||"button"} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold tracking-tight hover:brightness-95 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none ${full?"w-full":""}`}
      style={{background:RP.btn,color:RP.btnText}}>{children}</button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" style={{background:RP.navy,border:`1px solid ${RP.silver2}`}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-extrabold tracking-tight text-[#F4F4F1]" style={{fontFamily:SERIF}}>{title}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-[#A5A9B0] text-2xl transition">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#A5A9B0] mb-1.5">
        {label}{required && <span className="text-[#F87171] ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

