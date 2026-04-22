/**
 * Feishu Copy - 滚动抓取引擎
 * 解决飞书虚拟渲染问题：自动滚动加载所有内容
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.Extractor = {
  /**
   * 将图片 URL 转为 base64 data URL
   */
  async _imageToBase64(url) {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  },
  _abortController: null,
  _isExtracting: false,

  /**
   * 滚动并抓取整个文档
   * @param {Function} onProgress - 进度回调 (percent: number)
   * @returns {Promise<DocBlock[]>}
   */
  async extract(onProgress) {
    if (this._isExtracting) {
      throw new Error('正在提取中，请等待完成');
    }

    this._isExtracting = true;
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    try {
      const { Utils, Constants, CanvasHook } = window.FeishuCopy;
      const Converter = window.FeishuCopy.Converter;
      const self = this;

      // 等待文档根元素出现
      const docRoot = await Utils.waitForElement(Constants.DOC_ROOT_SELECTORS, 15000);
      const scrollContainer = Utils.getScrollContainer();

      // 滚动到顶部
      scrollContainer.scrollTop = 0;
      await Utils.sleep(500);

      // 启用 Canvas 捕获
      CanvasHook.setEnabled(true);

      // 收集所有内容块
      const seenIds = new Set();
      const orderedDocBlocks = [];
      const imagePromises = [];
      let lastScrollHeight = 0;
      let stableCount = 0;

      const startTime = Date.now();

      // 抓取函数：发现块时立即转为 DocBlock
      const scrape = () => {
        const blocks = docRoot.querySelectorAll('[data-block-id]');

        for (const blockEl of blocks) {
          const blockId = blockEl.getAttribute('data-block-id');
          if (!blockId || seenIds.has(blockId)) continue;
          seenIds.add(blockId);

          // 跳过 page 块（它是文档容器，文本会重复包含所有子块内容）
          const blockType = (blockEl.getAttribute('data-block-type') || '').toLowerCase();
          if (blockType === 'page') continue;

          // 立即转为 DocBlock，避免 DOM 元素被虚拟渲染移除后丢失
          const docBlock = Converter._parseBlock(blockEl);
          if (docBlock) {
            // 图片块：下载为 base64
            if (docBlock.type === 'image' && docBlock.src && !docBlock.src.startsWith('data:')) {
              const p = self._imageToBase64(docBlock.src)
                .then(b64 => { if (b64) docBlock.base64 = b64; })
                .catch(() => {});
              imagePromises.push(p);
            }
            // 图表块：SVG → base64 PNG
            if (docBlock.type === 'diagram' && docBlock.hasSvg) {
              const svgEl = blockEl.querySelector('svg');
              if (svgEl) {
                const p = Converter._svgToBase64(svgEl)
                  .then(b64 => { if (b64) docBlock.base64 = b64; })
                  .catch(() => {});
                imagePromises.push(p);
              }
            }
            // 表格和图表：仅标记实际表格结构内的子块，避免吞噬后续段落
            if (docBlock.type === 'table' || docBlock.type === 'diagram') {
              const tableScope = blockEl.querySelector('table') || blockEl.querySelector('[role="grid"]') || blockEl;
              tableScope.querySelectorAll('[data-block-id]').forEach(child => {
                const childId = child.getAttribute('data-block-id');
                if (childId) seenIds.add(childId);
              });
            }
            orderedDocBlocks.push(docBlock);
          }
        }

        // 处理 Canvas 内嵌表格
        const canvases = docRoot.querySelectorAll('canvas');
        for (const canvas of canvases) {
          const md = CanvasHook.extractSheetMarkdown(canvas);
          if (md) {
            orderedDocBlocks.push({
              id: 'canvas-' + Math.random().toString(36).substring(2, 9),
              type: 'sheet',
              rawMarkdown: md
            });
          }
        }
      };

      // 先抓取首屏
      scrape();

      while (true) {
        // 检查中止信号
        if (signal.aborted) throw new Error('提取已取消');

        // 检查超时
        if (Date.now() - startTime > Constants.EXTRACTION_TIMEOUT_MS) {
          console.warn('[FeishuCopy] 提取超时，返回已收集的内容');
          break;
        }

        // 滚动一步
        const stepSize = scrollContainer.clientHeight * Constants.SCROLL_STEP_RATIO;
        scrollContainer.scrollTop += stepSize;

        await Utils.sleep(Constants.SCROLL_INTERVAL_MS);

        // 抓取当前可见块
        scrape();

        // 计算进度
        const percent = Math.min(
          99,
          Math.round((scrollContainer.scrollTop + scrollContainer.clientHeight) / scrollContainer.scrollHeight * 100)
        );
        if (onProgress) onProgress(percent);

        // 底部检测
        const currentScrollHeight = scrollContainer.scrollHeight;
        const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= currentScrollHeight - Constants.SCROLL_BOTTOM_THRESHOLD;

        if (atBottom) {
          if (currentScrollHeight === lastScrollHeight) {
            stableCount++;
          } else {
            stableCount = 0;
            lastScrollHeight = currentScrollHeight;
          }

          if (stableCount >= Constants.BOTTOM_STABLE_ROUNDS) break;
        } else {
          stableCount = 0;
        }
      }

      // 滚动到底部后额外等待，捕获最后的 Canvas 绘制
      await Utils.sleep(400);
      scrape();
      await Utils.sleep(600);
      scrape();

      // 禁用 Canvas 捕获
      CanvasHook.setEnabled(false);

      // 等待所有图片/图表 base64 转换完成
      await Promise.allSettled(imagePromises);

      if (onProgress) onProgress(100);

      return orderedDocBlocks;
    } finally {
      this._isExtracting = false;
      this._abortController = null;
      window.FeishuCopy.CanvasHook.setEnabled(false);
    }
  },

  /**
   * 取消提取
   */
  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }
};
