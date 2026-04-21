"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Specificity = require("@bramus/specificity").default;
const CSSImportRule = require("../../../../generated/idl/CSSImportRule.js");
const CSSLayerBlockRule = require("../../../../generated/idl/CSSLayerBlockRule.js");
const CSSLayerStatementRule = require("../../../../generated/idl/CSSLayerStatementRule.js");
const CSSMediaRule = require("../../../../generated/idl/CSSMediaRule.js");
const CSSStyleProperties = require("../../../../generated/idl/CSSStyleProperties.js");
const CSSStyleRule = require("../../../../generated/idl/CSSStyleRule.js");
const { asciiLowercase } = require("../../helpers/strings");
const { evaluateMediaList } = require("../MediaList-impl.js");
const { parseStyleSheet } = require("./css-parser");
const { isGlobalKeyword } = require("./css-values");
const { systemColors } = require("./system-colors");

const defaultStyleSheet = fs.readFileSync(
  path.resolve(__dirname, "../../../browser/default-stylesheet.css"),
  { encoding: "utf-8" }
);
let parsedDefaultStyleSheet;

function getComputedStyleDeclaration(elementImpl) {
  const styleCache = elementImpl._ownerDocument._styleCache;
  const cachedDeclaration = styleCache.get(elementImpl);
  if (cachedDeclaration) {
    const clonedDeclaration = CSSStyleProperties.createImpl(elementImpl._globalObject, [], {
      computed: true,
      ownerNode: elementImpl
    });

    for (let i = 0; i < cachedDeclaration.length; i++) {
      const property = cachedDeclaration.item(i);
      const value = cachedDeclaration.getPropertyValue(property);
      const priority = cachedDeclaration.getPropertyPriority(property);
      clonedDeclaration.setProperty(property, value, priority);
    }
    clonedDeclaration._readonly = true;

    return clonedDeclaration;
  }

  const declaration = prepareComputedStyleDeclaration(elementImpl, styleCache);
  declaration._readonly = true;

  return declaration;
}

function prepareComputedStyleDeclaration(elementImpl, styleCache) {
  const { style } = elementImpl;
  const declaration = CSSStyleProperties.createImpl(elementImpl._globalObject, [], {
    computed: true,
    ownerNode: elementImpl
  });

  applyStyleSheetRules(elementImpl, declaration);

  for (let i = 0; i < style.length; i++) {
    handlePropertyForInlineStyle(style.item(i), declaration, style);
  }

  styleCache.set(elementImpl, declaration);

  return declaration;
}

function applyStyleSheetRules(elementImpl, declaration) {
  if (!parsedDefaultStyleSheet) {
    // The parsed default stylesheet will be composed of CSSOM objects from the first global object accessed. This is a
    // bit strange, but since we only ever access the internals of `parsedDefaultStyleSheet`, and don't expose it to
    // callers, it shouldn't cause any issues.
    parsedDefaultStyleSheet = parseStyleSheet(defaultStyleSheet, elementImpl._globalObject);
  }

  // Build a global layer tree across all stylesheets before processing any rules.
  // Per the spec, layer priority is determined by the order of first occurrence across all sheets in the origin.
  // Anonymous layers are tracked in anonLayers keyed by their CSSLayerBlockRule impl object.
  const layerRoot = { children: new Map() };
  const anonLayers = new WeakMap();
  buildLayerTree(parsedDefaultStyleSheet.cssRules._list, layerRoot, anonLayers);
  for (const sheetImpl of elementImpl._ownerDocument.styleSheets._list) {
    buildLayerTree(sheetImpl.cssRules._list, layerRoot, anonLayers);
  }

  // winningDecls tracks the metadata of the declaration that currently wins each property.
  const winningDecls = new Map();
  const sourceOrder = { count: 0 };
  handleSheet(parsedDefaultStyleSheet, elementImpl, declaration, winningDecls, layerRoot, anonLayers, sourceOrder);
  for (const sheetImpl of elementImpl._ownerDocument.styleSheets._list) {
    handleSheet(sheetImpl, elementImpl, declaration, winningDecls, layerRoot, anonLayers, sourceOrder);
  }
}

// Navigates the layer tree from parentNode following each dot-separated segment of qualifiedName,
// creating nodes on first encounter. Returns the final node.
function navigateLayerPath(parentNode, qualifiedName) {
  let node = parentNode;
  for (const part of qualifiedName.split(".")) {
    if (!node.children.has(part)) {
      node.children.set(part, { index: node.children.size, children: new Map() });
    }
    node = node.children.get(part);
  }
  return node;
}

