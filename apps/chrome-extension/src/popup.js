const captureButton = document.getElementById("captureButton");
const includeImagesInput = document.getElementById("includeImages");
const maxNodesInput = document.getElementById("maxNodes");
const statusLabel = document.getElementById("status");
const summary = document.getElementById("summary");

const DEFAULT_CAPTURE_OPTIONS = {
  includeImages: true,
  maxNodes: 1200
};

init().catch((error) => {
  setStatus("Failed");
  setSummary(`Unable to initialize popup.\n${error.message}`);
});

captureButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Capturing");

  try {
    const captureOptions = {
      includeImages: includeImagesInput.checked,
      maxNodes: normalizeMaxNodes(maxNodesInput.value)
    };

    await chrome.storage.local.set({ captureOptions });

    const tab = await getActiveTab();
    validateTab(tab);

    const [{ result: scene }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectSceneInPage,
      args: [captureOptions]
    });

    if (!scene || !scene.nodes || scene.nodes.length === 0) {
      throw new Error("No visible nodes were captured from the active tab.");
    }

    const filename = buildFilename(scene);
    await downloadScene(scene, filename);

    setStatus("Done");
    setSummary(formatCaptureSummary(scene, filename));
  } catch (error) {
    setStatus("Failed");
    setSummary(error.message);
  } finally {
    setBusy(false);
  }
});

async function init() {
  const { captureOptions } = await chrome.storage.local.get("captureOptions");
  const options = { ...DEFAULT_CAPTURE_OPTIONS, ...captureOptions };

  includeImagesInput.checked = options.includeImages;
  maxNodesInput.value = String(options.maxNodes);
  setStatus("Idle");
}

function setBusy(isBusy) {
  captureButton.disabled = isBusy;
  captureButton.textContent = isBusy ? "Capturing..." : "Capture active tab";
}

function setStatus(text) {
  statusLabel.textContent = text;
}

function setSummary(text) {
  summary.textContent = text;
}

function normalizeMaxNodes(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CAPTURE_OPTIONS.maxNodes;
  }

  return Math.min(5000, Math.max(100, parsed));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    throw new Error("No active tab was found.");
  }

  return tab;
}

function validateTab(tab) {
  const url = tab.url || "";

  if (!url) {
    throw new Error("The active tab has no URL.");
  }

  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
    throw new Error("This page cannot be captured because browser internal pages block extension scripts.");
  }
}

