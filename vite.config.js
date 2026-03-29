import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In GitHub Actions, GITHUB_REPOSITORY is "owner/repo" so base matches the real Pages URL.
// Local builds use "/" (fine for vite dev/preview). Deployments use the workflow build.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repoName ? `/${repoName}/` : '/'

export default defineConfig({
  plugins: [react()],
  base,
})
