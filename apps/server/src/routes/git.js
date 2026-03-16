const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const gitService = require('../services/git');
const db = require('../services/database');

const router = express.Router();

/**
 * @route GET /api/git/:workspaceId/status
 * @desc Get current git status
 */
router.get('/:workspaceId/status', authenticate, asyncHandler(async (req, res) => {
    const status = await gitService.getStatus(req.params.workspaceId);
    res.json({ success: true, data: status });
}));

/**
 * @route POST /api/git/:workspaceId/stage
 * @desc Stage specific files or all
 */
router.post('/:workspaceId/stage', authenticate, asyncHandler(async (req, res) => {
    const { files, all } = req.body;
    let newStatus;
    if (all) {
        newStatus = await gitService.stageFiles(req.params.workspaceId, ['.']);
    } else if (Array.isArray(files) && files.length > 0) {
        newStatus = await gitService.stageFiles(req.params.workspaceId, files);
    } else {
        return res.status(400).json({ success: false, message: 'Files array or all=true required' });
    }
    res.json({ success: true, data: newStatus });
}));

/**
 * @route POST /api/git/:workspaceId/unstage
 * @desc Unstage specific files or all
 */
router.post('/:workspaceId/unstage', authenticate, asyncHandler(async (req, res) => {
    const { files, all } = req.body;
    let newStatus;
    // For unstaging all, we just pass '.'
    if (all) {
        newStatus = await gitService.unstageFiles(req.params.workspaceId, ['.']);
    } else if (Array.isArray(files) && files.length > 0) {
        newStatus = await gitService.unstageFiles(req.params.workspaceId, files);
    } else {
         return res.status(400).json({ success: false, message: 'Files array or all=true required' });
    }
    res.json({ success: true, data: newStatus });
}));

/**
 * @route POST /api/git/:workspaceId/commit
 * @desc Commit staged files
 */
router.post('/:workspaceId/commit', authenticate, asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message) {
         return res.status(400).json({ success: false, message: 'Commit message required' });
    }
    
    // Grab user details from the JWT
    const authorName = req.user.name || 'CocoCode User';
    const authorEmail = req.user.email || 'user@cococode.app';
    
    const result = await gitService.commit(req.params.workspaceId, message, authorName, authorEmail);
    res.json({ success: true, data: result });
}));

/**
 * @route POST /api/git/:workspaceId/remote
 * @desc Link a remote GitHub repository URL
 */
router.post('/:workspaceId/remote', authenticate, asyncHandler(async (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) {
         return res.status(400).json({ success: false, message: 'Repository URL is required' });
    }

    const workspace = await db.getWorkspaceById(req.params.workspaceId);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });

    const settings = { ...workspace.settings, githubRepoUrl: repoUrl };
    // Not using updateWorkspace since it doesn't exist, we'll write a raw query or add it to db service later.
    // Actually, let's write the query directly for now:
    await db.query(`UPDATE workspaces SET settings = $1 WHERE id = $2`, [JSON.stringify(settings), workspace.id]);

    res.json({ success: true, message: 'Remote linked successfully' });
}));

/**
 * Helper to get GitHub config for push/pull
 */
async function getGithubConfig(req) {
    // 1. Get user Token
    const dbUser = await db.getUserById(req.user.id);
    const githubToken = dbUser?.settings?.githubToken;
    
    // 2. Get workspace Repo URL
    const workspace = await db.getWorkspaceById(req.params.workspaceId);
    const repoUrl = workspace?.settings?.githubRepoUrl;

    if (!githubToken) throw new Error("GitHub account not linked. Please login with GitHub in Dashboard Settings.");
    if (!repoUrl) throw new Error("No remote repository linked to this workspace.");

    return { githubToken, repoUrl };
}

/**
 * @route POST /api/git/:workspaceId/push
 * @desc Push to remote
 */
router.post('/:workspaceId/push', authenticate, asyncHandler(async (req, res) => {
    try {
        const { githubToken, repoUrl } = await getGithubConfig(req);
        await gitService.push(req.params.workspaceId, repoUrl, githubToken);
        res.json({ success: true, message: 'Pushed successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}));

/**
 * @route POST /api/git/:workspaceId/pull
 * @desc Pull from remote
 */
router.post('/:workspaceId/pull', authenticate, asyncHandler(async (req, res) => {
    try {
        const { githubToken, repoUrl } = await getGithubConfig(req);
        const status = await gitService.pull(req.params.workspaceId, repoUrl, githubToken);
        res.json({ success: true, data: status, message: 'Pulled successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}));


module.exports = router;
