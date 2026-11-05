import { defineConfig } from 'vite'

export default defineConfig({
    server: { port: 5173, host: true },
    // Phaser is one big chunk by design.
    build: { chunkSizeWarningLimit: 1600 },
})
