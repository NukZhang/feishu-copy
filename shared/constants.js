/**
 * Feishu Copy - 共享常量
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.Constants = {
  // URL 正则
  DOC_URL_REGEX: /\/(docx|wiki|docs)\//,

  // 文档根选择器
  DOC_ROOT_SELECTORS: [
    '#docx',
    '[class*="docx-editor"]',
    '[class*="wiki-content"]',
    '[class*="doc-content"]',
    '[role="main"]'
  ],

  // 滚动容器选择器
  SCROLL_CONTAINER_SELECTORS: [
    '#docx > div',
    '#docx',
    '[class*="docx"][class*="container"]',
    '[class*="docx"] [class*="scroll"]'
  ],

  // 内容块
  BLOCK_SELECTOR: '[data-block-id]',
  HEADING_SELECTOR: 'div.heading',
  CODE_BLOCK_SELECTOR: 'div.docx-code-block-container',
  TABLE_SELECTORS: {
    html: ['tr', 'th', 'td'],
    aria: ['[role="row"]', '[role="gridcell"]'],
    classBased: ['[class*="table-row"]', '[class*="table-cell"]'],
    dataAttr: ['[data-block-type*="row"]', '[data-block-type*="cell"]']
  },

  // 图表 / 流程图 / 思维导图选择器
  DIAGRAM_SELECTORS: [
    'svg[class*="diagram"]',
    'svg[class*="flowchart"]',
    'svg[class*="mermaid"]',
    '[class*="diagram-container"]',
    '[class*="chart-container"]',
    '[class*="mindmap"]',
    '[class*="flowchart"]',
    '[class*="board-container"]',
    '[class*="bitable"]'
  ],

  // 水印选择器
  WATERMARK_SELECTORS: [
    '.ssrWaterMark',
    '#watermark-cache-container',
    '[class*="watermark"]',
    '[class*="WaterMark"]'
  ],

  // 滚动参数
  SCROLL_STEP_RATIO: 0.5,
  SCROLL_INTERVAL_MS: 850,
  SCROLL_BOTTOM_THRESHOLD: 4,
  BOTTOM_STABLE_ROUNDS: 2,
  EXTRACTION_TIMEOUT_MS: 180000,

  // API 限制
  API_BATCH_SIZE: 50,
  API_RATE_LIMIT_MS: 340,
  TOKEN_CACHE_MS: 7200000,

  // 消息类型
  MSG: {
    EXPORT_MARKDOWN: 'EXPORT_MARKDOWN',
    CREATE_FEISHU_DOC: 'CREATE_FEISHU_DOC',
    EXPORT_HTML: 'EXPORT_HTML',
    EXPORT_HTML_MIGRATION: 'EXPORT_HTML_MIGRATION',
    EXPORT_WORD: 'EXPORT_WORD',
    EXPORT_PDF: 'EXPORT_PDF',
    EXPORT_ATTACHMENTS: 'EXPORT_ATTACHMENTS',
    GET_SETTINGS: 'GET_SETTINGS',
    SAVE_SETTINGS: 'SAVE_SETTINGS',
    TEST_CONNECTION: 'TEST_CONNECTION',
    EXTRACTION_PROGRESS: 'EXTRACTION_PROGRESS',
    EXTRACTION_COMPLETE: 'EXTRACTION_COMPLETE',
    EXTRACTION_ERROR: 'EXTRACTION_ERROR'
  },

  // 导出 action 类型
  ACTIONS: [
    { id: 'exportMarkdown', label: '导出 Markdown', icon: 'markdown' },
    { id: 'downloadHtml', label: '下载 HTML', icon: 'html' },
    { id: 'exportHtmlMigration', label: '导出 HTML（转存）', icon: 'htmlMigration' },
    { id: 'exportWord', label: '导出 Word', icon: 'word' },
    { id: 'exportPdf', label: '导出 PDF', icon: 'pdf' },
    { id: 'exportAttachments', label: '导出全部附件', icon: 'attachment' },
    { id: 'copyDoc', label: '转存到飞书云盘', icon: 'feishu' }
  ],

  // UI 状态
  UI_STATE: {
    IDLE: 'IDLE',
    SCANNING: 'SCANNING',
    PROCESSING: 'PROCESSING',
    DONE: 'DONE',
    ERROR: 'ERROR'
  },

  // 块类型映射（DOM class → 中间格式类型）
  BLOCK_TYPE_MAP: {
    'heading-h1': 'heading1',
    'heading-h2': 'heading2',
    'heading-h3': 'heading3',
    'heading-h4': 'heading4',
    'heading-h5': 'heading5',
    'bullet': 'bullet',
    'ordered': 'ordered',
    'todoList': 'todoList',
    'code': 'code',
    'quote': 'quote',
    'table': 'table',
    'image': 'image',
    'divider': 'divider',
    'callout': 'callout',
    'file': 'file',
    'grid': 'grid',
    'sheet': 'sheet',
    'diagram': 'diagram',
    'flowchart': 'flowchart',
    'mindmap': 'mindmap',
    'iframe': 'iframe'
  },

  // 飞书 API 块类型编号
  API_BLOCK_TYPE: {
    text: 2,
    heading1: 3,
    heading2: 4,
    heading3: 5,
    heading4: 6,
    heading5: 7,
    heading6: 8,
    heading7: 9,
    heading8: 10,
    heading9: 11,
    ordered: 12,
    bullet: 13,
    code: 14,
    quote: 15,
    todoList: 17,
    table: 22,
    divider: 22
  }
};
