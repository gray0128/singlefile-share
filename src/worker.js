import { D1Helper } from './db.js';
import { R2Helper } from './r2.js';
import { AuthHelper, createSessionCookie, verifySession, createLogoutResponse } from './auth.js';
import { handleScheduled } from './cron.js';
import { extractTextFromHtml } from './utils.js';
import { renderMarkdownToHtml, extractTitleFromMarkdown, extractTextFromMarkdown } from './markdown.js';

// Helper for Vectorize
async function updateVectorIndex(env, fileId, content, metadata) {
    if (!env.AI || !env.VECTOR_INDEX) return;
    try {
        // Limit text for embedding (approx 8000 chars safe for bge-m3)
        const text = content.substring(0, 8000);
        const embeddingResp = await env.AI.run('@cf/baai/bge-m3', { text: [text] });
        const vector = embeddingResp.data[0];

        await env.VECTOR_INDEX.upsert([{
            id: fileId.toString(),
            values: vector,
            metadata: metadata
        }]);
    } catch (e) {
        console.error('Vector index error:', e);
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const db = new D1Helper(env.DB);
        const bucket = new R2Helper(env.BUCKET);
        const auth = new AuthHelper(env);

        // Auto-migration (safe to run)
        await db.initSchema();

        // --- Auth Routes ---
        if (path === '/auth/login') {
            return auth.redirect();
        }

        if (path === '/auth/callback') {
            try {
                const githubUser = await auth.callback(request);
                if (githubUser instanceof Response) return githubUser;

                let user = await db.getUserByGithubId(githubUser.id.toString());
                if (!user) {
                    const adminIds = (env.ADMIN_GITHUB_IDS || '').split(',').map(s => s.trim().toLowerCase());
                    const isadmin = adminIds.includes(githubUser.login.toLowerCase());
                    const role = isadmin ? 'admin' : 'user';
                    const status = isadmin ? 'active' : 'pending';

                    user = await db.createUser(
                        githubUser.id.toString(),
                        githubUser.login,
                        githubUser.avatar_url,
                        role,
                        status
                    );
                } else {
                    const adminIds = (env.ADMIN_GITHUB_IDS || '').split(',').map(s => s.trim().toLowerCase());
                    const isadmin = adminIds.includes(githubUser.login.toLowerCase());
                    if (isadmin && user.role !== 'admin') {
                        user = await db.updateUserRoleAndStatus(user.id, 'admin', 'active');
                    }
                }

                const cookie = await createSessionCookie(user.id, env.JWT_SECRET);
                return new Response(null, {
                    status: 302,
                    headers: { 'Set-Cookie': cookie, 'Location': '/dashboard' },
                });
            } catch (e) {
                return new Response('Auth Error: ' + e.message, { status: 500 });
            }
        }

        if (path === '/auth/me') {
            const userId = await verifySession(request);
            if (!userId) return new Response('Unauthorized', { status: 401 });
            const user = await db.getUserById(userId);
            if (!user) return new Response('Unauthorized', { status: 401 });

            const usage = await db.getUserUsage(userId);
            if (usage) {
                user.storage_usage = usage.total_used;
                user.file_count = usage.file_count;
            }
            return Response.json(user);
        }

        if (path === '/auth/logout') {
            return createLogoutResponse();
        }

        // --- Public Config API ---
        if (path === '/api/config') {
            return Response.json({
                timezone: env.DISPLAY_TIMEZONE || 'Asia/Shanghai'
            });
        }

        // --- Public Share Access ---
        if (path.startsWith('/raw/')) {
            const shareId = path.split('/raw/')[1];
            const share = await db.getShareByShareId(shareId);

            if (!share) return new Response('Not Found or Disabled', { status: 404 });

            ctx.waitUntil(db.incrementVisitCount(shareId));

            const object = await bucket.get(share.r2_key);
            if (!object) return new Response('File Missing', { status: 404 });

            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);

            // 检查是否是 Markdown 文件
            const isMarkdown = share.mime_type === 'text/markdown' || share.r2_key.endsWith('.md');

            if (isMarkdown) {
                // Markdown 文件：渲染为 HTML
                const content = await object.text();
                const html = renderMarkdownToHtml(content, share.display_name || 'Markdown Document');
                headers.set('Content-Type', 'text/html; charset=utf-8');
                // 允许加载外部图片
                headers.set('Content-Security-Policy', "sandbox allow-scripts allow-same-origin; default-src 'self'; style-src 'unsafe-inline'; img-src * data:;");
                return new Response(html, { headers });
            }

            // HTML 文件：直接返回（原有行为）
            // Security Headers
            headers.set('Content-Security-Policy', "sandbox allow-scripts allow-same-origin; default-src 'self'; style-src 'unsafe-inline'; img-src * data:;");

            return new Response(object.body, { headers });
        }

        // --- Public API: Share Info ---
        if (path.startsWith('/api/s/')) {
            const shareId = path.split('/api/s/')[1];
            const share = await db.getShareByShareId(shareId);
            if (!share) return new Response('Not Found', { status: 404 });
            return Response.json(share);
        }

        // --- Static Assets (Public) ---
        if (!path.startsWith('/api/') && !path.startsWith('/auth/')) {
            if (path.startsWith('/s/')) {
                return await env.ASSETS.fetch(new URL('/share.html', request.url));
            }
            if (path === '/dashboard') {
                return await env.ASSETS.fetch(new URL('/dashboard.html', request.url));
            }
            if (path === '/admin') {
                // Simple protection: only serve HTML, API calls will check role
                // But better to check auth? For static HTML it's fine, data is protected.
                return await env.ASSETS.fetch(new URL('/admin.html', request.url));
            }
            return await env.ASSETS.fetch(request);
        }

        // --- Protected API Routes ---
        const userId = await verifySession(request);
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const currentUser = await db.getUserById(userId);
        if (!currentUser) return new Response('Unauthorized', { status: 401 });

        if (currentUser.status === 'locked') {
            return new Response('Account Locked', { status: 403 });
        }

        // --- Admin Routes ---
        if (path.startsWith('/api/admin/')) {
            if (currentUser.role !== 'admin') {
                return new Response('Forbidden', { status: 403 });
            }

            if (path === '/api/admin/users' && method === 'GET') {
                const urlObj = new URL(request.url);
                const page = parseInt(urlObj.searchParams.get('page') || '1');
                const limit = parseInt(urlObj.searchParams.get('limit') || '20');
                const role = urlObj.searchParams.get('role');
                const status = urlObj.searchParams.get('status');
                const search = urlObj.searchParams.get('search');
                const result = await db.listUsers({ page, limit, role, status, search });
                return Response.json(result);
            }

            if (path.startsWith('/api/admin/users/') && path.endsWith('/status') && method === 'PATCH') {
                const id = path.split('/')[4];
                const { status } = await request.json();
                const updated = await db.updateUserStatus(id, status);
                return Response.json(updated);
            }

            if (path.startsWith('/api/admin/users/') && path.endsWith('/quota') && method === 'PATCH') {
                const id = path.split('/')[4];
                const { limit } = await request.json();
                const updated = await db.updateUserQuota(id, parseInt(limit));
                return Response.json(updated);
            }

            // REINDEX CONTENT (Admin)
            if (path === '/api/admin/reindex' && method === 'POST') {
                const limit = 5; // Process small batch to avoid timeout
                const files = await db.getFilesMissingFts(limit);

                let processed = 0;
                for (const file of files) {
                    try {
                        const object = await bucket.get(file.r2_key);
                        if (object) {
                            const text = await object.text();
                            const content = extractTextFromHtml(text);
                            await db.indexFile(file.id, file.display_name, file.description, content);

                            // Also update vector index
                            await updateVectorIndex(env, file.id, content, {
                                userId: file.user_id,
                                displayName: file.display_name
                            });

                            processed++;
                        }
                    } catch (e) {
                        console.error(`Failed to index file ${file.id}:`, e);
                    }
                }

                return Response.json({ processed, remaining_batch_size: files.length });
            }

            return new Response('Not Found', { status: 404 });
        }

        // LIST FILES
        if (path === '/api/files' && method === 'GET') {
            const urlObj = new URL(request.url);
            const search = urlObj.searchParams.get('search');
            const tag = urlObj.searchParams.get('tag');
            const type = urlObj.searchParams.get('type') || 'vector'; // default to vector

            let fileIds = null;

            // Only perform vector search if type is 'vector' AND search term exists
            if (search && type === 'vector' && env.AI && env.VECTOR_INDEX) {
                try {
                    const embeddingResp = await env.AI.run('@cf/baai/bge-m3', { text: [search] });
                    const queryVector = embeddingResp.data[0];
                    // Search Vectorize
                    const matches = await env.VECTOR_INDEX.query(queryVector, { topK: 20 });

                    if (matches.matches && matches.matches.length > 0) {
                        fileIds = matches.matches.map(m => m.id);
                    } else {
                        fileIds = []; // No matches found in vector search
                    }
                } catch (e) {
                    console.error('Vector search failed, falling back to FTS:', e);
                    // fileIds remains null, which DB layer might interpret as "ignore ID filter"
                    // But for 'vector' type failure, we might want to fallback to 'meta' or 'exact'?
                    // Current DB logic: if fileIds is null, it falls back to metadata search if 'search' is present.
                    // This is acceptable behavior (soft degradation).
                }
            }

            const files = await db.getFilesByUserId(userId, { search, tag, fileIds, type });
            return Response.json(files);
        }

        // PENDING USER BLOCK
        if (currentUser.status === 'pending' && method !== 'GET') {
            return new Response('Account Pending Verification', { status: 403 });
        }

        // UPLOAD FILE (Web Dashboard)
        if (path === '/api/files' && method === 'POST') {
            const formData = await request.formData();
            const file = formData.get('file');

            if (!file || !(file instanceof File)) return new Response('No file', { status: 400 });
            if (!file.name.match(/\.(html?|md)$/i)) return new Response('Only HTML and Markdown files allowed', { status: 400 });
            if (file.size > 10 * 1024 * 1024) return new Response('Max 10MB', { status: 400 });

            // Check Quota
            const usage = await db.getUserUsage(userId);
            const limit = currentUser.storage_limit || 104857600;
            if ((usage.total_used + file.size) > limit) return new Response('Quota exceeded', { status: 403 });

            const isMarkdown = file.name.match(/\.md$/i);
            const extension = isMarkdown ? 'md' : 'html';
            const r2Key = `files/${userId}/${crypto.randomUUID()}.${extension}`;

            const text = await file.text();
            let displayName;
            let contentText;
            let contentType;

            if (isMarkdown) {
                // Markdown 文件：从第一行 # 提取标题
                const titleFromMd = extractTitleFromMarkdown(text);
                displayName = titleFromMd || file.name.replace(/\.md$/i, '');
                contentText = extractTextFromMarkdown(text);
                contentType = 'text/markdown';
            } else {
                // HTML 文件：从 <title> 标签提取
                const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
                displayName = titleMatch ? titleMatch[1].trim() : file.name;
                contentText = extractTextFromHtml(text);
                contentType = 'text/html';
            }

            await bucket.put(r2Key, text, {
                httpMetadata: { contentType: contentType }
            });

            const newFile = await db.createFile(userId, file.name, displayName, file.size, r2Key, contentType, null, contentText);

            // Trigger Vector Indexing
            ctx.waitUntil(updateVectorIndex(env, newFile.id, contentText, {
                userId: userId,
                displayName: displayName
            }));

            return Response.json(newFile);
        }

        // DELETE FILE
        if (path.startsWith('/api/files/') && method === 'DELETE') {
            const id = path.split('/api/files/')[1];
            const file = await db.getFileById(id);
            if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

            await bucket.delete(file.r2_key);

            // Delete from Vector Index
            if (env.VECTOR_INDEX) {
                ctx.waitUntil(env.VECTOR_INDEX.deleteByIds([id]));
            }

            await db.deleteFile(id);
            return new Response('Deleted', { status: 200 });
        }

        // RENAME FILE
        if (path.startsWith('/api/files/') && method === 'PATCH') {
            const id = path.split('/api/files/')[1];
            // Check for sub-resource (description)
            if (path.endsWith('/description')) {
                const fileId = path.split('/')[3];
                const file = await db.getFileById(fileId);
                if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

                const { description } = await request.json();
                const result = await db.updateFileDescription(fileId, description);
                return Response.json(result);
            }

            const file = await db.getFileById(id);
            if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

            const { filename } = await request.json(); // actually display_name
            if (filename) await db.updateFilename(id, filename);
            return new Response('Updated', { status: 200 });
        }

        // FILE TAGS
        if (path.startsWith('/api/files/') && path.includes('/tags')) {
            // POST /api/files/:id/tags
            if (method === 'POST') {
                const fileId = path.split('/')[3];
                const file = await db.getFileById(fileId);
                if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

                const { tagId } = await request.json();
                await db.addFileTag(fileId, tagId);
                return new Response('Added', { status: 200 });
            }
            // DELETE /api/files/:id/tags/:tagId
            if (method === 'DELETE') {
                const parts = path.split('/');
                const fileId = parts[3];
                const tagId = parts[5];
                const file = await db.getFileById(fileId);
                if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

                await db.removeFileTag(fileId, tagId);
                return new Response('Removed', { status: 200 });
            }
        }

        // TAG MANAGEMENT
        if (path.startsWith('/api/tags')) {
            if (method === 'GET') {
                const tags = await db.getUserTags(userId);
                return Response.json(tags);
            }
            if (method === 'POST') {
                const { name } = await request.json();
                if (!name) return new Response('Name required', { status: 400 });
                try {
                    const tag = await db.createTag(userId, name);
                    return Response.json(tag);
                } catch (e) {
                    return new Response('Tag already exists or invalid', { status: 400 });
                }
            }
            if (method === 'PUT') {
                // /api/tags/:id
                const id = path.split('/')[3];
                const { name } = await request.json();
                // Verify ownership (simplified: try update where user_id matches, but db updateTag only takes id)
                // We need to ensure user owns tag. db.getUserTags could be used to verify?
                // Or just assume id is unique enough? Better: getUserTags to check ownership
                const userTags = await db.getUserTags(userId);
                const owned = userTags.find(t => t.id == id);
                if (!owned) return new Response('Not Found', { status: 404 });

                const result = await db.updateTag(id, name);
                return Response.json(result);
            }
            if (method === 'DELETE') {
                const id = path.split('/')[3];
                const userTags = await db.getUserTags(userId);
                const owned = userTags.find(t => t.id == id);
                if (!owned) return new Response('Not Found', { status: 404 });

                await db.deleteTag(id);
                return new Response('Deleted', { status: 200 });
            }
        }

        // SHARE ACTIONS
        if (path.endsWith('/share') && method === 'POST') {
            const id = path.split('/')[3]; // api/files/ID/share
            const file = await db.getFileById(id);
            if (!file || file.user_id !== userId) return new Response('Not Found', { status: 404 });

            const body = await request.json().catch(() => ({}));
            const existing = await db.getShareByFileId(id);

            if (existing) {
                const newState = (body.enable !== undefined) ? body.enable : !existing.is_enabled;
                const updated = await db.toggleShare(id, newState);
                return Response.json(updated);
            } else {
                const shareId = crypto.randomUUID();
                const newShare = await db.createShare(id, shareId);
                return Response.json(newShare);
            }
        }

        return new Response('Not Found', { status: 404 });
    },

    // SCHEDULED CRON HANDLER
    async scheduled(event, env, ctx) {
        await handleScheduled(event, env, ctx);
    }
};
