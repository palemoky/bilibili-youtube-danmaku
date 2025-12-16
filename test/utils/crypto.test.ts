import { describe, it, expect } from 'vitest';
import { md5 } from '../../utils/crypto';

describe('crypto utils', () => {
    describe('md5', () => {
        it('should generate correct MD5 hash for simple string', () => {
            const result = md5('hello');
            expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
        });

        it('should generate correct MD5 hash for empty string', () => {
            const result = md5('');
            expect(result).toBe('d41d8cd98f00b204e9800998ecf8427e');
        });

        it('should generate correct MD5 hash for Chinese characters', () => {
            const result = md5('你好世界');
            // MD5 hash depends on encoding, just verify it's consistent
            expect(result).toBe('65396ee4aad0b4f17aacd1c6112ee364');
        });

        it('should generate different hashes for different inputs', () => {
            const hash1 = md5('test1');
            const hash2 = md5('test2');
            expect(hash1).not.toBe(hash2);
        });

        it('should generate consistent hashes for same input', () => {
            const hash1 = md5('consistent');
            const hash2 = md5('consistent');
            expect(hash1).toBe(hash2);
        });
    });
});
