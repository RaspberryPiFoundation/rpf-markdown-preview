import * as vscode from "vscode";

type ProcessEditorProject = (source: string) => string | Promise<string>;

const OPEN_PREVIEW_COMMAND = "rpf-markdown-preview.openPreview";
const PREVIEW_PANEL_VIEW_TYPE = "rpfMarkdownPreview";
const PREVIEW_RENDER_DEBOUNCE_MS = 150;

let processEditorProjectLoader: Promise<ProcessEditorProject> | undefined;

function loadProcessEditorProject(): Promise<ProcessEditorProject> {
  if (!processEditorProjectLoader) {
    processEditorProjectLoader =
      import("@raspberrypifoundation/rpf-markdown-core").then(
        ({ processEditorProject }) => processEditorProject,
      );
  }

  return processEditorProjectLoader;
}

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    OPEN_PREVIEW_COMMAND,
    (resource?: vscode.Uri) => {
      void openPreview(context, resource);
    },
  );

  context.subscriptions.push(command);
}

export function deactivate() {}

async function openPreview(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<void> {
  const document = await resolvePreviewDocument(resource);
  if (!document) {
    return;
  }

  const panel = createPreviewPanel(context, document);
  const render = createPreviewRenderer(panel);

  bindDocumentSync(panel, document.uri, render);
  await render(document);
}

async function resolvePreviewDocument(
  resource?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  if (resource) {
    try {
      return await vscode.workspace.openTextDocument(resource);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `Failed to open document: ${message}`,
      );
      return undefined;
    }
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage("Open a document first.");
    return undefined;
  }

  return editor.document;
}

// Creates the webview panel and wires in the preview script and stylesheet.
function createPreviewPanel(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    PREVIEW_PANEL_VIEW_TYPE,
    "RPF Markdown Preview - " +
      vscode.workspace.asRelativePath(document.fileName),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: resolveLocalResourceRoots(context, document),
    },
  );

  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "preview.js"),
  );

  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "preview.css"),
  );

  panel.webview.html = getWebviewHtml(scriptUri, styleUri);

  return panel;
}

// Builds the set of directories the webview is allowed to load files from:
// the bundled media assets plus the document's directory and its workspace
// folder, so images referenced relative to the markdown file can load.
function resolveLocalResourceRoots(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(context.extensionUri, "media")];

  if (document.uri.scheme === "file") {
    roots.push(vscode.Uri.joinPath(document.uri, ".."));

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      roots.push(workspaceFolder.uri);
    }
  }

  return roots;
}

// Matches <img> and <source> opening tags. Rewriting is restricted to these
// tags so that relative src attributes on other tags (e.g. <iframe>, <video>,
// <embed>) are never turned into loadable webview URIs, which would let a
// markdown file pull in arbitrary local HTML/JS documents.
const RESOURCE_TAG_PATTERN = /<(?:img|source)\b[^>]*>/gi;

// Matches a single src="..." / src='...' attribute within a tag.
const SRC_ATTRIBUTE_PATTERN = /\bsrc=("|')(.*?)\1/i;

// Rewrites relative image resource URLs in the rendered HTML to webview URIs
// resolved against the markdown document's location. Only <img> and <source>
// tags are rewritten; absolute URLs (http(s):, data:, etc.) are left untouched.
function rewriteResourceUris(
  html: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
): string {
  if (documentUri.scheme !== "file") {
    return html;
  }

  const documentDir = vscode.Uri.joinPath(documentUri, "..");

  return html.replace(RESOURCE_TAG_PATTERN, (tag: string) =>
    tag.replace(
      SRC_ATTRIBUTE_PATTERN,
      (match, quote: string, value: string) => {
        const trimmed = value.trim();

        if (!trimmed || isAbsoluteResourceUrl(trimmed)) {
          return match;
        }

        const rewritten = resolveRelativeResource(
          documentDir,
          trimmed,
          webview,
        );

        return `src=${quote}${rewritten}${quote}`;
      },
    ),
  );
}

function isAbsoluteResourceUrl(value: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.startsWith("//") ||
    value.startsWith("#")
  );
}

// Resolves a relative path (possibly with ./ or ../ segments) against the
// document directory and returns the corresponding webview URI string. Any
// query string or fragment on the original value (e.g. sprite.svg#icon) is
// preserved by re-attaching it to the resolved webview URI.
function resolveRelativeResource(
  documentDir: vscode.Uri,
  relativePath: string,
  webview: vscode.Webview,
): string {
  const suffixMatch = /[?#].*$/.exec(relativePath);
  const suffix = suffixMatch ? suffixMatch[0] : "";
  const pathPart = suffix
    ? relativePath.slice(0, suffixMatch!.index)
    : relativePath;
  const segments = pathPart.split("/").filter((segment) => segment.length > 0);

  const resolved = vscode.Uri.joinPath(documentDir, ...segments);

  return `${webview.asWebviewUri(resolved).toString()}${suffix}`;
}

// Renders markdown into HTML and ignores stale async results.
function createPreviewRenderer(
  panel: vscode.WebviewPanel,
): (document: vscode.TextDocument) => Promise<void> {
  let renderRequestId = 0;

  return async (document: vscode.TextDocument): Promise<void> => {
    const requestId = ++renderRequestId;

    try {
      const processEditorProject = await loadProcessEditorProject();
      const rawHtml = await processEditorProject(document.getText());

      if (requestId !== renderRequestId) {
        return;
      }

      const html = rewriteResourceUris(rawHtml, panel.webview, document.uri);

      void panel.webview.postMessage({
        type: "render",
        html,
      });
    } catch (error) {
      if (requestId !== renderRequestId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Preview render failed: ${message}`);
    }
  };
}

// Keeps the preview synced with one document and debounces rapid edits.
function bindDocumentSync(
  panel: vscode.WebviewPanel,
  documentUri: vscode.Uri,
  render: (document: vscode.TextDocument) => Promise<void>,
): void {
  const documentUriString = documentUri.toString();
  let pendingDocument: vscode.TextDocument | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== documentUriString) {
      return;
    }

    pendingDocument = event.document;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const documentToRender = pendingDocument;
      pendingDocument = undefined;
      debounceTimer = undefined;

      if (!documentToRender) {
        return;
      }

      void render(documentToRender);
    }, PREVIEW_RENDER_DEBOUNCE_MS);
  });

  panel.onDidDispose(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    changeSub.dispose();
  });
}

function getWebviewHtml(scriptUri: vscode.Uri, styleUri: vscode.Uri): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}">
  <title>Preview</title>
</head>
<body>
  <div id="app"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
