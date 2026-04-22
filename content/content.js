/**
 * Feishu Copy - 内容脚本编排器
 * 负责：复制保护绕过、水印移除、SPA 路由监听、流程编排
 */
window.FeishuCopy = window.FeishuCopy || {};

(function () {
  const { Utils, Constants, Extractor, Converter, UI } = window.FeishuCopy;

  let initialized = false;
  let currentDocUrl = '';

  /**
   * 初始化入口
   */
  function init() {
    installCopyBypass();
    removeWatermarks();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      setTimeout(onReady, 0);
    }
  }

  function onReady() {
    if (!Utils.isDocPage()) return;

    watchRouteChanges();

    Utils.waitForElement(Constants.DOC_ROOT_SELECTORS, 25000)
      .then((docRoot) => {
        console.log('[FeishuCopy] 检测到文档根元素:', docRoot.className.substring(0, 50));
        UI.create();
        UI.onAction(handleAction);
        initialized = true;
        currentDocUrl = location.href;
      })
      .catch((err) => {
        console.error('[FeishuCopy] 无法检测到文档元素:', err.message);
        console.warn('[FeishuCopy] 强制注入 UI');
        try {
          UI.create();
          UI.onAction(handleAction);
          initialized = true;
          currentDocUrl = location.href;
        } catch (e) {
          console.error('[FeishuCopy] UI 注入失败:', e);
        }
      });
  }

  /**
   * 安装复制保护绕过
   */
  function installCopyBypass() {
    const events = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart'];
    for (const evt of events) {
      document.addEventListener(evt, function (e) {
        e.stopImmediatePropagation();
      }, true);
    }

    try {
      const style = document.createElement('style');
      style.id = 'feishu-copy-bypass-style';
      style.textContent = `
        *, *::before, *::after {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {
      console.warn('[FeishuCopy] CSS 注入失败:', e);
    }
  }

  /**
   * 移除水印
   */
  function removeWatermarks() {
    try {
      const observer = new MutationObserver(() => {
        for (const sel of Constants.WATERMARK_SELECTORS) {
          document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
          });
        }
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }

      for (const sel of Constants.WATERMARK_SELECTORS) {
        document.querySelectorAll(sel).forEach(el => {
          el.style.display = 'none';
          el.style.pointerEvents = 'none';
        });
      }
    } catch (e) {
      console.warn('[FeishuCopy] 水印移除初始化失败:', e);
    }
  }

  /**
   * 监听 SPA 路由变化
   */
  function watchRouteChanges() {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    history.pushState = function () {
      originalPush.apply(this, arguments);
      onRouteChange();
    };

    history.replaceState = function () {
      originalReplace.apply(this, arguments);
      onRouteChange();
    };

    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
  }

  let routeChangeTimer = null;
  function onRouteChange() {
    clearTimeout(routeChangeTimer);
    routeChangeTimer = setTimeout(() => {
      if (location.href !== currentDocUrl && Utils.isDocPage()) {
        UI.destroy();
        initialized = false;
        currentDocUrl = '';
        onReady();
      }
    }, 600);
  }

  /**
   * 处理用户操作
   * @returns {Promise<{url?: string}>}
   */
  async function handleAction(action) {
    const safeUI = (state, data) => { try { UI.setState(state, data); } catch(e) {} };

    try {
      safeUI('SCANNING');

      const docBlocks = await Extractor.extract((percent) => {
        safeUI('SCANNING', { percent });
      });

      const title = Utils.getDocTitle();

      if (action === 'exportMarkdown') {
        safeUI('PROCESSING');
        const markdown = Converter.toMarkdown(docBlocks, title);
        const filename = `${Utils.safeFilename(title) || 'feishu-doc'}_${new Date().toISOString().slice(0, 10)}.md`;
        console.log('[FeishuCopy] 导出 Markdown, 大小:', markdown.length, '字符');
        try {
          downloadBlob(markdown, filename, 'text/markdown;charset=utf-8');
          safeUI('DONE');
        } catch (e) {
          console.warn('[FeishuCopy] Blob 下载失败，尝试 background 下载:', e.message);
          chrome.runtime.sendMessage({
            type: Constants.MSG.EXPORT_MARKDOWN,
            data: { markdown, title: Utils.safeFilename(title), timestamp: Date.now() }
          }, (response) => {
            if (response && response.success) {
              safeUI('DONE');
            } else {
              safeUI('ERROR', { message: response?.error || '下载失败' });
            }
          });
        }
      } else if (action === 'copyDoc') {
        safeUI('PROCESSING');
        const url = await createFeishuDoc(docBlocks, title, safeUI);
        return { url };
      }
    } catch (err) {
      console.error('[FeishuCopy] 操作失败:', err);
      safeUI('ERROR', { message: err.message });
    }
    return {};
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

  function textRunsToApiElements(textRuns) {
    if (!textRuns || textRuns.length === 0) {
      return [{ text_run: { content: '' } }];
    }
    return textRuns
      .filter(run => run.content)
      .map(run => {
        const element = { text_run: { content: run.content } };
        const style = {};
        if (run.bold) style.bold = true;
        if (run.italic) style.italic = true;
        if (run.strikethrough) style.strikethrough = true;
        if (run.code) style.inline_code = true;
        if (run.underline) style.underline = true;
        if (run.link) style.link = { url: run.link };
        if (run.color) style.text_color = run.color;
        if (run.bgColor) style.background_color = run.bgColor;
        if (Object.keys(style).length) {
          element.text_run.text_element_style = style;
        }
        return element;
      });
  }

  function docBlockToApiBlock(block) {
    switch (block.type) {
      case 'heading1': case 'heading2': case 'heading3':
      case 'heading4': case 'heading5': {
        const level = block.headingLevel || 1;
        const blockType = level + 2;
        const key = `heading${level}`;
        return {
          block_type: blockType,
          [key]: { elements: textRunsToApiElements(block.textRuns) }
        };
      }
      case 'text':
        return {
          block_type: 2,
          text: { elements: textRunsToApiElements(block.textRuns) }
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
          bullet: { elements: textRunsToApiElements(block.textRuns) }
        };
      case 'ordered':
        return {
          block_type: 12,
          ordered: { elements: textRunsToApiElements(block.textRuns) }
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
          quote: { elements: textRunsToApiElements(block.textRuns) }
        };
      case 'divider':
        return { block_type: 22, divider: {} };
      case 'image':
        // 图片降级为文本描述
        return {
          block_type: 2,
          text: { elements: [{ text_run: { content: `[图片: ${block.alt || block.src}]` } }] }
        };
      case 'diagram':
        // 图表降级为文本描述
        return {
          block_type: 2,
          text: { elements: [{ text_run: { content: '[流程图/图表]' } }] }
        };
      case 'iframe':
        return {
          block_type: 2,
          text: { elements: [{ text_run: { content: block.src ? `[嵌入内容](${block.src})` : '[嵌入内容]' } }] }
        };
      case 'table':
        return tableToApiBlock(block);
      default:
        if (block.textRuns && block.textRuns.length > 0) {
          return {
            block_type: 2,
            text: { elements: textRunsToApiElements(block.textRuns) }
          };
        }
        return null;
    }
  }

  function tableToApiBlock(block) {
    const rows = block.rows;
    if (!rows || rows.length === 0) return null;
    const rowCount = rows.length;
    const colCount = Math.max(...rows.map(r => r.length));
    const cells = [];
    for (let i = 0; i < rowCount; i++) {
      for (let j = 0; j < colCount; j++) {
        cells.push({
          row: i, column: j,
          cell: {
            block_type: 2,
            text: { elements: [{ text_run: { content: (rows[i] && rows[i][j]) || '' } }] }
          }
        });
      }
    }
    return {
      block_type: 22,
      table: {
        table_size: { row_size: rowCount, column_size: colCount },
        column_attr: Array(colCount).fill({}),
        row_attr: Array(rowCount).fill({}),
        cells
      }
    };
  }

  /**
   * 创建飞书文档：优先 SessionAPI，失败降级剪贴板
   * @returns {Promise<string|undefined>} 新文档 URL
   */
  async function createFeishuDoc(docBlocks, title, safeUI) {
    const { SessionAPI, FolderPicker } = window.FeishuCopy;

    // 检查登录态
    if (!SessionAPI.isLoggedIn()) {
      console.warn('[FeishuCopy] 未检测到登录态，使用剪贴板方式');
      return createFeishuDocClipboard(docBlocks, title, safeUI);
    }

    try {
      // 1. 选择文件夹
      const settings = await new Promise(resolve => {
        chrome.storage.sync.get(['folder_token', 'skip_folder_picker'], resolve);
      });

      let folderToken = '';
      if (settings.skip_folder_picker && settings.folder_token) {
        folderToken = settings.folder_token;
      } else {
        // 恢复 UI 让用户可以操作选择器
        safeUI('IDLE');
        folderToken = await FolderPicker.open(settings.folder_token);
        if (folderToken === null) {
          // 用户取消
          console.log('[FeishuCopy] 用户取消了文件夹选择');
          return;
        }
        safeUI('PROCESSING');
      }

      // 2. 创建文档
      console.log('[FeishuCopy] 使用 SessionAPI 创建文档:', title);
      const doc = await SessionAPI.createDocument(title, folderToken);
      console.log('[FeishuCopy] 文档创建成功:', doc.url);

      // 3. 转换并写入内容
      const apiBlocks = convertToApiBlocks(docBlocks);
      if (apiBlocks.length > 0) {
        await SessionAPI.createBlocks(doc.document_id, doc.document_id, apiBlocks);
      }

      console.log('[FeishuCopy] 内容写入完成，共', apiBlocks.length, '个块');
      window.open(doc.url, '_blank');
      safeUI('DONE');
      return doc.url;

    } catch (err) {
      console.warn('[FeishuCopy] SessionAPI 创建失败，降级剪贴板:', err.message);
      return createFeishuDocClipboard(docBlocks, title, safeUI);
    }
  }

  /**
   * 剪贴板方式创建飞书文档（降级方案）
   */
  async function createFeishuDocClipboard(docBlocks, title, safeUI) {
    try {
      console.log('[FeishuCopy] 使用剪贴板方式...');
      const html = docBlocksToHTML(docBlocks, title);
      await copyHTMLToClipboard(html, title);
      const newDocUrl = `https://${location.host}/docx/`;
      window.open(newDocUrl, '_blank');
      safeUI('DONE');
      console.log('[FeishuCopy] 内容已复制到剪贴板，请在打开的新文档中按 Ctrl+V / Cmd+V 粘贴');
    } catch (e) {
      console.error('[FeishuCopy] 剪贴板方式失败:', e.message);
      safeUI('ERROR', { message: '复制失败: ' + e.message });
    }
  }

  /**
   * DocBlock[] → HTML 字符串（用于剪贴板粘贴，保留原始格式）
   */
  function docBlocksToHTML(blocks, title) {
    const parts = [];
    if (title) {
      parts.push(`<h1>${escapeHTML(title)}</h1>`);
    }
    for (const block of blocks) {
      const html = blockToHTML(block);
      if (html) parts.push(html);
    }
    return parts.join('\n');
  }

  function escapeHTML(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * TextRun[] → HTML 富文本（支持颜色、下划线、高亮）
   */
  function textRunsToHTML(textRuns) {
    if (!textRuns || textRuns.length === 0) return '';
    return textRuns.map(run => {
      let text = escapeHTML(run.content || '');
      if (!text) return text;

      // 嵌套样式 - 从内到外包裹
      if (run.link) text = `<a href="${escapeHTML(run.link)}">${text}</a>`;
      if (run.code) text = `<code>${text}</code>`;
      if (run.strikethrough) text = `<del>${text}</del>`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;

      // 颜色和高亮需要用 span 包裹
      const spanStyles = [];
      if (run.color) spanStyles.push(`color:${run.color}`);
      if (run.bgColor) spanStyles.push(`background-color:${run.bgColor}`);
      if (spanStyles.length) {
        text = `<span style="${spanStyles.join(';')}">${text}</span>`;
      }

      return text;
    }).join('');
  }

  /**
   * 单个 DocBlock → HTML（保留原始文档格式）
   */
  function blockToHTML(block) {
    switch (block.type) {
      case 'heading1': case 'heading2': case 'heading3':
      case 'heading4': case 'heading5': {
        const level = block.headingLevel || 1;
        return `<h${level}>${textRunsToHTML(block.textRuns)}</h${level}>`;
      }
      case 'text':
        return `<p>${textRunsToHTML(block.textRuns)}</p>`;
      case 'code': {
        const lang = block.language || '';
        const langAttr = lang ? ` class="language-${escapeHTML(lang.toLowerCase())}"` : '';
        return `<pre><code${langAttr}>${escapeHTML(block.code || '')}</code></pre>`;
      }
      case 'bullet':
        return `<ul><li>${textRunsToHTML(block.textRuns)}</li></ul>`;
      case 'ordered':
        return `<ol><li>${textRunsToHTML(block.textRuns)}</li></ol>`;
      case 'todoList': {
        const check = block.checked ? ' checked' : '';
        return `<p><input type="checkbox"${check} disabled> ${textRunsToHTML(block.textRuns)}</p>`;
      }
      case 'quote':
        return `<blockquote><p>${textRunsToHTML(block.textRuns)}</p></blockquote>`;
      case 'divider':
        return '<hr>';
      case 'image': {
        const src = block.base64 || block.src;
        if (!src) return '';
        let html = `<img src="${escapeHTML(src)}" alt="${escapeHTML(block.alt || '')}">`;
        if (block.caption) {
          html = `<figure>${html}<figcaption>${escapeHTML(block.caption)}</figcaption></figure>`;
        }
        return html;
      }
      case 'diagram': {
        // 优先用 base64 截图，其次用 SVG 内联
        if (block.base64) {
          return `<img src="${block.base64}" alt="流程图/图表">`;
        }
        if (block.svgHtml) {
          return `<div style="text-align:center">${block.svgHtml}</div>`;
        }
        return '<p><em>[流程图/图表]</em></p>';
      }
      case 'iframe': {
        if (!block.src) return '<p><em>[嵌入内容]</em></p>';
        return `<p><a href="${escapeHTML(block.src)}">[嵌入内容: ${escapeHTML(block.title || block.src)}]</a></p>`;
      }
      case 'table': {
        if (!block.rows || block.rows.length === 0) return '';
        const rows = block.rows.map(row => {
          const cells = row.map(cell => `<td>${escapeHTML(cell || '')}</td>`).join('');
          return `<tr>${cells}</tr>`;
        }).join('\n');
        return `<table border="1">${rows}</table>`;
      }
      default: {
        const text = textRunsToHTML(block.textRuns);
        return text ? `<p>${text}</p>` : '';
      }
    }
  }

  /**
   * 复制 HTML 到剪贴板（富文本 + 纯文本双格式）
   */
  async function copyHTMLToClipboard(html, title) {
    const plainText = html.replace(/<[^>]+>/g, '');
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' })
    });
    await navigator.clipboard.write([clipboardItem]);
  }

  /**
   * 使用 Blob 直接下载文件（content script 可用）
   */
  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 监听来自 popup 的手动触发消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MANUAL_EXTRACT') {
      handleAction(message.action)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

  // 启动
  init();
})();
