#!/usr/bin/env node
// scripts/tasks.mjs
//
// Tiny CLI helper for ROADMAP_TASKS.md
//
// Usage:
//   node scripts/tasks.mjs list
//   node scripts/tasks.mjs list --status=todo|in-progress|done|✅|🟡|⏳
//   node scripts/tasks.mjs show PLAN-003
//   node scripts/tasks.mjs summary
//
// This does *not* modify any files. You still edit the markdown by hand.
// It just makes it easier to see what's open / in progress / done.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assuming: repo root has /docs/ROADMAP_TASKS.md and /scripts/tasks.mjs
const TASKS_PATH = path.resolve(__dirname, "..", "docs", "ROADMAP_TASKS.md");

function parseTasks(text) {
  // Split into blocks starting with "### [TASK-ID]"
  const sections = text.split(/\n(?=### \[)/);
  const tasks = [];

  for (const sec of sections) {
    const block = sec.trim();
    if (!block.startsWith("### [")) continue;

    const lines = block.split("\n");
    const heading = lines[0] ?? "";
    const m = heading.match(/^### \[([^\]]+)\]\s*(.+)$/);

    if (!m) continue;

    const id = m[1].trim();
    const title = m[2].trim();

    const statusMatch = block.match(/\*\*Status:\*\*\s*([^\n]+)/);
    let statusRaw = statusMatch ? statusMatch[1].trim() : "";
    statusRaw = statusRaw.replace(/\s+$/, "");

    const emojiMatch = statusRaw.match(/(✅|🟡|⏳)/);
    const emoji = emojiMatch ? emojiMatch[1] : "?";

    let statusLabel = "unknown";
    switch (emoji) {
      case "✅":
        statusLabel = "done";
        break;
      case "🟡":
        statusLabel = "in-progress";
        break;
      case "⏳":
        statusLabel = "todo";
        break;
      default:
        statusLabel = "unknown";
        break;
    }

    tasks.push({ id, title, emoji, statusLabel, block });
  }

  return tasks;
}

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [k, v] = arg.slice(2).split("=");
      flags[k] = v ?? true;
    }
  }
  return flags;
}

function printTaskRow(t) {
  const idPad = t.id.padEnd(14, " ");
  console.log(`${t.emoji}  ${idPad} ${t.title}`);
}

async function main() {
  let text;
  try {
    text = fs.readFileSync(TASKS_PATH, "utf8");
  } catch (err) {
    console.error("[tasks] Failed to read", TASKS_PATH);
    console.error("         ", err.message);
    process.exit(1);
  }

  const tasks = parseTasks(text);
  if (!tasks.length) {
    console.log("[tasks] No tasks found in ROADMAP_TASKS.md");
    return;
  }

  const [, , cmd = "list", ...rest] = process.argv;
  const flags = parseFlags(rest);

  if (cmd === "list") {
    let filtered = tasks;
    const status = flags.status || flags.s;
    if (status) {
      const norm = String(status).toLowerCase();

      filtered = tasks.filter((t) => {
        if (t.emoji === status) return true;
        if (t.statusLabel === norm) return true;
        if (norm === "done" && t.emoji === "✅") return true;
        if (norm.startsWith("in") && t.emoji === "🟡") return true;
        if (norm === "todo" && t.emoji === "⏳") return true;
        return false;
      });
    }

    filtered.forEach(printTaskRow);
    if (!filtered.length) {
      console.log("[tasks] No tasks matched that filter.");
    }
  } else if (cmd === "show") {
    const idArg = rest.find((a) => !a.startsWith("--"));
    if (!idArg) {
      console.error("Usage: node scripts/tasks.mjs show <TASK-ID>");
      process.exit(1);
    }

    const task = tasks.find(
      (t) => t.id.toLowerCase() === idArg.toLowerCase(),
    );
    if (!task) {
      console.error("[tasks] Task not found:", idArg);
      process.exit(1);
    }

    console.log(task.block);
  } else if (cmd === "summary") {
    const counts = {
      todo: 0,
      "in-progress": 0,
      done: 0,
      unknown: 0,
    };

    for (const t of tasks) {
      counts[t.statusLabel] = (counts[t.statusLabel] || 0) + 1;
    }

    console.log("Task summary:");
    console.log(`  ⏳  todo:        ${counts.todo}`);
    console.log(`  🟡  in-progress: ${counts["in-progress"]}`);
    console.log(`  ✅  done:        ${counts.done}`);
    if (counts.unknown) {
      console.log(`  ?   unknown:     ${counts.unknown}`);
    }
  } else {
    console.log("Usage:");
    console.log(
      "  node scripts/tasks.mjs list [--status=todo|in-progress|done|✅|🟡|⏳]",
    );
    console.log("  node scripts/tasks.mjs show <TASK-ID>");
    console.log("  node scripts/tasks.mjs summary");
  }
}

main().catch((err) => {
  console.error("[tasks] Unexpected error:", err);
  console.error(err);
  process.exit(1);
});
