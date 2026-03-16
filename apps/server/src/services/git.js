const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const db = require('./database');
const logger = require('../utils/logger');
const mime = require('mime-types');

const GIT_DIR = path.join(process.env.TMPDIR || '/tmp', 'cococode-git');

/**
 * Ensures the physical git directory exists for a workspace
 * and flushes all DB files to disk.
 */
async function syncDbToDisk(workspaceId) {
    const workspacePath = path.join(GIT_DIR, `workspace-${workspaceId}`);
    
    // Ensure dir exists
    await fs.ensureDir(workspacePath);
    
    // Check if it's already a git repo
    const git = simpleGit(workspacePath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
        await git.init();
        await git.addConfig('user.name', 'CocoCode User');
        await git.addConfig('user.email', 'user@cococode.app');
        logger.info(`Initialized empty Git repository for workspace ${workspaceId}`);
    }

    // Read all files for this workspace from the DB
    const result = await db.query(
        'SELECT path, content FROM files WHERE workspace_id = $1',
        [workspaceId]
    );

    // Track paths written to delete orphaned files on disk
    const dbPaths = new Set();

    for (const file of result.rows) {
        // Strip leading slash if present
        const relativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        dbPaths.add(relativePath);
        
        const fullPath = path.join(workspacePath, relativePath);
        
        // Ensure parent directories exist
        await fs.ensureDir(path.dirname(fullPath));
        
        // Write content
        await fs.writeFile(fullPath, file.content || '', 'utf8');
    }

    // Clean up physical files that have been deleted in DB
    try {
        const physicalFiles = await getAllFilesRecursive(workspacePath);
        for (const pFile of physicalFiles) {
             const relative = path.relative(workspacePath, pFile);
             if (relative.startsWith('.git')) continue;
             if (!dbPaths.has(relative)) {
                 await fs.remove(pFile);
             }
        }
    } catch (e) {
        logger.error(`Failed to cleanup orphaned disk files: ${e.message}`);
    }

    return git;
}

/**
 * Helper: get all physical files recursively
 */
async function getAllFilesRecursive(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getAllFilesRecursive(res) : res;
    }));
    return Array.prototype.concat(...files);
}

/**
 * Get current git status for a workspace
 */
async function getStatus(workspaceId) {
    const git = await syncDbToDisk(workspaceId);
    
    try {
        const status = await git.status();
        
        // Format for frontend
        const changes = {
            staged: [],
            unstaged: [],
            untracked: []
        };

        // Parse modified/deleted files (not staged)
        status.not_added.forEach(file => changes.untracked.push({ path: file, status: 'untracked' }));
        status.conflicted.forEach(file => changes.unstaged.push({ path: file, status: 'conflicted' }));
        status.created.forEach(file => changes.unstaged.push({ path: file, status: 'added' }));
        status.deleted.forEach(file => changes.unstaged.push({ path: file, status: 'deleted' }));
        status.modified.forEach(file => changes.unstaged.push({ path: file, status: 'modified' }));
        status.renamed.forEach(file => changes.unstaged.push({ path: file.to, status: 'renamed' }));

        // Parse staged files
        status.staged.forEach(file => changes.staged.push({ path: file, status: 'modified' })); // Simplegit doesn't neatly break down staged types sometimes
        
        // As a fallback to accurately assign staged types, we can let simple-git tell us exactly what index says
        // but for now, we use the `staged` array directly and mark them.

        return {
            branch: status.current,
            changes,
            total: status.files.length
        };
    } catch (error) {
        logger.error(`Git Status Error: ${error.message}`);
        throw error;
    }
}

/**
 * Stage file(s)
 */
async function stageFiles(workspaceId, filePaths) {
    const git = await syncDbToDisk(workspaceId);
    await git.add(filePaths);
    return getStatus(workspaceId);
}

/**
 * Unstage file(s)
 */
async function unstageFiles(workspaceId, filePaths) {
    const git = await syncDbToDisk(workspaceId);
    await git.reset(['--', ...filePaths]);
    return getStatus(workspaceId);
}

/**
 * Commit changes
 */
async function commit(workspaceId, message, authorName, authorEmail) {
    const git = await syncDbToDisk(workspaceId);
    
    // Check if there are staged files before committing
    const status = await git.status();
    if (status.staged.length === 0) {
        throw new Error("No staged files to commit");
    }

    const options = {
        '--author': `"${authorName} <${authorEmail}>"`
    };
    
    const result = await git.commit(message, null, options);
    return {
        commitId: result.commit,
        branch: result.branch,
        summary: result.summary,
        status: await getStatus(workspaceId)
    };
}

/**
 * Configure authenticated remote
 */
async function configureRemote(git, repoUrl, githubToken) {
    if (!repoUrl || !githubToken) {
        throw new Error('Repository URL and GitHub token are required');
    }

    // Insert token into repo URL: https://github.com/... -> https://<token>@github.com/...
    let authUrl = repoUrl;
    if (repoUrl.startsWith('https://')) {
        authUrl = `https://${githubToken}@${repoUrl.slice(8)}`;
    }
    
    // Check if origin exists
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some(r => r.name === 'origin');
    
    if (hasOrigin) {
        await git.remote(['set-url', 'origin', authUrl]);
    } else {
        await git.addRemote('origin', authUrl);
    }
}

/**
 * Sync Disk back to DB (after a pull)
 */
async function syncDiskToDb(workspaceId) {
    const workspacePath = path.join(GIT_DIR, `workspace-${workspaceId}`);
    
    // Clear existing DB files for this workspace
    await db.query('DELETE FROM files WHERE workspace_id = $1', [workspaceId]);

    // Read all physical files except .git
    const physicalFiles = await getAllFilesRecursive(workspacePath);
    
    for (const pFile of physicalFiles) {
        const relativePath = path.relative(workspacePath, pFile);
        if (relativePath.startsWith('.git')) continue;
        
        const content = await fs.readFile(pFile, 'utf8');
        const size = Buffer.byteLength(content, 'utf8');
        const name = path.basename(pFile);
        
        await db.query(
            `INSERT INTO files (id, workspace_id, path, name, type, content, size)
             VALUES (gen_random_uuid(), $1, $2, $3, 'file', $4, $5)`,
            [workspaceId, relativePath, name, content, size]
        );
    }
}

/**
 * Push to remote
 */
async function push(workspaceId, repoUrl, githubToken) {
    const git = await syncDbToDisk(workspaceId);
    await configureRemote(git, repoUrl, githubToken);
    
    try {
        const status = await git.status();
        await git.push('origin', status.current || 'main', { '--set-upstream': null });
        return { success: true };
    } catch (error) {
        logger.error(`Git Push Error: ${error.message}`);
        throw error;
    }
}

/**
 * Pull from remote
 */
async function pull(workspaceId, repoUrl, githubToken) {
    const git = await syncDbToDisk(workspaceId);
    await configureRemote(git, repoUrl, githubToken);
    
    try {
        const status = await git.status();
        await git.pull('origin', status.current || 'main', { '--rebase': 'true' });
        
        // After pull, the physical disk has new files. We MUST sync these back to Postgres.
        await syncDiskToDb(workspaceId);
        
        return await getStatus(workspaceId);
    } catch (error) {
        logger.error(`Git Pull Error: ${error.message}`);
        throw error;
    }
}

module.exports = {
    syncDbToDisk,
    getStatus,
    stageFiles,
    unstageFiles,
    commit,
    push,
    pull
};
