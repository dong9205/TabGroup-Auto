// FNS 笔记中只保存加密载荷；配置与各设备快照共用一个 Vault。
const fnsSyncRoot = 'TabGroup Auto';
let mergingSyncBookmarks = false;

async function isFnsSyncSelected() {
    const settings = await chrome.storage.local.get(['syncBackend', 'syncWorkerBaseUrl', 'syncPassphrase']);
    return (settings.syncBackend || (settings.syncWorkerBaseUrl || settings.syncPassphrase ? 'cloudflare' : 'fns')) === 'fns';
}

async function getFnsConfig() {
    if (!await isFnsSyncSelected()) throw new Error('请先在选项页选择 FNS 同步后端');
    const settings = await chrome.storage.local.get(['syncFnsBaseUrl', 'syncFnsToken', 'syncFnsVault', 'syncPassphrase', 'syncDeviceName']);
    let url;
    try {
        url = new URL((settings.syncFnsBaseUrl || '').trim());
    } catch (error) {
        throw new Error('请填写有效的 FNS HTTPS 服务地址');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('FNS 地址必须使用 HTTPS，不能包含账号、查询参数或片段');
    }
    const baseUrl = url.href.replace(/\/+$/, '').replace(/\/api$/, '');
    const token = (settings.syncFnsToken || '').trim().replace(/^Bearer\s+/i, '');
    const vault = (settings.syncFnsVault || '').trim();
    const passphrase = (settings.syncPassphrase || '').trim();
    if (!token || !vault || !passphrase) throw new Error('请在选项页填写 FNS Token、Vault 名称和同步口令');
    return { baseUrl, token, vault, passphrase, deviceName: (settings.syncDeviceName || '').trim() };
}

async function fnsRequest(config, route, { method = 'GET', query = {}, body, allowMissing = false } = {}) {
    const url = new URL(`${config.baseUrl}/api/${route}`);
    if (method === 'GET') url.search = new URLSearchParams({ vault: config.vault, ...query }).toString();
    const response = await fetch(url.href, {
        method,
        headers: {
            'Authorization': `Bearer ${config.token}`,
            'Token': config.token,
            'Content-Type': 'application/json',
            'x-client': 'tabgroup-auto',
            'x-client-name': 'TabGroup Auto',
            'x-client-version': chrome.runtime.getManifest().version
        },
        body: body ? JSON.stringify({ ...body, vault: config.vault }) : undefined,
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`FNS 请求失败（HTTP ${response.status}）`);
    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error('FNS 未返回 JSON，请检查服务地址及版本');
    }
    // 不同 FNS 版本使用 428 或 430 表示笔记不存在；430 需同时匹配消息，避免忽略其他业务错误。
    const noteMissing = result.code === 428 || (result.code === 430 && /^Note does not exist\.?$/i.test(String(result.message || result.msg || '').trim()));
    if (allowMissing && method === 'GET' && route === 'note' && noteMissing) return null;
    // FNS 业务错误也可能返回 HTTP 200，成功码仅为 1..6。
    if (!Number.isInteger(result.code) || result.code < 1 || result.code > 6 || result.status === false) {
        throw new Error(`FNS 操作失败（${result.code}）：${result.message || result.msg || '请检查 Token 权限、Vault 和服务版本'}`);
    }
    return result.data;
}

async function readFnsPayload(config, path) {
    const note = await fnsRequest(config, 'note', { query: { path }, allowMissing: true });
    if (!note) throw new Error('云端尚无此配置或收藏栏快照，请先在来源浏览器上传');
    let payload;
    try {
        payload = JSON.parse(note.content);
    } catch (error) {
        throw new Error('FNS 笔记不是有效的同步数据');
    }
    if (payload?.v !== 1 || !payload.iv || !payload.ciphertext || !payload.kdfSalt) {
        throw new Error('FNS 加密载荷格式不正确');
    }
    return decryptSnapshot(config.passphrase, payload.iv, payload.ciphertext, payload.kdfSalt);
}

async function writeFnsPayload(config, path, value) {
    const encrypted = await encryptSnapshot(config.passphrase, value);
    const content = JSON.stringify({ v: 1, iv: encrypted.ivBase64, ciphertext: encrypted.ciphertextBase64, kdfSalt: encrypted.kdfSaltBase64 });
    const previous = await fnsRequest(config, 'note', { query: { path }, allowMissing: true });
    await fnsRequest(config, 'note', {
        method: 'POST',
        body: { path, content, ctime: previous?.ctime || Date.now(), mtime: Date.now() }
    });
}

