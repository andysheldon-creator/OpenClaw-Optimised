/**
 * Whoop API Client
 * Implements methods for recovery, sleep, cycles, and workout data
 */

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

export interface WhoopApiConfig {
  accessToken: string;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string; // v2 uses UUID for sleep_id
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
}

export interface WhoopSleep {
  id: string; // v2 uses UUID
  cycle_id: number;
  v1_id?: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

export interface WhoopWorkout {
  id: string; // v2 uses UUID
  v1_id?: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  sport_name?: string;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter: number;
    altitude_gain_meter: number;
    altitude_change_meter: number;
    zone_durations: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  };
}

export interface WhoopListResponse<T> {
  records: T[];
  next_token?: string;
}

export class WhoopApiClient {
  private config: WhoopApiConfig;

  constructor(config: WhoopApiConfig) {
    this.config = config;
  }

  private async request<T>(endpoint: string): Promise<T> {
    const url = `${WHOOP_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Whoop API error (${response.status}): ${errorText || response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get recovery data
   * @param limit Number of records to return (default: 10)
   */
  async getRecovery(limit = 10): Promise<WhoopListResponse<WhoopRecovery>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    return this.request<WhoopListResponse<WhoopRecovery>>(`/v2/recovery?${params}`);
  }

  /**
   * Get current/latest recovery score
   */
  async getCurrentRecovery(): Promise<WhoopRecovery | null> {
    const response = await this.getRecovery(1);
    return response.records[0] || null;
  }

  /**
   * Get recovery by cycle ID
   */
  async getRecoveryById(cycleId: number): Promise<WhoopRecovery> {
    return this.request<WhoopRecovery>(`/v2/cycle/${cycleId}/recovery`);
  }

  /**
   * Get sleep data
   * @param limit Number of records to return (default: 10)
   */
  async getSleep(limit = 10): Promise<WhoopListResponse<WhoopSleep>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    return this.request<WhoopListResponse<WhoopSleep>>(`/v2/activity/sleep?${params}`);
  }

  /**
   * Get latest sleep session
   */
  async getLatestSleep(): Promise<WhoopSleep | null> {
    const response = await this.getSleep(1);
    return response.records[0] || null;
  }

  /**
   * Get sleep by ID (v2 uses UUID)
   */
  async getSleepById(sleepId: string): Promise<WhoopSleep> {
    return this.request<WhoopSleep>(`/v2/activity/sleep/${sleepId}`);
  }

  /**
   * Get cycle data (strain)
   * @param limit Number of records to return (default: 10)
   */
  async getCycles(limit = 10): Promise<WhoopListResponse<WhoopCycle>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    return this.request<WhoopListResponse<WhoopCycle>>(`/v2/cycle?${params}`);
  }

  /**
   * Get latest cycle
   */
  async getLatestCycle(): Promise<WhoopCycle | null> {
    const response = await this.getCycles(1);
    return response.records[0] || null;
  }

  /**
   * Get cycle by ID
   */
  async getCycleById(cycleId: number): Promise<WhoopCycle> {
    return this.request<WhoopCycle>(`/v2/cycle/${cycleId}`);
  }

  /**
   * Get workout data
   * @param limit Number of records to return (default: 10)
   */
  async getWorkouts(limit = 10): Promise<WhoopListResponse<WhoopWorkout>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    return this.request<WhoopListResponse<WhoopWorkout>>(`/v2/activity/workout?${params}`);
  }

  /**
   * Get latest workout
   */
  async getLatestWorkout(): Promise<WhoopWorkout | null> {
    const response = await this.getWorkouts(1);
    return response.records[0] || null;
  }

  /**
   * Get workout by ID (v2 uses UUID)
   */
  async getWorkoutById(workoutId: string): Promise<WhoopWorkout> {
    return this.request<WhoopWorkout>(`/v2/activity/workout/${workoutId}`);
  }
}
