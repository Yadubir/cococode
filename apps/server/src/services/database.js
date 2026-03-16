const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    logger.error('Unexpected database error:', err);
});

/**
 * Execute a query
 */
const query = async (text, params) => {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 100) {
        logger.warn(`Slow query (${duration}ms):`, { text, duration });
    }

    return result;
};

// ===================
// USER OPERATIONS
// ===================

const createUser = async (user) => {
    const result = await query(
        `INSERT INTO users (id, email, password_hash, name, role, avatar, settings, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
        [user.id, user.email, user.passwordHash, user.name, user.role, user.avatar, JSON.stringify(user.settings), user.createdAt, user.updatedAt]
    );
    return mapUser(result.rows[0]);
};

const getUserById = async (id) => {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
};

const getUserByEmail = async (email) => {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
};

const updateUser = async (id, updates) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const columnMap = {
        name: 'name',
        avatar: 'avatar',
        settings: 'settings',
        lastLoginAt: 'last_login_at',
        updatedAt: 'updated_at',
    };

    for (const [key, value] of Object.entries(updates)) {
        if (columnMap[key]) {
            fields.push(`${columnMap[key]} = $${paramIndex}`);
            values.push(key === 'settings' ? JSON.stringify(value) : value);
            paramIndex++;
        }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await query(
        `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
        values
    );

    return result.rows[0] ? mapUser(result.rows[0]) : null;
};

// ===================
// WORKSPACE OPERATIONS
// ===================

const createWorkspace = async (workspace) => {
    const result = await query(
        `INSERT INTO workspaces (id, name, owner_id, settings, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
        [workspace.id, workspace.name, workspace.ownerId, JSON.stringify(workspace.settings), workspace.createdAt]
    );
    return mapWorkspace(result.rows[0]);
};

const getWorkspaceById = async (id) => {
    const result = await query('SELECT * FROM workspaces WHERE id = $1', [id]);
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
};

const getWorkspacesByUserId = async (userId) => {
    try {
        const result = await query(
            `SELECT w.* FROM workspaces w
         LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
         WHERE w.owner_id = $1 OR wm.user_id = $1
         GROUP BY w.id`, // Add GROUP BY to avoid duplicates if any
            [userId]
        );
        return result.rows.map(mapWorkspace);
    } catch (error) {
        logger.error('Error fetching workspaces:', error);
        throw error;
    }
};

// ===================
// INVITE OPERATIONS
// ===================

const createInvite = async (invite) => {
    const result = await query(
        `INSERT INTO workspace_invites (workspace_id, invite_code, created_by, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
        [invite.workspaceId, invite.inviteCode, invite.createdBy, invite.expiresAt, invite.maxUses || 0]
    );
    return mapInvite(result.rows[0]);
};

const getInviteByCode = async (code) => {
    const result = await query(
        'SELECT * FROM workspace_invites WHERE invite_code = $1',
        [code]
    );
    return result.rows[0] ? mapInvite(result.rows[0]) : null;
};

const getInvitesByWorkspace = async (workspaceId) => {
    const result = await query(
        'SELECT * FROM workspace_invites WHERE workspace_id = $1 ORDER BY created_at DESC',
        [workspaceId]
    );
    return result.rows.map(mapInvite);
};

const incrementInviteUseCount = async (id) => {
    await query(
        'UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = $1',
        [id]
    );
};

const deleteInvite = async (id) => {
    await query('DELETE FROM workspace_invites WHERE id = $1', [id]);
};

const addWorkspaceMember = async (workspaceId, userId, role = 'member') => {
    const result = await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO NOTHING
     RETURNING *`,
        [workspaceId, userId, role]
    );
    return result.rows[0] || null;
};

const isWorkspaceMember = async (workspaceId, userId) => {
    const result = await query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2
     UNION
     SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2`,
        [workspaceId, userId]
    );
    return result.rows.length > 0;
};

const getWorkspaceMembers = async (workspaceId) => {
    const result = await query(
        `SELECT u.id, u.email, u.name, u.avatar, wm.role, wm.joined_at
     FROM workspace_members wm
     JOIN users u ON wm.user_id = u.id
     WHERE wm.workspace_id = $1
     UNION
     SELECT u.id, u.email, u.name, u.avatar, 'owner' as role, w.created_at as joined_at
     FROM workspaces w
     JOIN users u ON w.owner_id = u.id
     WHERE w.id = $1
     ORDER BY joined_at ASC`,
        [workspaceId]
    );
    return result.rows;
};

// ===================
// MESSAGE OPERATIONS
// ===================

const createMessage = async (message) => {
    const result = await query(
        `INSERT INTO workspace_messages (workspace_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
        [message.workspaceId, message.userId, message.content]
    );
    // Fetch with user details
    const msgWithUser = await query(
        `SELECT m.*, u.name as user_name, u.avatar as user_avatar 
         FROM workspace_messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.id = $1`,
        [result.rows[0].id]
    );
    return mapMessage(msgWithUser.rows[0]);
};

const getMessagesByWorkspace = async (workspaceId, limit = 50, beforeId = null) => {
    let queryStr = `
        SELECT m.*, u.name as user_name, u.avatar as user_avatar 
        FROM workspace_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.workspace_id = $1
    `;
    const params = [workspaceId];
    
    if (beforeId) {
        queryStr += ` AND m.id < $2`;
        params.push(beforeId);
    }
    
    queryStr += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await query(queryStr, params);
    // Reverse to get chronological order
    return result.rows.reverse().map(mapMessage);
};

// ===================
// HELPER FUNCTIONS
// ===================

const mapUser = (row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    settings: row.settings || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
});

const mapWorkspace = (row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    settings: row.settings || {},
    createdAt: row.created_at,
});

const mapInvite = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    createdAt: row.created_at,
});

const mapMessage = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    content: row.content,
    createdAt: row.created_at,
});

// ===================
// DATABASE INITIALIZATION
// ===================

const initDatabase = async () => {
    try {
        await query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        avatar VARCHAR(500),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_id UUID REFERENCES users(id),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        path VARCHAR(1000) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'file',
        content TEXT,
        size INTEGER DEFAULT 0,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspace_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        invite_code VARCHAR(50) UNIQUE NOT NULL,
        created_by UUID REFERENCES users(id),
        expires_at TIMESTAMP,
        max_uses INTEGER DEFAULT 0,
        use_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspace_messages (
        id SERIAL PRIMARY KEY,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
      CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_invites_code ON workspace_invites(invite_code);
      CREATE INDEX IF NOT EXISTS idx_messages_workspace ON workspace_messages(workspace_id, created_at DESC);
    `);

        logger.info('Database tables initialized');
    } catch (error) {
        logger.error('Failed to initialize database:', error);
        throw error;
    }
};

module.exports = {
    query,
    pool,
    initDatabase,
    createUser,
    getUserById,
    getUserByEmail,
    updateUser,
    createWorkspace,
    getWorkspaceById,
    getWorkspacesByUserId,
    createInvite,
    getInviteByCode,
    getInvitesByWorkspace,
    incrementInviteUseCount,
    deleteInvite,
    addWorkspaceMember,
    isWorkspaceMember,
    getWorkspaceMembers,
    createMessage,
    getMessagesByWorkspace,
};
