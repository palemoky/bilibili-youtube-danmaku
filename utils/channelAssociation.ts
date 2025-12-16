/**
 * 频道关联管理工具
 * 统一管理 YouTube 频道与 B站 UP主的关联关系
 */

import type { ChannelAssociation } from '../types';

/** 远程数据库格式 */
interface RemoteChannelData {
    youtubeChannelId: string;
    bilibiliUID: string;
    bilibiliName?: string;
}

interface RemoteDatabase {
    channels: RemoteChannelData[];
}

/** 本地存储的关联数据 */
interface StoredAssociation extends ChannelAssociation {
    lastUpdate: number;
    source?: 'local' | 'remote';
}

/** 关联统计信息 */
interface AssociationStats {
    totalAssociations: number;
    recentAssociations: number;
    associatedChannels: string[];
}

export class ChannelAssociationManager {
    private readonly STORAGE_KEY = 'channelMappings';
    private readonly REMOTE_DB_URL =
        'https://raw.githubusercontent.com/ahaduoduoduo/bilibili-youtube-danmaku/main/channel-associations.json';

    /**
     * 获取频道关联信息（先本地后远程）
     * @param channelId - YouTube频道ID
     * @returns 关联信息或null
     */
    async getChannelAssociation(channelId: string): Promise<StoredAssociation | null> {
        try {
            if (!channelId) return null;

            // 1. 先查本地存储
            const localResult = await this.getLocalAssociation(channelId);
            if (localResult) {
                console.log('使用本地关联数据:', channelId);
                return localResult;
            }

            // 2. 本地无结果时查远程
            console.log('本地无关联数据，尝试远程获取:', channelId);
            try {
                const remoteResult = await this.getRemoteAssociation(channelId);
                if (remoteResult) {
                    console.log('远程获取成功:', channelId);
                    return remoteResult;
                }
            } catch (error) {
                console.log('远程获取失败，回退到本地模式:', (error as Error).message);
            }

            return null;
        } catch (error) {
            console.error('获取频道关联信息失败:', error);
            return null;
        }
    }

    /**
     * 判断频道是否已关联
     * @param channelId - YouTube频道ID
     * @returns 是否已关联
     */
    async isChannelAssociated(channelId: string): Promise<boolean> {
        const association = await this.getChannelAssociation(channelId);
        return association !== null && !!association.bilibiliUID;
    }

    /**
     * 保存频道关联
     * @param channelId - YouTube频道ID
     * @param associationData - 关联数据
     * @returns 保存是否成功
     */
    async saveChannelAssociation(
        channelId: string,
        associationData: ChannelAssociation
    ): Promise<boolean> {
        try {
            if (!channelId || !associationData.bilibiliUID) {
                throw new Error('缺少必要的关联参数');
            }

            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = (result[this.STORAGE_KEY] || {}) as Record<string, StoredAssociation>;

            mappings[channelId] = {
                bilibiliUID: associationData.bilibiliUID,
                bilibiliName: associationData.bilibiliName || '',
                bilibiliSpaceUrl: associationData.bilibiliSpaceUrl || '',
                lastUpdate: Date.now()
            };

            await browser.storage.local.set({ [this.STORAGE_KEY]: mappings });
            return true;
        } catch (error) {
            console.error('保存频道关联失败:', error);
            return false;
        }
    }

    /**
     * 删除频道关联
     * @param channelId - YouTube频道ID
     * @returns 删除是否成功
     */
    async removeChannelAssociation(channelId: string): Promise<boolean> {
        try {
            if (!channelId) return false;

            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = (result[this.STORAGE_KEY] || {}) as Record<string, StoredAssociation>;

            delete mappings[channelId];

            await browser.storage.local.set({ [this.STORAGE_KEY]: mappings });
            return true;
        } catch (error) {
            console.error('删除频道关联失败:', error);
            return false;
        }
    }

    /**
     * 获取所有关联
     * @returns 所有关联映射
     */
    async getAllAssociations(): Promise<Record<string, StoredAssociation>> {
        try {
            const result = await browser.storage.local.get(this.STORAGE_KEY);
            return (result[this.STORAGE_KEY] || {}) as Record<string, StoredAssociation>;
        } catch (error) {
            console.error('获取所有关联失败:', error);
            return {};
        }
    }

