import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to backend during development
      "/api": {
        target:       "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
  },
});
