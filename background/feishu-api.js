/**
 * Feishu Copy - 飞书 Open API 客户端
 */
class FeishuAPI {
  constructor(appId, appSecret) {
    this.appId = appId;
    this.appSecret = appSecret;
    this._token = null;
    this._tokenExpiry = 0;
  }

  /**
   * 获取 tenant_access_token
   */
  async getToken() {
    const resp = await this._fetch('/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret
      })
    });
    return resp;
  }

  /**
   * 确保 token 有效
   */
  async ensureToken() {
    if (this._token && Date.now() < this._tokenExpiry) return this._token;

    const resp = await this.getToken();
    if (resp.code !== 0) {
      throw new Error(`认证失败: ${resp.msg || '未知错误'}`);
    }

    this._token = resp.tenant_access_token;
    this._tokenExpiry = Date.now() + (resp.expire || 7200) * 1000 - 300000; // 提前 5 分钟过期
    return this._token;
  }

  /**
   * 创建文档
   */
  async createDocument(title, folderToken) {
    const query = folderToken ? `?folder_token=${folderToken}` : '';
    const resp = await this._fetch(`/open-apis/docx/v1/documents${query}`, {
      method: 'POST',
      headers: await this._authHeaders(),
      body: JSON.stringify({ title })
    });

    if (resp.code !== 0) {
      throw new Error(`创建文档失败: ${resp.msg || '未知错误'}`);
    }

    return resp.data.document;
  }

  /**
   * 批量创建文档块
   */
  async createBlocks(documentId, parentBlockId, blocks) {
    const BATCH_SIZE = 50;
    const RATE_LIMIT_MS = 340;

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);

      const resp = await this._fetch(
        `/open-apis/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`,
        {
          method: 'POST',
          headers: await this._authHeaders(),
          body: JSON.stringify({ children: batch })
        }
      );

      if (resp.code !== 0) {
        console.warn(`[FeishuAPI] 批量写入块失败 (batch ${i}):`, resp.msg);
        // 继续尝试后续批次
      }

      // 限速
      if (i + BATCH_SIZE < blocks.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }
  }

  /**
   * 带认证的请求头
   */
  async _authHeaders() {
    const token = await this.ensureToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * 封装 fetch 请求
   */
  async _fetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `https://open.feishu.cn${path}`;

    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    return resp.json();
  }
}
