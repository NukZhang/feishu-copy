/**
 * Feishu Copy - 文件夹选择器
 * 可视化选择飞书云盘目标文件夹，支持手动输入降级
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.FolderPicker = {
  _resolve: null,
  _currentToken: null,
  _pathStack: [],

  /**
   * 打开文件夹选择器
   * @param {string} [defaultToken]
   * @returns {Promise<string|null>} folder_token，取消返回 null
   */
  open(defaultToken) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._currentToken = defaultToken || null;
      this._pathStack = defaultToken ? [{ name: '默认文件夹', token: defaultToken }] : [];
      this._render();
      this._loadFolders(this._currentToken);
    });
  },

  _render() {
    this.destroy();

    const el = document.createElement('div');
    el.id = 'fc-folder-picker-root';
    el.innerHTML = `
      <div class="fc-fp-mask"></div>
      <div class="fc-fp-dialog">
        <div class="fc-fp-header">
          <span class="fc-fp-title">选择保存位置</span>
          <button class="fc-fp-close" title="关闭">&times;</button>
        </div>
        <div class="fc-fp-breadcrumb" id="fc-fp-breadcrumb">
          <span class="fc-fp-crumb" data-index="-1">📁 根目录</span>
        </div>
        <div class="fc-fp-list" id="fc-fp-list">
          <div class="fc-fp-loading">加载中...</div>
        </div>
        <div class="fc-fp-manual" id="fc-fp-manual">
          <div class="fc-fp-manual-toggle" id="fc-fp-manual-toggle">
            手动输入文件夹链接或 Token
          </div>
          <div class="fc-fp-manual-input" id="fc-fp-manual-input" style="display:none;">
            <input type="text" id="fc-fp-manual-field" placeholder="粘贴飞书云盘文件夹链接或 Folder Token">
            <button class="fc-fp-btn fc-fp-btn-confirm" id="fc-fp-manual-ok">确定</button>
          </div>
        </div>
        <div class="fc-fp-footer">
          <button class="fc-fp-btn fc-fp-btn-cancel" id="fc-fp-cancel">取消</button>
          <button class="fc-fp-btn fc-fp-btn-confirm" id="fc-fp-confirm">选择此文件夹</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    // 事件绑定
    el.querySelector('.fc-fp-mask').addEventListener('click', () => this._cancel());
    el.querySelector('.fc-fp-close').addEventListener('click', () => this._cancel());
    el.querySelector('#fc-fp-cancel').addEventListener('click', () => this._cancel());
    el.querySelector('#fc-fp-confirm').addEventListener('click', () => this._confirm());
    el.querySelector('#fc-fp-breadcrumb').addEventListener('click', (e) => {
      const crumb = e.target.closest('.fc-fp-crumb');
      if (!crumb) return;
      this._navigateTo(parseInt(crumb.dataset.index, 10));
    });
    el.querySelector('#fc-fp-list').addEventListener('click', (e) => {
      const item = e.target.closest('.fc-fp-item');
      if (!item) return;
      this._enterFolder(item.dataset.token, item.dataset.name);
    });
    // 手动输入
    el.querySelector('#fc-fp-manual-toggle').addEventListener('click', () => {
      const inputDiv = document.getElementById('fc-fp-manual-input');
      inputDiv.style.display = inputDiv.style.display === 'none' ? 'flex' : 'none';
      if (inputDiv.style.display === 'flex') {
        document.getElementById('fc-fp-manual-field').focus();
      }
    });
    el.querySelector('#fc-fp-manual-ok').addEventListener('click', () => this._useManualInput());
    el.querySelector('#fc-fp-manual-field').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._useManualInput();
    });
  },

  async _loadFolders(parentToken) {
    const listEl = document.getElementById('fc-fp-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="fc-fp-loading">加载中...</div>';

    try {
      const { SessionAPI } = window.FeishuCopy;
      const folders = parentToken
        ? await SessionAPI.listFolders(parentToken)
        : await SessionAPI.getRootFolders();

      if (folders.length === 0) {
        listEl.innerHTML = `
          <div class="fc-fp-empty">
            <div>${parentToken ? '此文件夹下没有子文件夹' : '未找到文件夹列表'}</div>
            <div style="margin-top:8px;font-size:12px;color:#aaa;">请在下方手动输入文件夹链接</div>
          </div>`;
      } else {
        listEl.innerHTML = folders.map(f => `
          <div class="fc-fp-item" data-token="${this._esc(f.token)}" data-name="${this._esc(f.name)}">
            <span class="fc-fp-item-icon">📁</span>
            <span class="fc-fp-item-name">${this._escHtml(f.name)}</span>
            <span class="fc-fp-item-arrow">›</span>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('[FolderPicker] 加载失败:', e);
      listEl.innerHTML = `
        <div class="fc-fp-error">
          加载失败: ${this._escHtml(e.message)}
          <div style="margin-top:8px;font-size:12px;color:#aaa;">请在下方手动输入文件夹链接</div>
        </div>`;
    }
  },

  _enterFolder(token, name) {
    this._pathStack.push({ name, token });
    this._currentToken = token;
    this._updateBreadcrumb();
    this._loadFolders(token);
  },

  _navigateTo(index) {
    if (index === -1) {
      this._pathStack = [];
      this._currentToken = null;
    } else {
      this._pathStack = this._pathStack.slice(0, index + 1);
      this._currentToken = this._pathStack[index].token;
    }
    this._updateBreadcrumb();
    this._loadFolders(this._currentToken);
  },

  _updateBreadcrumb() {
    const bc = document.getElementById('fc-fp-breadcrumb');
    if (!bc) return;
    let html = '<span class="fc-fp-crumb" data-index="-1">📁 根目录</span>';
    this._pathStack.forEach((item, i) => {
      html += `<span class="fc-fp-sep">/</span><span class="fc-fp-crumb" data-index="${i}">${this._escHtml(item.name)}</span>`;
    });
    bc.innerHTML = html;
  },

  /**
   * 解析手动输入：URL 或 token
   */
  _useManualInput() {
    const field = document.getElementById('fc-fp-manual-field');
    const input = (field.value || '').trim();
    if (!input) return;

    let token = input;
    // 尝试从 URL 中提取 token
    const urlMatch = input.match(/\/drive\/folder\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      token = urlMatch[1];
    }

    this._pathStack = [{ name: '指定文件夹', token }];
    this._currentToken = token;
    this._updateBreadcrumb();
    this._loadFolders(token);
  },

  _confirm() {
    const token = this._currentToken || '';
    this.destroy();
    if (this._resolve) {
      this._resolve(token || null);
      this._resolve = null;
    }
  },

  _cancel() {
    this.destroy();
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
  },

  destroy() {
    const el = document.getElementById('fc-folder-picker-root');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  _escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
