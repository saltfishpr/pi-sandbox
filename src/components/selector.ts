import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Spacer, Text, parseKey, type SelectItem } from "@earendil-works/pi-tui";

export interface SelectorItem<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectorOptions<T extends string> {
  title: string;
  description?: string;
  question?: string;
  items: SelectorItem<T>[];
  footer?: string;
  showIndex?: boolean;
  onSelect: (value: T) => void;
  onCancel: () => void;
}

export class Selector<T extends string> extends Container {
  private readonly items: SelectorItem<T>[];
  private readonly showIndex: boolean;
  private readonly selectList: SelectList;

  constructor(theme: Theme, options: SelectorOptions<T>) {
    super();

    this.items = options.items;
    this.showIndex = options.showIndex ?? true;

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", theme.bold(options.title)), 0, 0));

    if (options.description) {
      this.addChild(new Spacer(1));
      this.addChild(new Text(theme.fg("dim", options.description), 0, 0));
    }

    if (options.question) {
      this.addChild(new Spacer(1));
      this.addChild(new Text(options.question, 0, 0));
    }

    this.selectList = new SelectList(
      options.items.map<SelectItem>((item, index) => ({
        value: item.value,
        label: this.formatLabel(index, item.label),
        description: item.description,
      })),
      options.items.length,
      {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("dim", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("accent", text),
      },
    );

    this.selectList.onSelect = (item) => options.onSelect(item.value as T);
    this.selectList.onCancel = options.onCancel;

    this.addChild(this.selectList);
    if (options.footer) {
      this.addChild(new Spacer(1));
      this.addChild(new Text(theme.fg("dim", options.footer), 1, 0));
    }
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  }

  handleInput(data: string): void {
    const shortcut = this.getShortcut(data);
    if (shortcut !== undefined) {
      this.selectList.setSelectedIndex(shortcut);
      return;
    }
    this.selectList.handleInput(data);
  }

  private formatLabel(index: number, label: string): string {
    if (!this.showIndex) return label;

    const width = String(this.items.length).length;
    return `${String(index + 1).padStart(width, " ")}. ${label}`;
  }

  private getShortcut(data: string): number | undefined {
    if (!this.showIndex) return undefined;

    const key = parseKey(data);
    if (!key || key < "1" || key > "9") return undefined;

    const index = Number.parseInt(key, 10) - 1;
    if (index >= this.items.length) return undefined;

    return index;
  }
}
