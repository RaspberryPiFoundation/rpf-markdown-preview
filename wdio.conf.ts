import path from "node:path";

// wdio.conf.ts
export const config = {
  outputDir: "trace",
  runner: "local",
  specs: ["./test/specs/**/*.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "vscode",
      browserVersion: "stable", // "insiders" or "stable" for latest VSCode version
      "wdio:enforceWebDriverClassic": true, // this is important for using WebdriverIO v9!
      "wdio:vscodeOptions": {
        extensionPath: path.resolve("."),
        workspacePath: path.resolve("."),
        vscodeArgs: {
          disableExtensions: false,
        },
        userSettings: {
          "editor.fontSize": 14,
        },
      },
    },
  ],
  services: ["vscode"],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  /**
   * Optionally define the path WebdriverIO stores all VSCode binaries, e.g.:
   * services: [['vscode', { cachePath: __dirname }]]
   */
  // ...
};
