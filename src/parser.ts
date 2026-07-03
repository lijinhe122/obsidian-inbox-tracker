import { InboxTask, TodoItem, Recurrence } from "./types";

/** 灵活解析日期+时间：支持 YYYY-MM-DD HH:mm、MM-DD HH:mm、YYYY-MM-DD、YYYY/MM/DD、MM-DD、MM/DD
 *  省略年份时自动补当前年，如果算出来已过期超过 30 天则补下一年
 *  省略时间时默认为 23:59 */
export function parseFlexibleDate(raw: string): Date | null {
  const trimmed = raw.trim();

  // 带时间的完整日期 YYYY-MM-DD HH:mm 或 YYYY/MM/DD HH:mm
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

  // 带时间的省略年份 MM-DD HH:mm 或 MM/DD HH:mm
  const shortTimeMatch = trimmed.match(/(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (shortTimeMatch) {
    const now = new Date();
    const month = Number(shortTimeMatch[1]) - 1;
    const day = Number(shortTimeMatch[2]);
    const hours = Number(shortTimeMatch[3]);
    const minutes = Number(shortTimeMatch[4]);
    let year = now.getFullYear();
    const candidate = new Date(year, month, day, hours, minutes);
    const diffDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -30) {
      year += 1;
    }
    return new Date(year, month, day, hours, minutes);
  }

  // 完整日期（无时间）YYYY-MM-DD 或 YYYY/MM/DD
  const fullMatch = trimmed.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (fullMatch) {
    return new Date(Number(fullMatch[1]), Number(fullMatch[2]) - 1, Number(fullMatch[3]), 23, 59);
  }

  // 省略年份（无时间）MM-DD 或 MM/DD
  const shortMatch = trimmed.match(/(\d{1,2})[-/](\d{1,2})/);
  if (shortMatch) {
    const now = new Date();
    const month = Number(shortMatch[1]) - 1;
    const day = Number(shortMatch[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, month, day, 23, 59);
    const diffDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -30) {
      year += 1;
    }
    return new Date(year, month, day, 23, 59);
  }
  return null;
}

/** 规范化日期输入：省略年份时自动补全为 YYYY-MM-DD HH:mm */
export function normalizeDeadline(input: string): string {
  const d = parseFlexibleDate(input);
  if (!d) return input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function parseInboxFile(content: string, filePath: string): InboxTask {
  const lines = content.split("\n");

  let title = filePath.split("/").pop()?.replace(".md", "") || "Untitled";
  let priority = 2;
  let deadline: string | null = null;
  let deadlineDate: Date | null = null;
  let description = "";
  let completedAt: string | null = null;
  let recurrence: Recurrence | null = null;
  let lastNotified: string | null = null;
  const todos: TodoItem[] = [];
  let hasDescriptionSection = false;
  let hasTodoSection = false;
  let hasQuickTag = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 标题
    if (/^# /.test(line) && title === filePath.split("/").pop()?.replace(".md", "")) {
      title = line.replace(/^# /, "").trim();
    }

    // 优先级
    const prioMatch = line.match(/\*\*优先级\*\*[：:]\s*(.+)/);
    if (prioMatch) {
      const p = prioMatch[1].trim();
      if (p.includes("必做")) priority = 0;
      else if (p.includes("重要")) priority = 1;
      else priority = 2;
    }

    // 截止日期
    const deadlineMatch = line.match(/\*\*截止日期\*\*[：:]\s*(.+)/);
    if (deadlineMatch) {
      const raw = deadlineMatch[1].trim();
      deadline = raw;
      deadlineDate = parseFlexibleDate(raw);
    }

    // 循环
    const recurMatch = line.match(/\*\*循环\*\*[：:]\s*(.+)/);
    if (recurMatch) {
      recurrence = parseRecurrence(recurMatch[1].trim());
    }

    // 上次提醒
    const lastNotifiedMatch = line.match(/\*\*上次提醒\*\*[：:]\s*(.+)/);
    if (lastNotifiedMatch) {
      lastNotified = lastNotifiedMatch[1].trim();
    }

    // 完成时间
    const completedMatch = line.match(/-?\s*\*\*完成时间\*\*[：:]\s*(.+)/);
    if (completedMatch) {
      completedAt = completedMatch[1].trim();
    }

    // 检测 ## 描述 / ## 待办 小节标题
    if (/^## 描述/.test(line)) hasDescriptionSection = true;
    if (/^## 待办/.test(line)) hasTodoSection = true;
    if (/任务类型.*：快速/.test(line)) hasQuickTag = true;

    // 待办项
    const todoMatch = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)/);
    if (todoMatch) {
      let text = todoMatch[3].trim();
      let todoPriority = 2;
      let todoCompletedAt: string | null = null;
      const doneMatch = text.match(/#done@(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
      if (doneMatch) {
        todoCompletedAt = doneMatch[1];
        text = text.replace(/#done@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/, "").trim();
      }
      const prioMap: Record<string, number> = { "#必做": 0, "#重要": 1, "#一般": 2 };
      for (const [tag, p] of Object.entries(prioMap)) {
        if (text.endsWith(tag)) { todoPriority = p; text = text.slice(0, -tag.length).trim(); break; }
      }
      todos.push({ text, completed: todoMatch[2] !== " ", line: i, priority: todoPriority, completedAt: todoCompletedAt });
    }
  }

  let daysRemaining: number | null = null;
  let hoursRemaining: number | null = null;
  if (deadlineDate) {
    const now = new Date();
    hoursRemaining = Math.round((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dlDay = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    daysRemaining = Math.ceil((dlDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 判断任务类型：根据任务类型标记判断，否则根据是否有描述或待办小节判断
  const taskType: "quick" | "full" = hasQuickTag ? "quick" : "full";

  return { filePath, title, priority, deadline, deadlineDate, description, completedAt, todos, daysRemaining, hoursRemaining, recurrence, lastNotified, taskType };
}

/** 解析循环标签字符串，如 "weekly:3:09:00" 表示每周三09:00 */
function parseRecurrence(raw: string): Recurrence | null {
  if (!raw || raw === "none") return null;
  const parts = raw.split(":");
  const type = parts[0] as Recurrence["type"];
  if (!["daily", "weekly", "monthly", "yearly"].includes(type)) return null;
  const result: Recurrence = { type, hour: 9, minute: 0 };
  if (type === "daily") {
    if (parts[1]) result.hour = Number(parts[1]);
    if (parts[2]) result.minute = Number(parts[2]);
  } else if (type === "weekly") {
    if (parts[1]) result.weekday = Number(parts[1]);
    if (parts[2]) result.hour = Number(parts[2]);
    if (parts[3]) result.minute = Number(parts[3]);
  } else if (type === "monthly") {
    if (parts[1]) result.monthDay = Number(parts[1]);
    if (parts[2]) result.hour = Number(parts[2]);
    if (parts[3]) result.minute = Number(parts[3]);
  } else if (type === "yearly") {
    if (parts[1]) result.month = Number(parts[1]);
    if (parts[2]) result.yearDay = Number(parts[2]);
    if (parts[3]) result.hour = Number(parts[3]);
    if (parts[4]) result.minute = Number(parts[4]);
  }
  return result;
}

/** 将循环对象序列化为标签字符串 */
export function formatRecurrence(r: Recurrence): string {
  if (r.type === "daily") return `daily:${r.hour}:${r.minute}`;
  if (r.type === "weekly") return `weekly:${r.weekday ?? 0}:${r.hour}:${r.minute}`;
  if (r.type === "monthly") return `monthly:${r.monthDay ?? 1}:${r.hour}:${r.minute}`;
  return `yearly:${r.month ?? 1}:${r.yearDay ?? 1}:${r.hour}:${r.minute}`;
}

export function toggleTodoInContent(content: string, todoLine: number): string {
  const lines = content.split("\n");
  const line = lines[todoLine];
  if (!line) return content;

  if (/\[\s\]/.test(line)) {
    // 未完成 → 完成：添加完成时间标签
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const timestamp = `${y}-${m}-${d} ${hh}:${mm}`;
    // 已勾选，追加 #done@时间戳
    lines[todoLine] = line.replace("[ ]", "[x]").replace(/#done@\S+\s+\S+/g, "") + ` #done@${timestamp}`;
  } else if (/\[[xX]\]/.test(line)) {
    // 完成 → 未完成：移除完成时间标签
    lines[todoLine] = line.replace(/\[[xX]\]/, "[ ]").replace(/#done@\S+\s+\S+/g, "");
  }

  return lines.join("\n");
}

export function generateTaskContent(
  title: string,
  priority: number,
  deadline: string,
  description: string,
  todos?: { text: string; priority: number }[],
  recurrence?: string,
  lastNotified?: string,
  isQuick?: boolean
): string {
  const prioLabels = ["必做", "重要", "一般"];
  const priorityTags = ["#必做", "#重要", "#一般"];
  const deadlineLine = deadline ? `\n- **截止日期**：${deadline}` : "\n- **截止日期**：永久";
  const recurLine = recurrence ? `\n- **循环**：${recurrence}` : "";
  const notifiedLine = lastNotified ? `\n- **上次提醒**：${lastNotified}` : "";
  const quickTag = isQuick ? "\n- **任务类型**：快速" : "";

  const hasTodos = todos && todos.length > 0;
  const todoLines = hasTodos
    ? todos.map((t) => `- [ ] ${t.text} ${priorityTags[t.priority]}`).join("\n")
    : "";

  if (isQuick) {
    return `# ${title}

- **优先级**：${prioLabels[priority]}${deadlineLine}${recurLine}${notifiedLine}${quickTag}

${hasTodos ? `## 待办

${todoLines}
` : ""}`;
  }

  return `# ${title}

- **优先级**：${prioLabels[priority]}${deadlineLine}${recurLine}${notifiedLine}

## 描述

${description || "（待补充）"}

${hasTodos ? `## 待办

${todoLines}
` : ""}`;
}

/** 一键完成所有待办：将所有 [ ] 改为 [x] 并加上时间戳 */
export function completeAllTodosInContent(content: string): string {
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
      lines[i] = `- **完成时间**：${ts}`;
      found = true;
      break;
    }
  }
  if (!found) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\*\*优先级\*\*/.test(lines[i])) {
        lines.splice(i + 1, 0, `- **完成时间**：${ts}`);
        break;
      }
    }
  }
  return lines.join("\n");
}

/** 取消任务完成状态 */
export function uncompleteTaskContent(content: string): string {
  const lines = content.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    if (/^\*\*完成时间\*\*/.test(lines[i])) {
      lines.splice(i, 1);
      break;
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    if (/\[[xX]/.test(lines[i])) {
      lines[i] = lines[i].replace(/\[[xX]/, "[ ]").replace(/#done@\S+/g, "");
    }
  }
  
  return lines.join("\n");
}

/** 为任务添加完成时间（不依赖待办项） */
export function addCompletedTimeToContent(content: string): string {
  const lines = content.split("\n");
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ts = `${y}-${mo}-${d} ${hh}:${mm}`;
  
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\*\*完成时间\*\*/.test(lines[i])) {
      lines[i] = `- **完成时间**：${ts}`;
      found = true;
      break;
    }
  }
  if (!found) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\*\*优先级\*\*/.test(lines[i])) {
        lines.splice(i + 1, 0, `- **完成时间**：${ts}`);
        break;
      }
    }
  }
  return lines.join("\n");
}

/** 在文件内容的待办列表中新增一行 */
export function addTodoToContent(content: string, text: string, priority: number): string {
  const lines = content.split("\n");
  // 找到 ## 待办 之后的位置
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## 待办/.test(lines[i])) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx === -1) {
    // 没有 ## 待办 小节，追加到末尾
    lines.push("", "## 待办", "");
    insertIdx = lines.length;
  }
  const priorityTags = ["#必做", "#重要", "#一般"];
  const newLine = `- [ ] ${text} ${priorityTags[priority]}`;
  lines.splice(insertIdx, 0, newLine);
  return lines.join("\n");
}

/** 删除文件内容中指定行的待办项 */
export function removeTodoFromContent(content: string, todoLine: number): string {
  const lines = content.split("\n");
  if (todoLine >= 0 && todoLine < lines.length) {
    lines.splice(todoLine, 1);
  }
  return lines.join("\n");
}
