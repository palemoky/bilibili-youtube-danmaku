/**
 * 弹幕渲染引擎
 * 使用 Web Animations API 实现高性能弹幕渲染
 */

import type { Danmaku } from '../types';

interface DanmakuSettings {
    enabled: boolean;
    timeOffset: number;
    opacity: number;
    fontSize: number;
    speed: number;
    trackSpacing: number;
    displayAreaPercentage: number;
    weightThreshold: number;
}

interface DanmakuTrack {
    top: number;
    items: DanmakuItem[];
}

interface DanmakuItem {
    elem: HTMLDivElement;
    animation: Animation;
    startVideoTime: number;
    baseDuration: number;
    width: number;
    danmaku: Danmaku & { emitted?: boolean };
}

export default class DanmakuEngine {
    private container: HTMLElement;
    private stage: HTMLDivElement | null = null;
    private danmakus: (Danmaku & { emitted?: boolean })[] = [];
    private tracks: DanmakuTrack[] = [];
    private settings: DanmakuSettings;
    private video: HTMLVideoElement | null = null;
    private isStarted = false;
    private lastVideoTime = 0;
    private seekingThreshold = 0.5;
    private isRealSeeking = false;
    private pauseTime = 0;
    private resizeObserver?: ResizeObserver;
    private emittingFrameId: number | null = null;
    private lastEmitTime = 0;
    private lastCleanupTime = 0;

    constructor(container: HTMLElement) {
        this.container = container;
        this.settings = {
            enabled: true,
            timeOffset: 0,
            opacity: 100,
            fontSize: 24,
            speed: 1.0,
            trackSpacing: 8,
            displayAreaPercentage: 100,
            weightThreshold: 0
        };
        this.init();
    }

    private init(): void {
        // 创建弹幕舞台
        this.stage = document.createElement('div');
        this.stage.className = 'bilibili-danmaku-stage';
        this.container.appendChild(this.stage);

        // 查找视频元素
        this.video = document.querySelector('video');
        if (this.video) {
            this.bindVideoEvents();
        }

        // 初始化轨道
        this.initTracks();

        // 监听容器尺寸变化
        this.observeResize();
    }

