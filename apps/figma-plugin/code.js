const UI_SIZE = { width: 420, height: 640 };
const FALLBACK_FONT_FAMILY = "Inter";

figma.showUI(__html__, UI_SIZE);

figma.ui.onmessage = async (message) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "close-plugin") {
    figma.closePlugin();
    return;
  }

  if (message.type !== "import-scene") {
    return;
  }

  try {
    postToUi("status", {
      level: "info",
      text: "Import started. Creating Figma nodes from scene JSON..."
    });

    const scene = validateScene(message.scene);
    const result = await importScene(scene, {
      importImages: message.importImages !== false
    });

    postToUi("import-complete", result);
    figma.notify(`Imported ${result.importedCount} layers from ${scene.title}.`);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);

    postToUi("import-error", { message: messageText });
    figma.notify(`Import failed: ${messageText}`, { error: true });
  }
};

async function importScene(scene, options) {
  await figma.currentPage.loadAsync();

  const availableFonts = await figma.listAvailableFontsAsync();
  const fontIndex = buildFontIndex(availableFonts);
  const fontLoadCache = new Set();
  const sceneLookup = new Map(scene.nodes.map((node) => [node.id, node]));
  const figmaLookup = new Map();
  const warnings = [];
  const baseOrigin = {
    x: Math.round(figma.viewport.center.x - scene.viewport.width / 2),
    y: Math.round(figma.viewport.center.y - scene.viewport.height / 2)
  };

  let frameCount = 0;
  let textCount = 0;
  let imageCount = 0;
  let imageFailures = 0;
  let rootNode = null;

  for (let index = 0; index < scene.nodes.length; index += 1) {
    const sceneNode = scene.nodes[index];

    if (index > 0 && index % 40 === 0) {
      postToUi("status", {
        level: "info",
        text: `Imported ${index}/${scene.nodes.length} layers...`
      });
    }

    const parentSceneNode = sceneNode.parentId ? sceneLookup.get(sceneNode.parentId) : null;
    const parentFigmaNode = sceneNode.parentId ? figmaLookup.get(sceneNode.parentId) : figma.currentPage;

    if (!parentFigmaNode) {
      warnings.push(`Skipped "${sceneNode.name}" because its parent node was not created.`);
      continue;
    }

    const createdNode = await createFigmaNode(sceneNode, {
      parentSceneNode,
      parentFigmaNode,
      baseOrigin,
      fontIndex,
      fontLoadCache,
      importImages: options.importImages !== false,
      warnings
    });

    if (!createdNode) {
      continue;
    }

    parentFigmaNode.appendChild(createdNode);
    figmaLookup.set(sceneNode.id, createdNode);

    if (sceneNode.parentId === null) {
      rootNode = createdNode;
    }

    if (sceneNode.type === "frame") {
      frameCount += 1;
    } else if (sceneNode.type === "text") {
      textCount += 1;
    } else if (sceneNode.type === "image") {
      imageCount += 1;
      if (createdNode.getPluginData("imageStatus") === "failed") {
        imageFailures += 1;
      }
    }
  }

  if (!rootNode) {
    throw new Error("The scene did not produce a root frame in Figma.");
  }

  rootNode.name = `${scene.title} / Imported`;
  rootNode.setPluginData("sourceUrl", scene.sourceUrl || "");
  rootNode.setPluginData("capturedAt", scene.capturedAt || "");

  figma.currentPage.selection = [rootNode];
  figma.viewport.scrollAndZoomIntoView([rootNode]);

  if (scene.truncated) {
    warnings.push("The Chrome extension truncated the capture because it reached the max node limit.");
  }

  return {
    title: scene.title,
    sourceUrl: scene.sourceUrl,
    importedCount: figmaLookup.size,
    frameCount,
    textCount,
    imageCount,
    imageFailures,
    warnings
  };
}

async function createFigmaNode(sceneNode, context) {
  if (sceneNode.type === "frame") {
    const frame = figma.createFrame();

    applyCommonNodeProperties(frame, sceneNode, context.parentSceneNode, context.baseOrigin);
    applyFrameStyle(frame, sceneNode, context);

    return frame;
  }

  if (sceneNode.type === "text") {
    return createTextNode(sceneNode, context);
  }

  if (sceneNode.type === "image") {
    return createImageNode(sceneNode, context);
  }

  context.warnings.push(`Skipped unsupported node type "${sceneNode.type}" on "${sceneNode.name}".`);
  return null;
}

