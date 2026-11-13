import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The demo is hosted at https://screener.godvig.com/
  base: "/",
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.PORT ?? 8787}` },
  },
});
