import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { root } from "../scripts/tree-sitter.js";
import { issues, parseCst } from "./support/cst.js";
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
      assert.equal(
        attribute,
        ":cst",
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
    test(`yaml: corpus source coverage, issue ownership and fresh determinism: ${file}: ${name}`, () => {
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

const invalidBytes = Buffer.from([0xff, 0xfe, 0x80]);

test("CST decoding preserves fields, parentage, BOM, CRLF, Unicode bytes, and zero-width issues", () => {
  const source = "\ufeff[a,\r\n 名";
  const text = [
    "0:3 - 1:4   stream",
    "0:3 - 1:4     document",
    "0:3 - 1:4       content: flow_sequence",
    "0:3 - 0:4         opening: flow_sequence_open `[`",
    "0:4 - 0:5         plain_scalar",
    "0:4 - 0:5           scalar_text `a`",
    "0:5 - 0:6         flow_separator `,`",
    "0:6 - 1:0         line_break",
    "0:6 - 0:8           `\\r\\n`",
    "1:0 - 1:1         line_prefix",
    "1:0 - 1:1           indentation ` `",
    "1:1 - 1:4         plain_scalar",
    "1:1 - 1:4           scalar_text `名`",
    "1:4 - 1:4         issue: syntax_issue",
    "1:4 - 1:4           incomplete_syntax",
    "1:4 - 1:4             missing_flow_sequence_close",
  ].join("\n");
  const nodes = parseCst(text, source);
  assert.deepEqual(
    nodes.map(({ kind, field, parent, start, end }) => [
      kind,
      field,
      parent,
      start,
      end,
    ]),
    [
      ["stream", null, null, 3, 12],
      ["document", null, 0, 3, 12],
      ["flow_sequence", "content", 1, 3, 12],
      ["flow_sequence_open", "opening", 2, 3, 4],
      ["plain_scalar", null, 2, 4, 5],
      ["scalar_text", null, 4, 4, 5],
      ["flow_separator", null, 2, 5, 6],
      ["line_break", null, 2, 6, 8],
      ["line_prefix", null, 2, 8, 9],
      ["indentation", null, 8, 8, 9],
      ["plain_scalar", null, 2, 9, 12],
      ["scalar_text", null, 10, 9, 12],
      ["syntax_issue", "issue", 2, 12, 12],
      ["incomplete_syntax", null, 12, 12, 12],
      ["missing_flow_sequence_close", null, 13, 12, 12],
    ],
  );
  assert.deepEqual(issues(nodes), [
    ["incomplete_syntax", "missing_flow_sequence_close", 12, 12],
  ]);
});

test("CST coverage allows an escape prefix before a decoding issue only inside its owner", () => {
  const source = Buffer.from([0x22, 0x5c, 0xff, 0x22]);
  const text = [
    "0:0 - 0:4   stream",
    "0:0 - 0:4     document",
    "0:0 - 0:4       content: double_quoted_scalar",
    "0:0 - 0:1         opening: quote_open",
    "0:2 - 0:3         issue: syntax_issue",
    "0:2 - 0:3           invalid_syntax",
    "0:2 - 0:3             invalid_encoding",
    "0:3 - 0:4         closing: quote_close",
  ].join("\n");
  assert.deepEqual(issues(parseCst(text, source)), [
    ["invalid_syntax", "invalid_encoding", 2, 3],
  ]);
  assert.throws(
    () => parseCst(text, Buffer.from([0x22, 0x78, 0xff, 0x22])),
    assert.AssertionError,
  );
  assert.throws(
    () =>
      parseCst(
        text.replace("0:0 - 0:4       content:", "0:2 - 0:4       content:"),
        source,
      ),
    assert.AssertionError,
  );
});

test("CST validation rejects native errors, truncated roots, gaps, and overlapping leaves", () => {
  for (const text of [
    "0:0 - 0:2   •stream",
    "0:0 - 0:2   stream\n0:0 - 0:2     ERROR",
    "0:0 - 0:1   stream",
    "0:0 - 0:2   stream\n0:0 - 0:1     scalar_text",
    "0:0 - 0:2   stream\n0:0 - 0:2     scalar_text\n0:1 - 0:2     scalar_text",
  ]) {
    assert.throws(() => parseCst(text, "ab"), assert.AssertionError, text);
  }
});

test("yaml: stream BOMs separate completed content from explicit documents", () => {
  for (const source of [
    "[]\n\uFEFF---\nx",
    "a: b\n\uFEFF---\nc: d",
    "a\n\uFEFF---\nb",
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], source);
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
    assert.deepEqual(issues(nodes), []);
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

test("yaml: an escape stops before an independently invalid encoding", () => {
  assert.deepEqual(issues(parse(Buffer.from([34, 92, 255, 34]))), [
    ["invalid_syntax", "invalid_encoding", 2, 3],
  ]);
});

test("yaml: an undecodable byte remains isolated within plain scalar text", () => {
  assert.deepEqual(issues(parse(Buffer.from([97, 255, 98]))), [
    ["invalid_syntax", "invalid_encoding", 1, 2],
  ]);
});
for (const [name, prefix, suffix, owner] of [
  ["comment", "# a", "b\n", "comment"],
  ["block scalar", "|\n  a", "b\n", "block_scalar_line"],
  ["alias name", "*a", "b", "alias"],
  ["anchor name", "&a", "b text", "anchor"],
  ["quoted escape prefix", '"a\\', 'b"', "double_quoted_scalar"],
  ["Unicode escape prefix", '"a\\u12', 'b"', "double_quoted_scalar"],
  ["tag URI escape prefix", "!<tag:%A", "> text", "tag_uri"],
  ["tag suffix escape prefix", "!x%A", " text", "tag_suffix"],
  [
    "directive tag prefix escape",
    "%TAG !x! tag:%A",
    "\n--- text",
    "tag_prefix",
  ],
]) {
  test(`yaml: decoding failure runs in ${name} do not add another violation`, () => {
    const source = Buffer.concat([
      Buffer.from(prefix),
      invalidBytes,
      Buffer.from(suffix),
    ]);
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      [
        "invalid_syntax",
        "invalid_encoding",
        Buffer.byteLength(prefix),
        Buffer.byteLength(prefix) + invalidBytes.length,
      ],
    ]);
    const node = nodes.find(({ kind }) => kind === "syntax_issue");
    assert.equal(nodes[node.parent].kind, owner);
    assert.ok(
      !nodes.some(
        ({ kind }) => kind === "quoted_escape" || kind === "uri_escape",
      ),
    );
  });
}

test("yaml: decoding failures stay isolated across syntax boundaries", () => {
  for (const source of [
    "a: [b, {c: d}]\n",
    "---\na: |2-\n  text\n...\n",
    "&name !tag value\n",
    "!<tag:example%20> x\n",
    "%TAG !x! tag:example/\n--- !x!y\n",
    "%YAML 1.2\n--- x\n",
    String.raw`"a\u1234b"`,
  ]) {
    for (let byte = 0; byte <= source.length; byte++) {
      const input = Buffer.concat([
        Buffer.from(source.slice(0, byte)),
        invalidBytes,
        Buffer.from(source.slice(byte)),
      ]);
      assert.deepEqual(
        issues(parse(input))
          .filter(([, reason]) => reason === "invalid_encoding")
          .map(([, , start, end]) => [start, end]),
        [[byte, byte + invalidBytes.length]],
        JSON.stringify({ source, byte }),
      );
    }
  }
});
