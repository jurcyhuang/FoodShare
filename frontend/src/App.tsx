import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Search, ShoppingBag, User, Plus, Trash2, Star, LogOut,
  Compass, Sparkles, Clock, CreditCard, Bell, Shield, QrCode,
  Wifi, WifiOff, TrendingUp, Droplet, Leaf, X, ChevronRight, Check, AlertTriangle
} from 'lucide-react';

// Types matched with backend
interface Food {
  id: string;
  storeId: string;
  name: string;
  category: '便當' | '麵包' | '生鮮' | '熟食';
  originalPrice: number;
  price: number;
  quantity: number;
  expiryTime: string;
  pickupStart: string;
  pickupEnd: string;
  latitude: number;
  longitude: number;
  photoUrl: string;
  allergens: string[];
  status: 'available' | 'reserved' | 'claimed' | 'expired';
  distance?: number;
  storeName: string;
}

interface Order {
  id: string;
  foodId: string;
  storeId: string;
  buyerId: string;
  quantity: number;
  totalPrice: number;
  status: 'pending_payment' | 'reserved' | 'claimed' | 'cancelled';
  pickupCode: string;
  createdAt: string;
  expiresAt: string;
  foodName?: string;
  foodPhoto?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  buyerName?: string;
}

interface Rating {
  id: string;
  orderId: string;
  foodId: string;
  storeId: string;
  buyerId: string;
  qualityRating: number;
  storeRating: number;
  comment: string;
  createdAt: string;
}

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Stats {
  claimedCount: number;
  totalItems: number;
  foodSavedKg: number;
  co2OffsetKg: number;
  waterSavedLiters: number;
  creditScore: number;
}

const getCategoryPlaceholder = (category: string) => {
  switch (category) {
    case '便當':
      return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150&auto=format&fit=crop&q=60';
    case '麵包':
      return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=150&auto=format&fit=crop&q=60';
    case '生鮮':
      return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=150&auto=format&fit=crop&q=60';
    case '熟食':
      return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=150&auto=format&fit=crop&q=60';
    default:
      return 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=150&auto=format&fit=crop&q=60';
  }
};

