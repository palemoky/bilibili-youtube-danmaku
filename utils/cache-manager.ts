/**
 * 缓存管理器
 * 使用 LRU 策略管理 API 请求缓存
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
    maxSize?: number; // Maximum number of entries
}

export class CacheManager<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private accessOrder: string[] = [];
    private ttl: number;
    private maxSize: number;

    constructor(options: CacheOptions = {}) {
        this.ttl = options.ttl || 5 * 60 * 1000; // Default 5 minutes
        this.maxSize = options.maxSize || 100; // Default 100 entries
    }

    /**
     * 设置缓存
     */
    set(key: string, data: T, customTtl?: number): void {
        const now = Date.now();
        const ttl = customTtl || this.ttl;

        // 如果已存在，先移除旧的访问记录
        if (this.cache.has(key)) {
            this.accessOrder = this.accessOrder.filter((k) => k !== key);
        }

        // 添加新条目
        this.cache.set(key, {
            data,
            timestamp: now,
            expiresAt: now + ttl
        });

        // 更新访问顺序
        this.accessOrder.push(key);

        // LRU 淘汰
        if (this.cache.size > this.maxSize) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
    }

    /**
     * 获取缓存
     */
    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // 检查是否过期
        if (Date.now() > entry.expiresAt) {
            this.delete(key);
            return null;
        }

        // 更新访问顺序（LRU）
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
        this.accessOrder.push(key);

        return entry.data;
    }

    /**
     * 删除缓存
     */
    delete(key: string): void {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * 获取缓存大小
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * 清理过期缓存
     */
    cleanup(): number {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * 获取缓存统计信息
     */
    stats(): {
        size: number;
        maxSize: number;
        ttl: number;
        oldestEntry: number | null;
        newestEntry: number | null;
    } {
        const entries = Array.from(this.cache.values());
        const timestamps = entries.map((e) => e.timestamp);

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
            newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null
        };
    }
}

// 创建全局缓存实例
export const wbiKeysCache = new CacheManager<{ img_key: string; sub_key: string }>({
    ttl: 60 * 60 * 1000, // 1 hour
    maxSize: 10
});

export const videoInfoCache = new CacheManager<any>({
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 50
});

export const searchResultsCache = new CacheManager<any>({
    ttl: 10 * 60 * 1000, // 10 minutes
    maxSize: 30
});
