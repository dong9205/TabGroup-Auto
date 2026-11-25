document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('syncStatus');
    const select = document.getElementById('syncDeviceSelect');
    const buttons = [...document.querySelectorAll('[id^="sync"][id$="Button"]')];
    const showStatus = (message, error = false) => {
        status.textContent = message;
        status.style.color = error ? '#dc3545' : '#555';
    };
    async function run(action, onSuccess, extra = {}) {
        buttons.forEach(button => button.disabled = true);
        showStatus('同步处理中...');
        try {
            const response = await chrome.runtime.sendMessage({ action, ...extra });
            if (!response?.success) throw new Error(response?.error || '同步失败');
            onSuccess(response.result);
        } catch (error) {
            console.error('同步失败:', error);
            showStatus(error.message, true);
        } finally {
            buttons.forEach(button => button.disabled = false);
        }
    }
    document.getElementById('openSyncOptionsButton').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('syncUploadBookmarksButton').addEventListener('click', () => run('syncUploadBookmarks', result => {
        showStatus(`上传完成：${result.folderCount} 个文件夹，${result.bookmarkCount} 条收藏，跳过 ${result.skippedCount} 个不支持的节点`);
    }));
    document.getElementById('syncListDevicesButton').addEventListener('click', () => run('syncListBookmarkDevices', devices => {
        select.replaceChildren();
        for (const device of devices) {
            const option = document.createElement('option');
            option.value = device.path;
            option.disabled = !!device.error;
            option.textContent = device.error ? `${device.path}：${device.error}` : `${device.deviceName} · ${device.bookmarkCount} 条收藏 · ${new Date(device.capturedAt).toLocaleString()}`;
            select.appendChild(option);
        }
        const available = [...select.options].find(option => !option.disabled);
        select.value = available?.value || '';
        showStatus(devices.length ? `找到 ${devices.length} 个设备快照` : '暂无快照，请先在另一端上传');
    }));
    document.getElementById('syncMergeBookmarksButton').addEventListener('click', () => {
        if (!select.value) {
            showStatus('请先刷新并选择可读取的设备快照', true);
            return;
        }
        run('syncMergeBookmarks', result => showStatus(`合并完成：新增 ${result.foldersCreated} 个文件夹、${result.bookmarksCreated} 条收藏，复用 ${result.bookmarksReused} 条收藏`), { path: select.value });
    });
    try {
        const settings = await chrome.storage.local.get(['syncBackend', 'syncWorkerBaseUrl', 'syncPassphrase']);
        const backend = settings.syncBackend || (settings.syncWorkerBaseUrl || settings.syncPassphrase ? 'cloudflare' : 'fns');
        document.getElementById('fnsSyncControls').hidden = backend !== 'fns';
        document.getElementById('legacySyncControls').hidden = backend === 'fns';
    } catch (error) {
        console.error('读取同步设置失败:', error);
        showStatus('读取同步设置失败，请重新打开弹窗', true);
    }
});
