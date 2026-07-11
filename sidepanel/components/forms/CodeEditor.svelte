<script lang="ts">
  import { untrack } from 'svelte';

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

  let containerEl = $state<HTMLDivElement>();
  let editorView = $state<any>(null);
  let isInternalChange = false;
  let isLoaded = $state(false);
  let loadError = $state<string | null>(null);

  const editorHeight = $derived(`${rows * 20 + 12}px`);
  const label = placeholder || 'code editor';

  // 动态加载 CodeMirror（懒加载，按需拆分 chunk）
  $effect(() => {
    if (!containerEl || isLoaded) return;
    isLoaded = true;

    (async () => {
      try {
        const [
          { EditorView, basicSetup },
          { EditorState },
          { javascript },
          { json },
          { Decoration, WidgetType },
        ] = await Promise.all([
          import('codemirror'),
          import('@codemirror/state'),
          import('@codemirror/lang-javascript'),
          import('@codemirror/lang-json'),
          import('@codemirror/view'),
        ]);

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

        function getLangExt() {
          return language === 'json' ? json() : javascript();
        }

        const exts: any[] = [
          basicSetup,
          getLangExt(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isInternalChange) {
              value = update.state.doc.toString();
              onchange?.(value);
            }
          }),
          EditorState.tabSize.of(2),
        ];
        if (readonly) {
          exts.push(EditorView.editable.of(false));
        }
        if (placeholder) {
          exts.push(
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

        const currentValue = untrack(() => value);
        editorView = new EditorView({
          state: EditorState.create({ doc: currentValue, extensions: exts }),
          parent: containerEl,
        });
      } catch (e: any) {
        loadError = e.message || 'Failed to load editor';
      }
    })();

    return () => {
      editorView?.destroy();
      editorView = null;
    };
  });

  // 同步外部 value 变更 → 编辑器
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

{#if loadError}
  <textarea class="textarea-fallback" bind:value placeholder={label} style="height: {editorHeight}"></textarea>
{:else}
  <div class="cm-container" bind:this={containerEl} style="height: {editorHeight}"></div>
{/if}

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

  .textarea-fallback {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border-medium);
    border-radius: 4px;
    padding: 4px 8px;
    resize: vertical;
  }
</style>