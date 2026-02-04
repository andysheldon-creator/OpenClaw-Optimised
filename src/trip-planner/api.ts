/**
 * 旅遊行程規劃 API 端點
 */

import { Router, Request, Response } from "express";
import type { Trip, Itinerary, Location, TripShare, PlaceReview, WeatherData } from "./types";

export function createTripPlannerRouter(): Router {
  const router = Router();

  // ============ 行程管理 ============

  /**
   * POST /trips - 建立新行程
   */
  router.post("/trips", async (req: Request, res: Response) => {
    try {
      const { title, description, startDate, endDate, userId } = req.body;

      const trip: Trip = {
        id: crypto.randomUUID(),
        userId,
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        locations: [],
        itineraries: [],
        sharedWith: [],
        totalBudget: 0,
        spentBudget: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: 存儲到數據庫
      res.status(201).json(trip);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * GET /trips/:tripId - 獲取行程詳情
   */
  router.get("/trips/:tripId", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      // TODO: 從數據庫獲取
      res.json({ message: `Getting trip ${tripId}` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * PUT /trips/:tripId - 更新行程
   */
  router.put("/trips/:tripId", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      // TODO: 更新到數據庫
      res.json({ message: `Updated trip ${tripId}` });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * DELETE /trips/:tripId - 刪除行程
   */
  router.delete("/trips/:tripId", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      // TODO: 刪除數據庫記錄
      res.json({ message: `Deleted trip ${tripId}` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============ 地點管理 ============

  /**
   * POST /trips/:tripId/locations - 新增地點
   */
  router.post("/trips/:tripId/locations", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      const { name, latitude, longitude, address, placeId } = req.body;

      const location: Location = {
        id: crypto.randomUUID(),
        name,
        latitude,
        longitude,
        address,
        placeId,
      };

      // TODO: 存儲到數據庫
      res.status(201).json(location);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * DELETE /trips/:tripId/locations/:locationId - 刪除地點
   */
  router.delete("/trips/:tripId/locations/:locationId", async (req: Request, res: Response) => {
    try {
      const { tripId, locationId } = req.params;
      // TODO: 刪除地點
      res.json({ message: `Deleted location ${locationId}` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============ 行程詳情 ============

  /**
   * POST /trips/:tripId/itineraries - 新增行程詳情
   */
  router.post("/trips/:tripId/itineraries", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      const { locationId, startTime, endTime, order, budget, notes } = req.body;

      const itinerary: Itinerary = {
        id: crypto.randomUUID(),
        tripId,
        locationId,
        order,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        budget,
        notes,
        photos: [],
      };

      // TODO: 存儲到數據庫
      res.status(201).json(itinerary);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * PUT /itineraries/:itineraryId - 更新行程詳情
   */
  router.put("/itineraries/:itineraryId", async (req: Request, res: Response) => {
    try {
      const { itineraryId } = req.params;
      // TODO: 更新行程詳情
      res.json({ message: `Updated itinerary ${itineraryId}` });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // ============ 預算管理 ============

  /**
   * GET /trips/:tripId/budget - 獲取預算統計
   */
  router.get("/trips/:tripId/budget", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      // TODO: 計算預算統計
      res.json({
        tripId,
        totalBudget: 0,
        spentBudget: 0,
        remaining: 0,
        byCategory: {},
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============ 行程共享 ============

  /**
   * POST /trips/:tripId/share - 分享行程
   */
  router.post("/trips/:tripId/share", async (req: Request, res: Response) => {
    try {
      const { tripId } = req.params;
      const { userId, permission = "view" } = req.body;

      const share: TripShare = {
        id: crypto.randomUUID(),
        tripId,
        sharedBy: req.headers["x-user-id"] as string,
        sharedWith: userId,
        permission,
        createdAt: new Date(),
      };

      // TODO: 存儲分享記錄
      res.status(201).json(share);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * DELETE /trips/:tripId/share/:userId - 取消分享
   */
  router.delete("/trips/:tripId/share/:userId", async (req: Request, res: Response) => {
    try {
      const { tripId, userId } = req.params;
      // TODO: 刪除分享記錄
      res.json({ message: `Revoked share for user ${userId}` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============ 天氣 ============

  /**
   * GET /weather - 獲取天氣預報
   * Query: location, date
   */
  router.get("/weather", async (req: Request, res: Response) => {
    try {
      const { location, date } = req.query;
      // TODO: 集成天氣 API（OpenWeatherMap、WeatherAPI 等）
      res.json({
        location,
        date,
        temperature: 25,
        condition: "晴",
        humidity: 60,
        windSpeed: 10,
      } as WeatherData);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============ 景點評分 ============

  /**
   * POST /locations/:locationId/reviews - 新增評論
   */
  router.post("/locations/:locationId/reviews", async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const { rating, comment } = req.body;

      const review: PlaceReview = {
        id: crypto.randomUUID(),
        locationId,
        userId: req.headers["x-user-id"] as string,
        rating,
        comment,
        createdAt: new Date(),
      };

      // TODO: 存儲評論
      res.status(201).json(review);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  /**
   * GET /locations/:locationId/reviews - 獲取評論
   */
  router.get("/locations/:locationId/reviews", async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      // TODO: 從數據庫獲取評論
      res.json({
        locationId,
        reviews: [],
        averageRating: 0,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}

export default createTripPlannerRouter;