async function downloadScene(scene, filename) {
  const json = JSON.stringify(scene, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function buildFilename(scene) {
  const title = sanitizeForFileName(scene.title || "page");
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\..+$/, "");

  return `web-to-figma/${title}-${timestamp}.scene.json`;
}

function sanitizeForFileName(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";
}

function formatCaptureSummary(scene, filename) {
  const counts = countNodeTypes(scene.nodes);

  return [
    `Saved: ${filename}`,
    `Title: ${scene.title}`,
    `URL: ${scene.sourceUrl}`,
    `Viewport: ${scene.viewport.width} x ${scene.viewport.height}`,
    `Scroll: ${scene.viewport.scrollX}, ${scene.viewport.scrollY}`,
    `Nodes: ${scene.nodes.length}${scene.truncated ? " (truncated)" : ""}`,
    `Frames: ${counts.frame}`,
    `Text: ${counts.text}`,
    `Images: ${counts.image}`,
    `Captured at: ${scene.capturedAt}`
  ].join("\n");
}

function countNodeTypes(nodes) {
  return nodes.reduce(
    (accumulator, node) => {
      if (accumulator[node.type] !== undefined) {
        accumulator[node.type] += 1;
      }

      return accumulator;
    },
    { frame: 0, text: 0, image: 0 }
  );
}

function collectSceneInPage(options) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxNodes = Math.min(5000, Math.max(100, Number(options?.maxNodes) || 1200));
  const includeImages = Boolean(options?.includeImages);
  const maxTextLength = 3000;
  const nodes = [];
  let nextId = 1;
  let truncated = false;

  const scene = {
    version: 1,
    sourceUrl: window.location.href,
    title: document.title || "Untitled Page",
    capturedAt: new Date().toISOString(),
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    },
    nodes
  };

  nodes.push({
    id: "root",
    type: "frame",
    name: "Viewport",
    parentId: null,
    x: 0,
    y: 0,
    width: viewportWidth,
    height: viewportHeight,
    rotation: 0,
    opacity: 1,
    visible: true,
    clipsContent: true,
    htmlTag: "viewport",
    sourceSelector: "html > body",
    style: {
      backgroundColor: normalizeColor(getComputedStyle(document.body || document.documentElement).backgroundColor) || "transparent"
    }
  });

  const rootElement = document.body || document.documentElement;
  visitElement(rootElement, "root", 0);
  scene.truncated = truncated;

  return scene;

  function visitElement(element, parentId, depth) {
    if (!(element instanceof Element) || truncated) {
      return;
    }

    if (nodes.length >= maxNodes) {
      truncated = true;
      return;
    }

    const rect = element.getBoundingClientRect();

    if (!isRenderableRect(rect)) {
      return;
    }

    const style = window.getComputedStyle(element);

    if (!isElementVisible(element, style)) {
      return;
    }

    const currentId = buildNodeId();
    const shouldCaptureImage = includeImages && element.tagName === "IMG" && element.currentSrc;
    const shouldCaptureFrame = !shouldCaptureImage && shouldCreateFrameNode(element, style, rect, depth);
    const nextParentId = shouldCaptureFrame || shouldCaptureImage ? currentId : parentId;

    if (shouldCaptureImage) {
      nodes.push(buildImageNode(element, currentId, parentId, rect, style));
    } else if (shouldCaptureFrame) {
      nodes.push(buildFrameNode(element, currentId, parentId, rect, style));
    }

    captureDirectTextChildren(element, nextParentId);

    if (isVoidLikeElement(element)) {
      return;
    }

    for (const child of element.children) {
      visitElement(child, nextParentId, depth + 1);

      if (truncated) {
        return;
      }
    }
  }

  function captureDirectTextChildren(element, parentId) {
    if (truncated || nodes.length >= maxNodes) {
      truncated = true;
      return;
    }

    const style = window.getComputedStyle(element);

    if (style.visibility === "hidden" || style.display === "none") {
      return;
    }

    for (const childNode of element.childNodes) {
      if (childNode.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      const text = normalizeText(childNode.textContent, maxTextLength);

      if (!text) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(childNode);

      const clientRects = Array.from(range.getClientRects()).filter((clientRect) => isRenderableRect(clientRect));

      if (clientRects.length === 0) {
        continue;
      }

      const textRect = mergeClientRects(clientRects);

      nodes.push(buildTextNode(text, parentId, textRect, style));

      if (nodes.length >= maxNodes) {
        truncated = true;
        return;
      }
    }
  }

  function buildFrameNode(element, id, parentId, rect, style) {
    return {
      id,
      type: "frame",
      name: readableNodeName(element),
      parentId,
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      rotation: extractRotation(style.transform),
      opacity: normalizeNumber(style.opacity, 1),
      visible: true,
      clipsContent: style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible",
      htmlTag: element.tagName.toLowerCase(),
      sourceSelector: buildSelector(element),
      style: extractVisualStyle(style)
    };
  }

  function buildTextNode(text, parentId, rect, style) {
    return {
      id: buildNodeId(),
      type: "text",
      name: `${style.display === "inline" ? "Inline" : "Text"}: ${text.slice(0, 24)}`,
      parentId,
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      rotation: extractRotation(style.transform),
      opacity: normalizeNumber(style.opacity, 1),
      visible: true,
      htmlTag: "text",
      sourceSelector: null,
      text: {
        characters: text,
        fontFamily: style.fontFamily,
        fontSize: normalizeNumber(style.fontSize, 16),
        fontWeight: style.fontWeight,
        lineHeight: normalizeLineHeight(style.lineHeight, style.fontSize),
        letterSpacing: normalizeLetterSpacing(style.letterSpacing),
        textAlign: style.textAlign,
        textTransform: style.textTransform,
        textDecoration: style.textDecorationLine,
        color: normalizeColor(style.color) || style.color,
        whiteSpace: style.whiteSpace
      }
    };
  }

  function buildImageNode(element, id, parentId, rect, style) {
    return {
      id,
      type: "image",
      name: readableNodeName(element),
      parentId,
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      rotation: extractRotation(style.transform),
      opacity: normalizeNumber(style.opacity, 1),
      visible: true,
      clipsContent: false,
      htmlTag: "img",
      sourceSelector: buildSelector(element),
      image: {
        src: element.currentSrc,
        alt: element.alt || "",
        naturalWidth: element.naturalWidth || null,
        naturalHeight: element.naturalHeight || null,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition
      },
      style: extractVisualStyle(style)
    };
  }

  function shouldCreateFrameNode(element, style, rect, depth) {
    if (element === rootElement) {
      return false;
    }

    const tagName = element.tagName;
    const childElementCount = element.children.length;
    const hasDecoration = hasVisibleDecoration(style);
    const isLayoutContainer = /flex|grid/.test(style.display);
    const isInteractive = /^(A|BUTTON|INPUT|TEXTAREA|SELECT|LABEL)$/.test(tagName);
    const isSemanticContainer = /^(SECTION|ARTICLE|NAV|HEADER|FOOTER|MAIN|ASIDE|FORM|UL|OL|LI)$/.test(tagName);
    const isAbsolutelyPositioned = style.position === "absolute" || style.position === "fixed" || style.position === "sticky";
    const area = rect.width * rect.height;

    if (childElementCount === 0 && !hasDecoration && !isInteractive && !isAbsolutelyPositioned) {
      return false;
    }

    if (hasDecoration || isLayoutContainer || isInteractive || isAbsolutelyPositioned || isSemanticContainer) {
      return true;
    }

    if (childElementCount > 1 && area >= 1600) {
      return true;
    }

    return depth <= 1 && area >= 5000;
  }

  function hasVisibleDecoration(style) {
    return (
      hasVisibleColor(style.backgroundColor) ||
      style.backgroundImage !== "none" ||
      hasVisibleBorder(style) ||
      style.boxShadow !== "none" ||
      borderRadiusValue(style) > 0 ||
      style.overflow !== "visible" ||
      style.opacity !== "1"
    );
  }

  function hasVisibleBorder(style) {
    const width = normalizeNumber(style.borderTopWidth, 0) +
      normalizeNumber(style.borderRightWidth, 0) +
      normalizeNumber(style.borderBottomWidth, 0) +
      normalizeNumber(style.borderLeftWidth, 0);

    return width > 0 && style.borderStyle !== "none";
  }

  function buildSelector(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 4) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${cssEscape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      const classNames = Array.from(current.classList).slice(0, 2);

      if (classNames.length > 0) {
        selector += classNames.map((className) => `.${cssEscape(className)}`).join("");
      }

      parts.unshift(selector);
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function readableNodeName(element) {
    const tagName = element.tagName.toLowerCase();
    const ariaLabel = element.getAttribute("aria-label");
    const className = typeof element.className === "string" ? element.className.trim().split(/\s+/)[0] : "";

    return ariaLabel || className || tagName;
  }

  function extractVisualStyle(style) {
    return {
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      backgroundColor: normalizeColor(style.backgroundColor) || style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      borderTop: style.borderTop,
      borderRight: style.borderRight,
      borderBottom: style.borderBottom,
      borderLeft: style.borderLeft,
      boxShadow: style.boxShadow,
      overflow: style.overflow,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      gap: style.gap,
      justifyContent: style.justifyContent,
      alignItems: style.alignItems,
      flexDirection: style.flexDirection
    };
  }

  function isRenderableRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return !(
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= viewportWidth ||
      rect.top >= viewportHeight
    );
  }

  function isElementVisible(element, style) {
    if (style.display === "none" || style.visibility === "hidden" || normalizeNumber(style.opacity, 1) === 0) {
      return false;
    }

    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    return true;
  }

  function normalizeText(text, limit) {
    return (text || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function mergeClientRects(rects) {
    const firstRect = rects[0];
    let left = firstRect.left;
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;

    for (const rect of rects.slice(1)) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }

    return {
      left,
      top,
      width: right - left,
      height: bottom - top
    };
  }

  function normalizeColor(color) {
    if (!color) {
      return null;
    }

    if (color === "transparent") {
      return "transparent";
    }

    const match = color.match(/rgba?\(([^)]+)\)/);

    if (!match) {
      return color;
    }

    const parts = match[1].split(",").map((part) => part.trim());
    const red = Number(parts[0]);
    const green = Number(parts[1]);
    const blue = Number(parts[2]);
    const alpha = parts[3] === undefined ? 1 : Number(parts[3]);

    if ([red, green, blue, alpha].some((value) => Number.isNaN(value))) {
      return color;
    }

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function hasVisibleColor(color) {
    const normalized = normalizeColor(color);

    return Boolean(normalized && normalized !== "transparent" && !normalized.endsWith(", 0)"));
  }

  function normalizeNumber(value, fallback) {
    const parsed = Number.parseFloat(value);

    return Number.isFinite(parsed) ? round(parsed) : fallback;
  }

  function normalizeLineHeight(lineHeight, fontSize) {
    if (lineHeight === "normal") {
      return round(normalizeNumber(fontSize, 16) * 1.2);
    }

    return normalizeNumber(lineHeight, normalizeNumber(fontSize, 16) * 1.2);
  }

  function normalizeLetterSpacing(letterSpacing) {
    if (letterSpacing === "normal") {
      return 0;
    }

    return normalizeNumber(letterSpacing, 0);
  }

  function extractRotation(transform) {
    if (!transform || transform === "none") {
      return 0;
    }

    const matrixMatch = transform.match(/matrix\(([^)]+)\)/);

    if (!matrixMatch) {
      return 0;
    }

    const [a, b] = matrixMatch[1].split(",").map((value) => Number.parseFloat(value.trim()));

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return 0;
    }

    return round((Math.atan2(b, a) * 180) / Math.PI);
  }

  function borderRadiusValue(style) {
    return [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius
    ].reduce((maxRadius, radius) => Math.max(maxRadius, normalizeNumber(radius, 0)), 0);
  }

  function isVoidLikeElement(element) {
    return /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
  }

  function buildNodeId() {
    nextId += 1;
    return `node_${nextId}`;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
}
