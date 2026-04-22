/**
 * Feishu Copy - UI 模块
 * 浮动按钮 + 7 项功能列表 + 进度指示 + Toast 提示
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.UI = {
  _container: null,
  _state: 'IDLE',

  /**
   * SVG 图标集
   */
  _icons: {
    copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    markdown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7v10"/><path d="M4 12h6"/><path d="M4 7l3 5-3 5"/><path d="M14 7v10"/><path d="M14 7l3 5"/><path d="M14 17l3-5"/><path d="M22 7v10"/></svg>',
    html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    htmlMigration: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline><line x1="12" y1="4" x2="12" y2="20" stroke-dasharray="2 2"></line></svg>',
    word: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><text x="8" y="18" font-size="8" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">W</text></svg>',
    pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    attachment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>',
    feishu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>',
    arrow: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    spinner: '<svg class="fc-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>'
  },

  create() {
    if (document.getElementById('feishu-copy-root')) return;

    const actions = window.FeishuCopy.Constants.ACTIONS;
    const menuItems = actions.map(a => `
      <button class="fc-menu-item" data-action="${a.id}">
        <span class="fc-menu-icon">${this._icons[a.icon]}</span>
        <span class="fc-menu-label">${a.label}</span>
        <span class="fc-menu-arrow">${this._icons.arrow}</span>
      </button>
    `).join('');

    this._container = document.createElement('div');
    this._container.id = 'feishu-copy-root';
    this._container.innerHTML = `
      <div class="fc-fab-container">
        <button class="fc-fab-btn" id="fc-main-btn" title="Feishu Copy">
          ${this._icons.copy}
        </button>
        <div class="fc-menu" id="fc-menu">
          <div class="fc-menu-header">导出文档</div>
          ${menuItems}
        </div>
        <div class="fc-progress" id="fc-progress" style="display:none;">
          <div class="fc-progress-bar" id="fc-progress-bar"><div class="fc-progress-fill" id="fc-progress-fill"></div></div>
          <span class="fc-progress-text" id="fc-progress-text">0%</span>
        </div>
        <div class="fc-toast" id="fc-toast" style="display:none;"></div>
      </div>
    `;

    const tryAppend = () => {
      if (document.body) {
        document.body.appendChild(this._container);
        this._bindEvents();
      } else {
        setTimeout(tryAppend, 50);
      }
    };
    tryAppend();
  },

  _bindEvents() {
    const mainBtn = document.getElementById('fc-main-btn');
    const menu = document.getElementById('fc-menu');

    if (!mainBtn) return;

    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._state === 'SCANNING' || this._state === 'PROCESSING') return;
      menu.classList.toggle('fc-menu-open');
    });

    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) {
        menu.classList.remove('fc-menu-open');
      }
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.fc-menu-item');
      if (!item || item.disabled) return;
      menu.classList.remove('fc-menu-open');
      this._onAction(item.dataset.action);
    });
  },

  _onAction(action) {
    if (this._onActionCallback) {
      this._onActionCallback(action);
    }
  },

  onAction(callback) {
    this._onActionCallback = callback;
  },

  setState(state, data = {}) {
    this._state = state;
    const mainBtn = document.getElementById('fc-main-btn');
    const progress = document.getElementById('fc-progress');
    const menu = document.getElementById('fc-menu');

    if (!mainBtn) return;

    mainBtn.className = 'fc-fab-btn';

    switch (state) {
      case 'SCANNING':
        mainBtn.classList.add('fc-fab-scanning');
        mainBtn.disabled = true;
        menu.classList.remove('fc-menu-open');
        progress.style.display = 'flex';
        this.setProgress(data.percent || 0);
        break;

      case 'PROCESSING':
        mainBtn.classList.add('fc-fab-processing');
        mainBtn.disabled = true;
        progress.style.display = 'flex';
        this.setProgress(100);
        document.getElementById('fc-progress-text').textContent = '处理中...';
        break;

      case 'DONE':
        mainBtn.classList.add('fc-fab-done');
        mainBtn.disabled = false;
        progress.style.display = 'none';
        mainBtn.innerHTML = this._icons.check;
        this.showToast(data.message || '导出成功');
        setTimeout(() => {
          const btn = document.getElementById('fc-main-btn');
          if (btn) btn.innerHTML = this._icons.copy;
          this._state = 'IDLE';
        }, 2500);
        break;

      case 'ERROR':
        mainBtn.classList.add('fc-fab-error');
        mainBtn.disabled = false;
        progress.style.display = 'none';
        mainBtn.innerHTML = this._icons.error;
        this.showToast(data.message || '出错了', true);
        setTimeout(() => {
          const btn = document.getElementById('fc-main-btn');
          if (btn) btn.innerHTML = this._icons.copy;
          this._state = 'IDLE';
        }, 3000);
        break;

      default:
        mainBtn.disabled = false;
        progress.style.display = 'none';
        break;
    }
  },

  setProgress(percent) {
    const fill = document.getElementById('fc-progress-fill');
    const text = document.getElementById('fc-progress-text');
    if (fill) fill.style.width = percent + '%';
    if (text) text.textContent = percent + '%';
  },

  showToast(message, isError = false) {
    const toast = document.getElementById('fc-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'fc-toast' + (isError ? ' fc-toast-error' : '');
    toast.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  },

  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._state = 'IDLE';
  }
};
