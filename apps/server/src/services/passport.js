const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const db = require('./database');
const logger = require('../utils/logger');

// Setup GitHub Strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || 'dummy_id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'dummy_secret',
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/auth/github/callback',
    passReqToCallback: true
},
async function(req, accessToken, refreshToken, profile, done) {
    try {
        // Find existing user or return error (we only want to link to existing cococode users)
        // Since we passReqToCallback, we can access req.user from our JWT middleware if it was applied.
        // But GitHub OAuth typically uses sessions. We'll handle this by passing a state param with the JWT, 
        // or asking the user to log in first.
        
        // For simplicity, we just return the access token and profile to the callback route
        return done(null, { profile, accessToken });
    } catch (err) {
        logger.error(`GitHub Auth Error: ${err.message}`);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

module.exports = passport;
