/**
 * 错误处理工具
 * 统一的错误处理和日志记录
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface ErrorContext {
    component?: string;
    action?: string;
    data?: any;
}

export class ErrorHandler {
    private static logLevel: LogLevel = LogLevel.INFO;
    private static isDevelopment = process.env.NODE_ENV === 'development';

    /**
     * 设置日志级别
     */
    static setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    /**
     * Debug 日志
     */
    static debug(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            console.log(`[DEBUG] ${message}`, data || '');
        }
    }

    /**
     * Info 日志
     */
    static info(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.INFO) {
            console.log(`[INFO] ${message}`, data || '');
        }
    }

    /**
     * Warning 日志
     */
    static warn(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.WARN) {
            console.warn(`[WARN] ${message}`, data || '');
        }
    }

    /**
     * Error 日志
     */
    static error(message: string, error?: Error | unknown, context?: ErrorContext): void {
        if (this.logLevel <= LogLevel.ERROR) {
            const errorInfo = this.formatError(error);
            const contextInfo = context ? ` [${context.component}/${context.action}]` : '';

            console.error(`[ERROR]${contextInfo} ${message}`, errorInfo);

            if (context?.data) {
                console.error('Context data:', context.data);
            }
        }
    }

    /**
     * 格式化错误信息
     */
    private static formatError(error: Error | unknown): string {
        if (error instanceof Error) {
            return this.isDevelopment ? `${error.message}\n${error.stack}` : error.message;
        }
        return String(error);
    }

    /**
     * 处理 API 错误
     */
    static handleApiError(
        error: Error | unknown,
        context: ErrorContext
    ): { success: false; error: string; userMessage: string } {
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.error('API request failed', error, context);

        return {
            success: false,
            error: errorMessage,
            userMessage: this.getUserFriendlyMessage(errorMessage, context)
        };
    }

    /**
     * 获取用户友好的错误消息
     */
    private static getUserFriendlyMessage(error: string, context: ErrorContext): string {
        // 网络错误
        if (error.includes('fetch') || error.includes('network')) {
            return '网络连接失败，请检查网络设置';
        }

        // 超时错误
        if (error.includes('timeout')) {
            return '请求超时，请稍后重试';
        }

        // API 错误
        if (context.component === 'bilibili-api') {
            if (error.includes('404')) {
                return '未找到相关视频';
            }
            if (error.includes('403')) {
                return 'B站API访问受限，请稍后重试';
            }
            if (error.includes('429')) {
                return '请求过于频繁，请稍后重试';
            }
        }

        // 弹幕相关错误
        if (context.action === 'downloadDanmaku') {
            return '弹幕下载失败，请重试';
        }

        // 默认消息
        return '操作失败，请重试';
    }

    /**
     * 安全执行异步函数
     */
    static async safeAsync<T>(
        fn: () => Promise<T>,
        context: ErrorContext,
        fallback?: T
    ): Promise<T | null> {
        try {
            return await fn();
        } catch (error) {
            this.error('Async operation failed', error, context);
            return fallback !== undefined ? fallback : null;
        }
    }

    /**
     * 安全执行同步函数
     */
    static safe<T>(fn: () => T, context: ErrorContext, fallback?: T): T | null {
        try {
            return fn();
        } catch (error) {
            this.error('Sync operation failed', error, context);
            return fallback !== undefined ? fallback : null;
        }
    }

    /**
     * 创建错误响应
     */
    static createErrorResponse(
        message: string,
        error?: Error | unknown
    ): { success: false; error: string } {
        const errorMessage = error instanceof Error ? error.message : String(error || message);
        return {
            success: false,
            error: errorMessage
        };
    }

    /**
     * 记录性能指标
     */
    static logPerformance(operation: string, startTime: number): void {
        const duration = Date.now() - startTime;
        if (duration > 1000) {
            this.warn(`Slow operation: ${operation} took ${duration}ms`);
        } else {
            this.debug(`${operation} completed in ${duration}ms`);
        }
    }
}

// 设置开发环境的日志级别
if (typeof window !== 'undefined' && window.location.hash.includes('#debug')) {
    ErrorHandler.setLogLevel(LogLevel.DEBUG);
}
