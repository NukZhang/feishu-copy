/**
 * Feishu Copy - UI 模块
 * 浮动按钮 + 进度指示 + 下拉菜单
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.UI = {
  _container: null,
  _state: 'IDLE',

  /**
   * 创建并注入浮动按钮
   */
  create() {
    if (document.getElementById('feishu-copy-root')) return;

    this._container = document.createElement('div');
    this._container.id = 'feishu-copy-root';
    this._container.innerHTML = `
      <div class="fc-fab-container">
        <button class="fc-fab-btn" id="fc-main-btn" title="Feishu Copy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <div class="fc-menu" id="fc-menu">
          <button class="fc-menu-item" id="fc-export-md">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>导出 Markdown</span>
          </button>
          <button class="fc-menu-item" id="fc-copy-doc">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>转存为飞书文档</span>
          </button>
        </div>
        <div class="fc-progress" id="fc-progress" style="display:none;">
          <div class="fc-progress-bar" id="fc-progress-bar"><div class="fc-progress-fill" id="fc-progress-fill"></div></div>
          <span class="fc-progress-text" id="fc-progress-text">0%</span>
        </div>
      </div>
    `;

    // 确保 body 就绪再 append
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

  /**
   * 绑定 UI 事件
   */
  _bindEvents() {
    const mainBtn = document.getElementById('fc-main-btn');
    const menu = document.getElementById('fc-menu');
    const exportMdBtn = document.getElementById('fc-export-md');
    const copyDocBtn = document.getElementById('fc-copy-doc');

    if (!mainBtn) return;

    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._state === 'SCANNING') return;
      menu.classList.toggle('fc-menu-open');
    });

    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) {
        menu.classList.remove('fc-menu-open');
      }
    });

    exportMdBtn.addEventListener('click', () => {
      menu.classList.remove('fc-menu-open');
      this._onAction('exportMarkdown');
    });

    copyDocBtn.addEventListener('click', () => {
      menu.classList.remove('fc-menu-open');
      this._onAction('copyDoc');
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
        mainBtn.innerHTML = this._checkIcon();
        setTimeout(() => {
          const btn = document.getElementById('fc-main-btn');
          if (btn) {
            btn.innerHTML = this._copyIcon();
          }
          this._state = 'IDLE';
        }, 2500);
        break;

      case 'ERROR':
        mainBtn.classList.add('fc-fab-error');
        mainBtn.disabled = false;
        progress.style.display = 'none';
        mainBtn.innerHTML = this._errorIcon();
        mainBtn.title = data.message || '出错了';
        setTimeout(() => {
          const btn = document.getElementById('fc-main-btn');
          if (btn) {
            btn.innerHTML = this._copyIcon();
            btn.title = 'Feishu Copy';
          }
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

  _copyIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
  },

  _checkIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2.5">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  },

  _errorIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`;
  },

  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._state = 'IDLE';
  }
};
