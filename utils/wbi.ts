/**
 * Bilibili WBI 签名工具模块
 * 用于生成 Bilibili API 请求所需的 WBI 签名
 */

import { md5 } from './crypto';

/** WBI Keys 接口 */
export interface WbiKeys {
    img_key: string;
    sub_key: string;
}

/** WBI 签名参数类型 */
export type WbiParams = Record<string, string | number | boolean | undefined | null>;

// WBI 签名相关配置
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

/**
 * 对 imgKey 和 subKey 进行字符顺序打乱编码
 * @param orig - 原始字符串
 * @returns 编码后的 mixin key
 */
export function getMixinKey(orig: string): string {
    return mixinKeyEncTab
        .map((n) => orig[n])
        .join('')
        .slice(0, 32);
}

/**
 * 为请求参数进行 WBI 签名
 * @param params - 请求参数对象
 * @param img_key - 图片密钥
 * @param sub_key - 子密钥
 * @returns 签名后的查询字符串
 */
export function encWbi(params: WbiParams, img_key: string, sub_key: string): string {
    const mixin_key = getMixinKey(img_key + sub_key);
    const curr_time = Math.round(Date.now() / 1000);
    const chr_filter = /[!'()*]/g;

    const safeParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            safeParams[key] = String(value).replace(chr_filter, '');
        }
    }

    safeParams.wts = String(curr_time);

    const query = Object.keys(safeParams)
        .sort()
        .map((key) => {
            return `${encodeURIComponent(key)}=${encodeURIComponent(safeParams[key])}`;
        })
        .join('&');

    const wbi_sign = md5(query + mixin_key);
    return query + '&w_rid=' + wbi_sign;
}

/**
 * 获取最新的 img_key 和 sub_key
 * @returns WBI Keys 对象
 * @throws 如果无法获取 WBI Keys
 */
export async function getWbiKeys(): Promise<WbiKeys> {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com/'
        }
    });

    const data = await response.json();
    if (!data.data?.wbi_img) {
        throw new Error('无法获取WBI Keys');
    }

    const { img_url, sub_url } = data.data.wbi_img;
    const img_key = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
    const sub_key = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));

    return { img_key, sub_key };
}
