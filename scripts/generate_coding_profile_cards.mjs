#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const CONFIG_PATH = path.join(REPO_ROOT, "assets", "coding-profiles", "config.json");
const SAMPLE_DATA_PATH = path.join(REPO_ROOT, "assets", "coding-profiles", "sample-data.json");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "assets", "coding-profiles", "generated");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const options = {
    mode: "sample",
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mode") {
      options.mode = argv[index + 1] ?? options.mode;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = path.resolve(REPO_ROOT, argv[index + 1] ?? options.outputDir);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Generate Coding Profiles SVG cards.

Usage:
  node scripts/generate_coding_profile_cards.mjs [--mode sample|live] [--output-dir <dir>]

Examples:
  node scripts/generate_coding_profile_cards.mjs --mode sample
  node scripts/generate_coding_profile_cards.mjs --mode live --output-dir ./tmp/cards
`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeHtml(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseCharset(contentType, fallback = "utf-8") {
  const match = /charset=([^;]+)/i.exec(contentType ?? "");
  const charset = (match?.[1] ?? fallback).trim().toLowerCase();

  if (charset === "gbk" || charset === "gb2312") {
    return "gb18030";
  }

  return charset;
}

async function fetchBuffer(url, fallbackCharset = "utf-8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const charset = parseCharset(response.headers.get("content-type"), fallbackCharset);

  try {
    return {
      body: new TextDecoder(charset).decode(buffer),
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch {
    return {
      body: new TextDecoder("utf-8").decode(buffer),
      contentType: response.headers.get("content-type") ?? "",
    };
  }
}

function extractMatch(pattern, text, fallback = "N/A") {
  const match = pattern.exec(text);
  return match ? decodeHtml(match[1].trim()) : fallback;
}

function normalizeSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return normalizeSpace(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => escapeXml(data[key] ?? ""));
}

function parseNowCoderStateItems(html) {
  const items = [];
  const pattern =
    /<div class="my-state-item"[^>]*>\s*<div class="state-num[^"]*"[^>]*>([^<]+)<\/div>\s*<span>([^<]+)<\/span>/gs;

  for (const match of html.matchAll(pattern)) {
    items.push({
      value: normalizeSpace(decodeHtml(match[1])),
      label: normalizeSpace(decodeHtml(match[2])),
    });
  }

  return items;
}

function pickNowCoderItem(items, candidates, fallback = "N/A") {
  const entry = items.find((item) => candidates.some((candidate) => item.label.includes(candidate)));
  return entry?.value ?? fallback;
}

function parseNowCoderProfile(html) {
  const items = parseNowCoderStateItems(html);
  const socialMatch =
    /<a href="\/sns\/\d+\/following">([^<]+)<\/a>\s*<span class="status-item-pipe">\/<\/span>\s*<a href="\/sns\/\d+\/followers">([^<]+)<\/a>/s.exec(
      html,
    );

  return {
    username: extractMatch(/data-title="([^"]+)"/s, html, "NowCoder User"),
    currentRating: pickNowCoderItem(items, ["Rating"], "N/A"),
    contests: pickNowCoderItem(items, ["\u6bd4\u8d5b"], "N/A"),
    followers: socialMatch ? normalizeSpace(decodeHtml(socialMatch[2])) : "N/A",
  };
}

function parseNowCoderPractice(html) {
  const items = parseNowCoderStateItems(html);
  return {
    solved: pickNowCoderItem(items, ["\u901a\u8fc7", "\u9898"], "N/A"),
  };
}

function parseNowCoderMaxRating(rawJson) {
  const payload = JSON.parse(rawJson);
  const history = Array.isArray(payload?.data) ? payload.data : [];
  const maxRating = history.reduce((highest, entry) => {
    const nextRating = Number(entry?.rating);
    return Number.isFinite(nextRating) ? Math.max(highest, Math.round(nextRating)) : highest;
  }, 0);

  return maxRating > 0 ? String(maxRating) : "N/A";
}

async function buildNowCoderCardData(cardConfig) {
  const profileUrl = `https://ac.nowcoder.com/acm/contest/profile/${cardConfig.profileId}`;
  const practiceUrl = `${profileUrl}/practice-coding`;
  const ratingHistoryUrl = `https://ac.nowcoder.com/acm/contest/rating-history?uid=${cardConfig.profileId}`;

  const [profileResponse, practiceResponse, historyResponse] = await Promise.all([
    fetchBuffer(profileUrl, "gb18030"),
    fetchBuffer(practiceUrl, "gb18030"),
    fetchBuffer(ratingHistoryUrl, "utf-8"),
  ]);

  const profile = parseNowCoderProfile(profileResponse.body);
  const practice = parseNowCoderPractice(practiceResponse.body);
  const maxRating = parseNowCoderMaxRating(historyResponse.body);

  return {
    metaTitle: "NowCoder Stats Card",
    desc: `NowCoder contest profile card for ${profile.username}`,
    username: profile.username,
    profileLine: "NowCoder Contest Profile",
    primaryLabel: "Current Rating",
    primaryValue: profile.currentRating,
    primaryHint: "live",
    secondaryLabel: "Max Rating",
    secondaryValue: maxRating,
    secondaryHint: "peak",
    stat1Label: "Contests",
    stat1Value: profile.contests,
    stat2Label: "Solved",
    stat2Value: practice.solved,
    stat3Label: "Followers",
    stat3Value: profile.followers,
  };
}

