/**
 * Feishu Copy - 工具函数
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.Utils = {
  /**
   * 判断当前页面是否为飞书文档
   */
  isDocPage() {
    return window.FeishuCopy.Constants.DOC_URL_REGEX.test(location.pathname);
  },

  /**
   * 等待元素出现
   */
  waitForElement(selectors, timeout = 15000) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    return new Promise((resolve, reject) => {
      // 先检查是否已存在
      for (const sel of selectorList) {
        const el = document.querySelector(sel);
        if (el) return resolve(el);
      }

      const observer = new MutationObserver(() => {
        for (const sel of selectorList) {
          const el = document.querySelector(sel);
          if (el) {
            observer.disconnect();
            return resolve(el);
          }
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // 独立的超时处理，不影响 observer
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('等待元素超时: ' + selectorList.join(', ')));
      }, timeout);
    });
  },

  /**
   * 获取文档根元素
   */
  getDocRoot() {
    const { DOC_ROOT_SELECTORS } = window.FeishuCopy.Constants;
    for (const sel of DOC_ROOT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  },

  /**
   * 获取滚动容器
   */
  getScrollContainer() {
    const { SCROLL_CONTAINER_SELECTORS } = window.FeishuCopy.Constants;
    for (const sel of SCROLL_CONTAINER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 20) return el;
    }
    // 回退：从第一个 block 向上查找可滚动容器
    const firstBlock = document.querySelector('[data-block-id]');
    if (firstBlock) {
      let parent = firstBlock.parentElement;
      while (parent) {
        if (parent.scrollHeight > parent.clientHeight + 20) return parent;
        parent = parent.parentElement;
      }
    }
    return document.documentElement;
  },

  /**
   * 规范化文本
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\u200b/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  },

  /**
   * 获取文档标题
   */
  getDocTitle() {
    const titleEl =
      document.querySelector('.doc-title') ||
      document.querySelector('[class*="title"][class*="doc"]') ||
      document.querySelector('h1') ||
      document.querySelector('[data-block-id] .heading-h1');
    if (titleEl) {
      return this.normalizeText(titleEl.textContent) || 'feishu-doc';
    }
    return document.title.replace(/ - 飞书云文档$/, '') || 'feishu-doc';
  },

  /**
   * 简单休眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 安全获取元素的文本内容
   */
  getSafeText(el) {
    if (!el) return '';
    return this.normalizeText(el.textContent || el.innerText || '');
  },

  /**
   * 生成安全的文件名
   */
  safeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }
};
