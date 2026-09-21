// ═══ DIAGNÓSTICO TEMPORAL — solo modo v2 (proyecto de prueba) ══════════════
// Si algo revienta al pintar, muestra el error real en vez de pantalla blanca.
// En producción (ACCESS_V2 apagado) este componente no se usa.
import { Component } from "react";

type S = { error: any; info: any };
export class V2ErrorBoundary extends Component<{ children: any }, S> {
  state: S = { error: null, info: null };
  static getDerivedStateFromError(error: any) { return { error, info: null }; }
  componentDidCatch(error: any, info: any) { this.setState({ error, info }); console.error("[ImpactOS v2]", error, info); }
  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    const texto = `${error?.name || "Error"}: ${error?.message || String(error)}\n\n${error?.stack || ""}\n\nComponente:${info?.componentStack || " (sin datos)"}`;
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFC", padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", background: "#fff", border: "1px solid #FECACA", borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#991B1B", marginBottom: 6 }}>Error de ImpactOS v2 (diagnóstico)</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12, wordBreak: "break-word" }}>{error?.message || String(error)}</div>
          <pre style={{ fontSize: 11, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#F1F5F9", borderRadius: 10, padding: 12, maxHeight: "60vh", overflow: "auto", color: "#334155" }}>{texto}</pre>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { try { navigator.clipboard.writeText(texto); } catch {} }} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #E2E8F0", fontWeight: 700, background: "#fff" }}>Copiar error</button>
            <button onClick={() => location.reload()} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: 0, fontWeight: 700, background: "#2563EB", color: "#fff" }}>Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}
