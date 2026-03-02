# Chrome Extension MVP

This is the first Chrome extension for the `web-to-figma` project.

It does one job:

- capture the current tab's visible page structure
- normalize it into a scene JSON
- download that JSON for the future Figma plugin importer

## What it captures

- viewport size and scroll position
- visible frame-like containers
- direct text nodes
- image nodes
- common visual styles such as background, border, radius, shadow, opacity, and simple layout hints

## What it does not capture yet

- pseudo-elements
- SVG vectors
- CSS grid reconstruction
- screenshot fallbacks
- full-page capture beyond the visible viewport
- live handoff to a Figma plugin

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `/Users/cristian/Documents/GitHub/web-to-figma/apps/chrome-extension`.

## Use it

1. Open any normal website tab.
2. Click the extension icon.
3. Set `Max nodes` and whether to include images.
4. Click `Capture active tab`.
5. Save the generated `.scene.json` file.

## Notes

- Browser internal pages like `chrome://` cannot be captured.
- The output is intentionally a normalized scene model, not raw HTML.
- The next step is a Figma plugin that reads this JSON and creates Figma nodes.
