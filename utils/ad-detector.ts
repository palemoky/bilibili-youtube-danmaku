/**
 * 广告检测工具
 * 用于检测 YouTube 视频中的广告状态
 */

/**
 * 检测是否在播放广告
 */
export function detectAd(): boolean {
    try {
        // 方法1: 检查广告容器
        const adContainer = document.querySelector('.video-ads.ytp-ad-module');
        if (adContainer) {
            const adDisplayStyle = window.getComputedStyle(adContainer).display;
            if (adDisplayStyle !== 'none') {
                return true;
            }
        }

        // 方法2: 检查广告播放器
        const adPlayer = document.querySelector('.ad-showing');
        if (adPlayer) {
            return true;
        }

        // 方法3: 检查跳过广告按钮
        const skipButton = document.querySelector(
            '.ytp-ad-skip-button, .ytp-ad-skip-button-modern'
        );
        if (skipButton) {
            return true;
        }

        // 方法4: 检查广告文本
        const adText = document.querySelector('.ytp-ad-text');
        if (adText && window.getComputedStyle(adText).display !== 'none') {
            return true;
        }

        // 方法5: 检查视频播放器类名
        const player = document.querySelector('.html5-video-player');
        if (
            player?.classList.contains('ad-showing') ||
            player?.classList.contains('ad-interrupting')
        ) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('广告检测失败:', error);
        return false;
    }
}

/**
 * 广告状态监控器
 */
export class AdMonitor {
    private interval: number | null = null;
    private lastAdStatus = false;
    private adStartTime: number | null = null;
    private onAdStart?: () => void;
    private onAdEnd?: () => void;

    constructor(options?: { onAdStart?: () => void; onAdEnd?: () => void }) {
        this.onAdStart = options?.onAdStart;
        this.onAdEnd = options?.onAdEnd;
    }

    /**
     * 启动监控
     */
    start(): void {
        this.stop();
        this.lastAdStatus = false;
        this.adStartTime = null;

        this.interval = window.setInterval(() => {
            this.check();
        }, 500);

        console.log('启动广告状态监控...');
    }

    /**
     * 停止监控
     */
    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * 检查广告状态变化
     */
    private check(): void {
        const video = document.querySelector<HTMLVideoElement>('video');
        if (!video) return;

        const currentAdStatus = detectAd();

        if (currentAdStatus !== this.lastAdStatus) {
            if (currentAdStatus) {
                // 广告开始
                this.adStartTime = video.currentTime;
                this.logAdStart(video);
                this.onAdStart?.();
            } else {
                // 广告结束
                this.logAdEnd(video);
                this.onAdEnd?.();
            }
            this.lastAdStatus = currentAdStatus;
        }
    }

    /**
     * 记录广告开始
     */
    private logAdStart(video: HTMLVideoElement): void {
        console.log('🔴 === 广告开始 ===', {
            检测时间: new Date().toLocaleTimeString(),
            视频当前时间: Math.round(video.currentTime * 100) / 100 + 's',
            视频总时长: Math.round(video.duration * 100) / 100 + 's',
            播放速度: video.playbackRate + 'x'
        });
    }

    /**
     * 记录广告结束
     */
    private logAdEnd(video: HTMLVideoElement): void {
        const adDuration = this.adStartTime !== null ? video.currentTime - this.adStartTime : 0;

        console.log('🟢 === 广告结束 ===', {
            检测时间: new Date().toLocaleTimeString(),
            视频当前时间: Math.round(video.currentTime * 100) / 100 + 's',
            广告时长: Math.round(adDuration * 100) / 100 + 's',
            播放速度: video.playbackRate + 'x'
        });
    }

    /**
     * 获取当前广告状态
     */
    isAdPlaying(): boolean {
        return this.lastAdStatus;
    }
}
