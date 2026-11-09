import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The markdown docs live one level up (../01-JavaScript, ../02-React, ...).
// They are imported with `?raw`, so Vite must be allowed to read outside the app folder.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
