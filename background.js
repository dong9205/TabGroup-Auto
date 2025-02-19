chrome.tabs.onCreated.addListener(async (tab) => {
    // 获取设置
    const { defaultGroupId, ignorePopupWindows } = await chrome.storage.local.get(['defaultGroupId', 'ignorePopupWindows']);

    if (!defaultGroupId) return;
    try {
        // 获取标签页所在的窗口信息
        const window = await chrome.windows.get(tab.windowId);

        // 更严格的独立窗口检查
        const isPopupWindow = window.type !== 'normal' ||
            window.width < 800 ||  // 通常独立窗口较小
            window.focused === false;  // 独立窗口通常不会立即获得焦点

        // 如果设置为忽略独立窗口，且检测到是独立窗口，则不进行分组
        if (ignorePopupWindows && isPopupWindow) {
            console.log('检测到独立窗口，跳过分组');
            return;
        }

        // 确保标签组仍然存在
        const group = await chrome.tabGroups.get(defaultGroupId);

        // 将新标签添加到默认标签组
        await chrome.tabs.group({
            tabIds: tab.id,
            groupId: defaultGroupId
        });
    } catch (error) {
        console.error('标签组不存在或其他错误:', error);
    }
});