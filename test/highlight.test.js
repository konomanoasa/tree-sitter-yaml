import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  createTreeSitter,
  grammars,
  packageName,
  root,
} from "../scripts/tree-sitter.js";

const commandTimeoutMs = 60_000;
const firstCaptureColor = 17;
const newlineByte = 0x0a;

function decodeEntities(text) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function renderedCaptures(html, source) {
  const start = html.indexOf("<pre><code>");
  const end = html.indexOf("</code></pre>");
  assert.ok(start >= 0 && end >= start, html);
  const content = html.slice(start + "<pre><code>".length, end);
  const stack = [];
  const captures = [];
  let text = "";
  for (const part of content.matchAll(
    /<span class='([^']*)'>|<[/]span>|([^<]+)/g,
  )) {
    if (part[1] !== undefined) stack.push(part[1].replaceAll(" ", "."));
    else if (part[0] === "</span>") assert.notEqual(stack.pop(), undefined);
    else {
      const decoded = decodeEntities(part[2]);
      text += decoded;
      captures.push(
        ...Array(Buffer.byteLength(decoded)).fill(stack.at(-1) ?? ""),
      );
    }
  }
  assert.equal(stack.length, 0, "unclosed highlight span");
  assert.equal(
    text.replace(/\n$/, ""),
    source.replace(/\n$/, ""),
    "rendered source differs from the input",
  );
  return captures;
}

function createHighlighter({ directory, root, run, captureNames }) {
  const parserDirectory = join(directory, "parsers");
  mkdirSync(parserDirectory);
  symlinkSync(root, join(parserDirectory, "tree-sitter-test"), "junction");
  const configPath = join(directory, "highlight.json");
  const capturePath = join(directory, "captures.txt");
  writeFileSync(
    configPath,
    JSON.stringify({
      "parser-directories": [parserDirectory],
      theme: Object.fromEntries(
        captureNames.map((name, index) => [name, index + firstCaptureColor]),
      ),
    }),
  );
  writeFileSync(capturePath, `${captureNames.join("\n")}\n`);

  return (scope, source) => {
    const path = join(directory, "highlight.txt");
    writeFileSync(path, source);
    const captures = renderedCaptures(
      run([
        "highlight",
        "--check",
        "--captures-path",
        capturePath,
        "--config-path",
        configPath,
        "--html",
        "--layout",
        "fragment",
        "--style",
        "classes",
        "--scope",
        scope,
        path,
      ]),
      source,
    );
    for (const capture of captures) {
      assert.ok(
        capture === "" || captureNames.includes(capture),
        `unexpected final capture: ${capture}`,
      );
    }
    return captures;
  };
}

function assertCaptures(source, actual, ranges) {
  const bytes = Buffer.from(source);
  const expected = Array(bytes.length).fill("");
  let previousEnd = 0;
  for (const [start, end, capture] of ranges) {
    assert.ok(
      Number.isSafeInteger(start) && start >= previousEnd,
      "expected ranges must be ordered and disjoint",
    );
    assert.ok(
      Number.isSafeInteger(end) && end > start && end <= bytes.length,
      "expected range exceeds source bytes",
    );
    expected.fill(capture, start, end);
    previousEnd = end;
  }
  for (const [index, byte] of bytes.entries()) {
    if (byte !== newlineByte)
      assert.equal(
        actual[index],
        expected[index],
        `byte ${index} in ${JSON.stringify(source)}`,
      );
  }
}

const captureNames = [
  "comment",
  "keyword.directive",
  "label",
  "number",
  "property",
  "punctuation.bracket",
  "punctuation.delimiter",
  "punctuation.special",
  "string",
  "string.escape",
  "type",
];
let highlight;

