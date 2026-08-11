# Agent Instructions

## Project Stack

- **Language:** TypeScript
- **Framework:** VS Code Extension API
- **Core Library:** `@raspberrypifoundation/rpf-markdown-core` (private npm package)
- **Build Tools:** Yarn (corepack), esbuild/webpack
- **Testing:** WebdriverIO, Mocha
- **Styling:** SCSS
- **Runtime:** Node.js (extension host) + Browser (webview)

## Architecture

The extension consists of two main components:

1. **Extension Host** (`src/extension.ts`)
   - Registers the "RPF Markdown: Open Preview" command
   - Manages webview panel lifecycle
   - Syncs document changes to preview in real-time
   - Debounces renders to avoid excessive updates (150ms)

2. **Webview Component** (`src/webview/preview.ts`)
   - Renders markdown preview using rpf-markdown-core
   - Handles live updates from extension host
   - Supports editor projects rendering

### Styling Pipeline

**SCSS → CSS Build Process:**

- Source SCSS files: `src/webview/styles/` (e.g., `editor-projects.scss`)
- Compilation: During `yarn compile:webview`, esbuild processes SCSS files
- Output: Generated CSS written to `media/preview.css`
- Runtime: The webview loads the compiled CSS at runtime; no runtime SCSS processing occurs
- PrismJS Integration: Import styles for syntax highlighting are included in `preview.ts` and bundled into the final CSS

### Communication Flow

**Extension Host ↔ Webview:**

1. **Document Change Detection:** Extension host listens to `onDidChangeTextDocument` events
2. **Debounced Render:** Changes trigger a debounced render (150ms) to prevent excessive updates
3. **Message Passing:** Extension sends rendered HTML to webview via `webview.postMessage()`
4. **Live Preview:** Webview receives message and updates the DOM with new content
5. **State Sync:** On panel focus or document switch, extension re-renders to ensure preview reflects current state

The extension dynamically imports `processEditorProject` from rpf-markdown-core to render specialized markdown content.

## Project Structure

```
rpf-markdown-preview/
├── src/
│   ├── extension.ts                    # Extension activation and main logic
│   ├── test/
│   │   └── extension.test.ts          # Unit tests for extension
│   └── webview/
│       ├── preview.ts                 # Webview rendering logic
│       ├── types.d.ts                 # TypeScript type definitions
│       └── styles/
│           └── editor-projects.scss   # SCSS styles for webview
├── media/
│   ├── preview.css                    # Compiled CSS (generated)
│   └── preview.js                     # Compiled webview JS (generated)
├── scripts/
│   └── build-webview.mjs              # Esbuild configuration for webview
├── test/
│   ├── specs/
│   │   └── e2e.test.ts               # WebdriverIO end-to-end tests
│   └── fixtures/
│       └── test.md                    # Test markdown files
├── package.json                       # Project manifest and scripts
├── tsconfig.json                      # TypeScript configuration (general)
├── tsconfig.extension.json            # TypeScript configuration (extension only)
├── wdio.conf.ts                       # WebdriverIO test configuration
├── CHANGELOG.md                       # Version history
├── README.md                          # User documentation
└── LICENSE                            # MIT license
```

**Key Generated Files:** `media/preview.css` and `media/preview.js` are generated during the build process and should not be edited directly.

## Commands

- `yarn compile` - Compiles both extension (TypeScript) and webview (esbuild) for testing or packaging
- `yarn wdio` - Runs WebdriverIO end-to-end tests

## General Guidance

- **Setup:** Requires GitHub token in `.env` file with repo and write:packages permissions to install rpf-markdown-core
- **Development:** Use `yarn watch` during development to keep builds current
- **Testing:** Run `yarn wdio` before submitting changes; test fixtures are in `test/fixtures/`
- **Versioning:** Increment version in `package.json` when preparing releases
- **Release:** Create a git tag matching the version number; GitHub Actions will build the `.vsix` file
- **Type Safety:** Keep type definitions in `src/webview/types.d.ts` up to date
- **Performance:** Render debouncing prevents excessive preview updates; monitor performance with large markdown files
- **Documenting:** Keep any documentation files up to date as changes are being made.
