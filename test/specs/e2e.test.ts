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

// Opens the markdown fixture, clicks the preview button, and waits for the
// preview tab to appear. Returns the test context for further assertions.
async function openPreview() {
  const context = await setupMarkdownPreviewTest();
  const { browser, editorView, previewButton } = context;

  await previewButton.moveTo();
  await previewButton.waitForClickable();
  await previewButton.click();

  await browser.waitUntil(async () => {
    const openEditorTitles = await editorView.getOpenEditorTitles();
    return openEditorTitles.includes(previewTabTitle);
  });

  return context;
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
    const { expect, editorView } = await openPreview();

    expect(await editorView.getOpenEditorTitles()).toContain(previewTabTitle);
  });

  it("should render a relative image as a loaded webview resource", async () => {
    const { browser, expect, workbench } = await openPreview();

    // getWebviewByTitle matches the webview document's <title> ("Preview"),
    // not the editor tab title.
    const webview = await workbench.getWebviewByTitle("Preview");
    await webview.open();

    try {
      const image = await browser.$("#app img").getElement();
      await image.waitForExist({ timeout: 10_000 });

      // The relative ./image.png src must have been rewritten to a webview
      // resource URI (vscode-webview / vscode-cdn), not left as a relative path.
      const src = await image.getAttribute("src");
      expect(src).not.toMatch(/^\.?\//);
      expect(src).toMatch(/^https?:\/\/|^vscode-/);

      // And the rewritten URI must actually resolve and load.
      await browser.waitUntil(
        async () => {
          const naturalWidth = await browser.execute(
            (el: HTMLImageElement) => el.complete && el.naturalWidth,
            image as unknown as HTMLImageElement,
          );
          return Boolean(naturalWidth);
        },
        { timeout: 10_000, timeoutMsg: "Relative image never loaded in preview" },
      );
    } finally {
      await webview.close();
    }
  });
});
