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
        const { defaultGroupId, ignorePopupWindows } = await chrome.storage.local.get(['defaultGroupId', 'ignorePopupWindows']);

        // 如果设置为忽略独立窗口，且检测到是独立窗口，则不进行分组
        if (ignorePopupWindows && isPopupWindow) {
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
    }
});