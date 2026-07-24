import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

// Standalone build config that bundles a self-contained, single-file
// interactive preview of the mockup screens (for a Hyperagent webpage artifact).
// Unlike vite.config.ts, it does not require PORT/BASE_PATH and statically
// imports the mockups so there are no runtime dynamic-import chunks.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-artifact"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "preview-gallery.html"),
    },
  },
});
