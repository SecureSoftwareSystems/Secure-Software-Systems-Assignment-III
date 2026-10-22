import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/exclusions": "http://localhost:3000",
      "/api/integrity": {
        target: "http://127.0.0.1:4002",
        rewrite: (path) => path.replace(/^\/api\/integrity/, ""),
      },
    },
  },
})
