import solid from "@solidjs/vite-plugin";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    lib: { entry: resolve(import.meta.dirname, "src/index.ts"), formats: ["es"], fileName: "index", cssFileName: "styles" },
    outDir: resolve(import.meta.dirname, "dist"),
    rollupOptions: { external: ["solid-js", "@solidjs/web"] },
  },
});
