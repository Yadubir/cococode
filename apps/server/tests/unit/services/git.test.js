const fs = require('fs-extra');
const simpleGit = require('simple-git');
const db = require('../../../src/services/database');
const gitService = require('../../../src/services/git');
const logger = require('../../../src/utils/logger');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('simple-git');
jest.mock('../../../src/services/database');
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Git Service', () => {
  let mockGit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGit = {
      checkIsRepo: jest.fn().mockResolvedValue(true),
      init: jest.fn().mockResolvedValue({}),
      addConfig: jest.fn().mockResolvedValue({}),
      status: jest.fn().mockResolvedValue({
        current: 'main',
        files: [],
        not_added: [],
        conflicted: [],
        created: [],
        deleted: [],
        modified: [],
        renamed: [],
        staged: [],
      }),
      add: jest.fn().mockResolvedValue({}),
      reset: jest.fn().mockResolvedValue({}),
      commit: jest.fn().mockResolvedValue({ commit: 'c1', branch: 'main', summary: {} }),
      getRemotes: jest.fn().mockResolvedValue([{ name: 'origin' }]),
      remote: jest.fn().mockResolvedValue({}),
      push: jest.fn().mockResolvedValue({}),
      pull: jest.fn().mockResolvedValue({}),
    };
    simpleGit.mockReturnValue(mockGit);
    db.query.mockResolvedValue({ rows: [] });
  });

  describe('getStatus', () => {
    it('should sync disk and return formatted status', async () => {
      const workspaceId = 'w1';
      const status = await gitService.getStatus(workspaceId);

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(mockGit.status).toHaveBeenCalled();
      expect(status.branch).toBe('main');
      expect(status.changes).toEqual({
        staged: [],
        unstaged: [],
        untracked: []
      });
    });

    it('should map untracked files correctly', async () => {
      mockGit.status.mockResolvedValueOnce({
        current: 'main',
        files: [1],
        not_added: ['file1.txt'],
        conflicted: [],
        created: [],
        deleted: [],
        modified: [],
        renamed: [],
        staged: [],
      });

      const status = await gitService.getStatus('w1');
      expect(status.changes.untracked).toContainEqual({ path: 'file1.txt', status: 'untracked' });
    });
  });

  describe('stageFiles', () => {
    it('should add files and return new status', async () => {
      const filePaths = ['index.js'];
      await gitService.stageFiles('w1', filePaths);

      expect(mockGit.add).toHaveBeenCalledWith(filePaths);
    });
  });

  describe('commit', () => {
    it('should throw if no staged files', async () => {
      mockGit.status.mockResolvedValueOnce({ staged: [] });
      await expect(gitService.commit('w1', 'msg', 'Name', 'Email'))
        .rejects.toThrow('No staged files to commit');
    });

    it('should commit with author info', async () => {
      mockGit.status.mockResolvedValueOnce({ staged: ['file.txt'], current: 'main', files: [1] });
      await gitService.commit('w1', 'feat: init', 'Riti', 'riti@example.com');

      expect(mockGit.commit).toHaveBeenCalledWith('feat: init', null, {
        '--author': '"Riti <riti@example.com>"'
      });
    });
  });

  describe('push', () => {
    it('should configure remote and push', async () => {
       mockGit.status.mockResolvedValueOnce({ current: 'main', files: [] });
       await gitService.push('w1', 'https://github.com/riti/repo', 'my-token');

       expect(mockGit.remote).toHaveBeenCalledWith(['set-url', 'origin', 'https://my-token@github.com/riti/repo']);
       expect(mockGit.push).toHaveBeenCalledWith('origin', 'main', { '--set-upstream': null });
    });
  });
});
