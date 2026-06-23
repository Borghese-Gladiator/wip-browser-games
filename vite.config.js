import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Multi-page build: the portal lives at the root, and each game is its own
// page under /games/<id>/. Add a new entry here when you add a new game.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        portal: resolve(__dirname, "index.html"),
        "tic-tac-toe": resolve(__dirname, "games/tic-tac-toe/index.html"),
        poker: resolve(__dirname, "games/poker/index.html"),
        "sheng-ji": resolve(__dirname, "games/sheng-ji/index.html"),
      },
    },
  },
});
