import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, User, Store } from '../db';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { email, username, password, role, storeName, address, latitude, longitude, phone, description } = req.body;

  if (!email || !username || !password || !role) {
    return res.status(400).json({ error: '信箱、使用者名稱、密碼與角色為必填欄位' });
  }

  // Check duplicate
  if (db.getUserByEmail(email)) {
    return res.status(400).json({ error: '該信箱已被註冊' });
  }

  const userId = Math.random().toString(36).substring(2, 9);
  const passwordHash = bcrypt.hashSync(password, 10);

  const newUser: User = {
    id: userId,
    email,
    username,
    passwordHash,
    role: role === 'store' ? 'store' : 'user',
    creditScore: 100,
    avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`
  };

  db.createUser(newUser);

  let newStore: Store | undefined = undefined;
  if (role === 'store') {
    const storeId = 'store_' + Math.random().toString(36).substring(2, 9);
    newStore = {
      id: storeId,
      userId,
      name: storeName || `${username} 的剩食小舖`,
      logo: `https://images.unsplash.com/photo-1542838132-92c53300491e?w=150&auto=format&fit=crop&q=60`,
      address: address || '台北市信義區信義路五段7號',
      latitude: latitude !== undefined ? Number(latitude) : 25.033964,
      longitude: longitude !== undefined ? Number(longitude) : 121.564468,
      phone: phone || '02-12345678',
      description: description || '我們致力於分享美味、即時的剩餘食物，減少浪費。',
      rating: 5.0,
      reviewCount: 0
    };
    db.createStore(newStore);
  }

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({
    message: '註冊成功',
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      creditScore: newUser.creditScore,
      avatar: newUser.avatar
    },
    store: newStore
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '請輸入信箱與密碼' });
  }

  const user = db.getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: '信箱或密碼錯誤' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const store = db.getStoreByUserId(user.id);

  res.json({
    message: '登入成功',
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      creditScore: user.creditScore,
      avatar: user.avatar
    },
    store
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const store = db.getStoreByUserId(user.id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      creditScore: user.creditScore,
      avatar: user.avatar
    },
    store
  });
});

// POST /api/auth/toggle-role
router.post('/toggle-role', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const newRole = user.role === 'user' ? 'store' : 'user';

  db.updateUser(user.id, { role: newRole });

  let store = db.getStoreByUserId(user.id);
  if (newRole === 'store' && !store) {
    // Auto create default store
    const storeId = 'store_' + Math.random().toString(36).substring(2, 9);
    store = {
      id: storeId,
      userId: user.id,
      name: `${user.username} 的剩食店舖`,
      logo: `https://images.unsplash.com/photo-1542838132-92c53300491e?w=150&auto=format&fit=crop&q=60`,
      address: '台北市大安區信義路三段',
      latitude: 25.0334,
      longitude: 121.5435,
      phone: '0912-345678',
      description: '這是自動創建的商家店舖，提供美味的愛心即期剩食。',
      rating: 5.0,
      reviewCount: 0
    };
    db.createStore(store);
  }

  res.json({
    message: `成功切換為 ${newRole === 'store' ? '商家' : '一般用戶'}`,
    role: newRole,
    store
  });
});

export default router;
