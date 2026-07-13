import { Router, Response } from 'express';
import { db, Order } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/notifications - 獲取當前使用者的通知
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const list = db.getNotificationsByUserId(user.id);
  res.json(list);
});

// POST /api/notifications/read - 將通知標記為已讀
router.post('/read', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  db.markNotificationsAsRead(user.id);
  res.json({ message: '通知已全部標記為已讀' });
});

// GET /api/stats - 獲取綠色環保統計數據 (減碳與節省食物量)
router.get('/stats', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  
  db.checkExpirations();

  const allOrders = db.getOrders();
  let claimedOrders: Order[] = [];

  if (user.role === 'store') {
    const store = db.getStoreByUserId(user.id);
    if (store) {
      claimedOrders = allOrders.filter(o => o.storeId === store.id && o.status === 'claimed');
    }
  } else {
    claimedOrders = allOrders.filter(o => o.buyerId === user.id && o.status === 'claimed');
  }

  // Factor constants for ecological impact
  // Average weight per food item = 0.5 kg
  // CO2 offset per kg of food waste saved = 2.5 kg CO2
  // Water saved per kg of food = 150 liters
  const totalItems = claimedOrders.reduce((acc, curr) => acc + curr.quantity, 0);
  const foodSavedKg = Number((totalItems * 0.5).toFixed(1));
  const co2OffsetKg = Number((foodSavedKg * 2.5).toFixed(1));
  const waterSavedLiters = totalItems * 75; // 75 liters per item (half of 150)

  res.json({
    claimedCount: claimedOrders.length,
    totalItems,
    foodSavedKg,
    co2OffsetKg,
    waterSavedLiters,
    tokens: user.tokens
  });
});

export default router;