function applyCommonNodeProperties(figmaNode, sceneNode, parentSceneNode, baseOrigin) {
  const position = parentSceneNode
    ? {
        x: round(sceneNode.x - parentSceneNode.x),
        y: round(sceneNode.y - parentSceneNode.y)
      }
    : {
        x: round(baseOrigin.x + sceneNode.x),
        y: round(baseOrigin.y + sceneNode.y)
      };

  figmaNode.name = sceneNode.name || sceneNode.type;
  figmaNode.x = position.x;
  figmaNode.y = position.y;
  figmaNode.rotation = sanitizeNumber(sceneNode.rotation, 0);
  figmaNode.opacity = clamp(sanitizeNumber(sceneNode.opacity, 1), 0, 1);
  figmaNode.visible = sceneNode.visible !== false;
}

function applyFrameStyle(frame, sceneNode, context) {
  frame.layoutMode = "NONE";
  frame.clipsContent = sceneNode.clipsContent === true;
  frame.resize(safeSize(sceneNode.width), safeSize(sceneNode.height));

  const fills = [];
  const backgroundFill = solidPaintFromColor(sceneNode.style && sceneNode.style.backgroundColor);

  if (backgroundFill) {
    fills.push(backgroundFill);
  }

  frame.fills = fills;

  const radius = parseBorderRadius(sceneNode.style && sceneNode.style.borderRadius);

  if (radius !== null) {
    frame.cornerRadius = radius;
  }

  const borderPaint = parseUniformBorderPaint(sceneNode.style);

  if (borderPaint) {
    frame.strokes = [borderPaint.paint];
    frame.strokeWeight = borderPaint.weight;
    frame.strokeAlign = "INSIDE";
  } else {
    frame.strokes = [];
  }

  const shadowEffect = parseDropShadow(sceneNode.style && sceneNode.style.boxShadow);
  frame.effects = shadowEffect ? [shadowEffect] : [];

  applyFlexHint(frame, sceneNode.style);

  if (sceneNode.style && isSimpleBackgroundImage(sceneNode.style.backgroundImage)) {
    applyBackgroundImageFill(frame, sceneNode.style.backgroundImage, context).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      context.warnings.push(`Background image failed on "${sceneNode.name}": ${reason}`);
    });
  }
}

async function createTextNode(sceneNode, context) {
  const textNode = figma.createText();
  const chosenFont = chooseFont(sceneNode.text, context.fontIndex);

  await ensureFontLoaded(chosenFont, context.fontLoadCache);

  applyCommonNodeProperties(textNode, sceneNode, context.parentSceneNode, context.baseOrigin);

  textNode.fontName = chosenFont;
  textNode.fontSize = safeSize(sceneNode.text.fontSize, 16);
  textNode.lineHeight = {
    unit: "PIXELS",
    value: safeSize(sceneNode.text.lineHeight, sceneNode.text.fontSize || 16)
  };
  textNode.letterSpacing = {
    unit: "PIXELS",
    value: sanitizeNumber(sceneNode.text.letterSpacing, 0)
  };
  textNode.textAlignHorizontal = mapTextAlign(sceneNode.text.textAlign);
  textNode.textDecoration = mapTextDecoration(sceneNode.text.textDecoration);
  textNode.textCase = mapTextCase(sceneNode.text.textTransform);
  textNode.characters = sceneNode.text.characters || "";
  textNode.textAutoResize = "NONE";
  textNode.resize(safeSize(sceneNode.width, 1), safeSize(sceneNode.height, 1));

  const fill = solidPaintFromColor(sceneNode.text.color);
  textNode.fills = fill ? [fill] : [];

  if (chosenFont.family !== preferredPrimaryFontFamily(sceneNode.text.fontFamily)) {
    context.warnings.push(
      `Font fallback on "${sceneNode.name}": requested ${preferredPrimaryFontFamily(sceneNode.text.fontFamily)}, used ${chosenFont.family}.`
    );
  }

  return textNode;
}

