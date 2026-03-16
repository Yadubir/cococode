const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const passport = require('../services/passport');
const db = require('../services/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Generate JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Email, password, and name are required',
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Password must be at least 8 characters',
        });
    }

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
        return res.status(409).json({
            success: false,
            error: 'ConflictError',
            message: 'User with this email already exists',
        });
    }

    // Hash password
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, rounds);

    // Create user
    const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: 'member',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.createUser(user);
    logger.info(`New user registered: ${user.email}`);

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            token,
        },
    });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Email and password are required',
        });
    }

    // Find user
    const user = await db.getUserByEmail(email.toLowerCase());
    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'AuthenticationError',
            message: 'Invalid credentials',
        });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        return res.status(401).json({
            success: false,
            error: 'AuthenticationError',
            message: 'Invalid credentials',
        });
    }

    // Update last login
    await db.updateUser(user.id, { lastLoginAt: new Date() });
    logger.info(`User logged in: ${user.email}`);

    // Generate token
    const token = generateToken(user);

    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar,
            },
            token,
        },
    });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.user.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'User not found',
        });
    }

    res.json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.avatar,
            settings: user.settings,
            createdAt: user.createdAt,
        },
    });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', authenticate, asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.user.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'User not found',
        });
    }

    const token = generateToken(user);

    res.json({
        success: true,
        data: { token },
    });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout (client-side token removal, but we can track sessions)
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
    // In a more complex system, you'd invalidate the token in Redis
    logger.info(`User logged out: ${req.user.email}`);

    res.json({
        success: true,
        message: 'Logged out successfully',
    });
}));

/**
 * @route   GET /api/auth/github
 * @desc    Start GitHub OAuth flow
 * @access  Public (with state variable containing JWT)
 */
router.get('/github', (req, res, next) => {
    // The frontend should pass the standard JWT in the `state` query param
    const { state } = req.query;
    passport.authenticate('github', { 
        scope: ['repo', 'user:email'],
        state: state
    })(req, res, next);
});

/**
 * @route   GET /api/auth/github/callback
 * @desc    GitHub OAuth callback
 * @access  Public
 */
router.get('/github/callback', 
    passport.authenticate('github', { failureRedirect: 'http://localhost:5173/dashboard?error=github_auth_failed', session: false }),
    asyncHandler(async (req, res) => {
        // The GitHub token and profile are in req.user due to our custom strategy
        const { accessToken } = req.user;
        
        // We recover the original user's JWT from the state param that GitHub echoed back
        const token = req.query.state;
        if (!token) return res.redirect('http://localhost:5173/dashboard?error=missing_state_token');
        
        try {
            // Decode the token to get our User ID
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.getUserById(decoded.id);
            
            if (!user) return res.redirect('http://localhost:5173/dashboard?error=user_not_found');
            
            // Save the GitHub Token in user settings
            const settings = { ...user.settings, githubToken: accessToken };
            await db.updateUser(user.id, { settings });
            
            // Redirect back to frontend with success
            res.redirect('http://localhost:5173/dashboard?github_linked=true');
        } catch (error) {
            console.error(error);
            res.redirect('http://localhost:5173/dashboard?error=jwt_verification_failed');
        }
    })
);

module.exports = router;
