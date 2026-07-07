import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, User } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'foodsave_secret_key_12345';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供授權 Token' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token 無效或已過期' });
    }

    const payload = decoded as { userId: string };
    const user = db.getUserById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: '找不到該使用者' });
    }

    req.user = user;
    next();
  });
};
