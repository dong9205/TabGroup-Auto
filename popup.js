document.addEventListener('DOMContentLoaded', async () => {
  const groupSelect = document.getElementById('groupSelect');
  const saveButton = document.getElementById('saveButton');
  const ignorePopup = document.getElementById('ignorePopup');

  // 获取所有标签组
  const tabs = await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({});
  
  // 清空选择框
  groupSelect.innerHTML = '';
  
  // 添加选项
  groups.forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.title || `Group ${group.id}`;
    groupSelect.appendChild(option);
  });

  // 加载已保存的设置
  const { defaultGroupId, ignorePopupWindows } = await chrome.storage.local.get(['defaultGroupId', 'ignorePopupWindows']);
  if (defaultGroupId) {
    groupSelect.value = defaultGroupId;
  }
  ignorePopup.checked = ignorePopupWindows || false;

  // 保存设置
  saveButton.addEventListener('click', async () => {
    const selectedGroupId = parseInt(groupSelect.value);
    await chrome.storage.local.set({ 
      defaultGroupId: selectedGroupId,
      ignorePopupWindows: ignorePopup.checked
    });
    window.close();
  });
});