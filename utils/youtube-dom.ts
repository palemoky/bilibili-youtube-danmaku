/**
 * YouTube DOM 操作工具
 * 用于从 YouTube 页面提取视频信息、频道信息等
 */

export interface ChannelInfo {
    channelId: string;
    channelName: string;
    channelAvatar: string;
    success: boolean;
    timestamp: number;
}

export interface BangumiParseResult {
    title: string;
    episode: number;
    isValid: boolean;
}

/**
 * 获取 YouTube 视频 ID
 */
export function getVideoId(): string | null {
    const match = window.location.href.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

/**
 * 获取 YouTube 频道信息（增强版，支持重试）
 */
export async function getChannelInfo(retryCount = 0): Promise<ChannelInfo> {
    try {
        let channelName = '';
        let channelId = '';
        let channelAvatar = '';

        // 统一从频道链接元素获取名称和ID
        const nameSelectors = [
            'yt-formatted-string.ytd-channel-name a',
            '#channel-name .ytd-channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name a',
            'ytd-channel-name a',
            '#owner-sub-count a',
            '.ytd-channel-name a'
        ];

        for (const selector of nameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
                channelName = element.textContent.trim();

                // 同时从该元素获取频道ID
                const href = (element as HTMLAnchorElement).href;
                if (href) {
                    // 优先匹配 @username 格式
                    let match = href.match(/@([^\/\?#]+)/);
                    if (match) {
                        channelId = '@' + match[1];
                    } else {
                        // 备选：匹配 /channel/UC... 格式
                        match = href.match(/channel\/([^\/\?#]+)/);
                        if (match) {
                            channelId = match[1];
                        }
                    }
                }

                if (channelName && channelId) {
                    break;
                }
            }
        }

        // 如果上面没有获取到ID，尝试查找其他包含频道链接的元素
        if (!channelId) {
            const channelElements = Array.from(
                document.querySelectorAll<HTMLAnchorElement>('a[href*="/@"], a[href*="/channel/"]')
            );
            for (const element of channelElements) {
                if (element.href) {
                    let match = element.href.match(/@([^\/\?#]+)/);
                    if (match) {
                        channelId = '@' + match[1];
                        break;
                    } else {
                        match = element.href.match(/channel\/([^\/\?#]+)/);
                        if (match) {
                            channelId = match[1];
                            break;
                        }
                    }
                }
            }
        }

        // 获取频道头像
        const avatarSelectors = [
            '#avatar img',
            '.ytd-video-owner-renderer img',
            'yt-img-shadow img[alt*="avatar"], yt-img-shadow img[alt*="Avatar"]'
        ];

        for (const selector of avatarSelectors) {
            const element = document.querySelector<HTMLImageElement>(selector);
            if (element?.src) {
                channelAvatar = element.src;
                break;
            }
        }

        // 如果信息不完整且重试次数小于2，则重试
        if ((!channelId || !channelName) && retryCount < 2) {
            console.log(`频道信息不完整，${500 * (retryCount + 1)}ms后重试 (${retryCount + 1}/2)`);
            return new Promise((resolve) => {
                setTimeout(
                    () => {
                        resolve(getChannelInfo(retryCount + 1));
                    },
                    500 * (retryCount + 1)
                );
            });
        }

        const result: ChannelInfo = {
            channelId,
            channelName,
            channelAvatar,
            success: !!(channelId && channelName),
            timestamp: Date.now()
        };

        console.log('频道信息获取结果:', {
            channelId,
            channelName,
            channelAvatar: channelAvatar ? '已获取' : '未获取',
            success: result.success,
            retryCount
        });

        return result;
    } catch (error) {
        console.error('获取频道信息失败:', error);
        return {
            channelId: '',
            channelName: '',
            channelAvatar: '',
            success: false,
            timestamp: Date.now()
        };
    }
}

/**
 * 获取视频标题
 */
export function getVideoTitle(): string {
    try {
        const titleSelectors = [
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-video-primary-info-renderer',
            'h1[data-title]',
            '.watch-main-col h1'
        ];

        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element?.textContent?.trim()) {
                return element.textContent.trim();
            }
        }

        // 从页面标题获取（去掉" - YouTube"后缀）
        const pageTitle = document.title;
        if (pageTitle && pageTitle.includes(' - YouTube')) {
            return pageTitle.replace(' - YouTube', '').trim();
        }

        return '';
    } catch (error) {
        console.error('获取视频标题失败:', error);
        return '';
    }
}

/**
 * 通过 oEmbed API 获取原始视频标题
 */
export async function getOriginalVideoTitle(videoId: string): Promise<string | null> {
    try {
        if (!videoId) {
            return null;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;

        console.log('尝试通过oEmbed API获取原始标题:', oembedUrl);

        // 发送请求到background script处理CORS
        const response = await browser.runtime.sendMessage({
            type: 'fetchOriginalTitle',
            oembedUrl,
            videoId
        });

        if (response.success && response.title) {
            console.log('通过oEmbed API获取到原始标题:', response.title);
            return response.title;
        } else {
            console.log('oEmbed API获取标题失败:', response.error || '未知错误');
            return null;
        }
    } catch (error) {
        console.error('获取原始标题失败:', error);
        return null;
    }
}

/**
 * 获取增强的视频标题（优先使用原始标题）
 */
export async function getEnhancedVideoTitle(videoId: string): Promise<string> {
    try {
        const displayedTitle = getVideoTitle();
        const originalTitle = await getOriginalVideoTitle(videoId);

        if (originalTitle && originalTitle !== displayedTitle) {
            console.log('检测到多语言标题差异:', {
                显示标题: displayedTitle,
                原始标题: originalTitle,
                使用: '原始标题'
            });
            return originalTitle;
        }

        console.log('使用显示标题:', displayedTitle);
        return displayedTitle;
    } catch (error) {
        console.error('获取增强标题失败:', error);
        return getVideoTitle();
    }
}

/**
 * 解析番剧标题和集数
 */
export function parseBangumiTitle(videoTitle: string): BangumiParseResult {
    const match = videoTitle.match(/《(.+?)》第(\d+)话：/);
    if (match) {
        return {
            title: match[1].trim(),
            episode: parseInt(match[2]),
            isValid: true
        };
    }
    return { title: '', episode: 0, isValid: false };
}

/**
 * 查找视频容器
 */
export function findVideoContainer(): HTMLElement | null {
    // 最佳目标：直接包裹 <video> 元素的容器
    const videoContainer = document.querySelector<HTMLElement>('.html5-video-container');
    if (videoContainer && videoContainer.offsetHeight > 0) {
        return videoContainer;
    }

    // 备选方案：<video> 元素的直接父元素
    const video = document.querySelector('video');
    if (video?.parentElement && video.parentElement.offsetHeight > 0) {
        return video.parentElement;
    }

    // 最后的备选：旧版播放器ID
    const moviePlayer = document.querySelector<HTMLElement>('#movie_player');
    if (moviePlayer && moviePlayer.offsetHeight > 0) {
        return moviePlayer;
    }

    return null;
}

/**
 * 获取视频元素
 */
export function getVideoElement(): HTMLVideoElement | null {
    return document.querySelector('video');
}

/**
 * 获取视频时长
 */
export function getVideoDuration(): number | null {
    const video = getVideoElement();
    return video ? video.duration : null;
}
