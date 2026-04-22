const markdownFixturePath = "test/fixtures/test.md";
const markdownEditorTitle = "test.md";
const previewCommandTitle = "RPF Markdown: Open Preview";
const previewCommandId = "rpf-markdown-preview.openPreview";
const previewTabTitle = "RPF Markdown Preview - test/fixtures/test.md";

async function openFixtureMarkdown(browser: WebdriverIO.Browser) {
  return browser.executeWorkbench(async (vscode, relativePath: string) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder is open in the test window.");
    }

    const documentUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    const document = await vscode.workspace.openTextDocument(documentUri);
    await vscode.window.showTextDocument(document);

    return {
      fileName: document.fileName,
      languageId: document.languageId,
    };
  }, markdownFixturePath);
}

async function getExtensionState(browser: WebdriverIO.Browser) {
  return browser.executeWorkbench(
    async (vscode, extensionName: string, commandId: string) => {
      const extension = vscode.extensions.all.find(
        (item: {
          id: string;
          isActive: boolean;
          packageJSON?: { name?: string };
          activate: () => Promise<unknown>;
        }) => item.packageJSON?.name === extensionName,
      );

      if (!extension) {
        return {
          found: false,
          isActive: false,
          hasPreviewCommand: false,
        };
      }

      await extension.activate();
      const commands = await vscode.commands.getCommands(true);

      return {
        found: true,
        isActive: extension.isActive,
        hasPreviewCommand: commands.includes(commandId),
      };
    },
    "rpf-markdown-preview",
    previewCommandId,
  );
}

async function getOpenTabLabels(browser: WebdriverIO.Browser) {
  return browser.executeWorkbench(async (vscode) => {
    return vscode.window.tabGroups.all.flatMap(
      (group: { tabs: Array<{ label: string }> }) =>
        group.tabs.map((tab: { label: string }) => tab.label),
    );
  });
}

async function findPreviewButton(editorView: {
  getActions: () => Promise<WebdriverIO.ElementArray>;
  getAction: (title: string) => Promise<WebdriverIO.Element | undefined>;
}) {
  const exactMatch = await editorView.getAction(previewCommandTitle);
  if (exactMatch) {
    return exactMatch;
  }

  const actions = await editorView.getActions();

  for (const action of actions) {
    const parent = await action.$("..");
    const candidates = [
      await action.getAttribute("title"),
      await action.getAttribute("aria-label"),
      await action.getText(),
      await parent.getAttribute("title"),
      await parent.getAttribute("aria-label"),
    ].filter((value): value is string => Boolean(value));

    if (candidates.some((value) => value.includes("RPF Markdown"))) {
      return action;
    }
  }

  return undefined;
}

async function setupMarkdownPreviewTest() {
  const { browser, expect } = await import("@wdio/globals");
  const workbench = await browser.getWorkbench();
  const editorView = workbench.getEditorView();

  await editorView.closeAllEditors();

  const openedDocument = await openFixtureMarkdown(browser);
  expect(openedDocument.languageId).toBe("markdown");

  const extensionState = await getExtensionState(browser);
  expect(extensionState.found).toBe(true);
  expect(extensionState.isActive).toBe(true);
  expect(extensionState.hasPreviewCommand).toBe(true);

  await editorView.openEditor(markdownEditorTitle);

  const previewButton = await findPreviewButton(editorView);
  expect(previewButton).toBeDefined();
  await expect(previewButton!).toBeDisplayed();
  expect(await editorView.getOpenEditorTitles()).toContain(markdownEditorTitle);
  expect(openedDocument.fileName).toContain(markdownFixturePath);

  return {
    browser,
    expect,
    editorView,
    openedDocument,
    previewButton: previewButton!,
    workbench,
  };
}

describe("VS Code Extension Testing", () => {
  it("should be able to load VSCode", async () => {
    const { browser, expect } = await import("@wdio/globals");
    const workbench = await browser.getWorkbench();
    expect(await workbench.getTitleBar().getTitle()).toContain(
      "[Extension Development Host]",
    );
  });

  it("should be able to load a markdown with the button visible", async () => {
    await setupMarkdownPreviewTest();
  });

  it("should open the preview webview after clicking the button", async () => {
    const { browser, expect, previewButton } = await setupMarkdownPreviewTest();

    await previewButton.moveTo();
    await previewButton.waitForClickable();
    await previewButton.click();

    await browser.waitUntil(async () => {
      const openTabLabels = await getOpenTabLabels(browser);
      return openTabLabels.includes(previewTabTitle);
    });

    expect(await getOpenTabLabels(browser)).toContain(previewTabTitle);
  });
});
