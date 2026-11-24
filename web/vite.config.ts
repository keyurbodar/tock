import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const worker = process.env.TOCK_WORKER_URL ?? "http://localhost:8787"
const hosts = (process.env.TOCK_DEV_HOSTS ?? "").split(",").filter(Boolean)

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: hosts,
    proxy: {
      "/api": { target: worker, changeOrigin: true },
      "/ws": { target: worker, ws: true, changeOrigin: true },
    },
  },
})
