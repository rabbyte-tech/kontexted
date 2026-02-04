import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

/**
 * Vite configuration for Kontexted client
 */
export default defineConfig({
  plugins: [
    react(),
    tanstackRouter({
      routesDirectory: "./src/router/routes",
      generatedRouteTree: "./src/router/routeTree.gen.ts",
    }),
  ],

  // Path aliases
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API requests to local server in development
      "/api": {
        target: "http://localhost:4242",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      // Proxy WebSocket for collaboration
      "/ws": {
        target: "ws://localhost:4242",
        ws: true,
      },
    },
  },

  // Preview server configuration
  preview: {
    port: 4173,
    host: true,
  },

  // Build configuration
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          "react-vendor": ["react", "react-dom"],
          "state-vendor": ["@tanstack/react-query"],
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ["react", "react-dom"],
  },

  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
});
