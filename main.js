var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InboxTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/view.ts
var import_obsidian = require("obsidian");

// src/types.ts
var PRIORITY_LABELS = {
  0: "\u5FC5\u505A",
  1: "\u91CD\u8981",
  2: "\u4E00\u822C"
};

// src/parser.ts
function parseFlexibleDate(raw) {
  const trimmed = raw.trim();
  const fullTimeMatch = trimmed.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (fullTimeMatch) {
    return new Date(
      Number(fullTimeMatch[1]),
      Number(fullTimeMatch[2]) - 1,
      Number(fullTimeMatch[3]),
      Number(fullTimeMatch[4]),
      Number(fullTimeMatch[5])
    );
  }
  const shortTimeMatch = trimmed.match(/(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (shortTimeMatch) {
    const now = new Date();
    const month = Number(shortTimeMatch[1]) - 1;
    const day = Number(shortTimeMatch[2]);
    const hours = Number(shortTimeMatch[3]);
    const minutes = Number(shortTimeMatch[4]);
    let year = now.getFullYear();
    const candidate = new Date(year, month, day, hours, minutes);
    const diffDays = (candidate.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24);
    if (diffDays < -30) {
      year += 1;
    }
    return new Date(year, month, day, hours, minutes);
  }
  const fullMatch = trimmed.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (fullMatch) {
    return new Date(Number(fullMatch[1]), Number(fullMatch[2]) - 1, Number(fullMatch[3]), 23, 59);
  }
  const shortMatch = trimmed.match(/(\d{1,2})[-/](\d{1,2})/);
  if (shortMatch) {
    const now = new Date();
    const month = Number(shortMatch[1]) - 1;
    const day = Number(shortMatch[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, month, day, 23, 59);
    const diffDays = (candidate.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24);
    if (diffDays < -30) {
      year += 1;
    }
    return new Date(year, month, day, 23, 59);
  }
  return null;
}
function parseInboxFile(content, filePath) {
  var _a, _b;
  const lines = content.split("\n");
  let title = ((_a = filePath.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) || "Untitled";
  let priority = 2;
  let deadline = null;
  let deadlineDate = null;
  let description = "";
  let completedAt = null;
  let recurrence = null;
  let lastNotified = null;
  const todos = [];
  let hasDescriptionSection = false;
  let hasTodoSection = false;
  let hasQuickTag = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^# /.test(line) && title === ((_b = filePath.split("/").pop()) == null ? void 0 : _b.replace(".md", ""))) {
      title = line.replace(/^# /, "").trim();
    }
    const prioMatch = line.match(/\*\*优先级\*\*[：:]\s*(.+)/);
    if (prioMatch) {
      const p = prioMatch[1].trim();
      if (p.includes("\u5FC5\u505A"))
        priority = 0;
      else if (p.includes("\u91CD\u8981"))
        priority = 1;
      else
        priority = 2;
    }
    const deadlineMatch = line.match(/\*\*截止日期\*\*[：:]\s*(.+)/);
    if (deadlineMatch) {
      const raw = deadlineMatch[1].trim();
      deadline = raw;
      deadlineDate = parseFlexibleDate(raw);
    }
    const recurMatch = line.match(/\*\*循环\*\*[：:]\s*(.+)/);
    if (recurMatch) {
      recurrence = parseRecurrence(recurMatch[1].trim());
    }
    const lastNotifiedMatch = line.match(/\*\*上次提醒\*\*[：:]\s*(.+)/);
    if (lastNotifiedMatch) {
      lastNotified = lastNotifiedMatch[1].trim();
    }
    const completedMatch = line.match(/-?\s*\*\*完成时间\*\*[：:]\s*(.+)/);
    if (completedMatch) {
      completedAt = completedMatch[1].trim();
    }
    if (/^## 描述/.test(line))
      hasDescriptionSection = true;
    if (/^## 待办/.test(line))
      hasTodoSection = true;
    if (/任务类型.*：快速/.test(line))
      hasQuickTag = true;
    const todoMatch = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)/);
    if (todoMatch) {
      let text = todoMatch[3].trim();
      let todoPriority = 2;
      let todoCompletedAt = null;
      const doneMatch = text.match(/#done@(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
      if (doneMatch) {
        todoCompletedAt = doneMatch[1];
        text = text.replace(/#done@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/, "").trim();
      }
      const prioMap = { "#\u5FC5\u505A": 0, "#\u91CD\u8981": 1, "#\u4E00\u822C": 2 };
      for (const [tag, p] of Object.entries(prioMap)) {
        if (text.endsWith(tag)) {
          todoPriority = p;
          text = text.slice(0, -tag.length).trim();
          break;
        }
      }
      todos.push({ text, completed: todoMatch[2] !== " ", line: i, priority: todoPriority, completedAt: todoCompletedAt });
    }
  }
  let daysRemaining = null;
  let hoursRemaining = null;
  if (deadlineDate) {
    const now = new Date();
    hoursRemaining = Math.round((deadlineDate.getTime() - now.getTime()) / (1e3 * 60 * 60));
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dlDay = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    daysRemaining = Math.ceil((dlDay.getTime() - nowDay.getTime()) / (1e3 * 60 * 60 * 24));
  }
  const taskType = hasQuickTag ? "quick" : "full";
  return { filePath, title, priority, deadline, deadlineDate, description, completedAt, todos, daysRemaining, hoursRemaining, recurrence, lastNotified, taskType };
}
function parseRecurrence(raw) {
  if (!raw || raw === "none")
    return null;
  const parts = raw.split(":");
  const type = parts[0];
  if (!["daily", "weekly", "monthly", "yearly"].includes(type))
    return null;
  const result = { type, hour: 9, minute: 0 };
  if (type === "daily") {
    if (parts[1])
      result.hour = Number(parts[1]);
    if (parts[2])
      result.minute = Number(parts[2]);
  } else if (type === "weekly") {
    if (parts[1])
      result.weekday = Number(parts[1]);
    if (parts[2])
      result.hour = Number(parts[2]);
    if (parts[3])
      result.minute = Number(parts[3]);
  } else if (type === "monthly") {
    if (parts[1])
      result.monthDay = Number(parts[1]);
    if (parts[2])
      result.hour = Number(parts[2]);
    if (parts[3])
      result.minute = Number(parts[3]);
  } else if (type === "yearly") {
    if (parts[1])
      result.month = Number(parts[1]);
    if (parts[2])
      result.yearDay = Number(parts[2]);
    if (parts[3])
      result.hour = Number(parts[3]);
    if (parts[4])
      result.minute = Number(parts[4]);
  }
  return result;
}
function formatRecurrence(r) {
  var _a, _b, _c, _d;
  if (r.type === "daily")
    return `daily:${r.hour}:${r.minute}`;
  if (r.type === "weekly")
    return `weekly:${(_a = r.weekday) != null ? _a : 0}:${r.hour}:${r.minute}`;
  if (r.type === "monthly")
    return `monthly:${(_b = r.monthDay) != null ? _b : 1}:${r.hour}:${r.minute}`;
  return `yearly:${(_c = r.month) != null ? _c : 1}:${(_d = r.yearDay) != null ? _d : 1}:${r.hour}:${r.minute}`;
}
function toggleTodoInContent(content, todoLine) {
  const lines = content.split("\n");
  const line = lines[todoLine];
  if (!line)
    return content;
  if (/\[\s\]/.test(line)) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const timestamp = `${y}-${m}-${d} ${hh}:${mm}`;
    lines[todoLine] = line.replace("[ ]", "[x]").replace(/#done@\S+\s+\S+/g, "") + ` #done@${timestamp}`;
  } else if (/\[[xX]\]/.test(line)) {
    lines[todoLine] = line.replace(/\[[xX]\]/, "[ ]").replace(/#done@\S+\s+\S+/g, "");
  }
  return lines.join("\n");
}
function generateTaskContent(title, priority, deadline, description, todos, recurrence, lastNotified, isQuick) {
  const prioLabels = ["\u5FC5\u505A", "\u91CD\u8981", "\u4E00\u822C"];
  const priorityTags = ["#\u5FC5\u505A", "#\u91CD\u8981", "#\u4E00\u822C"];
  const deadlineLine = deadline ? `
- **\u622A\u6B62\u65E5\u671F**\uFF1A${deadline}` : "\n- **\u622A\u6B62\u65E5\u671F**\uFF1A\u6C38\u4E45";
  const recurLine = recurrence ? `
- **\u5FAA\u73AF**\uFF1A${recurrence}` : "";
  const notifiedLine = lastNotified ? `
- **\u4E0A\u6B21\u63D0\u9192**\uFF1A${lastNotified}` : "";
  const quickTag = isQuick ? "\n- **\u4EFB\u52A1\u7C7B\u578B**\uFF1A\u5FEB\u901F" : "";
  const hasTodos = todos && todos.length > 0;
  const todoLines = hasTodos ? todos.map((t) => `- [ ] ${t.text} ${priorityTags[t.priority]}`).join("\n") : "";
  if (isQuick) {
    return `# ${title}

- **\u4F18\u5148\u7EA7**\uFF1A${prioLabels[priority]}${deadlineLine}${recurLine}${notifiedLine}${quickTag}

${hasTodos ? `## \u5F85\u529E

${todoLines}
` : ""}`;
  }
  return `# ${title}

- **\u4F18\u5148\u7EA7**\uFF1A${prioLabels[priority]}${deadlineLine}${recurLine}${notifiedLine}

## \u63CF\u8FF0

${description || "\uFF08\u5F85\u8865\u5145\uFF09"}

${hasTodos ? `## \u5F85\u529E

${todoLines}
` : ""}`;
}
function completeAllTodosInContent(content) {
  const lines = content.split("\n");
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ts = `${y}-${mo}-${d} ${hh}:${mm}`;
  let hasTodo = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^(\s*)-\s*\[\s/.test(lines[i])) {
      hasTodo = true;
      lines[i] = lines[i].replace("[ ]", "[x]").replace(/#done@\S+/g, "") + ` #done@${ts}`;
    }
  }
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\*\*完成时间\*\*/.test(lines[i])) {
      lines[i] = `- **\u5B8C\u6210\u65F6\u95F4**\uFF1A${ts}`;
      found = true;
      break;
    }
  }
  if (!found) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\*\*优先级\*\*/.test(lines[i])) {
        lines.splice(i + 1, 0, `- **\u5B8C\u6210\u65F6\u95F4**\uFF1A${ts}`);
        break;
      }
    }
  }
  return lines.join("\n");
}
function addTodoToContent(content, text, priority) {
  const lines = content.split("\n");
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## 待办/.test(lines[i])) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx === -1) {
    lines.push("", "## \u5F85\u529E", "");
    insertIdx = lines.length;
  }
  const priorityTags = ["#\u5FC5\u505A", "#\u91CD\u8981", "#\u4E00\u822C"];
  const newLine = `- [ ] ${text} ${priorityTags[priority]}`;
  lines.splice(insertIdx, 0, newLine);
  return lines.join("\n");
}
function removeTodoFromContent(content, todoLine) {
  const lines = content.split("\n");
  if (todoLine >= 0 && todoLine < lines.length) {
    lines.splice(todoLine, 1);
  }
  return lines.join("\n");
}