async function uploadFnsConfig() {
    const config = await getFnsConfig();
    const selected = pickConfigForSync(await chrome.storage.local.get(null));
    const groups = await chrome.tabGroups.query({});
    selected.urlRules = (selected.urlRules || []).map(rule => ({
        pattern: rule.pattern,
        autoMove: !!rule.autoMove,
        groupTitle: rule.groupTitle || groups.find(group => group.id === Number(rule.groupId))?.title || '未命名标签组'
    }));
    const sortSettings = {};
    for (const [key, value] of Object.entries(selected.groupSortSettings || {})) {
        const group = groups.find(item => String(item.id) === key);
        if (group) sortSettings[group.title || '未命名标签组'] = value;
        else if (!/^\d+$/.test(key)) sortSettings[key] = value;
    }
    selected.groupSortSettings = sortSettings;
    await writeFnsPayload(config, `${fnsSyncRoot}/config.md`, { v: 1, config: selected, updatedAt: Date.now() });
    return { urlRuleCount: selected.urlRules.length, groupSortSettingCount: Object.keys(sortSettings).length };
}

async function pullFnsConfig() {
    const config = await getFnsConfig();
    const value = await readFnsPayload(config, `${fnsSyncRoot}/config.md`);
    if (value?.v !== 1 || !value.config || typeof value.config !== 'object' || Array.isArray(value.config)) {
        throw new Error('云端配置格式不正确');
    }
    const selected = pickConfigForSync(value.config);
    // 本地 ID 在其他设备没有意义，始终按标题解析。
    if (Array.isArray(selected.urlRules)) selected.urlRules = selected.urlRules.map(rule => ({ ...rule, groupId: null }));
    await chrome.storage.local.set(selected);
    return { urlRuleCount: selected.urlRules?.length || 0, groupSortSettingCount: Object.keys(selected.groupSortSettings || {}).length };
}

async function getBookmarksBar() {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];
    // 新版 Chromium 提供 folderType；旧版 Edge/Chrome 的收藏栏根 ID 为 1。
    const bar = roots.find(node => node.folderType === 'bookmarks-bar') || roots.find(node => node.id === '1' && !node.folderType);
    if (!bar || bar.url || bar.unmodifiable) throw new Error('未找到可写的收藏栏，请检查书签权限和浏览器策略');
    return bar;
}

function collectBookmarksBar(bar) {
    let bookmarkCount = 0;
    let folderCount = 0;
    let skippedCount = 0;
    function collect(children) {
        const result = [];
        for (const node of children || []) {
            if (node.unmodifiable) {
                skippedCount++;
                continue;
            }
            if (typeof node.url === 'string') {
                if (!isSyncableUrl(node.url)) {
                    skippedCount++;
                    continue;
                }
                result.push({ title: node.title || '', url: node.url });
                bookmarkCount++;
            } else {
                result.push({ title: node.title || '', children: collect(node.children) });
                folderCount++;
            }
        }
        return result;
    }
    const children = collect(bar.children);
    return { children, stats: { bookmarkCount, folderCount, skippedCount } };
}

function validateBookmarksSnapshot(snapshot) {
    if (snapshot?.v !== 1 || snapshot.kind !== 'bookmarks-bar' || !Array.isArray(snapshot.children)) {
        throw new Error('收藏栏快照格式不正确，标签页快照不能作为收藏栏导入');
    }
    let nodeCount = 0;
    let bookmarkCount = 0;
    let folderCount = 0;
    function validate(nodes, depth) {
        if (depth > 100) throw new Error('收藏夹层级过深');
        for (const node of nodes) {
            if (++nodeCount > 50000) throw new Error('收藏栏快照超过 50000 个节点');
            if (!node || typeof node.title !== 'string') throw new Error('收藏栏节点格式不正确');
            if (Object.prototype.hasOwnProperty.call(node, 'url')) {
                if (typeof node.url !== 'string' || !isSyncableUrl(node.url) || Object.prototype.hasOwnProperty.call(node, 'children')) {
                    throw new Error('收藏栏网址格式不正确');
                }
                bookmarkCount++;
            } else {
                if (!Array.isArray(node.children)) throw new Error('收藏夹格式不正确');
                folderCount++;
                validate(node.children, depth + 1);
            }
        }
    }
    validate(snapshot.children, 0);
    return { bookmarkCount, folderCount };
}

