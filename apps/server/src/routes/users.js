const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../services/database');

const router = express.Router();

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.params.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'User not found',
        });
    }

    // Only return public info for other users
    const isOwnProfile = req.user.id === user.id;

    res.json({
        success: true,
        data: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            ...(isOwnProfile && {
                email: user.email,
                role: user.role,
                settings: user.settings,
            }),
        },
    });
}));

/**
 * @route   PATCH /api/users/:id
 * @desc    Update user profile
 * @access  Private (own profile or admin)
 */
router.patch('/:id', authenticate, asyncHandler(async (req, res) => {
    const { name, avatar, settings } = req.body;

    // Check permissions
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Cannot update other users',
        });
    }

    const updates = {};
    if (name) updates.name = name;
    if (avatar) updates.avatar = avatar;
    if (settings) updates.settings = settings;

    const user = await db.updateUser(req.params.id, updates);

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
            avatar: user.avatar,
            role: user.role,
            settings: user.settings,
        },
    });
}));

module.exports = router;
