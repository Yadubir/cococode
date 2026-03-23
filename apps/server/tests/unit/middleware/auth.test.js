const jwt = require('jsonwebtoken');
const { authenticate, authorize, optionalAuth } = require('../../../src/middleware/auth');
const db = require('../../../src/services/database');
const logger = require('../../../src/utils/logger');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../../src/services/database');
jest.mock('../../../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should return 401 if no auth header provided', async () => {
      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'No token provided',
      }));
    });

    it('should return 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => { throw new Error('Token verification failed'); });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid token',
      }));
    });

    it('should return 401 if user no longer exists in DB', async () => {
      req.headers.authorization = 'Bearer valid-token';
      const decodedUser = { id: 'user-123', email: 'test@example.com' };
      jwt.verify.mockReturnValue(decodedUser);
      db.getUserById.mockResolvedValue(null);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('User no longer exists'),
      }));
    });

    it('should set req.user and call next if token is valid', async () => {
      req.headers.authorization = 'Bearer valid-token';
      const decodedUser = { id: 'user-123', email: 'test@example.com' };
      jwt.verify.mockReturnValue(decodedUser);
      db.getUserById.mockResolvedValue({ id: 'user-123' });

      await authenticate(req, res, next);

      expect(req.user).toEqual(decodedUser);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should call next without setting req.user if no token present', async () => {
      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('should set req.user if valid token present', async () => {
      req.headers.authorization = 'Bearer valid-token';
      const decodedUser = { id: 'user-123' };
      jwt.verify.mockReturnValue(decodedUser);
      db.getUserById.mockResolvedValue({ id: 'user-123' });

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(decodedUser);
      expect(next).toHaveBeenCalled();
    });

    it('should call next even if token is invalid (just without setting req.user)', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => { throw new Error('Invalid'); });

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('should return 401 if user not authenticated', () => {
      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Authentication required',
      }));
    });

    it('should return 403 if user has wrong role', () => {
      req.user = { role: 'user' };
      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Insufficient permissions',
      }));
    });

    it('should call next if user has correct role', () => {
      req.user = { role: 'admin' };
      const middleware = authorize('admin', 'moderator');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
