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
    profileLine: "Competitive Programming Stats",
    summaryLeftLabel: "Max Rating",
    summaryLeftValue: maxRating,
    summaryRightLabel: "Current Rating",
    summaryRightValue: profile.currentRating,
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
    summaryLeftLabel: "Max Rating",
    summaryLeftValue: user.maxRating ?? user.rating ?? "Unrated",
    summaryRightLabel: "Current Rating",
    summaryRightValue: user.rating ?? "Unrated",
    stat1Label: "Contests",
    stat1Value: String(contests),
    stat2Label: "Solved",
    stat2Value: String(solved),
    stat3Label: "Friends",
    stat3Value: String(user.friendOfCount ?? 0),
  };
}

async function loadLiveData(config) {
  return {
    cards: {
      codeforces: await buildCodeforcesCardData(config.cards.codeforces),
      nowcoder: await buildNowCoderCardData(config.cards.nowcoder),
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
