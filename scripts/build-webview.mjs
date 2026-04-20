import * as esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
await esbuild.build({
  entryPoints: ["src/webview/preview.ts"],
  bundle: true,
  outdir: "media",
  format: "iife",
  platform: "browser",
  plugins: [sassPlugin()],
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
});
