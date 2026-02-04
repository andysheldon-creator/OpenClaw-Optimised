/**
 * 旅遊行程規劃共享類型
 */

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string; // Google Maps Place ID
  rating?: number;
  photoUrl?: string;
}

export interface Transportation {
  id: string;
  type: "walking" | "driving" | "public_transit" | "cycling";
  duration: number; // 分鐘
  distance?: number; // 公里
  cost?: number; // 台幣
  notes?: string;
}

export interface Itinerary {
  id: string;
  tripId: string;
  locationId: string;
  order: number;
  startTime: Date;
  endTime: Date;
  transportation?: Transportation;
  notes?: string;
  budget?: number; // 預算
  photos?: string[]; // 照片 URL
}

export interface WeatherData {
  location: string;
  date: Date;
  temperature: number;
  condition: string; // 晴/陰/雨等
  humidity: number;
  windSpeed: number;
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  locations: Location[];
  itineraries: Itinerary[];
  sharedWith: string[]; // 分享對象用戶 ID
  totalBudget: number;
  spentBudget: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TripShare {
  id: string;
  tripId: string;
  sharedBy: string;
  sharedWith: string;
  permission: "view" | "edit";
  createdAt: Date;
}

export interface PlaceReview {
  id: string;
  locationId: string;
  userId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}
