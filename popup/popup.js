document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const btnMd = document.getElementById('btn-md');
  const btnDoc = document.getElementById('btn-doc');
  const btnSettings = document.getElementById('btn-settings');
  const hintEl = document.getElementById('hint');

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const url = tab?.url || '';
    const isDocPage = /feishu\.cn\/(docx|wiki|docs)\//.test(url);
    const isFeishu = /feishu\.cn/.test(url);

    if (isDocPage) {
      statusEl.textContent = '✓ 检测到飞书文档页面';
      statusEl.className = 'status on-doc';
      btnMd.disabled = false;
      btnDoc.disabled = false;
      hintEl.textContent = '也可以直接在文档页面的右上角找到浮动按钮。';
    } else if (isFeishu) {
      statusEl.textContent = '✗ 当前页面不是文档';
      statusEl.className = 'status error';
      hintEl.textContent = '请打开一个飞书文档（/docx/、/wiki/ 或 /docs/）后再使用。';
    } else {
      statusEl.textContent = '✗ 请打开飞书文档页面';
      statusEl.className = 'status error';
      hintEl.textContent = '请打开一个飞书文档后再使用此插件。';
    }
  });

  btnMd.addEventListener('click', () => {
    btnMd.disabled = true;
    btnMd.textContent = '提取中...';
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'MANUAL_EXTRACT', action: 'exportMarkdown' }, (resp) => {
        if (resp && resp.success) {
          btnMd.textContent = '✓ 已下载';
        } else {
          btnMd.textContent = '导出 Markdown';
          statusEl.textContent = '错误: ' + (resp?.error || '提取失败');
          statusEl.className = 'status error';
        }
        btnMd.disabled = false;
      });
      setTimeout(() => {
        btnMd.textContent = '导出 Markdown';
        btnMd.disabled = false;
      }, 30000);
    });
  });

  btnDoc.addEventListener('click', () => {
    btnDoc.disabled = true;
    btnDoc.textContent = '创建中...';
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'MANUAL_EXTRACT', action: 'copyDoc' }, (resp) => {
        if (resp && resp.success) {
          btnDoc.textContent = '✓ 已转存';
          if (resp.url) window.open(resp.url, '_blank');
        } else {
          btnDoc.textContent = '转存为飞书文档';
          statusEl.textContent = '错误: ' + (resp?.error || '创建失败');
          statusEl.className = 'status error';
        }
        btnDoc.disabled = false;
      });
      setTimeout(() => {
        btnDoc.textContent = '转存为飞书文档';
        btnDoc.disabled = false;
      }, 60000);
    });
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
