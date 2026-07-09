import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, User, Store } from '../db';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth';

const router = Router();

// Map to store temporary reset tokens: token -> { email, expiresAt }
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

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
    avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`,
    phone: phone || ''
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
      avatar: newUser.avatar,
      phone: newUser.phone || ''
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
      avatar: user.avatar,
      phone: user.phone || ''
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
      avatar: user.avatar,
      phone: user.phone || ''
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

// POST /api/auth/update-profile - 編輯個人資料與店舖資料
router.post('/update-profile', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { username, email, phone, password, avatar, storeName, logo, storePhone, address, description } = req.body;

  // 1. 更新使用者基本資料
  const updates: Partial<User> = {};
  if (username) updates.username = username;
  if (phone !== undefined) updates.phone = phone;
  if (avatar) updates.avatar = avatar;

  if (email && email !== user.email) {
    const existing = db.getUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return res.status(400).json({ error: '該信箱已被其他帳戶使用' });
    }
    updates.email = email;
  }

  if (password) {
    updates.passwordHash = bcrypt.hashSync(password, 10);
  }

  db.updateUser(user.id, updates);

  // 2. 如果是商家，更新店舖資料
  let updatedStore: Store | undefined = undefined;
  if (user.role === 'store') {
    const store = db.getStoreByUserId(user.id);
    if (store) {
      const storeUpdates: Partial<Store> = {};
      if (storeName) storeUpdates.name = storeName;
      if (logo) storeUpdates.logo = logo;
      if (storePhone) storeUpdates.phone = storePhone;
      if (address) storeUpdates.address = address;
      if (description) storeUpdates.description = description;

      db.updateStore(store.id, storeUpdates);
      updatedStore = db.getStoreById(store.id);
    }
  }

  const updatedUser = db.getUserById(user.id)!;

  res.json({
    message: '個人資料更新成功！',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      role: updatedUser.role,
      creditScore: updatedUser.creditScore,
      avatar: updatedUser.avatar,
      phone: updatedUser.phone || ''
    },
    store: updatedStore
  });
});

// POST /api/auth/forgot-password - 忘記密碼請求
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: '請輸入信箱' });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: '找不到該信箱註冊的帳戶' });
  }

  // 產生 6 位數驗證碼，時效 15 分鐘
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000;

  resetTokens.set(token, { email, expiresAt });

  console.log(`[PASSWORD RESET] Email: ${email}, Token/Code: ${token}`);

  res.json({
    message: '驗證碼已生成，請於下方填入驗證碼完成重設密碼！',
    email,
    token, // 直接回傳供 Demo 測試
    debugUrl: `/api/auth/reset-password`
  });
});

// POST /api/auth/reset-password - 驗證重設密碼
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: '請提供驗證碼與新密碼' });
  }

  const record = resetTokens.get(token.trim());
  if (!record) {
    return res.status(400).json({ error: '無效的密碼重設驗證碼' });
  }

  if (Date.now() > record.expiresAt) {
    resetTokens.delete(token.trim());
    return res.status(400).json({ error: '驗證碼已逾期（時效15分鐘）' });
  }

  const user = db.getUserByEmail(record.email);
  if (!user) {
    resetTokens.delete(token.trim());
    return res.status(404).json({ error: '找不到該帳戶' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.updateUser(user.id, { passwordHash });

  resetTokens.delete(token.trim());

  res.json({ message: '密碼重設成功！請使用新密碼登入。' });
});

// POST /api/auth/delete-account - 註銷/永久刪除帳號 (有未完成訂單時阻擋)
router.post('/delete-account', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  db.checkExpirations();

  // 檢查是否有未完成 (reserved) 或待付款 (pending_payment) 的訂單
  const orders = db.getOrders();
  let activeOrdersCount = 0;

  if (user.role === 'store') {
    const store = db.getStoreByUserId(user.id);
    if (store) {
      activeOrdersCount = orders.filter(
        o => o.storeId === store.id && (o.status === 'reserved' || o.status === 'pending_payment')
      ).length;
    }
  } else {
    activeOrdersCount = orders.filter(
      o => o.buyerId === user.id && (o.status === 'reserved' || o.status === 'pending_payment')
    ).length;
  }

  if (activeOrdersCount > 0) {
    return res.status(400).json({
      error: `無法註銷帳戶！您目前還有 ${activeOrdersCount} 筆「未完成」或「待付款」的預訂單。請先核銷取貨或取消所有預訂再試。`
    });
  }

  // 執行級聯刪除
  db.deleteUser(user.id);

  res.json({ message: '您的帳戶及所有隱私資料已成功永久刪除。謝謝您曾與我們一起珍惜剩食！' });
});

export default router;
