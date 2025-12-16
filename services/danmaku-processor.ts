/**
 * 弹幕处理服务模块
 * 提供弹幕数据解析、过滤和广告片段移除功能
 */

import type { Danmaku, RawDanmaku, AdSegment } from '../types';

// Protobuf 解析器的类型声明
declare const ProtobufParser: {
    new (): {
        parseDanmakuResponse(buffer: ArrayBuffer): RawDanmaku[];
    };
};

/**
 * 解析弹幕数据
 * @param buffer - 弹幕数据的 ArrayBuffer
 * @returns 解析后的原始弹幕数组
 */
export function parseDanmakuData(buffer: ArrayBuffer): RawDanmaku[] {
    const parser = new ProtobufParser();
    return parser.parseDanmakuResponse(buffer);
}

/**
 * 移除广告片段弹幕
 * @param danmakus - 弹幕数组
 * @param bvid - Bilibili 视频 ID
 * @param youtubeVideoDuration - YouTube 视频时长（秒）
 * @returns 处理后的弹幕数组
 */
export async function removeAdSegments(
    danmakus: Danmaku[],
    bvid: string,
    youtubeVideoDuration?: number
): Promise<Danmaku[]> {
    try {
        const response = await fetch(`https://bsbsb.top/api/skipSegments?videoID=${bvid}`, {
            headers: {
                origin: 'chrome-extension://dmkbhbnbpfijhgpnfahfioedledohfja',
                'x-ext-version': '1.1.5'
            }
        });

        // 如果返回 404，表示没有需要跳过的片段
        if (response.status === 404) {
            return danmakus;
        }

        if (!response.ok) {
            console.warn('获取广告片段信息失败:', response.status);
            return danmakus;
        }

        const skipSegments: AdSegment[] = await response.json();

        // 筛选出赞助（sponsor）类型的片段
        const sponsorSegments = skipSegments
            .filter((segment) => segment.category === 'sponsor')
            .map((segment) => segment.segment)
            .sort((a, b) => a[0] - b[0]); // 按开始时间排序

        if (sponsorSegments.length === 0) {
            return danmakus;
        }

        // 获取 bilibili 视频原始长度（取第一个片段的 videoDuration）
        const bilibiliVideoDuration = skipSegments[0]?.videoDuration;

        if (bilibiliVideoDuration && youtubeVideoDuration) {
            const durationDiff = Math.abs(bilibiliVideoDuration - youtubeVideoDuration);

            if (durationDiff <= 5) {
                // 长度相近，YouTube 可能未去 sponsor，跳过处理
                console.log(
                    `YouTube视频长度(${youtubeVideoDuration}s)与bilibili原始长度(${bilibiliVideoDuration}s)相近，跳过sponsor处理`
                );
                return danmakus;
            }

            console.log(
                `YouTube视频长度(${youtubeVideoDuration}s)与bilibili原始长度(${bilibiliVideoDuration}s)差异较大，正常处理sponsor片段`
            );
        }

        console.log(`发现 ${sponsorSegments.length} 个广告片段，开始处理弹幕`);

        let processedDanmakus = [...danmakus];
        let totalRemovedTime = 0;

        // 处理每个广告片段
        for (const [startTime, endTime] of sponsorSegments) {
            const segmentDuration = endTime - startTime;
            const adjustedStartTime = startTime - totalRemovedTime;
            const adjustedEndTime = endTime - totalRemovedTime;

            // 移除广告片段时间范围内的弹幕
            const filteredDanmakus = processedDanmakus.filter(
                (danmaku) => danmaku.time < adjustedStartTime || danmaku.time >= adjustedEndTime
            );

            // 将广告片段之后的弹幕时间轴向前偏移
            const adjustedDanmakus = filteredDanmakus.map((danmaku) => {
                if (danmaku.time >= adjustedEndTime) {
                    return {
                        ...danmaku,
                        time: danmaku.time - segmentDuration
                    };
                }
                return danmaku;
            });

            processedDanmakus = adjustedDanmakus;
            totalRemovedTime += segmentDuration;
        }

        console.log(
            `广告片段处理完成，移除了 ${danmakus.length - processedDanmakus.length} 条弹幕，总计移除时长: ${totalRemovedTime.toFixed(2)}秒`
        );

        return processedDanmakus;
    } catch (error) {
        console.error('处理广告片段时出错:', error);
        return danmakus; // 出错时返回原始弹幕
    }
}

/**
 * 格式化原始弹幕数据
 * @param rawDanmakus - 原始弹幕数组
 * @returns 格式化后的弹幕数组
 */
export function formatDanmakus(rawDanmakus: RawDanmaku[]): Danmaku[] {
    // 过滤无效弹幕
    const validDanmakus = rawDanmakus.filter((d) => {
        const isValid =
            d &&
            typeof d.progress === 'number' &&
            d.content &&
            typeof d.content === 'string' &&
            d.content.trim().length > 0;

        if (!isValid) {
            console.warn('过滤掉无效弹幕:', d);
        }
        return isValid;
    });

    console.log(`过滤后有效弹幕: ${validDanmakus.length} 条`);

    // 格式化弹幕
    const formattedDanmakus = validDanmakus.map((d) => ({
        time: d.progress / 1000, // 转换为秒
        text: d.content,
        color:
            d.color && typeof d.color === 'number'
                ? `#${d.color.toString(16).padStart(6, '0')}`
                : '#ffffff', // 默认白色
        mode: (d.mode === 1 ? 'rtl' : d.mode === 4 ? 'bottom' : 'top') as 'rtl' | 'top' | 'bottom',
        weight: d.weight !== undefined && d.weight !== null ? d.weight : 5 // 添加权重字段，默认 5
    }));

    // 按时间排序
    formattedDanmakus.sort((a, b) => a.time - b.time);

    return formattedDanmakus;
}
