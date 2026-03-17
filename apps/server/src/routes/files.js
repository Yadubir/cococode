const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, ensureWorkspaceMember } = require('../middleware/auth');
const db = require('../services/database');

const router = express.Router();

/**
 * @route   GET /api/files/:workspaceId
 * @desc    Get file tree for workspace
 * @access  Private
 */
router.get('/:workspaceId', authenticate, ensureWorkspaceMember, asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;

    const result = await db.query(
        'SELECT id, path, name, type, size, created_at, updated_at FROM files WHERE workspace_id = $1 ORDER BY path',
        [workspaceId]
    );

    res.json({
        success: true,
        data: result.rows.map(row => ({
            id: row.id,
            path: row.path,
            name: row.name,
            type: row.type,
            size: row.size,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        })),
    });
}));

/**
 * @route   GET /api/files/:workspaceId/:fileId
 * @desc    Get file content
 * @access  Private
 */
router.get('/:workspaceId/:fileId', authenticate, ensureWorkspaceMember, asyncHandler(async (req, res) => {
    const { workspaceId, fileId } = req.params;

    const result = await db.query(
        'SELECT * FROM files WHERE id = $1 AND workspace_id = $2',
        [fileId, workspaceId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'File not found',
        });
    }

    const file = result.rows[0];

    res.json({
        success: true,
        data: {
            id: file.id,
            path: file.path,
            name: file.name,
            type: file.type,
            content: file.content,
            size: file.size,
            createdAt: file.created_at,
            updatedAt: file.updated_at,
        },
    });
}));

/**
 * @route   POST /api/files/:workspaceId
 * @desc    Create a new file
 * @access  Private
 */
router.post('/:workspaceId', authenticate, ensureWorkspaceMember, asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const { path, name, type = 'file', content = '' } = req.body;

    if (!path || !name) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Path and name are required',
        });
    }

    const file = {
        id: uuidv4(),
        workspaceId,
        path,
        name,
        type,
        content,
        size: Buffer.byteLength(content, 'utf8'),
        createdBy: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.query(
        `INSERT INTO files (id, workspace_id, path, name, type, content, size, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [file.id, file.workspaceId, file.path, file.name, file.type, file.content, file.size, file.createdBy, file.createdAt, file.updatedAt]
    );

    res.status(201).json({
        success: true,
        data: {
            id: file.id,
            path: file.path,
            name: file.name,
            type: file.type,
            size: file.size,
        },
    });
}));

/**
 * @route   PUT /api/files/:workspaceId/:fileId
 * @desc    Update file content
 * @access  Private
 */
router.put('/:workspaceId/:fileId', authenticate, ensureWorkspaceMember, asyncHandler(async (req, res) => {
    const { workspaceId, fileId } = req.params;
    const { content } = req.body;

    if (content === undefined) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Content is required',
        });
    }

    const size = Buffer.byteLength(content, 'utf8');

    const result = await db.query(
        `UPDATE files SET content = $1, size = $2, updated_at = NOW() 
     WHERE id = $3 AND workspace_id = $4 
     RETURNING id, path, name, size, updated_at`,
        [content, size, fileId, workspaceId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'File not found',
        });
    }

    res.json({
        success: true,
        data: result.rows[0],
    });
}));

/**
 * @route   DELETE /api/files/:workspaceId/:fileId
 * @desc    Delete a file
 * @access  Private
 */
router.delete('/:workspaceId/:fileId', authenticate, ensureWorkspaceMember, asyncHandler(async (req, res) => {
    const { workspaceId, fileId } = req.params;

    const result = await db.query(
        'DELETE FROM files WHERE id = $1 AND workspace_id = $2 RETURNING id',
        [fileId, workspaceId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'File not found',
        });
    }

    res.json({
        success: true,
        message: 'File deleted',
    });
}));

module.exports = router;
