/**
 * Feishu Copy - Background Service Worker
 * 消息路由、下载触发
 */

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  switch (type) {
    case 'EXPORT_MARKDOWN':
      handleExportMarkdown(data)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'EXPORT_ATTACHMENTS':
      handleExportAttachments(data)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_SETTINGS':
      getSettings()
        .then(settings => sendResponse({ success: true, settings }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(data)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

/**
 * 导出 Markdown 文件下载
 */
async function handleExportMarkdown(data) {
  const { markdown, title, timestamp } = data;
  const filename = `${title || 'feishu-doc'}_${new Date(timestamp).toISOString().slice(0, 10)}.md`;

  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);

  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });

  return { downloadId };
}

/**
 * 批量导出附件（图片/图表）
 */
async function handleExportAttachments(data) {
  const { attachments, title } = data;
  if (!attachments || attachments.length === 0) {
    return { count: 0 };
  }

  const folder = `${title || 'feishu-doc'}_附件`;
  let downloaded = 0;

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    try {
      const url = att.url;
      const filename = `${folder}/${att.filename}`;

      await chrome.downloads.download({
        url,
        filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
      downloaded++;

      if (i < attachments.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.warn('[Background] 附件下载失败:', att.filename, e.message);
    }
  }

  return { count: downloaded };
}

/**
 * 获取设置
 */
async function getSettings() {
  const result = await chrome.storage.sync.get(['folder_token', 'skip_folder_picker']);
  return {
    folder_token: result.folder_token || '',
    skip_folder_picker: !!result.skip_folder_picker
  };
}

/**
 * 保存设置
 */
async function saveSettings(data) {
  await chrome.storage.sync.set({
    folder_token: data.folder_token || '',
    skip_folder_picker: !!data.skip_folder_picker
  });
}
