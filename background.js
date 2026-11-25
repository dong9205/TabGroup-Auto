importScripts('fns-sync.js');

// 从URL提取域名
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

// 从URL提取二级域名（如 a.p-pp.cn、b.c.p-pp.cn 均得到 p-pp.cn）
function getSecondLevelDomain(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    } catch (e) {
        return '';
    }
}

// 从 hostname 提取域名层级数组：level1=顶级(cn/xyz)，level2=二级(p-pp.cn)，level3=三级(a.p-pp.cn)…
// maxLevel 为参与比较的最大层级数，不足的用 '' 补齐
function getDomainLevels(url, maxLevel) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const parts = hostname.split('.');
        const levels = [];
        for (let k = 1; k <= Math.min(maxLevel, parts.length); k++) {
            levels.push(parts.slice(-k).join('.'));
        }
        while (levels.length < maxLevel) {
            levels.push('');
        }
        return levels;
    } catch (e) {
        return Array(maxLevel).fill('');
    }
}

// 排序标签页
async function sortTabsInGroup(groupId, sortMethod) {
    try {
        const tabs = await chrome.tabs.query({ groupId: groupId });
        if (tabs.length <= 1) return;

        const { domainSortMaxLevel = 4 } = await chrome.storage.local.get(['domainSortMaxLevel']);
        const maxLevel = Math.max(2, Math.min(10, parseInt(domainSortMaxLevel, 10) || 4));

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
                case 'domain2':
                    // 按二级域名排序，如 a.p-pp.cn、b.c.p-pp.cn 均按 p-pp.cn 排在一起
                    sortedTabs.sort((a, b) => {
                        const urlA = a.url || '';
                        const urlB = b.url || '';
                        if (!urlA && !urlB) return (a.id || 0) - (b.id || 0);
                        if (!urlA) return 1;
                        if (!urlB) return -1;
                        
                        const domainA = getSecondLevelDomain(urlA);
                        const domainB = getSecondLevelDomain(urlB);
                        if (domainA === domainB) {
                            return (a.id || 0) - (b.id || 0);
                        }
                        return domainA.localeCompare(domainB);
                    });
                    break;
                case 'domainLevel':
                    // 按域名层级排序：先顶级(cn/xyz)，再二级(p-pp.cn)，再三级(a.p-pp.cn)…，层级数由 domainSortMaxLevel 配置
                    sortedTabs.sort((a, b) => {
                        const urlA = a.url || '';
                        const urlB = b.url || '';
                        if (!urlA && !urlB) return (a.id || 0) - (b.id || 0);
                        if (!urlA) return 1;
                        if (!urlB) return -1;
                        const levelsA = getDomainLevels(urlA, maxLevel);
                        const levelsB = getDomainLevels(urlB, maxLevel);
                        for (let i = 0; i < maxLevel; i++) {
                            const c = (levelsA[i] || '').localeCompare(levelsB[i] || '');
                            if (c !== 0) return c;
                        }
                        return (a.id || 0) - (b.id || 0);
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

// 根据 ID 或标题解析出当前有效的标签组 ID（重启后仍有效）
async function resolveGroupId(groupId, groupTitle) {
    if (groupId != null && groupId !== '') {
        try {
            await chrome.tabGroups.get(parseInt(groupId));
            return parseInt(groupId);
        } catch (e) {}
    }
    if (groupTitle != null && groupTitle !== '') {
        const groups = await chrome.tabGroups.query({});
        const g = groups.find(x => (x.title || '未命名标签组') === groupTitle);
        if (g) return g.id;
    }
    return null;
}

// 按分组标题解析排序配置（重启后仍有效，兼容旧版按 ID 的配置）
async function getGroupSortSettings(groupId, groupSortSettings, defaultSortMethod) {
    try {
        const group = await chrome.tabGroups.get(groupId);
        const titleKey = group.title || '未命名标签组';
        const byTitle = groupSortSettings[titleKey];
        const byId = groupSortSettings[String(groupId)] || groupSortSettings[groupId];
        const s = byTitle || byId || {};
        return { autoSort: !!s.autoSort, sortMethod: s.sortMethod || defaultSortMethod };
    } catch (e) {
        return { autoSort: false, sortMethod: defaultSortMethod };
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
        // 获取设置（含 defaultGroupTitle / rule.groupTitle，重启后按标题解析有效 ID）
        const { defaultGroupId, defaultGroupTitle, groupSortSettings = {}, sortMethod = 'domain', urlRules = [], ignorePopup } = await chrome.storage.local.get(['defaultGroupId', 'defaultGroupTitle', 'groupSortSettings', 'sortMethod', 'urlRules', 'ignorePopup']);

        // 检查URL是否有效（不是新标签页等）
        if (!tab.url || tab.url === 'chrome://newtab/' || tab.url === 'about:newtab' || tab.url === 'edge://newtab/') {
            // URL无效或还未加载，等待URL更新事件处理
            return;
        }

        // 固定标签页不参与分组
        if (tab.pinned) {
            return;
        }

        // 独立窗口（如划词翻译、extension 的 panel 等）且用户开启了“不加入标签组”时，既不应用URL规则也不加入默认组
        const window = await chrome.windows.get(tab.windowId);
        const isPopupWindow = window.type !== 'normal';
        if (isPopupWindow && ignorePopup) {
            console.log('检测到独立窗口且设置了忽略，跳过分组（含URL规则）');
            return;
        }

        // 首先检查URL规则，如果匹配且启用了autoMove，则使用规则指定的标签组
        // 规则优先级高于默认标签组，即使标签页已经在某个组中，也要应用规则
        if (urlRules && urlRules.length > 0) {
            console.log('检查URL规则，当前URL:', tab.url, '规则数量:', urlRules.length);
            for (const rule of urlRules) {
                console.log('检查规则:', rule.pattern, 'autoMove:', rule.autoMove);
                // 检查规则是否有autoMove属性且为true
                if (rule.autoMove && matchesPattern(tab.url, rule.pattern)) {
                    console.log('URL规则匹配:', rule.pattern, '->', tab.url);
                    let ruleGroupId = await resolveGroupId(rule.groupId, rule.groupTitle);
                    // 规则匹配但标签组不存在时（例如该组下所有标签已关闭导致组被关闭），用 tabs.group 创建新组并移入标签
                    if (ruleGroupId == null) {
                        try {
                            // chrome.tabGroups.create 在部分环境不可用，改用 tabs.group 仅传 tabIds 会创建新组并返回 groupId
                            ruleGroupId = await chrome.tabs.group({ tabIds: tab.id });
                            const groupTitle = (rule.groupTitle && rule.groupTitle.trim()) || '未命名标签组';
                            await chrome.tabGroups.update(ruleGroupId, { title: groupTitle });
                            console.log('规则对应的标签组已关闭，已按规则标题创建新标签组:', groupTitle, 'id:', ruleGroupId);
                            // 标签已在新组中，下面只需做排序检查，跳过“移动到组”的步骤
                            const groupSettings = await getGroupSortSettings(ruleGroupId, groupSortSettings, sortMethod);
                            if (groupSettings.autoSort) {
                                triggerGroupSort(ruleGroupId, groupSettings.sortMethod).catch(err => {
                                    console.error('自动排序失败:', err);
                                });
                            }
                            return;
                        } catch (createErr) {
                            console.error('应用URL规则失败: 无法创建标签组', createErr, '规则:', rule);
                            continue;
                        }
                    }
                    try {
                        // 如果标签页已经在规则指定的组中，不需要移动
                        if (tab.groupId === ruleGroupId) {
                            console.log('标签页已在规则指定的标签组中');
                            return;
                        }

                        // 将标签页添加到规则指定的标签组
                        await chrome.tabs.group({
                            tabIds: tab.id,
                            groupId: ruleGroupId
                        });
                        console.log('标签页已移动到规则指定的标签组:', ruleGroupId);

                        // 检查该分组是否开启了自动排序（按标题匹配，重启后仍有效）
                        const groupSettings = await getGroupSortSettings(ruleGroupId, groupSortSettings, sortMethod);
                        if (groupSettings.autoSort) {
                            triggerGroupSort(ruleGroupId, groupSettings.sortMethod).catch(err => {
                                console.error('自动排序失败:', err);
                            });
                        }
                        return; // 规则匹配成功，不再处理默认标签组
                    } catch (error) {
                        console.error('应用URL规则失败:', error, '规则:', rule);
                        // 如果规则指定的标签组不存在，继续使用默认标签组
                    }
                }
            }
        }

        // 如果是通过标签组"+"按钮创建的标签页，不分组（仅对默认标签组）
        if (tab.groupId != chrome.tabGroups.TAB_GROUP_ID_NONE) {
            console.log('通过标签组"+"按钮创建的标签页，跳过分组');
            return;
        }

        // 如果没有匹配的URL规则，使用默认标签组（按 ID 或 defaultGroupTitle 解析，重启后仍有效）
        const effectiveDefaultGroupId = await resolveGroupId(defaultGroupId, defaultGroupTitle);
        if (effectiveDefaultGroupId) {
            try {
                // 将标签页添加到默认标签组
                await chrome.tabs.group({
                    tabIds: tab.id,
                    groupId: effectiveDefaultGroupId
                });

                // 检查该分组是否开启了自动排序（按标题匹配，重启后仍有效）
                const groupSettings = await getGroupSortSettings(effectiveDefaultGroupId, groupSortSettings, sortMethod);
                if (groupSettings.autoSort) {
                    triggerGroupSort(effectiveDefaultGroupId, groupSettings.sortMethod).catch(err => {
                        console.error('自动排序失败:', err);
                    });
                }
            } catch (error) {
                console.error('加入默认标签组失败:', error);
            }
        }
    } catch (error) {
        console.error('标签组不存在:', error);
    }
}

// URL模式匹配
function matchesPattern(url, pattern) {
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
    return new RegExp(regexPattern).test(url);
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
                const groupSettings = await getGroupSortSettings(tab.groupId, groupSortSettings, sortMethod);
                if (groupSettings.autoSort) {
                    const method = groupSettings.sortMethod;
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
            const groupSettings = await getGroupSortSettings(tab.groupId, groupSortSettings, sortMethod);
            if (groupSettings.autoSort) {
                triggerGroupSort(tab.groupId, groupSettings.sortMethod).catch(err => {
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

    if (request.action === 'syncUploadGroupedTabs') {
        handleSyncUploadGroupedTabs().then((result) => {
            sendResponse({ success: true, result });
        }).catch(error => {
            console.error('同步上传失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (request.action === 'syncPullRestoreGroupedTabs') {
        handleSyncPullRestoreGroupedTabs().then((result) => {
            sendResponse({ success: true, result });
        }).catch(error => {
            console.error('同步拉取/复原失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (request.action === 'syncUploadConfig') {
        handleSyncUploadConfig().then((result) => {
            sendResponse({ success: true, result });
        }).catch(error => {
            console.error('配置同步上传失败:', error);
            sendResponse({ success: false, error: (error && (error.message || String(error))) || '配置上传失败' });
        });
        return true;
    }

    if (request.action === 'syncPullConfig') {
        handleSyncPullConfig().then((result) => {
            sendResponse({ success: true, result });
        }).catch(error => {
            console.error('配置同步拉取失败:', error);
            sendResponse({ success: false, error: (error && (error.message || String(error))) || '配置拉取失败' });
        });
        return true;
    }
});

// 排序所有标签页
async function sortAllTabs(sortMethod) {
    try {
        const { groupSortSettings = {}, sortMethod: defaultSortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
        const groups = await chrome.tabGroups.query({});
        
        for (const group of groups) {
            const titleKey = group.title || '未命名标签组';
            const byTitle = groupSortSettings[titleKey];
            const byId = groupSortSettings[String(group.id)] || groupSortSettings[group.id];
            const s = byTitle || byId;
            const method = (s && s.sortMethod) || sortMethod || defaultSortMethod;
            await sortTabsInGroup(group.id, method);
        }
    } catch (error) {
        console.error('排序所有标签页失败:', error);
        throw error;
    }
}

function isSyncableUrl(url) {
    if (!url) return false;
    // 仅同步可跨设备正常打开的 URL
    return /^https?:\/\//i.test(url);
}

async function getSyncConfigOrThrow() {
    const { syncWorkerBaseUrl = '', syncPassphrase = '' } = await chrome.storage.local.get(['syncWorkerBaseUrl', 'syncPassphrase']);
    const defaultBaseUrl = 'https://tab.p-pp.xyz';
    const baseUrl = ((syncWorkerBaseUrl || '').trim() || defaultBaseUrl).replace(/\/+$/, '');
    const passphrase = (syncPassphrase || '').trim();
    if (!baseUrl) {
        throw new Error('未配置 Worker 地址，请在选项页设置');
    }
    if (!passphrase) {
        throw new Error('未配置同步口令，请在选项页设置');
    }
    return { baseUrl, passphrase };
}

async function getOrCreateSyncDeviceId() {
    const { syncDeviceId } = await chrome.storage.local.get(['syncDeviceId']);
    if (syncDeviceId) return syncDeviceId;

    let id = '';
    if (crypto && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
    } else {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    await chrome.storage.local.set({ syncDeviceId: id });
    return id;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveAesGcmKeyFromPassphrase(passphrase) {
    return deriveAesGcmKeyFromPassphraseWithSalt(passphrase, new TextEncoder().encode('tabgroup-auto-sync-v1'));
}

async function deriveAesGcmKeyFromPassphraseWithSalt(passphrase, saltBytes) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 300000,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
}

function randomBytesBase64(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return arrayBufferToBase64(bytes.buffer);
}

async function encryptSnapshot(passphrase, snapshot) {
    // 每次加密使用随机 KDF salt，降低跨用户/跨版本的预计算攻击收益
    const kdfSaltBase64 = randomBytesBase64(16);
    const kdfSaltBytes = new Uint8Array(base64ToArrayBuffer(kdfSaltBase64));
    const key = await deriveAesGcmKeyFromPassphraseWithSalt(passphrase, kdfSaltBytes);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
        kdfSaltBase64,
        ivBase64: arrayBufferToBase64(iv.buffer),
        ciphertextBase64: arrayBufferToBase64(ciphertext)
    };
}

async function decryptSnapshot(passphrase, ivBase64, ciphertextBase64, kdfSaltBase64) {
    // 兼容旧数据：旧版本使用固定 salt（tabgroup-auto-sync-v1）且没有 kdfSalt 字段
    let key;
    if (kdfSaltBase64) {
        const kdfSaltBytes = new Uint8Array(base64ToArrayBuffer(kdfSaltBase64));
        key = await deriveAesGcmKeyFromPassphraseWithSalt(passphrase, kdfSaltBytes);
    } else {
        key = await deriveAesGcmKeyFromPassphrase(passphrase);
    }
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const text = new TextDecoder().decode(new Uint8Array(plaintext));
    return JSON.parse(text);
}

async function collectGroupedTabsSnapshot() {
    const windows = await chrome.windows.getAll({ populate: true });
    const groupIdToTabs = new Map();
    let skippedUrlCount = 0;

    for (const w of windows) {
        const tabs = w.tabs || [];
        for (const tab of tabs) {
            if (tab.groupId == null || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) continue;
            if (!isSyncableUrl(tab.url)) {
                skippedUrlCount++;
                continue;
            }
            const groupId = tab.groupId;
            if (!groupIdToTabs.has(groupId)) {
                groupIdToTabs.set(groupId, []);
            }
            groupIdToTabs.get(groupId).push({
                url: tab.url,
                pinned: !!tab.pinned
            });
        }
    }

    const groupIds = Array.from(groupIdToTabs.keys());
    const groups = [];
    let groupKeyCounter = 1;

    // 先取元数据，再做排序，确保跨设备稳定
    const metas = [];
    for (const groupId of groupIds) {
        try {
            const meta = await chrome.tabGroups.get(groupId);
            metas.push({ groupId, meta });
        } catch (e) {
            // 组已不存在，跳过
        }
    }

    metas.sort((a, b) => {
        const titleA = (a.meta.title || '未命名标签组');
        const titleB = (b.meta.title || '未命名标签组');
        const c = titleA.localeCompare(titleB);
        if (c !== 0) return c;
        return (a.groupId || 0) - (b.groupId || 0);
    });

    let totalTabCount = 0;

    for (const item of metas) {
        const groupId = item.groupId;
        const meta = item.meta;
        const tabs = groupIdToTabs.get(groupId) || [];
        // 去重（同组内同 URL 只保留 1 个）
        const seen = new Set();
        const uniqueTabs = [];
        for (const t of tabs) {
            if (!t.url || seen.has(t.url)) continue;
            seen.add(t.url);
            uniqueTabs.push(t);
        }
        if (uniqueTabs.length === 0) continue;

        groups.push({
            groupKey: `g${groupKeyCounter++}`,
            title: meta.title || '未命名标签组',
            color: meta.color || 'blue',
            collapsed: !!meta.collapsed,
            tabs: uniqueTabs
        });
        totalTabCount += uniqueTabs.length;
    }

    const snapshot = {
        v: 1,
        capturedAt: Date.now(),
        groups
    };

    return {
        snapshot,
        stats: {
            groupCount: groups.length,
            tabCount: totalTabCount,
            skippedUrlCount
        }
    };
}

async function ensureGroupInWindow(windowId, group, existingGroups) {
    const title = group.title || '未命名标签组';
    const color = group.color || 'blue';

    const match = existingGroups.find(g => (g.title || '未命名标签组') === title && (g.color || 'blue') === color);
    if (match) {
        try {
            await chrome.tabGroups.update(match.id, { title, color, collapsed: !!group.collapsed });
        } catch (e) {
            // ignore
        }
        return { groupId: match.id, created: false };
    }

    // 创建新组：优先用“未分组”的已存在同 URL tab 作为种子，避免重复打开
    let seedTabId = null;
    const seed = (group.tabs && group.tabs.length > 0) ? group.tabs[0] : null;
    if (seed && seed.url) {
        const tabs = await chrome.tabs.query({ windowId });
        const reusable = tabs.find(t => t.url === seed.url && t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
        if (reusable) {
            seedTabId = reusable.id;
        }
    }

    if (!seedTabId) {
        if (!seed || !seed.url) {
            throw new Error('无法创建分组：缺少种子标签页 URL');
        }
        const created = await chrome.tabs.create({ windowId, url: seed.url, active: false, pinned: !!seed.pinned });
        seedTabId = created.id;
    }

    const groupId = await chrome.tabs.group({ tabIds: [seedTabId] });
    await chrome.tabGroups.update(groupId, { title, color, collapsed: !!group.collapsed });
    existingGroups.push({ id: groupId, title, color, collapsed: !!group.collapsed, windowId });
    return { groupId, created: true };
}

async function restoreGroupedTabsSnapshotToCurrentWindow(snapshot) {
    if (!snapshot || snapshot.v !== 1) {
        throw new Error('快照格式不支持');
    }
    const groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id;
    if (windowId == null) {
        throw new Error('无法获取当前窗口');
    }

    let groupsCreated = 0;
    let groupsReused = 0;
    let tabsCreated = 0;
    let tabsReused = 0;
    let skippedUrlCount = 0;

    let existingGroups = await chrome.tabGroups.query({ windowId });
    let existingTabs = await chrome.tabs.query({ windowId });

    function findTabByUrl(url) {
        return existingTabs.find(t => t.url === url);
    }

    for (const group of groups) {
        const groupTabs = Array.isArray(group.tabs) ? group.tabs : [];
        const syncableTabs = groupTabs.filter(t => isSyncableUrl(t.url));
        skippedUrlCount += (groupTabs.length - syncableTabs.length);
        if (syncableTabs.length === 0) continue;

        const ensured = await ensureGroupInWindow(windowId, { ...group, tabs: syncableTabs }, existingGroups);
        if (ensured.created) groupsCreated++;
        else groupsReused++;
        const targetGroupId = ensured.groupId;

        for (const t of syncableTabs) {
            const url = t.url;
            if (!url) continue;
            let tab = findTabByUrl(url);
            if (tab) {
                tabsReused++;
            } else {
                tab = await chrome.tabs.create({ windowId, url, active: false, pinned: !!t.pinned });
                existingTabs.push(tab);
                tabsCreated++;
            }

            try {
                if (tab.groupId !== targetGroupId) {
                    await chrome.tabs.group({ tabIds: tab.id, groupId: targetGroupId });
                    // groupId 可能变化，刷新本地缓存
                    existingTabs = existingTabs.map(x => (x.id === tab.id ? { ...x, groupId: targetGroupId } : x));
                }
            } catch (e) {
                console.error('将标签页加入同步分组失败:', e);
            }

            // pinned: 只在需要置顶时尝试置顶，避免打扰用户已置顶的 tab
            if (t.pinned && !tab.pinned) {
                try {
                    await chrome.tabs.update(tab.id, { pinned: true });
                    existingTabs = existingTabs.map(x => (x.id === tab.id ? { ...x, pinned: true } : x));
                } catch (e) {
                    console.error('置顶标签页失败:', e);
                }
            }
        }
    }

    return {
        windowId,
        groupsCreated,
        groupsReused,
        tabsCreated,
        tabsReused,
        skippedUrlCount
    };
}

async function handleSyncUploadGroupedTabs() {
    const { baseUrl, passphrase } = await getSyncConfigOrThrow();
    const deviceId = await getOrCreateSyncDeviceId();
    const workspaceId = await sha256Hex(`tab-sync:${passphrase}`);

    const { snapshot, stats } = await collectGroupedTabsSnapshot();
    const snapshotWithMeta = {
        ...snapshot,
        deviceId
    };
    const encrypted = await encryptSnapshot(passphrase, snapshotWithMeta);

    const payload = {
        v: 1,
        updatedAt: Date.now(),
        deviceId,
        kdfSalt: encrypted.kdfSaltBase64,
        iv: encrypted.ivBase64,
        ciphertext: encrypted.ciphertextBase64
    };

    const url = `${baseUrl}/v1/snapshot/${workspaceId}`;
    const resp = await fetch(url, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`上传失败: ${resp.status} ${text || resp.statusText}`);
    }

    return {
        workspaceId,
        ...stats
    };
}

async function handleSyncPullRestoreGroupedTabs() {
    const { baseUrl, passphrase } = await getSyncConfigOrThrow();
    const workspaceId = await sha256Hex(`tab-sync:${passphrase}`);
    const url = `${baseUrl}/v1/snapshot/${workspaceId}`;

    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            'accept': 'application/json'
        }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`拉取失败: ${resp.status} ${text || resp.statusText}`);
    }

    const payload = await resp.json();
    if (!payload || payload.v !== 1 || !payload.iv || !payload.ciphertext) {
        throw new Error('云端数据格式不正确');
    }

    const snapshot = await decryptSnapshot(passphrase, payload.iv, payload.ciphertext, payload.kdfSalt);
    return restoreGroupedTabsSnapshotToCurrentWindow(snapshot);
}

function pickConfigForSync(storageObj) {
    // 仅同步扩展配置，不同步敏感/设备相关字段
    const allowList = [
        'defaultGroupTitle',
        'ignorePopup',
        'urlRules',
        'groupSortSettings',
        'sortMethod',
        'domainSortMaxLevel'
    ];
    const result = {};
    for (const k of allowList) {
        if (Object.prototype.hasOwnProperty.call(storageObj, k)) {
            result[k] = storageObj[k];
        }
    }

    // 不同步 defaultGroupId（跨设备不稳定），由 defaultGroupTitle 在本机解析
    result.defaultGroupId = null;
    return result;
}

async function handleSyncUploadConfig() {
    if (await isFnsSyncSelected()) return uploadFnsConfig();
    const { baseUrl, passphrase } = await getSyncConfigOrThrow();
    const deviceId = await getOrCreateSyncDeviceId();
    const workspaceId = await sha256Hex(`tab-sync:${passphrase}`);

    const all = await chrome.storage.local.get(null);
    const config = pickConfigForSync(all);

    const payloadPlain = {
        v: 1,
        updatedAt: Date.now(),
        deviceId,
        config
    };
    const encrypted = await encryptSnapshot(passphrase, payloadPlain);

    const payload = {
        v: 1,
        updatedAt: payloadPlain.updatedAt,
        deviceId,
        kdfSalt: encrypted.kdfSaltBase64,
        iv: encrypted.ivBase64,
        ciphertext: encrypted.ciphertextBase64
    };

    const url = `${baseUrl}/v1/config/${workspaceId}`;
    const resp = await fetch(url, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`上传失败: ${resp.status} ${text || resp.statusText} (${url})`);
    }

    const rules = Array.isArray(config.urlRules) ? config.urlRules.length : 0;
    const groups = config.groupSortSettings ? Object.keys(config.groupSortSettings).length : 0;
    return {
        workspaceId,
        urlRuleCount: rules,
        groupSortSettingCount: groups
    };
}

async function handleSyncPullConfig() {
    if (await isFnsSyncSelected()) return pullFnsConfig();
    const { baseUrl, passphrase } = await getSyncConfigOrThrow();
    const workspaceId = await sha256Hex(`tab-sync:${passphrase}`);
    const url = `${baseUrl}/v1/config/${workspaceId}`;

    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            'accept': 'application/json'
        }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`拉取失败: ${resp.status} ${text || resp.statusText} (${url})`);
    }

    const payload = await resp.json();
    if (!payload || payload.v !== 1 || !payload.iv || !payload.ciphertext) {
        throw new Error('云端数据格式不正确');
    }

    const decrypted = await decryptSnapshot(passphrase, payload.iv, payload.ciphertext, payload.kdfSalt);
    if (!decrypted || decrypted.v !== 1 || !decrypted.config) {
        throw new Error('解密后的配置数据格式不正确');
    }

    // Replace semantics: 覆盖这些 key（仅 allowList），其他本机数据不动（例如 syncWorkerBaseUrl/syncPassphrase）
    const config = pickConfigForSync(decrypted.config);
    await chrome.storage.local.set(config);

    const rules = Array.isArray(config.urlRules) ? config.urlRules.length : 0;
    const groups = config.groupSortSettings ? Object.keys(config.groupSortSettings).length : 0;
    return {
        urlRuleCount: rules,
        groupSortSettingCount: groups
    };
}
