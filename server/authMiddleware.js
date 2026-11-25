import jwt from 'jsonwebtoken';

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is not set');
    }
    return secret;
};

export function signToken(user) {
    return jwt.sign(
        {
            sub: user._id.toString(),
            email: user.email,
        },
        getJwtSecret(),
        { expiresIn: '30d' }
    );
}

export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = {
            id: decoded.sub,
            email: decoded.email,
        };
        return next();
    } catch (_err) {
        return res.status(401).json({ error: 'Invalid or expired session token' });
    }
}
