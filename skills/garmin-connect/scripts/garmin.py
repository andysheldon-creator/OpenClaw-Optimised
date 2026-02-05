#!/usr/bin/env python3
"""
Garmin Connect CLI - Access fitness data for workout advice.

Uses garminconnect library: https://github.com/cyberjunky/python-garminconnect
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
from getpass import getpass
from pathlib import Path

try:
    from garminconnect import Garmin
except ImportError:
    print("Error: garminconnect not installed. Run setup.sh first.", file=sys.stderr)
    sys.exit(1)


TOKEN_DIR = Path.home() / ".garminconnect"


def get_client(email: str = None, password: str = None) -> Garmin:
    """Get authenticated Garmin client."""
    # Try to resume from saved tokens
    if TOKEN_DIR.exists():
        try:
            client = Garmin()
            client.login(TOKEN_DIR)
            return client
        except Exception:
            pass  # Tokens expired, need fresh login
    
    # Fresh login required
    if not email:
        email = os.environ.get("GARMIN_EMAIL") or input("Garmin Email: ")
    if not password:
        password = os.environ.get("GARMIN_PASSWORD") or getpass("Garmin Password: ")
    
    client = Garmin(email, password)
    client.login()
    
    # Save tokens for future use
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    client.garth.dump(str(TOKEN_DIR))
    os.chmod(TOKEN_DIR, 0o700)
    
    return client


def format_duration(seconds: float) -> str:
    """Format seconds as HH:MM:SS or MM:SS."""
    if seconds is None:
        return "N/A"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def format_pace(meters_per_second: float) -> str:
    """Format m/s as min/km pace."""
    if not meters_per_second or meters_per_second == 0:
        return "N/A"
    pace_seconds = 1000 / meters_per_second
    minutes = int(pace_seconds // 60)
    seconds = int(pace_seconds % 60)
    return f"{minutes}:{seconds:02d}/km"


def cmd_login(args):
    """Authenticate with Garmin Connect."""
    email = args.email or os.environ.get("GARMIN_EMAIL") or input("Garmin Email: ")
    password = os.environ.get("GARMIN_PASSWORD") or getpass("Garmin Password: ")
    
    client = Garmin(email, password)
    client.login()
    
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    client.garth.dump(str(TOKEN_DIR))
    os.chmod(TOKEN_DIR, 0o700)
    
    print(f"✓ Logged in as {email}")
    print(f"✓ Tokens saved to {TOKEN_DIR}")


def cmd_status(args):
    """Get current training status overview."""
    client = get_client()
    today = date.today().isoformat()
    
    data = {}
    
    # Get various status metrics
    try:
        stats = client.get_stats(today)
        data["daily_stats"] = {
            "steps": stats.get("totalSteps", 0),
            "calories": stats.get("totalKilocalories", 0),
            "active_minutes": stats.get("activeSeconds", 0) // 60 if stats.get("activeSeconds") else 0,
            "floors": stats.get("floorsAscended", 0),
        }
    except Exception as e:
        data["daily_stats"] = {"error": str(e)}
    
    try:
        bb = client.get_body_battery(today)
        if bb and len(bb) > 0:
            data["body_battery"] = {
                "current": bb[0].get("bodyBatteryCharged", 0) - bb[0].get("bodyBatteryDrained", 0),
                "charged": bb[0].get("bodyBatteryCharged", 0),
                "drained": bb[0].get("bodyBatteryDrained", 0),
            }
    except Exception:
        pass
    
    try:
        stress = client.get_stress_data(today)
        if stress:
            data["stress"] = {
                "average": stress.get("overallStressLevel", 0),
                "max": stress.get("maxStressLevel", 0),
            }
    except Exception:
        pass
    
    try:
        readiness = client.get_training_readiness(today)
        if readiness:
            data["training_readiness"] = {
                "score": readiness.get("score", 0),
                "level": readiness.get("level", "unknown"),
            }
    except Exception:
        pass
    
    try:
        sleep = client.get_sleep_data(today)
        if sleep and sleep.get("dailySleepDTO"):
            s = sleep["dailySleepDTO"]
            data["last_night_sleep"] = {
                "duration_hours": round(s.get("sleepTimeSeconds", 0) / 3600, 1),
                "score": s.get("sleepScores", {}).get("overall", {}).get("value", 0),
            }
    except Exception:
        pass
    
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print("📊 Garmin Status Overview")
        print("=" * 40)
        
        if "daily_stats" in data and "error" not in data["daily_stats"]:
            ds = data["daily_stats"]
            print(f"🚶 Steps: {ds['steps']:,}")
            print(f"🔥 Calories: {ds['calories']:,}")
            print(f"⏱️  Active Minutes: {ds['active_minutes']}")
        
        if "body_battery" in data:
            bb = data["body_battery"]
            print(f"🔋 Body Battery: {bb['current']}/100")
        
        if "stress" in data:
            st = data["stress"]
            print(f"😰 Stress: avg {st['average']}, max {st['max']}")
        
        if "training_readiness" in data:
            tr = data["training_readiness"]
            print(f"💪 Training Readiness: {tr['score']} ({tr['level']})")
        
        if "last_night_sleep" in data:
            sl = data["last_night_sleep"]
            print(f"😴 Sleep: {sl['duration_hours']}h (score: {sl['score']})")


def cmd_activities(args):
    """List recent activities."""
    client = get_client()
    
    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=args.days)
    
    activities = client.get_activities_by_date(
        start_date.isoformat(),
        end_date.isoformat(),
        args.type
    )
    
    if args.json:
        print(json.dumps(activities, indent=2, default=str))
        return
    
    print(f"🏃 Activities ({start_date} to {end_date})")
    print("=" * 60)
    
    if not activities:
        print("No activities found.")
        return
    
    for act in activities[:20]:  # Limit to 20
        act_type = act.get("activityType", {}).get("typeKey", "unknown")
        name = act.get("activityName", "Unnamed")
        duration = format_duration(act.get("duration", 0))
        distance = act.get("distance", 0)
        distance_km = round(distance / 1000, 2) if distance else 0
        avg_hr = act.get("averageHR", 0)
        calories = act.get("calories", 0)
        act_id = act.get("activityId")
        start = act.get("startTimeLocal", "")[:10]
        
        print(f"\n📌 {name} ({act_type})")
        print(f"   ID: {act_id} | Date: {start}")
        print(f"   Duration: {duration} | Distance: {distance_km}km")
        print(f"   Avg HR: {avg_hr}bpm | Calories: {calories}")


def cmd_activity(args):
    """Get details for a specific activity."""
    client = get_client()
    
    activity = client.get_activity(args.activity_id)
    
    data = {"activity": activity}
    
    if args.splits:
        try:
            splits = client.get_activity_splits(args.activity_id)
            data["splits"] = splits
        except Exception as e:
            data["splits_error"] = str(e)
    
    if args.hr_zones:
        try:
            zones = client.get_activity_hr_in_timezones(args.activity_id)
            data["hr_zones"] = zones
        except Exception as e:
            data["hr_zones_error"] = str(e)
    
    if args.json:
        print(json.dumps(data, indent=2, default=str))
        return
    
    # Pretty print
    act = activity
    print(f"🏃 {act.get('activityName', 'Activity')}")
    print("=" * 50)
    print(f"Type: {act.get('activityType', {}).get('typeKey', 'unknown')}")
    print(f"Date: {act.get('startTimeLocal', '')}")
    print(f"Duration: {format_duration(act.get('duration', 0))}")
    print(f"Distance: {round(act.get('distance', 0) / 1000, 2)}km")
    print(f"Avg HR: {act.get('averageHR', 0)}bpm | Max HR: {act.get('maxHR', 0)}bpm")
    print(f"Avg Pace: {format_pace(act.get('averageSpeed', 0))}")
    print(f"Calories: {act.get('calories', 0)}")
    
    if "splits" in data and data["splits"]:
        print("\n📊 Splits:")
        for i, split in enumerate(data["splits"].get("lapDTOs", [])[:10], 1):
            print(f"  Lap {i}: {format_duration(split.get('duration', 0))} | "
                  f"{round(split.get('distance', 0)/1000, 2)}km | "
                  f"{format_pace(split.get('averageSpeed', 0))}")


def cmd_running(args):
    """Get running-specific metrics."""
    client = get_client()
    today = date.today().isoformat()
    
    data = {}
    
    # VO2 Max
    try:
        max_metrics = client.get_max_metrics(today)
        if max_metrics:
            data["vo2_max"] = {
                "running": max_metrics.get("generic", {}).get("vo2MaxPreciseValue"),
                "cycling": max_metrics.get("cycling", {}).get("vo2MaxPreciseValue"),
            }
    except Exception:
        pass
    
    # Race predictions
    try:
        race = client.get_race_predictions()
        if race:
            data["race_predictions"] = {
                "5k": format_duration(race.get("racePredictions", {}).get("time5K", 0)),
                "10k": format_duration(race.get("racePredictions", {}).get("time10K", 0)),
                "half_marathon": format_duration(race.get("racePredictions", {}).get("timeHalfMarathon", 0)),
                "marathon": format_duration(race.get("racePredictions", {}).get("timeMarathon", 0)),
            }
    except Exception:
        pass
    
    # Fitness age
    try:
        fitness_age = client.get_fitness_age(today)
        if fitness_age:
            data["fitness_age"] = fitness_age.get("fitnessAge", 0)
    except Exception:
        pass
    
    # Endurance score
    try:
        endurance = client.get_endurance_score(today)
        if endurance:
            data["endurance_score"] = endurance.get("overallScore", 0)
    except Exception:
        pass
    
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print("🏃 Running Metrics")
        print("=" * 40)
        
        if "vo2_max" in data:
            vm = data["vo2_max"]
            print(f"💨 VO2 Max (Running): {vm.get('running', 'N/A')}")
        
        if "race_predictions" in data:
            rp = data["race_predictions"]
            print(f"\n🏁 Race Predictions:")
            print(f"   5K:    {rp['5k']}")
            print(f"   10K:   {rp['10k']}")
            print(f"   Half:  {rp['half_marathon']}")
            print(f"   Full:  {rp['marathon']}")
        
        if "fitness_age" in data:
            print(f"\n🎂 Fitness Age: {data['fitness_age']}")
        
        if "endurance_score" in data:
            print(f"🔋 Endurance Score: {data['endurance_score']}")


def cmd_strength(args):
    """Get recent strength training activities."""
    client = get_client()
    
    end_date = date.today()
    start_date = end_date - timedelta(days=args.days)
    
    activities = client.get_activities_by_date(
        start_date.isoformat(),
        end_date.isoformat(),
        "strength_training"
    )
    
    results = []
    for act in activities[:10]:  # Limit
        act_id = act.get("activityId")
        try:
            sets = client.get_activity_exercise_sets(act_id)
            act["exercise_sets"] = sets
        except Exception:
            pass
        results.append(act)
    
    if args.json:
        print(json.dumps(results, indent=2, default=str))
        return
    
    print(f"🏋️ Strength Training ({start_date} to {end_date})")
    print("=" * 60)
    
    if not results:
        print("No strength activities found.")
        return
    
    for act in results:
        print(f"\n📌 {act.get('activityName', 'Strength')} - {act.get('startTimeLocal', '')[:10]}")
        print(f"   Duration: {format_duration(act.get('duration', 0))}")
        
        if "exercise_sets" in act and act["exercise_sets"]:
            exercises = act["exercise_sets"].get("exerciseSets", [])
            print(f"   Exercises: {len(exercises)}")
            for ex in exercises[:5]:
                name = ex.get("exercises", [{}])[0].get("name", "Unknown") if ex.get("exercises") else "Unknown"
                reps = ex.get("repetitionCount", 0)
                weight = ex.get("weight", 0)
                if weight:
                    print(f"     - {name}: {reps} reps @ {weight}kg")
                else:
                    print(f"     - {name}: {reps} reps")


def cmd_health(args):
    """Get health metrics for a date."""
    client = get_client()
    target_date = args.date or date.today().isoformat()
    
    data = {"date": target_date}
    
    try:
        stats = client.get_stats(target_date)
        data["stats"] = {
            "steps": stats.get("totalSteps", 0),
            "distance_km": round(stats.get("totalDistanceMeters", 0) / 1000, 2),
            "calories": stats.get("totalKilocalories", 0),
            "active_minutes": stats.get("activeSeconds", 0) // 60 if stats.get("activeSeconds") else 0,
            "floors": stats.get("floorsAscended", 0),
        }
    except Exception as e:
        data["stats_error"] = str(e)
    
    try:
        hr = client.get_heart_rates(target_date)
        if hr:
            data["heart_rate"] = {
                "resting": hr.get("restingHeartRate", 0),
                "min": hr.get("minHeartRate", 0),
                "max": hr.get("maxHeartRate", 0),
            }
    except Exception:
        pass
    
    try:
        hrv = client.get_hrv_data(target_date)
        if hrv and hrv.get("hrvSummary"):
            data["hrv"] = {
                "weekly_avg": hrv["hrvSummary"].get("weeklyAvg", 0),
                "last_night": hrv["hrvSummary"].get("lastNightAvg", 0),
            }
    except Exception:
        pass
    
    try:
        stress = client.get_stress_data(target_date)
        if stress:
            data["stress"] = {
                "average": stress.get("overallStressLevel", 0),
                "max": stress.get("maxStressLevel", 0),
                "rest": stress.get("restStressAverage", 0),
            }
    except Exception:
        pass
    
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"🏥 Health Metrics for {target_date}")
        print("=" * 40)
        
        if "stats" in data:
            s = data["stats"]
            print(f"🚶 Steps: {s['steps']:,}")
            print(f"📏 Distance: {s['distance_km']}km")
            print(f"🔥 Calories: {s['calories']:,}")
            print(f"⏱️  Active: {s['active_minutes']}min")
        
        if "heart_rate" in data:
            hr = data["heart_rate"]
            print(f"\n❤️  Heart Rate:")
            print(f"   Resting: {hr['resting']}bpm")
            print(f"   Min/Max: {hr['min']}-{hr['max']}bpm")
        
        if "hrv" in data:
            h = data["hrv"]
            print(f"\n📈 HRV:")
            print(f"   Weekly Avg: {h['weekly_avg']}ms")
            print(f"   Last Night: {h['last_night']}ms")
        
        if "stress" in data:
            st = data["stress"]
            print(f"\n😰 Stress: avg {st['average']}, max {st['max']}")


def cmd_sleep(args):
    """Get sleep data."""
    client = get_client()
    
    if args.days > 1:
        # Get multiple days
        results = []
        for i in range(args.days):
            target_date = (date.today() - timedelta(days=i)).isoformat()
            try:
                sleep = client.get_sleep_data(target_date)
                if sleep and sleep.get("dailySleepDTO"):
                    s = sleep["dailySleepDTO"]
                    results.append({
                        "date": target_date,
                        "duration_hours": round(s.get("sleepTimeSeconds", 0) / 3600, 1),
                        "score": s.get("sleepScores", {}).get("overall", {}).get("value", 0),
                        "deep_hours": round(s.get("deepSleepSeconds", 0) / 3600, 1),
                        "light_hours": round(s.get("lightSleepSeconds", 0) / 3600, 1),
                        "rem_hours": round(s.get("remSleepSeconds", 0) / 3600, 1),
                        "awake_hours": round(s.get("awakeSleepSeconds", 0) / 3600, 1),
                    })
            except Exception:
                pass
        
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(f"😴 Sleep Summary (Last {args.days} days)")
            print("=" * 50)
            for r in results:
                print(f"{r['date']}: {r['duration_hours']}h (score: {r['score']}) | "
                      f"Deep: {r['deep_hours']}h | REM: {r['rem_hours']}h")
    else:
        # Single night detail
        target_date = date.today().isoformat()
        sleep = client.get_sleep_data(target_date)
        
        if args.json:
            print(json.dumps(sleep, indent=2, default=str))
        else:
            if sleep and sleep.get("dailySleepDTO"):
                s = sleep["dailySleepDTO"]
                print("😴 Last Night's Sleep")
                print("=" * 40)
                print(f"Duration: {round(s.get('sleepTimeSeconds', 0) / 3600, 1)}h")
                print(f"Score: {s.get('sleepScores', {}).get('overall', {}).get('value', 0)}")
                print(f"Deep: {round(s.get('deepSleepSeconds', 0) / 3600, 1)}h")
                print(f"Light: {round(s.get('lightSleepSeconds', 0) / 3600, 1)}h")
                print(f"REM: {round(s.get('remSleepSeconds', 0) / 3600, 1)}h")
                print(f"Awake: {round(s.get('awakeSleepSeconds', 0) / 3600, 1)}h")
            else:
                print("No sleep data found.")


def cmd_training(args):
    """Get training load and readiness."""
    client = get_client()
    today = date.today().isoformat()
    
    data = {}
    
    try:
        readiness = client.get_training_readiness(today)
        if readiness:
            data["readiness"] = {
                "score": readiness.get("score", 0),
                "level": readiness.get("level", "unknown"),
                "sleep_score": readiness.get("sleepScore", 0),
                "recovery_score": readiness.get("recoveryScore", 0),
                "training_load_balance_score": readiness.get("trainingLoadBalanceScore", 0),
            }
    except Exception:
        pass
    
    try:
        status = client.get_training_status(today)
        if status:
            data["training_status"] = {
                "status": status.get("trainingStatus", "unknown"),
                "load_focus": status.get("loadFocus", "unknown"),
            }
    except Exception:
        pass
    
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print("💪 Training Status")
        print("=" * 40)
        
        if "readiness" in data:
            r = data["readiness"]
            print(f"📊 Readiness Score: {r['score']} ({r['level']})")
            print(f"   Sleep: {r['sleep_score']} | Recovery: {r['recovery_score']}")
            print(f"   Load Balance: {r['training_load_balance_score']}")
        
        if "training_status" in data:
            ts = data["training_status"]
            print(f"\n🎯 Status: {ts['status']}")
            print(f"   Load Focus: {ts['load_focus']}")


def cmd_records(args):
    """Get personal records."""
    client = get_client()
    
    try:
        records = client.get_personal_record()
        
        if args.json:
            print(json.dumps(records, indent=2, default=str))
        else:
            print("🏆 Personal Records")
            print("=" * 40)
            
            for rec in (records or [])[:15]:
                activity = rec.get("activityType", "unknown")
                metric = rec.get("prTypeLabelKey", "unknown")
                value = rec.get("value", 0)
                pr_date = rec.get("prStartTimeGmtFormatted", "")[:10]
                print(f"  {activity} - {metric}: {value} ({pr_date})")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)


def cmd_goals(args):
    """Get active goals."""
    client = get_client()
    
    try:
        goals = client.get_goals("active")
        
        if args.json:
            print(json.dumps(goals, indent=2, default=str))
        else:
            print("🎯 Active Goals")
            print("=" * 40)
            
            for goal in (goals or [])[:10]:
                name = goal.get("goalDescription", "Goal")
                goal_type = goal.get("goalType", "")
                target = goal.get("targetValue", 0)
                current = goal.get("currentValue", 0)
                pct = round((current / target * 100) if target else 0, 1)
                print(f"  {name} ({goal_type})")
                print(f"    Progress: {current}/{target} ({pct}%)")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Garmin Connect CLI")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # login
    p_login = subparsers.add_parser("login", help="Authenticate with Garmin")
    p_login.add_argument("--email", help="Garmin email")
    p_login.set_defaults(func=cmd_login)
    
    # status
    p_status = subparsers.add_parser("status", help="Training status overview")
    p_status.set_defaults(func=cmd_status)
    
    # activities
    p_activities = subparsers.add_parser("activities", help="List recent activities")
    p_activities.add_argument("--days", type=int, default=7, help="Days to look back")
    p_activities.add_argument("--type", help="Filter by activity type")
    p_activities.set_defaults(func=cmd_activities)
    
    # activity (single)
    p_activity = subparsers.add_parser("activity", help="Get activity details")
    p_activity.add_argument("activity_id", help="Activity ID")
    p_activity.add_argument("--splits", action="store_true", help="Include splits")
    p_activity.add_argument("--hr-zones", action="store_true", help="Include HR zones")
    p_activity.set_defaults(func=cmd_activity)
    
    # running
    p_running = subparsers.add_parser("running", help="Running metrics")
    p_running.set_defaults(func=cmd_running)
    
    # strength
    p_strength = subparsers.add_parser("strength", help="Strength training")
    p_strength.add_argument("--days", type=int, default=14, help="Days to look back")
    p_strength.set_defaults(func=cmd_strength)
    
    # health
    p_health = subparsers.add_parser("health", help="Health metrics")
    p_health.add_argument("--date", help="Date (YYYY-MM-DD)")
    p_health.set_defaults(func=cmd_health)
    
    # sleep
    p_sleep = subparsers.add_parser("sleep", help="Sleep data")
    p_sleep.add_argument("--days", type=int, default=1, help="Days to summarize")
    p_sleep.set_defaults(func=cmd_sleep)
    
    # training
    p_training = subparsers.add_parser("training", help="Training load & readiness")
    p_training.set_defaults(func=cmd_training)
    
    # records
    p_records = subparsers.add_parser("records", help="Personal records")
    p_records.set_defaults(func=cmd_records)
    
    # goals
    p_goals = subparsers.add_parser("goals", help="Active goals")
    p_goals.set_defaults(func=cmd_goals)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