async function createImageNode(sceneNode, context) {
  const rectangle = figma.createRectangle();

  applyCommonNodeProperties(rectangle, sceneNode, context.parentSceneNode, context.baseOrigin);
  rectangle.resize(safeSize(sceneNode.width), safeSize(sceneNode.height));

  const radius = parseBorderRadius(sceneNode.style && sceneNode.style.borderRadius);

  if (radius !== null) {
    rectangle.cornerRadius = radius;
  }

  const borderPaint = parseUniformBorderPaint(sceneNode.style);

  if (borderPaint) {
    rectangle.strokes = [borderPaint.paint];
    rectangle.strokeWeight = borderPaint.weight;
    rectangle.strokeAlign = "INSIDE";
  } else {
    rectangle.strokes = [];
  }

  const shadowEffect = parseDropShadow(sceneNode.style && sceneNode.style.boxShadow);
  rectangle.effects = shadowEffect ? [shadowEffect] : [];

  if (!context.importImages || !sceneNode.image || !sceneNode.image.src) {
    rectangle.fills = [placeholderPaint("Images disabled")];
    rectangle.setPluginData("imageStatus", "disabled");
    return rectangle;
  }

  try {
    const image = await figma.createImageAsync(sceneNode.image.src);
    rectangle.fills = [
      {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode: mapImageScaleMode(sceneNode.image.objectFit)
      }
    ];
    rectangle.setPluginData("imageStatus", "loaded");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    rectangle.fills = [placeholderPaint("Image unavailable")];
    rectangle.setPluginData("imageStatus", "failed");
    context.warnings.push(`Image failed on "${sceneNode.name}": ${reason}`);
  }

  return rectangle;
}

async function applyBackgroundImageFill(frame, backgroundImage, context) {
  const sourceUrl = extractFirstUrl(backgroundImage);

  if (!sourceUrl) {
    return;
  }

  const image = await figma.createImageAsync(sourceUrl);
  const existingFills = Array.isArray(frame.fills) ? frame.fills.slice() : [];

  existingFills.push({
    type: "IMAGE",
    imageHash: image.hash,
    scaleMode: "FILL"
  });

  frame.fills = existingFills;
}

function applyFlexHint(frame, style) {
  if (!style || !style.display || !style.display.includes("flex")) {
    return;
  }

  frame.setPluginData("layoutHint", "flex");
  frame.setPluginData("flexDirection", style.flexDirection || "");
  frame.setPluginData("justifyContent", style.justifyContent || "");
  frame.setPluginData("alignItems", style.alignItems || "");
  frame.setPluginData("gap", style.gap || "");
}

function validateScene(scene) {
  if (!scene || typeof scene !== "object") {
    throw new Error("Scene JSON is missing or invalid.");
  }

  if (!Array.isArray(scene.nodes) || scene.nodes.length === 0) {
    throw new Error("Scene JSON does not contain any nodes.");
  }

  if (!scene.viewport || typeof scene.viewport.width !== "number" || typeof scene.viewport.height !== "number") {
    throw new Error("Scene JSON is missing viewport dimensions.");
  }

  return scene;
}

function buildFontIndex(availableFonts) {
  const familyMap = new Map();

  for (const font of availableFonts) {
    const family = font.fontName.family.toLowerCase();

    if (!familyMap.has(family)) {
      familyMap.set(family, []);
    }

    familyMap.get(family).push(font.fontName);
  }

  return familyMap;
}

function chooseFont(textData, fontIndex) {
  const requestedFamilies = normalizeFontFamilies(textData && textData.fontFamily);
  const requestedStyle = desiredFontStyle(textData && textData.fontWeight);

  for (const family of requestedFamilies) {
    const candidates = fontIndex.get(family.toLowerCase());

    if (!candidates || candidates.length === 0) {
      continue;
    }

    const matchedStyle = pickFontStyle(candidates, requestedStyle);

    if (matchedStyle) {
      return matchedStyle;
    }
  }

  const interCandidates = fontIndex.get(FALLBACK_FONT_FAMILY.toLowerCase()) || [];
  const interMatch = pickFontStyle(interCandidates, requestedStyle);

  if (interMatch) {
    return interMatch;
  }

  return { family: FALLBACK_FONT_FAMILY, style: "Regular" };
}

function normalizeFontFamilies(fontFamilyValue) {
  if (!fontFamilyValue || typeof fontFamilyValue !== "string") {
    return [FALLBACK_FONT_FAMILY];
  }

  return fontFamilyValue
    .split(",")
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function preferredPrimaryFontFamily(fontFamilyValue) {
  return normalizeFontFamilies(fontFamilyValue)[0] || FALLBACK_FONT_FAMILY;
}

function desiredFontStyle(fontWeightValue) {
  const weight = Number.parseInt(fontWeightValue, 10);

  if (!Number.isNaN(weight)) {
    if (weight >= 800) {
      return ["Black", "Heavy", "Bold"];
    }

    if (weight >= 700) {
      return ["Bold", "Semibold"];
    }

    if (weight >= 600) {
      return ["Semibold", "Medium", "Bold"];
    }

    if (weight >= 500) {
      return ["Medium", "Regular"];
    }

    if (weight <= 300) {
      return ["Light", "Regular"];
    }
  }

  return ["Regular", "Book", "Medium", "Bold"];
}

function pickFontStyle(candidates, desiredStyles) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const exact = candidates.find((candidate) =>
    desiredStyles.some((style) => candidate.style.toLowerCase() === style.toLowerCase())
  );

  if (exact) {
    return exact;
  }

  const partial = candidates.find((candidate) =>
    desiredStyles.some((style) => candidate.style.toLowerCase().includes(style.toLowerCase()))
  );

  if (partial) {
    return partial;
  }

  return candidates[0];
}

