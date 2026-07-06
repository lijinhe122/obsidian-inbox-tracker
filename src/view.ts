import { ItemView, WorkspaceLeaf, TFile, TFolder, Modal, App, Setting } from "obsidian";
import { InboxTask, PRIORITY_LABELS, Recurrence } from "./types";
import {
  parseInboxFile, toggleTodoInContent, generateTaskContent,
  addTodoToContent, removeTodoFromContent, completeAllTodosInContent,
  uncompleteTaskContent, addCompletedTimeToContent, formatRecurrence, parseFlexibleDate
} from "./parser";
import type InboxTrackerPlugin from "./main";
import type { InboxTrackerSettings } from "./settings";

/* ── helpers ─────────────────────────── */
function trunc(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
function fmtTime(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ── 根据基准时间计算下一周期时间点 ──── */
function getNextCycleTime(r: Recurrence, baseDeadline: Date, from: Date): Date {
  let next = new Date(from);
  next.setHours(r.hour, r.minute, 0, 0);

  if (r.type === "daily") {
    next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), r.hour, r.minute, 0);
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
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

/* ── 下一次循环时间（展示用） ────────── */
function formatNextCycle(r: Recurrence, baseDeadline: Date): string {
  const wdLabels = ["日","一","二","三","四","五","六"];
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
  
  if (r.type === "daily") return `下次 ${ts}`;
  if (r.type === "weekly") return `下次 ${ts} 周${wdLabels[next.getDay()]}`;
  if (r.type === "monthly") return `下次 ${ts}`;
  return `下次 ${ts}`;
}

/* ── 判断是否应重置 ─────────────────── */
function shouldReset(task: InboxTask): boolean {
  if (!task.recurrence || !task.deadlineDate) return false;
  
  const now = new Date();
  let nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, task.deadlineDate);
  
  while (nextCycle.getTime() <= now.getTime()) {
    if (!task.lastNotified) return true;
    const last = parseFlexibleDate(task.lastNotified + " 00:00");
    if (!last || last.getTime() < nextCycle.getTime()) return true;
    nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, nextCycle);
  }
  
  return false;
}

/* ── 执行循环重置 ──────────────────── */
async function resetCycleTask(app: App, task: InboxTask): Promise<void> {
  const file = app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof TFile) || !task.recurrence || !task.deadlineDate) return;
  
  let content = await app.vault.read(file);
  const lines = content.split("\n");
  
  // 将所有 [x] 改为 [ ] 并移除 #done@
  for (let i = 0; i < lines.length; i++) {
    if (/\[[xX]\]/.test(lines[i])) {
      lines[i] = lines[i].replace(/\[[xX]\]/, "[ ]").replace(/#done@\S+\s+\S+/g, "");
    }
  }
  
  // 移除完成时间行
  const filtered = lines.filter(l => !/^\*\*完成时间\*\*/.test(l));
  
  // 计算并更新截止日期为当前或下一个循环时间
  const now = new Date();
  let nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, task.deadlineDate);
  while (nextCycle.getTime() <= now.getTime()) {
    nextCycle = getNextCycleTime(task.recurrence, task.deadlineDate, nextCycle);
  }
  const nextDeadline = `${nextCycle.getFullYear()}-${String(nextCycle.getMonth() + 1).padStart(2, "0")}-${String(nextCycle.getDate()).padStart(2, "0")} ${fmtTime(nextCycle.getHours(), nextCycle.getMinutes())}`;
  for (let i = 0; i < filtered.length; i++) {
    if (/^\*\*截止日期\*\*/.test(filtered[i])) {
      filtered[i] = `- **截止日期**：${nextDeadline}`;
      break;
    }
  }
  
  // 更新/插入上次提醒
  const ts = `${fmtDate(now)} ${fmtTime(now.getHours(), now.getMinutes())}`;
  let found = false;
  for (let i = 0; i < filtered.length; i++) {
    if (/^\*\*上次提醒\*\*/.test(filtered[i])) {
      filtered[i] = `- **上次提醒**：${ts}`; found = true; break;
    }
  }
  if (!found) {
    for (let i = 0; i < filtered.length; i++) {
      if (/^\*\*优先级\*\*/.test(filtered[i])) {
        filtered.splice(i + 1, 0, `- **上次提醒**：${ts}`); break;
      }
    }
  }
  
  await app.vault.modify(file, filtered.join("\n"));
}

/* ══════════════════════════════════════ */
export const VIEW_TYPE_INBOX = "inbox-tracker-view";

export class InboxView extends ItemView {
  private tasks: InboxTask[] = [];
  private plugin: InboxTrackerPlugin;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: InboxTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  private get s(): InboxTrackerSettings { return this.plugin.settings; }
  getViewType() { return VIEW_TYPE_INBOX; }
  getDisplayText() { return "任务面板"; }
  getIcon() { return "inbox"; }

