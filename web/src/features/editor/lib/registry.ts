/** Lets toolbars trigger actions on the editor of a given tab. */
export interface EditorCommands {
  run(): void;
  runScript(): void;
  focus(): void;
}

export const editorRegistry = new Map<string, EditorCommands>();
