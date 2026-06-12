/** Bump a semver string by level. @param {string} current @param {"patch"|"minor"|"major"} level */
export function bumpVersion(current, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`invalid semver: ${current}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`invalid bump level: ${level}`);
}

const TASK_SUFFIX = /\s*\(TASK-\d+\)\s*$/i;

/** Parse a conventional-commit subject; null if it doesn't match. */
export function parseConventional(subject) {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
  if (!m) return null;
  const [, type, scope, bang, descRaw] = m;
  return {
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: Boolean(bang),
    description: descRaw.replace(TASK_SUFFIX, "").trim(),
  };
}

const GROUPS = [
  { type: "feat", heading: "Features" },
  { type: "fix", heading: "Bug Fixes" },
  { type: "perf", heading: "Performance" },
  { type: "revert", heading: "Reverts" },
];

/** Build one CHANGELOG section (markdown, trailing newline). */
export function buildChangelogSection({ version, date, subjects = [], isFirstRelease = false }) {
  const header = `## ${version} — ${date}`;
  if (isFirstRelease) return `${header}\n\nInitial public release.\n`;

  const parsed = subjects.map(parseConventional).filter(Boolean);
  const lines = [header, ""];
  let any = false;
  for (const { type, heading } of GROUPS) {
    const entries = parsed.filter((c) => c.type === type);
    if (entries.length === 0) continue;
    any = true;
    lines.push(`### ${heading}`, "");
    for (const c of entries) lines.push(`- ${c.scope ? `**${c.scope}:** ` : ""}${c.description}`);
    lines.push("");
  }
  if (!any) lines.push("_No user-facing changes._", "");
  return lines.join("\n");
}

/**
 * Derive the semver bump level from conventional-commit subjects.
 * Breaking change -> major; any feat -> minor; any fix/perf/revert -> patch.
 * Returns null when nothing user-facing changed (no release warranted).
 */
export function deriveBump(subjects = []) {
  const parsed = subjects.map(parseConventional).filter(Boolean);
  if (parsed.some((c) => c.breaking)) return "major";
  if (parsed.some((c) => c.type === "feat")) return "minor";
  if (parsed.some((c) => c.type === "fix" || c.type === "perf" || c.type === "revert")) {
    return "patch";
  }
  return null;
}

/** Replace the top-level "version" string in JSON text, leaving all other formatting intact. */
export function setVersionInJson(jsonText, version) {
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(jsonText)) throw new Error('no "version" field found');
  return jsonText.replace(re, `$1${version}$2`);
}
