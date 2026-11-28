import solid from "@solidjs/vite-plugin"
import tailwind from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"

/** Preloads the text and code fonts the first paint needs, so Allo is in hand before any text lays out. */
function preloadFonts(): Plugin {
  return {
    name: "tock-preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((file) => /\/(Allo|PaperMono)-[\w-]+\.woff2$/.test(file) && !file.includes("Oblique"))
        return files.map((file) => ({ tag: "link", attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" as const }))
      },
    },
  }
}

export default defineConfig({
  plugins: [solid(), tailwind(), preloadFonts()],
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
