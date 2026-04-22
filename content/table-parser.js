/**
 * Feishu Copy - 表格解析器
 * 5 种策略解析飞书表格
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.TableParser = {
  /**
   * 从 DOM 元素解析表格，返回二维数组
   */
  parseTable(container) {
    // 策略 1: 标准 HTML 表格
    let result = this._parseHtmlTable(container);
    if (result) return result;

    // 策略 2: ARIA role 表格
    result = this._parseAriaTable(container);
    if (result) return result;

    // 策略 3: class 名表格
    result = this._parseClassTable(container);
    if (result) return result;

    // 策略 4: data-block-type 表格
    result = this._parseDataAttrTable(container);
    if (result) return result;

    // 策略 5: 结构推断
    result = this._parseStructuralTable(container);
    if (result) return result;

    return null;
  },

  /**
   * 策略 1: 标准 HTML <table>
   */
  _parseHtmlTable(container) {
    const table = container.querySelector('table');
    if (!table) return null;

    const rows = [];
    const trList = table.querySelectorAll('tr');
    for (const tr of trList) {
      const cells = [];
      for (const cell of tr.querySelectorAll('th, td')) {
        cells.push(this._getCellText(cell));
      }
      if (cells.length > 0) rows.push(cells);
    }
    return rows.length > 0 ? rows : null;
  },

  /**
   * 策略 2: ARIA role 表格
   */
  _parseAriaTable(container) {
    const rows = container.querySelectorAll('[role="row"]');
    if (rows.length === 0) return null;

    const data = [];
    for (const row of rows) {
      const cells = [];
      for (const cell of row.querySelectorAll('[role="gridcell"], [role="columnheader"], [role="rowheader"]')) {
        cells.push(this._getCellText(cell));
      }
      if (cells.length > 0) data.push(cells);
    }
    return data.length > 0 ? data : null;
  },

  /**
   * 策略 3: class 名表格
   */
  _parseClassTable(container) {
    const rows = container.querySelectorAll('[class*="table-row"]');
    if (rows.length === 0) return null;

    const data = [];
    for (const row of rows) {
      const cells = [];
      for (const cell of row.querySelectorAll('[class*="table-cell"]')) {
        cells.push(this._getCellText(cell));
      }
      if (cells.length > 0) data.push(cells);
    }
    return data.length > 0 ? data : null;
  },

  /**
   * 策略 4: data-block-type 表格
   */
  _parseDataAttrTable(container) {
    const rows = container.querySelectorAll('[data-block-type*="row"]');
    if (rows.length === 0) return null;

    const data = [];
    for (const row of rows) {
      const cells = [];
      for (const cell of row.querySelectorAll('[data-block-type*="cell"]')) {
        cells.push(this._getCellText(cell));
      }
      if (cells.length > 0) data.push(cells);
    }
    return data.length > 0 ? data : null;
  },

  /**
   * 策略 5: 结构推断 - 将子 div 视为行
   */
  _parseStructuralTable(container) {
    const children = Array.from(container.children);
    if (children.length < 2) return null;

    // 检查子元素是否结构一致（可能是表格）
    const cellCounts = children.map(child => {
      return child.children.length;
    }).filter(n => n > 0);

    if (cellCounts.length < 2) return null;

    const minCells = Math.min(...cellCounts);
    const maxCells = Math.max(...cellCounts);

    // 列数基本一致才认为是表格
    if (maxCells - minCells > 1) return null;

    const data = [];
    for (const child of children) {
      if (child.children.length === 0) continue;
      const cells = Array.from(child.children).map(cell => this._getCellText(cell));
      data.push(cells);
    }
    return data.length > 0 ? data : null;
  },

  /**
   * 获取单元格文本
   */
  _getCellText(cell) {
    return (cell.textContent || '').replace(/\u00a0/g, ' ').replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim();
  },

  /**
   * 将二维数组转为 Markdown 表格
   */
  toMarkdown(rows) {
    if (!rows || rows.length === 0) return '';

    const colCount = Math.max(...rows.map(r => r.length));

    // 补齐列数
    const normalized = rows.map(row => {
      const r = [...row];
      while (r.length < colCount) r.push('');
      return r;
    });

    const header = '| ' + normalized[0].join(' | ') + ' |';
    const separator = '| ' + normalized[0].map(() => '---').join(' | ') + ' |';

    let md = header + '\n' + separator;
    if (normalized.length > 1) {
      md += '\n' + normalized.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
    }

    return md;
  }
};