async function ensureFontLoaded(fontName, fontLoadCache) {
  const cacheKey = `${fontName.family}::${fontName.style}`;

  if (fontLoadCache.has(cacheKey)) {
    return;
  }

  await figma.loadFontAsync(fontName);
  fontLoadCache.add(cacheKey);
}

function solidPaintFromColor(colorValue) {
  const color = parseColor(colorValue);

  if (!color || color.a === 0) {
    return null;
  }

  return {
    type: "SOLID",
    color: {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255
    },
    opacity: color.a
  };
}

function parseColor(value) {
  if (!value || value === "transparent") {
    return null;
  }

  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);

  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((part) => part.trim());
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts[3] === undefined ? 1 : Number(parts[3]);

    if ([r, g, b, a].some((part) => Number.isNaN(part))) {
      return null;
    }

    return { r, g, b, a };
  }

  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);

  if (!hexMatch) {
    return null;
  }

  const hex = hexMatch[1];

  if (hex.length === 3) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }

  return null;
}

function parseUniformBorderPaint(style) {
  if (!style || !style.borderTop || !style.borderRight || !style.borderBottom || !style.borderLeft) {
    return null;
  }

  if (!(style.borderTop === style.borderRight && style.borderTop === style.borderBottom && style.borderTop === style.borderLeft)) {
    return null;
  }

  const match = style.borderTop.match(/([0-9.]+)px\s+\S+\s+(.+)/);

  if (!match) {
    return null;
  }

  const weight = Number.parseFloat(match[1]);
  const paint = solidPaintFromColor(match[2]);

  if (!paint || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  return { weight, paint };
}

function parseBorderRadius(radiusValue) {
  if (!radiusValue || typeof radiusValue !== "string") {
    return null;
  }

  const match = radiusValue.match(/([0-9.]+)px/);

  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1]);
}

function parseDropShadow(shadowValue) {
  if (!shadowValue || shadowValue === "none") {
    return null;
  }

  const match = shadowValue.match(/(-?[0-9.]+)px\s+(-?[0-9.]+)px\s+([0-9.]+)px(?:\s+-?[0-9.]+px)?\s+(rgba?\([^)]+\)|#[0-9a-fA-F]+)/);

  if (!match) {
    return null;
  }

  const color = parseColor(match[4]);

  if (!color) {
    return null;
  }

  return {
    type: "DROP_SHADOW",
    color: {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255,
      a: color.a
    },
    offset: {
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2])
    },
    radius: Number.parseFloat(match[3]),
    visible: true,
    blendMode: "NORMAL"
  };
}

function isSimpleBackgroundImage(backgroundImage) {
  return typeof backgroundImage === "string" && /url\(/i.test(backgroundImage);
}

function extractFirstUrl(backgroundImage) {
  if (!backgroundImage) {
    return null;
  }

  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
  return match ? match[2] : null;
}

function mapImageScaleMode(objectFit) {
  if (objectFit === "contain") {
    return "FIT";
  }

  return "FILL";
}

function mapTextAlign(value) {
  switch ((value || "").toLowerCase()) {
    case "right":
      return "RIGHT";
    case "center":
      return "CENTER";
    case "justif y":
    case "justify":
      return "JUSTIFIED";
    default:
      return "LEFT";
  }
}

function mapTextDecoration(value) {
  const normalized = (value || "").toLowerCase();

  if (normalized.includes("underline")) {
    return "UNDERLINE";
  }

  if (normalized.includes("line-through")) {
    return "STRIKETHROUGH";
  }

  return "NONE";
}

function mapTextCase(value) {
  switch ((value || "").toLowerCase()) {
    case "uppercase":
      return "UPPER";
    case "lowercase":
      return "LOWER";
    case "capitalize":
      return "TITLE";
    default:
      return "ORIGINAL";
  }
}

function placeholderPaint(label) {
  const fill = solidPaintFromColor("rgba(232, 220, 199, 1)");
  fill.opacity = 1;
  fill.boundVariables = undefined;
  fill.visible = true;
  fill.blendMode = "NORMAL";
  fill.label = label;
  return fill;
}

function postToUi(type, payload) {
  figma.ui.postMessage({ type, ...payload });
}

function sanitizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSize(value, fallback = 1) {
  return Math.max(1, sanitizeNumber(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
