import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dailyBootPlugin } from "./vite-plugin-daily-boot";

export default defineConfig({
  plugins: [react(), dailyBootPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
