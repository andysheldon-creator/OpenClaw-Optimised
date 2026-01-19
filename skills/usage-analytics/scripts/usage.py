#!/usr/bin/env python3
"""
Analyze Clawdbot token usage and costs from session logs.

Aggregates usage data by date with cost breakdowns. Supports filtering by
agent, date range, and output format.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

MODEL_PRICING_PER_MILLION = {
    "claude-opus-4-5": {
        "input": 15.0,
        "output": 75.0,
        "cache_read": 1.5,
        "cache_write": 18.75,
    },
    "claude-sonnet-4-5": {
        "input": 3.0,
        "output": 15.0,
        "cache_read": 0.3,
        "cache_write": 3.75,
    },
    "claude-haiku-4-5": {
        "input": 1.0,
        "output": 5.0,
        "cache_read": 0.1,
        "cache_write": 1.25,
    },
}
TOKENS_PER_MILLION = 1_000_000


def eprint(msg: str) -> None:
    """Print to stderr."""
    print(msg, file=sys.stderr)


@dataclass
class UsageRecord:
    """Token and cost data from a single API response."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read: int = 0
    cache_write: int = 0
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0

    def __add__(self, other: "UsageRecord") -> "UsageRecord":
        return UsageRecord(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cache_read=self.cache_read + other.cache_read,
            cache_write=self.cache_write + other.cache_write,
            cost_input=self.cost_input + other.cost_input,
            cost_output=self.cost_output + other.cost_output,
            cost_cache_read=self.cost_cache_read + other.cost_cache_read,
            cost_cache_write=self.cost_cache_write + other.cost_cache_write,
            cost_total=self.cost_total + other.cost_total,
        )

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens + self.cache_read + self.cache_write

    @property
    def logged_cost(self) -> float:
        if self.cost_total:
            return self.cost_total
        return self.cost_input + self.cost_output + self.cost_cache_read + self.cost_cache_write

    @property
    def api_equivalent_cost(self) -> float:
        """Estimate cost at full API rates (undoing cache read discount)."""
        if self.cost_cache_read:
            return (
                self.cost_input
                + self.cost_output
                + self.cost_cache_write
                + (self.cost_cache_read * 10)
            )
        return self.logged_cost


@dataclass
class DailyUsage:
    """Aggregated usage for a single day."""
    date: str
    sessions: int = 0
    usage: UsageRecord = field(default_factory=UsageRecord)
    models: Set[str] = field(default_factory=set)


