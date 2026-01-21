# SingleFile Share

一个专为 [SingleFile](https://github.com/gildas-lormeau/SingleFile) 扩展设计的单文件分享服务。提供无缝的网页归档上传、管理与分享体验。

## 核心特性

- **无缝集成**: 支持在 SingleFile 扩展中配置 S3 存储，实现网页归档直接上传。
- **Web 仪表盘**: 现代化的瀑布流风格文件管理界面，实时显示文件统计。
- **安全分享**: 生成唯一的分享链接，支持在线沙箱预览与原始文件下载。
- **用户管理**: 基于 GitHub OAuth 的用户系统，包含管理员审核与存储配额管理。
- **极速体验**: 基于全栈 Cloudflare 架构 (Workers + R2 + D1)，全球边缘分发。
- **原生技术**: 前端采用 "No-Build" 架构，纯原生 ES Modules，无需构建工具。
- **时区支持**: 可配置的时区设置，默认使用 `Asia/Shanghai` 时区显示时间。

## 🛠 技术栈

本项目完全构建在 Cloudflare 开发者平台之上：

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless JavaScript)
- **Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (对象存储)
- **Database**: [Cloudflare D1](https://www.cloudflare.com/developer-platform/d1/) (SQLite 数据库)
- **Frontend**: Vanilla JS (ESM), CSS Variables, Hand-crafted UI.
- **Deployment**: Wrangler CLI

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) (v16.13.0+)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) CLI (`npm install -g wrangler`)
- Cloudflare 账号

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/singlefile-share.git
   cd singlefile-share
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **创建 D1 数据库 (仅首次)**
   ```bash
   wrangler d1 create singlefile-share-db
   # 将输出的 database_id 更新到 wrangler.toml 中
   ```

4. **初始化数据库 Schema**
   ```bash
   wrangler d1 execute singlefile-share-db --local --file=./schema.sql
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```
   访问 `http://localhost:8787` 开始使用。

### 部署

1. **创建 R2 存储桶**
   ```bash
   wrangler r2 bucket create singlefile-share-files
   ```

2. **部署 Worker**
   ```bash
   npm run deploy
   ```

3. **远程数据库迁移**
   ```bash
   wrangler d1 execute singlefile-share-db --remote --file=./schema.sql
   ```

## ⚙️ SingleFile 扩展配置

要实现从浏览器扩件直接上传文件，请按照以下步骤配置 SingleFile：

1. 打开 SingleFile 选项设置。
2. 找到 **"Destination"** (目标) -> **"upload to an S3 bucket"** (上传到 S3 存储桶)。
3. 勾选该选项并填写以下信息：
   - **Access key ID**: (在 Cloudflare R2 面板生成的 Access Key)
   - **Secret access key**: (对应的 Secret Key)
   - **Bucket**: `singlefile-share-files`
   - **Region**: `auto`
   - **Endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - **Path**: `files/{user_id}/` (建议配置，未配置将自动归档)
4. 保存设置。

现在，当您保存网页时，SingleFile 将自动将其上传到您的私有云存储中。

## 🤝 贡献

欢迎提交 Issue 和 Pull Requests！

## 📄 许可证

MIT License
