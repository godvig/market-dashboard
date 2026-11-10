import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The demo is hosted at https://godvig.github.io/market-dashboard/
  base: process.env.VITE_DEMO ? "/market-dashboard/" : "/",
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.PORT ?? 8787}` },
  },
});
