import { googleAI } from '@genkit-ai/googleai'
import { defineConfig } from 'genkit'

export default defineConfig({
  plugins: [googleAI()],
  logLevel: 'debug',
  enableTracingAndMetrics: false,
})
