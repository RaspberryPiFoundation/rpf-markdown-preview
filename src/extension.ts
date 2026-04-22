import * as vscode from "vscode";

type ProcessEditorProject = (source: string) => string | Promise<string>;

const PREVIEW_RENDER_DEBOUNCE_MS = 150;

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    "rpf-markdown-preview.openPreview",
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

//creates the webview preview panel which will display the html content
//also sets up the URIs for script and style resources needed for things like PrismJS
function createPreviewPanel(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "rpfMarkdownPreview",
    "RPF Markdown Preview - " +
      vscode.workspace.asRelativePath(document.fileName),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    },
  );

  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "preview.js"),
  );

  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "preview.css"),
  );

  panel.webview.html = getWebviewHtml(panel.webview, scriptUri, styleUri);

  return panel;
}

//creates the function that will render the preview content in the webview
//includes importing the processEditorProject function from the rpf-markdown-core package and
// using it to convert the markdown content to HTML, which is then sent to the webview for rendering
function createPreviewRenderer(
  panel: vscode.WebviewPanel,
): (document: vscode.TextDocument) => Promise<void> {
  let renderRequestId = 0;
  let processEditorProjectLoader: Promise<ProcessEditorProject> | undefined;

  const loadProcessEditorProject = (): Promise<ProcessEditorProject> => {
    if (!processEditorProjectLoader) {
      processEditorProjectLoader =
        import("@raspberrypifoundation/rpf-markdown-core").then(
          ({ processEditorProject }) => processEditorProject,
        );
    }
    return processEditorProjectLoader;
  };

  return async (document: vscode.TextDocument): Promise<void> => {
    const requestId = ++renderRequestId;

    try {
      const processEditorProject = await loadProcessEditorProject();
      const html = await processEditorProject(document.getText());

      if (requestId !== renderRequestId) {
        return;
      }

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

//binds the preview to the specific document for which the preview command is called
//keeps the preview up to date when there are changes in the document content
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

function getWebviewHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
): string {
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
