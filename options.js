// 存储当前所有标签组的信息
let currentGroups = [];

// DOM 元素
const groupSelect = document.getElementById('groupSelect');
const ruleGroupSelect = document.getElementById('ruleGroupSelect');
const ignorePopup = document.getElementById('ignorePopup');
const urlPattern = document.getElementById('urlPattern');
const rulesList = document.getElementById('rulesList');
const newGroupTitle = document.getElementById('newGroupTitle');
const newGroupColor = document.getElementById('newGroupColor');

// 初始化页面
async function initializePage() {
    await loadGroups();
    await loadSettings();
    await loadRules();

    // 添加导入导出按钮事件监听
    document.getElementById('exportButton').addEventListener('click', exportConfig);
    document.getElementById('importButton').addEventListener('click', importConfig);
}

// 加载所有标签组
async function loadGroups() {
    const groups = await chrome.tabGroups.query({});
    currentGroups = groups;

    // 更新选择框
    updateGroupSelects(groups);
    
    // 更新分组排序列表
    updateGroupSortList(groups);
}

// 更新标签组选择框
function updateGroupSelects(groups) {
    // 清空现有选项
    groupSelect.innerHTML = '<option value="">选择默认标签组...</option>';
    ruleGroupSelect.innerHTML = '<option value="">选择标签组...</option>';

    // 添加标签组选项
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.title || '未命名标签组';
        groupSelect.appendChild(option.cloneNode(true));
        ruleGroupSelect.appendChild(option.cloneNode(true));
    });
}

// 更新分组排序列表
function updateGroupSortList(groups) {
    const groupSortList = document.getElementById('groupSortList');
    if (!groupSortList) return;
    
    groupSortList.innerHTML = '';
    
    if (groups.length === 0) {
        groupSortList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无标签组</div>';
        return;
    }
    
    groups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'group-sort-item';
        groupItem.innerHTML = `
            <label>
                <input type="checkbox" class="group-auto-sort" data-group-id="${group.id}" style="margin-right: 10px;">
                <span style="flex: 1;">${group.title || '未命名标签组'}</span>
                <select class="group-sort-method" data-group-id="${group.id}">
                    <option value="domain">按域名排序</option>
                    <option value="domain2">按二级域名排序</option>
                    <option value="domainLevel">按域名层级排序</option>
                    <option value="url">按URL排序</option>
                    <option value="title">按标题排序</option>
                    <option value="created">按创建时间</option>
                </select>
            </label>
        `;
        groupSortList.appendChild(groupItem);
    });
    
    // 加载已保存的排序配置
    loadGroupSortSettings();
}

// 加载分组排序配置（按标题匹配，重启后仍有效；同 ID 键兼容旧数据）
async function loadGroupSortSettings() {
    const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
    
    // 设置默认排序方式
    const sortMethodSelect = document.getElementById('sortMethod');
    if (sortMethodSelect && sortMethod) {
        sortMethodSelect.value = sortMethod;
    }
    
    const defaultSort = sortMethod || 'domain';
    currentGroups.forEach(group => {
        const groupId = group.id;
        const titleKey = group.title || '未命名标签组';
        const groupIdKey = String(groupId);
        const settings = groupSortSettings[titleKey] || groupSortSettings[groupIdKey] || groupSortSettings[groupId] || { autoSort: false, sortMethod: defaultSort };
        
        const checkbox = document.querySelector(`.group-auto-sort[data-group-id="${groupId}"]`);
        const select = document.querySelector(`.group-sort-method[data-group-id="${groupId}"]`);
        
        if (checkbox) {
            checkbox.checked = settings.autoSort || false;
        }
        if (select) {
            select.value = settings.sortMethod || defaultSort;
        }
    });
}

// 保存分组排序配置（按分组标题存储，浏览器重启后仍可恢复）
async function saveGroupSortSettings() {
    const groupSortSettings = {};
    
    currentGroups.forEach(group => {
        const groupId = group.id;
        const checkbox = document.querySelector(`.group-auto-sort[data-group-id="${groupId}"]`);
        const select = document.querySelector(`.group-sort-method[data-group-id="${groupId}"]`);
        
        if (checkbox && select) {
            const titleKey = group.title || '未命名标签组';
            groupSortSettings[titleKey] = {
                autoSort: checkbox.checked,
                sortMethod: select.value
            };
        }
    });
    
    await chrome.storage.local.set({ groupSortSettings });
    showNotification('排序配置已保存');
}

