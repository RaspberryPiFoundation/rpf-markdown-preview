import { setupBrowser } from "@testing-library/webdriverio";

const markdownFixturePath = "test/fixtures/test.md";
const markdownEditorTitle = "test.md";
const previewCommandTitle = "RPF Markdown: Open Preview";
const previewTabTitle = "RPF Markdown Preview - test/fixtures/test.md";

type TestingLibraryBrowser = Parameters<typeof setupBrowser>[0];

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

async function findPreviewButton(browser: WebdriverIO.Browser) {
  const screen = setupBrowser(browser as unknown as TestingLibraryBrowser);

  return screen.findByRole("button", { name: previewCommandTitle });
}

async function setupMarkdownPreviewTest() {
  const { browser, expect } = await import("@wdio/globals");
  const workbench = await browser.getWorkbench();
  const editorView = workbench.getEditorView();

  await editorView.closeAllEditors();

  const openedDocument = await openFixtureMarkdown(browser);
  expect(openedDocument.languageId).toBe("markdown");

  await editorView.openEditor(markdownEditorTitle);

  const previewButton = await findPreviewButton(browser);
  await expect(previewButton).toBeDisplayed();
  expect(await editorView.getOpenEditorTitles()).toContain(markdownEditorTitle);
  expect(openedDocument.fileName).toContain(markdownFixturePath);

  return {
    browser,
    expect,
    editorView,
    openedDocument,
    previewButton,
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
    const { browser, expect, editorView, previewButton } =
      await setupMarkdownPreviewTest();

    await previewButton.moveTo();
    await previewButton.waitForClickable();
    await previewButton.click();

    await browser.waitUntil(async () => {
      const openEditorTitles = await editorView.getOpenEditorTitles();
      return openEditorTitles.includes(previewTabTitle);
    });

    expect(await editorView.getOpenEditorTitles()).toContain(previewTabTitle);
  });
});
