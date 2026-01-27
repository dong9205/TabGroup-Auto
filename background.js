// 从URL提取域名
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

// 排序标签页
async function sortTabsInGroup(groupId, sortMethod) {
    try {
        const tabs = await chrome.tabs.query({ groupId: groupId });
        if (tabs.length <= 1) return;

        // 按窗口分组，因为不同窗口的标签页不能直接移动
        const tabsByWindow = {};
        tabs.forEach(tab => {
            if (!tabsByWindow[tab.windowId]) {
                tabsByWindow[tab.windowId] = [];
            }
            tabsByWindow[tab.windowId].push(tab);
        });

        // 对每个窗口的标签页分别排序
        for (const windowId in tabsByWindow) {
            const windowTabs = tabsByWindow[windowId];
            if (windowTabs.length <= 1) continue;

            // 根据排序方式排序
            let sortedTabs = [...windowTabs];
            switch (sortMethod) {
                case 'domain':
                    sortedTabs.sort((a, b) => {
                        const urlA = a.url || '';
                        const urlB = b.url || '';
                        // 没有URL的标签页（新标签页）排在后面
                        if (!urlA && !urlB) return (a.id || 0) - (b.id || 0);
                        if (!urlA) return 1; // a没有URL，排在后面
                        if (!urlB) return -1; // b没有URL，排在后面
                        
                        const domainA = getDomain(urlA);
                        const domainB = getDomain(urlB);
                        // 如果域名相同，新标签页（ID大的）排在后面
                        if (domainA === domainB) {
                            return (a.id || 0) - (b.id || 0);
                        }
                        return domainA.localeCompare(domainB);
                    });
                    break;
                case 'url':
                    sortedTabs.sort((a, b) => {
                        const urlA = (a.url || '').toLowerCase();
                        const urlB = (b.url || '').toLowerCase();
                        // 没有URL的标签页排在后面
                        if (!urlA && !urlB) return (a.id || 0) - (b.id || 0);
                        if (!urlA) return 1;
                        if (!urlB) return -1;
                        // 如果URL相同，新标签页排在后面
                        if (urlA === urlB) {
                            return (a.id || 0) - (b.id || 0);
                        }
                        return urlA.localeCompare(urlB);
                    });
                    break;
                case 'title':
                    sortedTabs.sort((a, b) => {
                        const titleA = (a.title || '').toLowerCase();
                        const titleB = (b.title || '').toLowerCase();
                        // 没有标题的标签页排在后面
                        if (!titleA && !titleB) return (a.id || 0) - (b.id || 0);
                        if (!titleA) return 1;
                        if (!titleB) return -1;
                        // 如果标题相同，新标签页排在后面
                        if (titleA === titleB) {
                            return (a.id || 0) - (b.id || 0);
                        }
                        return titleA.localeCompare(titleB);
                    });
                    break;
                case 'created':
                    // 按创建时间排序，新标签页（ID大的）排在后面
                    sortedTabs.sort((a, b) => (a.id || 0) - (b.id || 0));
                    break;
                default:
                    continue;
            }

            // 获取排序后的标签ID数组
            const sortedTabIds = sortedTabs.map(tab => tab.id);
            
            // 检查顺序是否改变
            const currentOrder = windowTabs.map(tab => tab.id).join(',');
            const newOrder = sortedTabIds.join(',');
            if (currentOrder === newOrder) continue;

            // 找到该分组在该窗口中的起始位置
            const firstTab = windowTabs[0];
            const allWindowTabs = await chrome.tabs.query({ windowId: parseInt(windowId) });
            const groupStartIndex = allWindowTabs.findIndex(t => t.id === firstTab.id);
            
            if (groupStartIndex === -1) continue;

            // 移动标签页到新位置（从后往前移动，避免索引变化影响）
            for (let i = sortedTabIds.length - 1; i >= 0; i--) {
                try {
                    await chrome.tabs.move(sortedTabIds[i], { index: groupStartIndex + i });
                } catch (error) {
                    console.error(`移动标签页 ${sortedTabIds[i]} 失败:`, error);
                }
            }
        }
    } catch (error) {
        console.error('排序标签页失败:', error);
    }
}

