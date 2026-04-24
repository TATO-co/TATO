#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const scanRoots = ['app', 'components'];
const rawSystemOutputPattern = /\b(table|schema|undefined|null|ECONNREFUSED|failed to fetch|does not exist)\b/i;

const ruleMessages = {
  proseData: 'Prose data pattern detected. Use ListRow inside ListSection instead.',
  cardPerDatum: 'Possible card-per-datum. Use ListRow inside ListSection unless content is genuinely complex.',
  rawSystemOutput: 'Raw system output in UI. Wrap in SectionErrorBoundary and show user-safe message.',
  actionHierarchy: 'Flat action hierarchy. Apply PRIMARY / SECONDARY / TERTIARY button tiers.',
  currencyColor: 'Negative value using success color. Use CurrencyDisplay component or apply error color.',
};

function listTsxFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'dist') {
        continue;
      }

      files.push(...listTsxFiles(path));
      continue;
    }

    if (entry.endsWith('.tsx')) {
      files.push(path);
    }
  }

  return files;
}

function getTagName(tagName) {
  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }

  if (ts.isPropertyAccessExpression(tagName)) {
    return tagName.name.text;
  }

  return undefined;
}

function getAttribute(openingElement, name) {
  return openingElement.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === name,
  );
}

function initializerText(attribute, sourceFile) {
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) {
    return '';
  }

  return attribute.initializer.getText(sourceFile);
}

function jsxTextValue(node) {
  if (ts.isJsxText(node)) {
    return node.getText().replace(/\s+/g, ' ').trim();
  }

  if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text.replace(/\s+/g, ' ').trim();
  }

  return '';
}

