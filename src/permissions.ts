import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Selector, type SelectorItem } from "./components/selector";

export type PermissionChoice = "abort" | "session" | "project" | "global";
export type FilesystemAccess = "read" | "write";

const permissionChoices: SelectorItem<PermissionChoice>[] = [
  {
    value: "abort",
    label: "Abort (keep blocked)",
  },
  {
    value: "session",
    label: "Allow for this session only",
  },
  {
    value: "project",
    label: "Allow for this project",
  },
  {
    value: "global",
    label: "Allow for all projects",
  },
];

export async function promptRequestPermission(
  ctx: ExtensionContext,
  access: FilesystemAccess,
  path: string,
): Promise<PermissionChoice> {
  if (!ctx.hasUI) return "abort";

  const accessLabel = access === "read" ? "Read" : "Write";
  const result = await ctx.ui.custom<PermissionChoice>((tui, theme, _kb, done) => {
    const selector = new Selector(theme, {
      title: `${accessLabel} file`,
      description: `${accessLabel} access requested for: ${path}`,
      question: "Grant this permission?",
      items: permissionChoices,
      footer: "↑↓ navigate • enter select • esc cancel",
      onSelect: done,
      onCancel: () => done("abort"),
    });

    return {
      render: (w) => selector.render(w),
      handleInput: (data) => {
        selector.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => selector.invalidate(),
    };
  });

  return result ?? "abort";
}