// 触发分组排序（带重试机制）
async function triggerGroupSort(groupId, sortMethod, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            // 等待一下确保标签页已加入分组并加载完成
            // 第一次等待时间较长，让标签页有时间加载URL和标题
            const waitTime = i === 0 ? 500 : 200 + i * 100;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // 验证分组是否存在且有标签页
            const tabs = await chrome.tabs.query({ groupId: groupId });
            if (tabs.length > 1) {
                await sortTabsInGroup(groupId, sortMethod);
                // 如果还有标签页没有URL，再等待一次并重新排序
                const tabsWithoutUrl = tabs.filter(t => !t.url || t.url === 'chrome://newtab/');
                if (tabsWithoutUrl.length > 0 && i < retries - 1) {
                    // 继续重试，等待标签页加载完成
                    continue;
                }
                return;
            }
        } catch (error) {
            console.error(`排序重试 ${i + 1}/${retries} 失败:`, error);
            if (i === retries - 1) {
                console.error('排序最终失败:', error);
            }
        }
    }
}

// 处理标签页分组
async function handleTabGrouping(tab) {
    try {
        // 如果是通过标签组"+"按钮创建的标签页，不分组
        if (tab.groupId != chrome.tabGroups.TAB_GROUP_ID_NONE) {
            console.log('通过标签组"+"按钮创建的标签页，跳过分组');
            return;
        }

        // 获取标签页所在的窗口信息
        const window = await chrome.windows.get(tab.windowId);
        const isPopupWindow = window.type !== 'normal';

        // 获取设置
        const { defaultGroupId, groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['defaultGroupId', 'groupSortSettings', 'sortMethod']);

        if (isPopupWindow) {
            console.log('检测到独立窗口，跳过分组');
            return;
        }

        if (defaultGroupId) {
            // 检查标签组是否存在
            await chrome.tabGroups.get(defaultGroupId);

            // 将标签页添加到默认标签组
            await chrome.tabs.group({
                tabIds: tab.id,
                groupId: defaultGroupId
            });

            // 检查该分组是否开启了自动排序（确保ID类型一致）
            const groupIdKey = String(defaultGroupId);
            const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[defaultGroupId];
            if (groupSettings && groupSettings.autoSort) {
                const method = groupSettings.sortMethod || sortMethod;
                // 异步触发排序，不阻塞
                triggerGroupSort(defaultGroupId, method).catch(err => {
                    console.error('自动排序失败:', err);
                });
            }
        }
    } catch (error) {
        console.error('标签组不存在:', error);
    }
}

// 监听标签页创建事件
chrome.tabs.onCreated.addListener(handleTabGrouping);

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // 只在URL更新时处理
    if (changeInfo.url) {
        await handleTabGrouping(tab);
        
        // 如果标签页已经在分组中，且URL从新标签页变为实际URL，需要重新排序
        if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && 
            changeInfo.url && 
            changeInfo.url !== 'chrome://newtab/' && 
            changeInfo.url !== 'about:newtab') {
            try {
                const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
                const groupIdKey = String(tab.groupId);
                const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[tab.groupId];
                if (groupSettings && groupSettings.autoSort) {
                    const method = groupSettings.sortMethod || sortMethod;
                    // 延迟一下，确保URL已完全更新
                    setTimeout(async () => {
                        await sortTabsInGroup(tab.groupId, method);
                    }, 300);
                }
            } catch (error) {
                console.error('URL更新后排序失败:', error);
            }
        }
    }
    // 当标签页的groupId变化时，检查是否需要排序
    if (changeInfo.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        try {
            const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
            const groupIdKey = String(tab.groupId);
            const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[tab.groupId];
            if (groupSettings && groupSettings.autoSort) {
                const method = groupSettings.sortMethod || sortMethod;
                triggerGroupSort(tab.groupId, method).catch(err => {
                    console.error('自动排序失败:', err);
                });
            }
        } catch (error) {
            console.error('处理分组变化失败:', error);
        }
    }
});

// 导出排序函数供popup使用
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sortAllTabs') {
        sortAllTabs(request.sortMethod).then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            console.error('排序失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true; // 保持消息通道开放
    }
    if (request.action === 'sortGroup') {
        sortTabsInGroup(request.groupId, request.sortMethod).then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            console.error('排序分组失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true; // 保持消息通道开放
    }
});

// 排序所有标签页
async function sortAllTabs(sortMethod) {
    try {
        const { groupSortSettings = {}, sortMethod: defaultSortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
        const groups = await chrome.tabGroups.query({});
        
        for (const group of groups) {
            // 优先使用分组自己的排序配置，如果没有则使用传入的排序方式，最后使用默认排序方式
            // 确保ID类型一致
            const groupIdKey = String(group.id);
            const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[group.id];
            const method = groupSettings?.sortMethod || sortMethod || defaultSortMethod;
            await sortTabsInGroup(group.id, method);
        }
    } catch (error) {
        console.error('排序所有标签页失败:', error);
        throw error;
    }
}