-- FoodSave SQL Database Schema (For Supabase / Neon / Local PostgreSQL)
-- Copy and paste this script into the Supabase SQL Editor and run it.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "users" (
  "id" VARCHAR(50) PRIMARY KEY,
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "username" VARCHAR(100) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "role" VARCHAR(20) NOT NULL CHECK ("role" IN ('user', 'store')),
  "creditScore" INT DEFAULT 100,
  "avatar" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Stores Table
CREATE TABLE IF NOT EXISTS "stores" (
  "id" VARCHAR(50) PRIMARY KEY,
  "userId" VARCHAR(50) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "logo" TEXT,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "phone" VARCHAR(50),
  "description" TEXT,
  "rating" NUMERIC(3, 2) DEFAULT 5.0,
  "reviewCount" INT DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Foods Table
CREATE TABLE IF NOT EXISTS "foods" (
  "id" VARCHAR(50) PRIMARY KEY,
  "storeId" VARCHAR(50) NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "category" VARCHAR(50) NOT NULL CHECK ("category" IN ('便當', '麵包', '生鮮', '熟食')),
  "originalPrice" NUMERIC(10, 2) NOT NULL,
  "price" NUMERIC(10, 2) NOT NULL,
  "quantity" INT NOT NULL,
  "expiryTime" TIMESTAMP WITH TIME ZONE NOT NULL,
  "pickupStart" VARCHAR(10) NOT NULL,
  "pickupEnd" VARCHAR(10) NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "photoUrl" TEXT,
  "allergens" TEXT[] DEFAULT '{}',
  "status" VARCHAR(20) NOT NULL CHECK ("status" IN ('available', 'reserved', 'claimed', 'expired')),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS "orders" (
  "id" VARCHAR(50) PRIMARY KEY,
  "foodId" VARCHAR(50) NOT NULL REFERENCES "foods"("id") ON DELETE CASCADE,
  "storeId" VARCHAR(50) NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "buyerId" VARCHAR(50) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quantity" INT NOT NULL,
  "totalPrice" NUMERIC(10, 2) NOT NULL,
  "status" VARCHAR(30) NOT NULL CHECK ("status" IN ('pending_payment', 'reserved', 'claimed', 'cancelled')),
  "pickupCode" VARCHAR(10) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 5. Ratings Table
CREATE TABLE IF NOT EXISTS "ratings" (
  "id" VARCHAR(50) PRIMARY KEY,
  "orderId" VARCHAR(50) NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "foodId" VARCHAR(50) NOT NULL REFERENCES "foods"("id") ON DELETE CASCADE,
  "storeId" VARCHAR(50) NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "buyerId" VARCHAR(50) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "qualityRating" INT NOT NULL CHECK ("qualityRating" BETWEEN 1 AND 5),
  "storeRating" INT NOT NULL CHECK ("storeRating" BETWEEN 1 AND 5),
  "comment" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Notifications Table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" VARCHAR(50) PRIMARY KEY,
  "userId" VARCHAR(50) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
