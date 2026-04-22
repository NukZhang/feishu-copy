/**
 * Feishu Copy - 设置页面逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  const folderTokenInput = document.getElementById('folder-token');
  const skipPickerCheckbox = document.getElementById('skip-picker');
  const saveBtn = document.getElementById('save-btn');
  const saveResult = document.getElementById('save-result');

  // 加载已保存的设置
  chrome.storage.sync.get(['folder_token', 'skip_folder_picker'], (result) => {
    folderTokenInput.value = result.folder_token || '';
    skipPickerCheckbox.checked = !!result.skip_folder_picker;
  });

  // 保存设置
  saveBtn.addEventListener('click', () => {
    const settings = {
      folder_token: folderTokenInput.value.trim(),
      skip_folder_picker: skipPickerCheckbox.checked
    };

    chrome.storage.sync.set(settings, () => {
      saveResult.textContent = '设置已保存';
      saveResult.className = 'save-result success';
      setTimeout(() => {
        saveResult.textContent = '';
      }, 3000);
    });
  });
});
