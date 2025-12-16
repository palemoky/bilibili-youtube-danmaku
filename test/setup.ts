/**
 * Vitest 测试环境设置
 */

import { vi } from 'vitest';

// Extend global type for browser
declare global {
    var browser: any;
}

// Mock browser API
globalThis.browser = {
    runtime: {
        sendMessage: vi.fn(),
        onMessage: {
            addListener: vi.fn()
        }
    },
    storage: {
        local: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn()
        }
    }
} as any;

// Mock chrome API (for compatibility)
(globalThis as any).chrome = globalThis.browser;