// Builds the layer tree from a rule list, establishing the order of first occurrence at each nesting level.
// Anonymous @layer blocks are tracked in anonLayers keyed by their rule impl.
function buildLayerTree(ruleList, parentNode, anonLayers) {
  for (const ruleImpl of ruleList) {
    if (CSSLayerStatementRule.isImpl(ruleImpl)) {
      for (const qualifiedName of ruleImpl.nameList) {
        navigateLayerPath(parentNode, qualifiedName);
      }
    } else if (CSSLayerBlockRule.isImpl(ruleImpl)) {
      const { name } = ruleImpl;
      if (name) {
        buildLayerTree(ruleImpl.cssRules._list, navigateLayerPath(parentNode, name), anonLayers);
      } else {
        const childNode = { index: parentNode.children.size, children: new Map() };
        parentNode.children.set(Symbol("anon"), childNode);
        anonLayers.set(ruleImpl, childNode);
        buildLayerTree(ruleImpl.cssRules._list, childNode, anonLayers);
      }
    } else if (CSSMediaRule.isImpl(ruleImpl)) {
      buildLayerTree(ruleImpl.cssRules._list, parentNode, anonLayers);
    } else if (CSSImportRule.isImpl(ruleImpl) && ruleImpl.styleSheet !== null) {
      buildLayerTree(ruleImpl.styleSheet.cssRules._list, parentNode, anonLayers);
    }
  }
}

function handleSheet(sheetImpl, elementImpl, declaration, winningDecls, layerRoot, anonLayers, sourceOrder) {
  handleRuleList(sheetImpl.cssRules._list, elementImpl, declaration, winningDecls, sourceOrder, layerRoot, [], anonLayers);
}

// currentNode: the layer tree node for the current nesting level.
// currentPath: the path of child indices from the root to currentNode ([] = globally unlayered).
// Layer paths are compared element-by-element, treating missing elements as Infinity (unlayered at that level).
// This means: direct rules in a layer beat any sublayer of that layer, and globally unlayered beats all layers.
function handleRuleList(rules, elementImpl, declaration, winningDecls, sourceOrder, currentNode, currentPath, anonLayers) {
  for (const ruleImpl of rules) {
    if (CSSImportRule.isImpl(ruleImpl)) {
      if (ruleImpl.styleSheet !== null && evaluateMediaList(ruleImpl.media._list)) {
        handleRuleList(ruleImpl.styleSheet.cssRules._list, elementImpl, declaration, winningDecls, sourceOrder, currentNode, currentPath, anonLayers);
      }
    } else if (CSSMediaRule.isImpl(ruleImpl)) {
      if (evaluateMediaList(ruleImpl.media._list)) {
        handleRuleList(ruleImpl.cssRules._list, elementImpl, declaration, winningDecls, sourceOrder, currentNode, currentPath, anonLayers);
      }
    } else if (CSSLayerBlockRule.isImpl(ruleImpl)) {
      const { name } = ruleImpl;
      if (name) {
        let childNode = currentNode;
        const childPath = [...currentPath];
        for (const part of name.split(".")) {
          childNode = childNode.children.get(part);
          if (!childNode) break;
          childPath.push(childNode.index);
        }
        if (childNode) {
          handleRuleList(ruleImpl.cssRules._list, elementImpl, declaration, winningDecls, sourceOrder, childNode, childPath, anonLayers);
        }
      } else {
        const childNode = anonLayers.get(ruleImpl);
        if (childNode) {
          handleRuleList(ruleImpl.cssRules._list, elementImpl, declaration, winningDecls, sourceOrder, childNode, [...currentPath, childNode.index], anonLayers);
        }
      }
    } else if (CSSLayerStatementRule.isImpl(ruleImpl)) {
      // Statement rules only declare layer order; handled in buildLayerTree.
    } else if (CSSStyleRule.isImpl(ruleImpl)) {
      handleRule(ruleImpl, elementImpl, declaration, winningDecls, sourceOrder, currentPath);
    }
  }
}

function handleRule(ruleImpl, elementImpl, declaration, winningDecls, sourceOrder, layerPath) {
  const { ast, match } = matches(ruleImpl.selectorText, elementImpl);
  if (match) {
    handleStyle(ruleImpl.style, declaration, winningDecls, ast, layerPath, sourceOrder);
  }
}

