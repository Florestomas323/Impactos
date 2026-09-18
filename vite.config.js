import { defineConfig } from "vite";

// Config mínima: solo habilita el acceso del servidor de desarrollo/preview
// desde hosts de sandbox y preview. No altera el build, la lógica de la app
// ni Firebase (Vite ya transforma el JSX vía esbuild por defecto).
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
