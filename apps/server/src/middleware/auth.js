const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * JWT Authentication middleware
 */
const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'No token provided',
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;
        next();
    } catch (error) {
        logger.warn('Authentication failed:', error.message);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'TokenExpired',
                message: 'Token has expired',
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid token',
        });
    }
};

/**
 * Optional authentication - attaches user if token present
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        }

        next();
    } catch (error) {
        // Token invalid, but continue without user
        next();
    }
};

/**
 * Role-based access control
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Insufficient permissions',
            });
        }

        next();
    };
};

/**
 * Workspace access control - ensures user is a member or owner
 */
const ensureWorkspaceMember = (req, res, next) => {
    const db = require('../services/database');
    const { asyncHandler } = require('./errorHandler');

    return asyncHandler(async (req, res, next) => {
        const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId || req.params.id;

        if (!workspaceId) {
            logger.warn(`Missing workspaceId in membership check for user ${req.user.id}`);
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Workspace ID is required',
            });
        }

        try {
            const isMember = await db.isWorkspaceMember(workspaceId, req.user.id);
            
            if (!isMember) {
                logger.warn(`Access denied: User ${req.user.email} is not a member of workspace ${workspaceId}`);
                return res.status(403).json({
                    success: false,
                    error: 'ForbiddenError',
                    message: 'Access denied: You are not a member of this workspace or it has been deleted',
                });
            }

            logger.info(`Access granted: User ${req.user.email} authorized for workspace ${workspaceId}`);
            next();
        } catch (error) {
            logger.error(`Error in ensureWorkspaceMember:`, error);
            next(error);
        }
    })(req, res, next);
};

module.exports = {
    authenticate,
    optionalAuth,
    authorize,
    ensureWorkspaceMember,
};
