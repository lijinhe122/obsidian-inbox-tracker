import { Plugin } from "obsidian";
import { InboxView, VIEW_TYPE_INBOX } from "./view";
import { InboxTrackerSettings, DEFAULT_SETTINGS, InboxTrackerSettingTab } from "./settings";

export default class InboxTrackerPlugin extends Plugin {
  settings: InboxTrackerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_INBOX, (leaf) => new InboxView(leaf, this));

    this.addRibbonIcon("inbox", "Inbox Tracker", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-inbox-tracker",
      name: "Open Inbox Tracker",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new InboxTrackerSettingTab(this.app, this));
  }

  async activateView(): Promise<void> {
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

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // 刷新已打开的面板
    this.app.workspace.getLeavesOfType(VIEW_TYPE_INBOX).forEach((leaf) => {
      if (leaf.view instanceof InboxView) {
        (leaf.view as InboxView).refresh();
      }
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_INBOX);
  }
}
