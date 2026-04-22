/**
 * Feishu Copy - 飞书会话 API 客户端
 * 利用当前飞书页面 cookie 直接调用内部 API
 * 上传文件并导入为飞书文档（4步流程）
 */
window.FeishuCopy = window.FeishuCopy || {};

window.FeishuCopy.SessionAPI = {
  _getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )_csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  },

  isLoggedIn() {
    return !!this._getCsrfToken();
  },

  _headers(extra) {
    return {
      'Accept': 'application/json, text/plain, */*',
      'x-csrftoken': this._getCsrfToken(),
      'x-lsc-bizid': '2',
      'x-lsc-terminal': 'web',
      'x-lsc-version': '1',
      'x-lgw-app-id': '1161',
      'x-lgw-os-type': '3',
      'x-lgw-terminal-type': '2',
      'doc-biz': 'Lark',
      'doc-os': 'mac',
      'doc-platform': 'web',
      ...extra
    };
  },

  async _fetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `https://${location.host}${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: { ...this._headers(options.extraHeaders), ...(options.headers || {}) },
      credentials: 'include'
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }
    return resp.json();
  },

  /**
   * 生成随机 request-id
   */
  _requestId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 30; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  },

  /**
   * 生成 client_token (UUID v4)
   */
  _clientToken() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // ========== 云盘列表 ==========

  /**
   * 获取根目录文件/文件夹列表
   */
  async getRootFolders() {
    try {
      const data = await this._fetch(
        '/space/api/explorer/v3/my_space/obj/?asc=0&rank=3&length=100',
        { extraHeaders: { 'referer': `https://${location.host}/drive/me/` } }
      );
      console.log('[SessionAPI] getRootFolders →', JSON.stringify(data).substring(0, 500));
      return this._extractFromExplorer(data);
    } catch (e) {
      console.warn('[SessionAPI] getRootFolders 失败:', e.message);
      return [];
    }
  },

  /**
   * 列出指定文件夹下的子项
   */
  async listFolders(parentToken) {
    if (!parentToken) return this.getRootFolders();

    try {
      const data = await this._fetch(
        `/space/api/explorer/v3/my_space/obj/?asc=0&rank=3&length=100&parent_token=${encodeURIComponent(parentToken)}`,
        { extraHeaders: { 'referer': `https://${location.host}/drive/me/` } }
      );
      console.log('[SessionAPI] listFolders →', JSON.stringify(data).substring(0, 500));
      return this._extractFromExplorer(data);
    } catch (e) {
      console.warn('[SessionAPI] listFolders 失败:', e.message);
      return [];
    }
  },

  /**
   * 从 explorer v3 接口响应中提取文件夹列表
   */
  _extractFromExplorer(data) {
    if (!data) return [];
    const candidates = [
      data?.data?.nodes,
      data?.data?.list,
      data?.data?.children,
      data?.data?.items,
      data?.data,
    ];

    for (const list of candidates) {
      if (!Array.isArray(list) || list.length === 0) continue;
      return list
        .filter(item => {
          const name = item.name || item.title || '';
          if (!name) return false;
          const type = (item.type || item.obj_type || item.file_type || item.doc_type || '').toLowerCase();
          if (type && type !== 'folder' && type !== 'docx_folder' && type !== 'proj_folder') return false;
          return true;
        })
        .map(item => ({
          name: item.name || item.title || '未命名',
          token: item.token || item.folder_token || item.node_token || item.obj_token || item.id || item.key,
          type: item.type || item.obj_type || item.file_type || '',
        }))
        .filter(f => f.token);
    }
    return [];
  },

  // ========== 文件上传 + 导入（4步流程） ==========

  /**
   * 上传文件内容并导入为飞书文档
   * @param {string} content - 文件内容（Markdown 或 HTML）
   * @param {string} filename - 文件名（含扩展名）
   * @param {string} folderToken - 目标文件夹 token
   * @param {string} fileType - 导入类型：'docx'（md/html 都会转为此类型）
   * @param {string} fileExtension - 文件扩展名：'md' / 'html'
   * @returns {Promise<{document_id: string, url: string}>}
   */
  async uploadAndImport(content, filename, folderToken, fileExtension = 'md') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    const size = bytes.length;

    console.log('[SessionAPI] 开始上传:', filename, '大小:', size);

    // Step 1: 准备上传
    const prepareData = await this._prepareUpload(filename, size, folderToken, fileExtension);
    const uploadId = prepareData?.data?.upload_id || prepareData?.upload_id;
    if (!uploadId) {
      throw new Error('prepare 上传失败: 未获取到 upload_id, response: ' + JSON.stringify(prepareData).substring(0, 300));
    }
    console.log('[SessionAPI] prepare 成功, upload_id:', uploadId);

    // Step 2: 上传文件内容
    await this._uploadBlock(uploadId, bytes);

    // Step 3: 完成上传
    const finishData = await this._finishUpload(uploadId, 1);
    const fileToken = finishData?.data?.file_token || finishData?.file_token;
    if (!fileToken) {
      throw new Error('finish 上传失败: 未获取到 file_token, response: ' + JSON.stringify(finishData).substring(0, 300));
    }
    console.log('[SessionAPI] upload 成功, file_token:', fileToken);

    // Step 4: 导入为飞书文档
    const importData = await this._importCreate(fileToken, folderToken, fileExtension);
    const docId = importData?.data?.token || importData?.data?.node_token || importData?.data?.document_id || importData?.data?.obj_token;
    if (!docId) {
      throw new Error('import 失败: 未获取到文档 ID, response: ' + JSON.stringify(importData).substring(0, 300));
    }
    console.log('[SessionAPI] import 成功, document_id:', docId);

    return {
      document_id: docId,
      url: `https://${location.host}/docx/${docId}`
    };
  },

  /**
   * Step 1: 准备上传
   */
  async _prepareUpload(filename, size, folderToken, fileExtension) {
    return this._fetch(
      '/space/api/box/upload/prepare/?shouldBypassScsDialog=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        extraHeaders: {
          'x-command': 'space.api.box.upload.prepare',
          'x-request-id': this._requestId(),
          'referer': `https://${location.host}/drive/me/`,
        },
        body: JSON.stringify({
          mount_point: 'ccm_import',
          mount_node_token: folderToken || '',
          name: filename,
          size: size,
          extra: {
            extra: JSON.stringify({ obj_type: 'docx', file_extension: fileExtension })
          },
          size_checker: true
        })
      }
    );
  },

  /**
   * Step 2: 上传文件块到流式上传服务
   */
  async _uploadBlock(uploadId, bytes) {
    const blockSize = 4 * 1024 * 1024; // 4MB per block
    const totalBlocks = Math.ceil(bytes.length / blockSize) || 1;

    for (let i = 0; i < totalBlocks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, bytes.length);
      const block = bytes.slice(start, end);

      const checksum = this._checksum(block);

      const uploadUrl = `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/upload/merge_block/?shouldBypassScsDialog=true&upload_id=${uploadId}&mount_point=ccm_import`;

      const resp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-CSRFToken': this._getCsrfToken(),
          'x-command': 'space.api.box.stream.upload.merge_block',
          'x-request-id': this._requestId(),
          'x-block-list-checksum': String(checksum),
          'x-block-origin-size': String(block.length),
          'x-seq-list': String(i),
          'x-lsc-bizid': '2',
          'x-lsc-terminal': 'web',
          'x-lsc-version': '1',
          'x-lgw-app-id': '1161',
          'x-lgw-os-type': '3',
          'x-lgw-terminal-type': '2',
          'Origin': `https://${location.host}`,
          'Referer': `https://${location.host}/`,
        },
        credentials: 'include',
        body: block,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`upload block ${i} 失败: HTTP ${resp.status}: ${text.substring(0, 200)}`);
      }

      const result = await resp.json();
      console.log('[SessionAPI] upload block', i, '成功:', JSON.stringify(result).substring(0, 200));
    }
  },

  /**
   * Step 3: 完成上传
   */
  async _finishUpload(uploadId, numBlocks) {
    return this._fetch(
      '/space/api/box/upload/finish/?shouldBypassScsDialog=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        extraHeaders: {
          'x-command': 'space.api.box.upload.finish',
          'x-request-id': this._requestId(),
          'biz-scene': 'file_upload',
          'biz-ua-type': 'Web',
          'referer': `https://${location.host}/drive/me/`,
        },
        body: JSON.stringify({
          upload_id: uploadId,
          num_blocks: numBlocks,
          mount_point: 'ccm_import',
          push_open_history_record: 0
        })
      }
    );
  },

  /**
   * Step 4: 导入为飞书文档
   */
  async _importCreate(fileToken, folderToken, fileExtension) {
    return this._fetch(
      '/space/api/import/create/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        extraHeaders: {
          'x-request-id': this._requestId(),
          'referer': `https://${location.host}/drive/me/`,
        },
        body: JSON.stringify({
          file_token: fileToken,
          type: 'docx',
          file_extension: fileExtension,
          point: {
            mount_type: 1,
            mount_key: folderToken || ''
          },
          event_source: '1',
          client_token: this._clientToken(),
          passback: JSON.stringify({ time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        })
      }
    );
  },

  /**
   * 简单 checksum（对字节数组求和取模）
   */
  _checksum(bytes) {
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
      sum = (sum + bytes[i]) & 0xFFFFFFFF;
    }
    return sum >>> 0;
  }
};
