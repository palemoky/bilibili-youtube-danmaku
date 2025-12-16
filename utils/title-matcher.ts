/**
 * 视频标题匹配工具模块
 * 提供标题清理、繁简转换、最佳部分选择等功能
 */

// OpenCC 库的类型声明
declare const OpenCC: {
    Converter: (config: { from: string; to: string }) => (text: string) => string;
};

// 初始化 OpenCC 转换器
let openccConverter: ((text: string) => string) | null = null;

try {
    // 创建繁体转简体的转换器
    openccConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
    console.log('OpenCC转换器初始化成功');
} catch (error) {
    console.error('OpenCC转换器初始化失败:', error);
}

/**
 * 判断文本是否为纯英文和数字（去除标点符号后判断）
 * @param text - 要判断的文本
 * @returns 是否为纯英文和数字
 */
export function isPureEnglishOrNumber(text: string | null | undefined): boolean {
    if (!text || typeof text !== 'string') return false;

    // 先去除所有标点符号和特殊字符，只保留字母、数字和空格
    const cleaned = text.replace(/[^\w\s]/g, '');

    // 如果清理后为空，说明只有标点符号
    if (!cleaned.trim()) return false;

    // 判断是否只包含英文字母、数字和空格
    return /^[a-zA-Z0-9\s]*$/.test(cleaned);
}

/**
 * 从多个部分中选择最佳部分
 * @param parts - 标题部分数组
 * @returns 最佳部分
 */
export function selectBestPart(parts: string[]): string {
    if (!parts || parts.length === 0) return '';
    if (parts.length === 1) return parts[0];

    // 分为纯英文数字部分和非纯英文数字部分
    const nonPureEnglishParts = parts.filter((part) => !isPureEnglishOrNumber(part));
    const pureEnglishParts = parts.filter((part) => isPureEnglishOrNumber(part));

    // 优先从非纯英文数字部分中选择最长的
    if (nonPureEnglishParts.length > 0) {
        const bestPart = nonPureEnglishParts.reduce((longest, current) =>
            current.length > longest.length ? current : longest
        );
        console.log(`选择非纯英文数字的最长部分: "${bestPart}"`);
        return bestPart;
    }

    // 如果所有部分都是纯英文数字，则选择最长的
    const bestPart = pureEnglishParts.reduce((longest, current) =>
        current.length > longest.length ? current : longest
    );
    console.log(`所有部分都是纯英文数字，选择最长部分: "${bestPart}"`);
    return bestPart;
}

/**
 * 获取标题的最佳部分（同时处理竖线和空格分割符）
 * @param title - 原始标题
 * @returns 最佳部分
 */
export function getBestTitlePart(title: string | null | undefined): string {
    if (!title || typeof title !== 'string') return title || '';

    // 同时使用竖线和空格作为分隔符进行分割
    const parts = title
        .split(/[｜|\s]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    // 如果分割后只有一个部分或无法分割，返回原标题
    if (parts.length <= 1) {
        return title;
    }

    console.log(`标题分割结果:`, parts);

    // 选择最佳部分
    return selectBestPart(parts);
}

/**
 * 去掉结尾的英文字符（只有去掉后还有内容时才去掉）
 * @param text - 要处理的文本
 * @returns 处理后的文本
 */
export function removeTrailingEnglish(text: string | null | undefined): string {
    if (!text || typeof text !== 'string') return text || '';

    // 匹配结尾的英文字母、数字、空格和常见标点符号
    const trailingEnglishRegex = /[a-zA-Z0-9\s.,!?\-_'\"():;]+$/;
    const match = text.match(trailingEnglishRegex);

    if (match && match.index !== undefined) {
        const withoutTrailing = text.slice(0, match.index).trim();
        // 只有去掉后还有内容时才返回去掉结尾的版本
        if (withoutTrailing.length > 0) {
            console.log(`去掉结尾英文: "${text}" → "${withoutTrailing}"`);
            return withoutTrailing;
        }
    }

    return text; // 原样返回
}

/**
 * 清理视频标题函数
 * @param title - 原始标题
 * @returns 清理后的标题
 */
export function cleanVideoTitle(title: string | null | undefined): string {
    if (!title || typeof title !== 'string') return title || '';

    let cleanedTitle = title;

    // 1. 去除【UP主名】格式的内容
    cleanedTitle = cleanedTitle.replace(/【[^】]*】/g, '');

    // 2. 去除标题开头的【】（可能是其他格式）
    cleanedTitle = cleanedTitle.replace(/^【[^】]*】\s*/g, '');

    // 3. 去除末尾的标签（#标签格式）
    cleanedTitle = cleanedTitle.replace(/\s*#[^\s#]+(\s*#[^\s#]+)*\s*$/g, '');

    // 4. 去除多余的空格并清理首尾
    cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();

    // 5. 如果清理后为空，返回原标题
    if (!cleanedTitle) {
        console.warn('标题清理后为空，返回原标题:', title);
        return title.trim();
    }

    console.log(`标题清理: "${title}" → "${cleanedTitle}"`);
    return cleanedTitle;
}

/**
 * 繁体转简体函数
 * @param text - 繁体中文文本
 * @returns 简体中文文本
 */
export function traditionalToSimplifiedChinese(text: string | null | undefined): string {
    if (!text || typeof text !== 'string') return text || '';

    try {
        // 使用 OpenCC 进行转换
        if (openccConverter) {
            const result = openccConverter(text);
            console.log(`繁简转换: ${text} → ${result}`);
            return result;
        } else {
            console.warn('OpenCC转换器未初始化，返回原文本');
            return text;
        }
    } catch (error) {
        console.error('繁简转换失败:', error);
        return text;
    }
}
