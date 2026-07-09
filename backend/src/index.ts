import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { db, Food, Store, Order } from './db';

// Import routes
import authRoutes from './routes/auth';
import foodRoutes from './routes/foods';
import orderRoutes from './routes/orders';
import notificationRoutes from './routes/notifications';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'FoodSave API Server is running!' });
});

const server = http.createServer(app);

// WebSocket Setup
const wss = new WebSocketServer({ server });

// Map of userId to active WebSocket connections
const userConnections = new Map<string, WebSocket[]>();

wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket connection established.');
  let currentUserId: string | null = null;

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe' && data.userId) {
        currentUserId = data.userId;
        const cons = userConnections.get(data.userId) || [];
        cons.push(ws);
        userConnections.set(data.userId, cons);
        console.log(`User ${data.userId} subscribed to WebSocket notifications.`);
        
        ws.send(JSON.stringify({ type: 'subscribed', message: '成功訂閱即時通知服務' }));
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (currentUserId) {
      const cons = userConnections.get(currentUserId) || [];
      const updated = cons.filter(conn => conn !== ws);
      if (updated.length === 0) {
        userConnections.delete(currentUserId);
      } else {
        userConnections.set(currentUserId, updated);
      }
      console.log(`User ${currentUserId} disconnected.`);
    }
  });
});

// Helper: send WebSocket payload to a user
const sendToUser = (userId: string, payload: any) => {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  }
};

// Expose global methods for routers to broadcast updates
(global as any).broadcastNewFood = (food: Food, store: Store) => {
  // Find all users nearby (within 3km) and broadcast
  const users = db.getUsers();
  users.forEach(user => {
    // We only notify regular 'user' roles who might want to buy
    if (user.role === 'user') {
      const userStore = db.getStoreByUserId(user.id);
      // Mock user coordinates for proximity notification
      // If user has no store, we calculate distance using a mock coordinate or notify anyway
      // For demo purposes, we notify users if they are online
      const distance = db.getDistance(25.0334, 121.5435, store.latitude, store.longitude);
      
      // Send live notification
      sendToUser(user.id, {
        type: 'new_food_nearby',
        food,
        storeName: store.name,
        distance: Number(distance.toFixed(2)),
        title: '附近有新上架剩食！',
        message: `${store.name} 上架了「${food.name}」（特價：$${food.price}），距離您約 ${distance.toFixed(1)} 公里，快去看看吧！`
      });
    }
  });
};

(global as any).broadcastOrderUpdate = (order: Order, eventType: string) => {
  // Notify Buyer
  sendToUser(order.buyerId, {
    type: 'order_update',
    order,
    eventType
  });

  // Notify Store Owner
  const store = db.getStoreById(order.storeId);
  if (store) {
    sendToUser(store.userId, {
      type: 'order_update',
      order,
      eventType
    });
  }
};

// Scheduler: Run expiration checks every 10 seconds
setInterval(() => {
  // This automatically releases reserved order inventory and marks foods as expired
  db.checkExpirations();
}, 10000);

db.init().then(() => {
  server.listen(port, () => {
    console.log(`FoodSave Server is running on http://localhost:${port}`);
  });
});
