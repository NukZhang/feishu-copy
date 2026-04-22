/**
 * Feishu Copy - Background Service Worker
 * 消息路由、下载触发、API 调用
 */

importScripts('feishu-api.js');

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  switch (type) {
    case 'EXPORT_MARKDOWN':
      handleExportMarkdown(data)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CREATE_FEISHU_DOC':
      handleCreateFeishuDoc(data)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_SETTINGS':
      getSettings()
        .then(settings => sendResponse({ success: true, settings }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(data)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TEST_CONNECTION':
      testConnection(data)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

/**
 * 导出 Markdown 文件下载
 */
async function handleExportMarkdown(data) {
  const { markdown, title, timestamp } = data;
  const filename = `${title || 'feishu-doc'}_${new Date(timestamp).toISOString().slice(0, 10)}.md`;

  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);

  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });

  return { downloadId };
}

/**
 * 创建飞书文档
 */
async function handleCreateFeishuDoc(data) {
  const { blocks, title } = data;
  const settings = await getSettings();

  if (!settings.app_id || !settings.app_secret) {
    throw new Error('请先在设置中配置飞书 App ID 和 App Secret');
  }

  const api = new FeishuAPI(settings.app_id, settings.app_secret);

  // 获取 token
  await api.ensureToken();

  // 创建文档
  const doc = await api.createDocument(`Copy of ${title || '飞书文档'}`, settings.folder_token || '');

  // 转换并写入块
  const apiBlocks = convertToApiBlocks(blocks);
  await api.createBlocks(doc.document_id, doc.document_id, apiBlocks);

  return {
    url: `https://feishu.cn/docx/${doc.document_id}`,
    documentId: doc.document_id
  };
}

/**
 * DocBlock[] → 飞书 API Block[]
 */
function convertToApiBlocks(docBlocks) {
  const result = [];

  for (const block of docBlocks) {
    const apiBlock = docBlockToApiBlock(block);
    if (apiBlock) result.push(apiBlock);
  }

  return result;
}

/**
 * 单个 DocBlock → API Block
 */
function docBlockToApiBlock(block) {
  switch (block.type) {
    case 'heading1': case 'heading2': case 'heading3':
    case 'heading4': case 'heading5': {
      const blockType = 2 + (block.headingLevel || 1); // 3=heading1, 4=heading2, ...
      const key = `heading${block.headingLevel || 1}`;
      return {
        block_type: blockType,
        [key]: {
          elements: textRunsToApiElements(block.textRuns)
        }
      };
    }

    case 'text':
      return {
        block_type: 2,
        text: {
          elements: textRunsToApiElements(block.textRuns)
        }
      };

    case 'code':
      return {
        block_type: 14,
        code: {
          language: block.language || 'PlainText',
          elements: [{ text_run: { content: block.code || '' } }]
        }
      };

    case 'bullet':
      return {
        block_type: 13,
        bullet: {
          elements: textRunsToApiElements(block.textRuns)
        }
      };

    case 'ordered':
      return {
        block_type: 12,
        ordered: {
          elements: textRunsToApiElements(block.textRuns)
        }
      };

    case 'todoList':
      return {
        block_type: 17,
        todo: {
          elements: textRunsToApiElements(block.textRuns),
          style: { checked: block.checked || false }
        }
      };

    case 'quote':
      return {
        block_type: 15,
        quote: {
          elements: textRunsToApiElements(block.textRuns)
        }
      };

    case 'divider':
      return {
        block_type: 22,
        divider: {}
      };

    case 'table': {
      if (!block.rows || block.rows.length === 0) return null;
      return tableToApiBlock(block);
    }

    case 'image':
      // 图片暂降级为文本链接
      return {
        block_type: 2,
        text: {
          elements: [
            { text_run: { content: `[图片: ${block.alt || block.src}]` } }
          ]
        }
      };

    case 'diagram':
      return {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: '[流程图/图表]' } }]
        }
      };

    case 'iframe':
      return {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: block.src ? `[嵌入内容](${block.src})` : '[嵌入内容]' } }]
        }
      };

    case 'sheet':
      // Canvas 表格转为文本块
      return {
        block_type: 2,
        text: {
          elements: [
            { text_run: { content: block.rawMarkdown || '' } }
          ]
        }
      };

    default:
      if (block.textRuns && block.textRuns.length > 0) {
        return {
          block_type: 2,
          text: {
            elements: textRunsToApiElements(block.textRuns)
          }
        };
      }
      return null;
  }
}

/**
 * TextRun[] → API TextElement[]
 */
function textRunsToApiElements(textRuns) {
  if (!textRuns || textRuns.length === 0) {
    return [{ text_run: { content: '' } }];
  }

  return textRuns
    .filter(run => run.content)
    .map(run => {
      const element = {
        text_run: {
          content: run.content
        }
      };
      const textStyle = {};
      if (run.bold) textStyle.bold = true;
      if (run.italic) textStyle.italic = true;
      if (run.strikethrough) textStyle.strikethrough = true;
      if (run.code) textStyle.inline_code = true;
      if (run.link) textStyle.link = { url: run.link };
      if (Object.keys(textStyle).length) {
        element.text_run.text_element_style = textStyle;
      }
      return element;
    });
}

/**
 * 表格转 API Block
 */
function tableToApiBlock(block) {
  const rows = block.rows;
  if (!rows || rows.length === 0) return null;

  const rowCount = rows.length;
  const colCount = Math.max(...rows.map(r => r.length));

  const property = {
    table_size: {
      row_size: rowCount,
      column_size: colCount
    },
    column_attr: Array(colCount).fill({}),
    row_attr: Array(rowCount).fill({}),
    cells: []
  };

  for (let i = 0; i < rowCount; i++) {
    for (let j = 0; j < colCount; j++) {
      const cellContent = (rows[i] && rows[i][j]) || '';
      property.cells.push({
        row: i,
        column: j,
        cell: {
          block_type: 2,
          text: {
            elements: [{ text_run: { content: cellContent } }]
          }
        }
      });
    }
  }

  return {
    block_type: 22,
    table: property
  };
}

/**
 * 获取设置
 */
async function getSettings() {
  const result = await chrome.storage.sync.get(['app_id', 'app_secret', 'folder_token']);
  return {
    app_id: result.app_id || '',
    app_secret: result.app_secret || '',
    folder_token: result.folder_token || ''
  };
}

/**
 * 保存设置
 */
async function saveSettings(data) {
  await chrome.storage.sync.set({
    app_id: data.app_id,
    app_secret: data.app_secret,
    folder_token: data.folder_token || ''
  });
}

/**
 * 测试连接
 */
async function testConnection(data) {
  const api = new FeishuAPI(data.app_id, data.app_secret);
  const token = await api.getToken();
  return { token: token ? 'ok' : 'failed' };
}
