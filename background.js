chrome.tabs.onCreated.addListener(async (tab) => {
    // 获取设置
    const { defaultGroupId, ignorePopupWindows } = await chrome.storage.local.get(['defaultGroupId', 'ignorePopupWindows']);

    if (!defaultGroupId) return;
    try {
        // 检查标签页是否已经在某个标签组中
        const groupId = await chrome.tabs.get(tab.id).then(t => t.groupId);
        if (groupId !== -1) {
            console.log('标签页已在标签组中，保持原状');
            return;
        }

        // 获取标签页所在的窗口信息
        const window = await chrome.windows.get(tab.windowId);

        // 更严格的独立窗口检查
        console.log("window", window)
        const isPopupWindow = window.type !== 'normal'

        // 如果设置为忽略独立窗口，且检测到是独立窗口，则不进行分组
        if (ignorePopupWindows && isPopupWindow) {
            console.log('检测到独立窗口，跳过分组');
            return;
        }

        // 检查标签组是否存在，如果不存在会抛出错误
        await chrome.tabGroups.get(defaultGroupId);

        // 将新标签添加到默认标签组
        await chrome.tabs.group({
            tabIds: tab.id,
            groupId: defaultGroupId
        });
    } catch (error) {
        console.error('标签组不存在或其他错误:', error);
    }
});