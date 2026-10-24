import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { root } from "../scripts/tree-sitter.js";
import { implicitKeyCharacterLimit, issues, parseCst } from "./support/cst.js";
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
const tagPrefix = "!u ";
const longestTaggedKey = `${tagPrefix}${"a".repeat(implicitKeyCharacterLimit - tagPrefix.length)}`;
const overlongTaggedKey = `!\n${longestTaggedKey}a`;

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

test("yaml: EOF-dependent classifications are incomplete until their boundary is fixed", () => {
  for (const { source, completion, reason, start, closing } of [
    {
      source: "[-",
      completion: "x]",
      reason: "invalid_scalar_start",
      start: 1,
      closing: "missing_flow_sequence_close",
    },
    {
      source: "{a: ?",
      completion: "x}",
      reason: "invalid_scalar_start",
      start: 4,
      closing: "missing_flow_mapping_close",
    },
    {
      source: "{: :",
      completion: "x}",
      reason: "invalid_scalar_start",
      start: 3,
      closing: "missing_flow_mapping_close",
    },
    {
      source: ": :",
      completion: "x",
      reason: "invalid_compact_collection",
      start: 2,
      closing: null,
    },
    {
      source: "!t -",
      completion: "x",
      reason: "invalid_compact_collection",
      start: 3,
      closing: null,
    },
    {
      source: "--- -",
      completion: "x",
      reason: "invalid_compact_collection",
      start: 4,
      closing: null,
    },
    {
      source: "a: b:",
      completion: "x",
      reason: "invalid_compact_collection",
      start: 3,
      closing: null,
    },
    {
      source: "a\n:",
      completion: "x",
      reason: "unexpected_document_content",
      start: 2,
      closing: null,
    },
    {
      source: "a\nb:",
      completion: "x",
      reason: "unexpected_document_content",
      start: 3,
      closing: null,
    },
    {
      source: "a\nb :",
      completion: "x",
      reason: "unexpected_document_content",
      start: 4,
      closing: null,
    },
    {
      source: ": 1\n-",
      completion: "x: y",
      reason: "unexpected_collection_content",
      start: 4,
      closing: null,
    },
    {
      source: "!\n!",
      completion: " p:",
      reason: "duplicate_tag",
      start: 2,
      closing: null,
    },
    {
      source: "!t\n&x: !t",
      completion: " p:",
      reason: "duplicate_tag",
      start: 7,
      closing: null,
    },
    {
      source: "&x\n&x",
      completion: " p:",
      reason: "duplicate_anchor",
      start: 3,
      closing: null,
    },
  ]) {
    assert.deepEqual(
      issues(parse(source)),
      [
        ["incomplete_syntax", reason, start, source.length],
        ...(closing
          ? [["incomplete_syntax", closing, source.length, source.length]]
          : []),
      ],
      source,
    );
    assert.deepEqual(
      issues(parse(source + completion)),
      [],
      source + completion,
    );
    for (const boundary of ["\n", " # end"]) {
      const found = issues(parse(source + boundary)).filter(
        (issue) => issue[1] === reason,
      );
      assert.ok(found.length > 0, source + boundary);
      assert.ok(
        found.every(([outcome]) => outcome === "invalid_syntax"),
        source + boundary,
      );
    }
  }
  for (const source of [
    "[]\n:",
    "'a'\n:",
    "a # end\n:",
    "! !",
    "&x &x",
    "!t *x",
    "k:\n\ta:",
    "k: 1\na\n b:",
    'k: 1\n"a\n b":',
    `k: 1\n${"a".repeat(implicitKeyCharacterLimit + 1)}:`,
    "?\n!t\n - a\n:",
    "k: 1\n!t\n  k: v\n:",
  ]) {
    const found = issues(parse(source));
    assert.ok(found.length > 0, source);
    assert.ok(
      found.every(([outcome]) => outcome === "invalid_syntax"),
      source,
    );
  }
  const key = longestTaggedKey;
  for (const { source, expected } of [
    {
      source: `!\n${key}`,
      expected: [["incomplete_syntax", "duplicate_tag", 2, 4]],
    },
    {
      source: "!t\n&x: !u !v",
      expected: [
        ["incomplete_syntax", "duplicate_tag", 7, 9],
        ["invalid_syntax", "duplicate_tag", 10, 12],
      ],
    },
  ]) {
    assert.deepEqual(issues(parse(source)), expected, source);
  }
});

