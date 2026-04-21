import * as vscode from "vscode";

type ProcessEditorProject = (source: string) => string | Promise<string>;

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    "rpf-markdown-preview.openPreview",
    () => {
      openPreviewForActiveEditor(context);
    },
  );

  context.subscriptions.push(command);
}

export function deactivate() {}

function openPreviewForActiveEditor(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage("Open a document first.");
    return;
  }

  const panel = createPreviewPanel(context);
  const render = createPreviewRenderer(panel);

  void render(editor.document);
  bindDocumentSync(panel, editor.document.uri, render);
}

//creates the webview preview panel which will display the html content
//also sets up the URIs for script and style resources needed for things like PrismJS
function createPreviewPanel(
  context: vscode.ExtensionContext,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "rpfMarkdownPreview",
    "RPF Markdown Preview - " +
      vscode.workspace.asRelativePath(
        vscode.window.activeTextEditor!.document.fileName,
      ),
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
  const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== documentUri.toString()) {
      return;
    }

    void render(event.document);
  });

  panel.onDidDispose(() => {
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
