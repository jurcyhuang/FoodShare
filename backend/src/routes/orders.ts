import { Router, Response } from 'express';
import { db, Order, Rating } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/orders - 建立預訂 (限一般使用者)
router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { foodId, quantity, paymentMethod } = req.body; // paymentMethod: 'online' | 'cash'

  if (!foodId || !quantity) {
    return res.status(400).json({ error: '請提供剩食 ID 與數量' });
  }

  db.checkExpirations();

  // Check credit score limit for cash payment
  if (paymentMethod === 'cash' && user.creditScore < 80) {
    return res.status(400).json({
      error: `您的信用分數為 ${user.creditScore}，低於現場付款門檻（80分），請選擇線上支付以完成預訂。`
    });
  }

  const food = db.getFoodById(foodId);
  if (!food) {
    return res.status(404).json({ error: '找不到該剩食項目' });
  }

  if (food.status !== 'available' || food.quantity < Number(quantity)) {
    return res.status(400).json({ error: '抱歉，剩食數量不足或已被預訂完了' });
  }

  // Deduct inventory
  const orderQty = Number(quantity);
  food.quantity -= orderQty;
  if (food.quantity === 0) {
    food.status = 'reserved';
  }
  db.updateFood(food.id, { quantity: food.quantity, status: food.status });

  // Generate order
  const orderId = 'order_' + Math.random().toString(36).substring(2, 9);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 mins
  const pickupCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

  const newOrder: Order = {
    id: orderId,
    foodId: food.id,
    storeId: food.storeId,
    buyerId: user.id,
    quantity: orderQty,
    totalPrice: food.price * orderQty,
    status: paymentMethod === 'online' ? 'pending_payment' : 'reserved',
    pickupCode,
    createdAt: now.toISOString(),
    expiresAt
  };

  db.createOrder(newOrder);

  // Notify Store Owner
  const store = db.getStoreById(food.storeId);
  if (store) {
    db.createNotification({
      id: Math.random().toString(36).substring(2, 9),
      userId: store.userId,
      title: '您有新的剩食預訂！',
      message: `商品「${food.name}」已被預訂了 ${orderQty} 個。預訂編號：#${orderId}，取貨代碼：${pickupCode}。`,
      read: false,
      createdAt: now.toISOString()
    });

    if ((global as any).broadcastOrderUpdate) {
      (global as any).broadcastOrderUpdate(newOrder, 'new_order');
    }
  }

  res.status(201).json({
    message: '預訂成功，商品將為您保留 15 分鐘！',
    order: newOrder
  });
});

