/**
 * 第三方服務集成實現
 */

import axios from "axios";
import { GOOGLE_MAPS_CONFIG, WEATHER_API_CONFIG } from "./third-party-config";

// ============ 谷歌地圖集成 ============

export class GoogleMapsService {
  private apiKey = GOOGLE_MAPS_CONFIG.apiKey;
  private placesApiKey = GOOGLE_MAPS_CONFIG.placesApiKey;
  private baseUrl = "https://maps.googleapis.com/maps/api";

  /**
   * 搜索地點
   */
  async searchPlaces(query: string, lat?: number, lng?: number) {
    try {
      const params = new URLSearchParams({
        query,
        key: this.placesApiKey,
      });

      if (lat && lng) {
        params.append("location", `${lat},${lng}`);
        params.append("radius", "50000"); // 50km 半徑
      }

      const response = await axios.get(`${this.baseUrl}/place/textsearch/json?${params}`);

      return response.data.results.map((result: any) => ({
        id: result.place_id,
        name: result.name,
        address: result.formatted_address,
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        rating: result.rating,
        photoUrl: result.photos?.[0]?.photo_reference,
      }));
    } catch (error) {
      console.error("Google Maps search error:", error);
      throw error;
    }
  }

  /**
   * 獲取路線信息
   */
  async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: "driving" | "walking" | "transit" | "bicycling" = "driving",
  ) {
    try {
      const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode,
        key: this.apiKey,
      });

      const response = await axios.get(`${this.baseUrl}/directions/json?${params}`);

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.text,
        duration: leg.duration.text,
        durationSeconds: leg.duration.value,
        polyline: route.overview_polyline.points,
      };
    } catch (error) {
      console.error("Google Maps directions error:", error);
      throw error;
    }
  }
}

// ============ 天氣 API 集成 ============

export class WeatherService {
  private provider = WEATHER_API_CONFIG.provider;
  private apiKey = WEATHER_API_CONFIG.apiKey;

  /**
   * 獲取天氣預報
   */
  async getWeatherForecast(latitude: number, longitude: number, date: Date) {
    if (this.provider === "openweathermap") {
      return this.getOpenWeatherForecast(latitude, longitude, date);
    } else if (this.provider === "weatherapi") {
      return this.getWeatherApiForecast(latitude, longitude, date);
    }
  }

  private async getOpenWeatherForecast(latitude: number, longitude: number, date: Date) {
    try {
      const response = await axios.get("https://api.openweathermap.org/data/2.5/forecast", {
        params: {
          lat: latitude,
          lon: longitude,
          units: "metric",
          appid: this.apiKey,
        },
      });

      const forecasts = response.data.list;
      const targetDate = new Date(date).toDateString();

      const forecast = forecasts.find(
        (f: any) => new Date(f.dt * 1000).toDateString() === targetDate,
      );

      return {
        temperature: forecast?.main.temp,
        condition: forecast?.weather[0].main,
        humidity: forecast?.main.humidity,
        windSpeed: forecast?.wind.speed,
        description: forecast?.weather[0].description,
      };
    } catch (error) {
      console.error("OpenWeatherMap error:", error);
      throw error;
    }
  }

  private async getWeatherApiForecast(latitude: number, longitude: number, date: Date) {
    try {
      const dateStr = date.toISOString().split("T")[0];
      const response = await axios.get("https://api.weatherapi.com/v1/forecast.json", {
        params: {
          key: this.apiKey,
          q: `${latitude},${longitude}`,
          dt: dateStr,
        },
      });

      const dayForecast = response.data.forecast.forecastday[0].day;

      return {
        temperature: dayForecast.avgtemp_c,
        condition: dayForecast.condition.text,
        humidity: dayForecast.avghumidity,
        windSpeed: dayForecast.maxwind_kph,
        description: dayForecast.condition.text,
      };
    } catch (error) {
      console.error("WeatherAPI error:", error);
      throw error;
    }
  }
}

// ============ 景點推薦引擎 ============

export class PlaceRecommendationEngine {
  private googleMaps = new GoogleMapsService();

  /**
   * 根據用戶偏好推薦景點
   */
  async recommendPlaces(
    latitude: number,
    longitude: number,
    preferences: {
      categories?: string[]; // 博物館、餐廳、公園等
      rating?: number; // 最低評分
      radius?: number; // 搜索半徑（公里）
    },
  ) {
    try {
      const categories = preferences.categories || ["tourist_attraction"];
      const recommendations: any[] = [];

      for (const category of categories) {
        const results = await this.googleMaps.searchPlaces(category);

        // 過濾評分
        const filtered = results.filter(
          (r: any) => !preferences.rating || r.rating >= preferences.rating,
        );

        recommendations.push(...filtered);
      }

      // 按評分排序
      return recommendations.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
    } catch (error) {
      console.error("Place recommendation error:", error);
      throw error;
    }
  }
}

// ============ 共享功能服務 ============

export class SharingService {
  /**
   * 生成行程分享鏈接
   */
  generateShareLink(tripId: string, token?: string): string {
    const baseUrl = process.env.APP_URL || "https://app.example.com";
    const query = new URLSearchParams({
      trip: tripId,
      ...(token && { token }),
    });
    return `${baseUrl}/shared?${query}`;
  }

  /**
   * 生成 QR 碼（用於快速共享）
   */
  generateQRCode(tripId: string): string {
    const shareLink = this.generateShareLink(tripId);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      shareLink,
    )}`;
    return qrUrl;
  }
}

export default {
  GoogleMapsService,
  WeatherService,
  PlaceRecommendationEngine,
  SharingService,
};
