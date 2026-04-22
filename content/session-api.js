/**
 * Feishu Copy - 飞书会话 API 客户端
 * 利用当前飞书页面 cookie 直接调用内部 API，无需配置 app_id/app_secret
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
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'x-csrftoken': this._getCsrfToken(),
      'x-lsc-bizid': '2',
      'x-lsc-terminal': 'web',
      'x-lsc-version': '1',
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

    // explorer v3 返回结构: data.data.nodes[] 或 data.data[]
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
          // 过滤：只要文件夹类型
          const type = (item.type || item.obj_type || item.file_type || item.doc_type || '').toLowerCase();
          if (type && type !== 'folder' && type !== 'docx_folder' && type !== 'proj_folder') {
            return false;
          }
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

  /**
   * 创建文档
   */
  async createDocument(title, folderToken) {
    const folderBody = folderToken ? { FolderToken: folderToken, folder_token: folderToken, token: folderToken } : {};
    const attempts = [
      { path: '/docx/api/v1/create', body: { title, ...folderBody } },
      { path: '/docx/api/v1/documents', body: { title, folder_token: folderToken || undefined } },
      { path: '/space/api/box/folder/create_file/', body: { title, type: 'docx', token: folderToken || undefined } },
    ];

    let lastError;
    for (const { path, body } of attempts) {
      try {
        const data = await this._fetch(path, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        console.log('[SessionAPI]', path, '→', JSON.stringify(data).substring(0, 300));

        const docId =
          data?.data?.document_id ||
          data?.data?.node_token ||
          data?.data?.obj_token ||
          data?.document_id ||
          data?.obj_token;

        if (docId) {
          return {
            document_id: docId,
            url: `https://${location.host}/docx/${docId}`
          };
        }
        console.warn('[SessionAPI] 响应中未找到文档 ID:', JSON.stringify(data).substring(0, 300));
        lastError = new Error('响应格式异常');
      } catch (e) {
        lastError = e;
        console.warn('[SessionAPI]', path, '失败:', e.message);
      }
    }
    throw lastError || new Error('所有创建端点均失败');
  },

  /**
   * 批量写入文档块
   */
  async createBlocks(documentId, parentBlockId, apiBlocks) {
    const BATCH_SIZE = 50;
    const RATE_LIMIT_MS = 340;

    for (let i = 0; i < apiBlocks.length; i += BATCH_SIZE) {
      const batch = apiBlocks.slice(i, i + BATCH_SIZE);
      const endpoints = [
        `/docx/api/v1/documents/${documentId}/blocks/${parentBlockId}/children`,
        `/docx/api/v1/documents/${documentId}/blocks/${parentBlockId}/children/batch`,
      ];

      let success = false;
      for (const path of endpoints) {
        try {
          await this._fetch(path, {
            method: 'POST',
            body: JSON.stringify({ children: batch })
          });
          console.log('[SessionAPI] 写入块 batch', Math.floor(i / BATCH_SIZE), '成功');
          success = true;
          break;
        } catch (e) {
          console.warn('[SessionAPI]', path, '写入失败:', e.message);
        }
      }

      if (!success) {
        console.warn('[SessionAPI] batch', i, '所有端点均失败');
      }

      if (i + BATCH_SIZE < apiBlocks.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    }
  }
};
