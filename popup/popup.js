/**
 * Feishu Copy - Popup 脚本
 */

const ACTIONS = [
  { id: 'exportMarkdown', label: '导出 Markdown', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7v10"/><path d="M4 12h6"/><path d="M4 7l3 5-3 5"/><path d="M14 7v10"/><path d="M14 7l3 5"/><path d="M14 17l3-5"/><path d="M22 7v10"/></svg>' },
  { id: 'downloadHtml', label: '下载 HTML', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>' },
  { id: 'exportHtmlMigration', label: '导出 HTML（转存）', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline><line x1="12" y1="4" x2="12" y2="20" stroke-dasharray="2 2"></line></svg>' },
  { id: 'exportWord', label: '导出 Word', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><text x="8" y="18" font-size="8" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">W</text></svg>' },
  { id: 'exportPdf', label: '导出 PDF', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' },
  { id: 'exportAttachments', label: '导出全部附件', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>' },
  { id: 'copyDoc', label: '转存到飞书云盘', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>' }
];

const arrowSvg = '<svg class="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const actionsEl = document.getElementById('actions');
  const settingsBtn = document.getElementById('btn-settings');

  // 渲染按钮列表
  ACTIONS.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.dataset.action = action.id;
    btn.innerHTML = `${action.icon}<span class="label">${action.label}</span>${arrowSvg}`;
    btn.disabled = true;
    actionsEl.appendChild(btn);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const url = tab?.url || '';
    const isDocPage = /feishu\.cn\/(docx|wiki|docs)\//.test(url);
    const isFeishu = /feishu\.cn/.test(url);

    const buttons = actionsEl.querySelectorAll('.action-btn');

    if (isDocPage) {
      statusEl.textContent = '✓ 检测到飞书文档页面';
      statusEl.className = 'status on-doc';
      buttons.forEach(b => b.disabled = false);
    } else if (isFeishu) {
      statusEl.textContent = '✗ 当前页面不是文档';
      statusEl.className = 'status error';
    } else {
      statusEl.textContent = '✗ 请打开飞书文档页面';
      statusEl.className = 'status error';
    }
  });

  // 按钮点击事件
  actionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn || btn.disabled) return;

    const action = btn.dataset.action;
    const label = btn.querySelector('.label');
    const originalText = label.textContent;

    btn.disabled = true;
    btn.classList.add('loading');
    label.textContent = '处理中...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      chrome.tabs.sendMessage(tabId, { type: 'MANUAL_EXTRACT', action }, (resp) => {
        if (resp && resp.success) {
          label.textContent = '✓ 完成';
          btn.classList.remove('loading');
          btn.classList.add('success');
        } else {
          label.textContent = originalText;
          btn.classList.remove('loading');
          statusEl.textContent = '错误: ' + (resp?.error || '操作失败');
          statusEl.className = 'status error';
        }
        setTimeout(() => {
          label.textContent = originalText;
          btn.classList.remove('success');
          btn.disabled = false;
        }, 3000);
      });

      // 超时恢复
      setTimeout(() => {
        if (btn.classList.contains('loading')) {
          label.textContent = originalText;
          btn.classList.remove('loading');
          btn.disabled = false;
        }
      }, 60000);
    });
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
