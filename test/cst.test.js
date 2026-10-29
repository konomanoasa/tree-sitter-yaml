import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { root } from "../scripts/tree-sitter.js";
import { hasError, parseCst } from "./support/cst.js";
import { parse } from "./support/parser.js";

function parseCorpus(text) {
  const sections = text.split("==================\n");
  assert.equal(sections.shift(), "", "corpus must begin with a header");
  assert.equal(sections.length % 2, 0, "corpus headers must be paired");
  const cases = [];
  for (let index = 0; index < sections.length; index += 2) {
    const [name, ...attributes] = sections[index].trimEnd().split("\n");
    assert.ok(name, "corpus case must have a name");
    for (const attribute of attributes) {
      assert.ok(
        [":cst", ":error"].includes(attribute),
        `unsupported corpus attribute: ${attribute}`,
      );
    }
    const parts = sections[index + 1].split("\n------------------\n");
    assert.equal(parts.length, 2, `${name}: expected one output separator`);
    const source = parts[0].endsWith("\r") ? parts[0].slice(0, -1) : parts[0];
    cases.push({ name, source });
  }
  return cases;
}

const corpusDirectory = join(root, "test/corpus");
for (const file of readdirSync(corpusDirectory).sort()) {
  assert.ok(file.endsWith(".txt"), `unexpected corpus entry: ${file}`);
  const entries = parseCorpus(
    readFileSync(join(corpusDirectory, file), "utf8"),
  );
  for (const { name, source } of entries) {
    test(`yaml: corpus source coverage and fresh determinism: ${file}: ${name}`, () => {
      const nodes = parse(source);
      assert.deepEqual(parse(source), nodes);
    });
  }
}

test("corpus inputs retain document markers, BOM, NUL, whitespace and line endings", () => {
  const text = [
    "==================\nEmpty\n==================\n\n------------------\n(stream)\n\n",
    "==================\nLayout\n:cst\n==================\n",
    "\uFEFF \t\v\f\r\n---\na\n...\n\n\n------------------\nignored output\n\n",
    "==================\nNUL\n:cst\n==================\n",
    "a\0b\n------------------\nignored output\n\n",
    "==================\nFinal CR\n:cst\n==================\n",
    "a: b\r\r\n------------------\nignored output\n",
  ].join("");
  assert.deepEqual(parseCorpus(text), [
    { name: "Empty", source: "" },
    { name: "Layout", source: "\uFEFF \t\v\f\r\n---\na\n...\n\n" },
    { name: "NUL", source: "a\0b" },
    { name: "Final CR", source: "a: b\r" },
  ]);
});

test("corpus input reader rejects unsupported conditions and framing", () => {
  for (const text of [
    "not a corpus file",
    "==================\nUnclosed header\n",
    "==================\n\n==================\na\n------------------\n",
    "==================\nSkipped\n:skip\n==================\na\n------------------\n",
    "==================\nNo separator\n==================\na\n",
  ]) {
    assert.throws(() => parseCorpus(text), { code: "ERR_ASSERTION" }, text);
  }
});

test("yaml: stream BOMs separate completed content from explicit documents", () => {
  for (const source of [
    "[]\n\uFEFF---\nx",
    "a: b\n\uFEFF---\nc: d",
    "a\n\uFEFF---\nb",
  ]) {
    const nodes = parse(source);
    assert.equal(hasError(nodes), false, source);
    assert.equal(
      nodes.filter(({ kind }) => kind === "document").length,
      2,
      source,
    );
    const bom = nodes.find(({ kind }) => kind === "byte_order_mark");
    assert.equal(bom?.parent, 0, source);
    assert.equal(bom.end - bom.start, 3, source);
  }
});

test("yaml: layout has complete nonoverlapping leaves across physical line endings", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    const source = `a : [b, c]${ending}${ending}# end${ending}`;
    const nodes = parse(source);
    assert.equal(hasError(nodes), false);
    assert.deepEqual(
      nodes
        .filter(({ kind }) => kind === "line_break")
        .map(({ start, end }) =>
          Buffer.from(source).subarray(start, end).toString(),
        ),
      [ending, ending, ending],
    );
    assert.deepEqual(
      nodes
        .filter(({ kind }) => kind === "separation")
        .map(({ start, end }) => [start, end]),
      [
        [1, 2],
        [3, 4],
        [7, 8],
      ],
    );
  }
});

test("CST decoding preserves fields, parentage, BOM and Unicode byte ranges", () => {
  const nodes = parseCst(
    [
      "0:3 - 0:6   stream",
      "0:3 - 0:6     document",
      "0:3 - 0:6       content: plain_scalar",
      "0:3 - 0:6         scalar_text",
    ].join("\n"),
    "\ufeff名",
  );
  assert.deepEqual(nodes, [
    { kind: "stream", field: null, start: 3, end: 6, parent: null },
    { kind: "document", field: null, start: 3, end: 6, parent: 0 },
    { kind: "plain_scalar", field: "content", start: 3, end: 6, parent: 1 },
    { kind: "scalar_text", field: null, start: 3, end: 6, parent: 2 },
  ]);
  for (const text of [
    "0:0 - 0:1   stream",
    "0:0 - 0:2   stream\n0:1 - 0:2     scalar_text",
    "0:0 - 0:2   stream\n0:0 - 0:2     scalar_text\n0:1 - 0:2     scalar_text",
  ]) {
    assert.throws(() => parseCst(text, "ab"), assert.AssertionError);
  }
});

test("CST decoding recognizes standard recovery without requiring its shape", () => {
  for (const text of [
    "0:0 - 0:2   •ERROR",
    "0:0 - 0:2   stream\n0:2 - 0:2     MISSING quote_close",
  ]) {
    assert.equal(hasError(parseCst(text, "ab")), true);
  }
  const missing = parseCst(
    "0:0 - 0:2   stream\n0:2 - 0:2     closing: MISSING quote_close",
    "ab",
  )[1];
  assert.deepEqual(missing, {
    kind: "quote_close",
    missing: true,
    field: "closing",
    start: 2,
    end: 2,
    parent: 0,
  });
});

test("public metadata contains no diagnostic nodes or issue fields", () => {
  const types = JSON.parse(
    readFileSync(join(root, "src/node-types.json"), "utf8"),
  );
  for (const node of types) {
    assert.ok(
      !["syntax_issue", "invalid_syntax", "incomplete_syntax"].includes(
        node.type,
      ),
    );
    assert.ok(!Object.hasOwn(node.fields ?? {}, "issue"));
  }
});

test("invalid UTF-8 and forbidden characters are rejected in each lexical context", () => {
  const damage = [
    Buffer.from([0xff]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0]),
    Buffer.from([1]),
  ];
  for (const [prefix, suffix] of [
    ["# a", "b\n"],
    ["|\n  a", "b\n"],
    ["*a", "b"],
    ["&a", "b text"],
    ['"a', 'b"'],
    ['"\\', 'b"'],
    ["!<tag:%A", "> text"],
    ["!x%A", " text"],
    ["%TAG !x! tag:%A", "\n--- text"],
    ["key: a", "b"],
  ]) {
    for (const bytes of damage) {
      const source = Buffer.concat([
        Buffer.from(prefix),
        bytes,
        Buffer.from(suffix),
      ]);
      assert.equal(hasError(parse(source)), true, source.toString());
    }
  }
});
