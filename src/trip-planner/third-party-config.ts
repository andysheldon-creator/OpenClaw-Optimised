/**
 * 第三方服務集成配置
 */

/**
 * 谷歌地圖集成
 * - 用於：地點顯示、地圖導航、距離計算
 * API: Google Maps API, Google Places API
 * 文檔: https://developers.google.com/maps/documentation
 */
export const GOOGLE_MAPS_CONFIG = {
  apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY || "",
  features: ["map", "places", "directions", "geocoding"],
};

/**
 * 天氣 API 集成
 * - 用於：天氣預報、溫度、濕度、風速
 * API: OpenWeatherMap 或 WeatherAPI
 * 文檔: https://openweathermap.org/api 或 https://www.weatherapi.com/
 */
export const WEATHER_API_CONFIG = {
  provider: "openweathermap", // 或 'weatherapi'
  apiKey: process.env.WEATHER_API_KEY || "",
  units: "metric", // 攝氏度
};

/**
 * 用戶身份驗證（Firebase 或 Auth0）
 * - 用於：用戶登錄、身份驗證、會話管理
 */
export const AUTH_CONFIG = {
  provider: process.env.AUTH_PROVIDER || "firebase", // 'firebase' 或 'auth0'
  firebaseConfig: {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
  },
  auth0Config: {
    domain: process.env.AUTH0_DOMAIN || "",
    clientId: process.env.AUTH0_CLIENT_ID || "",
  },
};

/**
 * 數據庫配置
 * - 用於：存儲行程、地點、用戶數據
 */
export const DATABASE_CONFIG = {
  provider: process.env.DB_PROVIDER || "postgresql", // postgresql、mongodb 等
  url: process.env.DATABASE_URL || "",
  ssl: process.env.DATABASE_SSL === "true",
};

/**
 * 文件存儲配置
 * - 用於：存儲照片、文件
 */
export const STORAGE_CONFIG = {
  provider: process.env.STORAGE_PROVIDER || "s3", // s3、firebase、azure
  s3: {
    region: process.env.AWS_REGION || "us-east-1",
    bucket: process.env.AWS_S3_BUCKET || "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  firebase: {
    bucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  },
};

/**
 * 通知服務配置
 * - 用於：推送通知、郵件通知
 */
export const NOTIFICATION_CONFIG = {
  fcm: {
    serverKey: process.env.FCM_SERVER_KEY || "",
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || "sendgrid", // sendgrid、mailgun
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  },
};

/**
 * 支付集成配置
 * - 用於：付款功能（如高級功能）
 */
export const PAYMENT_CONFIG = {
  provider: process.env.PAYMENT_PROVIDER || "stripe",
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    secretKey: process.env.STRIPE_SECRET_KEY || "",
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  },
};

export default {
  GOOGLE_MAPS_CONFIG,
  WEATHER_API_CONFIG,
  AUTH_CONFIG,
  DATABASE_CONFIG,
  STORAGE_CONFIG,
  NOTIFICATION_CONFIG,
  PAYMENT_CONFIG,
};