function hasCardLikeStyling(openingElement, sourceFile) {
  const className = initializerText(getAttribute(openingElement, 'className'), sourceFile);
  const style = initializerText(getAttribute(openingElement, 'style'), sourceFile);
  const stylingText = `${className} ${style}`;

  const hasBackground =
    /\bbg-[^\s"`'}]+/.test(className) ||
    /backgroundColor\s*:/.test(style);
  const hasRadius =
    /\brounded(?:-|$|\[)/.test(className) ||
    /borderRadius\s*:/.test(style);
  const hasPadding =
    /\b(?:p|px|py|pt|pb|pl|pr)-/.test(className) ||
    /padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?\s*:/.test(style);

  return hasBackground && hasRadius && hasPadding && stylingText.length > 0;
}

function directMeaningfulChildren(children) {
  return children.filter((child) => {
    if (ts.isJsxText(child) && child.getText().trim() === '') {
      return false;
    }

    if (ts.isJsxExpression(child) && !child.expression) {
      return false;
    }

    return true;
  });
}

function textChildProfile(child, sourceFile) {
  if (!ts.isJsxElement(child) || getTagName(child.openingElement.tagName) !== 'Text') {
    return null;
  }

  const className = initializerText(getAttribute(child.openingElement, 'className'), sourceFile);
  const style = initializerText(getAttribute(child.openingElement, 'style'), sourceFile);
  const text = child.children.map(jsxTextValue).filter(Boolean).join(' ');

  return { className, style, text, styleText: `${className} ${style}` };
}

function hasLabelValueTextChildren(children, sourceFile) {
  const meaningfulChildren = directMeaningfulChildren(children);
  if (meaningfulChildren.length !== 2) {
    return false;
  }

  const [labelProfile, valueProfile] = meaningfulChildren.map((child) => textChildProfile(child, sourceFile));
  if (!labelProfile || !valueProfile) {
    return false;
  }

  const labelLooksLikeLabel =
    /uppercase|tracking|font-mono|textTransform\s*:\s*['"]uppercase/.test(labelProfile.styleText) ||
    /^[A-Z0-9\s&/+.-]{2,32}$/.test(labelProfile.text);
  const literalValueIsBodyCopy =
    valueProfile.text.length > 48 &&
    /[.!?]$/.test(valueProfile.text) &&
    valueProfile.text.split(/\s+/).length > 6;
  const valueLooksLikeDatum =
    !literalValueIsBodyCopy &&
    (
      /font-(?:bold|semibold|medium)|font-sans-bold|text-(?:2xl|3xl|4xl)|text-\[(?:2|3|4)/.test(valueProfile.styleText) ||
      (valueProfile.text.length > 0 && valueProfile.text.length <= 48 && !/[.!?]$/.test(valueProfile.text))
    );

  return labelLooksLikeLabel && valueLooksLikeDatum;
}

function warningForNode(sourceFile, filePath, node, rule) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: relative(repoRoot, filePath),
    line: position.line + 1,
    rule,
  };
}

function inspectTextNode(filePath, sourceFile, node) {
  const warnings = [];
  const tagName = getTagName(node.openingElement.tagName);
  if (tagName !== 'Text') {
    return warnings;
  }

  const childText = node.children.map(jsxTextValue).filter(Boolean).join(' ');
  const className = initializerText(getAttribute(node.openingElement, 'className'), sourceFile);
  const style = initializerText(getAttribute(node.openingElement, 'style'), sourceFile);
  const styleText = `${className} ${style}`;

  if (/^[A-Z][a-zA-Z\s]+: .+\.$/.test(childText)) {
    warnings.push(warningForNode(sourceFile, filePath, node, 'proseData'));
  }

  if (rawSystemOutputPattern.test(childText)) {
    warnings.push(warningForNode(sourceFile, filePath, node, 'rawSystemOutput'));
  }

  if (/(-\$|-?\d+\.\d{2})/.test(childText) && /text-tato-profit|COLORS\.profit|#1ec995|green/.test(styleText)) {
    warnings.push(warningForNode(sourceFile, filePath, node, 'currencyColor'));
  }

  return warnings;
}

function inspectActionGroup(filePath, sourceFile, node) {
  const children = directMeaningfulChildren(node.children).filter((child) => {
    return ts.isJsxElement(child)
      && ['Pressable', 'TouchableOpacity'].includes(getTagName(child.openingElement.tagName) ?? '');
  });

  if (children.length < 2) {
    return [];
  }

  const styleKeys = children.map((child) => {
    const className = initializerText(getAttribute(child.openingElement, 'className'), sourceFile);
    const style = initializerText(getAttribute(child.openingElement, 'style'), sourceFile);
    return `${className} ${style}`;
  });

  if (styleKeys.every((key) => key && key === styleKeys[0])) {
    return [warningForNode(sourceFile, filePath, node, 'actionHierarchy')];
  }

  return [];
}

function inspectFile(filePath) {
  if (filePath.includes(`${join('components', 'primitives')}`)) {
    return [];
  }

  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const warnings = [];

  function visit(node) {
    if (ts.isJsxElement(node)) {
      const tagName = getTagName(node.openingElement.tagName);

      warnings.push(...inspectTextNode(filePath, sourceFile, node));

      if (
        (tagName === 'View' || tagName === 'Pressable') &&
        hasCardLikeStyling(node.openingElement, sourceFile) &&
        hasLabelValueTextChildren(node.children, sourceFile)
      ) {
        warnings.push(warningForNode(sourceFile, filePath, node, 'cardPerDatum'));
      }

      if (tagName === 'View') {
        warnings.push(...inspectActionGroup(filePath, sourceFile, node));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return warnings;
}

const files = scanRoots.flatMap((root) => listTsxFiles(join(repoRoot, root)));
const warnings = files.flatMap(inspectFile);

for (const warning of warnings) {
  console.warn(`${warning.file}:${warning.line} - ${ruleMessages[warning.rule]}`);
}

if (warnings.length) {
  console.warn(`\nUI primitive lint completed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
} else {
  console.log('UI primitive lint passed with no warnings.');
}