let directory;
let runner;
before(() => {
  directory = mkdtempSync(join(tmpdir(), `${packageName}-highlight-`));
  runner = createTreeSitter();
  highlight = createHighlighter({
    directory,
    root,
    run: assertCommand,
    captureNames,
  });
});
after(() => {
  try {
    runner?.close();
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function assertCommand(arguments_) {
  const result = runner.run(arguments_, {
    timeout: commandTimeoutMs,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /Non-standard highlight captures/);
  return result.stdout;
}

const grammar = grammars[0];

const finalCaptureCases = [
  {
    name: "Quoted values and following keys keep distinct captures",
    source: 'name: "foo"\nnext: value',
    captures: [
      [0, 4, "property"],
      [4, 5, "punctuation.delimiter"],
      [6, 11, "string"],
      [12, 16, "property"],
      [16, 17, "punctuation.delimiter"],
      [18, 23, "string"],
    ],
  },
  {
    name: "A line continuation colors its escape while preserving the body text",
    source: '"a\\\n b"',
    captures: [
      [0, 2, "string"],
      [2, 3, "string.escape"],
      [5, 7, "string"],
    ],
  },
  {
    name: "Quoted non-C0 characters keep string and key captures",
    source: "\"a\u007fb\": 'a\u009fb'",
    captures: [
      [0, 1, "string"],
      [1, 4, "property"],
      [4, 5, "string"],
      [5, 6, "punctuation.delimiter"],
      [7, 13, "string"],
    ],
  },
  {
    name: "A colon-prefixed key after a collection keeps the property capture",
    source: "{[], :name}",
    captures: [
      [0, 3, "punctuation.bracket"],
      [3, 4, "punctuation.delimiter"],
      [5, 10, "property"],
      [10, 11, "punctuation.bracket"],
    ],
  },
  {
    name: "An escaped literal tab uses the normal escape capture",
    source: '"\\\t"',
    captures: [
      [0, 1, "string"],
      [1, 3, "string.escape"],
      [3, 4, "string"],
    ],
  },
  {
    name: "A colon-prefixed property-bearing key keeps its scalar capture",
    source: "{!tag :plain}",
    captures: [
      [0, 1, "punctuation.bracket"],
      [1, 2, "punctuation.delimiter"],
      [2, 5, "type"],
      [6, 12, "property"],
      [12, 13, "punctuation.bracket"],
    ],
  },
  {
    name: "An adjacent quoted flow key colors only its text as a property",
    source: '{"a":[b]}',
    captures: [
      [0, 1, "punctuation.bracket"],
      [1, 2, "string"],
      [2, 3, "property"],
      [3, 4, "string"],
      [4, 5, "punctuation.delimiter"],
      [5, 6, "punctuation.bracket"],
      [6, 7, "string"],
      [7, 9, "punctuation.bracket"],
    ],
  },
  {
    name: "Plain values keep their syntax regardless of schema-like spelling",
    source: "# c\nkey: true\nn: 123",
    captures: [
      [0, 3, "comment"],
      [4, 7, "property"],
      [7, 8, "punctuation.delimiter"],
      [9, 13, "string"],
      [14, 15, "property"],
      [15, 16, "punctuation.delimiter"],
      [17, 20, "string"],
    ],
  },
  {
    name: "Properties and escapes color only their own leaves",
    source: '&a !h!x%20y "v\\n"',
    captures: [
      [0, 1, "punctuation.delimiter"],
      [1, 2, "label"],
      [3, 4, "punctuation.delimiter"],
      [4, 5, "type"],
      [5, 6, "punctuation.delimiter"],
      [6, 7, "type"],
      [7, 10, "string.escape"],
      [10, 11, "type"],
      [12, 14, "string"],
      [14, 16, "string.escape"],
      [16, 17, "string"],
    ],
  },
  {
    name: "Anchors, aliases, and verbatim tags color their own leaves",
    source: "[&a, *a, !<x%20>]",
    captures: [
      [0, 1, "punctuation.bracket"],
      [1, 2, "punctuation.delimiter"],
      [2, 3, "label"],
      [3, 4, "punctuation.delimiter"],
      [5, 6, "punctuation.delimiter"],
      [6, 7, "label"],
      [7, 8, "punctuation.delimiter"],
      [9, 11, "punctuation.delimiter"],
      [11, 12, "type"],
      [12, 15, "string.escape"],
      [15, 16, "punctuation.delimiter"],
      [16, 17, "punctuation.bracket"],
    ],
  },
  {
    name: "Block content keeps a hash as scalar text",
    source: "key: |2-\n  # text\n",
    captures: [
      [0, 3, "property"],
      [3, 4, "punctuation.delimiter"],
      [5, 6, "punctuation.special"],
      [6, 7, "number"],
      [7, 8, "punctuation.special"],
      [11, 17, "string"],
    ],
  },
  {
    name: "Directives and document markers retain their own classifications",
    source: "%YAML 1.2\n%TAG !h! tag:x%20y\n--- !h!x value\n...",
    captures: [
      [0, 5, "keyword.directive"],
      [6, 9, "number"],
      [10, 14, "keyword.directive"],
      [15, 16, "punctuation.delimiter"],
      [16, 17, "type"],
      [17, 18, "punctuation.delimiter"],
      [19, 24, "type"],
      [24, 27, "string.escape"],
      [27, 28, "type"],
      [29, 32, "punctuation.special"],
      [33, 34, "punctuation.delimiter"],
      [34, 35, "type"],
      [35, 36, "punctuation.delimiter"],
      [36, 37, "type"],
      [38, 43, "string"],
      [44, 47, "punctuation.special"],
    ],
  },
  {
    name: "A property-bearing quoted key overrides text but keeps its quotes and escape",
    source: '&a "key\\t": value',
    captures: [
      [0, 1, "punctuation.delimiter"],
      [1, 2, "label"],
      [3, 4, "string"],
      [4, 7, "property"],
      [7, 9, "string.escape"],
      [9, 10, "string"],
      [10, 11, "punctuation.delimiter"],
      [12, 17, "string"],
    ],
  },
  {
    name: "A collection key does not turn its elements into property names",
    source: "? [a, b]\n: c",
    captures: [
      [0, 1, "punctuation.delimiter"],
      [2, 3, "punctuation.bracket"],
      [3, 4, "string"],
      [4, 5, "punctuation.delimiter"],
      [6, 7, "string"],
      [7, 8, "punctuation.bracket"],
      [9, 10, "punctuation.delimiter"],
      [11, 12, "string"],
    ],
  },
  {
    name: "Block scalar keys color their body text as property names",
    source: "? |\n  a\n   b\n: c\n? &x >-\n  d\n: e",
    captures: [
      [0, 1, "punctuation.delimiter"],
      [2, 3, "punctuation.special"],
      [6, 7, "property"],
      [10, 12, "property"],
      [13, 14, "punctuation.delimiter"],
      [15, 16, "string"],
      [17, 18, "punctuation.delimiter"],
      [19, 20, "punctuation.delimiter"],
      [20, 21, "label"],
      [22, 24, "punctuation.special"],
      [27, 28, "property"],
      [29, 30, "punctuation.delimiter"],
      [31, 32, "string"],
    ],
  },
  {
    name: "A leading BOM and Unicode key preserve byte coverage",
    source: "\ufeff名前: 値",
    captures: [
      [3, 9, "property"],
      [9, 10, "punctuation.delimiter"],
      [11, 14, "string"],
    ],
  },
];

for (const { name, source, captures } of finalCaptureCases) {
  test(`yaml: ${name}`, () => {
    const actual = highlight(grammar.scope, source);
    assertCaptures(source, actual, captures);
  });
}
