#!/usr/bin/env python3
"""
Sync maintainers and contributors in docs/reference/credits.md from git/GitHub.

- Maintainers: people who have merged PRs (via GitHub API) + direct pushes to main
- Contributors: all unique commit authors on main with commit counts

Usage: python scripts/sync-credits.py
"""

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
CREDITS_FILE = REPO_ROOT / "docs" / "reference" / "credits.md"
REPO = "openclaw/openclaw"

# Exclude bot accounts from maintainer list
EXCLUDED_MAINTAINERS = {
    "app/clawdinator",
    "clawdinator",
    "github-actions",
    "dependabot",
}

# Exclude bot/system names from contributor list
EXCLUDED_CONTRIBUTORS = {
    "GitHub",
    "github-actions[bot]",
    "dependabot[bot]",
    "clawdinator[bot]",
    "blacksmith-sh[bot]",
    "google-labs-jules[bot]",
    "Maude Bot",
    "Pocket Clawd",
    "Ghost",
    "Gregor's Bot",
    "Jarvis",
    "Jarvis Deploy",
    "CI",
    "Ubuntu",
    "user",
    "Developer",
}

# Minimum merged PRs to be considered a maintainer
MIN_MERGES = 2


def run_git(*args: str) -> str:
    """Run git command and return stdout."""
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return result.stdout.strip()


def run_gh(*args: str) -> str:
    """Run gh CLI command and return stdout."""
    result = subprocess.run(
        ["gh", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return result.stdout.strip()


def get_maintainers() -> list[tuple[str, int, int]]:
    """Get maintainers with (login, merge_count, direct_push_count).

    - Merges: from GitHub API (who clicked "merge")
    - Direct pushes: non-merge commits to main (by committer name matching login)
    """
    # 1. Fetch ALL merged PRs using gh pr list (handles pagination automatically)
    print("  Fetching merged PRs from GitHub API...")
    output = run_gh(
        "pr",
        "list",
        "--repo",
        REPO,
        "--state",
        "merged",
        "--limit",
        "10000",
        "--json",
        "mergedBy",
        "--jq",
        ".[].mergedBy.login",
    )

    merge_counts: dict[str, int] = {}
    if output:
        for login in output.strip().splitlines():
            login = login.strip()
            if login and login not in EXCLUDED_MAINTAINERS:
                merge_counts[login] = merge_counts.get(login, 0) + 1

    print(
        f"  Found {sum(merge_counts.values())} merged PRs by {len(merge_counts)} users"
    )

    # 2. Count direct pushes (non-merge commits by committer)
    print("  Counting direct pushes from git history...")
    push_counts: dict[str, int] = {}
    output = run_git("log", "main", "--no-merges", "--format=%cN")
    for name in output.splitlines():
        name = name.strip()
        if name and name not in EXCLUDED_CONTRIBUTORS:
            # Normalize to lowercase for matching
            key = name.lower()
            push_counts[key] = push_counts.get(key, 0) + 1

    # 3. Build maintainer list: anyone with merges >= MIN_MERGES
    maintainers: list[tuple[str, int, int]] = []

    for login, merges in merge_counts.items():
        if merges >= MIN_MERGES:
            # Try to find matching push count (case-insensitive)
            pushes = push_counts.get(login.lower(), 0)
            maintainers.append((login, merges, pushes))

    # Sort by total activity (merges + pushes) descending
    maintainers.sort(key=lambda x: (-(x[1] + x[2]), x[0].lower()))
    return maintainers


def get_contributors() -> list[tuple[str, int]]:
    """Get all unique commit authors on main with commit counts."""
    output = run_git("log", "main", "--format=%aN")
    if not output:
        return []

    # Count commits per author, case-insensitive dedup
    counts: dict[str, int] = {}
    canonical: dict[str, str] = {}
    for name in output.splitlines():
        name = name.strip()
        if not name or name in EXCLUDED_CONTRIBUTORS:
            continue
        key = name.lower()
        counts[key] = counts.get(key, 0) + 1
        # Prefer capitalized version
        if key not in canonical or (
            name[0].isupper() and not canonical[key][0].isupper()
        ):
            canonical[key] = name

    # Build list with counts, sorted by count descending then name
    contributors = [(canonical[key], count) for key, count in counts.items()]
    contributors.sort(key=lambda x: (-x[1], x[0].lower()))
    return contributors


def update_credits(
    maintainers: list[tuple[str, int, int]], contributors: list[tuple[str, int]]
) -> None:
    """Update the credits.md file with maintainers and contributors."""
    content = CREDITS_FILE.read_text(encoding="utf-8")

    # Build maintainers section (GitHub usernames with profile links)
    maintainer_lines = []
    for login, merges, pushes in maintainers:
        if pushes > 0:
            line = f"- [@{login}](https://github.com/{login}) ({merges} merges, {pushes} direct pushes)"
        else:
            line = f"- [@{login}](https://github.com/{login}) ({merges} merges)"
        maintainer_lines.append(line)

    maintainer_section = (
        "\n".join(maintainer_lines)
        if maintainer_lines
        else "_No maintainers detected._"
    )

    # Build contributors section with commit counts
    contributor_lines = [f"{name} ({count})" for name, count in contributors]
    contributor_section = (
        ", ".join(contributor_lines)
        if contributor_lines
        else "_No contributors detected._"
    )
    contributor_section = f"{len(contributors)} contributors: {contributor_section}"

    # Replace sections by finding markers and rebuilding
    lines = content.split("\n")
    result = []
    skip_until_next_section = False
    i = 0

    while i < len(lines):
        line = lines[i]

        if line == "## Maintainers":
            result.append(line)
            result.append("")
            result.append(maintainer_section)
            skip_until_next_section = True
            i += 1
            continue

        if line == "## Contributors":
            result.append("")
            result.append(line)
            result.append("")
            result.append(contributor_section)
            skip_until_next_section = True
            i += 1
            continue

        # Check if we hit the next section
        if skip_until_next_section and (
            line.startswith("## ") or line.startswith("> ")
        ):
            skip_until_next_section = False
            result.append("")  # blank line before next section

        if not skip_until_next_section:
            result.append(line)

        i += 1

    content = "\n".join(result)
    CREDITS_FILE.write_text(content, encoding="utf-8")
    print(f"Updated {CREDITS_FILE}")
    print(f"  Maintainers: {len(maintainers)}")
    print(f"  Contributors: {len(contributors)}")


def main() -> None:
    print("Syncing credits from git/GitHub...")
    maintainers = get_maintainers()
    contributors = get_contributors()
    update_credits(maintainers, contributors)


if __name__ == "__main__":
    main()
