# web-to-figma

Build your own `html.to.design` style workflow:

- A Chrome extension reads the active page and exports a normalized scene model.
- A Figma plugin imports that scene model and recreates it as editable Figma nodes.
- A small backend is optional for productizing the handoff, but not required for the first MVP.

Start with the implementation guide:

- [docs/web-to-figma-guide.md](docs/web-to-figma-guide.md)
- [apps/chrome-extension/README.md](apps/chrome-extension/README.md)

Recommended build order:

1. Capture a page into JSON from Chrome.
2. Import that JSON into Figma and render basic frames, text, and images.
3. Add better layout fidelity, assets, and screenshot fallbacks.
4. Add backend sync so the extension and plugin can share imports by ID.
