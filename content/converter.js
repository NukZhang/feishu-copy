/**
 * Feishu Copy - DOM → 中间格式 → Markdown 转换器
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.Converter = {
  /**
   * 将 DOM 元素列表转为中间格式 DocBlock[]
   */
  toDocBlocks(blockElements) {
    const blocks = [];
    const processed = new Set();

    for (const el of blockElements) {
      const blockId = el.getAttribute('data-block-id');
      if (!blockId || processed.has(blockId)) continue;
      processed.add(blockId);

      const block = this._parseBlock(el);
      if (block) blocks.push(block);
    }

    return blocks;
  },

  /**
   * 解析单个 DOM 块为 DocBlock
   */
  _parseBlock(el) {
    const blockId = el.getAttribute('data-block-id');
    const type = this._detectBlockType(el);

    switch (type) {
      case 'heading1':
      case 'heading2':
      case 'heading3':
      case 'heading4':
      case 'heading5':
        return this._parseHeading(el, type);

      case 'code':
        return this._parseCodeBlock(el);

      case 'table':
        return this._parseTableBlock(el);

      case 'image':
        return this._parseImage(el);

      case 'quote':
      case 'callout':
        return this._parseQuote(el);

      case 'divider':
        return { id: blockId, type: 'divider' };

      case 'diagram':
        return this._parseDiagram(el);

      case 'iframe':
        return this._parseIframe(el);

      case 'bullet':
      case 'ordered':
      case 'todoList':
        return this._parseList(el, type);

      default:
        return this._parseTextBlock(el);
    }
  },

  /**
   * 检测块类型
   */
  _detectBlockType(el) {
    const className = el.className || '';
    const dataBlockType = el.getAttribute('data-block-type') || '';

    // 标题
    const headingMatch = className.match(/heading-h(\d)/);
    if (headingMatch) return 'heading' + headingMatch[1];
    if (/heading/.test(dataBlockType)) {
      const m = dataBlockType.match(/heading(\d)/);
      if (m) return 'heading' + m[1];
    }

    // 代码块
    if (el.querySelector('.docx-code-block-container, [class*="code-block"], pre code, pre[class*="code"]')) return 'code';

    // 分割线（必须在表格之前检测，否则被 [class*="table"] 误匹配）
    if (/divider|hr/i.test(className + ' ' + dataBlockType) || el.querySelector('hr')) return 'divider';

    // 图片（优先用 data-block-type）
    if (dataBlockType === 'image') return 'image';
    if (el.querySelector('img[class*="image"], img[src*="drive-stream"], [class*="image-viewer"]')) return 'image';

    // 图表 / 流程图 / 思维导图
    if (/diagram|flowchart|mindmap/i.test(dataBlockType)) return 'diagram';
    if (el.querySelector('svg[class*="diagram"], svg[class*="flowchart"], svg[class*="mermaid"], [class*="diagram-container"], [class*="chart-container"], [class*="mindmap"]')) return 'diagram';

    // iframe 嵌入
    if (el.querySelector('iframe')) return 'iframe';

    // 引用 / callout
    if (/quote|callout/i.test(className + ' ' + dataBlockType)) return 'quote';

    // 表格（在 divider 之后，避免分割线被误判为表格）
    if (el.querySelector('table, [role="grid"], [class*="table"]')) {
      // 避免容器误判：如果 block 有 data-block-id 子块在 table 外面，说明是容器而非纯表格
      const actualTable = el.querySelector('table') || el.querySelector('[role="grid"]');
      if (actualTable) {
        const directChildBlocks = Array.from(el.children).filter(c => c.hasAttribute('data-block-id'));
        const hasOutsideChild = directChildBlocks.some(c => !actualTable.contains(c));
        if (hasOutsideChild) {
          // 容器块，不作为表格处理，让子块分别处理
        } else {
          return 'table';
        }
      } else {
        return 'table';
      }
    }

    // 列表
    if (/bullet/i.test(className + ' ' + dataBlockType)) return 'bullet';
    if (/ordered/i.test(className + ' ' + dataBlockType)) return 'ordered';
    if (/todo/i.test(className + ' ' + dataBlockType)) return 'todoList';

    // HTML 标题
    for (let i = 1; i <= 6; i++) {
      if (el.querySelector(`h${i}`) && el.children.length <= 2) return 'heading' + Math.min(i, 5);
    }

    return 'text';
  },

  /**
   * 解析文本块
   */
  _parseTextBlock(el) {
    const textRuns = this._extractTextRuns(el);
    if (textRuns.length === 0) return null;

    return {
      id: el.getAttribute('data-block-id'),
      type: 'text',
      textRuns
    };
  },

  /**
   * 解析标题
   */
  _parseHeading(el, type) {
    const level = parseInt(type.replace('heading', ''));
    const textRuns = this._extractTextRuns(el);

    return {
      id: el.getAttribute('data-block-id'),
      type,
      headingLevel: level,
      textRuns
    };
  },

  /**
   * 解析代码块
   */
  _parseCodeBlock(el) {
    const codeContainer = el.querySelector('.docx-code-block-container, [class*="code-block"], pre');
    let language = '';
    let code = '';

    if (codeContainer) {
      // 1. 提取语言标识
      const headerEl = codeContainer.querySelector(
        '[class*="code-block-header"], [class*="code-header"], [class*="codeBlock-header"]'
      );
      if (headerEl) {
        const langSpan = headerEl.querySelector('span, [class*="language"], [class*="lang"]');
        language = langSpan
          ? langSpan.textContent.trim()
          : headerEl.textContent.trim();
      }

      // 2. 提取代码内容
      code = this._extractCodeLines(codeContainer, headerEl);
    } else {
      code = (el.innerText || el.textContent || '');
    }

    return {
      id: el.getAttribute('data-block-id'),
      type: 'code',
      language,
      code: code.trim()
    };
  },

  /**
   * 从代码容器中逐行提取代码文本，保留缩进和换行
   */
  _extractCodeLines(container, headerEl) {
    const contentSelectors = [
      '[class*="code-block-content"]',
      '[class*="code-block-inner"]',
      '[class*="codeBlock-content"]',
      '[class*="code-content"]',
      '[class*="code-block-body"]',
      '[class*="codeBlock-body"]',
      '.code-block-lines',
      '.code-lines'
    ];

    let contentEl = null;
    for (const sel of contentSelectors) {
      contentEl = container.querySelector(sel);
      if (contentEl) break;
    }

    const targetEl = contentEl || container;

    const lineElements = this._findCodeLineElements(targetEl);

    if (lineElements.length > 0) {
      const elSet = new Set(lineElements);
      const filtered = lineElements.filter(el => {
        for (const other of elSet) {
          if (other !== el && el.contains(other)) return false;
        }
        return true;
      });

      const lines = [];
      for (const lineEl of filtered) {
        if (headerEl && (headerEl.contains(lineEl) || lineEl.contains(headerEl))) continue;
        const lineText = this._getCodeLineText(lineEl);
        if (lineText.trim()) lines.push(lineText);
      }

      if (lines.length > 0) {
        return lines.join('\n');
      }
    }

    return (contentEl || container).innerText || '';
  },

  /**
   * 查找代码行级元素
   */
  _findCodeLineElements(container) {
    const lineSelectors = [
      '[class*="code-line"]',
      '[class*="codeline"]',
      '[class*="codeLine"]',
      '.line'
    ];

    for (const sel of lineSelectors) {
      const els = container.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }

    const directDivs = container.querySelectorAll(':scope > div');
    if (directDivs.length > 1) {
      return Array.from(directDivs);
    }

    const allDivs = container.querySelectorAll('div');
    if (allDivs.length > 1) {
      return Array.from(allDivs);
    }

    return [];
  },

  /**
   * 获取单个代码行的文本，保留前导空白
   */
  _getCodeLineText(lineEl) {
    const style = window.getComputedStyle(lineEl);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const indentSpaces = Math.round(paddingLeft / 4) * 4;
    const indentStr = indentSpaces > 0 ? ' '.repeat(indentSpaces) : '';

    let text = '';

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'span' || tag === 'code' || tag === 'a' || tag === 'b' ||
            tag === 'i' || tag === 'em' || tag === 'strong' || tag === 'font') {
          for (const child of node.childNodes) {
            walk(child);
          }
        } else if (tag === 'br') {
          text += '\n';
        } else {
          for (const child of node.childNodes) {
            walk(child);
          }
        }
      }
    };

    for (const child of lineEl.childNodes) {
      walk(child);
    }

    text = text.replace(/ /g, ' ').replace(/​/g, '').replace(/\t/g, '    ');
    return indentStr + text;
  },

  /**
   * 解析表格
   */
  _parseTableBlock(el) {
    const rows = window.FeishuCopy.TableParser.parseTable(el);
    return {
      id: el.getAttribute('data-block-id'),
      type: 'table',
      rows: rows || []
    };
  },

  /**
   * 解析图片
   */
  _parseImage(el) {
    const img = el.querySelector('img');
    let src = '';
    if (img) {
      src = img.src || img.getAttribute('data-src') || '';
      // 过滤掉 base64 占位图
      if (src.startsWith('data:') && src.length < 200) {
        src = img.getAttribute('data-src') || '';
      }
    }
    // 提取图片标题/说明
    const captionEl = el.querySelector('[class*="caption"], [class*="image-title"], figcaption');
    const caption = captionEl ? captionEl.textContent.trim() : '';

    return {
      id: el.getAttribute('data-block-id'),
      type: 'image',
      src,
      alt: img ? (img.alt || '') : '',
      caption
    };
  },

  /**
   * 解析图表/流程图/思维导图
   */
  _parseDiagram(el) {
    const svgEl = el.querySelector('svg');
    const canvasEl = el.querySelector('canvas');
    const bbox = (svgEl || el).getBoundingClientRect();

    return {
      id: el.getAttribute('data-block-id'),
      type: 'diagram',
      svgHtml: svgEl ? svgEl.outerHTML : '',
      hasSvg: !!svgEl,
      hasCanvas: !!canvasEl,
      width: Math.round(bbox.width),
      height: Math.round(bbox.height)
    };
  },

  /**
   * 解析 iframe 嵌入
   */
  _parseIframe(el) {
    const iframe = el.querySelector('iframe');
    return {
      id: el.getAttribute('data-block-id'),
      type: 'iframe',
      src: iframe ? iframe.src : '',
      title: iframe ? (iframe.title || '') : '',
      width: iframe ? iframe.width : '',
      height: iframe ? iframe.height : ''
    };
  },

  /**
   * 将 SVG 元素转为 base64 PNG data URL
   */
  async _svgToBase64(svgEl) {
    try {
      const clone = svgEl.cloneNode(true);
      const bbox = svgEl.getBoundingClientRect();

      // 内联样式表到 SVG defs 中
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      document.querySelectorAll('style').forEach(sheet => {
        try {
          const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = sheet.textContent;
          defs.appendChild(style);
        } catch(e) {}
      });
      clone.insertBefore(defs, clone.firstChild);

      if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);
      }
      if (!clone.getAttribute('width')) clone.setAttribute('width', bbox.width);
      if (!clone.getAttribute('height')) clone.setAttribute('height', bbox.height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const svgData = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = 2;
          canvas.width = Math.max(1, bbox.width * scale);
          canvas.height = Math.max(1, bbox.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  },

  /**
   * 解析引用
   */
  _parseQuote(el) {
    const textRuns = this._extractTextRuns(el);
    return {
      id: el.getAttribute('data-block-id'),
      type: 'quote',
      textRuns
    };
  },

  /**
   * 解析 callout（高亮块）
   */
  _parseCallout(el) {
    const textRuns = this._extractTextRuns(el);
    return {
      id: el.getAttribute('data-block-id'),
      type: 'callout',
      textRuns
    };
  },

  /**
   * 解析列表
   */
  _parseList(el, type) {
    const ListRenderer = window.FeishuCopy.ListRenderer;
    const ownText = ListRenderer._getOwnText(el);
    const textRuns = [{ content: ownText }];

    return {
      id: el.getAttribute('data-block-id'),
      type,
      textRuns,
      checked: type === 'todoList' ? ListRenderer._getCheckedState(el) : null
    };
  },

  /**
   * 从元素提取富文本运行 TextRun[]
   */
  _extractTextRuns(el) {
    const runs = [];
    this._walkTextNodes(el, runs, {});
    if (runs.length === 0) {
      const text = (el.textContent || '').replace(/ /g, ' ').trim();
      if (text) runs.push({ content: text });
    }
    return runs;
  },

  /**
   * 递归遍历 DOM 提取 TextRun（带样式继承：颜色、下划线、高亮）
   */
  _walkTextNodes(node, runs, inheritedStyles) {
    const styles = inheritedStyles || {};

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.replace(/ /g, ' ').replace(/[​‌‍﻿]/g, '');
        if (text) {
          const run = { content: text };
          if (styles.bold) run.bold = true;
          if (styles.italic) run.italic = true;
          if (styles.strikethrough) run.strikethrough = true;
          if (styles.code) run.code = true;
          if (styles.link) run.link = styles.link;
          if (styles.underline) run.underline = true;
          if (styles.color) run.color = styles.color;
          if (styles.bgColor) run.bgColor = styles.bgColor;
          runs.push(run);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();

        if (tag === 'br') {
          runs.push({ content: '\n' });
          continue;
        }

        const childStyles = { ...styles };

        // 标签级样式
        if (tag === 'b' || tag === 'strong') childStyles.bold = true;
        else if (tag === 'i' || tag === 'em') childStyles.italic = true;
        else if (tag === 's' || tag === 'del' || tag === 'strike') childStyles.strikethrough = true;
        else if (tag === 'code') childStyles.code = true;
        else if (tag === 'a') childStyles.link = child.getAttribute('href');
        else if (tag === 'u') childStyles.underline = true;

        // CSS 计算样式 - 颜色、下划线、高亮
        try {
          const cs = window.getComputedStyle(child);
          if (cs.color && !this._isDefaultTextColor(cs.color)) {
            childStyles.color = this._rgbToHex(cs.color);
          }
          if (cs.backgroundColor && !this._isDefaultBg(cs.backgroundColor)) {
            childStyles.bgColor = this._rgbToHex(cs.backgroundColor);
          }
          if ((cs.textDecorationLine && cs.textDecorationLine.includes('underline')) ||
              (cs.textDecoration && cs.textDecoration.includes('underline'))) {
            childStyles.underline = true;
          }
        } catch(e) {}

        // 递归进入子元素，传递累积样式
        this._walkTextNodes(child, runs, childStyles);
      }
    }
  },

  /**
   * RGB 字符串 → Hex 颜色
   */
  _rgbToHex(rgb) {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return rgb;
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  },

  /**
   * 是否为默认文本颜色（黑色/深灰）
   */
  _isDefaultTextColor(color) {
    // 飞书常见默认颜色: #1f2329=rgb(31,35,41), #646a73=rgb(100,106,115)
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
      return r <= 120 && g <= 120 && b <= 120;
    }
    return false;
  },

  /**
   * 是否为默认/透明背景
   */
  _isDefaultBg(color) {
    return color === 'rgba(0, 0, 0, 0)' ||
           color === 'transparent' ||
           /^rgba?\(\s*0,\s*0,\s*0,\s*0\)/.test(color);
  },

  // ========== Markdown 输出 ==========

  /**
   * DocBlock[] → Markdown 字符串
   */
  toMarkdown(docBlocks, title) {
    const lines = [];

    if (title) {
      lines.push(`# ${title}`, '');
    }

    for (const block of docBlocks) {
      const md = this._blockToMarkdown(block);
      if (md) lines.push(md);
    }

    return lines.join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  },

  /**
   * 单个 DocBlock → Markdown
   */
  _blockToMarkdown(block) {
    switch (block.type) {
      case 'heading1': case 'heading2': case 'heading3':
      case 'heading4': case 'heading5': {
        const prefix = '#'.repeat(block.headingLevel || 1);
        const text = this._textRunsToMd(block.textRuns);
        return text ? `${prefix} ${text}` : '';
      }

      case 'text': {
        const text = this._textRunsToMd(block.textRuns);
        return text || '';
      }

      case 'code':
        return `\`\`\`${block.language || ''}\n${block.code}\n\`\`\``;

      case 'table': {
        // 单列且内容为空的表格 → 实际是飞书分栏/divider，输出为分割线
        if (block.rows && block.rows.length > 0) {
          const maxCols = Math.max(...block.rows.map(r => r.length));
          if (maxCols <= 1) {
            const allEmpty = block.rows.every(r => r.every(c => !c || /^[\s​‌‍﻿]*$/.test(c)));
            if (allEmpty) return '---';
          }
        }
        return window.FeishuCopy.TableParser.toMarkdown(block.rows);
      }

      case 'image': {
        const src = block.base64 || block.src;
        if (!src) return '';
        let md = `![${block.alt || ''}](${src})`;
        if (block.caption) md += `\n*${block.caption}*`;
        return md;
      }

      case 'diagram': {
        if (block.base64) {
          return `![流程图](${block.base64})`;
        }
        if (block.svgHtml) {
          return `<!-- diagram: SVG -->\n${block.svgHtml}`;
        }
        return '<!-- diagram: 无法捕获 -->';
      }

      case 'iframe':
        return block.src ? `[嵌入内容](${block.src})` : '';

      case 'quote': {
        const text = this._textRunsToMd(block.textRuns);
        return text ? text.split('\n').map(l => `> ${l}`).join('\n') : '';
      }

      case 'callout': {
        const text = this._textRunsToMd(block.textRuns);
        return text ? `> **📌** ${text}` : '';
      }

      case 'divider':
        return '---';

      case 'bullet': {
        const text = this._textRunsToMd(block.textRuns);
        return text ? `- ${text}` : '';
      }

      case 'ordered': {
        const text = this._textRunsToMd(block.textRuns);
        return text ? `1. ${text}` : '';
      }

      case 'todoList': {
        const text = this._textRunsToMd(block.textRuns);
        const check = block.checked ? 'x' : ' ';
        return text ? `- [${check}] ${text}` : '';
      }

      default: {
        const text = this._textRunsToMd(block.textRuns);
        return text || '';
      }
    }
  },

  /**
   * TextRun[] → Markdown 富文本字符串（纯 Markdown，不输出 HTML 标签）
   */
  _textRunsToMd(textRuns) {
    if (!textRuns || textRuns.length === 0) return '';

    return textRuns.map(run => {
      let text = (run.content || '').replace(/\n/g, ' ').trim();
      // 清除零宽字符
      text = text.replace(/[​‌‍﻿]/g, '');
      if (!text) return '';

      if (run.bold) text = `**${text}**`;
      if (run.italic) text = `*${text}*`;
      if (run.strikethrough) text = `~~${text}~~`;
      if (run.code) text = `\`${text}\``;
      if (run.link) text = `[${text}](${run.link})`;

      return text;
    }).filter(t => t).join('');
  }
};
