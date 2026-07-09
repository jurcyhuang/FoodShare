import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: 'user' | 'store';
  creditScore: number;
  avatar: string;
  phone?: string;
}

export interface Store {
  id: string;
  userId: string;
  name: string;
  logo: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  description: string;
  rating: number;
  reviewCount: number;
}

export interface Food {
  id: string;
  storeId: string;
  name: string;
  category: '便當' | '麵包' | '生鮮' | '熟食';
  originalPrice: number;
  price: number;
  quantity: number;
  expiryTime: string; // ISO String
  pickupStart: string; // "17:00"
  pickupEnd: string; // "20:00"
  latitude: number;
  longitude: number;
  photoUrl: string;
  allergens: string[];
  status: 'available' | 'reserved' | 'claimed' | 'expired';
}

export interface Order {
  id: string;
  foodId: string;
  storeId: string;
  buyerId: string;
  quantity: number;
  totalPrice: number;
  status: 'pending_payment' | 'reserved' | 'claimed' | 'cancelled';
  pickupCode: string;
  createdAt: string;
  expiresAt: string; // 15 mins reservation deadline
}

export interface Rating {
  id: string;
  orderId: string;
  foodId: string;
  storeId: string;
  buyerId: string;
  qualityRating: number; // 1-5
  storeRating: number; // 1-5
  comment: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Schema {
  users: User[];
  stores: Store[];
  foods: Food[];
  orders: Order[];
  ratings: Rating[];
  notifications: Notification[];
}

const DB_FILE = path.join(__dirname, '..', 'db.json');

// Initialize PG connection if DATABASE_URL env variable exists
let isPg = !!process.env.DATABASE_URL;
let pool: Pool | null = null;

if (isPg) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Supabase/Neon SSL connections
  });
}

// Helper: Dynamically run PG update statements
async function pgUpdate(table: string, id: string, updates: any) {
  if (!pool) return;
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
  const values = keys.map(key => updates[key]);
  const query = `UPDATE "${table}" SET ${setClause} WHERE id = $1`;

  try {
    await pool.query(query, [id, ...values]);
  } catch (err) {
    console.error(`Error updating PG table ${table}:`, err);
  }
}

class Database {
  private data: Schema = {
    users: [],
    stores: [],
    foods: [],
    orders: [],
    ratings: [],
    notifications: []
  };

  constructor() {
    // Synchronous load for local dev JSON file fallback
    // For PG, asynchronous init() will be called from index.ts before start
  }

