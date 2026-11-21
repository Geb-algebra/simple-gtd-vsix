import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  optimizeDeps: {
    include: [
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/input",
      "@base-ui/react/popover",
      "class-variance-authority",
      "clsx",
      "localforage",
      "lucide-react",
      "react-day-picker",
      "tailwind-merge",
      "zod",
    ],
  },
});
