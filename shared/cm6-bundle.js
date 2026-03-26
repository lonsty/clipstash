// ClipStash — CodeMirror 6 bundle entry
// Built with esbuild into a single IIFE that exposes window.CM6

import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection,
  highlightSpecialChars, placeholder,
} from '@codemirror/view';
import {
  syntaxHighlighting, indentOnInput,
  bracketMatching, foldGutter, foldKeymap,
  LanguageSupport, HighlightStyle, StreamLanguage,
} from '@codemirror/language';
import { highlightCode as lezerHighlightCode, tags } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { StyleModule } from 'style-mod';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { sql } from '@codemirror/lang-sql';
import { html as htmlLang } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { php } from '@codemirror/lang-php';
import { sass } from '@codemirror/lang-sass';

// Legacy stream parsers for languages without native CM6 support
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { r } from '@codemirror/legacy-modes/mode/r';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { csharp as csharpParser, kotlin } from '@codemirror/legacy-modes/mode/clike';

// Language registry — maps language name to CM6 LanguageSupport
const LANGUAGES = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  python: () => python(),
  java: () => java(),
  c: () => cpp(),
  cpp: () => cpp(),
  csharp: () => new LanguageSupport(StreamLanguage.define(csharpParser)),
  rust: () => rust(),
  go: () => go(),
  sql: () => sql(),
  html: () => htmlLang(),
  css: () => css(),
  json: () => json(),
  xml: () => xml(),
  markdown: () => markdown(),
  yaml: () => yaml(),
  php: () => php(),
  scss: () => sass(),
  bash: () => new LanguageSupport(StreamLanguage.define(shell)),
  shell: () => new LanguageSupport(StreamLanguage.define(shell)),
  ruby: () => new LanguageSupport(StreamLanguage.define(ruby)),
  lua: () => new LanguageSupport(StreamLanguage.define(lua)),
  r: () => new LanguageSupport(StreamLanguage.define(r)),
  swift: () => new LanguageSupport(StreamLanguage.define(swift)),
  toml: () => new LanguageSupport(StreamLanguage.define(toml)),
  diff: () => new LanguageSupport(StreamLanguage.define(diff)),
  dockerfile: () => new LanguageSupport(StreamLanguage.define(dockerFile)),
  ini: () => new LanguageSupport(StreamLanguage.define(properties)),
  kotlin: () => new LanguageSupport(StreamLanguage.define(kotlin)),
};

/**
 * getLanguageSupport returns a CM6 LanguageSupport for the given language name.
 * Returns null if the language is unknown.
 */
function getLanguageSupport(lang) {
  if (!lang) return null;
  const factory = LANGUAGES[lang.toLowerCase()];
  return factory ? factory() : null;
}

/**
 * highlightToHtml renders code to an HTML string using CM6 lezer highlighting.
 * Falls back to escaped text if no language parser is available.
 */
function highlightToHtml(code, lang) {
  const langSupport = getLanguageSupport(lang);
  if (!langSupport) return null;

  const tree = langSupport.language.parser.parse(code);
  let output = '';

  lezerHighlightCode(code, tree, getHighlightStyle(), (text, classes) => {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (classes) {
      output += `<span class="${classes}">${escaped}</span>`;
    } else {
      output += escaped;
    }
  }, () => {
    output += '\n';
  });

  return output;
}

// GitHub Light highlight style
const githubLightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#cf222e' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#24292f' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#8250df' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#0550ae' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#24292f' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#0550ae' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#cf222e' },
  { tag: [tags.meta, tags.comment], color: '#6e7781' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#0550ae', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#0550ae' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#0550ae' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#0a3069' },
  { tag: tags.invalid, color: '#82071e' },
]);

// GitHub Dark highlight style
const githubDarkStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#c9d1d9' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#d2a8ff' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#79c0ff' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#c9d1d9' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#79c0ff' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#ff7b72' },
  { tag: [tags.meta, tags.comment], color: '#8b949e' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#79c0ff', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#79c0ff' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#79c0ff' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#a5d6ff' },
  { tag: tags.invalid, color: '#f85149' },
]);

// Determine current theme from document
function isDarkMode() {
  if (typeof document === 'undefined') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

// Get the appropriate highlight style
function getHighlightStyle() {
  return isDarkMode() ? githubDarkStyle : githubLightStyle;
}

// GitHub Dark editor theme (UI chrome: background, gutters, cursor, selection)
const githubDarkTheme = EditorView.theme({
  '&': { backgroundColor: '#0d1117', color: '#c9d1d9' },
  '.cm-content': { caretColor: '#c9d1d9' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c9d1d9' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#264f78 !important' },
  '.cm-content ::selection': { backgroundColor: '#264f78' },
  '.cm-panels': { backgroundColor: '#161b22', color: '#c9d1d9' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #30363d' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #30363d' },
  '.cm-searchMatch': { backgroundColor: '#e2c08d50', outline: '1px solid #e2c08d80' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#e2c08d30' },
  '.cm-activeLine': { backgroundColor: '#161b2280' },
  '.cm-selectionMatch': { backgroundColor: '#3fb95040' },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: '#3fb95040' },
  '.cm-gutters': { backgroundColor: '#0d1117', color: '#484f58', borderRight: '1px solid #21262d' },
  '.cm-activeLineGutter': { backgroundColor: '#161b22' },
  '.cm-foldPlaceholder': { backgroundColor: '#21262d', color: '#8b949e', border: 0 },
  '.cm-tooltip': { border: '1px solid #30363d', backgroundColor: '#161b22', color: '#c9d1d9' },
  '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: '#30363d', borderBottomColor: '#30363d' },
  '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#161b22', borderBottomColor: '#161b22' },
  '.cm-tooltip-autocomplete': { '& > ul > li[aria-selected]': { backgroundColor: '#264f78', color: '#c9d1d9' } },
}, { dark: true });

// GitHub Light editor theme
const githubLightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#24292f' },
  '.cm-content': { caretColor: '#24292f' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#24292f' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#add6ff !important' },
  '.cm-content ::selection': { backgroundColor: '#add6ff' },
  '.cm-activeLine': { backgroundColor: '#f6f8fa' },
  '.cm-selectionMatch': { backgroundColor: '#add6ff80' },
  '.cm-gutters': { backgroundColor: '#ffffff', color: '#8c959f', borderRight: '1px solid #d0d7de' },
  '.cm-activeLineGutter': { backgroundColor: '#f6f8fa' },
}, { dark: false });

// Light theme (default)
const lightTheme = githubLightTheme;

// Inject BOTH highlight theme CSS into the document for static HTML rendering.
// Both light and dark styles use unique class names, so no conflict.
// This ensures highlightToHtml output always has matching CSS rules,
// regardless of which theme is currently active.
(function injectHighlightCSS() {
  if (typeof document === 'undefined') return;
  try {
    if (githubLightStyle.module) StyleModule.mount(document, githubLightStyle.module);
    if (githubDarkStyle.module) StyleModule.mount(document, githubDarkStyle.module);
  } catch {
    // Fallback
  }
})();

// Export everything as window.CM6
window.CM6 = {
  EditorState,
  EditorView,
  Compartment,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
  placeholder,
  githubLightStyle,
  githubDarkStyle,
  getHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  searchKeymap,
  highlightSelectionMatches,
  closeBrackets,
  closeBracketsKeymap,
  githubDarkTheme,
  githubLightTheme,
  lightTheme,
  getLanguageSupport,
  highlightToHtml,
  LANGUAGES,
};
