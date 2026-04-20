/// <reference lib="dom" />

import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/plugins/line-highlight/prism-line-highlight.css";
import "prismjs/plugins/line-highlight/prism-line-highlight.js";
import "prismjs/plugins/line-numbers/prism-line-numbers.css";
import "prismjs/plugins/line-numbers/prism-line-numbers.js";
import "prismjs/themes/prism-tomorrow.css";
import "./styles/editor-projects.scss";

const app = document.getElementById("app")!;
Prism.manual = true;

type PrismPluginApi = typeof Prism & {
  plugins?: {
    lineHighlight?: {
      highlightLines: (pre: Element) => (() => void) | void;
    };
    lineNumbers?: {
      resize: (elements: NodeListOf<Element>) => void;
    };
  };
};

const prismWithPlugins = Prism as PrismPluginApi;

function applyPrismPlugins(container: ParentNode) {
  container.querySelectorAll("pre[data-line]").forEach((pre) => {
    const applyHighlights =
      prismWithPlugins.plugins?.lineHighlight?.highlightLines(pre);
    if (typeof applyHighlights === "function") {
      applyHighlights();
    }
  });

  const lineNumberBlocks = container.querySelectorAll("pre.line-numbers");
  prismWithPlugins.plugins?.lineNumbers?.resize(lineNumberBlocks);
}

function renderPreview(html: string) {
  app.innerHTML = html;
  Prism.highlightAllUnder(app);
  applyPrismPlugins(app);
}

// Listen for updates from extension
window.addEventListener("message", (event: MessageEvent<{ html: string }>) => {
  const { html } = event.data;

  renderPreview(html);
});

if (app.innerHTML.trim()) {
  renderPreview(app.innerHTML);
}
