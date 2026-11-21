import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss()],
  build: {
    outDir: "../extension/dist/webview",
    emptyOutDir: true,
    rollupOptions: { input: "webview.html" },
  },
});
