const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const db = require('../services/database');

const router = express.Router();

/**
 * Generate a random invite code
 */
const generateInviteCode = () => {
    return crypto.randomBytes(6).toString('base64url');
};

/**
 * @route   GET /api/workspaces
 * @desc    Get all workspaces for current user
 * @access  Private
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
    const workspaces = await db.getWorkspacesByUserId(req.user.id);

    res.json({
        success: true,
        data: workspaces,
    });
}));

/**
 * @route   POST /api/workspaces
 * @desc    Create a new workspace
 * @access  Private
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
    const { name, settings = {} } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Workspace name is required',
        });
    }

    const workspace = {
        id: uuidv4(),
        name,
        ownerId: req.user.id,
        settings,
        createdAt: new Date(),
    };

    await db.createWorkspace(workspace);

    res.status(201).json({
        success: true,
        data: workspace,
    });
}));

/**
 * @route   GET /api/workspaces/:id
 * @desc    Get workspace by ID
 * @access  Private
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const workspace = await db.getWorkspaceById(req.params.id);

    if (!workspace) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Workspace not found',
        });
    }

    res.json({
        success: true,
        data: workspace,
    });
}));

/**
 * @route   GET /api/workspaces/:id/members
 * @desc    Get workspace members
 * @access  Private
 */
router.get('/:id/members', authenticate, asyncHandler(async (req, res) => {
    const workspace = await db.getWorkspaceById(req.params.id);

    if (!workspace) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Workspace not found',
        });
    }

    const members = await db.getWorkspaceMembers(req.params.id);

    res.json({
        success: true,
        data: members,
    });
}));

// ========================
// INVITE ROUTES
// ========================

/**
 * @route   POST /api/workspaces/:id/invites
 * @desc    Create an invite link for a workspace
 * @access  Private (owner only)
 */
router.post('/:id/invites', authenticate, asyncHandler(async (req, res) => {
    const { expiresIn, maxUses } = req.body;
    const workspaceId = req.params.id;

    const workspace = await db.getWorkspaceById(workspaceId);

    if (!workspace) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Workspace not found',
        });
    }

    // Check if user is owner
    if (workspace.ownerId !== req.user.id) {
        return res.status(403).json({
            success: false,
            error: 'ForbiddenError',
            message: 'Only workspace owner can create invites',
        });
    }

    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn) {
        expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    const invite = await db.createInvite({
        workspaceId,
        inviteCode: generateInviteCode(),
        createdBy: req.user.id,
        expiresAt,
        maxUses: maxUses || 0,
    });

    // Generate full invite URL
    const inviteUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/join/${invite.inviteCode}`;

    res.status(201).json({
        success: true,
        data: {
            ...invite,
            inviteUrl,
        },
    });
}));

/**
 * @route   GET /api/workspaces/:id/invites
 * @desc    Get all invites for a workspace
 * @access  Private (owner only)
 */
router.get('/:id/invites', authenticate, asyncHandler(async (req, res) => {
    const workspaceId = req.params.id;

    const workspace = await db.getWorkspaceById(workspaceId);

    if (!workspace) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Workspace not found',
        });
    }

    if (workspace.ownerId !== req.user.id) {
        return res.status(403).json({
            success: false,
            error: 'ForbiddenError',
            message: 'Only workspace owner can view invites',
        });
    }

    const invites = await db.getInvitesByWorkspace(workspaceId);

    res.json({
        success: true,
        data: invites.map(invite => ({
            ...invite,
            inviteUrl: `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/join/${invite.inviteCode}`,
        })),
    });
}));

/**
 * @route   DELETE /api/workspaces/:id/invites/:inviteId
 * @desc    Delete an invite
 * @access  Private (owner only)
 */
router.delete('/:id/invites/:inviteId', authenticate, asyncHandler(async (req, res) => {
    const workspace = await db.getWorkspaceById(req.params.id);

    if (!workspace) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Workspace not found',
        });
    }

    if (workspace.ownerId !== req.user.id) {
        return res.status(403).json({
            success: false,
            error: 'ForbiddenError',
            message: 'Only workspace owner can delete invites',
        });
    }

    await db.deleteInvite(req.params.inviteId);

    res.json({
        success: true,
        message: 'Invite deleted',
    });
}));

/**
 * @route   GET /api/invites/:code
 * @desc    Get invite details by code (for join page)
 * @access  Public
 */
router.get('/invites/:code', asyncHandler(async (req, res) => {
    const invite = await db.getInviteByCode(req.params.code);

    if (!invite) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Invite not found or has expired',
        });
    }

    // Check if expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(410).json({
            success: false,
            error: 'ExpiredError',
            message: 'This invite has expired',
        });
    }

    // Check max uses
    if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
        return res.status(410).json({
            success: false,
            error: 'ExpiredError',
            message: 'This invite has reached its maximum uses',
        });
    }

    const workspace = await db.getWorkspaceById(invite.workspaceId);

    res.json({
        success: true,
        data: {
            inviteCode: invite.inviteCode,
            workspace: {
                id: workspace.id,
                name: workspace.name,
            },
        },
    });
}));

/**
 * @route   POST /api/invites/:code/join
 * @desc    Join a workspace via invite code
 * @access  Private
 */
router.post('/invites/:code/join', authenticate, asyncHandler(async (req, res) => {
    const invite = await db.getInviteByCode(req.params.code);

    if (!invite) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Invite not found',
        });
    }

    // Check if expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(410).json({
            success: false,
            error: 'ExpiredError',
            message: 'This invite has expired',
        });
    }

    // Check max uses
    if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
        return res.status(410).json({
            success: false,
            error: 'ExpiredError',
            message: 'This invite has reached its maximum uses',
        });
    }

    // Check if already a member
    const isMember = await db.isWorkspaceMember(invite.workspaceId, req.user.id);
    if (isMember) {
        const workspace = await db.getWorkspaceById(invite.workspaceId);
        return res.json({
            success: true,
            message: 'You are already a member of this workspace',
            data: { workspace },
        });
    }

    // Add user to workspace
    await db.addWorkspaceMember(invite.workspaceId, req.user.id);

    // Increment use count
    await db.incrementInviteUseCount(invite.id);

    const workspace = await db.getWorkspaceById(invite.workspaceId);

    res.json({
        success: true,
        message: 'Successfully joined workspace',
        data: { workspace },
    });
}));

module.exports = router;
