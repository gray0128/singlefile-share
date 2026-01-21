export class D1Helper {
    constructor(db) {
        this.db = db;
    }

    // Schema Migration
    async initSchema() {
        // Create tags table
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, name)
            )
        `).run();

        // Create file_tags table
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS file_tags (
                file_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (file_id, tag_id),
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )
        `).run();

        // Add description column if missing
        try {
            await this.db.prepare('ALTER TABLE files ADD COLUMN description TEXT').run();
        } catch (e) {
            // Ignore error if column already exists
        }
    }

    // User Operations
    async getUserByGithubId(githubId) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE github_id = ?');
        return await stmt.bind(githubId).first();
    }

    async createUser(githubId, username, avatarUrl, role = 'user', status = 'pending') {
        const stmt = this.db.prepare(
            'INSERT INTO users (github_id, username, avatar_url, role, status) VALUES (?, ?, ?, ?, ?) RETURNING *'
        );
        return await stmt.bind(githubId, username, avatarUrl, role, status).first();
    }

    async getUserById(id) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return await stmt.bind(id).first();
    }

    async updateUser(id, { username, avatar_url }) {
        // Optional: helper to update user profile if needed
        const stmt = this.db.prepare('UPDATE users SET username = ?, avatar_url = ? WHERE id = ? RETURNING *');
        return await stmt.bind(username, avatar_url, id).first();
    }

    async getFirstAdmin() {
        const stmt = this.db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
        return await stmt.first();
    }

    // Admin Operations
    async listUsers({ page = 1, limit = 20, role, status, search } = {}) {
        let query = `
            SELECT u.*, 
            COUNT(f.id) as file_count, 
            COALESCE(SUM(f.size), 0) as total_storage_used 
            FROM users u 
            LEFT JOIN files f ON u.id = f.user_id 
            WHERE 1=1
        `;
        const params = [];

        if (role) {
            query += ' AND u.role = ?';
            params.push(role);
        }
        if (status) {
            query += ' AND u.status = ?';
            params.push(status);
        }
        if (search) {
            query += ' AND (u.username LIKE ? OR u.github_id LIKE ?)';
            params.push(`%${search}%`);
            params.push(`%${search}%`);
        }

        query += ' GROUP BY u.id';

        // Get total count (approximation for pagination)
        let countSql = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
        const countParams = [];
        if (role) {
            countSql += ' AND u.role = ?';
            countParams.push(role);
        }
        if (status) {
            countSql += ' AND u.status = ?';
            countParams.push(status);
        }
        if (search) {
            countSql += ' AND (u.username LIKE ? OR u.github_id LIKE ?)';
            countParams.push(`%${search}%`);
            countParams.push(`%${search}%`);
        }

        const countStmt = this.db.prepare(countSql);
        const totalResult = await countStmt.bind(...countParams).first();

        // Add pagination
        query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit);
        params.push((page - 1) * limit);

        const stmt = this.db.prepare(query);
        const results = await stmt.bind(...params).all();

        return {
            users: results.results || [],
            total: totalResult.total,
            page,
            limit
        };
    }

    async updateUserStatus(id, status) {
        const stmt = this.db.prepare('UPDATE users SET status = ? WHERE id = ? RETURNING *');
        return await stmt.bind(status, id).first();
    }

    async updateUserRoleAndStatus(id, role, status) {
        const stmt = this.db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ? RETURNING *');
        return await stmt.bind(role, status, id).first();
    }

    async updateUserQuota(id, limit) {
        const stmt = this.db.prepare('UPDATE users SET storage_limit = ? WHERE id = ? RETURNING *');
        return await stmt.bind(limit, id).first();
    }

    async getUserUsage(userId) {
        const stmt = this.db.prepare(`
            SELECT 
                u.storage_limit,
                COUNT(f.id) as file_count,
                COALESCE(SUM(f.size), 0) as total_used
            FROM users u
            LEFT JOIN files f ON u.id = f.user_id
            WHERE u.id = ?
            GROUP BY u.id
        `);
        return await stmt.bind(userId).first();
    }

    // File Operations
    async createFile(userId, filename, displayName, size, r2Key, mimeType = 'text/html', description = null) {
        const stmt = this.db.prepare(
            'INSERT INTO files (user_id, filename, display_name, size, r2_key, mime_type, description) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
        );
        return await stmt.bind(userId, filename, displayName, size, r2Key, mimeType, description).first();
    }

    async updateFileDescription(id, description) {
        const stmt = this.db.prepare('UPDATE files SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *');
        return await stmt.bind(description, id).first();
    }

    async getFilesByUserId(userId, { search, tag } = {}) {
        let query = `
            SELECT f.*, 
            s.is_enabled as share_enabled, s.share_id, s.visit_count,
            (SELECT json_group_array(json_object('id', t.id, 'name', t.name)) 
             FROM tags t 
             JOIN file_tags ft ON t.id = ft.tag_id 
             WHERE ft.file_id = f.id) as tags
            FROM files f
            LEFT JOIN shares s ON f.id = s.file_id
            WHERE f.user_id = ?
        `;
        const params = [userId];

        if (search) {
            query += ' AND (f.display_name LIKE ? OR f.description LIKE ?)';
            params.push(`%${search}%`);
            params.push(`%${search}%`);
        }

        if (tag) {
            query += ` AND EXISTS (
                SELECT 1 FROM file_tags ft
                JOIN tags t ON ft.tag_id = t.id
                WHERE ft.file_id = f.id AND t.name = ?
            )`;
            params.push(tag);
        }

        query += ' ORDER BY f.created_at DESC';

        const stmt = this.db.prepare(query);
        const result = await stmt.bind(...params).all();

        // Parse tags JSON string to object
        const results = result.results || [];
        return results.map(file => {
            if (file.tags && typeof file.tags === 'string') {
                try {
                    file.tags = JSON.parse(file.tags);
                } catch (e) {
                    file.tags = [];
                }
            } else {
                file.tags = [];
            }
            return file;
        });
    }



    async deleteFile(id) {
        const stmt = this.db.prepare('DELETE FROM files WHERE id = ?');
        return await stmt.bind(id).run();
    }

    async updateFilename(id, newName) {
        const stmt = this.db.prepare('UPDATE files SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        return await stmt.bind(newName, id).run();
    }

    async getAllFileKeys() {
        const stmt = this.db.prepare('SELECT r2_key FROM files');
        const results = await stmt.all();
        return results.results || [];
    }

    // Share Operations
    async createShare(fileId, shareId) {
        const stmt = this.db.prepare(
            'INSERT INTO shares (file_id, share_id, is_enabled) VALUES (?, ?, 1) RETURNING *'
        );
        return await stmt.bind(fileId, shareId).first();
    }

    async getShareByFileId(fileId) {
        const stmt = this.db.prepare('SELECT * FROM shares WHERE file_id = ?');
        return await stmt.bind(fileId).first();
    }

    async toggleShare(fileId, isEnabled) {
        // Upsert logic could be used, but simplified here: update if exists, insert if not? 
        // Or simpler: The requirements say "create share link". 
        // For toggle, we assume share record might exist. 
        // If it doesn't exist, we might need to create it (but we need shareId).
        // Let's assume createShare is called first time, toggle is for updates.
        // Or better: toggle just updates is_enabled. 
        const stmt = this.db.prepare(
            'UPDATE shares SET is_enabled = ? WHERE file_id = ? RETURNING *'
        );
        return await stmt.bind(isEnabled ? 1 : 0, fileId).first();
    }

    async getShareByShareId(shareId) {
        // Join with files to get file info
        const stmt = this.db.prepare(`
      SELECT s.*, f.filename, f.display_name, f.r2_key, f.user_id, f.mime_type, f.size
      FROM shares s
      JOIN files f ON s.file_id = f.id
      WHERE s.share_id = ? AND s.is_enabled = 1
    `);
        return await stmt.bind(shareId).first();
    }

    async incrementVisitCount(shareId) {
        const stmt = this.db.prepare(
            'UPDATE shares SET visit_count = visit_count + 1 WHERE share_id = ?'
        );
        return await stmt.bind(shareId).run();
    }

    // Tag Operations
    async createTag(userId, name) {
        const stmt = this.db.prepare(
            'INSERT INTO tags (user_id, name) VALUES (?, ?) RETURNING *'
        );
        return await stmt.bind(userId, name).first();
    }

    async getUserTags(userId) {
        const stmt = this.db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC');
        const result = await stmt.bind(userId).all();
        return result.results || [];
    }

    async updateTag(id, name) {
        const stmt = this.db.prepare('UPDATE tags SET name = ? WHERE id = ? RETURNING *');
        return await stmt.bind(name, id).first();
    }

    async deleteTag(id) {
        const stmt = this.db.prepare('DELETE FROM tags WHERE id = ?');
        return await stmt.bind(id).run();
    }

    // File Tag Operations
    async addFileTag(fileId, tagId) {
        const stmt = this.db.prepare(
            'INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)'
        );
        return await stmt.bind(fileId, tagId).run();
    }

    async removeFileTag(fileId, tagId) {
        const stmt = this.db.prepare('DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?');
        return await stmt.bind(fileId, tagId).run();
    }

    async getFileById(id) {
        // Updated to include tags
        const stmt = this.db.prepare(`
            SELECT f.*, 
            (SELECT json_group_array(json_object('id', t.id, 'name', t.name)) 
             FROM tags t 
             JOIN file_tags ft ON t.id = ft.tag_id 
             WHERE ft.file_id = f.id) as tags
            FROM files f WHERE id = ?
        `);
        const file = await stmt.bind(id).first();
        if (file && file.tags && typeof file.tags === 'string') {
            try {
                file.tags = JSON.parse(file.tags);
            } catch (e) {
                file.tags = [];
            }
        }
        return file;
    }
}
