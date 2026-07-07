import { Router, Response } from 'express';
import { db, Food } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/foods - 上架剩食 (限商家)
router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'store') {
    return res.status(403).json({ error: '只有商家帳號可以上架剩食' });
  }

  const store = db.getStoreByUserId(user.id);
  if (!store) {
    return res.status(404).json({ error: '找不到商家的店舖資料' });
  }

  const { name, category, originalPrice, price, quantity, expiryMinutes, pickupStart, pickupEnd, photoUrl, allergens } = req.body;

  if (!name || !category || originalPrice === undefined || price === undefined || quantity === undefined) {
    return res.status(400).json({ error: '名稱、類別、原價、剩餘價、與數量為必填欄位' });
  }

  const foodId = 'food_' + Math.random().toString(36).substring(2, 9);
  
  // Calculate expiry time based on expiryMinutes
  const now = new Date();
  const minutes = expiryMinutes ? Number(expiryMinutes) : 180; // default 3 hours
  const expiryTime = new Date(now.getTime() + minutes * 60 * 1000).toISOString();

  const newFood: Food = {
    id: foodId,
    storeId: store.id,
    name,
    category,
    originalPrice: Number(originalPrice),
    price: Number(price),
    quantity: Number(quantity),
    expiryTime,
    pickupStart: pickupStart || '18:00',
    pickupEnd: pickupEnd || '21:00',
    latitude: store.latitude,
    longitude: store.longitude,
    photoUrl: photoUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=60',
    allergens: Array.isArray(allergens) ? allergens : [],
    status: 'available'
  };

  db.createFood(newFood);

  // Broadcase to WebSocket connections (handled in index.ts via event emitter or global handler)
  // We can attach a trigger here
  if ((global as any).broadcastNewFood) {
    (global as any).broadcastNewFood(newFood, store);
  }

  res.status(201).json({
    message: '剩食上架成功',
    food: newFood
  });
});

// GET /api/foods - 獲取剩食列表 (支援地理定位、半徑、類別、關鍵字搜尋)
router.get('/', (req, res) => {
  const { lat, lng, radius, category, search } = req.query;

  db.checkExpirations();

  let foodsWithDistance: (Food & { distance?: number; storeName: string })[] = [];

  if (lat && lng) {
    const radiusKm = radius ? Number(radius) : 5;
    foodsWithDistance = db.getNearbyFoods(Number(lat), Number(lng), radiusKm);
  } else {
    // Fallback: return all available foods
    const allFoods = db.getFoods().filter(f => f.status === 'available' && f.quantity > 0);
    foodsWithDistance = allFoods.map(food => {
      const store = db.getStoreById(food.storeId);
      return {
        ...food,
        storeName: store ? store.name : '未知商家'
      };
    });
  }

  // Filter by category
  if (category) {
    foodsWithDistance = foodsWithDistance.filter(f => f.category === category);
  }

  // Filter by search query
  if (search) {
    const q = String(search).toLowerCase();
    foodsWithDistance = foodsWithDistance.filter(
      f => f.name.toLowerCase().includes(q) || f.storeName.toLowerCase().includes(q)
    );
  }

  res.json(foodsWithDistance);
});

// GET /api/foods/:id - 獲取單一剩食細節
router.get('/:id', (req, res) => {
  const food = db.getFoodById(req.params.id);
  if (!food) {
    return res.status(404).json({ error: '找不到該剩食項目' });
  }

  const store = db.getStoreById(food.storeId);
  res.json({
    ...food,
    store
  });
});

// POST /api/foods/:id/delete - 刪除/下架剩食 (限商家)
router.post('/:id/delete', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'store') {
    return res.status(403).json({ error: '無權限操作' });
  }

  const food = db.getFoodById(req.params.id);
  if (!food) {
    return res.status(404).json({ error: '找不到該剩食項目' });
  }

  const store = db.getStoreByUserId(user.id);
  if (!store || food.storeId !== store.id) {
    return res.status(403).json({ error: '您只能下架自己商店的剩食' });
  }

  db.updateFood(food.id, { status: 'expired' }); // mark as expired (down)

  res.json({ message: '剩食已成功下架' });
});

export default router;
