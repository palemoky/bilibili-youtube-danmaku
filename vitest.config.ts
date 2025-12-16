import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData',
                'lib/',
                '.output/'
            ]
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
            '@/utils': path.resolve(__dirname, './utils'),
            '@/services': path.resolve(__dirname, './services'),
            '@/types': path.resolve(__dirname, './types')
        }
    }
});
