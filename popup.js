document.addEventListener('DOMContentLoaded', async () => {
  const groupSelect = document.getElementById('groupSelect');
  const ruleGroupSelect = document.getElementById('ruleGroupSelect');
  const saveButton = document.getElementById('saveButton');
  const ignorePopup = document.getElementById('ignorePopup');
  const urlPattern = document.getElementById('urlPattern');
  const addRuleButton = document.getElementById('addRuleButton');
  const rulesList = document.getElementById('rulesList');
  const newGroupTitle = document.getElementById('newGroupTitle');
  const newGroupColor = document.getElementById('newGroupColor');
  const createGroupButton = document.getElementById('createGroupButton');
  const applyRulesButton = document.getElementById('applyRulesButton');

  // 获取所有标签组
  let tabs = await chrome.tabs.query({});
  let groups = await chrome.tabGroups.query({});

  // 更新标签组列表
  async function updateGroupLists() {
    groups = await chrome.tabGroups.query({});

    // 清空选择框
    groupSelect.innerHTML = '';
    ruleGroupSelect.innerHTML = '';

    // 添加选项
    groups.forEach(group => {
      // 为默认标签组选择框添加选项
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.title || `Group ${group.id}`;
      groupSelect.appendChild(option);

      // 为规则标签组选择框添加选项
      const ruleOption = option.cloneNode(true);
      ruleGroupSelect.appendChild(ruleOption);
    });
  }

  // 初始化标签组列表
  await updateGroupLists();

  // 加载已保存的设置
  const { defaultGroupId, defaultGroupTitle, ignorePopupWindows, urlRules } =
    await chrome.storage.local.get(['defaultGroupId', 'defaultGroupTitle', 'ignorePopupWindows', 'urlRules']);

  let resolvedGroupId = defaultGroupId;
  if (resolvedGroupId) {
    const groupExists = groups.some(group => group.id === resolvedGroupId);
    if (!groupExists) {
      resolvedGroupId = null;
    }
  }

  if (!resolvedGroupId && defaultGroupTitle) {
    const matchedGroup = groups.find(group => group.title === defaultGroupTitle);
    if (matchedGroup) {
      resolvedGroupId = matchedGroup.id;
      await chrome.storage.local.set({ defaultGroupId: resolvedGroupId });
    }
  }

  if (resolvedGroupId) {
    groupSelect.value = resolvedGroupId;
  }
  ignorePopup.checked = ignorePopupWindows || false;


  // 显示已保存的URL规则
  let rules = urlRules || [];

  function reconcileRuleGroup(rule) {
    let groupId = rule.groupId ? parseInt(rule.groupId) : null;
    let matchedGroup = groupId ? groups.find(group => group.id === groupId) : null;

    if (matchedGroup) {
      const title = matchedGroup.title || '';
      if (rule.groupTitle !== title) {
        rule.groupTitle = title;
        return true;
      }
      return false;
    }

    if (rule.groupTitle) {
      matchedGroup = groups.find(group => (group.title || '') === rule.groupTitle);
      if (matchedGroup) {
        rule.groupId = matchedGroup.id;
        return true;
      }
    }

    return false;
  }

  let rulesUpdated = false;
  rules.forEach(rule => {
    if (reconcileRuleGroup(rule)) {
      rulesUpdated = true;
    }
  });

  if (rulesUpdated) {
    await chrome.storage.local.set({ urlRules: rules });
  }

  function renderRules() {

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
    groups.forEach(group => {
      const groupRules = rulesByGroup[group.id] || [];
      if (groupRules.length > 0) {
        // 创建标签组标题
        const groupTitle = document.createElement('div');
        groupTitle.className = 'group-title';
        groupTitle.textContent = group.title || `Group ${group.id}`;
        rulesList.appendChild(groupTitle);

        // 创建该标签组下的所有规则
        groupRules.forEach((rule, index) => {
          const ruleItem = document.createElement('div');
          ruleItem.className = 'rule-item';
          ruleItem.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-weight: 500; flex-grow: 1;">${rule.pattern}</div>
              <div style="display: flex; gap: 5px;">
                <button class="apply-rule" data-index="${rules.indexOf(rule)}" 
                  style="width: 40px; margin: 0; padding: 3px; background: #4CAF50;">
                  应用
                </button>
                <button class="edit-rule" data-index="${rules.indexOf(rule)}" 
                  style="width: 40px; margin: 0; padding: 3px; background: #1a73e8;">
                  编辑
                </button>
                <button class="delete-rule" data-index="${rules.indexOf(rule)}" 
                  style="width: 40px; margin: 0; padding: 3px; background: #dc3545;">
                  删除
                </button>
              </div>
            </div>
          `;
          rulesList.appendChild(ruleItem);
        });
      }
    });

    // 处理未知标签组的规则
    const unknownGroupRules = rules.filter(rule =>
      !groups.some(group => group.id === parseInt(rule.groupId)));

    if (unknownGroupRules.length > 0) {
      const unknownTitle = document.createElement('div');
      unknownTitle.className = 'group-title';
      unknownTitle.textContent = '未知标签组';
      rulesList.appendChild(unknownTitle);

      unknownGroupRules.forEach((rule, index) => {
        const ruleItem = document.createElement('div');
        ruleItem.className = 'rule-item';
        ruleItem.innerHTML = `
          <div style="margin-bottom: 10px;">
            <div style="font-weight: 500;">${rule.pattern}</div>
            <div style="display: flex; gap: 5px; margin-top: 5px;">
              <button class="apply-rule" data-index="${rules.indexOf(rule)}" 
                style="min-width: 60px; margin: 0; padding: 5px; background: #4CAF50;">
                应用
              </button>
              <button class="edit-rule" data-index="${rules.indexOf(rule)}" 
                style="min-width: 60px; margin: 0; padding: 5px; background: #1a73e8;">
                编辑
              </button>
              <button class="delete-rule" data-index="${rules.indexOf(rule)}" 
                style="min-width: 60px; margin: 0; padding: 5px; background: #dc3545;">
                删除
              </button>
            </div>
          </div>
        `;
        rulesList.appendChild(ruleItem);
      });
    }

    // 添加按钮事件监听器
    rulesList.querySelectorAll('.apply-rule').forEach(button => {
      button.addEventListener('click', () => applyRule(parseInt(button.dataset.index)));
    });
    rulesList.querySelectorAll('.edit-rule').forEach(button => {
      button.addEventListener('click', () => editRule(parseInt(button.dataset.index)));
    });
    rulesList.querySelectorAll('.delete-rule').forEach(button => {
      button.addEventListener('click', () => deleteRule(parseInt(button.dataset.index)));
    });

    // 添加按钮事件监听器
    rulesList.querySelectorAll('.apply-rule').forEach(button => {
      button.addEventListener('click', () => applyRule(parseInt(button.dataset.index)));
    });
    rulesList.querySelectorAll('.edit-rule').forEach(button => {
      button.addEventListener('click', () => editRule(parseInt(button.dataset.index)));
    });
    rulesList.querySelectorAll('.delete-rule').forEach(button => {
      button.addEventListener('click', () => deleteRule(parseInt(button.dataset.index)));
    });
  }
  renderRules();

  // 添加规则相关的全局函数
  window.deleteRule = async (index) => {
    rules.splice(index, 1);
    await chrome.storage.local.set({ urlRules: rules });
    renderRules();
  };

  window.editRule = async (index) => {
    const rule = rules[index];
    const newPattern = prompt('编辑URL规则:', rule.pattern);
    if (newPattern !== null) {
      rule.pattern = newPattern;
      await chrome.storage.local.set({ urlRules: rules });
      renderRules();
    }
  };

  window.applyRule = async (index) => {
    const rule = rules[index];
    const allTabs = await chrome.tabs.query({});
    const forceMove = document.getElementById('forceMove').checked;
    const pattern = rule.pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const regex = new RegExp(pattern);

    const groupId = parseInt(rule.groupId);
    let hasMovedTabs = false;

    for (const tab of allTabs) {
      // 根据forceMove设置决定是否跳过已分组的标签页
      if (!forceMove && tab.groupId !== -1) continue;
      if (regex.test(tab.url)) {
        try {
          await chrome.tabs.group({
            tabIds: tab.id,
            groupId: groupId
          });
          hasMovedTabs = true;
        } catch (error) {
          console.error('无法将标签页添加到组:', error);
        }
      }
    }

    // 如果移动了标签页，检查是否需要排序
    if (hasMovedTabs) {
      try {
        const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
        const groupIdKey = String(groupId);
        const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[groupId];
        if (groupSettings && groupSettings.autoSort) {
          const method = groupSettings.sortMethod || sortMethod;
          // 延迟一下确保标签页已加入分组
          setTimeout(async () => {
            await chrome.runtime.sendMessage({
              action: 'sortGroup',
              groupId: groupId,
              sortMethod: method
            });
          }, 300);
        }
      } catch (error) {
        console.error('触发排序失败:', error);
      }
    }
  };

  // 添加新规则
  addRuleButton.addEventListener('click', async () => {
    const pattern = urlPattern.value.trim();
    const groupId = parseInt(ruleGroupSelect.value);

    if (!pattern || !groupId) {
      alert('请输入URL规则并选择标签组');
      return;
    }

    const selectedGroup = groups.find(group => group.id === groupId);
    rules.push({
      pattern,
      groupId,
      groupTitle: selectedGroup ? selectedGroup.title || '' : ''
    });
    await chrome.storage.local.set({ urlRules: rules });


    // 清空输入
    urlPattern.value = '';
    ruleGroupSelect.value = '';

    // 重新渲染规则列表
    renderRules();
  });

  // 创建新标签组
  createGroupButton.addEventListener('click', async () => {
    const title = newGroupTitle.value.trim();
    if (!title) {
      alert('请输入标签组名称');
      return;
    }

    try {
      // 创建新标签组
      const currentTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const group = await chrome.tabs.group({
        tabIds: [currentTab.id]
      });
      await chrome.tabGroups.update(group, {
        title: title,
        color: colorNameFromHex(newGroupColor.value)
      });

      // 更新标签组列表
      await updateGroupLists();

      // 清空输入
      newGroupTitle.value = '';
      newGroupColor.value = '#1a73e8';

      // 不再从组中移除当前标签页，以保持标签组存在
    } catch (error) {
      console.error('创建标签组失败:', error);
      alert('创建标签组失败，请重试');
    }
  });

  // 应用规则到所有标签页
  applyRulesButton.addEventListener('click', async () => {
    const allTabs = await chrome.tabs.query({});
    const { urlRules } = await chrome.storage.local.get(['urlRules']);
    const forceMove = document.getElementById('forceMove').checked;

    if (!urlRules || !urlRules.length) {
      alert('没有配置URL规则');
      return;
    }

    const groupsWithMovedTabs = new Set();

    for (const tab of allTabs) {
      // 根据forceMove设置决定是否跳过已分组的标签页
      if (!forceMove && tab.groupId !== -1) continue;

      // 检查URL是否匹配规则
      for (const rule of urlRules) {
        const pattern = rule.pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        const regex = new RegExp(pattern);

        if (regex.test(tab.url)) {
          try {
            const groupId = parseInt(rule.groupId);
            await chrome.tabs.group({
              tabIds: tab.id,
              groupId: groupId
            });
            groupsWithMovedTabs.add(groupId);
            break;
          } catch (error) {
            console.error('无法将标签页添加到组:', error);
          }
        }
      }
    }

    // 对移动了标签页的分组进行排序
    if (groupsWithMovedTabs.size > 0) {
      try {
        const { groupSortSettings = {}, sortMethod = 'domain' } = await chrome.storage.local.get(['groupSortSettings', 'sortMethod']);
        setTimeout(async () => {
          for (const groupId of groupsWithMovedTabs) {
            const groupIdKey = String(groupId);
            const groupSettings = groupSortSettings[groupIdKey] || groupSortSettings[groupId];
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
  });

  // 保存设置
  saveButton.addEventListener('click', async () => {
    const selectedGroupId = parseInt(groupSelect.value);
    const selectedGroup = groups.find(group => group.id === selectedGroupId);
    await chrome.storage.local.set({
      defaultGroupId: selectedGroupId,
      defaultGroupTitle: selectedGroup ? selectedGroup.title || '' : '',
      ignorePopupWindows: ignorePopup.checked
    });
    window.close();
  });


  // 将十六进制颜色转换为Chrome标签组支持的颜色名称
  function colorNameFromHex(hex) {
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

    // 找到最接近的颜色
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

  // 计算两个颜色之间的距离
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

  // 一键排序所有标签页
  const sortTabsButton = document.getElementById('sortTabsButton');
  if (sortTabsButton) {
    sortTabsButton.addEventListener('click', async () => {
      try {
        const { sortMethod = 'domain' } = await chrome.storage.local.get(['sortMethod']);
        sortTabsButton.textContent = '排序中...';
        sortTabsButton.disabled = true;

        const response = await chrome.runtime.sendMessage({
          action: 'sortAllTabs',
          sortMethod: sortMethod
        });

        if (response && response.success) {
          sortTabsButton.textContent = '排序完成！';
          setTimeout(() => {
            sortTabsButton.textContent = '一键排序所有标签页';
            sortTabsButton.disabled = false;
          }, 2000);
        } else {
          throw new Error(response?.error || '排序失败');
        }
      } catch (error) {
        console.error('排序失败:', error);
        sortTabsButton.textContent = '排序失败，请重试';
        sortTabsButton.disabled = false;
        setTimeout(() => {
          sortTabsButton.textContent = '一键排序所有标签页';
        }, 2000);
      }
    });
  }
});