export default function App() {
  // Shared config state
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:3001');
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [splitViewTab, setSplitViewTab] = useState<'mobile' | 'merchant'>('mobile');

  // Client Session State
  const [clientToken, setClientToken] = useState<string | null>(localStorage.getItem('fs_client_token'));
  const [clientUser, setClientUser] = useState<any | null>(null);
  const [clientStore, setClientStore] = useState<any | null>(null);
  const [clientActiveTab, setClientActiveTab] = useState<'explore' | 'orders' | 'profile'>('explore');
  const [clientSearch, setClientSearch] = useState('');
  const [clientCategory, setClientCategory] = useState<string>('');
  const [clientRadius, setClientRadius] = useState<number>(5);
  const [foods, setFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [qtyToBook, setQtyToBook] = useState(1);
  const [paymentModalOrder, setPaymentModalOrder] = useState<{ foodId: string; quantity: number } | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'online' | 'cash'>('online');
  
  // Client ratings dialog
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [qualityRating, setQualityRating] = useState(5);
  const [storeRating, setStoreRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  // Notifications list & Client stats
  const [clientNotifications, setClientNotifications] = useState<Notification[]>([]);
  const [clientStats, setClientStats] = useState<Stats | null>(null);

  // Client simulated toast
  const [clientToast, setClientToast] = useState<{ title: string; message: string } | null>(null);

  // Merchant Session State
  const [merchantToken, setMerchantToken] = useState<string | null>(localStorage.getItem('fs_merchant_token'));
  const [merchantUser, setMerchantUser] = useState<any | null>(null);
  const [merchantStore, setMerchantStore] = useState<any | null>(null);
  const [merchantTab, setMerchantTab] = useState<'listings' | 'orders' | 'reviews'>('listings');
  const [merchantListings, setMerchantListings] = useState<Food[]>([]);
  const [merchantOrders, setMerchantOrders] = useState<Order[]>([]);
  const [merchantReviews, setMerchantReviews] = useState<Rating[]>([]);
  const [merchantStats, setMerchantStats] = useState<any>(null);

  // New Listing Form State
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodCategory, setNewFoodCategory] = useState<'便當' | '麵包' | '生鮮' | '熟食'>('麵包');
  const [newFoodOrigPrice, setNewFoodOrigPrice] = useState('');
  const [newFoodPrice, setNewFoodPrice] = useState('');
  const [newFoodQty, setNewFoodQty] = useState('5');
  const [newFoodExpiry, setNewFoodExpiry] = useState('180');
  const [newFoodPickupStart, setNewFoodPickupStart] = useState('18:00');
  const [newFoodPickupEnd, setNewFoodPickupEnd] = useState('21:30');
  const [newFoodAllergens, setNewFoodAllergens] = useState<string[]>([]);
  const [newFoodPhoto, setNewFoodPhoto] = useState('');

  // Nuclear Pickup Modal for Store
  const [nuclearOrder, setNuclearOrder] = useState<Order | null>(null);
  const [enteredPickupCode, setEnteredPickupCode] = useState('');
  const [pickupVerifyError, setPickupVerifyError] = useState<string | null>(null);

  // Login Form States (separate for client and merchant)
  const [clientEmail, setClientEmail] = useState('buyer@foodsave.com');
  const [clientPass, setClientPass] = useState('password123');
  const [clientAuthMode, setClientAuthMode] = useState<'login' | 'register'>('login');
  const [clientRegName, setClientRegName] = useState('');
  
  const [merchantEmail, setMerchantEmail] = useState('store@foodsave.com');
  const [merchantPass, setMerchantPass] = useState('password123');
  const [merchantAuthMode, setMerchantAuthMode] = useState<'login' | 'register'>('login');
  const [merchantRegName, setMerchantRegName] = useState('');
  const [merchantRegStoreName, setMerchantRegStoreName] = useState('');
  const [merchantRegAddress, setMerchantRegAddress] = useState('台北市大安區新生南路三段');
  
  // Sockets & Timers
  const wsClientRef = useRef<WebSocket | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // 1. WebSocket Connection Setup
  useEffect(() => {
    const wsUrl = apiUrl.replace('http', 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket Connected to backend.');
      setIsWsConnected(true);
      
      // If client logged in, subscribe
      if (clientUser) {
        ws.send(JSON.stringify({ type: 'subscribe', userId: clientUser.id }));
      }
    };

    ws.onclose = () => {
      console.log('WebSocket Disconnected.');
      setIsWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket Msg Received:', data);

        // Notify client about nearby new food
        if (data.type === 'new_food_nearby') {
          setClientToast({ title: data.title, message: data.message });
          // Auto clear toast
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => setClientToast(null), 8000);
          
          // Refresh client foods list
          fetchClientFoods();
        }

        // Live order status updates
        if (data.type === 'order_update') {
          // Refresh both datasets
          if (clientToken) {
            fetchClientOrders();
            fetchClientStats();
            fetchClientNotifications();
          }
          if (merchantToken) {
            fetchMerchantOrders();
            fetchMerchantStats();
          }
        }
      } catch (err) {
        console.error('Error parsing socket event:', err);
      }
    };

    wsClientRef.current = ws;

    return () => {
      ws.close();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [apiUrl, clientUser]);

  // Subscribe to WS when client session changes
  useEffect(() => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN && clientUser) {
      wsClientRef.current.send(JSON.stringify({ type: 'subscribe', userId: clientUser.id }));
    }
  }, [clientUser]);

  // Fetch client data
  useEffect(() => {
    if (clientToken) {
      fetchClientProfile();
    } else {
      setClientUser(null);
    }
  }, [clientToken]);

  // Fetch merchant data
  useEffect(() => {
    if (merchantToken) {
      fetchMerchantProfile();
    } else {
      setMerchantUser(null);
      setMerchantStore(null);
    }
  }, [merchantToken]);

  // Loop refresh foods and items
  useEffect(() => {
    fetchClientFoods();
    const timer = setInterval(() => {
      fetchClientFoods();
      if (clientToken) fetchClientOrders();
      if (merchantToken) fetchMerchantOrders();
    }, 10000);
    return () => clearInterval(timer);
  }, [clientCategory, clientSearch, clientToken, merchantToken]);

  // API Call Helpers
  const fetchClientProfile = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setClientUser(data.user);
        setClientStore(data.store);
        fetchClientOrders();
        fetchClientStats();
        fetchClientNotifications();
      } else {
        handleClientLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMerchantProfile = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${merchantToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMerchantUser(data.user);
        setMerchantStore(data.store);
        fetchMerchantListings();
        fetchMerchantOrders();
        fetchMerchantStats();
        fetchMerchantReviews();
      } else {
        handleMerchantLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClientFoods = async () => {
    try {
      // Simulation default GPS coordinates (台北市大安區)
      const lat = 25.0334;
      const lng = 121.5435;
      let url = `${apiUrl}/api/foods?lat=${lat}&lng=${lng}&radius=${clientRadius}`;
      if (clientCategory) url += `&category=${encodeURIComponent(clientCategory)}`;
      if (clientSearch) url += `&search=${encodeURIComponent(clientSearch)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setFoods(data);
        // Refresh selected food details if currently open
        if (selectedFood) {
          const updated = data.find((f: Food) => f.id === selectedFood.id);
          if (updated) setSelectedFood(updated);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClientOrders = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/orders`, {
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      const data = await res.json();
      if (res.ok) setClientOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

  const [clientOrders, setClientOrders] = useState<Order[]>([]);

  const fetchClientStats = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/stats`, {
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      const data = await res.json();
      if (res.ok) setClientStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClientNotifications = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      const data = await res.json();
      if (res.ok) setClientNotifications(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Merchant actions
  const fetchMerchantListings = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/foods`);
      const data = await res.json();
      if (res.ok && merchantStore) {
        // Filter listings owned by this store
        const mine = data.filter((f: Food) => f.storeId === merchantStore.id);
        setMerchantListings(mine);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMerchantOrders = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/orders`, {
        headers: { 'Authorization': `Bearer ${merchantToken}` }
      });
      const data = await res.json();
      if (res.ok) setMerchantOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMerchantStats = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/stats`, {
        headers: { 'Authorization': `Bearer ${merchantToken}` }
      });
      const data = await res.json();
      if (res.ok) setMerchantStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMerchantReviews = async () => {
    try {
      if (!merchantStore) return;
      const res = await fetch(`${apiUrl}/api/orders`, { // fetch all completed orders with ratings
        headers: { 'Authorization': `Bearer ${merchantToken}` }
      });
      const data = await res.json();
      // Simulating loading reviews by finding matching ratings, but since we have a clean API
      // We can fetch from backend orders or ratings. Let's do it cleanly.
      // For now we'll just mock ratings details associated or grab from simulated ratings.
    } catch (e) {
      console.error(e);
    }
  };

  // Auth Operations
  const handleQuickClientLogin = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'buyer@foodsave.com', password: 'password123' })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fs_client_token', data.token);
        setClientToken(data.token);
        setClientUser(data.user);
        setClientStore(data.store);
      } else {
        alert(data.error || '驗證失敗');
      }
    } catch (err) {
      alert('無法連線至 API 伺服器，請確認後端已在運作中');
    }
  };

  const handleQuickMerchantLogin = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'store@foodsave.com', password: 'password123' })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fs_merchant_token', data.token);
        setMerchantToken(data.token);
        setMerchantUser(data.user);
        setMerchantStore(data.store);
      } else {
        alert(data.error || '驗證失敗');
      }
    } catch (err) {
      alert('無法連線至 API 伺服器，請確認後端已在運作中');
    }
  };

  const handleClientLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const path = clientAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = clientAuthMode === 'login' 
        ? { email: clientEmail, password: clientPass }
        : { email: clientEmail, password: clientPass, username: clientRegName, role: 'user' };

      const res = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fs_client_token', data.token);
        setClientToken(data.token);
        setClientUser(data.user);
        setClientStore(data.store);
      } else {
        alert(data.error || '驗證失敗');
      }
    } catch (err) {
      alert('無法連線至 API 伺服器');
    }
  };

  const handleMerchantLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const path = merchantAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = merchantAuthMode === 'login'
        ? { email: merchantEmail, password: merchantPass }
        : {
            email: merchantEmail,
            password: merchantPass,
            username: merchantRegName,
            role: 'store',
            storeName: merchantRegStoreName,
            address: merchantRegAddress,
            latitude: 25.0334, // Seed GPS coords
            longitude: 121.5435
          };

      const res = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fs_merchant_token', data.token);
        setMerchantToken(data.token);
        setMerchantUser(data.user);
        setMerchantStore(data.store);
      } else {
        alert(data.error || '驗證失敗');
      }
    } catch (err) {
      alert('無法連線至 API 伺服器');
    }
  };

  const handleClientLogout = () => {
    localStorage.removeItem('fs_client_token');
    setClientToken(null);
    setClientUser(null);
    setClientStore(null);
  };

  const handleMerchantLogout = () => {
    localStorage.removeItem('fs_merchant_token');
    setMerchantToken(null);
    setMerchantUser(null);
    setMerchantStore(null);
  };

  // Client Actions: Booking & Orders
  const triggerBookOrder = async () => {
    if (!selectedFood) return;
    setPaymentModalOrder({ foodId: selectedFood.id, quantity: qtyToBook });
  };

  const confirmBookOrder = async () => {
    if (!paymentModalOrder) return;
    try {
      const res = await fetch(`${apiUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clientToken}`
        },
        body: JSON.stringify({
          foodId: paymentModalOrder.foodId,
          quantity: paymentModalOrder.quantity,
          paymentMethod: selectedPaymentMethod
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPaymentModalOrder(null);
        setSelectedFood(null);
        setQtyToBook(1);
        setClientActiveTab('orders');
        fetchClientOrders();
        fetchClientFoods();
      } else {
        alert(data.error || '預訂失敗');
      }
    } catch (e) {
      alert('通訊錯誤');
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm('您確定要取消這個剩食預訂嗎？已保留的商品將歸還給商家。')) return;
    try {
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      if (res.ok) {
        fetchClientOrders();
        fetchClientFoods();
      } else {
        const d = await res.json();
        alert(d.error || '取消失敗');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const payForOrder = async (orderId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      if (res.ok) {
        fetchClientOrders();
      } else {
        const d = await res.json();
        alert(d.error || '付款失敗');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingOrder) return;
    try {
      const res = await fetch(`${apiUrl}/api/orders/${ratingOrder.id}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clientToken}`
        },
        body: JSON.stringify({
          qualityRating,
          storeRating,
          comment: ratingComment
        })
      });
      if (res.ok) {
        setRatingOrder(null);
        setRatingComment('');
        fetchClientOrders();
        fetchClientStats();
      } else {
        const d = await res.json();
        alert(d.error || '評分失敗');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markNotificationsAsRead = async () => {
    try {
      await fetch(`${apiUrl}/api/notifications/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      fetchClientNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  // Merchant Actions: Food Upload, Nuclear verification
  const handleCreateFood = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/foods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${merchantToken}`
        },
        body: JSON.stringify({
          name: newFoodName,
          category: newFoodCategory,
          originalPrice: Number(newFoodOrigPrice),
          price: Number(newFoodPrice),
          quantity: Number(newFoodQty),
          expiryMinutes: Number(newFoodExpiry),
          pickupStart: newFoodPickupStart,
          pickupEnd: newFoodPickupEnd,
          photoUrl: newFoodPhoto || undefined,
          allergens: newFoodAllergens
        })
      });
      if (res.ok) {
        setNewFoodName('');
        setNewFoodOrigPrice('');
        setNewFoodPrice('');
        setNewFoodPhoto('');
        setNewFoodAllergens([]);
        fetchMerchantListings();
        fetchMerchantStats();
      } else {
        const d = await res.json();
        alert(d.error || '上架失敗');
      }
    } catch (e) {
      alert('伺服器通訊出錯');
    }
  };

  const handleDeleteFood = async (foodId: string) => {
    if (!confirm('您確定要將此商品下架嗎？')) return;
    try {
      const res = await fetch(`${apiUrl}/api/foods/${foodId}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${merchantToken}` }
      });
      if (res.ok) {
        fetchMerchantListings();
      } else {
        const d = await res.json();
        alert(d.error || '下架失敗');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const verifyPickupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuclearOrder) return;
    setPickupVerifyError(null);
    try {
      const res = await fetch(`${apiUrl}/api/orders/${nuclearOrder.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${merchantToken}`
        },
        body: JSON.stringify({ pickupCode: enteredPickupCode })
      });
      const data = await res.json();
      if (res.ok) {
        setNuclearOrder(null);
        setEnteredPickupCode('');
        fetchMerchantOrders();
        fetchMerchantStats();
      } else {
        setPickupVerifyError(data.error || '取貨碼不正確，請重新核對。');
      }
    } catch (e) {
      setPickupVerifyError('通訊故障');
    }
  };

  // Helper logic for allergens multi-select
  const toggleAllergen = (allg: string) => {
    if (newFoodAllergens.includes(allg)) {
      setNewFoodAllergens(newFoodAllergens.filter(x => x !== allg));
    } else {
      setNewFoodAllergens([...newFoodAllergens, allg]);
    }
  };

  // Timer component helper inside App.tsx
  const TimeRemaining = ({ expiresAt }: { expiresAt: string }) => {
    const [timeLeft, setTimeLeft] = useState<string>('15:00');

    useEffect(() => {
      const calculateTime = () => {
        const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
        if (diffMs <= 0) return '00:00';
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      };

      setTimeLeft(calculateTime());
      const interval = setInterval(() => {
        setTimeLeft(calculateTime());
      }, 1000);

      return () => clearInterval(interval);
    }, [expiresAt]);

    return <span>{timeLeft}</span>;
  };

  return (
    <div className="app-wrapper">
      {/* 1. Global Header */}
      <header className="app-header">
        <div className="brand">
          <Leaf size={28} style={{ color: '#10b981' }} />
          Food<span>Save</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.7, marginLeft: '0.5rem' }}>
            剩食雙向即時媒合模擬器
          </span>
        </div>

        <div className="connection-config">
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="API URL: http://localhost:3001"
          />
          {isWsConnected ? (
            <span className="status-badge connected">
              <Wifi size={14} /> WebSocket 連線中
            </span>
          ) : (
            <span className="status-badge disconnected">
              <WifiOff size={14} /> 連線中斷
            </span>
          )}
        </div>
      </header>

      {/* 2. Tab Switcher for Responsive Mobile Screens */}
      <div className="view-switcher-tabs">
        <button
          className={`tab-btn ${splitViewTab === 'mobile' ? 'active' : ''}`}
          onClick={() => setSplitViewTab('mobile')}
        >
          買家 APP 端
        </button>
        <button
          className={`tab-btn ${splitViewTab === 'merchant' ? 'active' : ''}`}
          onClick={() => setSplitViewTab('merchant')}
        >
          商家後台端
        </button>
      </div>

      {/* 3. Split Container Layout */}
      <main className="split-container">
        
        {/* ========================================================
            LEFT SIDE: IPHONE APP PREVIEW (Client/Buyer Side)
           ======================================================== */}
        <div className={`mobile-panel ${splitViewTab === 'mobile' ? 'active' : ''}`}>
          <div className="iphone-frame">
            <div className="iphone-notch" />
            
            <div className="mobile-app-screen">
              
              {/* Toast Notifications */}
              {clientToast && (
                <div className="notification-toast">
                  <Bell size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                  <div className="toast-content">
                    <h5>{clientToast.title}</h5>
                    <p>{clientToast.message}</p>
                  </div>
                  <button className="toast-close" onClick={() => setClientToast(null)}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* No session: Show Auth Screen */}
              {!clientToken ? (
                <div className="mobile-content">
                  <div className="auth-container">
                    <div className="auth-header-desc">
                      <h2>拯救剩食，從這開始</h2>
                      <p>用超低特惠搶購附近店家新鮮剩食，攜手減碳！</p>
                    </div>

                    <form onSubmit={handleClientLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {clientAuthMode === 'register' && (
                        <div className="form-group">
                          <label>您的名稱</label>
                          <input
                            type="text"
                            placeholder="例如：剩食小幫手"
                            value={clientRegName}
                            onChange={(e) => setClientRegName(e.target.value)}
                            required
                          />
                        </div>
                      )}
                      
                      <div className="form-group">
                        <label>電子信箱</label>
                        <input
                          type="email"
                          placeholder="Email Address"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>密碼</label>
                        <input
                          type="password"
                          placeholder="Password"
                          value={clientPass}
                          onChange={(e) => setClientPass(e.target.value)}
                          required
                        />
                      </div>

                      <button type="submit" className="btn-submit">
                        {clientAuthMode === 'login' ? '登入' : '註冊帳號'}
                      </button>
                    </form>

                    <button
                      className="btn-link"
                      onClick={() => setClientAuthMode(clientAuthMode === 'login' ? 'register' : 'login')}
                    >
                      {clientAuthMode === 'login' ? '尚未有帳號？點此註冊' : '已有帳號？點此登入'}
                    </button>

                    <div className="demo-account-box">
                      <h4>快速測試 Demo 帳號</h4>
                      <p>點選下方按鈕直接一鍵登入：</p>
                      <div className="demo-account-buttons">
                        <button
                          type="button"
                          className="demo-btn"
                          onClick={handleQuickClientLogin}
                        >
                          買家一鍵登入：小明
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Authenticated content */}
                  <div className="mobile-content">
                    
                    {/* Active tab routing */}
                    {clientActiveTab === 'explore' && (
                      <>
                        {/* Explore Header */}
                        <div className="mobile-home-header">
                          <div className="user-welcome">
                            <img src={clientUser?.avatar} alt="avatar" />
                            <div className="user-welcome-info">
                              <p>哈囉 👋</p>
                              <h3>{clientUser?.username}</h3>
                            </div>
                          </div>

                          <div className="credit-badge">
                            <Shield size={12} /> 信用分: {clientUser?.creditScore}
                          </div>
                        </div>

                        {/* Interactive SVG Radar Map */}
                        <div className="map-radar-wrapper">
                          <div className="radar-sweep" />
                          <svg className="map-svg" viewBox="0 0 200 200">
                            {/* Grid background */}
                            <circle cx="100" cy="100" r="30" className="map-ring" />
                            <circle cx="100" cy="100" r="60" className="map-ring" />
                            <circle cx="100" cy="100" r="90" className="map-ring" />
                            <line x1="100" y1="10" x2="100" y2="190" className="map-grid" />
                            <line x1="10" y1="100" x2="190" y2="100" className="map-grid" />

                            {/* User Position */}
                            <circle cx="100" cy="100" r="5" className="user-marker" />
                            <text x="100" y="115" fill="#3b82f6" fontSize="7" fontWeight="bold" textAnchor="middle">您的位置</text>

                            {/* Store Pins */}
                            {foods.map((food, i) => {
                              // Spread pins out randomly around the center for representation
                              // We seed offsets based on food ID to make them consistent
                              const angle = (food.storeId.charCodeAt(6) || 60) * 8;
                              const dist = 50 + (food.price % 30);
                              const px = 100 + Math.cos(angle * Math.PI / 180) * dist;
                              const py = 100 + Math.sin(angle * Math.PI / 180) * dist;

                              return (
                                <g key={food.id} className="store-pin" onClick={() => setSelectedFood(food)}>
                                  <circle cx={px} cy={py} r={6} className="store-pin-pulse" />
                                  <circle cx={px} cy={py} r={4} className="store-pin-circle" />
                                  <text x={px} y={py - 8} fill="#10b981" fontSize="6" fontWeight="bold" textAnchor="middle">
                                    {food.storeName.substring(0, 4)}..
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        {/* Search Bar */}
                        <div className="search-box">
                          <Search size={14} />
                          <input
                            type="text"
                            placeholder="搜尋商品或商家..."
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                          />
                        </div>

                        {/* Category filter pills */}
                        <div className="categories-container">
                          <button
                            className={`category-tab ${clientCategory === '' ? 'active' : ''}`}
                            onClick={() => setClientCategory('')}
                          >
                            全部剩食
                          </button>
                          {['便當', '麵包', '生鮮', '熟食'].map(cat => (
                            <button
                              key={cat}
                              className={`category-tab ${clientCategory === cat ? 'active' : ''}`}
                              onClick={() => setClientCategory(cat)}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>

                        {/* Foods List */}
                        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#9ca3af' }}>附近精選即期剩食</h4>
                        {foods.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#6b7280' }}>
                            <ShoppingBag size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                            <p style={{ fontSize: '0.8rem' }}>該範圍內目前沒有新上架的剩食</p>
                          </div>
                        ) : (
                          <div className="food-list">
                            {foods.map(food => (
                              <div key={food.id} className="food-card" onClick={() => setSelectedFood(food)}>
                                <img src={food.photoUrl} alt={food.name} className="food-card-img" onError={(e) => { (e.target as HTMLImageElement).src = getCategoryPlaceholder(food.category); }} />
                                <div className="food-card-info">
                                  <div className="food-card-title">{food.name}</div>
                                  <div className="food-card-store">
                                    <MapPin size={10} /> {food.storeName}
                                  </div>
                                  <div className="food-card-meta">
                                    <div className="food-card-price">
                                      <span className="original-price">${food.originalPrice}</span>
                                      <span className="discount-price">${food.price}</span>
                                    </div>
                                    <span className="food-card-badge badge-tag">
                                      庫存: {food.quantity}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Food Detail Modal / Panel */}
                    {selectedFood && (
                      <div className="detail-view">
                        <div className="detail-header-btn" onClick={() => setSelectedFood(null)}>
                          &larr; 返回列表
                        </div>
                        
                        <img src={selectedFood.photoUrl} alt={selectedFood.name} className="detail-img" onError={(e) => { (e.target as HTMLImageElement).src = getCategoryPlaceholder(selectedFood.category); }} />

                        <div className="detail-body">
                          <h2>{selectedFood.name}</h2>
                          
                          <div className="detail-store-row">
                            <span className="detail-store-name">{selectedFood.storeName}</span>
                            <span className="detail-store-rating">
                              <Star size={12} fill="#f59e0b" /> 4.8
                            </span>
                          </div>

                          <div className="detail-info-grid">
                            <div className="detail-info-item">
                              <div className="detail-info-label">原價 / 特惠剩食價</div>
                              <div className="detail-info-val discount">
                                <span style={{ textDecoration: 'line-through', fontSize: '0.75rem', color: '#6b7280', marginRight: '0.3rem' }}>
                                  ${selectedFood.originalPrice}
                                </span>
                                ${selectedFood.price}
                              </div>
                            </div>

                            <div className="detail-info-item">
                              <div className="detail-info-label">剩餘可用數量</div>
                              <div className="detail-info-val">{selectedFood.quantity} 個</div>
                            </div>

                            <div className="detail-info-item">
                              <div className="detail-info-label">可自取時間區間</div>
                              <div className="detail-info-val" style={{ fontSize: '0.75rem' }}>
                                {selectedFood.pickupStart} - {selectedFood.pickupEnd}
                              </div>
                            </div>

                            <div className="detail-info-item">
                              <div className="detail-info-label">下架截止剩餘</div>
                              <div className="detail-info-val" style={{ color: '#f59e0b', fontSize: '0.75rem' }}>
                                <Clock size={10} style={{ display: 'inline', marginRight: '2px' }} />
                                <TimeRemaining expiresAt={selectedFood.expiryTime} />
                              </div>
                            </div>
                          </div>

                          {selectedFood.allergens.length > 0 && (
                            <div>
                              <div className="detail-info-label">包含過敏原標示</div>
                              <div className="detail-allergens">
                                {selectedFood.allergens.map(a => (
                                  <span key={a} className="allergen-pill">{a}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="quantity-selector">
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>預訂數量</span>
                            <div className="qty-control">
                              <button
                                className="qty-btn"
                                onClick={() => setQtyToBook(Math.max(1, qtyToBook - 1))}
                              >
                                -
                              </button>
                              <span style={{ fontWeight: 700 }}>{qtyToBook}</span>
                              <button
                                className="qty-btn"
                                onClick={() => setQtyToBook(Math.min(selectedFood.quantity, qtyToBook + 1))}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <button className="btn-submit" style={{ width: '100%' }} onClick={triggerBookOrder}>
                            一鍵搶購預訂 (保留15分鐘)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bookings & Orders Tab */}
                    {clientActiveTab === 'orders' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid #1a2620', paddingBottom: '0.5rem' }}>
                          我的剩食預訂庫
                        </h3>

                        {clientOrders.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
                            <Clock size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                            <p style={{ fontSize: '0.8rem' }}>目前尚無預訂中的剩食訂單</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {clientOrders.map(order => (
                              <div key={order.id} className="order-reserved-box">
                                <div style={{ display: 'flex', width: '100%', gap: '0.75rem', textAlign: 'left' }}>
                                  <img src={order.foodPhoto} alt={order.foodName} style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = getCategoryPlaceholder(''); }} />
                                  <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700 }}>{order.foodName} x {order.quantity}</h4>
                                    <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{order.storeName}</p>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.15rem' }}>總價: ${order.totalPrice}</p>
                                  </div>
                                  <div>
                                    {order.status === 'reserved' && (
                                      <span className="status-badge connected" style={{ fontSize: '0.65rem' }}>已保留</span>
                                    )}
                                    {order.status === 'pending_payment' && (
                                      <span className="status-badge" style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: '#f59e0b' }}>待付款</span>
                                    )}
                                    {order.status === 'claimed' && (
                                      <span className="status-badge" style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderColor: '#60a5fa' }}>已取貨</span>
                                    )}
                                    {order.status === 'cancelled' && (
                                      <span className="status-badge" style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: '#ef4444' }}>已取消</span>
                                    )}
                                  </div>
                                </div>

                                {/* Timer & Code for Reserved/Pending states */}
                                {(order.status === 'reserved' || order.status === 'pending_payment') && (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'center' }}>
                                      <div className="countdown-timer-circle">
                                        <span className="countdown-time-val">
                                          <TimeRemaining expiresAt={order.expiresAt} />
                                        </span>
                                        <span className="countdown-time-label">保留時間</span>
                                      </div>

                                      <div className="order-pickup-code-box">
                                        <div className="order-pickup-label">線下核銷取貨碼</div>
                                        <div className="order-pickup-code">{order.pickupCode}</div>
                                      </div>
                                    </div>

                                    {/* Mock QR Code */}
                                    <div className="qr-code-placeholder">
                                      <div className="qr-scan-line" />
                                    </div>

                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                      取貨地址：{order.storeAddress}
                                    </div>
                                  </>
                                )}

                                {/* Buttons based on status */}
                                {order.status === 'pending_payment' && (
                                  <button
                                    className="btn-submit"
                                    style={{ width: '100%' }}
                                    onClick={() => payForOrder(order.id)}
                                  >
                                    線上模擬信用卡付款 (${order.totalPrice})
                                  </button>
                                )}

                                {order.status === 'claimed' && (
                                  <div style={{ width: '100%' }}>
                                    <button
                                      className="btn-submit"
                                      style={{ width: '100%', background: '#3b82f6', color: '#fff' }}
                                      onClick={() => setRatingOrder(order)}
                                    >
                                      給予這次美味剩食評價
                                    </button>
                                  </div>
                                )}

                                {(order.status === 'reserved' || order.status === 'pending_payment') && (
                                  <button
                                    className="action-btn-danger"
                                    style={{ width: '100%', padding: '0.5rem' }}
                                    onClick={() => cancelOrder(order.id)}
                                  >
                                    放棄預訂 (取消保留)
                                  </button>
                                )}

                                {order.status === 'cancelled' && (
                                  <button
                                    className="btn-submit"
                                    style={{ width: '100%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', margin: '0.5rem 0 0 0' }}
                                    onClick={() => setClientActiveTab('explore')}
                                  >
                                    回到首頁瀏覽剩食
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ratings Form Popover */}
                    {ratingOrder && (
                      <div className="payment-modal-overlay">
                        <div className="payment-modal">
                          <h4>美味剩食與店家評分</h4>
                          <form onSubmit={submitRating} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <div className="form-group">
                              <label>剩食品質 (1 - 5 星)</label>
                              <div className="star-rating-row">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <button
                                    key={star}
                                    type="button"
                                    className={`star-rating-btn ${qualityRating >= star ? 'active' : ''}`}
                                    onClick={() => setQualityRating(star)}
                                  >
                                    <Star size={18} fill={qualityRating >= star ? '#f59e0b' : 'none'} />
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="form-group">
                              <label>商家親切度 (1 - 5 星)</label>
                              <div className="star-rating-row">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <button
                                    key={star}
                                    type="button"
                                    className={`star-rating-btn ${storeRating >= star ? 'active' : ''}`}
                                    onClick={() => setStoreRating(star)}
                                  >
                                    <Star size={18} fill={storeRating >= star ? '#f59e0b' : 'none'} />
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="form-group">
                              <label>留下評語</label>
                              <textarea
                                rows={2}
                                placeholder="分享您的環保心得..."
                                value={ratingComment}
                                onChange={(e) => setRatingComment(e.target.value)}
                              />
                            </div>

                            <div className="payment-modal-buttons">
                              <button type="button" className="btn-cancel" onClick={() => setRatingOrder(null)}>
                                取消
                              </button>
                              <button type="submit" className="btn-submit" style={{ margin: 0 }}>
                                提交評價
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Profile & Sustainability Dashboard */}
                    {clientActiveTab === 'profile' && (
                      <div>
                        <div className="user-profile-header">
                          <img src={clientUser?.avatar} alt="avatar" />
                          <h3>{clientUser?.username}</h3>
                          <div className="status-badge connected" style={{ fontSize: '0.65rem' }}>
                            綠色守護者身份
                          </div>
                        </div>

                        {/* Gamified carbon/eco stats */}
                        {clientStats && (
                          <div className="ecological-stats-box">
                            <h4>
                              <Sparkles size={14} /> 拯救剩食環保成就徽章
                            </h4>

                            <div className="eco-progress-row">
                              <div className="eco-progress-label">
                                <span>成功拯救剩食次數</span>
                                <span>{clientStats.claimedCount} 次 ({clientStats.totalItems} 件)</span>
                              </div>
                              <div className="eco-progress-bar">
                                <div className="eco-progress-fill" style={{ width: `${Math.min(100, clientStats.claimedCount * 10)}%` }} />
                              </div>
                            </div>

                            <div className="eco-progress-row">
                              <div className="eco-progress-label">
                                <span>減少二氧化碳排放量</span>
                                <span>{clientStats.co2OffsetKg} 公斤 CO2</span>
                              </div>
                              <div className="eco-progress-bar">
                                <div className="eco-progress-fill" style={{ width: `${Math.min(100, clientStats.co2OffsetKg * 5)}%`, background: 'linear-gradient(90deg, #10b981, #06b6d4)' }} />
                              </div>
                            </div>

                            <div className="eco-progress-row">
                              <div className="eco-progress-label">
                                <span>省下虛擬水足跡量</span>
                                <span>{clientStats.waterSavedLiters} 公升</span>
                              </div>
                              <div className="eco-progress-bar">
                                <div className="eco-progress-fill" style={{ width: `${Math.min(100, clientStats.waterSavedLiters / 5)}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>累積拯救食物</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981', marginTop: '0.15rem' }}>
                                  {clientStats.foodSavedKg} <span style={{ fontSize: '0.7rem' }}>公斤</span>
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>信用分數</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.15rem' }}>
                                  {clientStats.creditScore} <span style={{ fontSize: '0.7rem' }}>分</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Notifications List */}
                        <div className="notifications-panel">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700 }}>系統即時通知</h4>
                            <button
                              style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={markNotificationsAsRead}
                            >
                              全部標記已讀
                            </button>
                          </div>

                          {clientNotifications.length === 0 ? (
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>暫無系統通知</p>
                          ) : (
                            clientNotifications.map(n => (
                              <div key={n.id} className={`notification-item ${!n.read ? 'unread' : ''}`}>
                                <div style={{ fontWeight: 600 }}>{n.title}</div>
                                <div style={{ color: '#9ca3af', marginTop: '0.15rem' }}>{n.message}</div>
                                <div className="notification-item-time">
                                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <button className="action-btn-danger" style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={handleClientLogout}>
                          <LogOut size={14} /> 登出買家帳號
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Mobile Footer Buttons */}
                  <footer className="mobile-footer">
                    <button
                      className={`mobile-nav-item ${clientActiveTab === 'explore' ? 'active' : ''}`}
                      onClick={() => setClientActiveTab('explore')}
                    >
                      <Compass size={18} />
                      探索剩食
                    </button>
                    <button
                      className={`mobile-nav-item ${clientActiveTab === 'orders' ? 'active' : ''}`}
                      onClick={() => setClientActiveTab('orders')}
                    >
                      <ShoppingBag size={18} />
                      我的預訂
                    </button>
                    <button
                      className={`mobile-nav-item ${clientActiveTab === 'profile' ? 'active' : ''}`}
                      onClick={() => setClientActiveTab('profile')}
                    >
                      <User size={18} />
                      環保帳戶
                    </button>
                  </footer>
                </>
              )}

            </div>
          </div>
        </div>

        {/* ========================================================
            RIGHT SIDE: B2B WEB DASHBOARD (Store/Seller Side)
           ======================================================== */}
        <div className={`dashboard-panel ${splitViewTab === 'merchant' ? 'active' : ''}`}>
          <div className="dashboard-title">
            <Shield size={26} style={{ color: '#10b981' }} />
            {merchantStore ? merchantStore.name : '商家管理控制台'}
            {merchantStore && (
              <span className="status-badge connected" style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>
                商家帳號驗證通過
              </span>
            )}
          </div>

          {!merchantToken ? (
            <div className="auth-container" style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
              <div className="auth-header-desc">
                <h2>商家剩食管理上架平台</h2>
                <p>三步驟快速上架剩食，減少浪費、觸及更多客戶！</p>
              </div>

              <form onSubmit={handleMerchantLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {merchantAuthMode === 'register' && (
                  <>
                    <div className="form-group">
                      <label>負責人姓名</label>
                      <input
                        type="text"
                        placeholder="例如：王小明"
                        value={merchantRegName}
                        onChange={(e) => setMerchantRegName(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>店家名稱</label>
                      <input
                        type="text"
                        placeholder="例如：好丘貝果大安店"
                        value={merchantRegStoreName}
                        onChange={(e) => setMerchantRegStoreName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>店家地址 (GPS 將以此為基準定位)</label>
                      <input
                        type="text"
                        value={merchantRegAddress}
                        onChange={(e) => setMerchantRegAddress(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>電子信箱</label>
                  <input
                    type="email"
                    placeholder="store@foodsave.com"
                    value={merchantEmail}
                    onChange={(e) => setMerchantEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>密碼</label>
                  <input
                    type="password"
                    placeholder="password123"
                    value={merchantPass}
                    onChange={(e) => setMerchantPass(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-submit">
                  {merchantAuthMode === 'login' ? '商家登入' : '註冊為綠色商店'}
                </button>
              </form>

              <button
                className="btn-link"
                onClick={() => setMerchantAuthMode(merchantAuthMode === 'login' ? 'register' : 'login')}
              >
                {merchantAuthMode === 'login' ? '沒有商家帳號？點此註冊' : '已有商家帳號？點此登入'}
              </button>

              <div className="demo-account-box">
                <h4>快速測試 Demo 帳號</h4>
                <p>點選下方按鈕直接一鍵登入：</p>
                <div className="demo-account-buttons">
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={handleQuickMerchantLogin}
                  >
                    商家一鍵登入：好丘貝果大安店
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="merchant-grid">
              {/* Sidebar */}
              <aside className="merchant-sidebar">
                <button
                  className={`merchant-nav-btn ${merchantTab === 'listings' ? 'active' : ''}`}
                  onClick={() => setMerchantTab('listings')}
                >
                  <Plus size={16} /> 剩食上架與清單
                </button>
                
                <button
                  className={`merchant-nav-btn ${merchantTab === 'orders' ? 'active' : ''}`}
                  onClick={() => setMerchantTab('orders')}
                >
                  <ShoppingBag size={16} />
                  顧客預訂核銷 ({merchantOrders.filter(o => o.status === 'reserved').length})
                </button>

                <button
                  className={`merchant-nav-btn ${merchantTab === 'reviews' ? 'active' : ''}`}
                  onClick={() => setMerchantTab('reviews')}
                >
                  <Star size={16} />
                  顧客美味評價
                </button>

                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    目前店舖評分: <span style={{ color: '#f59e0b', fontWeight: 700 }}><Star size={12} style={{ display: 'inline', verticalAlign: 'text-top' }} fill="#f59e0b" /> {merchantStore?.rating}</span> ({merchantStore?.reviewCount} 則評價)
                  </div>
                  <button
                    className="action-btn-danger"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                    onClick={handleMerchantLogout}
                  >
                    <LogOut size={14} /> 登出商家系統
                  </button>
                </div>
              </aside>

              {/* Main content area */}
              <section className="merchant-content-area">
                
                {/* 1. Listings & Add food tab */}
                {merchantTab === 'listings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Stats Dashboard */}
                    {merchantStats && (
                      <div className="stats-cards-grid">
                        <div className="stats-card">
                          <span className="stats-card-label">累計拯救剩食餐點</span>
                          <span className="stats-card-val">{merchantStats.claimedCount} 次</span>
                        </div>
                        <div className="stats-card">
                          <span className="stats-card-label">累計減碳排放量</span>
                          <span className="stats-card-val" style={{ color: '#3b82f6' }}>{merchantStats.co2OffsetKg} kg</span>
                        </div>
                        <div className="stats-card">
                          <span className="stats-card-label">節約水資源水足跡</span>
                          <span className="stats-card-val" style={{ color: '#60a5fa' }}>{merchantStats.waterSavedLiters} L</span>
                        </div>
                      </div>
                    )}

                    {/* Upload Form */}
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', borderRadius: '12px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Sparkles size={16} /> 快速上架即期剩食
                      </h3>
                      
                      <form onSubmit={handleCreateFood} className="merchant-upload-form">
                        <div className="form-group">
                          <label>食物商品名稱</label>
                          <input
                            type="text"
                            placeholder="例如：明太子法國麵包 (3入)"
                            value={newFoodName}
                            onChange={(e) => setNewFoodName(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>食物分類</label>
                          <select
                            value={newFoodCategory}
                            onChange={(e) => setNewFoodCategory(e.target.value as any)}
                          >
                            <option value="麵包">麵包 / 點心</option>
                            <option value="便當">便當 / 主食</option>
                            <option value="生鮮">生鮮 / 食材</option>
                            <option value="熟食">熟食 / 小吃</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>原價 ($ TWD)</label>
                          <input
                            type="number"
                            placeholder="120"
                            value={newFoodOrigPrice}
                            onChange={(e) => setNewFoodOrigPrice(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>剩食特惠價 ($ TWD)</label>
                          <input
                            type="number"
                            placeholder="45"
                            value={newFoodPrice}
                            onChange={(e) => setNewFoodPrice(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>上架份數 (庫存)</label>
                          <input
                            type="number"
                            placeholder="5"
                            value={newFoodQty}
                            onChange={(e) => setNewFoodQty(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>倒數下架時間 (分鐘)</label>
                          <input
                            type="number"
                            placeholder="180"
                            value={newFoodExpiry}
                            onChange={(e) => setNewFoodExpiry(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>自取開始時間</label>
                          <input
                            type="text"
                            placeholder="18:00"
                            value={newFoodPickupStart}
                            onChange={(e) => setNewFoodPickupStart(e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label>自取結束時間</label>
                          <input
                            type="text"
                            placeholder="21:30"
                            value={newFoodPickupEnd}
                            onChange={(e) => setNewFoodPickupEnd(e.target.value)}
                          />
                        </div>

                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                          <label>照片 URL (選填，留空將使用分類預設圖)</label>
                          <input
                            type="text"
                            placeholder="https://..."
                            value={newFoodPhoto}
                            onChange={(e) => setNewFoodPhoto(e.target.value)}
                          />
                        </div>

                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                          <label>包含過敏原標示 (複選)</label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                            {['麥麩', '奶類', '蛋類', '花生', '大豆', '芝麻', '海鮮'].map(allg => (
                              <button
                                key={allg}
                                type="button"
                                className={`category-tab ${newFoodAllergens.includes(allg) ? 'active' : ''}`}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                                onClick={() => toggleAllergen(allg)}
                              >
                                {allg}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="btn-submit"
                          style={{ gridColumn: 'span 2', margin: 0 }}
                        >
                          立即發佈上架 (系統將主動發送推播給附近居民)
                        </button>
                      </form>
                    </div>

                    {/* Active Listings Table */}
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>本店當前上架剩食</h3>
                      <div className="dashboard-table-container">
                        <table className="dashboard-table listings-table">
                          <thead>
                            <tr>
                              <th>商品照片</th>
                              <th>食物名稱</th>
                              <th>分類</th>
                              <th>剩餘數量</th>
                              <th>特惠價 / 原價</th>
                              <th>到期剩餘時間</th>
                              <th>狀態</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {merchantListings.length === 0 ? (
                              <tr>
                                <td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                                  本店目前沒有正在架上的剩食，請使用上方表單快速上架。
                                </td>
                              </tr>
                            ) : (
                              merchantListings.map(item => (
                                <tr key={item.id}>
                                  <td>
                                    <img src={item.photoUrl} alt={item.name} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = getCategoryPlaceholder(item.category); }} />
                                  </td>
                                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                                  <td>{item.category}</td>
                                  <td>{item.quantity} 件</td>
                                  <td>
                                    <span style={{ color: '#10b981', fontWeight: 700 }}>${item.price}</span>
                                    <span style={{ textDecoration: 'line-through', color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.3rem' }}>
                                      ${item.originalPrice}
                                    </span>
                                  </td>
                                  <td style={{ color: '#f59e0b' }}>
                                    <TimeRemaining expiresAt={item.expiryTime} />
                                  </td>
                                  <td>
                                    <span className={`status-indicator ${item.status}`}>
                                      {item.status === 'available' ? '銷售中' : item.status === 'reserved' ? '已預訂' : item.status === 'claimed' ? '已取貨' : '已過期'}
                                    </span>
                                  </td>
                                  <td>
                                    <button className="action-btn-danger" onClick={() => handleDeleteFood(item.id)}>
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Customer Bookings & Verification tab */}
                {merchantTab === 'orders' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>顧客剩食預訂核銷櫃台</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      顧客在一鍵預訂後，有 15 分鐘前來本店取貨核銷。請核對顧客出示的手機 6 位數取貨碼。
                    </p>

                    <div className="dashboard-table-container">
                      <table className="dashboard-table orders-table">
                        <thead>
                          <tr>
                            <th>訂單編號</th>
                            <th>預訂商品</th>
                            <th>數量</th>
                            <th>訂單總金額</th>
                            <th>顧客姓名</th>
                            <th>顧客信用分</th>
                            <th>狀態</th>
                            <th>操作 / 核銷</th>
                          </tr>
                        </thead>
                        <tbody>
                          {merchantOrders.length === 0 ? (
                            <tr>
                              <td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                                目前沒有顧客預訂任何商品。
                              </td>
                            </tr>
                          ) : (
                            merchantOrders.map(order => (
                              <tr key={order.id}>
                                <td>#{order.id}</td>
                                <td style={{ fontWeight: 600 }}>{order.foodName}</td>
                                <td>{order.quantity} 件</td>
                                <td style={{ fontWeight: 700, color: '#10b981' }}>${order.totalPrice}</td>
                                <td>{order.buyerName}</td>
                                <td>
                                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>100 分</span>
                                </td>
                                <td>
                                  <span className={`status-indicator ${order.status}`}>
                                    {order.status === 'reserved' ? '等待取貨' : order.status === 'pending_payment' ? '待付款' : order.status === 'claimed' ? '已核銷完成' : '已取消/逾期'}
                                  </span>
                                </td>
                                <td>
                                  {order.status === 'reserved' ? (
                                    <button
                                      className="btn-submit"
                                      style={{ margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                      onClick={() => {
                                        setNuclearOrder(order);
                                        setEnteredPickupCode('');
                                        setPickupVerifyError(null);
                                      }}
                                    >
                                      <QrCode size={12} /> 掃碼驗證核銷
                                    </button>
                                  ) : (
                                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>無操作</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Nuclear verification Code dialog popover */}
                {nuclearOrder && (
                  <div className="payment-modal-overlay">
                    <div className="payment-modal" style={{ maxWidth: '360px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4>線下取貨掃碼驗證</h4>
                        <button style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }} onClick={() => setNuclearOrder(null)}>
                          <X size={16} />
                        </button>
                      </div>
                      
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        請核對買家「{nuclearOrder.buyerName}」出示的 6 位數取貨密碼。
                      </p>

                      <form onSubmit={verifyPickupCode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group">
                          <label>輸入買家手機上的 6 位數取貨碼</label>
                          <input
                            type="text"
                            placeholder="例如：682910"
                            maxLength={6}
                            value={enteredPickupCode}
                            onChange={(e) => setEnteredPickupCode(e.target.value)}
                            style={{ fontSize: '1.5rem', letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }}
                            required
                            autoFocus
                          />
                        </div>

                        {pickupVerifyError && (
                          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <AlertTriangle size={14} /> {pickupVerifyError}
                          </div>
                        )}

                        <div className="payment-modal-buttons">
                          <button type="button" className="btn-cancel" onClick={() => setNuclearOrder(null)}>
                            取消
                          </button>
                          <button type="submit" className="btn-submit" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            <Check size={14} /> 確認核銷領取
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* 3. Customer Reviews Tab */}
                {merchantTab === 'reviews' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>顧客對本店剩食的美味回饋</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      顧客完成取貨後給予的星級評分與評價內容，我們將依此維持剩食共享平台的高信任度。
                    </p>

                    {/* Simulated reviews database queries */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>剩食終結者 小明</span>
                          <span style={{ color: '#f59e0b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                            <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> 5.0
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#f3f4f6' }}>「貝果加熱後非常香軟，完全不像即期剩食！下次一定會再搶購，愛心環保又省錢！」</p>
                        <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          品項：手作起司香草貝果 | 2026-07-01 19:15
                        </div>
                      </div>
                      
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>綠色小幫手 麗雅</span>
                          <span style={{ color: '#f59e0b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                            <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} fill="#f59e0b" /> <Star size={12} style={{ color: '#6b7280' }} /> 4.0
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#f3f4f6' }}>「豬肉便當份量很夠，包裝完整，老闆態度很親切，支持減碳綠色生活！」</p>
                        <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          品項：煙燻起司豬肉便當 | 2026-06-30 20:30
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </section>
            </div>
          )}
        </div>

      </main>

      {/* 4. One-click booking payment selection dialog (Client side) */}
      {paymentModalOrder && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <h4>選擇預訂付款方式</h4>
            
            <div
              className={`payment-option ${selectedPaymentMethod === 'online' ? 'selected' : ''}`}
              onClick={() => setSelectedPaymentMethod('online')}
            >
              <CreditCard size={18} style={{ color: '#10b981' }} />
              <div className="payment-option-info">
                <span className="payment-option-title">線上信用卡/行動支付</span>
                <span className="payment-option-desc">預先扣款授權，享極速退款</span>
              </div>
            </div>

            <div
              className={`payment-option ${selectedPaymentMethod === 'cash' ? 'selected' : ''}`}
              onClick={() => setSelectedPaymentMethod('cash')}
            >
              <ShoppingBag size={18} style={{ color: '#3b82f6' }} />
              <div className="payment-option-info">
                <span className="payment-option-title">現場取貨付款 (店家支付)</span>
                <span className="payment-option-desc">信用分高於 80 分可用</span>
              </div>
            </div>

            <div className="payment-modal-buttons">
              <button className="btn-cancel" onClick={() => setPaymentModalOrder(null)}>
                取消
              </button>
              <button className="btn-submit" style={{ margin: 0 }} onClick={confirmBookOrder}>
                確認搶購預訂
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
