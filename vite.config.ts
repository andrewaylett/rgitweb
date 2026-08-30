import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A relative base means the built site can be served from any sub-path of a
// static host, which is the whole point of the project.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