test("yaml: EOF reclassification removes individual issues even when other violations remain", () => {
  for (const { source, completion, expected, completed } of [
    {
      source: "\ta:",
      completion: "x",
      expected: [["incomplete_syntax", "tab_in_indentation", 0, 1]],
      completed: [],
    },
    {
      source: "!t\n*x",
      completion: " :",
      expected: [["incomplete_syntax", "properties_on_alias", 3, 5]],
      completed: [],
    },
    {
      source: "k:\n a\n :",
      completion: "x",
      expected: [["incomplete_syntax", "invalid_indentation", 6, 7]],
      completed: [],
    },
    {
      source: "k: 1\na\n  :",
      completion: "x: v",
      expected: [
        ["incomplete_syntax", "missing_value_indicator", 6, 6],
        ["incomplete_syntax", "invalid_indentation", 7, 9],
      ],
      completed: [["invalid_syntax", "invalid_implicit_key", 5, 11]],
    },
    {
      source: "k: 1\n!t\n  :",
      completion: "x: v\n: w",
      expected: [
        ["incomplete_syntax", "missing_value_indicator", 7, 7],
        ["incomplete_syntax", "invalid_indentation", 8, 10],
      ],
      completed: [["invalid_syntax", "invalid_implicit_key", 5, 16]],
    },
    {
      source: "#c\n[\n]:",
      completion: "x",
      expected: [
        ["incomplete_syntax", "invalid_implicit_key", 3, 6],
        ["incomplete_syntax", "missing_indentation", 5, 5],
      ],
      completed: [["invalid_syntax", "unexpected_document_content", 6, 8]],
    },
    {
      source: "k:\n [\n]:",
      completion: "x",
      expected: [
        ["incomplete_syntax", "invalid_implicit_key", 4, 7],
        ["invalid_syntax", "missing_indentation", 6, 6],
      ],
      completed: [
        ["invalid_syntax", "missing_indentation", 6, 6],
        ["invalid_syntax", "unexpected_collection_content", 7, 9],
      ],
    },
    {
      source: "{a: b :",
      completion: "x}",
      expected: [
        ["incomplete_syntax", "missing_flow_separator", 6, 6],
        ["incomplete_syntax", "missing_flow_mapping_close", 7, 7],
      ],
      completed: [],
    },
    {
      source: "a: [b]:",
      completion: "x",
      expected: [["incomplete_syntax", "invalid_compact_collection", 3, 7]],
      completed: [["invalid_syntax", "unexpected_collection_content", 6, 8]],
    },
    {
      source: '--- "b":',
      completion: "x",
      expected: [["incomplete_syntax", "invalid_compact_collection", 4, 8]],
      completed: [["invalid_syntax", "unexpected_document_content", 7, 9]],
    },
    {
      source: "a: *x :",
      completion: "x",
      expected: [["incomplete_syntax", "invalid_compact_collection", 3, 7]],
      completed: [["invalid_syntax", "unexpected_collection_content", 6, 8]],
    },
    {
      source: ": !<x>:",
      completion: "x",
      expected: [["incomplete_syntax", "invalid_compact_collection", 2, 7]],
      completed: [["invalid_syntax", "missing_separation", 6, 6]],
    },
    {
      source: "{a: !t\n:",
      completion: "x}",
      expected: [
        ["incomplete_syntax", "missing_flow_separator", 7, 7],
        ["incomplete_syntax", "missing_flow_mapping_close", 8, 8],
      ],
      completed: [],
    },
    {
      source: "{a: *x\n-",
      completion: "--\n",
      expected: [
        ["incomplete_syntax", "missing_flow_separator", 7, 7],
        ["incomplete_syntax", "invalid_scalar_start", 7, 8],
        ["incomplete_syntax", "missing_flow_mapping_close", 8, 8],
      ],
      completed: [["invalid_syntax", "missing_flow_mapping_close", 7, 7]],
    },
    {
      source: "[a\nb:",
      completion: "x]",
      expected: [
        ["incomplete_syntax", "invalid_implicit_key", 1, 4],
        ["incomplete_syntax", "missing_flow_sequence_close", 5, 5],
      ],
      completed: [],
    },
    {
      source: "? [a\n\t\n--",
      completion: "-",
      expected: [
        ["incomplete_syntax", "tab_in_indentation", 5, 6],
        ["incomplete_syntax", "missing_indentation", 7, 7],
        ["incomplete_syntax", "missing_flow_sequence_close", 9, 9],
      ],
      completed: [["incomplete_syntax", "missing_flow_sequence_close", 7, 7]],
    },
    {
      source: "- \n\ufeff.",
      completion: "..",
      expected: [["incomplete_syntax", "missing_document_start", 6, 6]],
      completed: [],
    },
    {
      source: ": |\n\t\n-",
      completion: "--",
      expected: [
        ["incomplete_syntax", "missing_indentation", 4, 4],
        ["incomplete_syntax", "unexpected_collection_content", 6, 7],
      ],
      completed: [],
    },
    {
      source: "|\n   \n.",
      completion: "..",
      expected: [["incomplete_syntax", "invalid_indentation", 2, 5]],
      completed: [],
    },
    {
      source: "k:\n  a: 1\n :",
      completion: "x",
      expected: [["invalid_syntax", "invalid_indentation", 10, 11]],
      completed: [
        ["invalid_syntax", "invalid_indentation", 10, 11],
        ["incomplete_syntax", "missing_value_indicator", 13, 13],
      ],
    },
    {
      source: "a: 1\n\t-",
      completion: "x",
      expected: [
        ["invalid_syntax", "tab_in_indentation", 5, 6],
        ["incomplete_syntax", "unexpected_collection_content", 6, 7],
      ],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 5, 6],
        ["incomplete_syntax", "missing_value_indicator", 8, 8],
      ],
    },
    {
      source: "- a\n\t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 4, 5]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 4, 5],
        ["invalid_syntax", "unexpected_collection_content", 5, 7],
      ],
    },
    {
      source: "a:\n- b\n\t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 7, 8]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 7, 8],
        ["incomplete_syntax", "missing_value_indicator", 10, 10],
      ],
    },
    {
      source: "- []\n  -",
      completion: "x",
      expected: [["invalid_syntax", "invalid_indentation", 5, 7]],
      completed: [
        ["invalid_syntax", "invalid_indentation", 5, 7],
        ["invalid_syntax", "unexpected_collection_content", 7, 9],
      ],
    },
    {
      source: "a:\n- []\n  -",
      completion: "x",
      expected: [["invalid_syntax", "invalid_indentation", 8, 10]],
      completed: [
        ["invalid_syntax", "invalid_indentation", 8, 10],
        ["invalid_syntax", "unexpected_collection_content", 10, 12],
      ],
    },
    {
      source: "- - a\n  \t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 8, 9]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 8, 9],
        ["invalid_syntax", "unexpected_collection_content", 9, 11],
      ],
    },
    {
      source: "a:\n- - b\n  \t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 11, 12]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 11, 12],
        ["invalid_syntax", "unexpected_collection_content", 12, 14],
      ],
    },
    {
      source: "- a:\n  - []\n  \t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 14, 15]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 14, 15],
        ["incomplete_syntax", "missing_value_indicator", 17, 17],
      ],
    },
    {
      source: "- a:\n    - []\n    \t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 18, 19]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 18, 19],
        ["invalid_syntax", "unexpected_collection_content", 19, 21],
      ],
    },
    {
      source: "- a: 1\n- b\n\t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 11, 12]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 11, 12],
        ["invalid_syntax", "unexpected_collection_content", 12, 14],
      ],
    },
    {
      source: "a:\n- b: 1\n- c\n\t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 14, 15]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 14, 15],
        ["incomplete_syntax", "missing_value_indicator", 17, 17],
      ],
    },
    {
      source: "a: b\n---\n- a\n\t-",
      completion: "x",
      expected: [["invalid_syntax", "tab_in_indentation", 13, 14]],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 13, 14],
        ["invalid_syntax", "unexpected_collection_content", 14, 16],
      ],
    },
    {
      source: "- a: 1\n  \t-",
      completion: "x",
      expected: [
        ["invalid_syntax", "tab_in_indentation", 9, 10],
        ["incomplete_syntax", "unexpected_collection_content", 10, 11],
      ],
      completed: [
        ["invalid_syntax", "tab_in_indentation", 9, 10],
        ["incomplete_syntax", "missing_value_indicator", 12, 12],
      ],
    },
    {
      source: ": []\n \t-",
      completion: "x",
      expected: [
        ["invalid_syntax", "invalid_indentation", 5, 6],
        ["incomplete_syntax", "tab_in_indentation", 6, 7],
        ["incomplete_syntax", "unexpected_collection_content", 7, 8],
      ],
      completed: [
        ["invalid_syntax", "invalid_indentation", 5, 6],
        ["incomplete_syntax", "missing_value_indicator", 9, 9],
      ],
    },
    {
      source: "!\n!u [a,\nb]",
      completion: ": ",
      expected: [["incomplete_syntax", "duplicate_tag", 2, 4]],
      completed: [
        ["invalid_syntax", "invalid_implicit_key", 2, 11],
        ["invalid_syntax", "missing_indentation", 9, 9],
      ],
    },
    {
      source: overlongTaggedKey,
      completion: ": ",
      expected: [["incomplete_syntax", "duplicate_tag", 2, 4]],
      completed: [
        [
          "invalid_syntax",
          "invalid_implicit_key",
          2,
          Buffer.byteLength(overlongTaggedKey),
        ],
      ],
    },
  ]) {
    assert.deepEqual(issues(parse(source)), expected, source);
    assert.deepEqual(issues(parse(source + completion)), completed, source);
    const reasons = new Set(
      expected
        .filter(
          ([outcome, reason]) =>
            outcome === "incomplete_syntax" &&
            reason !== "missing_flow_mapping_close" &&
            reason !== "missing_flow_sequence_close",
        )
        .map(([, reason]) => reason),
    );
    for (const boundary of ["\n", " # end"]) {
      const fixed = issues(parse(source + boundary)).filter(([, reason]) =>
        reasons.has(reason),
      );
      assert.deepEqual(
        new Set(fixed.map(([, reason]) => reason)),
        reasons,
        source + boundary,
      );
      assert.ok(
        fixed.every(([outcome]) => outcome === "invalid_syntax"),
        source + boundary,
      );
    }
  }
});