async function uploadFnsBookmarks() {
    const config = await getFnsConfig();
    const deviceId = await getOrCreateSyncDeviceId();
    const { children, stats } = collectBookmarksBar(await getBookmarksBar());
    const snapshot = { v: 1, kind: 'bookmarks-bar', deviceId, deviceName: config.deviceName || deviceId, capturedAt: Date.now(), children };
    validateBookmarksSnapshot(snapshot);
    await writeFnsPayload(config, `${fnsSyncRoot}/bookmarks/${deviceId}.md`, snapshot);
    return stats;
}

async function listFnsBookmarkDevices() {
    const config = await getFnsConfig();
    const notes = [];
    for (let page = 1; ; page++) {
        const result = await fnsRequest(config, 'notes', { query: { keyword: `${fnsSyncRoot}/bookmarks/`, searchMode: 'path', searchContent: 'false', page, pageSize: 100 } });
        if (!Array.isArray(result?.list)) throw new Error('FNS 笔记列表格式不正确');
        notes.push(...result.list.filter(note => /^TabGroup Auto\/bookmarks\/[a-zA-Z0-9-]+\.md$/.test(note.path)));
        if (result.list.length < 100 || page * 100 >= result.pager?.totalRows) break;
    }
    const devices = [];
    for (const note of notes) {
        try {
            const value = await readFnsPayload(config, note.path);
            const stats = validateBookmarksSnapshot(value);
            devices.push({ path: note.path, deviceName: value.deviceName || value.deviceId, capturedAt: value.capturedAt, ...stats });
        } catch (error) {
            console.error('读取收藏栏快照失败:', error);
            devices.push({ path: note.path, error: '无法解密或读取，请检查口令和收藏栏快照格式' });
        }
    }
    return devices.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
}

async function mergeFnsBookmarks(path) {
    if (!/^TabGroup Auto\/bookmarks\/[a-zA-Z0-9-]+\.md$/.test(path || '')) throw new Error('请选择有效的收藏栏快照');
    if (mergingSyncBookmarks) throw new Error('正在合并收藏栏，请稍后重试');
    mergingSyncBookmarks = true;
    const stats = { bookmarksCreated: 0, foldersCreated: 0, bookmarksReused: 0, foldersReused: 0 };
    try {
        const config = await getFnsConfig();
        const snapshot = await readFnsPayload(config, path);
        // 整棵树先校验，再执行任何本地写入。
        validateBookmarksSnapshot(snapshot);
        const bar = await getBookmarksBar();
        async function merge(parentId, nodes) {
            const existing = await chrome.bookmarks.getChildren(parentId);
            const used = new Set();
            for (const node of nodes) {
                const isBookmark = typeof node.url === 'string';
                const matched = existing.find(item => !used.has(item.id) && !item.unmodifiable && item.title === node.title &&
                    (isBookmark ? item.url === node.url : !item.url));
                let target = matched;
                if (matched) {
                    used.add(matched.id);
                    stats[isBookmark ? 'bookmarksReused' : 'foldersReused']++;
                } else {
                    target = await chrome.bookmarks.create({ parentId, title: node.title, ...(isBookmark ? { url: node.url } : {}) });
                    stats[isBookmark ? 'bookmarksCreated' : 'foldersCreated']++;
                }
                // 每个本地节点仅匹配一次，保留源收藏栏中的同名文件夹及重复收藏。
                if (!isBookmark) await merge(target.id, node.children);
            }
        }
        await merge(bar.id, snapshot.children);
        return stats;
    } catch (error) {
        throw new Error(`收藏栏合并中断（已新增 ${stats.foldersCreated} 个文件夹、${stats.bookmarksCreated} 条收藏）：${error.message}`);
    } finally {
        mergingSyncBookmarks = false;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const actions = { syncUploadBookmarks: uploadFnsBookmarks, syncListBookmarkDevices: listFnsBookmarkDevices, syncMergeBookmarks: () => mergeFnsBookmarks(request.path) };
    if (!Object.prototype.hasOwnProperty.call(actions, request.action)) return;
    actions[request.action]().then(result => sendResponse({ success: true, result })).catch(error => {
        console.error('FNS 同步失败:', error);
        sendResponse({ success: false, error: error.message });
    });
    return true;
});
