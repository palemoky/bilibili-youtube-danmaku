/**
 * 番剧处理模块
 * 用于搜索和获取 Bilibili 番剧信息
 */

interface BangumiSearchResult {
    season_id: number;
    title: string;
    cover: string;
    areas: string;
    styles: string;
    cv: string;
    desc: string;
    pubtime: string;
    media_id: number;
}

interface BangumiEpisode {
    ep_id: number;
    index: string;
    index_title: string;
    long_title: string;
    cover: string;
    duration: number;
    cid: number;
    aid: number;
    bvid: string;
}

interface BangumiEpisodeDetail {
    cid: number;
    aid: number;
    bvid: string;
    ep_id: number;
    season_id: number;
    title: string;
    long_title: string;
    cover: string;
    duration: number;
}

/**
 * 搜索番剧
 * @param keyword - 搜索关键词
 * @returns 番剧搜索结果数组
 */
export async function searchBilibiliBangumi(keyword: string): Promise<BangumiSearchResult[]> {
    try {
        const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=${encodeURIComponent(keyword)}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.bilibili.com/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.message || '搜索失败');
        }

        const results = data.data?.result || [];

        return results.map((item: any) => ({
            season_id: item.season_id,
            title: item.title?.replace(/<[^>]*>/g, '') || '', // 移除HTML标签
            cover: item.cover || '',
            areas: item.areas || '',
            styles: item.styles || '',
            cv: item.cv || '',
            desc: item.desc || '',
            pubtime: item.pubtime || '',
            media_id: item.media_id || 0
        }));
    } catch (error) {
        console.error('搜索番剧失败:', error);
        throw error;
    }
}

/**
 * 根据集数查找番剧剧集
 * @param seasonId - 番剧 season_id
 * @param episodeNumber - 集数（如 "1", "2"）
 * @returns 剧集信息或 null
 */
export async function findEpisodeByNumber(
    seasonId: number,
    episodeNumber: string
): Promise<BangumiEpisode | null> {
    try {
        const url = `https://api.bilibili.com/pgc/web/season/section?season_id=${seasonId}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.bilibili.com/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.message || '获取剧集列表失败');
        }

        // 从主剧集列表中查找
        const mainSection = data.result?.main_section;
        if (mainSection?.episodes) {
            const episode = mainSection.episodes.find(
                (ep: any) => ep.title === episodeNumber || ep.index === episodeNumber
            );
            if (episode) {
                return {
                    ep_id: episode.id,
                    index: episode.title,
                    index_title: episode.index_title || '',
                    long_title: episode.long_title || '',
                    cover: episode.cover || '',
                    duration: episode.duration || 0,
                    cid: episode.cid,
                    aid: episode.aid,
                    bvid: episode.bvid || ''
                };
            }
        }

        // 从其他section中查找
        const sections = data.result?.section || [];
        for (const section of sections) {
            if (section.episodes) {
                const episode = section.episodes.find(
                    (ep: any) => ep.title === episodeNumber || ep.index === episodeNumber
                );
                if (episode) {
                    return {
                        ep_id: episode.id,
                        index: episode.title,
                        index_title: episode.index_title || '',
                        long_title: episode.long_title || '',
                        cover: episode.cover || '',
                        duration: episode.duration || 0,
                        cid: episode.cid,
                        aid: episode.aid,
                        bvid: episode.bvid || ''
                    };
                }
            }
        }

        return null;
    } catch (error) {
        console.error('查找剧集失败:', error);
        throw error;
    }
}

/**
 * 获取番剧剧集详细信息
 * @param epId - 剧集 ep_id
 * @returns 剧集详细信息
 */
export async function getBangumiEpisodeDetail(epId: number): Promise<BangumiEpisodeDetail> {
    try {
        const url = `https://api.bilibili.com/pgc/view/web/season?ep_id=${epId}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.bilibili.com/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.message || '获取剧集详情失败');
        }

        const result = data.result;
        const episodes = result.episodes || [];
        const currentEpisode = episodes.find((ep: any) => ep.id === epId);

        if (!currentEpisode) {
            throw new Error('未找到当前剧集信息');
        }

        return {
            cid: currentEpisode.cid,
            aid: currentEpisode.aid,
            bvid: currentEpisode.bvid || '',
            ep_id: epId,
            season_id: result.season_id,
            title: result.title || '',
            long_title: currentEpisode.long_title || '',
            cover: currentEpisode.cover || result.cover || '',
            duration: currentEpisode.duration || 0
        };
    } catch (error) {
        console.error('获取剧集详情失败:', error);
        throw error;
    }
}
