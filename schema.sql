-- Users Table
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT DEFAULT 'user', -- 'admin' | 'user'
    status TEXT DEFAULT 'pending', -- 'pending' | 'active' | 'locked'
    storage_limit INTEGER DEFAULT 104857600, -- 100MB
    used_storage INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Files Table
DROP TABLE IF EXISTS files;
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,      -- Original filename
    display_name TEXT NOT NULL,  -- Display name (Title)
    size INTEGER NOT NULL,       -- in bytes
    r2_key TEXT NOT NULL,        -- Key in R2
    mime_type TEXT DEFAULT 'text/html',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Shares Table
DROP TABLE IF EXISTS shares;
CREATE TABLE shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER UNIQUE NOT NULL,
    share_id TEXT UNIQUE NOT NULL, -- UUID
    is_enabled BOOLEAN DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
