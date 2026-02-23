import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O2 CONTRACT MARKER (do not remove)
// O2_VITE_PORT=1420

export const RADCONTROL_VITE_PORT = 1420;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: RADCONTROL_VITE_PORT,
    strictPort: true,
  },
});
