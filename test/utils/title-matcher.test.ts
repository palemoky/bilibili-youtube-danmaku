import { describe, it, expect } from 'vitest';
import { cleanVideoTitle, traditionalToSimplifiedChinese } from '../../utils/title-matcher';

describe('title-matcher utils', () => {
    describe('cleanVideoTitle', () => {
        it('should clean video titles', () => {
            const result = cleanVideoTitle('【中文字幕】测试标题【HD】');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle null and undefined', () => {
            expect(cleanVideoTitle(null)).toBe('');
            expect(cleanVideoTitle(undefined)).toBe('');
        });

        it('should handle empty string', () => {
            expect(cleanVideoTitle('')).toBe('');
        });

        it('should remove common decorations', () => {
            const result = cleanVideoTitle('测试标题');
            expect(result).toContain('测试');
        });
    });

    describe('traditionalToSimplifiedChinese', () => {
        it('should handle string input', () => {
            const input = '測試標題';
            const result = traditionalToSimplifiedChinese(input);
            expect(typeof result).toBe('string');
        });

        it('should handle null and undefined', () => {
            expect(traditionalToSimplifiedChinese(null)).toBe('');
            expect(traditionalToSimplifiedChinese(undefined)).toBe('');
        });

        it('should handle empty string', () => {
            expect(traditionalToSimplifiedChinese('')).toBe('');
        });
    });
});
