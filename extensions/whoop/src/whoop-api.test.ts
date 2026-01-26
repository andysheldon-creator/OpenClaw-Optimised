/**
 * Tests for Whoop API Client
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WhoopApiClient } from "./whoop-api.js";

describe("WhoopApiClient", () => {
  let client: WhoopApiClient;
  const mockAccessToken = "test-token-123";

  beforeEach(() => {
    client = new WhoopApiClient({ accessToken: mockAccessToken });
    vi.clearAllMocks();
  });

  describe("Recovery", () => {
    it("should fetch recovery data with limit", async () => {
      const mockResponse = {
        records: [
          {
            cycle_id: 12345,
            sleep_id: 67890,
            user_id: 1,
            created_at: "2026-01-26T08:00:00.000Z",
            updated_at: "2026-01-26T08:00:00.000Z",
            score_state: "SCORED",
            score: {
              user_calibrating: false,
              recovery_score: 85,
              resting_heart_rate: 52,
              hrv_rmssd_milli: 65,
              spo2_percentage: 98.5,
              skin_temp_celsius: 33.2,
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getRecovery(1);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/recovery?limit=1"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        })
      );

      expect(result.records).toHaveLength(1);
      expect(result.records[0].score.recovery_score).toBe(85);
    });

    it("should fetch current recovery", async () => {
      const mockResponse = {
        records: [
          {
            cycle_id: 12345,
            sleep_id: 67890,
            user_id: 1,
            created_at: "2026-01-26T08:00:00.000Z",
            updated_at: "2026-01-26T08:00:00.000Z",
            score_state: "SCORED",
            score: {
              user_calibrating: false,
              recovery_score: 75,
              resting_heart_rate: 54,
              hrv_rmssd_milli: 55,
              spo2_percentage: 97.8,
              skin_temp_celsius: 33.5,
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getCurrentRecovery();

      expect(result).not.toBeNull();
      expect(result?.score.recovery_score).toBe(75);
    });
  });

  describe("Sleep", () => {
    it("should fetch sleep data", async () => {
      const mockResponse = {
        records: [
          {
            id: 67890,
            user_id: 1,
            created_at: "2026-01-26T07:00:00.000Z",
            updated_at: "2026-01-26T07:00:00.000Z",
            start: "2026-01-25T23:00:00.000Z",
            end: "2026-01-26T07:00:00.000Z",
            timezone_offset: "-08:00",
            nap: false,
            score_state: "SCORED",
            score: {
              stage_summary: {
                total_in_bed_time_milli: 28800000,
                total_awake_time_milli: 1800000,
                total_no_data_time_milli: 0,
                total_light_sleep_time_milli: 12600000,
                total_slow_wave_sleep_time_milli: 7200000,
                total_rem_sleep_time_milli: 7200000,
                sleep_cycle_count: 5,
                disturbance_count: 3,
              },
              sleep_needed: {
                baseline_milli: 28800000,
                need_from_sleep_debt_milli: 0,
                need_from_recent_strain_milli: 0,
                need_from_recent_nap_milli: 0,
              },
              respiratory_rate: 14.5,
              sleep_performance_percentage: 95,
              sleep_consistency_percentage: 88,
              sleep_efficiency_percentage: 93,
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getSleep(1);

      expect(result.records).toHaveLength(1);
      expect(result.records[0].score.sleep_performance_percentage).toBe(95);
    });
  });

  describe("Cycles", () => {
    it("should fetch cycle data", async () => {
      const mockResponse = {
        records: [
          {
            id: 12345,
            user_id: 1,
            created_at: "2026-01-26T08:00:00.000Z",
            updated_at: "2026-01-26T08:00:00.000Z",
            start: "2026-01-25T08:00:00.000Z",
            end: "2026-01-26T08:00:00.000Z",
            timezone_offset: "-08:00",
            score_state: "SCORED",
            score: {
              strain: 12.5,
              kilojoule: 8500,
              average_heart_rate: 65,
              max_heart_rate: 145,
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getCycles(1);

      expect(result.records).toHaveLength(1);
      expect(result.records[0].score.strain).toBe(12.5);
    });
  });

  describe("Workouts", () => {
    it("should fetch workout data", async () => {
      const mockResponse = {
        records: [
          {
            id: 98765,
            user_id: 1,
            created_at: "2026-01-26T10:00:00.000Z",
            updated_at: "2026-01-26T10:00:00.000Z",
            start: "2026-01-26T09:00:00.000Z",
            end: "2026-01-26T10:00:00.000Z",
            timezone_offset: "-08:00",
            sport_id: 1,
            score_state: "SCORED",
            score: {
              strain: 8.5,
              average_heart_rate: 135,
              max_heart_rate: 165,
              kilojoule: 2500,
              percent_recorded: 100,
              distance_meter: 5000,
              altitude_gain_meter: 50,
              altitude_change_meter: 50,
              zone_duration: {
                zone_zero_milli: 0,
                zone_one_milli: 300000,
                zone_two_milli: 900000,
                zone_three_milli: 1200000,
                zone_four_milli: 1200000,
                zone_five_milli: 0,
              },
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getWorkouts(1);

      expect(result.records).toHaveLength(1);
      expect(result.records[0].score.strain).toBe(8.5);
      expect(result.records[0].score.distance_meter).toBe(5000);
    });
  });

  describe("Error handling", () => {
    it("should handle API errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid access token",
      });

      await expect(client.getCurrentRecovery()).rejects.toThrow(
        "Whoop API error (401): Invalid access token"
      );
    });
  });
});
