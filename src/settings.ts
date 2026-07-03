import { App, PluginSettingTab, Setting } from "obsidian";
import type InboxTrackerPlugin from "./main";

export interface InboxTrackerSettings {
  inboxFolder: string;
  archiveFolder: string;
  urgentDays: number;
  showCompletedTodos: boolean;
}

export const DEFAULT_SETTINGS: InboxTrackerSettings = {
  inboxFolder: "00-Inbox",
  archiveFolder: "已归档",
  urgentDays: 3,
  showCompletedTodos: true,
};

export class InboxTrackerSettingTab extends PluginSettingTab {
  plugin: InboxTrackerPlugin;

  constructor(app: App, plugin: InboxTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Inbox 目录")
      .setDesc("存放待办文件的目录路径（相对于 Vault 根目录）")
      .addText((text) =>
        text
          .setPlaceholder("00-Inbox")
          .setValue(this.plugin.settings.inboxFolder)
          .onChange(async (value) => {
            this.plugin.settings.inboxFolder = value.trim() || DEFAULT_SETTINGS.inboxFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("归档目录名")
      .setDesc("归档任务时的子目录名称，位于 Inbox 目录下")
      .addText((text) =>
        text
          .setPlaceholder("已归档")
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("紧急天数阈值")
      .setDesc("截止日期在多少天内标记为紧急（橙色提醒）")
      .addSlider((slider) =>
        slider
          .setLimits(1, 14, 1)
          .setValue(this.plugin.settings.urgentDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.urgentDays = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("显示已完成待办")
      .setDesc("在卡片中是否显示已勾选的待办项")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCompletedTodos)
          .onChange(async (value) => {
            this.plugin.settings.showCompletedTodos = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
