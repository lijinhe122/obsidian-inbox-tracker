export interface InboxTask {
  filePath: string;
  title: string;
  priority: number;             // 0=必做, 1=重要, 2=一般
  deadline: string | null;
  deadlineDate: Date | null;
  description: string;
  todos: TodoItem[];
  daysRemaining: number | null;
  hoursRemaining: number | null;
  completedAt: string | null;
  recurrence: Recurrence | null; // 循环任务
  lastNotified: string | null;   // 上次提醒日期 YYYY-MM-DD
  taskType: "quick" | "full";    // 快速任务 vs 完整任务
}

export interface TodoItem {
  text: string;
  completed: boolean;
  line: number;
  priority: number;
  completedAt: string | null;
}

export interface Recurrence {
  type: "daily" | "weekly" | "monthly" | "yearly";
  hour: number;     // 提醒时间-时 (0-23)
  minute: number;   // 提醒时间-分 (0-59)
  weekday?: number;  // weekly: 0=日,1=一...6=六
  monthDay?: number; // monthly: 1-28
  month?: number;    // yearly: 1-12
  yearDay?: number;  // yearly: 1-31
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: "必做",
  1: "重要",
  2: "一般",
};

export const RECUR_LABELS: Record<string, string> = {
  none: "不循环",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年",
};
