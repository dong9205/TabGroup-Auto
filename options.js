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
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    currentGroups = groups;

    // 更新选择框
    updateGroupSelects(groups);
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

// 加载设置
async function loadSettings() {
    const settings = await chrome.storage.local.get(['defaultGroupTitle', 'ignorePopup']);
    if (settings.defaultGroupTitle) {
        // 根据 title 查找 groupId
        const group = currentGroups.find(g => (g.title || '未命名标签组') === settings.defaultGroupTitle);
        if (group) {
            groupSelect.value = group.id;
        }
    }
    ignorePopup.checked = settings.ignorePopup || false;
}

// 保存设置
async function saveSettings() {
    // 保存选中的 group 的 title
    let defaultGroupTitle = '';
    if (groupSelect.value) {
        const group = currentGroups.find(g => g.id == groupSelect.value);
        defaultGroupTitle = group ? (group.title || '未命名标签组') : '';
    }
    const settings = {
        defaultGroupTitle,
        ignorePopup: ignorePopup.checked
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

// 加载URL规则
async function loadRules() {
    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
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
                ruleItem.innerHTML = `
                    <span>${rule.pattern}</span>
                    <button onclick="deleteRule(${rules.indexOf(rule)})">删除</button>
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
            ruleItem.innerHTML = `
                <span>${rule.pattern}</span>
                <button onclick="deleteRule(${rules.indexOf(rule)})">删除</button>
            `;
            rulesList.appendChild(ruleItem);
        });
    }
}

// 获取标签组标题
function getGroupTitle(groupId) {
    const group = currentGroups.find(g => g.id === parseInt(groupId));
    return group ? (group.title || '未命名标签组') : '未知标签组';
}

// 添加新规则
async function addRule() {
    if (!urlPattern.value.trim() || !ruleGroupSelect.value) {
        showNotification('请输入URL规则并选择标签组', 'error');
        return;
    }

    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    urlRules.push({
        pattern: urlPattern.value,
        groupId: ruleGroupSelect.value
    });

    await chrome.storage.local.set({ urlRules });
    updateRulesList(urlRules);
    urlPattern.value = '';
    ruleGroupSelect.value = '';
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
    const config = await chrome.storage.local.get(['defaultGroupId', 'ignorePopup', 'urlRules']);
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

// 应用规则到所有标签页
async function applyRulesToAllTabs() {
    const { urlRules = [] } = await chrome.storage.local.get(['urlRules']);
    const tabs = await chrome.tabs.query({});
    const forceMove = document.getElementById('forceMove').checked;
    let updatedCount = 0;

    for (const tab of tabs) {
        for (const rule of urlRules) {
            if (matchesPattern(tab.url, rule.pattern)) {
                try {
                    // 根据forceMove设置决定是否处理已分组的标签页
                    if (forceMove || !tab.groupId) {
                        await chrome.tabs.group({
                            tabIds: tab.id,
                            groupId: parseInt(rule.groupId)
                        });
                        updatedCount++;
                    }
                    break;
                } catch (error) {
                    console.error('Error applying rule:', error);
                }
            }
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

// 颜色值转换
function convertColorToOption(color) {
    const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
    return colors[Math.floor(Math.random() * colors.length)];
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
    document.getElementById('createGroupButton').addEventListener('click', createGroup);
    document.getElementById('addRuleButton').addEventListener('click', addRule);
    document.getElementById('applyRulesButton').addEventListener('click', applyRulesToAllTabs);
});