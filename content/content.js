/**
 * Feishu Copy - 内容脚本编排器
 * 负责：复制保护绕过、水印移除、SPA 路由监听、7 项导出流程编排
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

  // ========== 核心流程：提取 → 各格式导出 ==========

  /**
   * 处理用户操作
   */
  async function handleAction(action) {
    const safeUI = (state, data) => { try { UI.setState(state, data); } catch(e) {} };

    try {
      safeUI('SCANNING');

      const docBlocks = await Extractor.extract((percent) => {
        safeUI('SCANNING', { percent });
      });

      const title = Utils.getDocTitle();

      switch (action) {
        case 'exportMarkdown':
          await exportMarkdown(docBlocks, title, safeUI);
          break;
        case 'downloadHtml':
          await exportHtml(docBlocks, title, safeUI);
          break;
        case 'exportHtmlMigration':
          await exportHtmlMigration(docBlocks, title, safeUI);
          break;
        case 'exportWord':
          await exportWord(docBlocks, title, safeUI);
          break;
        case 'exportPdf':
          await exportPdf(docBlocks, title, safeUI);
          break;
        case 'exportAttachments':
          await exportAttachments(docBlocks, title, safeUI);
          break;
        case 'copyDoc':
          await createFeishuDoc(docBlocks, title, safeUI);
          break;
        default:
          safeUI('ERROR', { message: '未知操作' });
      }
    } catch (err) {
      console.error('[FeishuCopy] 操作失败:', err);
      safeUI('ERROR', { message: err.message });
    }
  }

  // ========== 1. 导出 Markdown ==========

  async function exportMarkdown(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const markdown = Converter.toMarkdown(docBlocks, title);
    const filename = `${Utils.safeFilename(title) || 'feishu-doc'}_${new Date().toISOString().slice(0, 10)}.md`;
    console.log('[FeishuCopy] 导出 Markdown, 大小:', markdown.length, '字符');
    try {
      downloadBlob(markdown, filename, 'text/markdown;charset=utf-8');
      safeUI('DONE', { message: 'Markdown 已下载' });
    } catch (e) {
      console.warn('[FeishuCopy] Blob 下载失败，尝试 background 下载:', e.message);
      chrome.runtime.sendMessage({
        type: Constants.MSG.EXPORT_MARKDOWN,
        data: { markdown, title: Utils.safeFilename(title), timestamp: Date.now() }
      }, (response) => {
        if (response && response.success) {
          safeUI('DONE', { message: 'Markdown 已下载' });
        } else {
          safeUI('ERROR', { message: response?.error || '下载失败' });
        }
      });
    }
  }

  // ========== 2. 下载 HTML ==========

  async function exportHtml(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const bodyHtml = docBlocksToHTML(docBlocks, title);
    const fullHtml = wrapHtmlDocument(bodyHtml, title);
    const filename = `${Utils.safeFilename(title) || 'feishu-doc'}_${new Date().toISOString().slice(0, 10)}.html`;
    downloadBlob(fullHtml, filename, 'text/html;charset=utf-8');
    console.log('[FeishuCopy] HTML 已导出, 大小:', fullHtml.length);
    safeUI('DONE', { message: 'HTML 已下载' });
  }

  // ========== 3. 导出 HTML（for 转存） ==========

  async function exportHtmlMigration(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const bodyHtml = docBlocksToHTML(docBlocks, title, true);
    const fullHtml = wrapHtmlDocument(bodyHtml, title, true);
    const filename = `${Utils.safeFilename(title) || 'feishu-doc'}_migration_${new Date().toISOString().slice(0, 10)}.html`;
    downloadBlob(fullHtml, filename, 'text/html;charset=utf-8');
    console.log('[FeishuCopy] HTML(转存) 已导出, 大小:', fullHtml.length);
    safeUI('DONE', { message: 'HTML (转存版) 已下载' });
  }

  // ========== 4. 导出 Word ==========

  async function exportWord(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const bodyHtml = docBlocksToHTML(docBlocks, title, true);
    const wordHtml = wrapWordDocument(bodyHtml, title);
    const filename = `${Utils.safeFilename(title) || 'feishu-doc'}_${new Date().toISOString().slice(0, 10)}.doc`;
    downloadBlob(wordHtml, filename, 'application/msword');
    console.log('[FeishuCopy] Word 已导出, 大小:', wordHtml.length);
    safeUI('DONE', { message: 'Word 已下载' });
  }

  // ========== 5. 导出 PDF ==========

  async function exportPdf(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const bodyHtml = docBlocksToHTML(docBlocks, title);
    const fullHtml = wrapHtmlDocument(bodyHtml, title);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;border:none;';
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        iframe.contentWindow.print();
        safeUI('DONE', { message: '请在打印对话框中选择"另存为 PDF"' });
      } catch (e) {
        safeUI('ERROR', { message: '打印失败: ' + e.message });
      }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 5000);
    };

    iframe.srcdoc = fullHtml;
  }

  // ========== 6. 导出全部附件 ==========

  async function exportAttachments(docBlocks, title, safeUI) {
    safeUI('PROCESSING');
    const attachments = [];
    let imgIdx = 0, chartIdx = 0;

    for (const block of docBlocks) {
      if (block.type === 'image') {
        const src = block.base64 || block.src;
        if (src) {
          imgIdx++;
          const ext = src.startsWith('data:image/png') ? 'png'
            : src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg') ? 'jpg'
            : src.startsWith('data:image/svg') ? 'svg'
            : src.startsWith('data:image/webp') ? 'webp'
            : 'png';
          attachments.push({
            url: src,
            filename: `图片_${String(imgIdx).padStart(3, '0')}${block.alt ? '_' + Utils.safeFilename(block.alt).substring(0, 30) : ''}.${ext}`
          });
        }
      } else if (block.type === 'diagram') {
        if (block.base64) {
          chartIdx++;
          attachments.push({
            url: block.base64,
            filename: `图表_${String(chartIdx).padStart(3, '0')}.png`
          });
        }
      }
    }

    if (attachments.length === 0) {
      safeUI('DONE', { message: '文档中没有可导出的附件' });
      return;
    }

    console.log('[FeishuCopy] 导出附件:', attachments.length, '个');
    // 通过 background 逐个下载
    chrome.runtime.sendMessage({
      type: Constants.MSG.EXPORT_ATTACHMENTS,
      data: { attachments, title: Utils.safeFilename(title) || 'feishu-doc' }
    }, (response) => {
      if (response && response.success) {
        safeUI('DONE', { message: `已导出 ${attachments.length} 个附件` });
      } else {
        // 降级：直接用 content script 下载
        let delay = 0;
        for (const att of attachments) {
          setTimeout(() => downloadBlob('', att.filename, '', att.url), delay);
          delay += 300;
        }
        safeUI('DONE', { message: `已导出 ${attachments.length} 个附件` });
      }
    });
  }

  // ========== 7. 转存到飞书云盘 ==========

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
        return {
          block_type: 2,
          text: { elements: [{ text_run: { content: `[图片: ${block.alt || block.src}]` } }] }
        };
      case 'diagram':
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
   */
  async function createFeishuDoc(docBlocks, title, safeUI) {
    const { SessionAPI, FolderPicker } = window.FeishuCopy;

    if (!SessionAPI.isLoggedIn()) {
      console.warn('[FeishuCopy] 未检测到登录态，使用剪贴板方式');
      return createFeishuDocClipboard(docBlocks, title, safeUI);
    }

    try {
      const settings = await new Promise(resolve => {
        chrome.storage.sync.get(['folder_token', 'skip_folder_picker'], resolve);
      });

      let folderToken = '';
      if (settings.skip_folder_picker && settings.folder_token) {
        folderToken = settings.folder_token;
      } else {
        safeUI('IDLE');
        folderToken = await FolderPicker.open(settings.folder_token);
        if (folderToken === null) {
          console.log('[FeishuCopy] 用户取消了文件夹选择');
          return;
        }
        safeUI('PROCESSING');
      }

      console.log('[FeishuCopy] 使用 SessionAPI 创建文档:', title);
      const doc = await SessionAPI.createDocument(title, folderToken);
      console.log('[FeishuCopy] 文档创建成功:', doc.url);

      const apiBlocks = convertToApiBlocks(docBlocks);
      if (apiBlocks.length > 0) {
        await SessionAPI.createBlocks(doc.document_id, doc.document_id, apiBlocks);
      }

      console.log('[FeishuCopy] 内容写入完成，共', apiBlocks.length, '个块');
      window.open(doc.url, '_blank');
      safeUI('DONE', { message: '文档已转存' });
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
      safeUI('DONE', { message: '已复制到剪贴板，请粘贴到新文档' });
    } catch (e) {
      console.error('[FeishuCopy] 剪贴板方式失败:', e.message);
      safeUI('ERROR', { message: '复制失败: ' + e.message });
    }
  }

  // ========== HTML 生成工具 ==========

  /**
   * DocBlock[] → HTML 字符串
   * @param {boolean} forMigration - 是否为转存模式（内联图片、通用样式）
   */
  function docBlocksToHTML(blocks, title, forMigration = false) {
    const parts = [];
    if (title) {
      parts.push(`<h1>${escapeHTML(title)}</h1>`);
    }
    for (const block of blocks) {
      const html = blockToHTML(block, forMigration);
      if (html) parts.push(html);
    }
    return parts.join('\n');
  }

  function escapeHTML(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * TextRun[] → HTML 富文本
   */
  function textRunsToHTML(textRuns) {
    if (!textRuns || textRuns.length === 0) return '';
    return textRuns.map(run => {
      let text = escapeHTML(run.content || '');
      if (!text) return text;

      if (run.link) text = `<a href="${escapeHTML(run.link)}">${text}</a>`;
      if (run.code) text = `<code>${text}</code>`;
      if (run.strikethrough) text = `<del>${text}</del>`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;

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
   * 单个 DocBlock → HTML
   */
  function blockToHTML(block, forMigration = false) {
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
        const src = forMigration ? (block.base64 || block.src) : (block.src || block.base64);
        if (!src) return '';
        let html = `<img src="${escapeHTML(src)}" alt="${escapeHTML(block.alt || '')}" style="max-width:100%;">`;
        if (block.caption) {
          html = `<figure>${html}<figcaption>${escapeHTML(block.caption)}</figcaption></figure>`;
        }
        return html;
      }
      case 'diagram': {
        if (block.base64) {
          return `<img src="${block.base64}" alt="流程图/图表" style="max-width:100%;">`;
        }
        if (block.svgHtml && !forMigration) {
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
        return `<table border="1" style="border-collapse:collapse;">${rows}</table>`;
      }
      default: {
        const text = textRunsToHTML(block.textRuns);
        return text ? `<p>${text}</p>` : '';
      }
    }
  }

  // ========== HTML 文档包装器 ==========

  /**
   * 通用 CSS 样式（用于 HTML/PDF 导出）
   */
  const DOC_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2329; line-height: 1.8; }
    h1 { font-size: 28px; margin: 0 0 24px; border-bottom: 2px solid #e8e8e8; padding-bottom: 12px; }
    h2 { font-size: 24px; margin: 28px 0 16px; }
    h3 { font-size: 20px; margin: 24px 0 12px; }
    h4 { font-size: 18px; margin: 20px 0 10px; }
    h5 { font-size: 16px; margin: 16px 0 8px; }
    p { margin: 0 0 12px; }
    pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow-x: auto; margin: 0 0 16px; }
    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; }
    p code, li code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    blockquote { border-left: 4px solid #ddd; margin: 0 0 16px; padding: 8px 16px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
    td, th { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    tr:nth-child(even) { background: #fafafa; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 24px 0; }
    img { max-width: 100%; height: auto; margin: 8px 0; }
    figure { margin: 16px 0; text-align: center; }
    figcaption { font-size: 13px; color: #8f959e; margin-top: 8px; }
    ul, ol { padding-left: 24px; margin: 0 0 12px; }
    li { margin: 4px 0; }
    a { color: #3370ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  `;

  /**
   * 包装为完整 HTML 文档
   */
  function wrapHtmlDocument(bodyHtml, title, forMigration = false) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  /**
   * 包装为 Word 兼容 HTML 文档
   */
  function wrapWordDocument(bodyHtml, title) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    ${DOC_STYLES}
    @page { size: A4; margin: 2cm; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  // ========== 通用工具 ==========

  /**
   * 复制 HTML 到剪贴板
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
   * 使用 Blob 直接下载文件
   */
  function downloadBlob(content, filename, mimeType, dataUrl) {
    const url = dataUrl || URL.createObjectURL(new Blob([content], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      if (!dataUrl) URL.revokeObjectURL(url);
    }, 100);
  }

  // ========== 消息监听 ==========

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MANUAL_EXTRACT') {
      handleAction(message.action)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

  // 启动
  init();
})();
