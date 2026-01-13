#!/usr/bin/env python3
"""
Spotify embed helper - search tracks and generate embeddable links.
Optionally save to ppl.gift journal with embedded player.

Usage:
    spotify-embed.py search "query"              # Search and show results
    spotify-embed.py embed <track_id>            # Get embed URL for track
    spotify-embed.py journal "query" "title"     # Search, pick first, save to journal
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request

PPL_API_TOKEN = os.environ.get("PPL_API_TOKEN")
PPL_API_URL = "https://ppl.gift/api"


def search_tracks(query: str, limit: int = 10) -> list:
    """Search Spotify for tracks via spogo."""
    result = subprocess.run(
        ["spogo", "search", "track", query, "--json", "--no-input"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error searching: {result.stderr}", file=sys.stderr)
        return []
    
    data = json.loads(result.stdout)
    return data.get("items", [])[:limit]


def get_track_info(track_id: str) -> dict:
    """Get track info via spogo."""
    result = subprocess.run(
        ["spogo", "track", "info", track_id, "--json"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error getting track: {result.stderr}", file=sys.stderr)
        return {}
    
    return json.loads(result.stdout)


def get_embed_url(track_id: str) -> str:
    """Generate Spotify embed URL for a track."""
    return f"https://open.spotify.com/embed/track/{track_id}"


def get_open_url(track_id: str) -> str:
    """Generate Spotify open URL for a track."""
    return f"https://open.spotify.com/track/{track_id}"


def save_to_journal(title: str, body: str) -> dict:
    """Save entry to ppl.gift journal."""
    if not PPL_API_TOKEN:
        print("Error: PPL_API_TOKEN not set", file=sys.stderr)
        return {}
    
    data = json.dumps({"title": title, "post": body}).encode("utf-8")
    req = urllib.request.Request(
        f"{PPL_API_URL}/journal",
        data=data,
        headers={
            "Authorization": f"Bearer {PPL_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Error saving to journal: {e}", file=sys.stderr)
        return {}


def format_track(track: dict, show_embed: bool = True) -> str:
    """Format track info for display."""
    lines = [
        f"🎵 {track['name']}",
        f"   Album: {track.get('album', 'Unknown')}",
        f"   URL: {track['url']}",
    ]
    if show_embed:
        lines.append(f"   Embed: {get_embed_url(track['id'])}")
    return "\n".join(lines)


def cmd_search(args):
    """Search command."""
    tracks = search_tracks(args.query, args.limit)
    if not tracks:
        print("No tracks found.")
        return
    
    print(f"Found {len(tracks)} tracks:\n")
    for i, track in enumerate(tracks, 1):
        print(f"{i}. {format_track(track)}\n")
    
    # Output JSON if requested
    if args.json:
        print("\n--- JSON ---")
        print(json.dumps(tracks, indent=2))


def cmd_embed(args):
    """Embed command - get embed URL for a track."""
    track_id = args.track_id
    
    # If it's a full URL, extract the ID
    if "spotify.com" in track_id:
        track_id = track_id.split("/")[-1].split("?")[0]
    
    embed_url = get_embed_url(track_id)
    open_url = get_open_url(track_id)
    
    print(f"Track ID: {track_id}")
    print(f"Open URL: {open_url}")
    print(f"Embed URL: {embed_url}")
    print(f"\nHTML embed:")
    print(f'<iframe src="{embed_url}" width="300" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>')


def get_embed_html(track_id: str) -> str:
    """Generate the proper HTML embed for ppl.gift journal."""
    return f'<div style="left: 0; width: 100%; height: 80px; position: relative;"><iframe src="https://open.spotify.com/embed/track/{track_id}?utm_source=oembed" style="top: 0; left: 0; width: 100%; height: 100%; position: absolute; border: 0;" allowfullscreen allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture;"></iframe></div>'


def cmd_journal(args):
    """Journal command - search, save to journal with embed."""
    tracks = search_tracks(args.query, 1)
    if not tracks:
        print("No tracks found.")
        return
    
    track = tracks[0]
    embed_html = get_embed_html(track["id"])
    
    # Build journal entry body
    body_parts = []
    if args.note:
        body_parts.append(args.note)
        body_parts.append("")
    
    body_parts.extend([
        f"🎵 **{track['name']}**",
        f"Album: {track.get('album', 'Unknown')}",
        "",
        embed_html,
    ])
    
    body = "\n".join(body_parts)
    
    print(f"Saving to journal...")
    print(f"Title: {args.title}")
    print(f"Track: {track['name']}")
    print(f"---")
    
    result = save_to_journal(args.title, body)
    if result and "data" in result:
        print(f"✓ Journal entry saved (ID: {result['data']['id']})")
        print(f"  {open_url}")
    else:
        print("Failed to save journal entry.")


def main():
    parser = argparse.ArgumentParser(description="Spotify embed helper")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search for tracks")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-n", "--limit", type=int, default=5, help="Max results")
    search_parser.add_argument("--json", action="store_true", help="Output JSON")
    search_parser.set_defaults(func=cmd_search)
    
    # Embed command
    embed_parser = subparsers.add_parser("embed", help="Get embed URL for track")
    embed_parser.add_argument("track_id", help="Track ID or URL")
    embed_parser.set_defaults(func=cmd_embed)
    
    # Journal command
    journal_parser = subparsers.add_parser("journal", help="Save track to journal")
    journal_parser.add_argument("query", help="Search query")
    journal_parser.add_argument("title", help="Journal entry title")
    journal_parser.add_argument("-m", "--note", help="Additional note text")
    journal_parser.set_defaults(func=cmd_journal)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
