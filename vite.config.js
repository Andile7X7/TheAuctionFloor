import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Must match the repo name: https://<user>.github.io/<repo>/
// If you rename the GitHub repo, update this path.
export default defineConfig({
  plugins: [react()],
  base: '/AuctionFloor/',
})
