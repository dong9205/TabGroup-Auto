// 检查URL是否匹配规则
async function checkUrlRules(url) {
    const { urlRules } = await chrome.storage.local.get(['urlRules']);
    if (!urlRules || !Array.isArray(urlRules)) return [];

    const matchedGroupIds = [];
    for (const rule of urlRules) {
        const pattern = rule.pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
            matchedGroupIds.push(rule.groupId);
        }
    }
    return matchedGroupIds;
}

// 处理标签页分组
async function handleTabGrouping(tab) {
    try {
        // 检查URL规则
        const matchedGroupIds = await checkUrlRules(tab.url || tab.pendingUrl);

        // 获取当前标签页所在组
        const groupId = await chrome.tabs.get(tab.id).then(t => t.groupId);

        // 如果有匹配的URL规则且当前组不是规则指定的组
        if (matchedGroupIds.length > 0 && (!groupId || groupId === -1 || matchedGroupIds[0] !== groupId)) {
            // 检查标签组是否存在
            await chrome.tabGroups.get(matchedGroupIds[0]);

            // 将标签页添加到目标标签组
            await chrome.tabs.group({
                tabIds: tab.id,
                groupId: matchedGroupIds[0]
            });
            return;
        }

        // 如果标签页已在标签组中且没有匹配的URL规则，保持原状
        if (groupId !== -1) {
            console.log('标签页已在标签组中，保持原状');
            return;
        }

        // 获取标签页所在的窗口信息
        const window = await chrome.windows.get(tab.windowId);
        const isPopupWindow = window.type !== 'normal';

        // 获取设置
        const { defaultGroupId, ignorePopupWindows } = await chrome.storage.local.get(['defaultGroupId', 'ignorePopupWindows']);

        // 如果设置为忽略独立窗口，且检测到是独立窗口，则不进行分组
        if (ignorePopupWindows && isPopupWindow) {
            console.log('检测到独立窗口，跳过分组');
            return;
        }

        // 检查URL规则
        const matchedGroupIds = await checkUrlRules(tab.url || tab.pendingUrl);

        // 如果没有匹配的规则，使用默认标签组
        let targetGroupId = matchedGroupIds[0];
        if (!targetGroupId && defaultGroupId) {
            targetGroupId = defaultGroupId;
        }

        if (targetGroupId) {
            // 检查标签组是否存在
            await chrome.tabGroups.get(targetGroupId);

            // 将标签页添加到目标标签组
            await chrome.tabs.group({
                tabIds: tab.id,
                groupId: targetGroupId
            });
        }
    } catch (error) {
        console.error('标签组不存在或其他错误:', error);
    }
}

// 监听标签页创建事件
chrome.tabs.onCreated.addListener(handleTabGrouping);

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // 只在URL更新时处理
    if (changeInfo.url) {
        await handleTabGrouping(tab);
    }
});