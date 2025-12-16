/**
 * Bilibili API 服务模块
 * 提供视频信息获取、弹幕下载、视频搜索等功能
 */

import { getWbiKeys, encWbi, type WbiKeys } from '../utils/wbi';
import { parseDanmakuData, formatDanmakus, removeAdSegments } from './danmaku-processor';
import type { VideoInfo, DanmakuDownloadResult, RawDanmaku } from '../types';

/**
 * 获取视频信息
 * @param bvid - Bilibili 视频 ID
 * @returns 视频信息对象
 */
export async function getVideoInfo(bvid: string): Promise<VideoInfo> {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    const data = await response.json();

    if (data.code !== 0) throw new Error(`获取视频信息失败: ${data.message}`);
    if (!data.data?.aid || !data.data?.cid) throw new Error('无法获取视频信息');

    return {
        aid: data.data.aid,
        cid: data.data.cid,
        duration: data.data.duration,
        title: data.data.title
    };
}

/**
 * 获取单个分段的弹幕
 * @param cid - 视频 CID
 * @param aid - 视频 AID
 * @param segmentIndex - 分段索引
 * @param wbiKeys - WBI 密钥
 * @returns 原始弹幕数组
 */
export async function getSegmentDanmaku(
    cid: number,
    aid: number,
    segmentIndex: number,
    wbiKeys: WbiKeys
): Promise<RawDanmaku[]> {
    const params = {
        type: 1,
        oid: cid,
        segment_index: segmentIndex,
        pid: aid,
        web_location: 1315873,
        wts: Math.round(Date.now() / 1000)
    };

    const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
    const url = `https://api.bilibili.com/x/v2/dm/wbi/web/seg.so?${query}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return parseDanmakuData(buffer);
}

/**
 * 下载所有弹幕
 * @param bvid - Bilibili 视频 ID
 * @param youtubeVideoDuration - YouTube 视频时长（可选）
 * @returns 弹幕下载结果
 */
export async function downloadAllDanmaku(
    bvid: string,
    youtubeVideoDuration?: number
): Promise<DanmakuDownloadResult> {
    try {
        // 1. 获取 WBI Keys
        const wbiKeys = await getWbiKeys();

        // 2. 获取视频信息
        const { cid, duration, aid, title } = await getVideoInfo(bvid);

        // 3. 计算分段数（每段 6 分钟）
        const segmentCount = Math.ceil(duration / 360);

        // 4. 获取所有分段的弹幕
        const allDanmakus: RawDanmaku[] = [];
        for (let i = 1; i <= segmentCount; i++) {
            try {
                const danmakus = await getSegmentDanmaku(cid, aid, i, wbiKeys);
                console.log(`第${i}段弹幕获取成功: ${danmakus.length}条`);
                allDanmakus.push(...danmakus);

                // 延迟避免请求过快
                if (i < segmentCount) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }
            } catch (error) {
                console.error(`获取第${i}段弹幕失败:`, error);
            }
        }

        // 5. 格式化弹幕数据
        console.log(`开始处理 ${allDanmakus.length} 条原始弹幕数据`);
        const formattedDanmakus = formatDanmakus(allDanmakus);

        // 6. 移除广告片段弹幕
        const processedDanmakus = await removeAdSegments(
            formattedDanmakus,
            bvid,
            youtubeVideoDuration
        );

        return {
            danmakus: processedDanmakus,
            title: title,
            duration: duration
        };
    } catch (error) {
        throw error;
    }
}
