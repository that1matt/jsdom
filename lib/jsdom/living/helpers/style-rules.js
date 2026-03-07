"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cssom = require("@acemir/cssom");
const Specificity = require("@bramus/specificity").default;
const { CSSStyleDeclaration } = require("cssstyle");
const { wrapperForImpl } = require("../../../generated/idl/utils");
const { getSpecifiedColor, getComputedOrUsedColor } = require("./colors");
const { asciiLowercase } = require("./strings");
const { deprecatedAliases, systemColors } = require("./system-colors");

const defaultStyleSheet = fs.readFileSync(
  path.resolve(__dirname, "../../browser/default-stylesheet.css"),
  { encoding: "utf-8" }
);
let parsedDefaultStyleSheet;

// Properties for which getResolvedValue is implemented. This is less than
// every supported property.
// https://drafts.csswg.org/indexes/#properties
const propertiesWithResolvedValueImplemented = {
  "__proto__": null,

  // https://drafts.csswg.org/css2/visufx.html#visibility
  "visibility": {
    inherited: true,
    initial: "visible",
    computedValue: "as-specified"
  },
  // https://svgwg.org/svg2-draft/interact.html#PointerEventsProperty
  "pointer-events": {
    inherited: true,
    initial: "auto",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-backgrounds-3/#propdef-background-color
  "background-color": {
    inherited: false,
    initial: "transparent",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-logical-1/#propdef-border-block-end-color
  "border-block-start-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-block-end-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-inline-start-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-inline-end-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-backgrounds-3/#propdef-border-bottom-color
  "border-top-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-right-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-bottom-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  "border-left-color": {
    inherited: false,
    initial: "currentcolor",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-ui-4/#propdef-caret-color
  "caret-color": {
    inherited: true,
    initial: "auto",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-color-4/#propdef-color
  "color": {
    inherited: true,
    initial: "canvastext",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-ui-4/#propdef-outline-color
  "outline-color": {
    inherited: false,
    initial: "invert",
    computedValue: "computed-color"
  },
  // https://drafts.csswg.org/css-display/#the-display-properties
  // Currently only "as-specified" is supported as a computed value
  "display": {
    inherited: false,
    initial: "inline",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-fonts-4/#propdef-font-style
  "font-style": {
    inherited: true,
    initial: "normal",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-fonts-4/#propdef-font-weight
  "font-weight": {
    inherited: true,
    initial: "normal",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-fonts-4/#propdef-font-variant-css21
  "font-variant": {
    inherited: true,
    initial: "normal",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-fonts-4/#propdef-font-stretch
  "font-stretch": {
    inherited: true,
    initial: "normal",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-text-3/#propdef-text-transform
  "text-transform": {
    inherited: true,
    initial: "none",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-text-3/#propdef-text-align
  "text-align": {
    inherited: true,
    initial: "start",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-text-decor-3/#propdef-text-decoration
  "text-decoration": {
    inherited: false,
    initial: "none",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-text-3/#propdef-white-space
  "white-space": {
    inherited: true,
    initial: "normal",
    computedValue: "as-specified"
  },
  // https://w3c.github.io/csswg-drafts/css-ui/#propdef-cursor
  "cursor": {
    inherited: true,
    initial: "auto",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-overflow-3/#propdef-overflow
  "overflow": {
    inherited: false,
    initial: "visible",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-overflow-3/#propdef-overflow-x
  "overflow-x": {
    inherited: false,
    initial: "visible",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-overflow-3/#propdef-overflow-y
  "overflow-y": {
    inherited: false,
    initial: "visible",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-position-4/#propdef-position
  "position": {
    inherited: false,
    initial: "static",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-color-4/#propdef-opacity
  "opacity": {
    inherited: false,
    initial: "1",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-page-floats/#propdef-float
  "float": {
    inherited: false,
    initial: "none",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-page-floats/#propdef-clear
  "clear": {
    inherited: false,
    initial: "none",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css2/#propdef-z-index
  "z-index": {
    inherited: false,
    initial: "auto",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css2/#propdef-vertical-align
  "vertical-align": {
    inherited: false,
    initial: "baseline",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-writing-modes-4/#propdef-direction
  "direction": {
    inherited: true,
    initial: "ltr",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-sizing-3/#propdef-box-sizing
  "box-sizing": {
    inherited: false,
    initial: "content-box",
    computedValue: "as-specified"
  },
  // https://drafts.csswg.org/css-position-4/#propdef-inset
  "left": {
    inherited: false,
    initial: "auto",
    computedValue: "length"
  },
  "right": {
    inherited: false,
    initial: "auto",
    computedValue: "length"
  },
  "top": {
    inherited: false,
    initial: "auto",
    computedValue: "length"
  },
  "bottom": {
    inherited: false,
    initial: "auto",
    computedValue: "length"
  },
  // https://drafts.csswg.org/css-fonts-4/#propdef-font-size
  "font-size": {
    inherited: true,
    initial: "medium",
    computedValue: "length"
  }
};
const implementedProperties = Object.keys(propertiesWithResolvedValueImplemented);

function getComputedStyleDeclaration(elementImpl) {
  const styleCache = elementImpl._ownerDocument._styleCache;
  const cachedDeclaration = styleCache.get(elementImpl);
  if (cachedDeclaration) {
    const opts = prepareCssstyleOpts(elementImpl);
    const clonedDeclaration = new CSSStyleDeclaration(null, opts);
    // TODO: Remove when cssstyle options are ready.
    clonedDeclaration._global = elementImpl._globalObject;
    clonedDeclaration._computed = true;

    for (let i = 0; i < cachedDeclaration.length; i++) {
      const property = cachedDeclaration.item(i);
      const value = cachedDeclaration.getPropertyValue(property);
      const priority = cachedDeclaration.getPropertyPriority(property);
      clonedDeclaration.setProperty(property, value, priority);
    }

    return clonedDeclaration;
  }

  const declaration = prepareComputedStyleDeclaration(elementImpl, { styleCache });

  // TODO: Remove later.
  for (const property of implementedProperties) {
    declaration.setProperty(property, getResolvedValue(elementImpl, property));
  }
  declaration._readonly = true;

  return declaration;
}

function prepareComputedStyleDeclaration(elementImpl, { styleCache }) {
  const { style } = elementImpl;
  const opts = prepareCssstyleOpts(elementImpl);
  const declaration = new CSSStyleDeclaration(null, opts);
  // TODO: Remove when cssstyle options are ready.
  declaration._global = elementImpl._globalObject;
  declaration._computed = true;

  const uaCandidates = applyStyleSheetRules(elementImpl, declaration);

  for (let i = 0; i < style.length; i++) {
    handlePropertyForInlineStyle(style.item(i), declaration, style, uaCandidates);
  }

  styleCache.set(elementImpl, declaration);

  return declaration;
}

function prepareCssstyleOpts(elementImpl) {
  // TODO: Prepare options for cssstyle.
  const opts = {
    context: wrapperForImpl(elementImpl)
  };

  return opts;
}

function applyStyleSheetRules(elementImpl, declaration) {
  if (!parsedDefaultStyleSheet) {
    parsedDefaultStyleSheet = cssom.parse(defaultStyleSheet);
  }

  const authorSheets = elementImpl._ownerDocument.styleSheets._list;
  const authorRegistry = buildLayerRegistry(authorSheets);

  const counter = { value: 0 };

  // Collect UA-origin candidates separately so `revert` can fall back to them.
  const uaCandidates = new Map();
  handleSheet(
    parsedDefaultStyleSheet.cssRules,
    elementImpl,
    { namedLayers: new Map(), anonLayers: new WeakMap() },
    uaCandidates,
    counter
  );

  // Collect all matching declarations (UA then author).
  const candidates = new Map(uaCandidates);
  for (const sheet of authorSheets) {
    handleSheet(sheet.cssRules, elementImpl, authorRegistry, candidates, counter);
  }

  // Resolve `revert`: replace with the UA-origin winner, or remove (falls through to defaulting).
  for (const [property, winner] of candidates) {
    if (winner.value === "revert") {
      const uaWinner = uaCandidates.get(property);
      if (uaWinner) {
        candidates.set(property, uaWinner);
      } else {
        candidates.delete(property);
      }
    }
  }

  // Apply winning declarations.
  for (const [property, winner] of candidates) {
    declaration.setProperty(property, winner.value, winner.isImportant ? "important" : "");
  }

  return uaCandidates;
}

// Processes all rules in a stylesheet, routing each through handleRule.
function handleSheet(cssRules, elementImpl, registry, candidates, counter, layerPath = [], parentName = null) {
  for (const rule of cssRules) {
    handleRule(rule, elementImpl, registry, layerPath, candidates, counter, parentName);
  }
}

// Routes a single CSS rule to the appropriate handler based on its type.
function handleRule(rule, elementImpl, registry, layerPath, candidates, counter, parentName) {
  const type = rule.constructor.name;

  if (type === "CSSLayerStatementRule") {
    // Order-establishing statement only; no declarations to collect.
    return;
  }

  if (type === "CSSLayerBlockRule") {
    handleLayerBlock(rule, elementImpl, registry, layerPath, candidates, counter, parentName);
    return;
  }

  if (type === "CSSImportRule") {
    handleImport(rule, elementImpl, registry, layerPath, candidates, counter, parentName);
    return;
  }

  if (rule.media) {
    handleMedia(rule, elementImpl, registry, layerPath, candidates, counter, parentName);
    return;
  }

  if (type === "CSSStyleRule") {
    handleStyle(rule, elementImpl, layerPath, candidates, counter);
  }
}

// Handles a CSSStyleRule: checks selector match and collects each property declaration.
function handleStyle(rule, elementImpl, layerPath, candidates, counter) {
  const { ast, match } = matches(rule.selectorText, elementImpl);
  if (!match) {
    return;
  }
  const { value: specificity } = Specificity.max(...Specificity.calculate(ast));
  const { style } = rule;
  for (let i = 0; i < style.length; i++) {
    handleProperty(
      style[i],
      style.getPropertyValue(style[i]),
      style.getPropertyPriority(style[i]) === "important",
      layerPath,
      specificity,
      candidates,
      counter
    );
  }
}

// Handles a single property declaration: compares against the current cascade winner
// and updates if the new candidate beats it.
function handleProperty(property, value, isImportant, layerPath, specificity, candidates, counter) {
  const candidate = { value, isImportant, layerPath, specificity, sourceOrder: counter.value++ };
  const existing = candidates.get(property);
  if (!existing || cascadeBeats(candidate, existing)) {
    candidates.set(property, candidate);
  }
}

function handlePropertyForInlineStyle(property, declaration, style, uaCandidates) {
  const value = style.getPropertyValue(property);
  if (value === "revert") {
    // Inline `revert` is in the author origin, so it reverts past the entire
    // author cascade to the UA origin value. The author cascade value already
    // in `declaration` must be replaced (or removed).
    const uaWinner = uaCandidates.get(property);
    if (uaWinner) {
      declaration.setProperty(property, uaWinner.value, uaWinner.isImportant ? "important" : "");
    } else {
      declaration.removeProperty(property);
    }
    return;
  }
  const priority = style.getPropertyPriority(property);
  if (!declaration.getPropertyPriority(property) || priority) {
    declaration.setProperty(property, value, priority);
  }
}

// Handles a @layer block rule, building the nested layer path and recursing.
// Dotted notation like "@layer A.B { }" is shorthand for "@layer A { @layer B { } }".
function handleLayerBlock(rule, elementImpl, registry, layerPath, candidates, counter, parentName) {
  let newPath;
  let childParentName = null;
  if (rule.name) {
    const parts = rule.name.split(".");
    let prefixName = parentName ?? "";
    newPath = [...layerPath];
    for (const part of parts) {
      prefixName = prefixName ? `${prefixName}.${part}` : part;
      newPath = [...newPath, registry.namedLayers.get(prefixName) ?? Infinity];
    }
    childParentName = prefixName;
  } else {
    // Anonymous layer.
    newPath = [...layerPath, registry.anonLayers.get(rule) ?? Infinity];
  }
  handleSheet(rule.cssRules, elementImpl, registry, candidates, counter, newPath, childParentName);
}

// Handles an @import rule, including optional layer assignment and supports/media conditions.
// https://www.w3.org/TR/css-cascade-5/#at-import
function handleImport(rule, elementImpl, registry, layerPath, candidates, counter, parentName) {
  if (rule.styleSheet === null) {
    return;
  }
  const win = elementImpl._ownerDocument._defaultView;
  if (!evaluateMediaList(rule.media, win)) {
    return;
  }
  if (rule.supportsText !== null && !evaluateSupports(rule.supportsText)) {
    return;
  }
  let importLayerPath = layerPath;
  let importParentName = parentName;
  if (rule.layerName !== null) {
    if (rule.layerName === "") {
      // Anonymous layer import: @import url() layer;
      importLayerPath = [...layerPath, registry.anonLayers.get(rule) ?? Infinity];
    } else {
      // Named layer import: @import url() layer(name);
      const parts = rule.layerName.split(".");
      let prefixName = parentName ?? "";
      importLayerPath = [...layerPath];
      for (const part of parts) {
        prefixName = prefixName ? `${prefixName}.${part}` : part;
        importLayerPath = [...importLayerPath, registry.namedLayers.get(prefixName) ?? Infinity];
      }
      importParentName = prefixName;
    }
  }
  handleSheet(rule.styleSheet.cssRules, elementImpl, registry, candidates, counter, importLayerPath, importParentName);
}

// Handles a @media rule, recursing only if the media query matches.
function handleMedia(rule, elementImpl, registry, layerPath, candidates, counter, parentName) {
  const win = elementImpl._ownerDocument._defaultView;
  if (rule.cssRules && evaluateMediaList(rule.media, win)) {
    handleSheet(rule.cssRules, elementImpl, registry, candidates, counter, layerPath, parentName);
  }
}

// Compares two stylesheet candidate declarations.
// Returns true if challenger beats the current champion.
// Layer path comparison (arrays of layer indices):
//   - For normal: compare position by position; higher index wins; shorter path wins at tie position
//     (unlayered at a given nesting level beats any sublayer at that level).
//   - For !important: lower index wins; shorter path loses at tie position
//     (unlayered at a given nesting level loses to any sublayer).
function cascadeBeats(challenger, champion) {
  // !important beats normal across the board.
  if (challenger.isImportant !== champion.isImportant) {
    return challenger.isImportant;
  }

  const { isImportant } = challenger;
  const cp = challenger.layerPath;
  const hp = champion.layerPath;
  const len = Math.max(cp.length, hp.length);

  for (let i = 0; i < len; i++) {
    const ci = cp[i]; // undefined = unlayered at this level
    const hi = hp[i];

    if (ci === hi) {
      continue;
    }

    const cUnlayered = ci === undefined;
    const hUnlayered = hi === undefined;

    if (isImportant) {
      // Earlier layer (lower index) wins. Unlayered (undefined) loses.
      if (cUnlayered) {
        return false; // challenger is unlayered here → loses
      }
      if (hUnlayered) {
        return true; // champion is unlayered → challenger wins
      }
      return ci < hi;
    }
    // Normal: later layer (higher index) wins. Unlayered (undefined) wins.
    if (cUnlayered) {
      return true; // challenger is unlayered here → wins
    }
    if (hUnlayered) {
      return false; // champion is unlayered → challenger loses
    }
    return ci > hi;
  }

  // Same layer path → compare specificity.
  const specCmp = Specificity.compare(challenger.specificity, champion.specificity);
  if (specCmp !== 0) {
    return specCmp > 0;
  }

  // Same specificity → later source order wins.
  return challenger.sourceOrder > champion.sourceOrder;
}

// Splits str at every top-level (depth-0) occurrence of sep (case-insensitive).
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  const sepLen = sep.length;
  for (let i = 0; i <= str.length - sepLen; i++) {
    const ch = str[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (depth === 0 && str.slice(i, i + sepLen).toLowerCase() === sep.toLowerCase()) {
      parts.push(str.slice(start, i));
      start = i + sepLen;
      i += sepLen - 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

// https://www.w3.org/TR/css-conditional-3/#at-supports
// Evaluates a @supports condition (the content inside supports(...)).
function evaluateSupports(supportsText) {
  const trimmed = supportsText.trim();
  if (!trimmed) {
    return false;
  }

  // not <condition>
  if (/^not\s+/i.test(trimmed)) {
    return !evaluateSupports(trimmed.slice(trimmed.indexOf(" ") + 1));
  }

  // Strip balanced outer parentheses.
  if (trimmed[0] === "(") {
    let depth = 0;
    let closeIdx = -1;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "(") {
        depth++;
      } else if (trimmed[i] === ")") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === trimmed.length - 1) {
      return evaluateSupports(trimmed.slice(1, -1));
    }
  }

  // <condition> and <condition> ...
  const andParts = splitTopLevel(trimmed, " and ");
  if (andParts.length > 1) {
    return andParts.every(p => evaluateSupports(p.trim()));
  }

  // <condition> or <condition> ...
  const orParts = splitTopLevel(trimmed, " or ");
  if (orParts.length > 1) {
    return orParts.some(p => evaluateSupports(p.trim()));
  }

  // selector(selectorText) — assume selector parsing is supported.
  if (/^selector\s*\(/i.test(trimmed)) {
    return true;
  }

  // property: value — try setting it on a scratch CSSStyleDeclaration.
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) {
    const property = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    const decl = new CSSStyleDeclaration(null, {});
    decl.setProperty(property, value);
    return decl.getPropertyValue(property) !== "";
  }

  return false;
}

// Evaluates a CSS MediaList against the current viewport.
// Empty list → true (applies to all media).
// https://www.w3.org/TR/mediaqueries-5/
function evaluateMediaList(mediaList, win) {
  if (mediaList.length === 0) {
    return true;
  }
  for (let i = 0; i < mediaList.length; i++) {
    if (evaluateMediaQuery(mediaList[i], win)) {
      return true;
    }
  }
  return false;
}

// Parses a CSS length value in px; returns null if unparseable.
function parseMediaPx(value) {
  const m = /^(\d+(?:\.\d+)?)(px)?$/i.exec(value.trim());
  return m ? parseFloat(m[1]) : null;
}

// Evaluates a single media query string.
// jsdom renders as screen at 1024×768 by default.
function evaluateMediaQuery(query, win) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed === "all") {
    return true;
  }

  // not <query>
  if (trimmed.startsWith("not ")) {
    return !evaluateMediaQuery(trimmed.slice(4).trim(), win);
  }

  // <query> and <condition> and ...
  const andParts = splitTopLevel(trimmed, " and ");
  if (andParts.length > 1) {
    return andParts.every(p => evaluateMediaQuery(p.trim(), win));
  }

  // Feature condition: (min-width: 600px)
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return evaluateMediaFeature(trimmed.slice(1, -1).trim(), win);
  }

  // Media types.
  if (trimmed === "screen") {
    return true;
  }
  if (trimmed === "print" || trimmed === "speech") {
    return false;
  }

  return false;
}

// Evaluates a single media feature expression (without surrounding parentheses).
function evaluateMediaFeature(feature, win) {
  const colonIdx = feature.indexOf(":");
  if (colonIdx === -1) {
    // Boolean feature (e.g. "color", "hover") — conservatively false.
    return false;
  }
  const name = feature.slice(0, colonIdx).trim();
  const value = feature.slice(colonIdx + 1).trim();
  const width = win ? win.innerWidth : 1024;
  const height = win ? win.innerHeight : 768;

  switch (name) {
    case "min-width": {
      const px = parseMediaPx(value);
      return px !== null && width >= px;
    }
    case "max-width": {
      const px = parseMediaPx(value);
      return px !== null && width <= px;
    }
    case "width": {
      const px = parseMediaPx(value);
      return px !== null && width === px;
    }
    case "min-height": {
      const px = parseMediaPx(value);
      return px !== null && height >= px;
    }
    case "max-height": {
      const px = parseMediaPx(value);
      return px !== null && height <= px;
    }
    case "height": {
      const px = parseMediaPx(value);
      return px !== null && height === px;
    }
    case "prefers-color-scheme": {
      return value === "light";
    }
    case "prefers-reduced-motion": {
      return value === "no-preference";
    }
    default: {
      return false;
    }
  }
}

// Assigns a numeric index to each layer (named or anonymous) in document order.
// Named layers are keyed by their full dotted name (e.g. "A.B").
// Anonymous layers are keyed by the rule object itself via a WeakMap.
// Returns { namedLayers: Map<string, number>, anonLayers: WeakMap<rule, number>, count: number }.
function buildLayerRegistry(sheets) {
  const namedLayers = new Map();
  const anonLayers = new WeakMap();
  let count = 0;

  function registerNamed(fullName) {
    if (!namedLayers.has(fullName)) {
      namedLayers.set(fullName, count++);
    }
  }

  function scan(rules, parentName) {
    for (const rule of rules) {
      const type = rule.constructor.name;
      if (type === "CSSLayerStatementRule") {
        for (const name of rule.nameList) {
          // Dotted names like "A.B" in a statement are shorthand for nested @layer A { @layer B {} }.
          // Register all prefixes so that "A" is established before "A.B".
          const prefixedName = parentName ? `${parentName}.${name}` : name;
          const parts = prefixedName.split(".");
          let prefix = "";
          for (const part of parts) {
            prefix = prefix ? `${prefix}.${part}` : part;
            registerNamed(prefix);
          }
        }
      } else if (type === "CSSLayerBlockRule") {
        if (rule.name) {
          const prefixedName = parentName ? `${parentName}.${rule.name}` : rule.name;
          const parts = prefixedName.split(".");
          let prefix = "";
          for (const part of parts) {
            prefix = prefix ? `${prefix}.${part}` : part;
            registerNamed(prefix);
          }
          scan(rule.cssRules, prefixedName);
        } else {
          // Anonymous layer — keyed by rule object.
          if (!anonLayers.has(rule)) {
            anonLayers.set(rule, count++);
          }
          // Recurse without a parent name; named layers inside an anonymous layer
          // are scoped to it and get unique names via the anonymous layer's index.
          scan(rule.cssRules, null);
        }
      } else if (type === "CSSImportRule") {
        if (rule.layerName !== null) {
          if (rule.layerName === "") {
            // Anonymous layer import: @import url() layer;
            if (!anonLayers.has(rule)) {
              anonLayers.set(rule, count++);
            }
            if (rule.styleSheet !== null) {
              scan(rule.styleSheet.cssRules, null);
            }
          } else {
            // Named layer import: @import url() layer(name);
            const prefixedName = parentName ? `${parentName}.${rule.layerName}` : rule.layerName;
            const parts = prefixedName.split(".");
            let prefix = "";
            for (const part of parts) {
              prefix = prefix ? `${prefix}.${part}` : part;
              registerNamed(prefix);
            }
            if (rule.styleSheet !== null) {
              scan(rule.styleSheet.cssRules, prefixedName);
            }
          }
        } else if (rule.styleSheet !== null) {
          scan(rule.styleSheet.cssRules, parentName);
        }
      } else if (rule.media && rule.cssRules) {
        scan(rule.cssRules, parentName);
      }
    }
  }

  for (const sheet of sheets) {
    scan(sheet.cssRules, null);
  }
  return { namedLayers, anonLayers };
}

function matches(selectorText, elementImpl) {
  try {
    const domSelector = elementImpl._ownerDocument._domSelector;
    const { ast, match, pseudoElement } = domSelector.check(selectorText, elementImpl);
    // `pseudoElement` is a pseudo-element selector (e.g. `::before`).
    // However, we do not support getComputedStyle(element, pseudoElement), so `match` is set to `false`.
    if (pseudoElement) {
      return {
        match: false
      };
    }
    return { ast, match, pseudoElement };
  } catch {
    // fall through
  }
  return {
    match: false
  };
}

// https://drafts.csswg.org/css-cascade-5/#cascading
function getCascadedPropertyValue(element, property) {
  const cached = element._ownerDocument._styleCache.get(element);
  if (cached) {
    return cached.getPropertyValue(property);
  }
  return getComputedStyleDeclaration(element).getPropertyValue(property);
}

// https://drafts.csswg.org/css-cascade-4/#specified-value
function getSpecifiedValue(element, property) {
  const { initial, inherited, computedValue } = propertiesWithResolvedValueImplemented[property];
  const cascade = getCascadedPropertyValue(element, property);

  if (cascade !== "") {
    if (computedValue === "computed-color") {
      return getSpecifiedColor(cascade);
    }

    return cascade;
  }

  // Defaulting
  if (inherited && element.parentElement !== null) {
    return getComputedValue(element.parentElement, property);
  }

  // root element without parent element or inherited property
  return initial;
}

// https://www.w3.org/TR/css-values-4/#absolute-lengths
const ABSOLUTE_LENGTH_UNIT_TO_PX = new Map([
  ["px", 1],
  ["cm", 96 / 2.54],
  ["mm", 96 / 25.4],
  ["q", 96 / 101.6],
  ["in", 96],
  ["pt", 96 / 72],
  ["pc", 16]
]);

// https://drafts.csswg.org/css-fonts-4/#absolute-size-mapping
const FONT_SIZE_KEYWORD_TO_PX = new Map([
  ["xx-small", 9],
  ["x-small", 10],
  ["small", 13],
  ["medium", 16],
  ["large", 18],
  ["x-large", 24],
  ["xx-large", 32],
  ["xxx-large", 48]
]);

function serializePx(px) {
  // Serialize like browsers: avoid unnecessary decimals
  const rounded = Math.round(px * 10000) / 10000;
  return `${rounded}px`;
}

// Guard against circular dependencies when resolving font-size
const _fontSizeResolvingElements = new WeakSet();

function getElementFontSizePx(elementImpl) {
  if (_fontSizeResolvingElements.has(elementImpl)) {
    // Circular dependency fallback: use inherited/initial
    return getParentFontSizePx(elementImpl);
  }
  _fontSizeResolvingElements.add(elementImpl);
  try {
    const computed = getComputedValue(elementImpl, "font-size");
    // computed is already resolved (px string or keyword-that-resolved)
    const match = /^([\d.]+)px$/.exec(computed);
    if (match) {
      return parseFloat(match[1]);
    }
    return 16; // fallback to medium
  } finally {
    _fontSizeResolvingElements.delete(elementImpl);
  }
}

function getParentFontSizePx(elementImpl) {
  if (elementImpl.parentElement !== null) {
    return getElementFontSizePx(elementImpl.parentElement);
  }
  return 16; // medium
}

function getRootFontSizePx(elementImpl) {
  let root = elementImpl;
  while (root.parentElement !== null) {
    root = root.parentElement;
  }
  return getElementFontSizePx(root);
}

// https://www.w3.org/TR/css-values-4/#lengths
function resolveLength(value, elementImpl) {
  if (value === "auto" || value === "normal") {
    return value;
  }

  // Keyword font sizes
  if (FONT_SIZE_KEYWORD_TO_PX.has(value)) {
    return serializePx(FONT_SIZE_KEYWORD_TO_PX.get(value));
  }

  // Relative size keywords for font-size (larger/smaller) — approximate
  // by ×1.2 / ÷1.2 of parent
  if (value === "larger") {
    return serializePx(getParentFontSizePx(elementImpl) * 1.2);
  }
  if (value === "smaller") {
    return serializePx(getParentFontSizePx(elementImpl) / 1.2);
  }

  const match = /^([\d.]+(?:e[+-]?\d+)?)([a-z%]+)$/i.exec(value);
  if (!match) {
    return value; // not a length we can resolve
  }
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (ABSOLUTE_LENGTH_UNIT_TO_PX.has(unit)) {
    return serializePx(num * ABSOLUTE_LENGTH_UNIT_TO_PX.get(unit));
  }

  const win = elementImpl._ownerDocument._defaultView;
  switch (unit) {
    case "em":
      return serializePx(num * getParentFontSizePx(elementImpl));
    case "rem":
      return serializePx(num * getRootFontSizePx(elementImpl));
    case "ex":
      // approximate: 1ex ≈ 0.5em
      return serializePx(num * getParentFontSizePx(elementImpl) * 0.5);
    case "ch":
      // approximate: 1ch ≈ 0.5em
      return serializePx(num * getParentFontSizePx(elementImpl) * 0.5);
    case "vw":
      return win ? serializePx(num * win.innerWidth / 100) : value;
    case "vh":
      return win ? serializePx(num * win.innerHeight / 100) : value;
    case "vmin":
      return win ? serializePx(num * Math.min(win.innerWidth, win.innerHeight) / 100) : value;
    case "vmax":
      return win ? serializePx(num * Math.max(win.innerWidth, win.innerHeight) / 100) : value;
    case "%":
      // For font-size, % is relative to parent font-size
      return serializePx(num * getParentFontSizePx(elementImpl) / 100);
    default:
      return value; // unknown unit, return as-is
  }
}

// https://drafts.csswg.org/css-cascade-4/#computed-value
function getComputedValue(element, property) {
  const { computedValue, inherited, initial } = propertiesWithResolvedValueImplemented[property];
  let specifiedValue = getSpecifiedValue(element, property);
  // https://drafts.csswg.org/css-cascade/#defaulting-keywords
  switch (specifiedValue) {
    case "initial": {
      specifiedValue = initial;
      break;
    }
    case "inherit": {
      if (element.parentElement !== null) {
        specifiedValue = getComputedValue(element.parentElement, property);
      } else {
        specifiedValue = initial;
      }
      break;
    }
    case "unset": {
      if (inherited && element.parentElement !== null) {
        specifiedValue = getComputedValue(element.parentElement, property);
      } else {
        specifiedValue = initial;
      }
      break;
    }
    // TODO: https://drafts.csswg.org/css-cascade-5/#revert-layer
    case "revert-layer": {
      break;
    }
    // TODO: https://drafts.csswg.org/css-cascade-5/#default
    case "revert": {
      break;
    }
    default: {
      // fall through; specifiedValue is not a CSS-wide keyword.
    }
  }
  if (computedValue === "as-specified") {
    return specifiedValue;
  } else if (computedValue === "length") {
    return resolveLength(specifiedValue, element);
  } else if (computedValue === "computed-color") {
    let value = asciiLowercase(specifiedValue);
    // https://drafts.csswg.org/css-color-4/#resolving-other-colors
    if (specifiedValue === "currentcolor") {
      if (property === "color") {
        if (element.parentElement !== null) {
          return getComputedValue(element.parentElement, "color");
        }
        value = initial;
      } else {
        return getComputedValue(element, "color");
      }
    }
    if (systemColors.has(value) || deprecatedAliases.has(value)) {
      let key = value;
      if (deprecatedAliases.has(value)) {
        key = deprecatedAliases.get(value);
      }
      const { light, dark } = systemColors.get(key);
      const colorScheme = getCascadedPropertyValue(element, "color-scheme");
      if (colorScheme === "dark") {
        return dark;
      }
      return light;
    }
    return getComputedOrUsedColor(specifiedValue);
  }

  throw new TypeError(`Internal error: unrecognized computed value instruction '${computedValue}'`);
}

// https://drafts.csswg.org/cssom/#resolved-value
// Only implements the properties that are defined in propertiesWithResolvedValueImplemented.
function getResolvedValue(element, property) {
  // We can always use the computed value with the current set of propertiesWithResolvedValueImplemented:
  // * Color properties end up with the used value, but we don't implement any actual differences between used and
  //   computed that https://drafts.csswg.org/css-cascade-5/#used-value gestures at.
  // * The other properties fall back to the "any other property: The resolved value is the computed value." case.
  return getComputedValue(element, property);
}

function invalidateStyleCache(elementImpl) {
  if (elementImpl._attached) {
    elementImpl._ownerDocument._styleCache = new WeakMap();
  }
}

module.exports = {
  SHADOW_DOM_PSEUDO_REGEXP: /^::(?:part|slotted)\(/i,
  getComputedStyleDeclaration,
  invalidateStyleCache
};
