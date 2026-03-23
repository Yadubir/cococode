const { Pool } = require('pg');
const db = require('../../../src/services/database');
const logger = require('../../../src/utils/logger');

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Database Service', () => {
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = new Pool();
  });

  describe('query', () => {
    it('should execute a query and return the result', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }] };
      pool.query.mockResolvedValueOnce(mockResult);

      const result = await db.query('SELECT * FROM users', []);

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(result).toEqual(mockResult);
    });

    it('should log a warning for slow queries', async () => {
      pool.query.mockImplementationOnce(() => {
        return new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 150));
      });

      await db.query('SELECT * FROM large_table', []);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Slow query'), expect.any(Object));
    });
  });

  describe('User Operations', () => {
    it('should get user by id', async () => {
      const mockUser = { id: 'u1', email: 'test@example.com', name: 'Test User' };
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await db.getUserById('u1');

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['u1']);
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should return null if user not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await db.getUserById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('Workspace Operations', () => {
    it('should check if user is workspace member', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

      const isMember = await db.isWorkspaceMember('w1', 'u1');

      expect(isMember).toBe(true);
      expect(pool.query).toHaveBeenCalled();
    });

    it('should return false if user is not a member', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const isMember = await db.isWorkspaceMember('w1', 'u1');

      expect(isMember).toBe(false);
    });
  });

  describe('mapping functions', () => {
    // We already tested mapping indirectly via getUserById, but let's be explicit if needed
    it('should handle missing settings in mapUser', async () => {
       pool.query.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 't@t.com', name: 'T', settings: null }] });
       const user = await db.getUserById('u1');
       expect(user.settings).toEqual({});
    });
  });
});
