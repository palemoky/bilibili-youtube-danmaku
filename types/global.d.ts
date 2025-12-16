/**
 * 全局类型声明
 * 为浏览器扩展 API 和第三方库提供类型定义
 */

// WXT 框架提供的全局函数
declare function defineBackground(callback: () => void): void;
declare function defineContentScript(config: {
    matches: string[];
    cssInjectionMode?: string;
    runAt?: string;
    main: (ctx: any) => void;
}): void;

// Browser API (webextension-polyfill)
declare const browser: typeof chrome;

// OpenCC 库
declare const OpenCC: {
    Converter: (config: { from: string; to: string }) => (text: string) => string;
};

// Protobuf 解析器
declare class ProtobufParser {
    parseDanmakuResponse(buffer: ArrayBuffer): Array<{
        progress: number;
        content: string;
        color?: number;
        mode?: number;
        weight?: number;
    }>;
}