    private observeResize(): void {
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateStageSize();
                this.initTracks();
            });
            this.resizeObserver.observe(this.container);

            if (this.video) {
                this.resizeObserver.observe(this.video);
            }
        }

        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
    }

    private updateStageSize(): void {
        if (this.stage && this.container) {
            const rect = this.container.getBoundingClientRect();
            console.log(
                '弹幕容器:',
                this.container.className,
                '尺寸:',
                rect.width,
                'x',
                rect.height
            );

            if (window.location.hash === '#debug-danmaku') {
                this.stage.style.border = '2px solid red';
                this.stage.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            }
        }
    }

    private handleFullscreenChange(): void {
        setTimeout(() => {
            console.log('全屏状态变化 - 流畅转换弹幕');
            this.updateStageSize();
            this.initTracks();
        }, 100);
    }

    private initTracks(): void {
        const existingItems: DanmakuItem[] = [];
        if (this.tracks && this.tracks.length > 0) {
            this.tracks.forEach((track) => {
                existingItems.push(...track.items);
            });
        }

        const stageHeight = this.container.offsetHeight;
        const usableHeight = stageHeight * (this.settings.displayAreaPercentage / 100);
        const trackHeight = this.settings.fontSize + this.settings.trackSpacing;
        const trackCount = Math.floor(usableHeight / trackHeight);

        console.log('初始化弹幕轨道:', {
            容器高度: stageHeight,
            可用高度: usableHeight,
            显示区域: this.settings.displayAreaPercentage + '%',
            轨道高度: trackHeight,
            轨道数量: trackCount,
            现有弹幕数量: existingItems.length
        });

        this.tracks = [];
        for (let i = 0; i < trackCount; i++) {
            this.tracks.push({
                top: i * trackHeight,
                items: []
            });
        }

        existingItems.forEach((item) => {
            this.redistributeItemToNewTrack(item, trackHeight);
        });
    }

    private redistributeItemToNewTrack(item: DanmakuItem, trackHeight: number): void {
        if (!item.elem) return;

        const currentTop = parseInt(item.elem.style.top) || 0;
        const trackIndex = Math.floor(currentTop / trackHeight);

        if (trackIndex >= this.tracks.length) {
            item.elem.remove();
            console.log(`弹幕超出显示区域，已移除: ${currentTop}px`);
            return;
        }

        const targetTrack = this.tracks[trackIndex] || this.tracks[0];
        item.elem.style.top = targetTrack.top + 'px';
        targetTrack.items.push(item);

        console.log(`弹幕重新分配: 从${currentTop}px → 轨道${trackIndex} (${targetTrack.top}px)`);
    }

    private bindVideoEvents(): void {
        if (!this.video) return;

        this.lastVideoTime = this.video.currentTime;
        this.pauseTime = 0;

        this.video.addEventListener('play', () => this.start());
        this.video.addEventListener('pause', () => {
            this.pause();
            this.pauseTime = this.video!.currentTime;
            console.log('视频暂停');
        });

        this.video.addEventListener('seeking', () => {
            const currentTime = this.video!.currentTime;
            const timeDiff = Math.abs(
                currentTime - (this.pauseTime > 0 ? this.pauseTime : this.lastVideoTime)
            );

            if (timeDiff > this.seekingThreshold) {
                console.log('真正的拖拽 - 清空弹幕', `时间差: ${timeDiff.toFixed(2)}s`);
                this.isRealSeeking = true;
                this.clear();
                this.resetDanmakuStates();
                this.isStarted = false;
            } else {
                console.log('YouTube内部微调 - 忽略seeking', `时间差: ${timeDiff.toFixed(2)}s`);
                this.isRealSeeking = false;
            }

            this.lastVideoTime = currentTime;
        });

        this.video.addEventListener('seeked', () => {
            if (this.isRealSeeking) {
                console.log('真正拖拽结束 - 重新同步弹幕');
                this.resyncDanmakus();
                if (!this.video!.paused) {
                    this.start();
                }
            }
            this.isRealSeeking = false;
        });

        this.video.addEventListener('ratechange', () => {
            this.handleSpeedChange(this.video!.playbackRate);
        });
    }

    loadDanmakus(danmakus: Danmaku[]): void {
        this.danmakus = danmakus
            .map((d) => ({ ...d, emitted: false }))
            .sort((a, b) => a.time - b.time);
        this.clear();

        if (this.video && !this.video.paused) {
            setTimeout(() => {
                this.resyncDanmakus();
                this.startEmitting();
            }, 100);
        }
    }

    updateSettings(settings: Partial<DanmakuSettings>): void {
        const oldSettings = { ...this.settings };
        this.settings = { ...this.settings, ...settings };

        if (this.stage) {
            this.stage.style.setProperty('--danmaku-font-size', `${this.settings.fontSize}px`);
            this.stage.style.setProperty('--danmaku-opacity', String(this.settings.opacity / 100));
        }

        if (oldSettings.speed !== this.settings.speed) {
            console.log(`弹幕速度变化: ${oldSettings.speed} → ${this.settings.speed}`);
            this.updateAnimationSpeeds();
        }

        this.initTracks();

        if (!this.settings.enabled) {
            this.clear();
            this.pause();
        } else {
            if (oldSettings.weightThreshold !== this.settings.weightThreshold) {
                console.log(
                    `Weight阈值变化: ${oldSettings.weightThreshold} → ${this.settings.weightThreshold}`
                );
                this.rebuildDanmakusAsync();
            } else if (this.video && !this.video.paused) {
                this.start();
            }
        }
    }

    private updateAnimationSpeeds(): void {
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation) {
                    const newDuration = item.baseDuration / this.settings.speed;
                    const currentTime = item.animation.currentTime || 0;
                    const oldDuration = item.animation.effect!.getTiming().duration as number;
                    const progress = (currentTime as number) / oldDuration;

                    item.animation.effect!.updateTiming({ duration: newDuration });
                    item.animation.currentTime = progress * newDuration;
                }
            });
        });
    }

    private rebuildDanmakusAsync(): void {
        requestAnimationFrame(() => {
            console.log('开始异步重建弹幕...');
            this.clear();
            this.resetDanmakuStates();

            if (this.video && !this.video.paused) {
                this.resyncDanmakus();
                this.start();
            }

            console.log('弹幕重建完成');
        });
    }

    start(): void {
        if (!this.settings.enabled) return;

        this.isStarted = true;

        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.animation.playState === 'paused') {
                    item.animation.play();
                }
            });
        });

        this.startEmitting();
    }

    private startEmitting(): void {
        if (this.emittingFrameId) {
            cancelAnimationFrame(this.emittingFrameId);
        }

        this.lastEmitTime = 0;
        this.lastCleanupTime = 0;

        const emitLoop = (currentTime: number) => {
            if (this.isStarted && this.video && !this.video.paused) {
                if (currentTime - this.lastEmitTime >= 500) {
                    this.checkAndEmitDanmakus();
                    this.lastEmitTime = currentTime;
                }

                if (currentTime - this.lastCleanupTime >= 500) {
                    this.cleanup();
                    this.lastCleanupTime = currentTime;
                }
            }

            if (this.isStarted) {
                this.emittingFrameId = requestAnimationFrame(emitLoop);
            }
        };

        this.emittingFrameId = requestAnimationFrame(emitLoop);
    }

    private checkAndEmitDanmakus(): void {
        if (!this.video || !this.settings.enabled) return;

        const currentTime = this.video.currentTime + this.settings.timeOffset;

        const newDanmakus = this.danmakus.filter((d) => {
            if (d.emitted) return false;

            if (this.settings.weightThreshold > 0) {
                const weight = d.weight !== undefined && d.weight !== null ? d.weight : 5;
                if (weight < this.settings.weightThreshold) {
                    return false;
                }
            }

            const timeDiff = d.time - currentTime;
            return timeDiff >= -0.5 && timeDiff <= 1.0;
        });

        newDanmakus
            .sort((a, b) => a.time - b.time)
            .slice(0, 10)
            .forEach((danmaku) => {
                if (!danmaku.emitted) {
                    this.emit(danmaku);
                    danmaku.emitted = true;
                }
            });
    }

    pause(): void {
        this.isStarted = false;

        if (this.emittingFrameId) {
            cancelAnimationFrame(this.emittingFrameId);
            this.emittingFrameId = null;
        }

        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.animation.playState === 'running') {
                    item.animation.pause();
                }
            });
        });
    }

    clear(): void {
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation) {
                    item.animation.cancel();
                }
                if (item.elem) {
                    item.elem.remove();
                }
            });
            track.items = [];
        });

        if (this.stage) {
            this.stage.innerHTML = '';
        }
    }

    private resetDanmakuStates(): void {
        if (this.danmakus && this.danmakus.length > 0) {
            this.danmakus.forEach((danmaku) => {
                danmaku.emitted = false;
            });
            console.log('已重置所有弹幕状态');
        }
    }

    private handleSpeedChange(newRate: number): void {
        console.log(`播放速度变化: ${newRate}x`);

        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.danmaku && this.video) {
                    const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
                    const visualElapsed = (currentVideoTime - item.danmaku.time) / newRate;
                    const progressMs = Math.max(0, visualElapsed * 1000);
                    const duration = item.animation.effect!.getTiming().duration as number;

                    if (progressMs <= duration) {
                        item.animation.currentTime = progressMs;
                    }
                }
            });
        });

        console.log('弹幕位置已根据新播放速度重新计算');
    }

    private calculateVisualElapsed(
        videoTime: number,
        danmakuStartTime: number,
        playbackRate: number
    ): number {
        const realElapsed = videoTime - danmakuStartTime;
        return realElapsed / playbackRate;
    }

    private resyncDanmakus(): void {
        if (!this.video || !this.settings.enabled) return;

        const currentTime = this.video.currentTime + this.settings.timeOffset;

        this.clear();
        this.resetDanmakuStates();

        const activeDanmakus = this.danmakus.filter((d) => {
            const timeDiff = currentTime - d.time;

            if (this.settings.weightThreshold > 0) {
                const weight = d.weight !== undefined && d.weight !== null ? d.weight : 5;
                if (weight < this.settings.weightThreshold) {
                    return false;
                }
            }

            return timeDiff >= -1.0 && timeDiff <= 8.0;
        });

        console.log(
            `重新同步弹幕: 当前时间=${currentTime.toFixed(2)}s, 应显示=${activeDanmakus.length}条`
        );

        activeDanmakus.forEach((danmaku) => {
            const timeDiff = currentTime - danmaku.time;
            if (timeDiff >= 0 && timeDiff <= 8.0) {
                this.emitWithProgress(danmaku, timeDiff);
                danmaku.emitted = true;
            }
        });
    }

    private emitWithProgress(
        danmaku: Danmaku & { emitted?: boolean },
        elapsed: number
    ): DanmakuItem | undefined {
        if (!this.stage || !this.video) return;

        const elem = document.createElement('div');
        elem.textContent = danmaku.text;
        elem.style.color = danmaku.color || '#ffffff';
        elem.style.position = 'absolute';
        elem.style.whiteSpace = 'nowrap';
        elem.style.pointerEvents = 'none';
        elem.style.zIndex = '9999';

        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';
        this.stage.appendChild(elem);

        const danmakuWidth = elem.offsetWidth;
        const stageWidth = this.stage.offsetWidth;

        const baseDuration = 8000;
        const adjustedDuration = baseDuration / this.settings.speed;
        const currentPlaybackRate = this.video.playbackRate || 1.0;

        const animation = elem.animate(
            [
                { transform: `translateX(${stageWidth}px)`, offset: 0 },
                { transform: `translateX(-${danmakuWidth}px)`, offset: 1 }
            ],
            {
                duration: adjustedDuration,
                easing: 'linear',
                fill: 'forwards'
            }
        );

        const visualElapsed = elapsed / currentPlaybackRate;
        const progressMs = visualElapsed * 1000;
        animation.currentTime = Math.max(0, Math.min(progressMs, adjustedDuration));

        const item: DanmakuItem = {
            elem,
            animation,
            startVideoTime: danmaku.time,
            baseDuration,
            width: danmakuWidth,
            danmaku
        };

        track.items.push(item);
        return item;
    }

    private emit(danmaku: Danmaku & { emitted?: boolean }): DanmakuItem | undefined {
        if (!this.stage || !this.video) return;

        const elem = document.createElement('div');
        elem.textContent = danmaku.text;
        elem.style.color = danmaku.color || '#ffffff';
        elem.style.position = 'absolute';
        elem.style.whiteSpace = 'nowrap';
        elem.style.pointerEvents = 'none';
        elem.style.zIndex = '9999';
        elem.style.willChange = 'transform';
        elem.style.transform = 'translate3d(0, 0, 0)';
        elem.style.backfaceVisibility = 'hidden';
        elem.style.perspective = '1000px';

        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';
        this.stage.appendChild(elem);

        const danmakuWidth = elem.offsetWidth;
        const stageWidth = this.stage.offsetWidth;

        const baseDuration = 8000;
        const adjustedDuration = baseDuration / this.settings.speed;

        const animation = elem.animate(
            [
                { transform: `translateX(${stageWidth}px)`, offset: 0 },
                { transform: `translateX(-${danmakuWidth}px)`, offset: 1 }
            ],
            {
                duration: adjustedDuration,
                easing: 'linear',
                fill: 'forwards'
            }
        );

        const item: DanmakuItem = {
            elem,
            animation,
            startVideoTime: this.video.currentTime + this.settings.timeOffset,
            baseDuration,
            width: danmakuWidth,
            danmaku
        };

        track.items.push(item);
        return item;
    }

    private findAvailableTrack(): DanmakuTrack | undefined {
        if (!this.video || !this.stage) return this.tracks[0];

        const stageWidth = this.stage.offsetWidth;
        const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
        const playbackRate = this.video.playbackRate || 1.0;

        for (const track of this.tracks) {
            let available = true;

            for (const item of track.items) {
                if (!item.animation || !item.danmaku) continue;

                const visualElapsed = this.calculateVisualElapsed(
                    currentVideoTime,
                    item.danmaku.time,
                    playbackRate
                );

                const duration = (item.animation.effect!.getTiming().duration as number) / 1000;
                const progress = Math.min(visualElapsed / duration, 1);

                const totalDistance = stageWidth + item.width;
                const itemX = stageWidth - progress * totalDistance;

                if (itemX + item.width > stageWidth - 100) {
                    available = false;
                    break;
                }
            }

            if (available) {
                return track;
            }
        }

        return this.tracks[Math.floor(Math.random() * this.tracks.length)];
    }

    private cleanup(): void {
        if (!this.stage) return;

        const stageWidth = this.stage.offsetWidth;

        this.tracks.forEach((track) => {
            track.items = track.items.filter((item) => {
                if (!item.animation) {
                    if (item.elem) item.elem.remove();
                    return false;
                }

                const animationState = item.animation.playState;

                if (animationState === 'finished' || animationState === 'idle') {
                    if (item.elem) item.elem.remove();
                    return false;
                }

                const currentTime = item.animation.currentTime || 0;
                const duration = item.animation.effect!.getTiming().duration as number;
                const progress = (currentTime as number) / duration;

                const totalDistance = stageWidth + item.width;
                const x = stageWidth - progress * totalDistance;

                if (x < -item.width || progress >= 1) {
                    item.animation.cancel();
                    if (item.elem) item.elem.remove();
                    return false;
                }

                return true;
            });
        });
    }

    destroy(): void {
        this.pause();
        this.clear();

        if (this.emittingFrameId) {
            cancelAnimationFrame(this.emittingFrameId);
            this.emittingFrameId = null;
        }

        if (this.stage) {
            this.stage.remove();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}