  // Asynchronous initializer called at server startup
  public async init() {
    if (isPg && pool) {
      try {
        console.log('Connecting to PostgreSQL database (Supabase)...');
        await pool.query('SELECT NOW()'); // connection health check
        console.log('PostgreSQL connection verified.');

        // 確保 users 資料表擁有 phone 欄位，方便後續編輯個人資料
        await pool.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50) DEFAULT \'\'');

        // Load all tables into memory (Write-Through Cache model)
        const usersRes = await pool.query('SELECT * FROM "users"');
        const storesRes = await pool.query('SELECT * FROM "stores"');
        const foodsRes = await pool.query('SELECT * FROM "foods"');
        const ordersRes = await pool.query('SELECT * FROM "orders"');
        const ratingsRes = await pool.query('SELECT * FROM "ratings"');
        const notificationsRes = await pool.query('SELECT * FROM "notifications"');

        this.data.users = usersRes.rows;
        this.data.stores = storesRes.rows.map(r => ({
          ...r,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          rating: Number(r.rating)
        }));
        this.data.foods = foodsRes.rows.map(r => ({
          ...r,
          originalPrice: Number(r.originalPrice),
          price: Number(r.price),
          latitude: Number(r.latitude),
          longitude: Number(r.longitude)
        }));
        this.data.orders = ordersRes.rows.map(r => ({
          ...r,
          totalPrice: Number(r.totalPrice)
        }));
        this.data.ratings = ratingsRes.rows;
        this.data.notifications = notificationsRes.rows;

        console.log(`Loaded ${this.data.users.length} users, ${this.data.stores.length} stores, ${this.data.foods.length} foods from PG.`);

        if (this.data.users.length === 0) {
          console.log('PostgreSQL database is empty. Seeding test data...');
          await this.seed();
        }
      } catch (err) {
        console.error('Failed to initialize PostgreSQL database, falling back to local JSON:', err);
        isPg = false;
        this.loadLocal();
      }
    } else {
      this.loadLocal();
    }
  }

  private loadLocal() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
      }
      
      if (!this.data.users || this.data.users.length === 0) {
        this.seed();
      }
    } catch (error) {
      console.error('Error loading local database:', error);
    }
  }

  private async seed() {
    const bcrypt = require('bcryptjs');
    const buyerHash = bcrypt.hashSync('password123', 10);
    const storeHash = bcrypt.hashSync('password123', 10);

    const buyerUser: User = {
      id: 'usr_buyer',
      email: 'buyer@foodsave.com',
      username: '剩食終結者 小明',
      passwordHash: buyerHash,
      role: 'user',
      creditScore: 100,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=xiaoming',
      phone: '0912-123456'
    };

    const storeUser: User = {
      id: 'usr_store',
      email: 'store@foodsave.com',
      username: '好丘貝果大安店長',
      passwordHash: storeHash,
      role: 'store',
      creditScore: 100,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=bagel',
      phone: '0912-654321'
    };

    const demoStore: Store = {
      id: 'store_demo',
      userId: 'usr_store',
      name: '好丘貝果 (大安店) Good Cho\'s',
      logo: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=150&auto=format&fit=crop&q=60',
      address: '台北市大安區信義路三段147巷',
      latitude: 25.0334,
      longitude: 121.5435,
      phone: '02-27012345',
      description: '我們的手作新鮮貝果，當日未售完將在此以優惠價分享給需要的朋友。',
      rating: 4.8,
      reviewCount: 12
    };

    const now = new Date();
    const expiryTime1 = new Date(now.getTime() + 180 * 60 * 1000).toISOString(); // 3 hours
    const expiryTime2 = new Date(now.getTime() + 240 * 60 * 1000).toISOString(); // 4 hours

    const demoFoods: Food[] = [
      {
        id: 'food_1',
        storeId: 'store_demo',
        name: '手作起司香草貝果 (2入)',
        category: '麵包',
        originalPrice: 120,
        price: 45,
        quantity: 3,
        expiryTime: expiryTime1,
        pickupStart: '18:00',
        pickupEnd: '21:30',
        latitude: 25.0334,
        longitude: 121.5435,
        photoUrl: 'https://images.unsplash.com/photo-1541256996761-85df2effaa16?w=400&auto=format&fit=crop&q=60',
        allergens: ['麥麩', '奶類'],
        status: 'available'
      },
      {
        id: 'food_2',
        storeId: 'store_demo',
        name: '煙燻起司豬肉便當',
        category: '便當',
        originalPrice: 160,
        price: 65,
        quantity: 2,
        expiryTime: expiryTime2,
        pickupStart: '18:30',
        pickupEnd: '21:00',
        latitude: 25.0334,
        longitude: 121.5435,
        photoUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=60',
        allergens: ['芝麻', '大豆'],
        status: 'available'
      }
    ];

    this.data.users = [buyerUser, storeUser];
    this.data.stores = [demoStore];
    this.data.foods = demoFoods;
    this.data.orders = [];
    this.data.ratings = [];
    this.data.notifications = [];
    
    this.saveLocal();

    // If using PG, populate the cloud tables
    if (isPg && pool) {
      try {
        console.log('Seeding demo accounts to PostgreSQL...');
        await pool.query('INSERT INTO "users" (id, email, username, "passwordHash", role, "creditScore", avatar, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [buyerUser.id, buyerUser.email, buyerUser.username, buyerUser.passwordHash, buyerUser.role, buyerUser.creditScore, buyerUser.avatar, buyerUser.phone || '']);
        await pool.query('INSERT INTO "users" (id, email, username, "passwordHash", role, "creditScore", avatar, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [storeUser.id, storeUser.email, storeUser.username, storeUser.passwordHash, storeUser.role, storeUser.creditScore, storeUser.avatar, storeUser.phone || '']);
        await pool.query('INSERT INTO "stores" (id, "userId", name, logo, address, latitude, longitude, phone, description, rating, "reviewCount") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [demoStore.id, demoStore.userId, demoStore.name, demoStore.logo, demoStore.address, demoStore.latitude, demoStore.longitude, demoStore.phone, demoStore.description, demoStore.rating, demoStore.reviewCount]);
        for (const food of demoFoods) {
          await pool.query('INSERT INTO "foods" (id, "storeId", name, category, "originalPrice", price, quantity, "expiryTime", "pickupStart", "pickupEnd", latitude, longitude, "photoUrl", allergens, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)', [food.id, food.storeId, food.name, food.category, food.originalPrice, food.price, food.quantity, food.expiryTime, food.pickupStart, food.pickupEnd, food.latitude, food.longitude, food.photoUrl, food.allergens, food.status]);
        }
        console.log('Seeding PostgreSQL database complete.');
      } catch (err) {
        console.error('Error seeding PostgreSQL:', err);
      }
    }
  }

  private saveLocal() {
    if (isPg) return; // do not save to JSON file if in PG mode
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving local database:', error);
    }
  }

  // Helper: Haversine distance in kilometers
  public getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Users API
  getUsers(): User[] { return this.data.users; }
  getUserById(id: string): User | undefined { return this.data.users.find(u => u.id === id); }
  getUserByEmail(email: string): User | undefined { return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase()); }
  createUser(user: User): User {
    this.data.users.push(user);
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "users" (id, email, username, "passwordHash", role, "creditScore", avatar, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [user.id, user.email, user.username, user.passwordHash, user.role, user.creditScore, user.avatar, user.phone || '']
      ).catch(err => console.error('PG insert user error:', err));
    }
    return user;
  }
  updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.saveLocal();
    if (isPg && pool) {
      pgUpdate('users', id, updates);
    }
    return this.data.users[idx];
  }
  deleteUser(id: string): void {
    const store = this.getStoreByUserId(id);
    this.data.users = this.data.users.filter(u => u.id !== id);
    if (store) {
      this.data.stores = this.data.stores.filter(s => s.id !== store.id);
      this.data.foods = this.data.foods.filter(f => f.storeId !== store.id);
    }
    this.data.orders = this.data.orders.filter(o => o.buyerId !== id && (!store || o.storeId !== store.id));
    this.data.ratings = this.data.ratings.filter(r => r.buyerId !== id && (!store || r.storeId !== store.id));
    this.data.notifications = this.data.notifications.filter(n => n.userId !== id);
    
    this.saveLocal();
    
    if (isPg && pool) {
      pool.query('DELETE FROM "users" WHERE id = $1', [id])
        .catch(err => console.error('PG delete user error:', err));
    }
  }

  // Stores API
  getStores(): Store[] { return this.data.stores; }
  getStoreById(id: string): Store | undefined { return this.data.stores.find(s => s.id === id); }
  getStoreByUserId(userId: string): Store | undefined { return this.data.stores.find(s => s.userId === userId); }
  createStore(store: Store): Store {
    this.data.stores.push(store);
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "stores" (id, "userId", name, logo, address, latitude, longitude, phone, description, rating, "reviewCount") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [store.id, store.userId, store.name, store.logo, store.address, store.latitude, store.longitude, store.phone, store.description, store.rating, store.reviewCount]
      ).catch(err => console.error('PG insert store error:', err));
    }
    return store;
  }
  updateStore(id: string, updates: Partial<Store>): Store | undefined {
    const idx = this.data.stores.findIndex(s => s.id === id);
    if (idx === -1) return undefined;
    this.data.stores[idx] = { ...this.data.stores[idx], ...updates };
    this.saveLocal();
    if (isPg && pool) {
      pgUpdate('stores', id, updates);
    }
    return this.data.stores[idx];
  }

  // Foods API
  getFoods(): Food[] { return this.data.foods; }
  getFoodById(id: string): Food | undefined { return this.data.foods.find(f => f.id === id); }
  createFood(food: Food): Food {
    this.data.foods.push(food);
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "foods" (id, "storeId", name, category, "originalPrice", price, quantity, "expiryTime", "pickupStart", "pickupEnd", latitude, longitude, "photoUrl", allergens, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
        [food.id, food.storeId, food.name, food.category, food.originalPrice, food.price, food.quantity, food.expiryTime, food.pickupStart, food.pickupEnd, food.latitude, food.longitude, food.photoUrl, food.allergens, food.status]
      ).catch(err => console.error('PG insert food error:', err));
    }
    return food;
  }
  updateFood(id: string, updates: Partial<Food>): Food | undefined {
    const idx = this.data.foods.findIndex(f => f.id === id);
    if (idx === -1) return undefined;
    this.data.foods[idx] = { ...this.data.foods[idx], ...updates };
    this.saveLocal();
    if (isPg && pool) {
      pgUpdate('foods', id, updates);
    }
    return this.data.foods[idx];
  }
  getNearbyFoods(lat: number, lon: number, radiusKm: number = 5): (Food & { distance: number; storeName: string })[] {
    // Before querying, auto-expire older items
    this.checkExpirations();

    const activeFoods = this.data.foods.filter(f => f.status === 'available' && f.quantity > 0);
    const results = activeFoods.map(food => {
      const distance = this.getDistance(lat, lon, food.latitude, food.longitude);
      const store = this.getStoreById(food.storeId);
      return {
        ...food,
        distance,
        storeName: store ? store.name : '未知商家'
      };
    });

    return results
      .filter(r => r.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  // Orders API
  getOrders(): Order[] { return this.data.orders; }
  getOrderById(id: string): Order | undefined { return this.data.orders.find(o => o.id === id); }
  createOrder(order: Order): Order {
    this.data.orders.push(order);
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "orders" (id, "foodId", "storeId", "buyerId", quantity, "totalPrice", status, "pickupCode", "createdAt", "expiresAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [order.id, order.foodId, order.storeId, order.buyerId, order.quantity, order.totalPrice, order.status, order.pickupCode, order.createdAt, order.expiresAt]
      ).catch(err => console.error('PG insert order error:', err));
    }
    return order;
  }
  updateOrder(id: string, updates: Partial<Order>): Order | undefined {
    const idx = this.data.orders.findIndex(o => o.id === id);
    if (idx === -1) return undefined;
    this.data.orders[idx] = { ...this.data.orders[idx], ...updates };
    this.saveLocal();
    if (isPg && pool) {
      pgUpdate('orders', id, updates);
    }
    return this.data.orders[idx];
  }

  // Ratings API
  getRatings(): Rating[] { return this.data.ratings; }
  getRatingsByStoreId(storeId: string): Rating[] { return this.data.ratings.filter(r => r.storeId === storeId); }
  createRating(rating: Rating): Rating {
    this.data.ratings.push(rating);
    
    // Recalculate store rating
    const storeRatings = this.getRatingsByStoreId(rating.storeId);
    if (storeRatings.length > 0) {
      const sum = storeRatings.reduce((acc, curr) => acc + curr.storeRating, 0);
      const avg = Math.round((sum / storeRatings.length) * 10) / 10;
      this.updateStore(rating.storeId, {
        rating: avg,
        reviewCount: storeRatings.length
      });
    }

    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "ratings" (id, "orderId", "foodId", "storeId", "buyerId", "qualityRating", "storeRating", comment, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [rating.id, rating.orderId, rating.foodId, rating.storeId, rating.buyerId, rating.qualityRating, rating.storeRating, rating.comment, rating.createdAt]
      ).catch(err => console.error('PG insert rating error:', err));
    }
    return rating;
  }

  // Notifications API
  getNotifications(): Notification[] { return this.data.notifications; }
  getNotificationsByUserId(userId: string): Notification[] {
    return this.data.notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  createNotification(notification: Notification): Notification {
    this.data.notifications.push(notification);
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'INSERT INTO "notifications" (id, "userId", title, message, read, "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
        [notification.id, notification.userId, notification.title, notification.message, notification.read, notification.createdAt]
      ).catch(err => console.error('PG insert notification error:', err));
    }
    return notification;
  }
  markNotificationsAsRead(userId: string): void {
    this.data.notifications.forEach(n => {
      if (n.userId === userId) n.read = true;
    });
    this.saveLocal();
    if (isPg && pool) {
      pool.query(
        'UPDATE "notifications" SET read = true WHERE "userId" = $1',
        [userId]
      ).catch(err => console.error('PG mark notification read error:', err));
    }
  }

  // Automatically check expired foods and uncompleted pending/reserved orders
  public checkExpirations() {
    const now = new Date();
    let modified = false;

    // 1. Food Expirations
    this.data.foods.forEach(f => {
      if (f.status === 'available') {
        const expDate = new Date(f.expiryTime);
        if (now > expDate) {
          f.status = 'expired';
          if (isPg && pool) pgUpdate('foods', f.id, { status: 'expired' });
          modified = true;
        }
      }
    });

    // 2. Order Expirations (15 mins reserve limit)
    this.data.orders.forEach(o => {
      if (o.status === 'reserved' || o.status === 'pending_payment') {
        const expLimit = new Date(o.expiresAt);
        if (now > expLimit) {
          o.status = 'cancelled';
          if (isPg && pool) pgUpdate('orders', o.id, { status: 'cancelled' });

          // Return inventory
          const food = this.getFoodById(o.foodId);
          if (food) {
            food.quantity += o.quantity;
            if (food.status === 'reserved' && food.quantity > 0) {
              food.status = 'available';
            }
            if (isPg && pool) pgUpdate('foods', food.id, { quantity: food.quantity, status: food.status });
          }
          // Penalize credit score for reserved cancel (no-show)
          const user = this.getUserById(o.buyerId);
          if (user) {
            user.creditScore = Math.max(0, user.creditScore - 15);
            if (isPg && pool) pgUpdate('users', user.id, { creditScore: user.creditScore });

            // Notify user
            const notification = {
              id: Math.random().toString(36).substring(2, 9),
              userId: user.id,
              title: '預訂已逾期取消',
              message: `您的預訂 #${o.id} 已超過 15 分鐘取貨時間而被自動取消，信用分數扣除 15 分（目前：${user.creditScore} 分）。`,
              read: false,
              createdAt: now.toISOString()
            };
            this.data.notifications.push(notification);
            if (isPg && pool) {
              pool.query(
                'INSERT INTO "notifications" (id, "userId", title, message, read, "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
                [notification.id, notification.userId, notification.title, notification.message, notification.read, notification.createdAt]
              ).catch(err => console.error('PG insert notification error:', err));
            }
          }
          modified = true;
        }
      }
    });

    if (modified) {
      this.saveLocal();
    }
  }
}

export const db = new Database();
