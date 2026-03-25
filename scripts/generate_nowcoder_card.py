#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from urllib import request


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def fetch(url: str) -> tuple[bytes, str]:
    req = request.Request(url, headers={"User-Agent": USER_AGENT})
    with request.urlopen(req, timeout=30) as resp:
        return resp.read(), resp.headers.get_content_type()


def extract(pattern: str, text: str, default: str = "N/A") -> str:
    match = re.search(pattern, text, re.S)
    if not match:
        return default
    return html.unescape(match.group(1).strip())

def rating_palette(rating_text: str) -> tuple[str, str, str]:
    match = re.search(r"\d+", rating_text)
    rating_value = int(match.group()) if match else 0

    if rating_value >= 2400:
        return ("#fb7185", "#ef4444", "#fecdd3")
    if rating_value >= 2100:
        return ("#f59e0b", "#ea580c", "#fdba74")
    if rating_value >= 1800:
        return ("#a78bfa", "#7c3aed", "#ddd6fe")
    if rating_value >= 1600:
        return ("#60a5fa", "#2563eb", "#bfdbfe")
    if rating_value >= 1400:
        return ("#22d3ee", "#0891b2", "#a5f3fc")
    if rating_value >= 1200:
        return ("#34d399", "#059669", "#a7f3d0")
    return ("#94a3b8", "#475569", "#cbd5e1")


def render_card(data: dict[str, str]) -> str:
    username = html.escape(data["username"])
    rating = html.escape(data["rating"])
    max_rating = html.escape(data["max_rating"])
    contests = html.escape(data["total_contests"])
    solved = html.escape(data["problems_solved"])
    followers = html.escape(data["followers"])
    accent_start, accent_end, accent_soft = rating_palette(data["rating"])

    stat_boxes = [
        ("Contests", contests, "#f59e0b"),
        ("Problems Solved", solved, "#22c55e"),
        ("Followers", followers, "#fb7185"),
    ]

    stat_svg = []
    positions = [
        (44, 188),
        (224, 188),
        (404, 188),
    ]

    for (label, value, color), (x, y) in zip(stat_boxes, positions, strict=True):
        label_escaped = html.escape(label)
        value_escaped = html.escape(value)
        stat_svg.append(
            f"""
    <g transform="translate({x},{y})">
      <rect width="152" height="60" rx="16" fill="#111827" stroke="#263041" />
      <rect x="16" y="18" width="5" height="24" rx="2.5" fill="{color}" />
      <text x="30" y="25" fill="#8b9bb4" font-size="11" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">{label_escaped}</text>
      <text x="30" y="45" fill="#f8fafc" font-size="22" font-weight="700" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">{value_escaped}</text>
    </g>"""
        )

    return f"""<svg width="600" height="270" viewBox="0 0 600 270" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">NowCoder Stats Card</title>
  <desc id="desc">NowCoder contest profile card for {username}</desc>
  <defs>
    <linearGradient id="bg" x1="22" y1="18" x2="578" y2="252" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0d1117" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="accent" x1="30" y1="26" x2="570" y2="26" gradientUnits="userSpaceOnUse">
      <stop stop-color="{accent_start}" />
      <stop offset="1" stop-color="{accent_end}" />
    </linearGradient>
    <linearGradient id="brandFill" x1="44" y1="40" x2="80" y2="76" gradientUnits="userSpaceOnUse">
      <stop stop-color="#34d399" />
      <stop offset="1" stop-color="#10b981" />
    </linearGradient>
  </defs>

  <rect x="10" y="10" width="580" height="250" rx="22" fill="url(#bg)" />
  <rect x="10.5" y="10.5" width="579" height="249" rx="21.5" stroke="#30363d" />
  <rect x="24" y="24" width="552" height="5" rx="2.5" fill="url(#accent)" />
  <rect x="44" y="40" width="36" height="36" rx="12" fill="#0f1f17" stroke="#1d3d2f" />
  <rect x="52" y="48" width="20" height="20" rx="8" fill="url(#brandFill)" />
  <text x="62" y="62" text-anchor="middle" fill="#052e1b" font-size="11" font-weight="800" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">N</text>
  <text x="94" y="58" fill="#f8fafc" font-size="18" font-weight="700" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">NowCoder</text>
  <text x="94" y="74" fill="#8b9bb4" font-size="11" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">Contest Stats</text>
  <text x="44" y="106" fill="#f8fafc" font-size="28" font-weight="700" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">{username}</text>
  <text x="44" y="128" fill="#8b9bb4" font-size="12" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">Competitive Programming Stats</text>

  <g transform="translate(44,136)">
    <rect width="246" height="34" rx="17" fill="#0b1220" stroke="#1f2937" />
    <text x="20" y="21" fill="#8b9bb4" font-size="11" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">Max Rating</text>
    <text x="226" y="23" text-anchor="end" fill="{accent_soft}" font-size="20" font-weight="700" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">{max_rating}</text>
  </g>
  <g transform="translate(310,136)">
    <rect width="246" height="34" rx="17" fill="#0b1220" stroke="#1f2937" />
    <text x="20" y="21" fill="#8b9bb4" font-size="11" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">Current Rating</text>
    <text x="226" y="23" text-anchor="end" fill="#f8fafc" font-size="20" font-weight="700" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">{rating}</text>
  </g>

  {''.join(stat_svg)}
</svg>
"""


