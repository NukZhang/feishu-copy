/**
 * Feishu Copy - Canvas 文本捕获
 * 在 document_start 阶段注入，hook Canvas fillText/strokeText
 * 用于捕获飞书内嵌电子表格通过 Canvas 渲染的文本
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.CanvasHook = {
  captures: new WeakMap(),
  enabled: false,

  init() {
    const self = this;

    const hookCanvasMethod = (proto, methodName) => {
      const original = proto[methodName];
      if (!original) return;

      proto[methodName] = function (text, x, y, ...args) {
        // 仅在扫描期间捕获
        if (self.enabled && typeof text === 'string' && text.trim()) {
          const captures = self.captures.get(this) || [];
          captures.push({
            text: text,
            x: Math.round(x),
            y: Math.round(y),
            method: methodName
          });
          self.captures.set(this, captures);
        }
        return original.apply(this, [text, x, y, ...args]);
      };
    };

    // 挂载 fillText 和 strokeText
    if (typeof CanvasRenderingContext2D !== 'undefined') {
      hookCanvasMethod(CanvasRenderingContext2D.prototype, 'fillText');
      hookCanvasMethod(CanvasRenderingContext2D.prototype, 'strokeText');
    }
  },

  /**
   * 启用/禁用捕获
   */
  setEnabled(val) {
    this.enabled = val;
    if (val) {
      // 清空已有捕获
      this.captures = new WeakMap();
    }
  },

  /**
   * 从 Canvas 元素提取捕获的文本，生成 Markdown 表格
   */
  extractSheetMarkdown(canvasEl) {
    const captures = this.captures.get(canvasEl);
    if (!captures || captures.length === 0) return '';

    // 按 Y 坐标分行
    const rows = {};
    const Y_THRESHOLD = 5;

    for (const cap of captures) {
      // 找到最近的行
      let matchedY = null;
      for (const existingY of Object.keys(rows)) {
        if (Math.abs(cap.y - parseFloat(existingY)) < Y_THRESHOLD) {
          matchedY = existingY;
          break;
        }
      }
      const rowKey = matchedY !== null ? matchedY : String(cap.y);
      if (!rows[rowKey]) rows[rowKey] = [];
      rows[rowKey].push(cap);
    }

    // 对每行按 X 排序
    const sortedYs = Object.keys(rows)
      .map(Number)
      .sort((a, b) => a - b);

    // 构建表格数据
    const tableData = sortedYs.map(y => {
      return rows[y]
        .sort((a, b) => a.x - b.x)
        .map(cap => cap.text.trim())
        .filter(t => t);
    }).filter(row => row.length > 0);

    if (tableData.length === 0) return '';

    // 转换为 Markdown 表格
    const colCount = Math.max(...tableData.map(r => r.length));
    // 补齐列数
    for (const row of tableData) {
      while (row.length < colCount) row.push('');
    }

    const header = '| ' + tableData[0].join(' | ') + ' |';
    const separator = '| ' + tableData[0].map(() => '---').join(' | ') + ' |';
    const bodyRows = tableData.slice(1).map(r => '| ' + r.join(' | ') + ' |');

    return [header, separator, ...bodyRows].join('\n');
  }
};

// 立即初始化
window.FeishuCopy.CanvasHook.init();
