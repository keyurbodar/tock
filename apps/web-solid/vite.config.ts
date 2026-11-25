import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [tanstackRouter({ target: "solid", autoCodeSplitting: true }), solid()],
  optimizeDeps: {
    exclude: ["@ui-sdk/core"],
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: `http://localhost:${process.env.TOCK_SERVER_PORT ?? 8787}`, ws: true },
      "/ws": { target: `http://localhost:${process.env.TOCK_SERVER_PORT ?? 8787}`, ws: true },
    },
  },
  build: {
    manifest: true,
  },
})