// src/view.ts
function trunc(s, max) {
  return s.length <= max ? s : s.slice(0, max) + "\u2026";
}
function fmtTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getNextCycleTime(r, baseDeadline, from) {
  let next = new Date(from);
  next.setHours(r.hour, r.minute, 0, 0);
  if (r.type === "daily") {
    next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), r.hour, r.minute, 0);
    if (next.getTime() <= from.getTime())
      next.setDate(next.getDate() + 1);
    return next;
  }
  if (r.type === "weekly") {
    next = new Date(from);
    next.setDate(next.getDate() + 7);
    next.setHours(r.hour, r.minute, 0, 0);
    return next;
  }
  if (r.type === "monthly") {
    const currentDay = from.getDate();
    const nextMonth = from.getMonth() + 1;
    const nextYear = from.getFullYear();
    next = new Date(nextYear, nextMonth, currentDay, r.hour, r.minute, 0);
    if (next.getDate() !== currentDay) {
      next.setDate(0);
    }
    if (next.getTime() <= from.getTime()) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(currentDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
    return next;
  }
  if (r.type === "yearly") {
    const currentMonth = from.getMonth();
    const currentDay = from.getDate();
    const nextYear = from.getFullYear() + 1;
    next = new Date(nextYear, currentMonth, currentDay, r.hour, r.minute, 0);
    if (next.getDate() !== currentDay) {
      next.setDate(currentDay - 1);
    }
    if (next.getTime() <= from.getTime()) {
      next.setFullYear(next.getFullYear() + 1);
      next.setDate(Math.min(currentDay, new Date(next.getFullYear(), currentMonth + 1, 0).getDate()));
    }
    return next;
  }
  return next;
}
function formatNextCycle(r, baseDeadline) {
  const wdLabels = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
  let next = new Date(baseDeadline.getTime());
  if (r.type === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (r.type === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (r.type === "monthly") {
    next.setMonth(next.getMonth() + 1);
    const currentDay = baseDeadline.getDate();
    if (next.getDate() !== currentDay) {
      next.setDate(0);
    }
  } else if (r.type === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
    const currentDay = baseDeadline.getDate();
    if (next.getDate() !== currentDay) {
      next.setDate(currentDay - 1);
    }
  }
  next.setHours(r.hour, r.minute, 0, 0);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  const ts = `${y}-${m}-${d} ${fmtTime(r.hour, r.minute)}`;
  if (r.type === "daily")
    return `\u4E0B\u6B21 ${ts}`;
  if (r.type === "weekly")
    return `\u4E0B\u6B21 ${ts} \u5468${wdLabels[next.getDay()]}`;
  if (r.type === "monthly")
    return `\u4E0B\u6B21 ${ts}`;
  return `\u4E0B\u6B21 ${ts}`;
}
function shouldReset(task) {
  if (!task.recurrence || !task.deadlineDate)
    return false;
  const now = new Date();
  let nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, task.deadlineDate);
  while (nextCycle.getTime() <= now.getTime()) {
    if (!task.lastNotified)
      return true;
    const last = parseFlexibleDate(task.lastNotified + " 00:00");
    if (!last || last.getTime() < nextCycle.getTime())
      return true;
    nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, nextCycle);
  }
  return false;
}
async function resetCycleTask(app, task) {
  const file = app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof import_obsidian.TFile) || !task.recurrence || !task.deadlineDate)
    return;
  let content = await app.vault.read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/\[[xX]\]/.test(lines[i])) {
      lines[i] = lines[i].replace(/\[[xX]\]/, "[ ]").replace(/#done@\S+\s+\S+/g, "");
    }
  }
  const filtered = lines.filter((l) => !/^\*\*完成时间\*\*/.test(l));
  const now = new Date();
  let nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, task.deadlineDate);
  while (nextCycle.getTime() <= now.getTime()) {
    nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, nextCycle);
  }
  const nextDeadline = `${nextCycle.getFullYear()}-${String(nextCycle.getMonth() + 1).padStart(2, "0")}-${String(nextCycle.getDate()).padStart(2, "0")} ${fmtTime(nextCycle.getHours(), nextCycle.getMinutes())}`;
  for (let i = 0; i < filtered.length; i++) {
    if (/^\*\*截止日期\*\*/.test(filtered[i])) {
      filtered[i] = `- **\u622A\u6B62\u65E5\u671F**\uFF1A${nextDeadline}`;
      break;
    }
  }
  const ts = `${fmtDate(now)} ${fmtTime(now.getHours(), now.getMinutes())}`;
  let found = false;
  for (let i = 0; i < filtered.length; i++) {
    if (/^\*\*上次提醒\*\*/.test(filtered[i])) {
      filtered[i] = `- **\u4E0A\u6B21\u63D0\u9192**\uFF1A${ts}`;
      found = true;
      break;
    }
  }
  if (!found) {
    for (let i = 0; i < filtered.length; i++) {
      if (/^\*\*优先级\*\*/.test(filtered[i])) {
        filtered.splice(i + 1, 0, `- **\u4E0A\u6B21\u63D0\u9192**\uFF1A${ts}`);
        break;
      }
    }
  }
  await app.vault.modify(file, filtered.join("\n"));
}
var VIEW_TYPE_INBOX = "inbox-tracker-view";
var InboxView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.tasks = [];
    this.refreshTimer = null;
    this.plugin = plugin;
  }
  get s() {
    return this.plugin.settings;
  }
  getViewType() {
    return VIEW_TYPE_INBOX;
  }
  getDisplayText() {
    return "";
  }
  getIcon() {
    return "inbox";
  }
  async onOpen() {
    await this.refresh();
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path.startsWith(this.s.inboxFolder))
        this.refresh();
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file.path.startsWith(this.s.inboxFolder))
        this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file.path.startsWith(this.s.inboxFolder))
        this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file.path.startsWith(this.s.inboxFolder) || oldPath.startsWith(this.s.inboxFolder))
        this.refresh();
    }));
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, 6e4);
  }
  async onClose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  async refresh() {
    const ib = this.s.inboxFolder;
    const ar = `${ib}/${this.s.archiveFolder}`;
    const files = this.app.vault.getFiles().filter(
      (f) => f.path.startsWith(ib) && !f.path.startsWith(ar) && f.extension === "md" && f.name !== "README.md"
    );
    this.tasks = [];
    for (const f of files) {
      const c = await this.app.vault.read(f);
      const t = parseInboxFile(c, f.path);
      if (shouldReset(t)) {
        await resetCycleTask(this.app, t);
        const newC = await this.app.vault.read(f);
        this.tasks.push(parseInboxFile(newC, f.path));
      } else {
        this.tasks.push(t);
      }
    }
    this.tasks.sort((a, b) => {
      if (!a.deadlineDate && !b.deadlineDate)
        return 0;
      if (!a.deadlineDate)
        return 1;
      if (!b.deadlineDate)
        return -1;
      return a.deadlineDate.getTime() - b.deadlineDate.getTime();
    });
    this.render();
  }
  /* ── render ─────────────────────────── */
  render() {
    const c = this.containerEl.children[1];
    c.empty();
    c.addClass("inbox-tracker");
    const hdr = c.createDiv({ cls: "it-header" });
    const row = hdr.createDiv({ cls: "it-header-row" });
    row.createEl("span", { text: "\u4EFB\u52A1\u9762\u677F", cls: "it-logo" });
    const btns = row.createDiv({ cls: "it-btn-group" });
    const quickBtn = btns.createEl("button", { text: "\u5FEB\u901F", cls: "it-btn-quick" });
    quickBtn.addEventListener("click", () => {
      new QuickAddModal(this.app, async (title, priority, deadline, recurrence) => {
        const fn = title.replace(/[\\/:*?"<>|]/g, "_");
        const recurStr = recurrence ? formatRecurrence(recurrence) : void 0;
        const lastNotified = recurrence ? fmtDate(new Date()) : void 0;
        const todos = [{ text: title, priority }];
        const ct = generateTaskContent(title, priority, deadline, "", todos, recurStr, lastNotified, true);
        if (!this.app.vault.getAbstractFileByPath(this.s.inboxFolder)) {
          await this.app.vault.createFolder(this.s.inboxFolder);
        }
        await this.app.vault.create(`${this.s.inboxFolder}/${fn}.md`, ct);
      }).open();
    });
    const addBtn = btns.createEl("button", { text: "\u6279\u91CF", cls: "it-btn-add" });
    addBtn.addEventListener("click", () => {
      new CreateTaskModal(this.app, async (title, priority, deadline, desc, todos, recurrence) => {
        const fn = title.replace(/[\\/:*?"<>|]/g, "_");
        const recurStr = recurrence ? formatRecurrence(recurrence) : void 0;
        const lastNotified = recurrence ? fmtDate(new Date()) : void 0;
        const ct = generateTaskContent(title, priority, deadline, desc, todos, recurStr, lastNotified);
        if (!this.app.vault.getAbstractFileByPath(this.s.inboxFolder)) {
          await this.app.vault.createFolder(this.s.inboxFolder);
        }
        await this.app.vault.create(`${this.s.inboxFolder}/${fn}.md`, ct);
      }).open();
    });
    const ud = this.s.urgentDays;
    const total = this.tasks.length;
    const overdue = this.tasks.filter((t) => t.daysRemaining !== null && t.daysRemaining < 0).length;
    const upcoming = this.tasks.filter((t) => t.daysRemaining !== null && t.daysRemaining >= 0 && t.daysRemaining <= ud).length;
    const sr = hdr.createDiv({ cls: "it-stats" });
    sr.createEl("span", { text: `\u5168\u90E8 ${total}`, cls: "it-stat" });
    if (overdue > 0)
      sr.createEl("span", { text: `\u8FC7\u671F ${overdue}`, cls: "it-stat it-stat-overdue" });
    if (upcoming > 0)
      sr.createEl("span", { text: `\u4E34\u8FD1 ${upcoming}`, cls: "it-stat it-stat-upcoming" });
    this.renderDueReminder(c);
    this.renderStatsPanel(c);
    const list = c.createDiv({ cls: "it-list" });
    if (total === 0) {
      list.createDiv({ cls: "it-empty", text: "\u6E05\u7A7A\u4E86 \u{1F389}" });
      return;
    }
    for (const t of this.tasks)
      this.renderCard(list, t);
  }
  /* ── reminder banner ────────────────── */
  renderDueReminder(c) {
    const ov = [], td = [], up = [];
    for (const t of this.tasks) {
      if (!t.todos.some((x) => !x.completed))
        continue;
      if (t.daysRemaining === null)
        continue;
      if (t.daysRemaining < 0)
        ov.push(t);
      else if (t.daysRemaining === 0)
        td.push(t);
      else if (t.daysRemaining <= this.s.urgentDays)
        up.push(t);
    }
    if (!ov.length && !td.length && !up.length)
      return;
    const ban = c.createDiv({ cls: "it-reminder-banner" });
    const addBlock = (arr, cls, icon, label) => {
      if (!arr.length)
        return;
      const blk = ban.createDiv({ cls: `it-reminder-block ${cls}` });
      blk.createEl("span", { text: `${icon} ${label} \xB7 ${arr.length}\u4E2A`, cls: "it-reminder-title" });
      const lst = blk.createDiv({ cls: "it-reminder-list" });
      for (const t of arr) {
        const tag = lst.createEl("span", { text: trunc(t.title, 8), cls: "it-reminder-tag" });
        tag.addEventListener("click", () => {
          const f = this.app.vault.getAbstractFileByPath(t.filePath);
          if (f instanceof import_obsidian.TFile) {
            void this.app.workspace.getLeaf(false).openFile(f);
          }
        });
      }
    };
    addBlock(ov, "it-reminder-overdue", "\u26A0\uFE0F", "\u5DF2\u8FC7\u671F");
    addBlock(td, "it-reminder-today", "\u{1F514}", "\u4ECA\u5929\u5230\u671F");
    addBlock(up, "it-reminder-upcoming", "\u{1F4C5}", `${this.s.urgentDays}\u5929\u5185`);
  }
  /* ── stats panel ────────────────────── */
  renderStatsPanel(c) {
    const all = [];
    for (const t of this.tasks)
      for (const td of t.todos) {
        all.push({ text: td.text, completed: td.completed, priority: td.priority, taskTitle: t.title, filePath: t.filePath, line: td.line, taskType: t.taskType });
      }
    const doneN = all.filter((x) => x.completed).length;
    const undoneN = all.filter((x) => !x.completed).length;
    const panel = c.createDiv({ cls: "it-stats-panel" });
    const statusRow = panel.createDiv({ cls: "it-stat-row" });
    const doneChip = statusRow.createDiv({ cls: "it-stat-chip it-stat-chip-done" });
    doneChip.createEl("span", { text: "\u5DF2\u5B8C\u6210", cls: "it-stat-chip-label" });
    doneChip.createEl("span", { text: `${doneN}`, cls: "it-stat-chip-count" });
    doneChip.addEventListener("click", () => {
      new TodoDetailModal(this.app, "\u5DF2\u5B8C\u6210", all.filter((x) => x.completed)).open();
    });
    const undoneChip = statusRow.createDiv({ cls: "it-stat-chip it-stat-chip-undone" });
    undoneChip.createEl("span", { text: "\u672A\u5B8C\u6210", cls: "it-stat-chip-label" });
    undoneChip.createEl("span", { text: `${undoneN}`, cls: "it-stat-chip-count" });
    undoneChip.addEventListener("click", () => {
      new TodoDetailModal(this.app, "\u672A\u5B8C\u6210", all.filter((x) => !x.completed)).open();
    });
    if (all.length > 0) {
      const prioRow = panel.createDiv({ cls: "it-prio-row" });
      for (let p = 0; p <= 2; p++) {
        const cnt = all.filter((x) => x.priority === p).length;
        if (cnt > 0) {
          const chip = prioRow.createDiv({ cls: "it-prio-chip" });
          chip.createEl("span", { text: `${PRIORITY_LABELS[p]}` });
          chip.createEl("span", { text: `${cnt}`, cls: "it-prio-chip-count" });
          chip.addEventListener("click", () => {
            new TodoDetailModal(this.app, PRIORITY_LABELS[p], all.filter((x) => x.priority === p)).open();
          });
        }
      }
      const typeRow = panel.createDiv({ cls: "it-type-row" });
      const quickCnt = all.filter((x) => x.taskType === "quick").length;
      if (quickCnt > 0) {
        const chip = typeRow.createDiv({ cls: "it-type-chip" });
        chip.createEl("span", { text: "\u5FEB\u901F" });
        chip.createEl("span", { text: `${quickCnt}`, cls: "it-type-chip-count" });
        chip.addEventListener("click", () => {
          new TodoDetailModal(this.app, "\u5FEB\u901F\u4EFB\u52A1", all.filter((x) => x.taskType === "quick")).open();
        });
      }
      const fullCnt = all.filter((x) => x.taskType === "full").length;
      if (fullCnt > 0) {
        const chip = typeRow.createDiv({ cls: "it-type-chip" });
        chip.createEl("span", { text: "\u6279\u91CF" });
        chip.createEl("span", { text: `${fullCnt}`, cls: "it-type-chip-count" });
        chip.addEventListener("click", () => {
          new TodoDetailModal(this.app, "\u6279\u91CF\u4EFB\u52A1", all.filter((x) => x.taskType === "full")).open();
        });
      }
    }
  }
  /* ── card ──────────────────────────── */
  renderCard(parent, task) {
    if (task.taskType === "quick") {
      this.renderQuickCard(parent, task);
    } else {
      this.renderNormalCard(parent, task);
    }
  }
  /* ── 快速任务卡片（简洁版） ────────── */
  renderQuickCard(parent, task) {
    const uc = this.getUrgencyClass(task.daysRemaining, this.s.urgentDays);
    const completedClass = task.completedAt !== null ? "it-completed" : "";
    const card = parent.createDiv({ cls: `it-card it-card-quick ${uc} ${completedClass}` });
    const r1 = card.createDiv({ cls: "it-card-row1" });
    const firstTodo = task.todos[0];
    const cb = r1.createEl("input", { type: "checkbox" });
    cb.checked = firstTodo ? firstTodo.completed : false;
    cb.addEventListener("change", async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof import_obsidian.TFile && firstTodo) {
          const nc = toggleTodoInContent(await this.app.vault.read(f), firstTodo.line);
          await this.app.vault.modify(f, nc);
        }
      } catch (e) {
        console.error("Failed to update quick task completion status:", e);
      }
    });
    if (task.priority !== 2) {
      r1.createEl("span", { text: PRIORITY_LABELS[task.priority], cls: `it-card-prio it-prio-${task.priority}` });
    }
    const todoText = task.todos.length > 0 ? task.todos[0].text : task.title;
    const nameEl = r1.createEl("span", { text: trunc(todoText, 20), cls: "it-card-name" });
    if (todoText.length > 20)
      nameEl.setAttr("title", todoText);
    nameEl.addEventListener("click", () => {
      const f = this.app.vault.getAbstractFileByPath(task.filePath);
      if (f instanceof import_obsidian.TFile) {
        void this.app.workspace.getLeaf(false).openFile(f);
      }
    });
    const del = r1.createEl("span", { text: "\u2715", cls: "it-btn-delete-card" });
    del.setAttr("aria-label", "\u5220\u9664");
    del.addEventListener("click", async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof import_obsidian.TFile)
          await this.app.vault.trash(f, true);
      } catch (e) {
        console.error("Failed to delete task:", e);
      }
    });
    const r2 = card.createDiv({ cls: "it-card-row2" });
    if ((firstTodo == null ? void 0 : firstTodo.completed) && firstTodo.completedAt) {
      r2.createEl("span", { text: `\u2705 ${firstTodo.completedAt}`, cls: "it-card-dl-text" });
    } else if (task.deadline) {
      const icon = task.daysRemaining !== null && task.daysRemaining < 0 ? "\u26A0\uFE0F" : "\u23F0";
      r2.createEl("span", { text: `${icon} ${task.deadline}`, cls: "it-card-dl-text" });
    }
    if (task.recurrence && task.deadlineDate) {
      const nextCycle = formatNextCycle(task.recurrence, task.deadlineDate);
      r2.createEl("span", { text: `\u{1F504} ${nextCycle}`, cls: "it-card-recur" });
    }
  }
  /* ── 普通任务卡片（完整版） ────────── */
  renderNormalCard(parent, task) {
    const uc = this.getUrgencyClass(task.daysRemaining, this.s.urgentDays);
    const completedClass = task.completedAt !== null ? "it-completed" : "";
    const card = parent.createDiv({ cls: `it-card ${uc} ${completedClass}` });
    const r1 = card.createDiv({ cls: "it-card-row1" });
    if (task.priority !== 2) {
      r1.createEl("span", { text: PRIORITY_LABELS[task.priority], cls: `it-card-prio it-prio-${task.priority}` });
    }
    const nameEl = r1.createEl("span", { text: trunc(task.title, 8), cls: "it-card-name" });
    if (task.title.length > 8)
      nameEl.setAttr("title", task.title);
    nameEl.addEventListener("click", () => {
      const f = this.app.vault.getAbstractFileByPath(task.filePath);
      if (f instanceof import_obsidian.TFile) {
        void this.app.workspace.getLeaf(false).openFile(f);
      }
    });
    const act = r1.createDiv({ cls: "it-card-act" });
    if (task.todos.some((x) => !x.completed)) {
      const btn = act.createEl("span", { text: "\u2713\u5168\u90E8\u5B8C\u6210", cls: "it-btn-complete-all" });
      btn.addEventListener("click", async () => {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof import_obsidian.TFile) {
          const nc = completeAllTodosInContent(await this.app.vault.read(f));
          await this.app.vault.modify(f, nc);
        }
      });
    }
    const del = act.createEl("span", { text: "\u2715", cls: "it-btn-delete-card" });
    del.setAttr("aria-label", "\u5220\u9664");
    del.addEventListener("click", async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof import_obsidian.TFile)
          await this.app.vault.trash(f, true);
      } catch (e) {
        console.error("Failed to delete task:", e);
      }
    });
    const r2 = card.createDiv({ cls: "it-card-row2" });
    if (task.deadline) {
      const dlBlock = r2.createDiv({ cls: "it-card-dl" });
      const icon = task.daysRemaining !== null && task.daysRemaining < 0 ? "\u26A0\uFE0F" : "\u23F0";
      dlBlock.createEl("span", { text: `${icon} ${task.deadline}`, cls: "it-card-dl-text" });
      if (task.hoursRemaining !== null) {
        const ah = Math.abs(task.hoursRemaining);
        const d = Math.floor(ah / 24);
        const h = ah % 24;
        let lbl;
        if (task.hoursRemaining < 0)
          lbl = d > 0 ? `\u8FC7\u671F${d}d${h}h` : `\u8FC7\u671F${h}h`;
        else if (task.hoursRemaining === 0)
          lbl = "\u73B0\u5728";
        else
          lbl = d > 0 ? `${d}d${h}h` : `${h}h`;
        dlBlock.createEl("span", { text: lbl, cls: `it-card-countdown ${uc}` });
      }
    }
    if (task.recurrence && task.deadlineDate) {
      r2.createEl("span", { text: `\u{1F504} ${formatNextCycle(task.recurrence, task.deadlineDate)}`, cls: "it-card-recur" });
    }
    if (task.todos.length > 0) {
      const sorted = [...task.todos].sort((a, b) => a.priority - b.priority);
      const vis = this.s.showCompletedTodos ? sorted : sorted.filter((x) => !x.completed);
      const doneN = task.todos.filter((x) => x.completed).length;
      const totalN = task.todos.length;
      const pct = Math.round(doneN / totalN * 100);
      const prog = card.createDiv({ cls: "it-card-progress" });
      const bar = prog.createDiv({ cls: "it-progress-bar" });
      const fill = bar.createDiv({ cls: "it-progress-fill" });
      fill.style.width = `${pct}%`;
      prog.createEl("span", { text: `${doneN}/${totalN}`, cls: "it-progress-text" });
      const tds = card.createDiv({ cls: "it-todos" });
      for (const td of vis) {
        const isD = td.completed;
        const tr = tds.createDiv({ cls: `it-todo-row ${isD ? "it-todo-done" : ""}` });
        if (td.priority !== 2) {
          tr.createEl("span", { text: PRIORITY_LABELS[td.priority], cls: `it-card-prio it-prio-${td.priority}` });
        }
        const cb = tr.createEl("input", { type: "checkbox" });
        cb.checked = isD;
        cb.addEventListener("change", async () => {
          const f = this.app.vault.getAbstractFileByPath(task.filePath);
          if (f instanceof import_obsidian.TFile) {
            const nc = toggleTodoInContent(await this.app.vault.read(f), td.line);
            await this.app.vault.modify(f, nc);
          }
        });
        const tspan = tr.createEl("span", { text: trunc(td.text, 20), cls: "it-todo-text" });
        if (td.text.length > 20)
          tspan.setAttr("title", td.text);
        if (isD && td.completedAt) {
          tr.createEl("span", { text: td.completedAt, cls: "it-todo-done-time" });
        }
        const dd = tr.createEl("span", { text: "\u2715", cls: "it-todo-del" });
        dd.addEventListener("click", async () => {
          const f = this.app.vault.getAbstractFileByPath(task.filePath);
          if (f instanceof import_obsidian.TFile) {
            const nc = removeTodoFromContent(await this.app.vault.read(f), td.line);
            await this.app.vault.modify(f, nc);
          }
        });
      }
    }
    const ar = card.createDiv({ cls: "it-todo-add-row" });
    const ab = ar.createEl("span", { text: "+ \u6DFB\u52A0\u5F85\u529E", cls: "it-btn-add-todo" });
    ab.addEventListener("click", () => {
      new AddTodoModal(this.app, async (text, prio) => {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof import_obsidian.TFile) {
          const nc = addTodoToContent(await this.app.vault.read(f), text, prio);
          await this.app.vault.modify(f, nc);
        }
      }).open();
    });
  }
  getUrgencyClass(d, ud) {
    if (d === null)
      return "";
    if (d < 0)
      return "it-overdue";
    if (d <= ud)
      return "it-urgent";
    return "it-normal";
  }
};
var QuickAddModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.title = "";
    this.priority = 2;
    this.datePart = "";
    this.timePart = "";
    this.recurType = "none";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "\u5FEB\u901F\u6DFB\u52A0", cls: "it-modal-title" });
    const nameWrap = this.makeField(contentEl, "\u4EFB\u52A1\u540D\u79F0", "\u6700\u591A8\u4E2A\u5B57\uFF0C\u540C\u65F6\u4F5C\u4E3A\u5F85\u529E\u5185\u5BB9");
    const nameInput = nameWrap.createEl("input", { type: "text", attr: { placeholder: "\u8F93\u5165\u540D\u79F0", maxlength: "8" } });
    nameInput.addEventListener("input", () => this.title = nameInput.value);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        void this.submit();
      }
    });
    const prioWrap = this.makeField(contentEl, "\u4F18\u5148\u7EA7", "\u5FC5\u9009\uFF0C\u9ED8\u8BA4\u4E3A\u4E00\u822C");
    const prioSelect = prioWrap.createEl("select");
    for (let p = 0; p <= 2; p++) {
      prioSelect.createEl("option", { text: PRIORITY_LABELS[p] }).value = String(p);
    }
    prioSelect.value = "2";
    prioSelect.addEventListener("change", () => this.priority = Number(prioSelect.value));
    const dlWrap = this.makeField(contentEl, "\u5230\u671F\u65F6\u95F4", "\u4E0D\u586B\u5219\u6C38\u4E45");
    dlWrap.style.display = "flex";
    dlWrap.style.gap = "8px";
    const dateInput = dlWrap.createEl("input", { type: "date" });
    const timeInput = dlWrap.createEl("input", { type: "time" });
    dateInput.style.flex = "1.5";
    dateInput.style.minWidth = "110px";
    timeInput.style.flex = "1";
    timeInput.style.minWidth = "80px";
    dateInput.addEventListener("input", () => {
      this.datePart = dateInput.value;
      this.toggleRecur();
    });
    timeInput.addEventListener("input", () => this.timePart = timeInput.value);
    const recurWrap = this.makeField(contentEl, "\u5FAA\u73AF", "\u9700\u5148\u9009\u62E9\u5230\u671F\u65E5\u671F");
    const recurSelect = recurWrap.createEl("select");
    const recurOpts = [
      ["none", "\u4E0D\u5FAA\u73AF"],
      ["daily", "\u6BCF\u5929"],
      ["weekly", "\u6BCF\u5468"],
      ["monthly", "\u6BCF\u6708"],
      ["yearly", "\u6BCF\u5E74"]
    ];
    for (const [v, t] of recurOpts) {
      recurSelect.createEl("option", { text: t }).value = v;
    }
    recurSelect.value = "none";
    recurSelect.disabled = true;
    recurSelect.addEventListener("change", () => this.recurType = recurSelect.value);
    this._recurSelect = recurSelect;
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    btnRow.createEl("button", { text: "\u521B\u5EFA", cls: "it-btn-submit" }).addEventListener("click", () => this.submit());
    btnRow.createEl("button", { text: "\u53D6\u6D88", cls: "it-btn-cancel" }).addEventListener("click", () => this.close());
    setTimeout(() => nameInput.focus(), 50);
  }
  /** 创建一个 label + 控件容器 */
  makeField(parent, label, desc) {
    const wrap = parent.createDiv({ cls: "it-field" });
    wrap.createEl("span", { text: label, cls: "it-field-label" });
    if (desc)
      wrap.createEl("span", { text: desc, cls: "it-field-desc" });
    const ctrl = wrap.createDiv({ cls: "it-field-control" });
    return ctrl;
  }
  toggleRecur() {
    const sel = this._recurSelect;
    if (!sel)
      return;
    if (this.datePart) {
      sel.disabled = false;
    } else {
      sel.value = "none";
      this.recurType = "none";
      sel.disabled = true;
    }
  }
  async submit() {
    if (!this.title.trim())
      return;
    let deadline = "";
    if (this.datePart) {
      if (!this.timePart)
        this.timePart = "23:59";
      deadline = `${this.datePart} ${this.timePart}`;
    }
    let rec = null;
    if (this.datePart && this.recurType !== "none") {
      rec = { type: this.recurType, hour: 9, minute: 0 };
      if (this.timePart) {
        const [h, m] = this.timePart.split(":").map(Number);
        rec.hour = h;
        rec.minute = m;
      }
    }
    await this.onSubmit(this.title.trim(), this.priority, deadline, rec);
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CreateTaskModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.title = "";
    this.priority = 2;
    this.datePart = "";
    this.timePart = "";
    this.description = "";
    this.recurType = "none";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "\u6279\u91CF\u65B0\u5EFA\u4EFB\u52A1", cls: "it-modal-title" });
    const nameWrap = this.makeField(contentEl, "\u4EFB\u52A1\u540D\u79F0", "\u6700\u591A8\u4E2A\u5B57");
    const nameInput = nameWrap.createEl("input", { type: "text", attr: { placeholder: "\u8F93\u5165\u540D\u79F0", maxlength: "8" } });
    nameInput.addEventListener("input", () => this.title = nameInput.value);
    const prioWrap = this.makeField(contentEl, "\u4F18\u5148\u7EA7", "");
    const prioSelect = prioWrap.createEl("select");
    for (let p = 0; p <= 2; p++)
      prioSelect.createEl("option", { text: PRIORITY_LABELS[p] }).value = String(p);
    prioSelect.value = "2";
    prioSelect.addEventListener("change", () => this.priority = Number(prioSelect.value));
    const dlWrap = this.makeField(contentEl, "\u622A\u6B62\u65E5\u671F", "\u4E0D\u586B\u5219\u6C38\u4E45");
    dlWrap.style.display = "flex";
    dlWrap.style.gap = "8px";
    const di = dlWrap.createEl("input", { type: "date" });
    const ti = dlWrap.createEl("input", { type: "time" });
    di.style.flex = "1.5";
    di.style.minWidth = "110px";
    ti.style.flex = "1";
    ti.style.minWidth = "80px";
    di.addEventListener("input", () => {
      this.datePart = di.value;
      this.toggleRecur();
    });
    ti.addEventListener("input", () => this.timePart = ti.value);
    const recurWrap = this.makeField(contentEl, "\u5FAA\u73AF", "\u9700\u5148\u9009\u62E9\u622A\u6B62\u65E5\u671F");
    const recurSelect = recurWrap.createEl("select");
    const recurOpts = [["none", "\u4E0D\u5FAA\u73AF"], ["daily", "\u6BCF\u5929"], ["weekly", "\u6BCF\u5468"], ["monthly", "\u6BCF\u6708"], ["yearly", "\u6BCF\u5E74"]];
    for (const [v, t] of recurOpts)
      recurSelect.createEl("option", { text: t }).value = v;
    recurSelect.value = "none";
    recurSelect.disabled = true;
    recurSelect.addEventListener("change", () => this.recurType = recurSelect.value);
    this._recurSelect = recurSelect;
    const descWrap = this.makeField(contentEl, "\u63CF\u8FF0", "\u53EF\u9009");
    const descArea = descWrap.createEl("textarea", { attr: { placeholder: "\u7B80\u8981\u63CF\u8FF0", rows: "2" } });
    descArea.addEventListener("input", () => this.description = descArea.value);
    const todoLabel = contentEl.createDiv({ cls: "it-field" });
    todoLabel.createEl("span", { text: "\u5F85\u529E\u4E8B\u9879", cls: "it-field-label" });
    todoLabel.createEl("span", { text: "\u9010\u6761\u6DFB\u52A0\uFF08\u6700\u591A10\u6761\uFF0C\u6BCF\u6761\u6700\u591A20\u5B57\uFF0C\u5FC5\u987B\u9009\u62E9\u4F18\u5148\u7EA7\uFF09", cls: "it-field-desc" });
    this.todoContainer = contentEl.createDiv({ cls: "it-todo-dynamic-list" });
    this.addRow();
    this.addRow();
    this.addRow();
    const addRowBtn = contentEl.createEl("button", { text: "+ \u6DFB\u52A0\u4E00\u884C", cls: "it-btn-add-row" });
    addRowBtn.addEventListener("click", () => {
      if (this.todoContainer.querySelectorAll(".it-todo-dynamic-row").length >= 10)
        return;
      this.addRow();
    });
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    btnRow.createEl("button", { text: "\u521B\u5EFA", cls: "it-btn-submit" }).addEventListener("click", () => this.submit());
    btnRow.createEl("button", { text: "\u53D6\u6D88", cls: "it-btn-cancel" }).addEventListener("click", () => this.close());
    setTimeout(() => nameInput.focus(), 50);
  }
  makeField(parent, label, desc) {
    const wrap = parent.createDiv({ cls: "it-field" });
    wrap.createEl("span", { text: label, cls: "it-field-label" });
    if (desc)
      wrap.createEl("span", { text: desc, cls: "it-field-desc" });
    const ctrl = wrap.createDiv({ cls: "it-field-control" });
    return ctrl;
  }
  toggleRecur() {
    const sel = this._recurSelect;
    if (!sel)
      return;
    if (this.datePart) {
      sel.disabled = false;
    } else {
      sel.value = "none";
      this.recurType = "none";
      sel.disabled = true;
    }
  }
  async submit() {
    if (!this.title.trim())
      return;
    let deadline = "";
    if (this.datePart) {
      if (!this.timePart)
        this.timePart = "23:59";
      deadline = `${this.datePart} ${this.timePart}`;
    }
    let rec = null;
    if (this.datePart && this.recurType !== "none") {
      rec = { type: this.recurType, hour: 9, minute: 0 };
      if (this.timePart) {
        const [h, m] = this.timePart.split(":").map(Number);
        rec.hour = h;
        rec.minute = m;
      }
    }
    await this.onSubmit(this.title.trim(), this.priority, deadline, this.description, this.collectTodos(), rec);
    this.close();
  }
  addRow(txt = "") {
    const row = this.todoContainer.createDiv({ cls: "it-todo-dynamic-row" });
    const sel = row.createEl("select", { cls: "it-prio-select" });
    for (let p = 0; p <= 2; p++) {
      const o = sel.createEl("option", { text: PRIORITY_LABELS[p] });
      o.value = String(p);
      if (p === 2)
        o.selected = true;
    }
    const inp = row.createEl("input", { type: "text", cls: "it-todo-dynamic-input", attr: { placeholder: "\u5F85\u529E\u5185\u5BB9\uFF08\u6700\u591A20\u5B57\uFF09", maxlength: "20" } });
    inp.value = txt;
    const del = row.createEl("span", { text: "\u2715", cls: "it-todo-dynamic-del" });
    del.addEventListener("click", () => row.remove());
    inp.focus();
  }
  collectTodos() {
    const res = [];
    this.todoContainer.querySelectorAll(".it-todo-dynamic-row").forEach((row) => {
      var _a, _b;
      const sel = row.querySelector(".it-prio-select");
      const inp = row.querySelector(".it-todo-dynamic-input");
      const t = (_a = inp == null ? void 0 : inp.value) == null ? void 0 : _a.trim();
      if (t)
        res.push({ text: t, priority: Number((_b = sel == null ? void 0 : sel.value) != null ? _b : 2) });
    });
    return res;
  }
  onClose() {
    this.contentEl.empty();
  }
};
var AddTodoModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.text = "";
    this.priority = 2;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "\u6DFB\u52A0\u5F85\u529E", cls: "it-modal-title" });
    new import_obsidian.Setting(contentEl).setName("\u5185\u5BB9").addText((tx) => {
      tx.setPlaceholder("\u8F93\u5165\u5F85\u529E\u5185\u5BB9").onChange((v) => this.text = v);
      tx.inputEl.setAttr("maxlength", "20");
    });
    new import_obsidian.Setting(contentEl).setName("\u4F18\u5148\u7EA7").addDropdown((dd) => {
      for (let p = 0; p <= 2; p++)
        dd.addOption(String(p), PRIORITY_LABELS[p]);
      dd.setValue("2");
      dd.onChange((v) => this.priority = Number(v));
    });
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    const sub = btnRow.createEl("button", { text: "\u6DFB\u52A0", cls: "it-btn-submit" });
    sub.addEventListener("click", async () => {
      if (!this.text.trim())
        return;
      await this.onSubmit(this.text.trim(), this.priority);
      this.close();
    });
    const cancel = btnRow.createEl("button", { text: "\u53D6\u6D88", cls: "it-btn-cancel" });
    cancel.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TodoDetailModal = class extends import_obsidian.Modal {
  constructor(app, title, items) {
    super(app);
    this.title = title;
    this.items = items;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal", "it-detail-modal");
    contentEl.createEl("h2", { text: `${this.title} \u2014 ${this.items.length}\u6761`, cls: "it-modal-title" });
    if (!this.items.length) {
      contentEl.createDiv({ cls: "it-detail-empty", text: "\u65E0\u5339\u914D\u9879" });
      return;
    }
    const grouped = /* @__PURE__ */ new Map();
    for (const it of this.items) {
      const k = it.taskTitle;
      if (!grouped.has(k))
        grouped.set(k, []);
      grouped.get(k).push(it);
    }
    const list = contentEl.createDiv({ cls: "it-detail-list" });
    for (const [tt, its] of grouped) {
      const g = list.createDiv({ cls: "it-detail-group" });
      const hd = g.createDiv({ cls: "it-detail-group-header" });
      hd.createEl("span", { text: tt, cls: "it-detail-task-title" });
      hd.addEventListener("click", () => {
        const f = this.app.vault.getAbstractFileByPath(its[0].filePath);
        if (f instanceof import_obsidian.TFile) {
          void this.app.workspace.getLeaf(false).openFile(f);
          this.close();
        }
      });
      for (const it of its) {
        const r = g.createDiv({ cls: `it-detail-item ${it.completed ? "it-detail-done" : ""}` });
        const cb = r.createEl("input", { type: "checkbox" });
        cb.checked = it.completed;
        cb.addEventListener("change", async () => {
          try {
            const f = this.app.vault.getAbstractFileByPath(it.filePath);
            if (f instanceof import_obsidian.TFile) {
              const nc = toggleTodoInContent(await this.app.vault.read(f), it.line);
              await this.app.vault.modify(f, nc);
            }
          } catch (e) {
            console.error("Failed to toggle todo:", e);
          }
        });
        r.createEl("span", { text: PRIORITY_LABELS[it.priority], cls: `it-card-prio it-prio-${it.priority}` });
        const textEl = r.createEl("span", { text: trunc(it.text, 30), cls: "it-detail-text" });
        if (it.text.length > 30)
          textEl.setAttr("title", it.text);
      }
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  inboxFolder: "00-Inbox",
  archiveFolder: "\u5DF2\u5F52\u6863",
  urgentDays: 3,
  showCompletedTodos: true,
  historyRecords: []
};
var InboxTrackerSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Inbox \u76EE\u5F55").setDesc("\u5B58\u653E\u5F85\u529E\u6587\u4EF6\u7684\u76EE\u5F55\u8DEF\u5F84\uFF08\u76F8\u5BF9\u4E8E Vault \u6839\u76EE\u5F55\uFF09").addText(
      (text) => text.setPlaceholder("00-Inbox").setValue(this.plugin.settings.inboxFolder).onChange(async (value) => {
        this.plugin.settings.inboxFolder = value.trim() || DEFAULT_SETTINGS.inboxFolder;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5F52\u6863\u76EE\u5F55\u540D").setDesc("\u5F52\u6863\u4EFB\u52A1\u65F6\u7684\u5B50\u76EE\u5F55\u540D\u79F0\uFF0C\u4F4D\u4E8E Inbox \u76EE\u5F55\u4E0B").addText(
      (text) => text.setPlaceholder("\u5DF2\u5F52\u6863").setValue(this.plugin.settings.archiveFolder).onChange(async (value) => {
        this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u7D27\u6025\u5929\u6570\u9608\u503C").setDesc("\u622A\u6B62\u65E5\u671F\u5728\u591A\u5C11\u5929\u5185\u6807\u8BB0\u4E3A\u7D27\u6025\uFF08\u6A59\u8272\u63D0\u9192\uFF09").addSlider(
      (slider) => slider.setLimits(1, 14, 1).setValue(this.plugin.settings.urgentDays).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.urgentDays = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u663E\u793A\u5DF2\u5B8C\u6210\u5F85\u529E").setDesc("\u5728\u5361\u7247\u4E2D\u662F\u5426\u663E\u793A\u5DF2\u52FE\u9009\u7684\u5F85\u529E\u9879").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showCompletedTodos).onChange(async (value) => {
        this.plugin.settings.showCompletedTodos = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
var InboxTrackerPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_INBOX, (leaf) => new InboxView(leaf, this));
    this.addRibbonIcon("inbox", "Inbox Tracker", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-inbox-tracker",
      name: "Open Inbox Tracker",
      callback: () => this.activateView()
    });
    this.addSettingTab(new InboxTrackerSettingTab(this.app, this));
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_INBOX)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_INBOX, active: true });
      }
    }
    if (leaf) {
      await workspace.revealLeaf(leaf);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(VIEW_TYPE_INBOX).forEach((leaf) => {
      if (leaf.view instanceof InboxView) {
        leaf.view.refresh();
      }
    });
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_INBOX);
  }
};
