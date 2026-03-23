const { notFoundHandler, errorHandler, asyncHandler } = require('../../../src/middleware/errorHandler');
const logger = require('../../../src/utils/logger');

// Mock logger to avoid spamming console during tests
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
}));

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/test-route',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('notFoundHandler', () => {
    it('should return 404 with a helpful message', () => {
      notFoundHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not Found',
        message: 'Route GET /test-route not found',
      });
    });
  });

  describe('errorHandler', () => {
    it('should handle generic errors with 500 status', () => {
      const err = new Error('Test error');
      
      errorHandler(err, req, res, next);

      expect(logger.error).toHaveBeenCalledWith('Unhandled error:', err);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Error',
        message: expect.any(String),
      }));
    });

    it('should use error statusCode if provided', () => {
      const err = new Error('Specific error');
      err.statusCode = 400;
      err.name = 'BadRequest';
      
      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'BadRequest',
        message: expect.any(String),
      }));
    });

    it('should hide details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const err = new Error('Sensitive detail');
      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Something went wrong',
      }));
      expect(res.json).not.toHaveProperty('stack');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('asyncHandler', () => {
    it('should execute the passed function', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const wrapped = asyncHandler(fn);
      
      await wrapped(req, res, next);

      expect(fn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch errors and pass them to next', async () => {
      const err = new Error('Async failure');
      const fn = jest.fn().mockRejectedValue(err);
      const wrapped = asyncHandler(fn);
      
      await wrapped(req, res, next);

      // We need to wait for the promise catch block
      await new Promise(resolve => setImmediate(resolve));

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