def parse_date(value: str) -> Optional[date]:
    """Parse YYYY-MM-DD date string."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_timestamp_date(value: str) -> Optional[date]:
    """Parse an ISO timestamp into a local date."""
    if not value:
        return None
    normalized = value
    if value.endswith("Z"):
        normalized = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return parse_date(value[:10])
    if parsed.tzinfo is None:
        return parsed.date()
    return parsed.astimezone().date()


def get_date_range(period: str, days: Optional[int]) -> Tuple[date, date]:
    """Calculate start and end dates from period or days argument."""
    today = date.today()

    if days:
        return today - timedelta(days=days - 1), today

    if period == "today":
        return today, today
    elif period == "week":
        return today - timedelta(days=6), today
    elif period == "month":
        return today - timedelta(days=29), today
    elif period == "all":
        return date(1970, 1, 1), date(2099, 12, 31)
    elif ".." in period:
        # Range format: YYYY-MM-DD..YYYY-MM-DD
        parts = period.split("..")
        if len(parts) == 2:
            start = parse_date(parts[0])
            end = parse_date(parts[1])
            if start and end:
                return start, end
        raise ValueError(f"Invalid date range: {period}")
    else:
        # Single date
        d = parse_date(period)
        if d:
            return d, d
        raise ValueError(f"Invalid date: {period}")


def find_session_files(base_dir: Path, agent: str) -> Iterator[Path]:
    """Find all session JSONL files for specified agent(s)."""
    agents_dir = base_dir / "agents"
    if not agents_dir.exists():
        return

    if agent == "all":
        agent_dirs = [d for d in agents_dir.iterdir() if d.is_dir()]
    else:
        agent_path = agents_dir / agent
        agent_dirs = [agent_path] if agent_path.exists() else []

    for agent_dir in agent_dirs:
        sessions_dir = agent_dir / "sessions"
        if sessions_dir.exists():
            for f in sessions_dir.glob("*.jsonl"):
                # Skip deleted sessions
                if ".deleted." not in f.name:
                    yield f


def _num(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _int(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0


def extract_usage(message: Dict[str, Any]) -> Optional[Tuple[UsageRecord, Optional[str], bool]]:
    """Extract usage data and model from a message object."""
    msg = message.get("message", {})
    usage = msg.get("usage")
    if not usage or not isinstance(usage, dict):
        return None
    model = msg.get("model")
    if not isinstance(model, str):
        model = None

    cost_obj = usage.get("cost", {})
    if not isinstance(cost_obj, dict):
        cost_obj = {}
    has_logged_cost = any(isinstance(value, (int, float)) for value in cost_obj.values())

    cost_input = _num(cost_obj.get("input"))
    cost_output = _num(cost_obj.get("output"))
    cost_cache_read = _num(cost_obj.get("cacheRead"))
    cost_cache_write = _num(cost_obj.get("cacheWrite"))
    cost_total = _num(cost_obj.get("total"))
    if not cost_total:
        cost_total = cost_input + cost_output + cost_cache_read + cost_cache_write

    return (
        UsageRecord(
            input_tokens=_int(usage.get("input")),
            output_tokens=_int(usage.get("output")),
            cache_read=_int(usage.get("cacheRead")),
            cache_write=_int(usage.get("cacheWrite")),
            cost_input=cost_input,
            cost_output=cost_output,
            cost_cache_read=cost_cache_read,
            cost_cache_write=cost_cache_write,
            cost_total=cost_total,
        ),
        model,
        has_logged_cost,
    )


def _timestamp_date_in_range(
    timestamp: str,
    start_date: date,
    end_date: date,
) -> Optional[date]:
    stamp_date = parse_timestamp_date(timestamp)
    if not stamp_date:
        return None
    if start_date <= stamp_date <= end_date:
        return stamp_date
    return None


def _build_ccusage_entry(message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    msg = message.get("message", {})
    usage = msg.get("usage")
    if not usage or not isinstance(usage, dict):
        return None
    timestamp = message.get("timestamp")
    if not isinstance(timestamp, str):
        return None

    entry: Dict[str, Any] = {
        "timestamp": timestamp,
        "message": {
            "usage": {
                "input_tokens": _int(usage.get("input")),
                "output_tokens": _int(usage.get("output")),
            }
        },
    }

    cache_write = _int(usage.get("cacheWrite"))
    cache_read = _int(usage.get("cacheRead"))
    if cache_write:
        entry["message"]["usage"]["cache_creation_input_tokens"] = cache_write
    if cache_read:
        entry["message"]["usage"]["cache_read_input_tokens"] = cache_read

    model = msg.get("model")
    if isinstance(model, str) and model:
        entry["message"]["model"] = model

    message_id = msg.get("id")
    if isinstance(message_id, str) and message_id:
        entry["message"]["id"] = message_id

    request_id = message.get("requestId")
    if not isinstance(request_id, str) or not request_id:
        request_id = message.get("request_id")
    if isinstance(request_id, str) and request_id:
        entry["requestId"] = request_id

    return entry


def _calculate_ccusage_daily_costs(
    session_files: List[Path],
    start_date: date,
    end_date: date,
    offline: bool,
) -> Dict[str, float]:
    if not session_files:
        return {}

    with tempfile.TemporaryDirectory(prefix="ccusage-export-") as temp_dir:
        project_dir = Path(temp_dir) / "projects" / "clawdbot"
        project_dir.mkdir(parents=True, exist_ok=True)
        export_path = project_dir / "usage.jsonl"

        with export_path.open("w", encoding="utf-8") as handle:
            for session_file in session_files:
                try:
                    with session_file.open("r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                data = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            timestamp = data.get("timestamp")
                            if not isinstance(timestamp, str):
                                continue
                            if not _timestamp_date_in_range(timestamp, start_date, end_date):
                                continue
                            entry = _build_ccusage_entry(data)
                            if entry:
                                handle.write(json.dumps(entry) + "\n")
                except IOError as e:
                    eprint(f"Warning: Could not read {session_file}: {e}")

        if not export_path.exists() or export_path.stat().st_size == 0:
            return {}

        cmd = [
            "ccusage",
            "daily",
            "--json",
            "--mode",
            "calculate",
            "--since",
            start_date.strftime("%Y%m%d"),
            "--until",
            end_date.strftime("%Y%m%d"),
            "--order",
            "desc",
            "--project",
            "clawdbot",
        ]
        if offline:
            cmd.append("--offline")

        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = temp_dir

        try:
            output = subprocess.check_output(cmd, text=True, env=env)
        except FileNotFoundError:
            raise RuntimeError("ccusage not found on PATH. Install ccusage first.")
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"ccusage daily failed (exit {exc.returncode}).")

        try:
            payload = json.loads(output)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Failed to parse ccusage JSON output: {exc}")

        if not isinstance(payload, dict):
            return {}

        daily = payload.get("daily")
        if not isinstance(daily, list):
            return {}

        costs: Dict[str, float] = {}
        for item in daily:
            if not isinstance(item, dict):
                continue
            day = item.get("date")
            total_cost = item.get("totalCost")
            if isinstance(day, str) and isinstance(total_cost, (int, float)):
                costs[day] = float(total_cost)

        return costs


def normalize_model_for_pricing(model: str) -> str:
    model = model.strip()
    if model.startswith("[pi] "):
        model = model[5:]
    if model.startswith("anthropic/"):
        model = model[len("anthropic/"):]
    match = re.match(r"^(claude-(?:opus|sonnet|haiku)-[\d.\-]+)-\d{8}$", model)
    if match:
        model = match.group(1)
    if re.match(r"^claude-(?:opus|sonnet|haiku)-[\d.]+$", model):
        return model.replace(".", "-")
    return model


def calculate_costs(usage: UsageRecord, model: Optional[str]) -> UsageRecord:
    if not model:
        return UsageRecord(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read=usage.cache_read,
            cache_write=usage.cache_write,
        )
    pricing_key = normalize_model_for_pricing(model)
    rates = MODEL_PRICING_PER_MILLION.get(pricing_key)
    if not rates:
        return UsageRecord(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read=usage.cache_read,
            cache_write=usage.cache_write,
        )

    cost_input = usage.input_tokens * rates["input"] / TOKENS_PER_MILLION
    cost_output = usage.output_tokens * rates["output"] / TOKENS_PER_MILLION
    cost_cache_read = usage.cache_read * rates["cache_read"] / TOKENS_PER_MILLION
    cost_cache_write = usage.cache_write * rates["cache_write"] / TOKENS_PER_MILLION
    cost_total = cost_input + cost_output + cost_cache_read + cost_cache_write

    return UsageRecord(
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read=usage.cache_read,
        cache_write=usage.cache_write,
        cost_input=cost_input,
        cost_output=cost_output,
        cost_cache_read=cost_cache_read,
        cost_cache_write=cost_cache_write,
        cost_total=cost_total,
    )


def normalize_model_display(model: str) -> str:
    pi_prefix = ""
    model_name = model.strip()
    if model_name.startswith("[pi] "):
        pi_prefix = "[pi] "
        model_name = model_name[5:]
    if model_name.startswith("anthropic/"):
        model_name = model_name[len("anthropic/"):]
        match = re.match(r"^claude-(\w+)-([\d.]+)-\d{8}$", model_name)
        if match:
            return f"{pi_prefix}{match.group(1)}-{match.group(2)}"
        match = re.match(r"^claude-(\w+)-([\d.]+)$", model_name)
        if match:
            return f"{pi_prefix}{match.group(1)}-{match.group(2)}"
    match = re.match(r"^claude-(\w+)-([\d-]+)-\d{8}$", model_name)
    if match:
        return f"{pi_prefix}{match.group(1)}-{match.group(2)}"
    match = re.match(r"^claude-(\w+)-([\d-]+)$", model_name)
    if match:
        return f"{pi_prefix}{match.group(1)}-{match.group(2)}"
    return model


def create_unique_hash(message: Dict[str, Any]) -> Optional[str]:
    msg = message.get("message", {})
    message_id = msg.get("id")
    if not isinstance(message_id, str) or not message_id:
        return None
    request_id = message.get("requestId")
    if not isinstance(request_id, str) or not request_id:
        request_id = message.get("request_id")
    if not isinstance(request_id, str) or not request_id:
        return None
    return f"{message_id}:{request_id}"


def process_session_file(
    session_file: Path,
    start_date: date,
    end_date: date,
    cost_mode: str,
    skip_cost: bool,
) -> Tuple[Dict[str, UsageRecord], Dict[str, Set[str]]]:
    """Process a session file and return usage and models by local date."""
    daily_usage: Dict[str, UsageRecord] = {}
    daily_models: Dict[str, Set[str]] = {}
    processed_hashes: Set[str] = set()
    try:
        with open(session_file, "r", encoding="utf-8") as f:
            for line_number, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    unique_hash = create_unique_hash(data)
                    if unique_hash and unique_hash in processed_hashes:
                        continue
                    timestamp = data.get("timestamp")
                    if not isinstance(timestamp, str):
                        continue
                    stamp_date = _timestamp_date_in_range(timestamp, start_date, end_date)
                    if not stamp_date:
                        continue
                    usage_data = extract_usage(data)
                    if usage_data:
                        usage, model, has_logged_cost = usage_data
                        if skip_cost:
                            selected_usage = UsageRecord(
                                input_tokens=usage.input_tokens,
                                output_tokens=usage.output_tokens,
                                cache_read=usage.cache_read,
                                cache_write=usage.cache_write,
                            )
                        elif cost_mode == "calculate":
                            selected_usage = calculate_costs(usage, model)
                        elif cost_mode == "display":
                            selected_usage = usage
                        else:
                            if has_logged_cost:
                                selected_usage = usage
                            else:
                                selected_usage = calculate_costs(usage, model)
                        day_key = stamp_date.isoformat()
                        daily_usage[day_key] = daily_usage.get(day_key, UsageRecord()) + selected_usage
                        if model:
                            daily_models.setdefault(day_key, set()).add(model)
                    if unique_hash:
                        processed_hashes.add(unique_hash)
                except json.JSONDecodeError as e:
                    eprint(
                        f"Warning: Could not parse JSON in {session_file} line {line_number}: {e}"
                    )
    except IOError as e:
        eprint(f"Warning: Could not read {session_file}: {e}")
    return daily_usage, daily_models


def aggregate_usage(
    base_dir: Path,
    agent: str,
    start_date: date,
    end_date: date,
    cost_mode: str,
    pricing_source: str,
    ccusage_offline: bool,
) -> Dict[str, DailyUsage]:
    """Aggregate usage data by date."""
    daily: Dict[str, DailyUsage] = {}
    daily_sessions: Dict[str, Set[str]] = {}
    session_files = list(find_session_files(base_dir, agent))
    use_ccusage = pricing_source == "ccusage" and cost_mode == "calculate"

    for session_file in session_files:
        daily_usage, daily_models = process_session_file(
            session_file,
            start_date,
            end_date,
            cost_mode,
            use_ccusage,
        )
        if not daily_usage:
            continue
        for day, usage in daily_usage.items():
            if day not in daily:
                daily[day] = DailyUsage(date=day)
            daily[day].usage = daily[day].usage + usage
            daily[day].models.update(daily_models.get(day, set()))
            daily_sessions.setdefault(day, set()).add(session_file.name)

    for day, sessions in daily_sessions.items():
        if day in daily:
            daily[day].sessions = len(sessions)

    if use_ccusage:
        costs = _calculate_ccusage_daily_costs(
            session_files,
            start_date,
            end_date,
            ccusage_offline,
        )
        for day, cost in costs.items():
            if day not in daily:
                daily[day] = DailyUsage(date=day)
            daily[day].usage.cost_total = cost

    return daily


def render_text(
    daily: Dict[str, DailyUsage],
    period_label: str,
) -> str:
    """Render usage data as human-readable text."""
    if not daily:
        return f"No usage data found for period: {period_label}"

    def _fmt_number(value: int) -> str:
        return f"{value:,}"

    def _fmt_cost(value: float) -> str:
        return f"${value:,.2f}"

    def _row(items: List[str], widths: List[int], aligns: List[str]) -> str:
        cells = []
        for value, width, align in zip(items, widths, aligns):
            content_width = width - 2
            if align == "right":
                cell = value.rjust(content_width)
            else:
                cell = value.ljust(content_width)
            cells.append(f" {cell} ")
        return "|" + "|".join(cells) + "|"

    def _border(widths: List[int]) -> str:
        return "+" + "+".join("-" * width for width in widths) + "+"

    header_lines = [f"Period: {period_label}", ""]

    # Calculate totals
    total_usage = UsageRecord()
    for d in daily.values():
        total_usage = total_usage + d.usage

    rows: List[List[str]] = []
    day_row_counts: List[int] = []
    for d in sorted(daily.values(), key=lambda x: x.date, reverse=True):
        year = d.date[:4]
        month_day = d.date[5:]
        model_lines = [f"- {normalize_model_display(model)}" for model in sorted(d.models)]
        if not model_lines:
            model_lines = [""]
        row_count = max(2, len(model_lines))
        for idx in range(row_count):
            date_cell = ""
            model_cell = ""
            if idx == 0:
                date_cell = year
                model_cell = model_lines[0] if model_lines else ""
            elif idx == 1:
                date_cell = month_day
                if len(model_lines) > 1:
                    model_cell = model_lines[1]
            else:
                model_cell = model_lines[idx] if idx < len(model_lines) else ""

            if idx == 0:
                rows.append(
                    [
                        date_cell,
                        model_cell,
                        _fmt_number(d.usage.input_tokens),
                        _fmt_number(d.usage.output_tokens),
                        _fmt_number(d.usage.cache_write),
                        _fmt_number(d.usage.cache_read),
                        _fmt_number(d.usage.total_tokens),
                        _fmt_cost(d.usage.logged_cost),
                    ]
                )
            else:
                rows.append(
                    [
                        date_cell,
                        model_cell,
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                    ]
                )
        day_row_counts.append(row_count)

    total_row = [
        "Total",
        "",
        _fmt_number(total_usage.input_tokens),
        _fmt_number(total_usage.output_tokens),
        _fmt_number(total_usage.cache_write),
        _fmt_number(total_usage.cache_read),
        _fmt_number(total_usage.total_tokens),
        _fmt_cost(total_usage.logged_cost),
    ]

    headers = [
        "Date",
        "Models",
        "Input",
        "Output",
        "Cache Create",
        "Cache Read",
        "Total Tokens",
        "Cost (USD)",
    ]
    aligns = ["left", "left", "right", "right", "right", "right", "right", "right"]

    widths = []
    for idx, header in enumerate(headers):
        max_len = len(header)
        for row in rows + [total_row]:
            if idx < len(row):
                max_len = max(max_len, len(row[idx]))
        widths.append(max_len + 2)

    lines = list(header_lines)
    lines.append(_border(widths))
    lines.append(_row(headers, widths, aligns))
    lines.append(_border(widths))

    row_index = 0
    for count in day_row_counts:
        for _ in range(count):
            lines.append(_row(rows[row_index], widths, aligns))
            row_index += 1
        lines.append(_border(widths))

    lines.append(_row(total_row, widths, aligns))
    lines.append(_border(widths))

    return "\n".join(lines)


def build_json(
    daily: Dict[str, DailyUsage],
    period_label: str,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """Build JSON output structure."""
    total_sessions = sum(d.sessions for d in daily.values())
    total_usage = UsageRecord()
    for d in daily.values():
        total_usage = total_usage + d.usage

    return {
        "period": period_label,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "sessions": total_sessions,
        "totals": {
            "loggedCostUSD": round(total_usage.logged_cost, 2),
            "apiEquivalentCostUSD": round(total_usage.api_equivalent_cost, 2),
            "tokens": total_usage.total_tokens,
            "inputTokens": total_usage.input_tokens,
            "outputTokens": total_usage.output_tokens,
            "cacheRead": total_usage.cache_read,
            "cacheWrite": total_usage.cache_write,
        },
        "daily": [
            {
                "date": d.date,
                "sessions": d.sessions,
                "loggedCostUSD": round(d.usage.logged_cost, 2),
                "apiEquivalentCostUSD": round(d.usage.api_equivalent_cost, 2),
                "tokens": d.usage.total_tokens,
                "inputTokens": d.usage.input_tokens,
                "outputTokens": d.usage.output_tokens,
                "cacheRead": d.usage.cache_read,
                "cacheWrite": d.usage.cache_write,
                "models": sorted(d.models),
            }
            for d in sorted(daily.values(), key=lambda x: x.date, reverse=True)
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Analyze Clawdbot token usage and costs from session logs."
    )
    parser.add_argument(
        "period",
        nargs="?",
        default="today",
        help="Period: today, week, month, all, YYYY-MM-DD, or YYYY-MM-DD..YYYY-MM-DD",
    )
    parser.add_argument(
        "--days",
        type=int,
        help="Limit to last N days (overrides period).",
    )
    parser.add_argument(
        "--agent",
        default="all",
        help="Agent to analyze: default, main, or all (default: all).",
    )
    parser.add_argument(
        "--dir",
        help="Clawdbot directory (default: ~/.clawdbot).",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text).",
    )
    parser.add_argument(
        "--cost-mode",
        choices=["display", "calculate", "auto"],
        default="auto",
        help="Cost calculation mode (default: auto).",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    parser.add_argument(
        "--pricing-source",
        choices=["builtin", "ccusage"],
        default="builtin",
        help="Pricing source for calculated costs (default: builtin).",
    )
    parser.add_argument(
        "--ccusage-offline",
        action="store_true",
        help="Use ccusage offline pricing data when --pricing-source ccusage.",
    )

    args = parser.parse_args()

    # Determine base directory
    if args.dir:
        base_dir = Path(args.dir).expanduser()
    else:
        base_dir = Path(os.environ.get("CLAWDBOT_DIR", str(Path.home() / ".clawdbot"))).expanduser()

    if not base_dir.exists():
        eprint(f"Clawdbot directory not found: {base_dir}")
        return 1

    # Calculate date range
    if args.days is not None and args.days < 1:
        eprint("--days must be >= 1.")
        return 1

    try:
        start_date, end_date = get_date_range(args.period, args.days)
    except ValueError as e:
        eprint(str(e))
        return 1

    # Build period label
    if args.days:
        period_label = f"Last {args.days} days"
    elif args.period == "today":
        period_label = f"Today ({date.today().isoformat()})"
    elif args.period == "week":
        period_label = f"Last 7 days ({start_date} to {end_date})"
    elif args.period == "month":
        period_label = f"Last 30 days ({start_date} to {end_date})"
    elif args.period == "all":
        period_label = "All time"
    else:
        period_label = args.period

    # Aggregate usage data
    if args.pricing_source == "ccusage" and args.cost_mode != "calculate":
        eprint("--pricing-source ccusage requires --cost-mode calculate.")
        return 1

    try:
        daily = aggregate_usage(
            base_dir,
            args.agent,
            start_date,
            end_date,
            args.cost_mode,
            args.pricing_source,
            args.ccusage_offline,
        )
    except RuntimeError as exc:
        eprint(str(exc))
        return 1

    # Output
    if args.format == "json":
        output = build_json(daily, period_label, start_date, end_date)
        indent = 2 if args.pretty else None
        print(json.dumps(output, indent=indent))
    else:
        print(render_text(daily, period_label))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
