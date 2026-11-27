import solid from "@solidjs/vite-plugin"
import tailwind from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [solid(), tailwind()],
  optimizeDeps: { exclude: ["@ui-sdk/core"] },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787", "/ws": { target: "ws://localhost:8787", ws: true } },
  },
  build: {
    target: "es2024",
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "solid", test: /node_modules[\\/](solid-js|@solidjs)/ },
            { name: "ui", test: /node_modules[\\/]@ui-sdk/ },
            { name: "content", test: /node_modules[\\/](marked|sugar-high)/ },
          ],
        },
      },
    },
  },
})
