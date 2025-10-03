export type MonacoEditorSettings = {
  fontSize?: number;
  wordWrap?: "off" | "on";
  minimap?: boolean;
  lineNumbers?: "off" | "on";
};

export const DEFAULT_CODE_EDITOR_SETTINGS: Required<MonacoEditorSettings> = {
  fontSize: 14,
  wordWrap: "on",
  minimap: false,
  lineNumbers: "on",
};

export const DEFAULT_MARKDOWN_EDITOR_SETTINGS: Required<MonacoEditorSettings> =
  {
    fontSize: 14,
    wordWrap: "on",
    minimap: false,
    lineNumbers: "off",
  };

export type TerminalPreferences = {
  fontSize?: number;
  cursorBlink?: boolean;
  cursorStyle?: "block" | "underline" | "bar";
};

export const DEFAULT_TERMINAL_PREFERENCES: Required<TerminalPreferences> = {
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: "block",
};
