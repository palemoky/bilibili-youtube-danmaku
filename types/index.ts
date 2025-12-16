/**
 * 全局类型定义
 */

/** 弹幕数据接口 */
export interface Danmaku {
    time: number;
    text: string;
    color: string;
    mode: 'rtl' | 'top' | 'bottom';
    weight?: number;
}

/** 原始弹幕数据（来自 Bilibili API） */
export interface RawDanmaku {
    progress: number;
    content: string;
    color?: number;
    mode?: number;
    weight?: number;
}

/** 视频信息接口 */
export interface VideoInfo {
    aid: number;
    cid: number;
    duration: number;
    title: string;
}

/** 弹幕下载结果 */
export interface DanmakuDownloadResult {
    danmakus: Danmaku[];
    title: string;
    duration: number;
}

/** Bilibili 搜索结果 */
export interface BilibiliSearchResult {
    bvid: string;
    title: string;
    author: string;
    duration: number;
    pubdate?: number;
    play?: number;
}

/** 频道关联信息 */
export interface ChannelAssociation {
    bilibiliUID: string;
    bilibiliName?: string;
    bilibiliSpaceUrl?: string;
}

/** 页面信息 */
export interface PageInfo {
    videoId: string;
    channelId?: string;
    videoTitle?: string;
    lastUpdate?: number;
}

/** 广告片段 */
export interface AdSegment {
    segment: [number, number];
    category: string;
    videoDuration?: number;
}

/** 消息类型 */
export type MessageType =
    | 'GET_DANMAKU'
    | 'SEARCH_VIDEO'
    | 'SEARCH_USER'
    | 'SEARCH_GLOBAL'
    | 'UPDATE_PAGE_INFO'
    | 'GET_PAGE_INFO';

/** 消息接口 */
export interface Message<T = any> {
    type: MessageType;
    data?: T;
    tabId?: number;
}

/** 消息响应接口 */
export interface MessageResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}
