import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@models': resolve(__dirname, './src/models'),
      '@services': resolve(__dirname, './src/services'),
      '@routes': resolve(__dirname, './src/routes'),
      '@middleware': resolve(__dirname, './src/middleware'),
      '@utils': resolve(__dirname, './src/utils'),
      '@types': resolve(__dirname, './src/types'),
    },
  },
})
