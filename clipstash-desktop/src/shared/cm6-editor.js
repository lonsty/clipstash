// ClipStash — CM6 Editor helper
// Creates / destroys CodeMirror 6 EditorView instances for edit mode.
// Lazy-loads CM6 bundle on first use.

import { ensureCM6 } from './cm6-loader.js';

/**
 * createCM6Editor mounts a CM6 editor inside the given container.
 * Returns a Promise that resolves once the editor is ready.
 * @param {HTMLElement} container - DOM element to mount into
 * @param {Object} options
 * @param {string} options.content - initial text content
 * @param {string} [options.language] - language name
 * @param {boolean} [options.dark] - whether dark theme is active
 * @param {Function} [options.onChange] - callback(content) on content change
 * @returns {Promise<{ view: EditorView, destroy: Function, getContent: Function }>}
 */
export async function createCM6Editor(container, { content = '', language = '', dark = false, onChange = null } = {}) {
  const CM6 = await ensureCM6();
  if (!CM6) throw new Error('CM6 bundle failed to load');

  const themeCompartment = new CM6.Compartment();
  const langCompartment = new CM6.Compartment();

  const langSupport = language ? CM6.getLanguageSupport(language) : null;

  const extensions = [
    CM6.lineNumbers(),
    CM6.highlightActiveLineGutter(),
    CM6.highlightSpecialChars(),
    CM6.history(),
    CM6.foldGutter(),
    CM6.drawSelection(),
    CM6.indentOnInput(),
    CM6.bracketMatching(),
    CM6.closeBrackets(),
    CM6.highlightActiveLine(),
    CM6.highlightSelectionMatches(),
    CM6.keymap.of([
      ...CM6.closeBracketsKeymap,
      ...CM6.defaultKeymap,
      ...CM6.searchKeymap,
      ...CM6.historyKeymap,
      ...CM6.foldKeymap,
      CM6.indentWithTab,
    ]),
    themeCompartment.of(dark
      ? [CM6.githubDarkTheme, CM6.syntaxHighlighting(CM6.githubDarkStyle, { fallback: true })]
      : [CM6.githubLightTheme, CM6.syntaxHighlighting(CM6.githubLightStyle, { fallback: true })]
    ),
    langCompartment.of(langSupport ? [langSupport] : []),
    CM6.EditorView.lineWrapping,
  ];

  if (onChange) {
    extensions.push(CM6.EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }));
  }

  const state = CM6.EditorState.create({ doc: content, extensions });
  const view = new CM6.EditorView({ state, parent: container });

  return {
    view,
    getContent() {
      return view.state.doc.toString();
    },
    setLanguage(lang) {
      const support = lang ? CM6.getLanguageSupport(lang) : null;
      view.dispatch({
        effects: langCompartment.reconfigure(support ? [support] : []),
      });
    },
    setTheme(isDark) {
      view.dispatch({
        effects: themeCompartment.reconfigure(isDark
          ? [CM6.githubDarkTheme, CM6.syntaxHighlighting(CM6.githubDarkStyle, { fallback: true })]
          : [CM6.githubLightTheme, CM6.syntaxHighlighting(CM6.githubLightStyle, { fallback: true })]
        ),
      });
    },
    destroy() {
      view.destroy();
    },
  };
}
