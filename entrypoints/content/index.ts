import './danmaku.css';
import { channelAssociation } from '../../utils/channelAssociation';
import DanmakuEngine from '../../utils/danmaku-engine';
import {
    getVideoId,
    getChannelInfo,
    getEnhancedVideoTitle,
    parseBangumiTitle,
    findVideoContainer,
    getVideoDuration,
    type ChannelInfo
} from '../../utils/youtube-dom';
import { AdMonitor } from '../../utils/ad-detector';

interface PageInfo {
    channel: ChannelInfo;
    videoTitle: string;
    videoId: string;
    timestamp: number;
    url: string;
}

interface DanmakuSettings {
    enabled: boolean;
    timeOffset: number;
    opacity: number;
    fontSize: number;
    speed?: number;
    trackSpacing?: number;
    displayAreaPercentage?: number;
    weightThreshold?: number;
}

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],
    cssInjectionMode: 'manifest',
    runAt: 'document_end',
    main() {
        let danmakuEngine: DanmakuEngine | null = null;
        let currentVideoId: string | null = null;
        let currentPageInfo: PageInfo | null = null;
        const pageInfoCache = new Map<string, PageInfo>();
        let adMonitor: AdMonitor | null = null;

        // 更新当前页面信息
        async function updateCurrentPageInfo(): Promise<PageInfo | null> {
            try {
                const videoId = getVideoId();
                if (!videoId) {
                    console.log('无法获取视频ID');
                    return null;
                }

                // 检查缓存
                if (pageInfoCache.has(videoId)) {
                    const cached = pageInfoCache.get(videoId)!;
                    if (Date.now() - cached.timestamp < 30000) {
                        currentPageInfo = cached;
                        return cached;
                    }
                }

                console.log('更新页面信息:', videoId);

                const channelInfo = await getChannelInfo();
                const videoTitle = await getEnhancedVideoTitle(videoId);

                if (channelInfo.success && videoTitle) {
                    const pageInfo: PageInfo = {
                        channel: channelInfo,
                        videoTitle,
                        videoId,
                        timestamp: Date.now(),
                        url: window.location.href
                    };

                    currentPageInfo = pageInfo;
                    pageInfoCache.set(videoId, pageInfo);

                    browser.runtime
                        .sendMessage({
                            type: 'pageInfoUpdated',
                            pageInfo
                        })
                        .catch((error) => console.log('通知页面信息更新失败:', error));

                    console.log('页面信息更新完成:', {
                        videoId,
                        channelId: channelInfo.channelId,
                        channelName: channelInfo.channelName,
                        videoTitle
                    });

                    return pageInfo;
                } else {
                    console.error('页面信息获取不完整:', { channelInfo, videoTitle });
                    return null;
                }
            } catch (error) {
                console.error('更新页面信息失败:', error);
                return null;
            }
        }

        // 初始化弹幕引擎
        async function initDanmakuEngine(): Promise<void> {
            const container = findVideoContainer();
            if (!container) {
                console.log('未找到视频容器');
                return;
            }

            console.log('找到视频容器:', {
                id: container.id,
                className: container.className,
                width: container.offsetWidth,
                height: container.offsetHeight
            });

            if (danmakuEngine) {
                danmakuEngine.destroy();
            }

            if (adMonitor) {
                adMonitor.stop();
            }

            danmakuEngine = new DanmakuEngine(container);
            await loadSettings();

            const videoId = getVideoId();
            if (videoId) {
                const hasExistingDanmaku = await loadDanmakuForVideo(videoId);

                if (!hasExistingDanmaku) {
                    setTimeout(() => {
                        autoCheckAndDownloadDanmaku();
                    }, 1000);
                }
            }

            startAdStatusMonitoring();
        }

        // 加载设置
        async function loadSettings(): Promise<void> {
            const result = await browser.storage.local.get('danmakuSettings');
            const settings: DanmakuSettings = (result.danmakuSettings as
                | DanmakuSettings
                | undefined) || {
                enabled: true,
                timeOffset: 0,
                opacity: 100,
                fontSize: 24
            };

            if (danmakuEngine) {
                danmakuEngine.updateSettings(settings);
            }
        }

        // 加载视频弹幕
        async function loadDanmakuForVideo(videoId: string): Promise<boolean> {
            try {
                const result = await browser.storage.local.get(videoId);
                const videoData = result[videoId] as { danmakus?: any[] } | undefined;
                if (videoData?.danmakus) {
                    console.log(`加载弹幕数据: ${videoData.danmakus.length} 条`);

                    if (danmakuEngine) {
                        danmakuEngine.loadDanmakus(videoData.danmakus);
                    }
                    return true;
                } else {
                    console.log('没有找到弹幕数据');
                    return false;
                }
            } catch (error) {
                console.error('加载弹幕失败:', error);
                return false;
            }
        }

        // 自动检测并下载弹幕
        async function autoCheckAndDownloadDanmaku(): Promise<void> {
            try {
                const videoId = getVideoId();
                if (!videoId) {
                    console.log('无法获取视频ID，跳过自动检测');
                    return;
                }

                const channelInfo = await getChannelInfo();
                if (!channelInfo.success || !channelInfo.channelId) {
                    console.log('无法获取频道信息，跳过自动检测');
                    return;
                }

                const videoTitle = await getEnhancedVideoTitle(videoId);
                if (!videoTitle) {
                    console.log('无法获取视频标题，跳过自动检测');
                    return;
                }

                // 检查是否为番剧频道
                if (
                    channelInfo.channelId === '@MadeByBilibili' ||
                    channelInfo.channelName === 'MadeByBilibili'
                ) {
                    console.log('检测到番剧频道，执行番剧自动下载逻辑...', {
                        channelId: channelInfo.channelId,
                        channelName: channelInfo.channelName,
                        videoTitle
                    });

                    const parseResult = parseBangumiTitle(videoTitle);
                    if (parseResult.isValid) {
                        console.log('番剧解析成功:', {
                            title: parseResult.title,
                            episode: parseResult.episode
                        });

                        try {
                            const response = await browser.runtime.sendMessage({
                                type: 'downloadBangumiDanmaku',
                                title: parseResult.title,
                                episodeNumber: parseResult.episode,
                                youtubeVideoId: videoId
                            });

                            if (response.success) {
                                console.log(`番剧弹幕自动下载成功: ${response.count} 条`);

                                browser.runtime
                                    .sendMessage({ type: 'cleanupExpiredDanmaku' })
                                    .then(() => console.log('清理成功'))
                                    .catch((error) => console.log('触发清理失败:', error));

                                if (danmakuEngine) {
                                    await loadDanmakuForVideo(videoId);
                                }
                            } else {
                                console.error('番剧弹幕自动下载失败:', response.error);
                            }
                        } catch (error) {
                            console.error('番剧弹幕下载出错:', error);
                        }
                    } else {
                        console.log('番剧标题解析失败，无法自动下载弹幕');
                    }

                    return;
                }

                // 检查频道是否已关联
                const association = await channelAssociation.getChannelAssociation(
                    channelInfo.channelId
                );

                if (!association) {
                    console.log('频道未关联B站UP主，跳过自动检测');
                    return;
                }

                const youtubeVideoDuration = getVideoDuration();
                console.log('YouTube视频长度:', youtubeVideoDuration);

                console.log('检测到已关联频道，自动更新弹幕...', {
                    channelId: channelInfo.channelId,
                    channelName: channelInfo.channelName,
                    videoTitle,
                    bilibiliUID: association.bilibiliUID,
                    youtubeVideoDuration
                });

                const searchResponse = await browser.runtime.sendMessage({
                    type: 'searchBilibiliVideo',
                    bilibiliUID: association.bilibiliUID,
                    videoTitle,
                    youtubeVideoId: videoId,
                    youtubeVideoDuration
                });

                if (searchResponse.success && searchResponse.results.length > 0) {
                    console.log(`找到 ${searchResponse.results.length} 个匹配视频`);

                    if (searchResponse.results.length === 1) {
                        const bvid = searchResponse.results[0].bvid;
                        console.log('只有一个匹配结果，自动下载弹幕:', bvid);

                        const downloadResponse = await browser.runtime.sendMessage({
                            type: 'downloadDanmaku',
                            bvid,
                            youtubeVideoId: videoId,
                            youtubeVideoDuration
                        });

                        if (downloadResponse.success) {
                            console.log(`自动下载弹幕成功: ${downloadResponse.count} 条`);

                            browser.runtime
                                .sendMessage({ type: 'cleanupExpiredDanmaku' })
                                .then(() => console.log('清理成功'))
                                .catch((error) => console.log('触发清理失败:', error));

                            if (danmakuEngine) {
                                await loadDanmakuForVideo(videoId);
                            }
                        } else {
                            console.error('自动下载弹幕失败:', downloadResponse.error);
                        }
                    } else {
                        console.log('找到多个匹配结果，需要用户手动选择');

                        browser.runtime.sendMessage({
                            type: 'showMultipleResults',
                            results: searchResponse.results,
                            youtubeVideoId: videoId,
                            channelInfo,
                            videoTitle
                        });
                    }
                } else {
                    console.log('未找到匹配的B站视频');

                    browser.runtime.sendMessage({
                        type: 'showNoMatchResults',
                        youtubeVideoId: videoId,
                        channelInfo,
                        videoTitle
                    });
                }
            } catch (error) {
                console.error('自动检测弹幕失败:', error);
            }
        }

        // 监听URL变化
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                handleUrlChange();
            }
        }).observe(document, { subtree: true, childList: true });

        // 处理URL变化
        function handleUrlChange(): void {
            const videoId = getVideoId();
            if (videoId && videoId !== currentVideoId) {
                const oldVideoId = currentVideoId;
                currentVideoId = videoId;

                console.log('视频切换:', { from: oldVideoId, to: videoId });

                currentPageInfo = null;
                if (oldVideoId) {
                    pageInfoCache.delete(oldVideoId);
                }

                browser.runtime
                    .sendMessage({
                        type: 'pageChanged',
                        videoId,
                        oldVideoId,
                        url: window.location.href
                    })
                    .catch((error) => console.log('通知页面切换失败:', error));

                setTimeout(async () => {
                    await initDanmakuEngine();
                    await updateCurrentPageInfo();
                }, 1000);
            }
        }

        // 启动广告状态监控
        function startAdStatusMonitoring(): void {
            if (adMonitor) {
                adMonitor.stop();
            }

            let savedOpacity = 100;

            adMonitor = new AdMonitor({
                onAdStart: () => {
                    if (danmakuEngine) {
                        // 保存当前透明度（从storage读取）
                        browser.storage.local.get('danmakuSettings').then((result) => {
                            const settings = result.danmakuSettings as DanmakuSettings | undefined;
                            savedOpacity = settings?.opacity || 100;
                        });
                        danmakuEngine.updateSettings({ opacity: 0 });
                        console.log('💫 隐藏弹幕');
                    }
                },
                onAdEnd: () => {
                    if (danmakuEngine) {
                        danmakuEngine.updateSettings({ opacity: savedOpacity });
                        console.log(`💫 恢复弹幕显示: 透明度 ${savedOpacity}%`);
                    }
                }
            });

            adMonitor.start();
        }

        // 监听来自popup的消息
        browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            if (request.type === 'updateSettings') {
                if (danmakuEngine) {
                    danmakuEngine.updateSettings(request.settings);
                }
            } else if (request.type === 'getVideoDuration') {
                const duration = getVideoDuration();
                sendResponse({ duration });
                return true;
            } else if (request.type === 'loadDanmaku') {
                loadDanmakuForVideo(request.youtubeVideoId);
            } else if (request.type === 'seekToTime') {
                const video = document.querySelector<HTMLVideoElement>('video');
                if (video) {
                    video.currentTime = request.time;
                }
            } else if (request.type === 'getPageInfo') {
                (async () => {
                    try {
                        const videoId = getVideoId();

                        if (currentPageInfo && currentPageInfo.videoId === videoId) {
                            console.log('使用缓存的页面信息');
                            sendResponse({
                                success: true,
                                data: currentPageInfo
                            });
                            return;
                        }

                        console.log('重新获取页面信息...');
                        await updateCurrentPageInfo();

                        if (currentPageInfo) {
                            sendResponse({
                                success: true,
                                data: currentPageInfo
                            });
                        } else {
                            sendResponse({
                                success: false,
                                error: '无法获取页面信息'
                            });
                        }
                    } catch (error) {
                        console.error('获取页面信息失败:', error);
                        sendResponse({
                            success: false,
                            error: (error as Error).message
                        });
                    }
                })();
            }

            return true;
        });

        // 初始化
        const videoId = getVideoId();
        if (videoId) {
            currentVideoId = videoId;
            setTimeout(async () => {
                await initDanmakuEngine();
                await updateCurrentPageInfo();
            }, 1000);
        }

        console.log('Content script loaded');
    }
});
