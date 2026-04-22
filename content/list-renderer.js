/**
 * Feishu Copy - 嵌套列表渲染器
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.ListRenderer = {
  /**
   * 递归渲染列表块为 Markdown
   * @param {Element} blockEl - 列表块 DOM 元素
   * @param {number} depth - 嵌套深度
   * @returns {string}
   */
  renderList(blockEl, depth = 0) {
    const indent = '  '.repeat(depth);
    const lines = [];

    // 获取块类型
    const blockType = this._detectListType(blockEl);

    // 获取当前块的文本（排除子块）
    const ownText = this._getOwnText(blockEl);
    if (ownText) {
      const prefix = this._getListPrefix(blockType, depth);
      const checked = this._getCheckedState(blockEl);
      if (checked !== null) {
        lines.push(`${indent}- [${checked ? 'x' : ' '}] ${ownText}`);
      } else {
        lines.push(`${indent}${prefix}${ownText}`);
      }
    }

    // 查找子列表块
    const childBlocks = this._getChildListBlocks(blockEl);
    for (const child of childBlocks) {
      lines.push(this.renderList(child, depth + 1));
    }

    return lines.join('\n');
  },

  /**
   * 检测列表类型
   */
  _detectListType(el) {
    const className = el.className || '';
    const dataBlockType = el.getAttribute('data-block-type') || '';

    if (className.includes('bullet') || dataBlockType === 'bullet') return 'bullet';
    if (className.includes('ordered') || dataBlockType === 'ordered') return 'ordered';
    if (className.includes('todo') || className.includes('todoList') || dataBlockType === 'todoList') return 'todo';

    return 'bullet';
  },

  /**
   * 获取列表前缀
   */
  _getListPrefix(type, depth) {
    switch (type) {
      case 'ordered': return '1. ';
      case 'todo': return '- ';
      default: return '- ';
    }
  },

  /**
   * 获取当前块的自身文本（排除子块内容）
   */
  _getOwnText(blockEl) {
    // 克隆节点，移除子 block 元素
    const clone = blockEl.cloneNode(true);
    const childBlocks = clone.querySelectorAll('[data-block-id]');
    for (const cb of childBlocks) {
      cb.remove();
    }
    let text = (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim();
    // 清除飞书列表自带的序号/圆点标记，避免导出时重复
    text = text.replace(/^[\u2022\u25cf\u25cb\u25aa\u25a0\u2023]\s*/, '');
    text = text.replace(/^\d+[\.\u3001]\s*/, '');
    return text;
  },

  /**
   * 获取 todo 的勾选状态
   */
  _getCheckedState(el) {
    const checkbox = el.querySelector('input[type="checkbox"], [class*="checkbox"], [role="checkbox"]');
    if (!checkbox) return null;
    if (checkbox.tagName === 'INPUT') return checkbox.checked;
    return checkbox.getAttribute('aria-checked') === 'true' || checkbox.className.includes('checked');
  },

  /**
   * 获取子列表块
   */
  _getChildListBlocks(blockEl) {
    const children = [];
    // 直接子 data-block-id 可能是嵌套列表
    for (const child of blockEl.children) {
      if (child.hasAttribute('data-block-id')) {
        const type = this._detectListType(child);
        if (type) {
          children.push(child);
        }
      }
    }

    // 如果直接子级没有，查找更深层的嵌套结构
    if (children.length === 0) {
      const listContainer = blockEl.querySelector('[class*="list-container"], [class*="children"]');
      if (listContainer) {
        for (const child of listContainer.children) {
          if (child.hasAttribute('data-block-id')) {
            children.push(child);
          }
        }
      }
    }

    return children;
  },

  /**
   * 判断元素是否为列表块
   */
  isListBlock(el) {
    const className = el.className || '';
    const dataBlockType = el.getAttribute('data-block-type') || '';
    return /bullet|ordered|todo/i.test(className + dataBlockType);
  }
};