def parse_profile(html_text: str) -> dict[str, str]:
    username = extract(r'data-title="([^"]+)"', html_text, "NowCoder User")
    rating = extract(
        r'<div class="my-state-item">\s*<div class="state-num[^"]*">([^<]+)</div>\s*<span>Rating</span>',
        html_text,
    )
    total_contests = extract(
        r'<div class="my-state-item">\s*<div class="state-num">([^<]+)</div>\s*<span>次比赛</span>',
        html_text,
    )
    social_match = re.search(
        r'<div><a href="/sns/\d+/following">([^<]+)</a>\s*<span class="status-item-pipe">/</span>\s*<a href="/sns/\d+/followers">([^<]+)</a></div>\s*<span>关注/粉丝</span>',
        html_text,
        re.S,
    )
    if social_match:
        followers = html.unescape(social_match.group(2).strip())
    else:
        followers = "N/A"

    return {
        "username": username,
        "rating": rating,
        "total_contests": total_contests,
        "followers": followers,
    }


def parse_practice(html_text: str) -> dict[str, str]:
    solved = extract(
        r'<div class="my-state-item"[^>]*>\s*<div class="state-num">([^<]+)</div>\s*<span>题已通过</span>',
        html_text,
    )
    return {
        "problems_solved": solved,
    }


def parse_rating_history(raw_json: str) -> dict[str, str]:
    payload = json.loads(raw_json)
    entries = payload.get("data") or []
    max_rating_value = 0

    for entry in entries:
        rating = entry.get("rating")
        if rating is None:
            continue
        max_rating_value = max(max_rating_value, int(round(float(rating))))

    return {
        "max_rating": str(max_rating_value) if max_rating_value else "N/A",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a NowCoder profile SVG card.")
    parser.add_argument("--profile-id", default="736728226", help="NowCoder contest profile id")
    parser.add_argument(
        "--output",
        default="assets/nowcoder-card.svg",
        help="Output SVG path",
    )
    args = parser.parse_args()

    profile_url = f"https://ac.nowcoder.com/acm/contest/profile/{args.profile_id}"
    practice_url = f"{profile_url}/practice-coding"
    rating_history_url = f"https://ac.nowcoder.com/acm/contest/rating-history?uid={args.profile_id}"

    profile_bytes, _ = fetch(profile_url)
    practice_bytes, _ = fetch(practice_url)
    rating_history_bytes, _ = fetch(rating_history_url)

    data: dict[str, str] = {}
    data.update(parse_profile(profile_bytes.decode("utf-8", errors="ignore")))
    data.update(parse_practice(practice_bytes.decode("utf-8", errors="ignore")))
    data.update(parse_rating_history(rating_history_bytes.decode("utf-8", errors="ignore")))

    svg = render_card(data)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg, encoding="utf-8")
    print(f"Generated {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
