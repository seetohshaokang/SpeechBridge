import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Client-safe env vars use stable names (no VITE_ prefix). Only keys matching
// these prefixes are exposed to import.meta.env — not the whole process env.
export default defineConfig({
  plugins: [react()],
  // CLERK_PUBLISHABLE_* only — avoids exposing CLERK_SECRET_KEY from .env to the client
  envPrefix: ['CONVEX_', 'API_', 'CLERK_PUBLISHABLE_'],
})
