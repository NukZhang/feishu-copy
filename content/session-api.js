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

  _headers() {
    return {
      'Content-Type': 'application/json',
      'x-csrftoken': this._getCsrfToken(),
    };
  },

  async _fetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `https://${location.host}${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: { ...this._headers(), ...(options.headers || {}) },
      credentials: 'include'
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }
    return resp.json();
  },

  /**
   * 尝试多个端点，返回第一个成功且有数据的结果
   */
  async _tryEndpoints(endpoints, label) {
    for (const ep of endpoints) {
      try {
        const opts = ep.body
          ? { method: 'POST', body: JSON.stringify(ep.body) }
          : {};
        const data = await this._fetch(ep.path, opts);
        console.log('[SessionAPI]', label, ep.path, '→', JSON.stringify(data).substring(0, 500));
        const folders = this._extractFolders(data);
        if (folders.length > 0) return folders;
        // 即使 folders 为空也检查原始响应结构
        console.log('[SessionAPI]', label, 'extracted 0 folders, raw keys:', data ? Object.keys(data) : 'null',
          'data keys:', data?.data ? Object.keys(data.data) : 'no data');
      } catch (e) {
        console.warn('[SessionAPI]', label, ep.path, '失败:', e.message);
      }
    }
    return null;
  },

  /**
   * 获取根目录文件夹列表
   */
  async getRootFolders() {
    // POST 端点
    const postEndpoints = [
      { path: '/drive/api/v1/files', body: { type: 'folder', page_size: 100 } },
      { path: '/drive/api/v1/entry/list', body: { type: 'folder', page_size: 100, order_by: 'EditedTime' } },
      { path: '/drive/api/v1/explore', body: { method: 'listFolder', page_size: 100 } },
      { path: '/drive/api/v1/box/list', body: { type: 'folder', page_size: 100 } },
      { path: '/drive/mina/api/v1/entry/list', body: { type: 'folder', page_size: 100 } },
      { path: '/space/api/box/folder/list/', body: { type: 'folder', page_size: 100 } },
      { path: '/space/api/v1/nodes', body: { type: 'folder', page_size: 100 } },
      { path: '/drive/explorer/v1/root/', body: { method: 'list' } },
      { path: '/suite/ops/api/drive/explorer/my_space', body: {} },
    ];

    let result = await this._tryEndpoints(postEndpoints, 'getRootFolders');
    if (result) return result;

    // GET 降级
    const getEndpoints = [
      { path: '/drive/api/v1/files?type=folder&page_size=100' },
      { path: '/drive/api/v1/files/root/children?type=folder' },
      { path: '/space/api/box/folder/root/list/' },
    ];

    for (const ep of getEndpoints) {
      try {
        const data = await this._fetch(ep.path);
        console.log('[SessionAPI] getRootFolders GET', ep.path, '→', JSON.stringify(data).substring(0, 500));
        const folders = this._extractFolders(data);
        if (folders.length > 0) return folders;
      } catch (e) {
        console.warn('[SessionAPI] getRootFolders GET', ep.path, '失败:', e.message);
      }
    }

    return [];
  },

  /**
   * 列出指定文件夹下的子文件夹
   */
  async listFolders(parentToken) {
    if (!parentToken) return this.getRootFolders();

    const endpoints = [
      { path: `/drive/api/v1/files/${parentToken}/children`, body: { type: 'folder', page_size: 100 } },
      { path: '/drive/api/v1/entry/list', body: { folder_token: parentToken, type: 'folder', page_size: 100 } },
      { path: `/drive/api/v1/explore`, body: { method: 'listFolder', folder_key: parentToken, page_size: 100 } },
      { path: '/space/api/box/folder/list/', body: { token: parentToken, type: 'folder', page_size: 100 } },
      { path: `/drive/explorer/v1/folder/${parentToken}/children`, body: { type: 'folder', page_size: 100 } },
      { path: '/suite/ops/api/drive/explorer/list', body: { folder_token: parentToken, filter: 'folder' } },
      { path: `/drive/mina/api/v1/entry/list`, body: { folder_token: parentToken, type: 'folder', page_size: 100 } },
    ];

    let result = await this._tryEndpoints(endpoints, `listFolders(${parentToken})`);
    return result || [];
  },

  /**
   * 从 API 响应中提取文件夹列表
   */
  _extractFolders(data) {
    if (!data) return [];
    const candidates = [
      data?.data?.children,
      data?.data?.folders,
      data?.data?.items,
      data?.data?.nodes,
      data?.data?.list,
      data?.data?.entries,
      data?.data?.files,
      data?.data?.entities,
      data?.children,
      data?.folders,
      data?.items,
      data?.entries,
      data?.files,
    ];

    for (const list of candidates) {
      if (!Array.isArray(list) || list.length === 0) continue;
      return list
        .filter(item => {
          const type = (item.type || item.obj_type || item.file_type || item.doc_type || '').toLowerCase();
          const name = item.name || item.title || '';
          // 只要有名字就保留（有些不返回 type 字段）
          if (!name) return false;
          if (type && type !== 'folder' && type !== 'docx_folder' && type !== 'proj_folder'
            && type !== 'sheet' && type !== 'bitable' && type !== 'doc') {
            // 明确非文件夹类型则过滤
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