// GET /api/orders - 獲取預訂列表
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  
  db.checkExpirations();

  let orders = db.getOrders();

  if (user.role === 'store') {
    const store = db.getStoreByUserId(user.id);
    if (store) {
      orders = orders.filter(o => o.storeId === store.id);
    } else {
      orders = [];
    }
  } else {
    orders = orders.filter(o => o.buyerId === user.id);
  }

  // Populate food & store details
  const populated = orders.map(order => {
    const food = db.getFoodById(order.foodId);
    const store = db.getStoreById(order.storeId);
    const buyer = db.getUserById(order.buyerId);
    const hasRating = db.getRatings().some(r => r.orderId === order.id);
    return {
      ...order,
      foodName: food ? food.name : '未知剩食',
      foodPhoto: food ? food.photoUrl : '',
      storeName: store ? store.name : '未知店家',
      storeAddress: store ? store.address : '',
      storePhone: store ? store.phone : '',
      buyerName: buyer ? buyer.username : '匿名用戶',
      isRated: hasRating
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(populated);
});

// GET /api/orders/ratings - 獲取評價列表
router.get('/ratings', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  
  let ratings = db.getRatings();

  if (user.role === 'store') {
    const store = db.getStoreByUserId(user.id);
    if (store) {
      ratings = ratings.filter(r => r.storeId === store.id);
    } else {
      ratings = [];
    }
  } else {
    ratings = ratings.filter(r => r.buyerId === user.id);
  }

  // Populate details
  const populated = ratings.map(r => {
    const buyer = db.getUserById(r.buyerId);
    const food = db.getFoodById(r.foodId);
    return {
      ...r,
      buyerName: buyer ? buyer.username : '匿名買家',
      foodName: food ? food.name : '未知剩食'
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(populated);
});

// POST /api/orders/:id/pay - 模擬線上付款
router.post('/:id/pay', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const order = db.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: '找不到該訂單' });
  }

  if (order.buyerId !== user.id) {
    return res.status(403).json({ error: '您無權為此訂單付款' });
  }

  if (order.status !== 'pending_payment') {
    return res.status(400).json({ error: '此訂單狀態不符合付款條件' });
  }

  db.updateOrder(order.id, { status: 'reserved' });

  // Notify Store Owner
  const store = db.getStoreById(order.storeId);
  if (store) {
    db.createNotification({
      id: Math.random().toString(36).substring(2, 9),
      userId: store.userId,
      title: '剩食預訂已完成付款',
      message: `預訂 #${order.id} 已完成線上付款，請準備交貨。`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  if ((global as any).broadcastOrderUpdate) {
    (global as any).broadcastOrderUpdate({ ...order, status: 'reserved' }, 'payment_success');
  }

  res.json({ message: '付款成功！訂單已鎖定為保留狀態', order: { ...order, status: 'reserved' } });
});

// POST /api/orders/:id/cancel - 取消預訂
router.post('/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const order = db.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: '找不到該訂單' });
  }

  // Allow cancellation by either the buyer or the store owner
  const store = db.getStoreByUserId(user.id);
  const isBuyer = order.buyerId === user.id;
  const isSeller = store && order.storeId === store.id;

  if (!isBuyer && !isSeller) {
    return res.status(403).json({ error: '您無權取消此訂單' });
  }

  if (order.status !== 'reserved' && order.status !== 'pending_payment') {
    return res.status(400).json({ error: '該訂單無法被取消' });
  }

  // Restore inventory
  const food = db.getFoodById(order.foodId);
  if (food) {
    food.quantity += order.quantity;
    if (food.status === 'reserved' && food.quantity > 0) {
      food.status = 'available';
    }
    db.updateFood(food.id, { quantity: food.quantity, status: food.status });
  }

  db.updateOrder(order.id, { status: 'cancelled' });

  // Send notifications
  if (isBuyer) {
    const storeObj = db.getStoreById(order.storeId);
    if (storeObj) {
      db.createNotification({
        id: Math.random().toString(36).substring(2, 9),
        userId: storeObj.userId,
        title: '使用者取消了預訂',
        message: `訂單 #${order.id} 已被買家主動取消，剩食庫存已自動歸還。`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  } else {
    // Notify buyer
    db.createNotification({
      id: Math.random().toString(36).substring(2, 9),
      userId: order.buyerId,
      title: '您的預訂已被商家取消',
      message: `很抱歉，您的預訂 #${order.id} 已被商家取消。如有扣款，款項將退回您的帳戶。`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  if ((global as any).broadcastOrderUpdate) {
    (global as any).broadcastOrderUpdate({ ...order, status: 'cancelled' }, 'order_cancelled');
  }

  res.json({ message: '預訂已成功取消，剩食庫存已歸還' });
});

// POST /api/orders/:id/complete - 完成取貨核銷 (限商家或持代碼驗證)
router.post('/:id/complete', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { pickupCode } = req.body;
  const order = db.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: '找不到該訂單' });
  }

  const store = db.getStoreByUserId(user.id);
  const isSeller = store && order.storeId === store.id;

  if (!isSeller) {
    return res.status(403).json({ error: '只有該剩食的店家可以進行核銷' });
  }

  if (order.status !== 'reserved') {
    return res.status(400).json({ error: '此訂單非保留狀態，無法完成取貨' });
  }

  // Verify Pickup Code
  if (!pickupCode || order.pickupCode !== pickupCode.trim()) {
    return res.status(400).json({ error: '取貨代碼錯誤，請確認買家手機上的 6 位數代碼' });
  }

  // Update order status
  db.updateOrder(order.id, { status: 'claimed' });

  // Update buyer credit score (Reward positive completion, up to 100)
  const buyer = db.getUserById(order.buyerId);
  if (buyer) {
    const currentScore = buyer.creditScore;
    const newScore = Math.min(100, currentScore + 1);
    db.updateUser(buyer.id, { creditScore: newScore });

    // Notify buyer
    db.createNotification({
      id: Math.random().toString(36).substring(2, 9),
      userId: buyer.id,
      title: '交易完成！感謝您攜手守護剩食',
      message: `您已成功領取預訂 #${order.id}。信用積分 +1（目前：${newScore} 分）。快來為這次的剩食留下評價吧！`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  if ((global as any).broadcastOrderUpdate) {
    (global as any).broadcastOrderUpdate({ ...order, status: 'claimed' }, 'order_claimed');
  }

  res.json({ message: '核銷成功！交易已完成', order: { ...order, status: 'claimed' } });
});

// POST /api/orders/:id/rate - 評價剩食與商家 (限買家)
router.post('/:id/rate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { qualityRating, storeRating, comment } = req.body;
  const order = db.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: '找不到該訂單' });
  }

  if (order.buyerId !== user.id) {
    return res.status(403).json({ error: '您非本訂單買家，無法評價' });
  }

  if (order.status !== 'claimed') {
    return res.status(400).json({ error: '只有已取貨完成的訂單才能評價' });
  }

  // Check if already rated
  const existingRating = db.getRatings().find(r => r.orderId === order.id);
  if (existingRating) {
    return res.status(400).json({ error: '您已為此訂單評過價' });
  }

  const ratingId = 'rating_' + Math.random().toString(36).substring(2, 9);
  const newRating: Rating = {
    id: ratingId,
    orderId: order.id,
    foodId: order.foodId,
    storeId: order.storeId,
    buyerId: user.id,
    qualityRating: Number(qualityRating) || 5,
    storeRating: Number(storeRating) || 5,
    comment: comment || '',
    createdAt: new Date().toISOString()
  };

  db.createRating(newRating);

  res.status(201).json({ message: '評價提交成功，感謝您的回饋！', rating: newRating });
});

export default router;