function handleStyle(style, declaration, winningDecls, ast, layerPath, sourceOrder) {
  for (let i = 0; i < style.length; i++) {
    const property = style.item(i);
    handleProperty(property, declaration, style, winningDecls, ast, layerPath, sourceOrder);
  }
}

// Compares two layer paths element-by-element, treating a missing element as Infinity (unlayered at that depth).
// Returns negative if a < b, positive if a > b, 0 if equal.
function compareLayerPaths(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = i < a.length ? a[i] : Infinity;
    const bi = i < b.length ? b[i] : Infinity;
    if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

// Returns true if `candidate` should replace `current` as the winning declaration.
// Implements CSS Cascade 5 ordering: importance → layer priority → specificity → source order.
// For normal declarations: higher path wins (unlayered [] beats everything; later sibling beats earlier).
// For !important declarations: lower path wins (first-declared layer beats later layers; layers beat unlayered).
function wins(candidate, current) {
  if (candidate.isImportant !== current.isImportant) {
    return candidate.isImportant;
  }

  const pathComp = compareLayerPaths(candidate.layerPath, current.layerPath);
  if (pathComp !== 0) {
    return candidate.isImportant ? pathComp < 0 : pathComp > 0;
  }

  const specComp = Specificity.compare(candidate.specificity, current.specificity);
  if (specComp !== 0) {
    return specComp > 0;
  }

  return candidate.order > current.order;
}

function layerPathsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function handleProperty(property, declaration, style, winningDecls, ast, layerPath, sourceOrder) {
  const value = style.getPropertyValue(property);
  const isImportant = style.getPropertyPriority(property) === "important";
  const { value: specificity } = Specificity.max(...Specificity.calculate(ast));
  const order = sourceOrder.count++;

  const candidate = { specificity, layerPath, isImportant, order };
  const current = winningDecls.get(property);

  if (!current || wins(candidate, current)) {
    // When the winning layer changes, save the current declaration value as the "previous layer" value
    // so that revert-layer can roll back to it.
    if (!current) {
      candidate.prevLayerValue = "";
      candidate.prevLayerPriority = "";
    } else if (!layerPathsEqual(current.layerPath, layerPath)) {
      candidate.prevLayerValue = declaration.getPropertyValue(property);
      candidate.prevLayerPriority = declaration.getPropertyPriority(property);
    } else {
      candidate.prevLayerValue = current.prevLayerValue;
      candidate.prevLayerPriority = current.prevLayerPriority;
    }

    winningDecls.set(property, candidate);

    let resolvedValue = value;
    let resolvedPriority = isImportant ? "important" : "";
    if (value === "revert-layer") {
      resolvedValue = candidate.prevLayerValue;
      resolvedPriority = candidate.prevLayerPriority;
    }

    declaration.setProperty(property, resolvedValue, resolvedPriority);
  }
}

function handlePropertyForInlineStyle(property, declaration, style) {
  const value = style.getPropertyValue(property);
  const priority = style.getPropertyPriority(property);
  if (!declaration.getPropertyPriority(property) || priority) {
    declaration.setProperty(property, value, priority);
  }
}

function matches(selectorText, elementImpl) {
  const domSelector = elementImpl._ownerDocument._getDOMSelector();
  const { ast, match, pseudoElement } = domSelector.check(selectorText, elementImpl);
  // `pseudoElement` is a pseudo-element selector (e.g. `::before`).
  // However, we do not support getComputedStyle(element, pseudoElement), so `match` is set to `false`.
  if (pseudoElement) {
    return {
      match: false
    };
  }
  return { ast, match, pseudoElement };
}

function replaceEmptyValueAndKeywords(property, value, elementImpl, { inherit, initial, isColor, longhands }) {
  if (value === "") {
    if (longhands) {
      return "";
    } else if (!inherit || !elementImpl.parentElement) {
      return initial;
    }
    value = getInheritedPropertyValue(property, elementImpl, { inherit, initial, isColor });
  }

  if (isGlobalKeyword(value)) {
    value = replaceGlobalKeywords(property, value, elementImpl, { inherit, initial, isColor });
  }

  return value;
}

function getInheritedPropertyValue(property, elementImpl, { inherit, initial, isColor }) {
  const styleCache = elementImpl._ownerDocument._styleCache;
  const { parentElement } = elementImpl;
  if (!parentElement) {
    return initial;
  }

  let parent = parentElement;
  while (parent) {
    let declaration;
    if (styleCache.has(parent)) {
      declaration = styleCache.get(parent);
    } else {
      declaration = prepareComputedStyleDeclaration(parent, styleCache);
    }
    // For color-related properties, unset the _computed flag to retrieve the specified value.
    // @asamuzakjp/css-color handles the resolution of the specified value.
    if (isColor) {
      declaration._computed = false;
    }
    let value = declaration.getPropertyValue(property);
    if (isColor) {
      // Restore the _computed flag.
      declaration._computed = true;
      // If the value is a system color value, retrieve it again as a computed value.
      if (value && systemColors.has(asciiLowercase(value))) {
        value = declaration.getPropertyValue(property);
      }
    }
    if (value) {
      if (isColor && isGlobalKeyword(value)) {
        return replaceGlobalKeywords(property, value, parent, { inherit, initial, isColor });
      }
      return value;
    } else if (!parent.parentElement || !inherit) {
      break;
    }
    parent = parent.parentElement;
  }

  return initial;
}

function replaceGlobalKeywords(property, value, elementImpl, { inherit, initial, isColor }) {
  let element = elementImpl;
  while (element) {
    switch (value) {
      case "initial": {
        return initial;
      }
      case "inherit": {
        if (!element.parentElement) {
          return initial;
        }
        value = getInheritedPropertyValue(property, element, { inherit, initial, isColor });
        break;
      }
      case "unset": {
        if (!inherit || !element.parentElement) {
          return initial;
        }
        value = getInheritedPropertyValue(property, element, { inherit, initial, isColor });
        break;
      }
      case "revert-layer": {
        // revert-layer is resolved eagerly in handleProperty; if it reaches here it means
        // there was no lower-priority layer, so treat it as unset.
        if (!inherit || !element.parentElement) {
          return initial;
        }
        value = getInheritedPropertyValue(property, element, { inherit, initial, isColor });
        break;
      }
      case "revert": {
        // Roll back to the user-agent origin value: re-run the cascade with only the UA stylesheet.
        const uaValue = computeUAValue(property, element, { isColor });
        if (uaValue) {
          if (isGlobalKeyword(uaValue)) {
            return replaceGlobalKeywords(property, uaValue, element, { inherit, initial, isColor });
          }
          return uaValue;
        }
        // No UA value — behave like unset.
        if (!inherit || !element.parentElement) {
          return initial;
        }
        value = getInheritedPropertyValue(property, element, { inherit, initial, isColor });
        break;
      }
      default: {
        // fall through; value is not a CSS-wide keyword.
      }
    }
    if (element.parentElement) {
      if (!value) {
        element = element.parentElement;
      } else if (isGlobalKeyword(value)) {
        return replaceGlobalKeywords(property, value, element, { inherit, initial, isColor });
      } else {
        return value;
      }
    } else {
      return initial;
    }
  }

  return value;
}

// Returns the value this property would have if only the UA default stylesheet applied.
// Used to resolve the `revert` keyword.
function computeUAValue(property, elementImpl, { isColor }) {
  const layerRoot = { children: new Map() };
  const anonLayers = new WeakMap();
  buildLayerTree(parsedDefaultStyleSheet.cssRules._list, layerRoot, anonLayers);

  const uaDecl = CSSStyleProperties.createImpl(elementImpl._globalObject, [], {
    computed: true,
    ownerNode: elementImpl
  });
  const winningDecls = new Map();
  const sourceOrder = { count: 0 };
  handleSheet(parsedDefaultStyleSheet, elementImpl, uaDecl, winningDecls, layerRoot, anonLayers, sourceOrder);

  if (isColor) {
    uaDecl._computed = false;
  }
  let value = uaDecl.getPropertyValue(property);
  if (isColor) {
    uaDecl._computed = true;
    if (value && systemColors.has(asciiLowercase(value))) {
      value = uaDecl.getPropertyValue(property);
    }
  }
  return value;
}

function invalidateStyleCache(elementImpl) {
  if (elementImpl._attached) {
    elementImpl._ownerDocument._styleCache = new WeakMap();
  }
}

exports.SHADOW_DOM_PSEUDO_REGEXP = /^::(?:part|slotted)\(/i;
exports.getComputedStyleDeclaration = getComputedStyleDeclaration;
exports.getInheritedPropertyValue = getInheritedPropertyValue;
exports.invalidateStyleCache = invalidateStyleCache;
exports.replaceEmptyValueAndKeywords = replaceEmptyValueAndKeywords;