  async onOpen() {
    this.containerEl.style.height = "100%";
    const child = this.containerEl.children[1] as HTMLElement;
    if (child) {
      child.style.height = "100%";
      child.style.display = "flex";
      child.style.flexDirection = "column";
      child.style.overflow = "hidden";
    }
    await this.refresh();
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path.startsWith(this.s.inboxFolder)) this.refresh();
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file.path.startsWith(this.s.inboxFolder)) this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file.path.startsWith(this.s.inboxFolder)) this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file.path.startsWith(this.s.inboxFolder) || oldPath.startsWith(this.s.inboxFolder)) this.refresh();
    }));
    
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, 60000);
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
      f => f.path.startsWith(ib) && !f.path.startsWith(ar) && f.extension === "md" && f.name !== "README.md"
    );
    this.tasks = [];
    for (const f of files) {
      const c = await this.app.vault.read(f);
      const t = parseInboxFile(c, f.path);
      // 检查是否应该重置
      if (shouldReset(t)) {
        await resetCycleTask(this.app, t);
        const newC = await this.app.vault.read(f);
        this.tasks.push(parseInboxFile(newC, f.path));
      } else {
        this.tasks.push(t);
      }
    }
    this.tasks.sort((a, b) => {
      if (!a.deadlineDate && !b.deadlineDate) return 0;
      if (!a.deadlineDate) return 1;
      if (!b.deadlineDate) return -1;
      return a.deadlineDate.getTime() - b.deadlineDate.getTime();
    });
    this.render();
  }

  private async addHistoryRecord(title: string, priority: number, taskType: "quick" | "full", todos?: { text: string; priority: number }[]) {
    const now = fmtDate(new Date());
    if (taskType === "full") {
      if (todos && todos.length > 0) {
        for (const todo of todos) {
          this.plugin.settings.historyRecords.unshift({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: todo.text,
            priority: todo.priority,
            taskType: "full",
            createdAt: now,
          });
        }
      } else {
        this.plugin.settings.historyRecords.unshift({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          priority,
          taskType: "full",
          createdAt: now,
        });
      }
    } else {
      this.plugin.settings.historyRecords.unshift({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        priority,
        taskType,
        createdAt: now,
      });
    }
    await this.plugin.saveSettings();
  }

  /* ── render ─────────────────────────── */
  private render() {
    const c = this.containerEl.children[1] as HTMLElement;
    c.empty(); c.addClass("inbox-tracker");

    // header
    const hdr = c.createDiv({ cls: "it-header" });
    const row = hdr.createDiv({ cls: "it-header-row" });
    row.createEl("span", { text: "任务面板", cls: "it-logo" });
    const btns = row.createDiv({ cls: "it-btn-group" });

    const quickBtn = btns.createEl("button", { text: "快速", cls: "it-btn-quick" });
    quickBtn.addEventListener("click", () => {
      new QuickAddModal(this.app, async (title, priority, deadline, recurrence) => {
        const fn = title.replace(/[\\/:*?"<>|]/g, "_");
        const recurStr = recurrence ? formatRecurrence(recurrence) : undefined;
        const lastNotified = recurrence ? fmtDate(new Date()) : undefined;
        const todos = [{ text: title, priority }];
        const ct = generateTaskContent(title, priority, deadline, "", todos, recurStr, lastNotified, true);
        if (!this.app.vault.getAbstractFileByPath(this.s.inboxFolder)) {
          await this.app.vault.createFolder(this.s.inboxFolder);
        }
        await this.app.vault.create(`${this.s.inboxFolder}/${fn}.md`, ct);

        this.addHistoryRecord(title, priority, "quick");
      }).open();
    });

    const addBtn = btns.createEl("button", { text: "批量", cls: "it-btn-add" });
    addBtn.addEventListener("click", () => {
      new CreateTaskModal(this.app, async (title, priority, deadline, desc, todos, recurrence) => {
        const fn = title.replace(/[\\/:*?"<>|]/g, "_");
        const recurStr = recurrence ? formatRecurrence(recurrence) : undefined;
        const lastNotified = recurrence ? fmtDate(new Date()) : undefined;
        const ct = generateTaskContent(title, priority, deadline, desc, todos, recurStr, lastNotified);
        if (!this.app.vault.getAbstractFileByPath(this.s.inboxFolder)) {
          await this.app.vault.createFolder(this.s.inboxFolder);
        }
        await this.app.vault.create(`${this.s.inboxFolder}/${fn}.md`, ct);

        this.addHistoryRecord(title, priority, "full", todos);
      }).open();
    });

    const historyBtn = btns.createEl("button", { text: "记录", cls: "it-btn-history" });
    historyBtn.addEventListener("click", () => {
      new HistoryModal(this.app, this.plugin).open();
    });

    // 统计标签
    const ud = this.s.urgentDays;
    const total = this.tasks.length;
    const overdue = this.tasks.filter(t => t.daysRemaining !== null && t.daysRemaining < 0).length;
    const upcoming = this.tasks.filter(t => t.daysRemaining !== null && t.daysRemaining >= 0 && t.daysRemaining <= ud).length;
    const sr = hdr.createDiv({ cls: "it-stats" });
    sr.createEl("span", { text: `全部 ${total}`, cls: "it-stat" });
    if (overdue > 0) sr.createEl("span", { text: `过期 ${overdue}`, cls: "it-stat it-stat-overdue" });
    if (upcoming > 0) sr.createEl("span", { text: `临近 ${upcoming}`, cls: "it-stat it-stat-upcoming" });

    // 提醒横幅
    this.renderDueReminder(c);

    // 统计面板
    this.renderStatsPanel(c);

    // 筛选面板
    this.renderFiltersPanel(c);

    // 列表
    const list = c.createDiv({ cls: "it-list" });
    if (total === 0) { list.createDiv({ cls: "it-empty", text: "清空了 🎉" }); return; }
    for (const t of this.tasks) this.renderCard(list, t);
  }

  /* ── reminder banner ────────────────── */
  private renderDueReminder(c: HTMLElement) {
    const ov: InboxTask[] = [], td: InboxTask[] = [], up: InboxTask[] = [];
    for (const t of this.tasks) {
      if (!t.todos.some(x => !x.completed)) continue;
      if (t.daysRemaining === null) continue;
      if (t.daysRemaining < 0) ov.push(t);
      else if (t.daysRemaining === 0) td.push(t);
      else if (t.daysRemaining <= this.s.urgentDays) up.push(t);
    }
    if (!ov.length && !td.length && !up.length) return;
    const ban = c.createDiv({ cls: "it-reminder-banner" });
    const addBlock = (arr: InboxTask[], cls: string, icon: string, label: string) => {
      if (!arr.length) return;
      const blk = ban.createDiv({ cls: `it-reminder-block ${cls}` });
      blk.createEl("span", { text: `${icon} ${label} · ${arr.length}个`, cls: "it-reminder-title" });
      const lst = blk.createDiv({ cls: "it-reminder-list" });
      for (const t of arr) {
        const tag = lst.createEl("span", { text: trunc(t.title, 8), cls: "it-reminder-tag" });
        tag.addEventListener("click", () => {
          const f = this.app.vault.getAbstractFileByPath(t.filePath);
          if (f instanceof TFile) { void this.app.workspace.getLeaf(false).openFile(f); }
        });
      }
    };
    addBlock(ov, "it-reminder-overdue", "⚠️", "已过期");
    addBlock(td, "it-reminder-today", "🔔", "今天到期");
    addBlock(up, "it-reminder-upcoming", "📅", `${this.s.urgentDays}天内`);
  }

  /* ── stats panel ────────────────────── */
  private renderStatsPanel(c: HTMLElement) {
    const all: { text: string; completed: boolean; priority: number; taskTitle: string; filePath: string; line: number; taskType: "quick" | "full" }[] = [];
    for (const t of this.tasks) for (const td of t.todos) {
      all.push({ text: td.text, completed: td.completed, priority: td.priority, taskTitle: t.title, filePath: t.filePath, line: td.line, taskType: t.taskType });
    }
    const doneN = all.filter(x => x.completed).length;
    const undoneN = all.filter(x => !x.completed).length;
    const panel = c.createDiv({ cls: "it-stats-panel" });

    const statusRow = panel.createDiv({ cls: "it-stat-row" });

    const doneChip = statusRow.createDiv({ cls: "it-stat-chip it-stat-chip-done" });
    doneChip.createEl("span", { text: "已完成", cls: "it-stat-chip-label" });
    doneChip.createEl("span", { text: `${doneN}`, cls: "it-stat-chip-count" });
    doneChip.addEventListener("click", () => { new TodoDetailModal(this.app, "已完成", all.filter(x => x.completed)).open(); });

    const undoneChip = statusRow.createDiv({ cls: "it-stat-chip it-stat-chip-undone" });
    undoneChip.createEl("span", { text: "未完成", cls: "it-stat-chip-label" });
    undoneChip.createEl("span", { text: `${undoneN}`, cls: "it-stat-chip-count" });
    undoneChip.addEventListener("click", () => { new TodoDetailModal(this.app, "未完成", all.filter(x => !x.completed)).open(); });
  }

  /* ── filters panel ──────────────────── */
  private renderFiltersPanel(c: HTMLElement) {
    const all: { text: string; completed: boolean; priority: number; taskTitle: string; filePath: string; line: number; taskType: "quick" | "full" }[] = [];
    for (const t of this.tasks) for (const td of t.todos) {
      all.push({ text: td.text, completed: td.completed, priority: td.priority, taskTitle: t.title, filePath: t.filePath, line: td.line, taskType: t.taskType });
    }

    const filterPanel = c.createDiv({ cls: "it-filters-panel" });

    for (let p = 0; p <= 2; p++) {
      const chip = filterPanel.createDiv({ cls: `it-filter-chip prio-${p}` });
      chip.createEl("span", { text: PRIORITY_LABELS[p] });
      chip.addEventListener("click", () => { new TodoDetailModal(this.app, PRIORITY_LABELS[p], all.filter(x => x.priority === p)).open(); });
    }

    const chip1 = filterPanel.createDiv({ cls: "it-filter-chip type-quick" });
    chip1.createEl("span", { text: "快速" });
    chip1.addEventListener("click", () => { new TodoDetailModal(this.app, "快速任务", all.filter(x => x.taskType === "quick")).open(); });

    const chip2 = filterPanel.createDiv({ cls: "it-filter-chip type-full" });
    chip2.createEl("span", { text: "批量" });
    chip2.addEventListener("click", () => { new TodoDetailModal(this.app, "批量任务", all.filter(x => x.taskType === "full")).open(); });
  }

  /* ── card ──────────────────────────── */
  private renderCard(parent: HTMLElement, task: InboxTask) {
    if (task.taskType === "quick") {
      this.renderQuickCard(parent, task);
    } else {
      this.renderNormalCard(parent, task);
    }
  }

  /* ── 快速任务卡片（简洁版） ────────── */
  private renderQuickCard(parent: HTMLElement, task: InboxTask) {
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
        if (f instanceof TFile && firstTodo) {
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
    const nameEl = r1.createEl("span", { text: todoText, cls: "it-card-name" });
    nameEl.setAttr("data-tooltip", todoText);
    nameEl.addEventListener("mouseenter", (e) => this.showTooltip(e, todoText));
    nameEl.addEventListener("mouseleave", () => this.hideTooltip());
    nameEl.addEventListener("click", () => {
      const f = this.app.vault.getAbstractFileByPath(task.filePath);
      if (f instanceof TFile) { void this.app.workspace.getLeaf(false).openFile(f); }
    });

    const del = r1.createEl("span", { text: "✕", cls: "it-btn-delete-card" });
    del.setAttr("aria-label", "删除");
    del.addEventListener("click", async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof TFile) await this.app.vault.trash(f, true);
      } catch (e) {
        console.error("Failed to delete task:", e);
      }
    });

    const r2 = card.createDiv({ cls: "it-card-row2" });
    
    if (firstTodo?.completed && firstTodo.completedAt) {
      r2.createEl("span", { text: `✅ ${firstTodo.completedAt}`, cls: "it-card-dl-text" });
    } else if (task.deadline) {
      const icon = task.daysRemaining !== null && task.daysRemaining < 0 ? "⚠️" : "⏰";
      r2.createEl("span", { text: `${icon} ${task.deadline}`, cls: "it-card-dl-text" });
    }
    
    if (task.recurrence && task.deadlineDate) {
      const nextCycle = formatNextCycle(task.recurrence, task.deadlineDate);
      r2.createEl("span", { text: `🔄 ${nextCycle}`, cls: "it-card-recur" });
    }
  }

  /* ── 普通任务卡片（完整版） ────────── */
  private renderNormalCard(parent: HTMLElement, task: InboxTask) {
    const uc = this.getUrgencyClass(task.daysRemaining, this.s.urgentDays);
    const completedClass = task.completedAt !== null ? "it-completed" : "";
    const card = parent.createDiv({ cls: `it-card ${uc} ${completedClass}` });

    const r1 = card.createDiv({ cls: "it-card-row1" });

    if (task.priority !== 2) {
      r1.createEl("span", { text: PRIORITY_LABELS[task.priority], cls: `it-card-prio it-prio-${task.priority}` });
    }
    const nameEl = r1.createEl("span", { text: trunc(task.title, 8), cls: "it-card-name" });
    nameEl.setAttr("data-tooltip", task.title);
    nameEl.addEventListener("mouseenter", (e) => this.showTooltip(e, task.title));
    nameEl.addEventListener("mouseleave", () => this.hideTooltip());
    nameEl.addEventListener("click", () => {
      const f = this.app.vault.getAbstractFileByPath(task.filePath);
      if (f instanceof TFile) { void this.app.workspace.getLeaf(false).openFile(f); }
    });

    const act = r1.createDiv({ cls: "it-card-act" });
    if (task.todos.some(x => !x.completed)) {
      const btn = act.createEl("span", { text: "✓全部完成", cls: "it-btn-complete-all" });
      btn.addEventListener("click", async () => {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof TFile) {
          const nc = completeAllTodosInContent(await this.app.vault.read(f));
          await this.app.vault.modify(f, nc);
        }
      });
    }
    const del = act.createEl("span", { text: "✕", cls: "it-btn-delete-card" });
    del.setAttr("aria-label", "删除");
    del.addEventListener("click", async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(task.filePath);
        if (f instanceof TFile) await this.app.vault.trash(f, true);
      } catch (e) {
        console.error("Failed to delete task:", e);
      }
    });

    const r2 = card.createDiv({ cls: "it-card-row2" });
    if (task.deadline) {
      const dlBlock = r2.createDiv({ cls: "it-card-dl" });
      const icon = task.daysRemaining !== null && task.daysRemaining < 0 ? "⚠️" : "⏰";
      dlBlock.createEl("span", { text: `${icon} ${task.deadline}`, cls: "it-card-dl-text" });
      if (task.hoursRemaining !== null) {
        const ah = Math.abs(task.hoursRemaining);
        const d = Math.floor(ah / 24);
        const h = ah % 24;
        let lbl: string;
        if (task.hoursRemaining < 0) lbl = d > 0 ? `过期${d}d${h}h` : `过期${h}h`;
        else if (task.hoursRemaining === 0) lbl = "现在";
        else lbl = d > 0 ? `${d}d${h}h` : `${h}h`;
        dlBlock.createEl("span", { text: lbl, cls: `it-card-countdown ${uc}` });
      }
    }
    if (task.recurrence && task.deadlineDate) {
      r2.createEl("span", { text: `🔄 ${formatNextCycle(task.recurrence, task.deadlineDate)}`, cls: "it-card-recur" });
    }

    if (task.todos.length > 0) {
      const sorted = [...task.todos].sort((a, b) => a.priority - b.priority);
      const vis = this.s.showCompletedTodos ? sorted : sorted.filter(x => !x.completed);
      const doneN = task.todos.filter(x => x.completed).length;
      const totalN = task.todos.length;
      const pct = Math.round((doneN / totalN) * 100);

      const prog = card.createDiv({ cls: "it-card-progress" });
      const bar = prog.createDiv({ cls: "it-progress-bar" });
      const fill = bar.createDiv({ cls: "it-progress-fill" });
      fill.style.width = `${pct}%`;
      prog.createEl("span", { text: `${doneN}/${totalN}`, cls: "it-progress-text" });

      const isCollapsed = totalN > 5;
      const displayTodos = isCollapsed ? vis.slice(0, 3) : vis;

      const tds = card.createDiv({ cls: "it-todos" });
      for (const td of displayTodos) {
        const isD = td.completed;
        const tr = tds.createDiv({ cls: `it-todo-row ${isD ? "it-todo-done" : ""}` });
        if (td.priority !== 2) {
          tr.createEl("span", { text: PRIORITY_LABELS[td.priority], cls: `it-card-prio it-prio-${td.priority}` });
        }
        const cb = tr.createEl("input", { type: "checkbox" });
        cb.checked = isD;
        cb.addEventListener("change", async () => {
          const f = this.app.vault.getAbstractFileByPath(task.filePath);
          if (f instanceof TFile) {
            const nc = toggleTodoInContent(await this.app.vault.read(f), td.line);
            await this.app.vault.modify(f, nc);
          }
        });
        const tspan = tr.createEl("span", { text: trunc(td.text, 20), cls: "it-todo-text" });
        tspan.setAttr("data-tooltip", td.text);
        tspan.addEventListener("mouseenter", (e) => this.showTooltip(e, td.text));
        tspan.addEventListener("mouseleave", () => this.hideTooltip());
        if (isD && td.completedAt) {
          tr.createEl("span", { text: td.completedAt, cls: "it-todo-done-time" });
        }
        const dd = tr.createEl("span", { text: "✕", cls: "it-todo-del" });
        dd.addEventListener("click", async () => {
          const f = this.app.vault.getAbstractFileByPath(task.filePath);
          if (f instanceof TFile) {
            const nc = removeTodoFromContent(await this.app.vault.read(f), td.line);
            await this.app.vault.modify(f, nc);
          }
        });
      }

      if (isCollapsed) {
        const hiddenCount = vis.length - 3;
        const toggleBtn = card.createDiv({ cls: "it-todo-toggle" });
        toggleBtn.createEl("span", { text: `展开 ${hiddenCount} 条`, cls: "it-todo-toggle-text" });
        toggleBtn.addEventListener("click", () => {
          tds.empty();
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
              if (f instanceof TFile) {
                const nc = toggleTodoInContent(await this.app.vault.read(f), td.line);
                await this.app.vault.modify(f, nc);
              }
            });
            const tspan = tr.createEl("span", { text: trunc(td.text, 20), cls: "it-todo-text" });
            tspan.setAttr("data-tooltip", td.text);
            tspan.addEventListener("mouseenter", (e) => this.showTooltip(e, td.text));
            tspan.addEventListener("mouseleave", () => this.hideTooltip());
            if (isD && td.completedAt) {
              tr.createEl("span", { text: td.completedAt, cls: "it-todo-done-time" });
            }
            const dd = tr.createEl("span", { text: "✕", cls: "it-todo-del" });
            dd.addEventListener("click", async () => {
              const f = this.app.vault.getAbstractFileByPath(task.filePath);
              if (f instanceof TFile) {
                const nc = removeTodoFromContent(await this.app.vault.read(f), td.line);
                await this.app.vault.modify(f, nc);
              }
            });
          }
          toggleBtn.empty();
          toggleBtn.createEl("span", { text: "收起", cls: "it-todo-toggle-text" });
          toggleBtn.addEventListener("click", () => {
            tds.empty();
            for (const td of vis.slice(0, 3)) {
              const isD = td.completed;
              const tr = tds.createDiv({ cls: `it-todo-row ${isD ? "it-todo-done" : ""}` });
              if (td.priority !== 2) {
                tr.createEl("span", { text: PRIORITY_LABELS[td.priority], cls: `it-card-prio it-prio-${td.priority}` });
              }
              const cb = tr.createEl("input", { type: "checkbox" });
              cb.checked = isD;
              cb.addEventListener("change", async () => {
                const f = this.app.vault.getAbstractFileByPath(task.filePath);
                if (f instanceof TFile) {
                  const nc = toggleTodoInContent(await this.app.vault.read(f), td.line);
                  await this.app.vault.modify(f, nc);
                }
              });
              const tspan = tr.createEl("span", { text: trunc(td.text, 20), cls: "it-todo-text" });
              tspan.setAttr("data-tooltip", td.text);
              tspan.addEventListener("mouseenter", (e) => this.showTooltip(e, td.text));
              tspan.addEventListener("mouseleave", () => this.hideTooltip());
              if (isD && td.completedAt) {
                tr.createEl("span", { text: td.completedAt, cls: "it-todo-done-time" });
              }
              const dd = tr.createEl("span", { text: "✕", cls: "it-todo-del" });
              dd.addEventListener("click", async () => {
                const f = this.app.vault.getAbstractFileByPath(task.filePath);
                if (f instanceof TFile) {
                  const nc = removeTodoFromContent(await this.app.vault.read(f), td.line);
                  await this.app.vault.modify(f, nc);
                }
              });
            }
            toggleBtn.empty();
            toggleBtn.createEl("span", { text: `展开 ${hiddenCount} 条`, cls: "it-todo-toggle-text" });
          });
        });
      }
    }

    if (task.todos.length < 10) {
      const ar = card.createDiv({ cls: "it-todo-add-row" });
      const ab = ar.createEl("span", { text: "+ 添加待办", cls: "it-btn-add-todo" });
      ab.addEventListener("click", () => {
        new AddTodoModal(this.app, async (text, prio) => {
          const f = this.app.vault.getAbstractFileByPath(task.filePath);
          if (f instanceof TFile) {
            const nc = addTodoToContent(await this.app.vault.read(f), text, prio);
            await this.app.vault.modify(f, nc);
          }
        }).open();
      });
    }
  }

  private getUrgencyClass(d: number | null, ud: number) {
    if (d === null) return "";
    if (d < 0) return "it-overdue";
    if (d <= ud) return "it-urgent";
    return "it-normal";
  }

  private showTooltip(e: MouseEvent, text: string) {
    let tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "it-tooltip";
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = text;
    tooltip.style.display = "block";
    tooltip.style.transform = "none";
    void tooltip.offsetWidth;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const centerX = rect.left + rect.width / 2;
    tooltip.style.left = `${centerX - tooltipWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
  }

  private hideTooltip() {
    const tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }
}

/* ══════════════════════════════════════ */
/* 快速添加 — 极简：标题等于待办内容 */
/* ══════════════════════════════════════ */
class QuickAddModal extends Modal {
  private onSubmit: (title: string, priority: number, deadline: string, recurrence: Recurrence | null) => Promise<void>;
  private title = "";
  private priority = 2;
  private datePart = "";
  private timePart = "";
  private recurType = "none";

  constructor(app: App, onSubmit: QuickAddModal["onSubmit"]) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "快速添加", cls: "it-modal-title" });

    // ── 任务名称（即待办内容） ──
    const nameWrap = this.makeField(contentEl, "任务名称", "最多20个字，同时作为待办内容");
    const nameInput = nameWrap.createEl("input", { type: "text", attr: { placeholder: "输入名称", maxlength: "20" } });
    nameInput.addEventListener("input", () => this.title = nameInput.value);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { void this.submit(); } });

    // ── 优先级 ──
    const prioWrap = this.makeField(contentEl, "优先级", "必选，默认为一般");
    const prioSelect = prioWrap.createEl("select");
    for (let p = 0; p <= 2; p++) {
      prioSelect.createEl("option", { text: PRIORITY_LABELS[p] }).value = String(p);
    }
    prioSelect.value = "2";
    prioSelect.addEventListener("change", () => this.priority = Number(prioSelect.value));

    // ── 到期时间 ──
    const dlWrap = this.makeField(contentEl, "到期时间", "不填则永久");
    dlWrap.style.display = "flex"; dlWrap.style.gap = "8px";
    const dateInput = dlWrap.createEl("input", { type: "date" });
    const timeInput = dlWrap.createEl("input", { type: "time" });
    dateInput.style.flex = "1.5"; dateInput.style.minWidth = "110px";
    timeInput.style.flex = "1";   timeInput.style.minWidth = "80px";
    dateInput.addEventListener("input", () => { this.datePart = dateInput.value; this.toggleRecur(); });
    timeInput.addEventListener("input", () => this.timePart = timeInput.value);

    // ── 循环（依赖日期） ──
    const recurWrap = this.makeField(contentEl, "循环", "需先选择到期日期");
    const recurSelect = recurWrap.createEl("select");
    const recurOpts = [
      ["none", "不循环"], ["daily", "每天"], ["weekly", "每周"],
      ["monthly", "每月"], ["yearly", "每年"]
    ];
    for (const [v, t] of recurOpts) {
      recurSelect.createEl("option", { text: t }).value = v;
    }
    recurSelect.value = "none";
    recurSelect.disabled = true;
    recurSelect.addEventListener("change", () => this.recurType = recurSelect.value);
    (this as any)._recurSelect = recurSelect;

    // ── 按钮 ──
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    btnRow.createEl("button", { text: "创建", cls: "it-btn-submit" }).addEventListener("click", () => this.submit());
    btnRow.createEl("button", { text: "取消", cls: "it-btn-cancel" }).addEventListener("click", () => this.close());

    // 自动聚焦
    setTimeout(() => nameInput.focus(), 50);
  }

  /** 创建一个 label + 控件容器 */
  private makeField(parent: HTMLElement, label: string, desc?: string): HTMLElement {
    const wrap = parent.createDiv({ cls: "it-field" });
    wrap.createEl("span", { text: label, cls: "it-field-label" });
    if (desc) wrap.createEl("span", { text: desc, cls: "it-field-desc" });
    const ctrl = wrap.createDiv({ cls: "it-field-control" });
    return ctrl;
  }

  private toggleRecur() {
    const sel = (this as any)._recurSelect as HTMLSelectElement | undefined;
    if (!sel) return;
    if (this.datePart) {
      sel.disabled = false;
    } else {
      sel.value = "none";
      this.recurType = "none";
      sel.disabled = true;
    }
  }

  private async submit() {
    if (!this.title.trim()) return;
    let deadline = "";
    if (this.datePart) {
      if (!this.timePart) this.timePart = "23:59";
      deadline = `${this.datePart} ${this.timePart}`;
    }
    let rec: Recurrence | null = null;
    if (this.datePart && this.recurType !== "none") {
      rec = { type: this.recurType as Recurrence["type"], hour: 9, minute: 0 };
      if (this.timePart) { const [h,m] = this.timePart.split(":").map(Number); rec.hour = h; rec.minute = m; }
    }
    await this.onSubmit(this.title.trim(), this.priority, deadline, rec);
    this.close();
  }
  onClose() { this.contentEl.empty(); }
}

/* ══════════════════════════════════════ */
/* 完整新建                             */
/* ══════════════════════════════════════ */
class CreateTaskModal extends Modal {
  private onSubmit: (title: string, priority: number, deadline: string, description: string, todos: { text: string; priority: number }[], recurrence: Recurrence | null) => Promise<void>;
  private title = ""; private priority = 2; private datePart = ""; private timePart = "";
  private description = ""; private recurType = "none"; private todoContainer!: HTMLElement;

  constructor(app: App, onSubmit: CreateTaskModal["onSubmit"]) { super(app); this.onSubmit = onSubmit; }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "批量新建任务", cls: "it-modal-title" });

    // ── 名称 ──
    const nameWrap = this.makeField(contentEl, "任务名称", "最多20个字");
    const nameInput = nameWrap.createEl("input", { type: "text", attr: { placeholder: "输入名称", maxlength: "20" } });
    nameInput.addEventListener("input", () => this.title = nameInput.value);

    // ── 优先级 ──
    const prioWrap = this.makeField(contentEl, "优先级", "");
    const prioSelect = prioWrap.createEl("select");
    for (let p = 0; p <= 2; p++) prioSelect.createEl("option", { text: PRIORITY_LABELS[p] }).value = String(p);
    prioSelect.value = "2";
    prioSelect.addEventListener("change", () => this.priority = Number(prioSelect.value));

    // ── 截止日期 ──
    const dlWrap = this.makeField(contentEl, "截止日期", "不填则永久");
    dlWrap.style.display = "flex"; dlWrap.style.gap = "8px";
    const di = dlWrap.createEl("input", { type: "date" });
    const ti = dlWrap.createEl("input", { type: "time" });
    di.style.flex = "1.5"; di.style.minWidth = "110px";
    ti.style.flex = "1";   ti.style.minWidth = "80px";
    di.addEventListener("input", () => { this.datePart = di.value; this.toggleRecur(); });
    ti.addEventListener("input", () => this.timePart = ti.value);

    // ── 循环（依赖日期） ──
    const recurWrap = this.makeField(contentEl, "循环", "需先选择截止日期");
    const recurSelect = recurWrap.createEl("select");
    const recurOpts: [string,string][] = [["none","不循环"],["daily","每天"],["weekly","每周"],["monthly","每月"],["yearly","每年"]];
    for (const [v, t] of recurOpts) recurSelect.createEl("option", { text: t }).value = v;
    recurSelect.value = "none";
    recurSelect.disabled = true;
    recurSelect.addEventListener("change", () => this.recurType = recurSelect.value);
    (this as any)._recurSelect = recurSelect;

    // ── 描述 ──
    const descWrap = this.makeField(contentEl, "描述", "可选");
    const descArea = descWrap.createEl("textarea", { attr: { placeholder: "简要描述", rows: "2" } });
    descArea.addEventListener("input", () => this.description = descArea.value);

    // ── 待办 ──
    const todoLabel = contentEl.createDiv({ cls: "it-field" });
    todoLabel.createEl("span", { text: "待办事项", cls: "it-field-label" });
    todoLabel.createEl("span", { text: "逐条添加（最多10条，每条最多20字，必须选择优先级）", cls: "it-field-desc" });
    this.todoContainer = contentEl.createDiv({ cls: "it-todo-dynamic-list" });
    this.addRow(); this.addRow(); this.addRow();

    const addRowBtn = contentEl.createEl("button", { text: "+ 添加一行", cls: "it-btn-add-row" });
    addRowBtn.addEventListener("click", () => {
      if (this.todoContainer.querySelectorAll(".it-todo-dynamic-row").length >= 10) return;
      this.addRow();
    });

    // ── 按钮 ──
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    btnRow.createEl("button", { text: "创建", cls: "it-btn-submit" }).addEventListener("click", () => this.submit());
    btnRow.createEl("button", { text: "取消", cls: "it-btn-cancel" }).addEventListener("click", () => this.close());

    setTimeout(() => nameInput.focus(), 50);
  }

  private makeField(parent: HTMLElement, label: string, desc?: string): HTMLElement {
    const wrap = parent.createDiv({ cls: "it-field" });
    wrap.createEl("span", { text: label, cls: "it-field-label" });
    if (desc) wrap.createEl("span", { text: desc, cls: "it-field-desc" });
    const ctrl = wrap.createDiv({ cls: "it-field-control" });
    return ctrl;
  }

  private toggleRecur() {
    const sel = (this as any)._recurSelect as HTMLSelectElement | undefined;
    if (!sel) return;
    if (this.datePart) { sel.disabled = false; }
    else { sel.value = "none"; this.recurType = "none"; sel.disabled = true; }
  }

  private async submit() {
    if (!this.title.trim()) return;
    let deadline = "";
    if (this.datePart) {
      if (!this.timePart) this.timePart = "23:59";
      deadline = `${this.datePart} ${this.timePart}`;
    }
    let rec: Recurrence | null = null;
    if (this.datePart && this.recurType !== "none") {
      rec = { type: this.recurType as Recurrence["type"], hour: 9, minute: 0 };
      if (this.timePart) { const [h,m] = this.timePart.split(":").map(Number); rec.hour = h; rec.minute = m; }
    }
    await this.onSubmit(this.title.trim(), this.priority, deadline, this.description, this.collectTodos(), rec);
    this.close();
  }

  private addRow(txt = "") {
    const row = this.todoContainer.createDiv({ cls: "it-todo-dynamic-row" });
    const sel = row.createEl("select", { cls: "it-prio-select" });
    for (let p = 0; p <= 2; p++) {
      const o = sel.createEl("option", { text: PRIORITY_LABELS[p] }); o.value = String(p);
      if (p === 2) o.selected = true;
    }
    const inp = row.createEl("input", { type: "text", cls: "it-todo-dynamic-input", attr: { placeholder: "待办内容（最多20字）", maxlength: "20" } });
    inp.value = txt;
    const del = row.createEl("span", { text: "✕", cls: "it-todo-dynamic-del" });
    del.addEventListener("click", () => row.remove());
    inp.focus();
  }

  private collectTodos(): { text: string; priority: number }[] {
    const res: { text: string; priority: number }[] = [];
    this.todoContainer.querySelectorAll(".it-todo-dynamic-row").forEach(row => {
      const sel = row.querySelector(".it-prio-select") as HTMLSelectElement;
      const inp = row.querySelector(".it-todo-dynamic-input") as HTMLInputElement;
      const t = inp?.value?.trim();
      if (t) res.push({ text: t, priority: Number(sel?.value ?? 2) });
    });
    return res;
  }
  onClose() { this.contentEl.empty(); }
}

/* ══════════════════════════════════════ */
/* AddTodoModal / TodoDetailModal       */
/* ══════════════════════════════════════ */
class AddTodoModal extends Modal {
  private onSubmit: (text: string, priority: number) => Promise<void>;
  private text = ""; private priority = 2;
  constructor(app: App, onSubmit: AddTodoModal["onSubmit"]) { super(app); this.onSubmit = onSubmit; }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal");
    contentEl.createEl("h2", { text: "添加待办", cls: "it-modal-title" });
    new Setting(contentEl).setName("内容").addText(tx => {
      tx.setPlaceholder("输入待办内容").onChange(v => this.text = v);
      tx.inputEl.setAttr("maxlength", "20");
    });
    new Setting(contentEl).setName("优先级").addDropdown(dd => {
      for (let p = 0; p <= 2; p++) dd.addOption(String(p), PRIORITY_LABELS[p]);
      dd.setValue("2"); dd.onChange(v => this.priority = Number(v));
    });
    const btnRow = contentEl.createDiv({ cls: "it-modal-actions" });
    const sub = btnRow.createEl("button", { text: "添加", cls: "it-btn-submit" });
    sub.addEventListener("click", async () => { if (!this.text.trim()) return; await this.onSubmit(this.text.trim(), this.priority); this.close(); });
    const cancel = btnRow.createEl("button", { text: "取消", cls: "it-btn-cancel" });
    cancel.addEventListener("click", () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

class TodoDetailModal extends Modal {
  private title: string;
  private items: { text: string; completed: boolean; priority: number; taskTitle: string; filePath: string; line: number }[];
  constructor(app: App, title: string, items: TodoDetailModal["items"]) { super(app); this.title = title; this.items = items; }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal", "it-detail-modal");
    contentEl.createEl("h2", { text: `${this.title} — ${this.items.length}条`, cls: "it-modal-title" });
    if (!this.items.length) { contentEl.createDiv({ cls: "it-detail-empty", text: "无匹配项" }); return; }
    const grouped = new Map<string, typeof this.items>();
    for (const it of this.items) {
      const k = it.taskTitle;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(it);
    }
    const list = contentEl.createDiv({ cls: "it-detail-list" });
    for (const [tt, its] of grouped) {
      const g = list.createDiv({ cls: "it-detail-group" });
      const hd = g.createDiv({ cls: "it-detail-group-header" });
      hd.createEl("span", { text: tt, cls: "it-detail-task-title" });
      hd.addEventListener("click", () => {
        const f = this.app.vault.getAbstractFileByPath(its[0].filePath);
        if (f instanceof TFile) { void this.app.workspace.getLeaf(false).openFile(f); this.close(); }
      });
      for (const it of its) {
        const r = g.createDiv({ cls: `it-detail-item ${it.completed ? "it-detail-done" : ""}` });
        const cb = r.createEl("input", { type: "checkbox" });
        cb.checked = it.completed;
        cb.addEventListener("change", async () => {
          try {
            const f = this.app.vault.getAbstractFileByPath(it.filePath);
            if (f instanceof TFile) {
              const nc = toggleTodoInContent(await this.app.vault.read(f), it.line);
              await this.app.vault.modify(f, nc);
            }
          } catch (e) {
            console.error("Failed to toggle todo:", e);
          }
        });
        r.createEl("span", { text: PRIORITY_LABELS[it.priority], cls: `it-card-prio it-prio-${it.priority}` });
        const textEl = r.createEl("span", { text: trunc(it.text, 30), cls: "it-detail-text" });
        textEl.setAttr("data-tooltip", it.text);
        textEl.addEventListener("mouseenter", (e) => this.showTooltip(e, it.text));
        textEl.addEventListener("mouseleave", () => this.hideTooltip());
      }
    }
  }

  private showTooltip(e: MouseEvent, text: string) {
    let tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "it-tooltip";
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = text;
    tooltip.style.display = "block";
    tooltip.style.transform = "none";
    void tooltip.offsetWidth;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const centerX = rect.left + rect.width / 2;
    tooltip.style.left = `${centerX - tooltipWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
  }

  private hideTooltip() {
    const tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  onClose() { this.contentEl.empty(); }
}

/* ══════════════════════════════════════ */
/* 历史记录弹窗                          */
/* ══════════════════════════════════════ */
class HistoryModal extends Modal {
  private plugin: InboxTrackerPlugin;
  private dateFilter = "";
  private typeFilter = "all";
  private priorityFilter = "all";
  private searchKeyword = "";
  private sortBy = "date";
  private sortOrder = "desc";

  constructor(app: App, plugin: InboxTrackerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("it-modal", "it-history-modal");
    contentEl.createEl("h2", { text: "历史记录", cls: "it-modal-title" });

    await this.renderFilters(contentEl);
    await this.renderTable(contentEl);
  }

  private async renderFilters(parent: HTMLElement) {
    const filterRow = parent.createDiv({ cls: "it-history-filters" });

    const dateInput = filterRow.createEl("input", { type: "date", cls: "it-history-filter-date" });
    dateInput.addEventListener("input", () => {
      this.dateFilter = dateInput.value;
      void this.refreshTable();
    });

    const typeSelect = filterRow.createEl("select", { cls: "it-history-filter-select" });
    typeSelect.createEl("option", { text: "全部类型", value: "all" });
    typeSelect.createEl("option", { text: "快速任务", value: "quick" });
    typeSelect.createEl("option", { text: "批量任务", value: "full" });
    typeSelect.addEventListener("change", () => {
      this.typeFilter = typeSelect.value;
      void this.refreshTable();
    });

    const prioritySelect = filterRow.createEl("select", { cls: "it-history-filter-select" });
    prioritySelect.createEl("option", { text: "全部优先级", value: "all" });
    prioritySelect.createEl("option", { text: "必做", value: "0" });
    prioritySelect.createEl("option", { text: "重要", value: "1" });
    prioritySelect.createEl("option", { text: "一般", value: "2" });
    prioritySelect.addEventListener("change", () => {
      this.priorityFilter = prioritySelect.value;
      void this.refreshTable();
    });

    const searchInput = filterRow.createEl("input", { type: "text", attr: { placeholder: "搜索任务名称" }, cls: "it-history-filter-search" });
    searchInput.addEventListener("input", () => {
      this.searchKeyword = searchInput.value.toLowerCase();
      void this.refreshTable();
    });

    const sortSelect = filterRow.createEl("select", { cls: "it-history-filter-select" });
    sortSelect.createEl("option", { text: "按时间排序", value: "date" });
    sortSelect.createEl("option", { text: "按名称排序", value: "name" });
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value;
      void this.refreshTable();
    });

    const sortBtn = filterRow.createEl("button", { text: "↑↓", cls: "it-history-sort-btn" });
    sortBtn.addEventListener("click", () => {
      this.sortOrder = this.sortOrder === "desc" ? "asc" : "desc";
      void this.refreshTable();
    });

    const clearBtn = filterRow.createEl("button", { text: "清除", cls: "it-history-clear-btn" });
    clearBtn.addEventListener("click", async () => {
      this.dateFilter = "";
      this.typeFilter = "all";
      this.priorityFilter = "all";
      this.searchKeyword = "";
      this.sortBy = "date";
      this.sortOrder = "desc";
      (dateInput as HTMLInputElement).value = "";
      typeSelect.value = "all";
      prioritySelect.value = "all";
      (searchInput as HTMLInputElement).value = "";
      sortSelect.value = "date";
      await this.refreshTable();
    });
  }

  private async renderTable(parent: HTMLElement) {
    let table = parent.querySelector(".it-history-table-wrapper") as HTMLElement | null;
    if (table) {
      table.remove();
    }

    table = parent.createDiv({ cls: "it-history-table-wrapper" });
    const t = table.createEl("table", { cls: "it-history-table" });
    const thead = t.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "序号" });
    headerRow.createEl("th", { text: "历史任务名称" });
    headerRow.createEl("th", { text: "创建时间" });
    headerRow.createEl("th", { text: "类型" });
    headerRow.createEl("th", { text: "优先级" });
    headerRow.createEl("th", { text: "操作" });

    const tbody = t.createEl("tbody");
    const records = await this.getFilteredRecords();

    if (records.length === 0) {
      const emptyRow = tbody.createEl("tr");
      const emptyCell = emptyRow.createEl("td", { text: "暂无历史记录", cls: "it-history-empty" });
      emptyCell.colSpan = 6;
      return;
    }

    records.forEach((record, index) => {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: String(index + 1) });
      const titleCell = row.createEl("td", { text: record.title, cls: "it-history-title" });
      titleCell.setAttr("data-tooltip", record.title);
      titleCell.addEventListener("mouseenter", (e) => this.showTooltip(e, record.title));
      titleCell.addEventListener("mouseleave", () => this.hideTooltip());
      const dateCell = row.createEl("td", { text: record.createdAt, cls: "it-history-date" });
      dateCell.setAttr("data-tooltip", record.createdAt);
      dateCell.addEventListener("mouseenter", (e) => this.showTooltip(e, record.createdAt));
      dateCell.addEventListener("mouseleave", () => this.hideTooltip());
      row.createEl("td", { text: record.taskType === "quick" ? "快速" : "批量" });
      row.createEl("td", { text: PRIORITY_LABELS[record.priority] });
      const actionCell = row.createEl("td");
      const deleteBtn = actionCell.createEl("button", { text: "删除", cls: "it-btn-delete" });
      deleteBtn.addEventListener("click", async () => {
        await this.deleteRecord(record.id);
        await this.refreshTable();
      });
    });
  }

  private async getFilteredRecords() {
    const records = [...this.plugin.settings.historyRecords];

    const filtered = records.filter(record => {
      if (this.dateFilter && record.createdAt && !record.createdAt.startsWith(this.dateFilter)) {
        return false;
      }
      if (this.typeFilter !== "all" && record.taskType !== this.typeFilter) {
        return false;
      }
      if (this.priorityFilter !== "all" && String(record.priority) !== this.priorityFilter) {
        return false;
      }
      if (this.searchKeyword && !record.title.toLowerCase().includes(this.searchKeyword)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (this.sortBy === "date") {
        return this.sortOrder === "desc"
          ? (b.createdAt || "").localeCompare(a.createdAt || "")
          : (a.createdAt || "").localeCompare(b.createdAt || "");
      } else {
        return this.sortOrder === "desc"
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title);
      }
    });

    return filtered;
  }

  private async deleteRecord(id: string) {
    this.plugin.settings.historyRecords = this.plugin.settings.historyRecords.filter(r => r.id !== id);
    await this.plugin.saveSettings();
  }

  private async refreshTable() {
    const contentEl = this.contentEl;
    await this.renderTable(contentEl);
  }

  private showTooltip(e: MouseEvent, text: string) {
    let tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "it-tooltip";
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = text;
    tooltip.style.display = "block";
    tooltip.style.transform = "none";
    void tooltip.offsetWidth;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const centerX = rect.left + rect.width / 2;
    tooltip.style.left = `${centerX - tooltipWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
  }

  private hideTooltip() {
    const tooltip = document.querySelector(".it-tooltip") as HTMLElement;
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}