    /**
     * 获取关联统计信息
     * @returns 统计信息
     */
    async getAssociationStats(): Promise<AssociationStats> {
        try {
            const mappings = await this.getAllAssociations();
            const channelIds = Object.keys(mappings);
            const totalCount = channelIds.length;
            const recentCount = channelIds.filter((id) => {
                const association = mappings[id];
                return (
                    association.lastUpdate &&
                    Date.now() - association.lastUpdate < 30 * 24 * 60 * 60 * 1000
                );
            }).length;

            return {
                totalAssociations: totalCount,
                recentAssociations: recentCount,
                associatedChannels: channelIds
            };
        } catch (error) {
            console.error('获取关联统计失败:', error);
            return {
                totalAssociations: 0,
                recentAssociations: 0,
                associatedChannels: []
            };
        }
    }

    /**
     * 验证关联数据格式
     * @param associationData - 关联数据
     * @returns 数据是否有效
     */
    validateAssociationData(associationData: unknown): associationData is ChannelAssociation {
        if (!associationData || typeof associationData !== 'object') {
            return false;
        }

        const data = associationData as Partial<ChannelAssociation>;

        // 必须有bilibiliUID
        if (!data.bilibiliUID || typeof data.bilibiliUID !== 'string') {
            return false;
        }

        // 验证UID格式（纯数字）
        if (!/^\d+$/.test(data.bilibiliUID)) {
            return false;
        }

        return true;
    }

    /**
     * 获取本地关联信息
     * @param channelId - YouTube频道ID
     * @returns 本地关联信息或null
     */
    async getLocalAssociation(channelId: string): Promise<StoredAssociation | null> {
        try {
            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = (result[this.STORAGE_KEY] || {}) as Record<string, StoredAssociation>;
            return mappings[channelId] || null;
        } catch (error) {
            console.error('获取本地关联信息失败:', error);
            return null;
        }
    }

    /**
     * 从远程获取关联信息
     * @param channelId - YouTube频道ID
     * @returns 远程关联信息或null
     */
    async getRemoteAssociation(channelId: string): Promise<StoredAssociation | null> {
        try {
            const remoteData = await this.fetchRemoteAssociations();
            if (!remoteData || !remoteData.channels) {
                return null;
            }

            const match = remoteData.channels.find(
                (channel) => channel.youtubeChannelId === channelId
            );

            if (match) {
                // 转换为本地存储格式
                return {
                    bilibiliUID: match.bilibiliUID,
                    bilibiliName: match.bilibiliName || '',
                    bilibiliSpaceUrl: `https://space.bilibili.com/${match.bilibiliUID}`,
                    lastUpdate: Date.now(),
                    source: 'remote' // 标记数据来源
                };
            }

            return null;
        } catch (error) {
            console.error('远程获取关联信息失败:', error);
            return null;
        }
    }

    /**
     * 从远程获取完整的关联数据库
     * @returns 远程数据或null
     */
    async fetchRemoteAssociations(): Promise<RemoteDatabase | null> {
        try {
            const response = await fetch(this.REMOTE_DB_URL, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                },
                // 不缓存，每次都获取最新数据
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // 简单格式验证
            if (!data || !Array.isArray(data.channels)) {
                throw new Error('远程数据格式无效');
            }

            console.log(`远程关联库获取成功，包含 ${data.channels.length} 个频道`);
            return data;
        } catch (error) {
            console.error('获取远程关联库失败:', error);
            throw error;
        }
    }

    /**
     * 解析B站空间链接获取UID
     * @param spaceUrl - B站空间链接
     * @returns UID或null
     */
    parseBilibiliSpaceUrl(spaceUrl: string | null | undefined): string | null {
        if (!spaceUrl) return null;
        const match = spaceUrl.match(/space\.bilibili\.com\/(\d+)/);
        return match ? match[1] : null;
    }
}

// 创建全局实例
export const channelAssociation = new ChannelAssociationManager();

// 默认导出
export default channelAssociation;