function countSolvedProblems(submissions) {
  const solved = new Set();

  for (const submission of submissions) {
    if (submission?.verdict !== "OK" || !submission.problem) {
      continue;
    }

    const problem = submission.problem;
    const key = [problem.contestId ?? problem.problemsetName ?? "gym", problem.index ?? "", problem.name ?? ""].join(":");
    solved.add(key);
  }

  return solved.size;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  return response.json();
}

async function fetchLeetCodeGraphql(endpoint, query, variables, referer) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
      Referer: referer,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${endpoint}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(`LeetCode API returned errors: ${payload.errors.map((error) => error.message).join("; ")}`);
  }

  return payload.data ?? {};
}

async function buildCodeforcesCardData(cardConfig) {
  const handle = cardConfig.handle;
  const [infoPayload, ratingPayload, statusPayload] = await Promise.all([
    fetchJson(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`),
    fetchJson(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`),
    fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`),
  ]);

  if (infoPayload.status !== "OK" || ratingPayload.status !== "OK" || statusPayload.status !== "OK") {
    throw new Error("Codeforces API returned a non-OK status.");
  }

  const user = infoPayload.result?.[0] ?? {};
  const contests = Array.isArray(ratingPayload.result) ? ratingPayload.result.length : 0;
  const solved = countSolvedProblems(Array.isArray(statusPayload.result) ? statusPayload.result : []);
  const rank = titleCase(user.rank ?? "Unrated");
  const maxRank = titleCase(user.maxRank ?? user.rank ?? "Unrated");

  return {
    metaTitle: "Codeforces Stats Card",
    desc: `Codeforces profile card for ${user.handle ?? handle}`,
    username: user.handle ?? handle,
    profileLine: `${rank} / max ${maxRank}`,
    primaryLabel: "Current Rating",
    primaryValue: user.rating ?? "Unrated",
    primaryHint: rank,
    secondaryLabel: "Max Rating",
    secondaryValue: user.maxRating ?? user.rating ?? "Unrated",
    secondaryHint: maxRank,
    stat1Label: "Contests",
    stat1Value: String(contests),
    stat2Label: "Solved",
    stat2Value: String(solved),
    stat3Label: "Friends",
    stat3Value: String(user.friendOfCount ?? 0),
  };
}

function pickLeetCodeAcceptedCount(stats, difficulty) {
  const entry = stats.find((item) => item?.difficulty === difficulty);
  return String(entry?.count ?? 0);
}

function sumLeetCodeAcceptedCount(stats) {
  return String(stats.reduce((total, item) => total + (Number(item?.count) || 0), 0));
}

function formatNumber(value, fallback = "N/A", options = {}) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-US", options) : fallback;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLastPresent(items) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index] !== null && items[index] !== undefined) {
      return items[index];
    }
  }

  return null;
}

function titleCaseEnum(value) {
  return titleCase(String(value ?? "").replaceAll("_", " ").toLowerCase());
}

async function buildLeetCodeCardData(cardConfig) {
  const userSlug = cardConfig.userSlug ?? cardConfig.username;
  const isCnSite = cardConfig.site === "cn" || cardConfig.profileUrl?.includes("leetcode.cn");
  const endpoint = isCnSite ? "https://leetcode.cn/graphql/" : "https://leetcode.com/graphql";
  const referer = cardConfig.profileUrl ?? (isCnSite ? `https://leetcode.cn/u/${userSlug}/` : `https://leetcode.com/u/${userSlug}/`);

  if (isCnSite) {
    const data = await fetchLeetCodeGraphql(
      endpoint,
      `query leetCodeCnProfile($userSlug: String!) {
        userProfilePublicProfile(userSlug: $userSlug) {
          profile {
            userSlug
            realName
          }
        }
        userProfileUserQuestionProgressV2(userSlug: $userSlug) {
          numAcceptedQuestions {
            difficulty
            count
          }
        }
        userContestRanking(userSlug: $userSlug) {
          currentRatingRanking
          ratingHistory
          levelHistory
        }
      }`,
      { userSlug },
      referer,
    );

    const profile = data.userProfilePublicProfile?.profile;
    const contestRanking = data.userContestRanking;
    const acceptedStats = data.userProfileUserQuestionProgressV2?.numAcceptedQuestions ?? [];
    const ratingHistory = parseJsonArray(contestRanking?.ratingHistory);
    const levelHistory = parseJsonArray(contestRanking?.levelHistory);
    const attendedContests = ratingHistory.filter((rating) => rating !== null && rating !== undefined).length;
    const currentRating = getLastPresent(ratingHistory);
    const maxRating = ratingHistory.reduce((highest, rating) => {
      const value = Number(rating);
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);
    const currentLevel = titleCaseEnum(getLastPresent(levelHistory)) || "Contest";
    const rank = formatNumber(contestRanking?.currentRatingRanking);
    const easySolved = pickLeetCodeAcceptedCount(acceptedStats, "EASY");
    const mediumSolved = pickLeetCodeAcceptedCount(acceptedStats, "MEDIUM");
    const hardSolved = pickLeetCodeAcceptedCount(acceptedStats, "HARD");

    return {
      metaTitle: "LeetCode Stats Card",
      desc: `LeetCode China profile card for ${profile?.realName || profile?.userSlug || userSlug}`,
      username: profile?.realName || profile?.userSlug || userSlug,
      profileLine: "LeetCode China Contest Profile",
      primaryLabel: "Badge",
      primaryValue: currentLevel,
      primaryHint: `rank #${rank}`,
      secondaryLabel: "Contest Rating",
      secondaryValue: formatNumber(currentRating, "N/A", { useGrouping: false }),
      secondaryHint: `peak ${formatNumber(maxRating, "N/A", { useGrouping: false })}`,
      stat1Label: "Solved",
      stat1Value: sumLeetCodeAcceptedCount(acceptedStats),
      stat2Label: "E / M / H",
      stat2Value: `${easySolved} / ${mediumSolved} / ${hardSolved}`,
      stat3Label: "Contests",
      stat3Value: String(attendedContests),
    };
  }

  const data = await fetchLeetCodeGraphql(
    endpoint,
    `query leetCodeProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          ranking
        }
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
      }
    }`,
    { username: userSlug },
    referer,
  );

  const user = data.matchedUser;
  const contestRanking = data.userContestRanking;
  const acceptedStats = user?.submitStatsGlobal?.acSubmissionNum ?? [];
  const ranking = formatNumber(user?.profile?.ranking);
  const contests = formatNumber(contestRanking?.attendedContestsCount, "0");
  const contestRating = formatNumber(contestRanking?.rating, "N/A", { useGrouping: false });

  return {
    metaTitle: "LeetCode Stats Card",
    desc: `LeetCode profile card for ${user?.username ?? userSlug}`,
    username: user?.username ?? userSlug,
    profileLine: user ? `Rank #${ranking} / ${contests} contests` : "Problem Solving Stats",
    primaryLabel: "Contest Rating",
    primaryValue: contestRating,
    primaryHint: `rank #${ranking}`,
    secondaryLabel: "Solved",
    secondaryValue: pickLeetCodeAcceptedCount(acceptedStats, "All"),
    secondaryHint: `${contests} contests`,
    stat1Label: "Easy",
    stat1Value: pickLeetCodeAcceptedCount(acceptedStats, "Easy"),
    stat2Label: "Medium",
    stat2Value: pickLeetCodeAcceptedCount(acceptedStats, "Medium"),
    stat3Label: "Hard",
    stat3Value: pickLeetCodeAcceptedCount(acceptedStats, "Hard"),
  };
}

async function loadLiveData(config) {
  return {
    cards: {
      codeforces: await buildCodeforcesCardData(config.cards.codeforces),
      nowcoder: await buildNowCoderCardData(config.cards.nowcoder),
      leetcode: await buildLeetCodeCardData(config.cards.leetcode),
    },
  };
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function generateCards({ mode, outputDir }) {
  const config = await readJson(CONFIG_PATH);
  const dataset = mode === "live" ? await loadLiveData(config) : await readJson(SAMPLE_DATA_PATH);

  await ensureDirectory(outputDir);

  for (const [cardName, cardConfig] of Object.entries(config.cards)) {
    const templatePath = path.join(path.dirname(CONFIG_PATH), cardConfig.template);
    const outputPath = path.join(outputDir, cardConfig.output);
    const template = await fs.readFile(templatePath, "utf8");
    const cardData = dataset.cards?.[cardName];

    if (!cardData) {
      throw new Error(`Missing data for card "${cardName}".`);
    }

    const svg = renderTemplate(template, cardData);
    await fs.writeFile(outputPath, svg, "utf8");
    console.log(`Generated ${path.relative(REPO_ROOT, outputPath)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!["sample", "live"].includes(options.mode)) {
    throw new Error(`Unsupported mode "${options.mode}". Use "sample" or "live".`);
  }

  await generateCards(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
