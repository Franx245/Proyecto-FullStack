import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const apiPort = Number(process.env.API_PORT || 3001);
const storePort = Number(process.env.STORE_PORT || 5173);

export default defineConfig({
  logLevel: "error",

  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: storePort,
    open: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: storePort,
  },

  build: {
    chunkSizeWarningLimit: 1000,
  },
});