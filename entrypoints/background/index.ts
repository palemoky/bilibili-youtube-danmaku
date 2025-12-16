/**
 * Background Script - 后台服务脚本
 * 处理弹幕下载、视频搜索、频道关联等后台任务
 */

// 导入番剧处理模块
import { searchBilibiliBangumi, findEpisodeByNumber, getBangumiEpisodeDetail } from './bangumi';
// 导入服务层
import { downloadAllDanmaku } from '../../services/bilibili-api';
import {
    traditionalToSimplifiedChinese,
    cleanVideoTitle,
    getBestTitlePart,
    removeTrailingEnglish
} from '../../utils/title-matcher';
import { getWbiKeys, encWbi } from '../../utils/wbi';
// 引入第三方库
import '../../lib/protobuf-parser.js';
import '../../lib/opencc.min.js';

// 类型定义
import type { PageInfo, BilibiliSearchResult } from '../../types';

interface TabPageState extends PageInfo {
    lastUpdate: number;
}

interface PendingSearchResults {
    results: BilibiliSearchResult[];
    youtubeVideoId: string;
    channelInfo?: { channelId: string; channelName: string };
    videoTitle: string;
    timestamp: number;
}

export default defineBackground(() => {
    // ==================== 页面状态管理 ====================
    const tabPageStates = new Map<number, TabPageState>();

    function getTabPageState(tabId: number): TabPageState | null {
        return tabPageStates.get(tabId) || null;
    }

    function setTabPageState(tabId: number, pageInfo: PageInfo): void {
        tabPageStates.set(tabId, {
            ...pageInfo,
            lastUpdate: Date.now()
        });
        console.log(`更新标签页${tabId}状态:`, pageInfo.videoId);
    }

    function clearTabPageState(tabId: number): void {
        if (tabPageStates.has(tabId)) {
            console.log(`清除标签页${tabId}状态`);
            tabPageStates.delete(tabId);
        }
    }

    // 清理过期的页面状态（30秒过期）
    function cleanupExpiredPageStates(): void {
        const now = Date.now();
        const expireTime = 30000; // 30秒

        for (const [tabId, state] of tabPageStates.entries()) {
            if (now - state.lastUpdate > expireTime) {
                tabPageStates.delete(tabId);
                console.log(`清理过期页面状态: 标签页${tabId}`);
            }
        }
    }

    // 定期清理过期状态
    setInterval(cleanupExpiredPageStates, 60000); // 每分钟清理一次

    // 监听标签页关闭事件
    browser.tabs.onRemoved.addListener((tabId) => {
        clearTabPageState(tabId);
    });

    // ==================== B站空间搜索功能 ====================

    async function searchBilibiliVideo(
        bilibiliUID: string,
        videoTitle: string
    ): Promise<{
        success: boolean;
        results?: BilibiliSearchResult[];
        error?: string;
        searchUrl?: string;
    }> {
        try {
            // 繁体转简体
            const simplifiedTitle = traditionalToSimplifiedChinese(videoTitle);
            // 获取标题最佳部分
            const bestPart = getBestTitlePart(simplifiedTitle);
            // 清理标题
            const cleanedTitle = cleanVideoTitle(bestPart);
            console.log(`搜索标题: ${videoTitle} → ${cleanedTitle}`);

            // 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 构建API参数
            const params = {
                mid: bilibiliUID,
                ps: 30,
                tid: 0,
                pn: 1,
                keyword: cleanedTitle,
                order: 'pubdate',
                web_location: 1550101,
                wts: Math.round(Date.now() / 1000)
            };

            // 生成签名
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const apiUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;

            console.log(`API搜索URL: ${apiUrl}`);

            // 发起API请求
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://www.bilibili.com/',
                    Origin: 'https://www.bilibili.com'
                }
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.message || '未知错误'}`);
            }

            // 解析API响应数据
            const results = parseBilibiliApiResults(data);

            console.log(`搜索到 ${results.length} 个结果`);

            // 优先寻找标题完全包含简化标题的结果
            let finalResults = results;
            if (results.length > 1) {
                console.log(`包含${results.length}个结果，尝试包含匹配`);
                const containsMatch = results.find((result) => result.title.includes(cleanedTitle));
                if (containsMatch) {
                    console.log(`找到包含匹配的标题: ${containsMatch.title}`);
                    finalResults = [containsMatch];
                }
            }

            return {
                success: true,
                results: finalResults,
                searchUrl: apiUrl
            };
        } catch (error) {
            console.error('B站搜索失败:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    // 解析 Bilibili API 结果
    function parseBilibiliApiResults(data: any): BilibiliSearchResult[] {
        const results: BilibiliSearchResult[] = [];

        try {
            const videoList = data.data?.list?.vlist || [];
            console.log(`API返回 ${videoList.length} 个视频`);

            const maxResults = Math.min(videoList.length, 10);

            for (let i = 0; i < maxResults; i++) {
                const video = videoList[i];

                if (video.bvid && video.title) {
                    results.push({
                        bvid: video.bvid,
                        title: video.title,
                        author: video.author || '',
                        duration: video.length || 0,
                        pubdate: video.created || 0,
                        play: video.play || 0
                    });
                }
            }

            // 按发布时间从新到旧排序
            results.sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0));

            console.log(`成功解析 ${results.length} 个视频结果，已按时间排序`);
        } catch (error) {
            console.error('解析API结果失败:', error);
        }

        return results;
    }

    // 搜索B站UP主
    async function searchBilibiliUser(
        keyword: string
    ): Promise<{ success: boolean; results?: any[]; error?: string }> {
        try {
            // 繁体转简体
            const simplifiedKeyword = traditionalToSimplifiedChinese(keyword);
            console.log(`搜索UP主: ${keyword} → ${simplifiedKeyword}`);
            const finalKeyword = removeTrailingEnglish(simplifiedKeyword);

            // 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 构建API参数
            const params = {
                search_type: 'bili_user',
                keyword: finalKeyword,
                page: 1,
                order: '',
                order_sort: '',
                user_type: '',
                web_location: 1430654,
                wts: Math.round(Date.now() / 1000)
            };

            // 生成签名
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const apiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`;

            console.log(`搜索UP主API URL: ${apiUrl}`);

            const response = await fetch(apiUrl, {
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

            const userList = data.data?.result || [];
            const results = userList.slice(0, 10).map((user: any) => ({
                uid: user.mid?.toString() || '',
                name: user.uname || '',
                face: user.upic || '',
                fans: user.fans || 0,
                videos: user.videos || 0,
                sign: user.usign || ''
            }));

            return {
                success: true,
                results
            };
        } catch (error) {
            console.error('搜索UP主失败:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    // ==================== 弹窗结果管理 ====================

    let pendingSearchResults: PendingSearchResults | null = null;
    let pendingNoMatchResults: any = null;

    // 处理多个搜索结果的弹窗显示
    async function handleMultipleResults(request: any): Promise<void> {
        try {
            console.log('处理多个搜索结果弹窗:', request.results.length);

            // 暂存搜索结果，等待popup准备好接收
            pendingSearchResults = {
                results: request.results,
                youtubeVideoId: request.youtubeVideoId,
                channelInfo: request.channelInfo,
                videoTitle: request.videoTitle,
                timestamp: Date.now()
            };

            // 打开popup
            await browser.action.openPopup();
        } catch (error) {
            console.error('打开弹窗失败:', error);
        }
    }

    // ==================== 消息处理 ====================

    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Background收到消息:', request.type);

        // 异步处理消息
        (async () => {
            try {
                switch (request.type) {
                    case 'GET_DANMAKU': {
                        const { bvid, youtubeVideoDuration } = request.data;
                        const result = await downloadAllDanmaku(bvid, youtubeVideoDuration);
                        sendResponse({ success: true, data: result });
                        break;
                    }

                    case 'SEARCH_VIDEO': {
                        const { bilibiliUID, videoTitle } = request.data;
                        const result = await searchBilibiliVideo(bilibiliUID, videoTitle);
                        sendResponse(result);
                        break;
                    }

                    case 'SEARCH_USER': {
                        const { keyword } = request.data;
                        const result = await searchBilibiliUser(keyword);
                        sendResponse(result);
                        break;
                    }

                    case 'SEARCH_BANGUMI': {
                        const { keyword } = request.data;
                        const result = await searchBilibiliBangumi(keyword);
                        sendResponse({ success: true, data: result });
                        break;
                    }

                    case 'GET_BANGUMI_EPISODE': {
                        const { seasonId, episodeNumber } = request.data;
                        const episode = await findEpisodeByNumber(seasonId, episodeNumber);
                        if (episode) {
                            const detail = await getBangumiEpisodeDetail(episode.ep_id);
                            sendResponse({ success: true, data: detail });
                        } else {
                            sendResponse({ success: false, error: '未找到对应集数' });
                        }
                        break;
                    }

                    case 'UPDATE_PAGE_INFO': {
                        if (sender.tab?.id) {
                            setTabPageState(sender.tab.id, request.data);
                            sendResponse({ success: true });
                        }
                        break;
                    }

                    case 'GET_PAGE_INFO': {
                        if (sender.tab?.id) {
                            const pageInfo = getTabPageState(sender.tab.id);
                            sendResponse({ success: true, data: pageInfo });
                        }
                        break;
                    }

                    case 'SHOW_MULTIPLE_RESULTS': {
                        await handleMultipleResults(request.data);
                        sendResponse({ success: true });
                        break;
                    }

                    case 'GET_PENDING_RESULTS': {
                        sendResponse({
                            success: true,
                            data: pendingSearchResults
                        });
                        // 清除已发送的结果
                        pendingSearchResults = null;
                        break;
                    }

                    case 'GET_PENDING_NO_MATCH': {
                        sendResponse({
                            success: true,
                            data: pendingNoMatchResults
                        });
                        pendingNoMatchResults = null;
                        break;
                    }

                    default:
                        sendResponse({ success: false, error: '未知的消息类型' });
                }
            } catch (error) {
                console.error('处理消息时出错:', error);
                sendResponse({
                    success: false,
                    error: (error as Error).message
                });
            }
        })();

        // 返回true表示异步发送响应
        return true;
    });

    console.log('Background script loaded');
});
