import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Only VITE_* keys are exposed to import.meta.env (Vite default).
// Never prefix secrets with VITE_ — e.g. keep CLERK_SECRET_KEY out of the client bundle.
export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
})
