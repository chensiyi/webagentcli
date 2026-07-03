<script lang="ts">
  import { untrack } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { json } from '@codemirror/lang-json';
  import { Decoration, WidgetType } from '@codemirror/view';

  interface Props {
    value: string;
    placeholder?: string;
    language?: 'javascript' | 'json';
    rows?: number;
    readonly?: boolean;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    language = 'javascript',
    rows = 10,
    readonly = false,
    onchange,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let editorView: EditorView | null = null;
  let isInternalChange = false;

  // Line height ~20px per row + padding
  const editorHeight = $derived(`${rows * 20 + 12}px`);

  class PlaceholderWidget extends WidgetType {
    text: string;
    constructor(text: string) { super(); this.text = text; }
    toDOM(): HTMLElement {
      const span = document.createElement('span');
      span.textContent = this.text;
      span.className = 'cm-placeholder';
      return span;
    }
    ignoreEvent(): boolean { return true; }
  }

  function getLanguageExtension() {
    return language === 'json' ? json() : javascript();
  }

  function createState(doc: string): EditorState {
    const extensions: any[] = [
      basicSetup,
      getLanguageExtension(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isInternalChange) {
          value = update.state.doc.toString();
          onchange?.(value);
        }
      }),
      EditorState.tabSize.of(2),
    ];
    if (readonly) {
      extensions.push(EditorView.editable.of(false));
    }
    if (placeholder) {
      extensions.push(
        EditorView.decorations.of((view) => {
          if (view.state.doc.length > 0) return Decoration.none;
          const w = Decoration.widget({
            widget: new PlaceholderWidget(placeholder),
            side: 1,
          });
          return Decoration.set([w.range(0)]);
        })
      );
    }
    return EditorState.create({ doc, extensions });
  }

  // 创建/重建编辑器 — 仅追踪 containerEl、language、readonly、placeholder
  // 使用 untrack 读取 value，避免每次按键都销毁重建编辑器
  $effect(() => {
    if (!containerEl) return;
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
    const currentValue = untrack(() => value);
    editorView = new EditorView({
      state: createState(currentValue),
      parent: containerEl,
    });
    return () => {
      editorView?.destroy();
      editorView = null;
    };
  });

  // 同步外部 value 变更 → 编辑器（仅追踪 value）
  $effect(() => {
    if (!editorView) return;
    const currentDoc = editorView.state.doc.toString();
    if (currentDoc !== value) {
      isInternalChange = true;
      editorView.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
      isInternalChange = false;
    }
  });
</script>

<div class="cm-container" bind:this={containerEl} style="height: {editorHeight}"></div>

<style>
  /* Override CM6 defaults → our design system */
  .cm-container :global(.cm-editor) {
    height: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: var(--color-bg);
    color: var(--color-text);
  }

  .cm-container :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .cm-container :global(.cm-scroller) {
    overflow: auto;
    font-family: var(--font-mono);
  }

  .cm-container :global(.cm-content) {
    font-family: var(--font-mono);
    caret-color: var(--color-text);
    padding: 4px 0;
  }

  .cm-container :global(.cm-gutters) {
    background: var(--color-bg-secondary, rgba(0, 0, 0, 0.04));
    color: var(--color-text-hint);
    border-right: 1px solid var(--color-border-light, var(--color-border-medium));
    font-family: var(--font-mono);
    min-width: 28px;
  }

  .cm-container :global(.cm-activeLineGutter) {
    background: var(--color-bg-secondary, rgba(0, 0, 0, 0.06));
    color: var(--color-text);
  }

  .cm-container :global(.cm-activeLine) {
    background: var(--color-bg-secondary, rgba(0, 0, 0, 0.04));
  }

  .cm-container :global(.cm-selectionBackground) {
    background: rgba(0, 100, 200, 0.25) !important;
  }

  .cm-container :global(.cm-cursor) {
    border-left-color: var(--color-text);
  }

  .cm-container :global(.cm-matchingBracket) {
    background: rgba(0, 100, 200, 0.25);
    color: var(--color-text) !important;
  }

  .cm-container :global(.cm-placeholder) {
    color: var(--color-text-hint);
    font-family: var(--font-mono);
    pointer-events: none;
  }

  /* Readonly */
  .cm-container :global(.cm-editor.cm-readonly) {
    background: var(--color-bg-secondary, rgba(0, 0, 0, 0.04));
  }

  .cm-container :global(.cm-editor.cm-readonly .cm-cursor) {
    display: none;
  }

  /* Fold gutter */
  .cm-container :global(.cm-foldGutter) {
    width: 16px;
  }

  .cm-container :global(.cm-foldGutter span) {
    color: var(--color-text-hint);
    font-size: 12px;
  }
</style>
