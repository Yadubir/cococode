const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @route   POST /api/ai/chat
 * @desc    Chat with AI assistant
 * @access  Private
 */
router.post('/chat', authenticate, asyncHandler(async (req, res) => {
    const { message, context } = req.body;

    if (!message) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Message is required',
        });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
            success: false,
            error: 'ConfigurationError',
            message: 'AI service is not configured',
        });
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Build the prompt with context
        const systemPrompt = `You are a helpful AI coding assistant integrated into CocoCode, a collaborative online code editor. 
You help developers with:
- Explaining code concepts
- Debugging issues
- Writing code snippets
- Suggesting best practices
- Answering programming questions

Be concise but thorough. Give text format, no markdown
Use the user's context when relevant.`;

        const prompt = context
            ? `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${message}`
            : `${systemPrompt}\n\nUser: ${message}`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        logger.info(`AI chat request from user ${req.user.id}`);

        res.json({
            success: true,
            data: {
                response: text,
            },
        });
    } catch (error) {
        logger.error('AI API error:', error);
        res.status(500).json({
            success: false,
            error: 'AIError',
            message: 'Failed to get AI response',
        });
    }
}));

/**
 * @route   POST /api/ai/explain
 * @desc    Explain code
 * @access  Private
 */
router.post('/explain', authenticate, asyncHandler(async (req, res) => {
    const { code, language } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Code is required',
        });
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Explain the following ${language || 'code'} in a clear and concise way. 
Break down what each part does:

\`\`\`${language || ''}
${code}
\`\`\``;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        res.json({
            success: true,
            data: {
                explanation: text,
            },
        });
    } catch (error) {
        logger.error('AI explain error:', error);
        res.status(500).json({
            success: false,
            error: 'AIError',
            message: 'Failed to explain code',
        });
    }
}));

/**
 * @route   POST /api/ai/suggest
 * @desc    Get code suggestions/improvements
 * @access  Private
 */
router.post('/suggest', authenticate, asyncHandler(async (req, res) => {
    const { code, language, request } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Code is required',
        });
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Review the following ${language || 'code'} and suggest improvements.
${request ? `Specific request: ${request}` : 'Focus on best practices, performance, and readability.'}

\`\`\`${language || ''}
${code}
\`\`\`

Provide:
1. Issues found (if any)
2. Suggested improvements
3. Improved code (if applicable)`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        res.json({
            success: true,
            data: {
                suggestions: text,
            },
        });
    } catch (error) {
        logger.error('AI suggest error:', error);
        res.status(500).json({
            success: false,
            error: 'AIError',
            message: 'Failed to get suggestions',
        });
    }
}));

module.exports = router;