// 加载设置（支持 defaultGroupId / defaultGroupTitle，重启后按标题恢复）
async function loadSettings() {
    const settings = await chrome.storage.local.get(['defaultGroupId', 'defaultGroupTitle', 'ignorePopup', 'sortMethod', 'domainSortMaxLevel']);
    const hasGroupById = settings.defaultGroupId != null && currentGroups.some(g => g.id == settings.defaultGroupId);
    if (hasGroupById) {
        groupSelect.value = settings.defaultGroupId;
    } else if (settings.defaultGroupTitle) {
        const group = currentGroups.find(g => (g.title || '未命名标签组') === settings.defaultGroupTitle);
        if (group) {
            groupSelect.value = group.id;
        }
    }
    ignorePopup.checked = settings.ignorePopup || false;
    
    const sortMethodSelect = document.getElementById('sortMethod');
    if (sortMethodSelect && settings.sortMethod) {
        sortMethodSelect.value = settings.sortMethod;
    }
    const domainSortMaxLevelEl = document.getElementById('domainSortMaxLevel');
    if (domainSortMaxLevelEl != null && settings.domainSortMaxLevel != null) {
        const n = Math.max(2, Math.min(10, parseInt(settings.domainSortMaxLevel, 10) || 4));
        domainSortMaxLevelEl.value = String(n);
    }
}

// 保存设置（同时存 defaultGroupId 与 defaultGroupTitle，重启后后台按标题解析）
async function saveSettings() {
    let defaultGroupId = null;
    let defaultGroupTitle = '';
    if (groupSelect.value) {
        const group = currentGroups.find(g => g.id == groupSelect.value);
        if (group) {
            defaultGroupId = group.id;
            defaultGroupTitle = group.title || '未命名标签组';
        }
    }
    const sortMethodSelect = document.getElementById('sortMethod');
    const domainSortMaxLevelEl = document.getElementById('domainSortMaxLevel');
    let domainSortMaxLevel = 4;
    if (domainSortMaxLevelEl) {
        domainSortMaxLevel = Math.max(2, Math.min(10, parseInt(domainSortMaxLevelEl.value, 10) || 4));
    }
    const settings = {
        defaultGroupId,
        defaultGroupTitle,
        ignorePopup: ignorePopup.checked,
        sortMethod: sortMethodSelect ? sortMethodSelect.value : 'domain',
        domainSortMaxLevel
    };
    await chrome.storage.local.set(settings);
    showNotification('设置已保存');
}

// 创建新标签组
async function createGroup() {
    if (!newGroupTitle.value.trim()) {
        showNotification('请输入标签组名称', 'error');
        return;
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const group = await chrome.tabGroups.create({
                windowId: tabs[0].windowId
            });
            await chrome.tabGroups.update(group.id, {
                title: newGroupTitle.value,
                color: convertColorToOption(newGroupColor.value)
            });
            await loadGroups();
            newGroupTitle.value = '';
            showNotification('标签组创建成功');
        }
    } catch (error) {
        showNotification('创建标签组失败', 'error');
        console.error('Error creating group:', error);
    }
}

// 加载URL规则（为缺少 groupTitle 的旧规则按当前组补全，便于重启后后台按标题解析）
async function loadRules() {
    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    let changed = false;
    for (const rule of urlRules) {
        if (!rule.groupTitle && rule.groupId != null && rule.groupId !== '') {
            const g = currentGroups.find(c => c.id == rule.groupId || c.id === parseInt(rule.groupId));
            if (g) {
                rule.groupTitle = g.title || '未命名标签组';
                changed = true;
            }
        }
    }
    if (changed) {
        await chrome.storage.local.set({ urlRules });
    }
    updateRulesList(urlRules);
}

