import assert from "node:assert/strict";
import { build } from "esbuild";

// Render without a browser, effects, listeners, O2 calls or an application launch.
const result = await build({
  stdin: {
    contents: 'import React from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { SentinelTab } from "./src/components/sentinel/SentinelTab"; export default renderToStaticMarkup(React.createElement(SentinelTab));',
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, platform: "node", format: "cjs", write: false,
});
const module = { exports: {} };
const { createRequire } = await import("node:module");
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const html = module.exports.default;
assert.equal((html.match(/data-testid="sentinel-current-now"/g) || []).length, 1);
assert.match(html, /data-current-health="UNKNOWN"/);
assert.match(html, /Waiting for current measurements/);
assert.match(html, /Automatic updater repair not ready/);
assert.doesNotMatch(html, /data-testid="sentinel-fix-it"/);
assert.match(html, /<details class="sentinelAdvancedWorkspace"><summary>/);
assert.doesNotMatch(html, /<details class="sentinelAdvancedWorkspace" open/);
const defaultView = html.slice(0, html.indexOf('<details class="sentinelAdvancedWorkspace">'));
assert.match(defaultView, /RECENT EVENTS/);
assert.doesNotMatch(defaultView, /sentinel-capability-ladder|sentinel-triggers|sentinelAutomationControl/);
assert.equal((defaultView.match(/Fans are loud/g) || []).length, 1);
console.log("Sentinel static render: one unknown current verdict, safe readiness, collapsed technical controls");