// 更新规则列表显示
function updateRulesList(rules) {
    rulesList.innerHTML = '';

    // 按标签组ID对规则进行分组
    const rulesByGroup = {};
    rules.forEach(rule => {
        if (!rulesByGroup[rule.groupId]) {
            rulesByGroup[rule.groupId] = [];
        }
        rulesByGroup[rule.groupId].push(rule);
    });

    // 遍历每个标签组
    currentGroups.forEach(group => {
        const groupRules = rulesByGroup[group.id] || [];
        if (groupRules.length > 0) {
            // 创建标签组标题
            const groupTitle = document.createElement('div');
            groupTitle.className = 'group-title';
            groupTitle.textContent = group.title || '未命名标签组';
            rulesList.appendChild(groupTitle);

            // 创建该标签组下的所有规则
            groupRules.forEach((rule, index) => {
                const ruleItem = document.createElement('div');
                ruleItem.className = 'rule-item';
                const ruleIndex = rules.indexOf(rule);
                const autoMoveChecked = rule.autoMove ? 'checked' : '';
                ruleItem.innerHTML = `
                    <div style="display: flex; align-items: center; flex: 1;">
                        <input type="checkbox" class="rule-auto-move" data-rule-index="${ruleIndex}" ${autoMoveChecked} style="margin-right: 10px;">
                        <span>${rule.pattern}</span>
                    </div>
                    <button onclick="deleteRule(${ruleIndex})">删除</button>
                `;
                rulesList.appendChild(ruleItem);
            });
        }
    });

    // 处理未知标签组的规则
    const unknownGroupRules = rules.filter(rule =>
        !currentGroups.some(group => group.id === parseInt(rule.groupId)));

    if (unknownGroupRules.length > 0) {
        const unknownTitle = document.createElement('div');
        unknownTitle.className = 'group-title';
        unknownTitle.textContent = '未知标签组';
        rulesList.appendChild(unknownTitle);

        unknownGroupRules.forEach((rule, index) => {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'rule-item';
            const ruleIndex = rules.indexOf(rule);
            const autoMoveChecked = rule.autoMove ? 'checked' : '';
            ruleItem.innerHTML = `
                <div style="display: flex; align-items: center; flex: 1;">
                    <input type="checkbox" class="rule-auto-move" data-rule-index="${ruleIndex}" ${autoMoveChecked} style="margin-right: 10px;">
                    <span>${rule.pattern}</span>
                </div>
                <button onclick="deleteRule(${ruleIndex})">删除</button>
            `;
            rulesList.appendChild(ruleItem);
        });
    }

    // 为所有勾选框添加事件监听器
    rulesList.querySelectorAll('.rule-auto-move').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const ruleIndex = parseInt(e.target.dataset.ruleIndex);
            const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
            if (urlRules[ruleIndex]) {
                urlRules[ruleIndex].autoMove = e.target.checked;
                await chrome.storage.local.set({ urlRules });
            }
        });
    });
}

// 添加新规则
async function addRule() {
    if (!urlPattern.value.trim() || !ruleGroupSelect.value) {
        showNotification('请输入URL规则并选择标签组', 'error');
        return;
    }

    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    const ruleAutoMove = document.getElementById('ruleAutoMove');
    const selectedGroup = currentGroups.find(g => g.id == ruleGroupSelect.value);
    urlRules.push({
        pattern: urlPattern.value,
        groupId: ruleGroupSelect.value,
        groupTitle: selectedGroup ? (selectedGroup.title || '未命名标签组') : '',
        autoMove: ruleAutoMove ? ruleAutoMove.checked : false
    });

    await chrome.storage.local.set({ urlRules });
    updateRulesList(urlRules);
    urlPattern.value = '';
    ruleGroupSelect.value = '';
    if (ruleAutoMove) ruleAutoMove.checked = false;
    showNotification('规则添加成功');
}

// 删除规则
async function deleteRule(index) {
    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    urlRules.splice(index, 1);
    await chrome.storage.local.set({ urlRules });
    updateRulesList(urlRules);
    showNotification('规则已删除');
}

// 导出配置
async function exportConfig() {
    const config = await chrome.storage.local.get(['defaultGroupId', 'defaultGroupTitle', 'ignorePopup', 'urlRules', 'groupSortSettings', 'sortMethod', 'domainSortMaxLevel']);
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'tab-edge-config.json';
    a.click();

    URL.revokeObjectURL(url);
    showNotification('配置导出成功');
}

// 导入配置
async function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const config = JSON.parse(event.target.result);
                    await chrome.storage.local.set(config);
                    await initializePage();
                    showNotification('配置导入成功');
                } catch (error) {
                    showNotification('配置文件格式错误', 'error');
                }
            };
            reader.readAsText(file);
        } catch (error) {
            showNotification('导入配置失败', 'error');
        }
    };

    input.click();
}

// 根据 rule.groupId 或 rule.groupTitle 解析出当前有效的标签组 ID（重启后仍有效）
function resolveRuleGroupId(rule) {
    const gById = currentGroups.find(g => g.id == rule.groupId || g.id === parseInt(rule.groupId));
    if (gById) return gById.id;
    if (rule.groupTitle) {
        const gByTitle = currentGroups.find(g => (g.title || '未命名标签组') === rule.groupTitle);
        if (gByTitle) return gByTitle.id;
    }
    return null;
}

// 应用规则到所有标签页
async function applyRulesToAllTabs() {
    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    const tabs = await chrome.tabs.query({});
    const forceMove = document.getElementById('forceMove').checked;
    let updatedCount = 0;
    const groupsWithMovedTabs = new Set();

    for (const tab of tabs) {
        if (tab.pinned) continue;
        for (const rule of urlRules) {
            if (matchesPattern(tab.url, rule.pattern)) {
                try {
                    if (forceMove || tab.groupId === -1) {
                        const groupId = resolveRuleGroupId(rule);
                        if (groupId == null) continue;
                        await chrome.tabs.group({
                            tabIds: tab.id,
                            groupId: groupId
                        });
                        groupsWithMovedTabs.add(groupId);
                        updatedCount++;
                    }
                    break;
                } catch (error) {
                    console.error('Error applying rule:', error);
                }
            }
        }
    }

    // 对移动了标签页的分组进行排序（按标题匹配配置，重启后仍有效）
    if (groupsWithMovedTabs.size > 0) {
        try {
            const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
            setTimeout(async () => {
                for (const groupId of groupsWithMovedTabs) {
                    const group = currentGroups.find(g => g.id === groupId || g.id === parseInt(groupId));
                    const titleKey = group ? (group.title || '未命名标签组') : '';
                    const groupSettings = titleKey ? (groupSortSettings[titleKey] || groupSortSettings[String(groupId)] || groupSortSettings[groupId]) : (groupSortSettings[String(groupId)] || groupSortSettings[groupId]);
                    if (groupSettings && groupSettings.autoSort) {
                        const method = groupSettings.sortMethod || sortMethod;
                        await chrome.runtime.sendMessage({
                            action: 'sortGroup',
                            groupId: groupId,
                            sortMethod: method
                        });
                    }
                }
            }, 300);
        } catch (error) {
            console.error('触发排序失败:', error);
        }
    }

    showNotification(`已更新 ${updatedCount} 个标签页`);
}

// URL模式匹配
function matchesPattern(url, pattern) {
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
    return new RegExp(regexPattern).test(url);
}

// 将十六进制颜色转换为 Chrome 标签组支持的颜色名称
function convertColorToOption(hex) {
    const colors = {
        '#1a73e8': 'blue',
        '#d93025': 'red',
        '#188038': 'green',
        '#f29900': 'yellow',
        '#9334e6': 'purple',
        '#fa903e': 'orange',
        '#1e88e5': 'cyan',
        '#e67c73': 'pink',
        '#666666': 'grey'
    };
    let minDistance = Infinity;
    let closestColor = 'blue';
    for (const [colorHex, colorName] of Object.entries(colors)) {
        const distance = compareColors(hex, colorHex);
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = colorName;
        }
    }
    return closestColor;
}

function compareColors(hex1, hex2) {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    return Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
    );
}

// 显示通知
function showNotification(message, type = 'success') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '4px';
    notification.style.backgroundColor = type === 'success' ? '#4CAF50' : '#f44336';
    notification.style.color = 'white';
    notification.style.zIndex = '1000';

    document.body.appendChild(notification);

    // 3秒后移除通知
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    document.getElementById('saveButton').addEventListener('click', saveSettings);
    document.getElementById('saveSortSettingsButton').addEventListener('click', saveGroupSortSettings);
    document.getElementById('createGroupButton').addEventListener('click', createGroup);
    document.getElementById('addRuleButton').addEventListener('click', addRule);
    document.getElementById('applyRulesButton').addEventListener('click', applyRulesToAllTabs);
});