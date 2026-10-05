import assert from "node:assert/strict";
import { test } from "node:test";
import { issues, parse } from "./support/parser.js";

function counts(nodes, kinds) {
  return kinds.map((kind) => nodes.filter((node) => node.kind === kind).length);
}

function sexp(nodes) {
  const children = nodes.map(() => []);
  const expressions = [];
  for (let index = nodes.length - 1; index >= 0; index--) {
    const { kind, field, parent } = nodes[index];
    const expression = `(${kind}${children[index].length ? ` ${children[index].join(" ")}` : ""})`;
    expressions[index] = expression;
    if (parent !== null)
      children[parent].unshift(`${field ? `${field}: ` : ""}${expression}`);
  }
  return expressions[0];
}

test("yaml: damaged plain scalars retain adjacent spaces and following pairs", () => {
  for (const { damage, reason } of [
    { damage: Buffer.from([0]), reason: "invalid_character" },
    { damage: Buffer.from([0xff, 0xfe, 0x80]), reason: "invalid_encoding" },
    { damage: Buffer.from("\ufeff"), reason: "invalid_character" },
  ]) {
    for (const [before, after] of [
      ["one", " two"],
      ["one ", "two"],
      ["one \t", "\t two"],
    ]) {
      for (const { prefix, suffix, field, owner } of [
        {
          prefix: "key: ",
          suffix: "\nnext: value",
          field: "value",
          owner: "block_mapping_pair",
        },
        { prefix: "[", suffix: ", next]", field: null, owner: "flow_sequence" },
        {
          prefix: "? ",
          suffix: "\n: value",
          field: "key",
          owner: "block_mapping_pair",
        },
      ]) {
        const source = Buffer.concat([
          Buffer.from(prefix + before),
          damage,
          Buffer.from(after + suffix),
        ]);
        const at = prefix.length + before.length;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [
          ["invalid_syntax", reason, at, at + damage.length],
        ]);
        const scalar = nodes.find(
          ({ kind, start }) =>
            kind === "plain_scalar" && start === prefix.length,
        );
        assert.deepEqual(
          [scalar.field, scalar.end, nodes[scalar.parent].kind],
          [field, source.length - suffix.length, owner],
        );
        assert.deepEqual(
          nodes
            .filter(
              ({ kind, parent }) =>
                kind === "scalar_text" && nodes[parent] === scalar,
            )
            .map(({ start, end }) => source.subarray(start, end).toString()),
          [before, after],
        );
        if (owner === "block_mapping_pair" && field === "value") {
          assert.equal(counts(nodes, ["block_mapping_pair"])[0], 2);
        }
      }
    }
  }
  for (const { source, expected } of [
    {
      source: "@ text",
      expected: [["invalid_syntax", "invalid_scalar_start", 0, 1]],
    },
    {
      source: "[a\0 , b]",
      expected: [["invalid_syntax", "invalid_character", 2, 3]],
    },
    {
      source: "a\0 # comment",
      expected: [["invalid_syntax", "invalid_character", 1, 2]],
    },
    {
      source: "a\0 : value",
      expected: [["invalid_syntax", "invalid_character", 1, 2]],
    },
  ]) {
    assert.deepEqual(issues(parse(source)), expected, source);
  }
});

test("yaml: block scalar indentation detection stops at document boundaries", () => {
  for (const style of ["|", ">", "|+", ">-"]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
      for (const boundary of ["---", "...", "\ufeff---"]) {
        const source = `${style}${newline}  ${newline}${boundary}${newline}next`;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [], source);
        const scalar = nodes.find(
          ({ kind }) => kind === "literal_scalar" || kind === "folded_scalar",
        );
        assert.equal(scalar.end, style.length + newline.length * 2 + 2);
        assert.equal(counts(nodes, ["document"])[0], 2);
      }
    }
  }
  const source = "|\ntext\n\ufeff---\nnext";
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), []);
  assert.equal(nodes.find(({ kind }) => kind === "literal_scalar").end, 7);
  for (const continuation of ["---text", "...text"]) {
    assert.deepEqual(issues(parse(`|\n  \n${continuation}`)), [
      ["invalid_syntax", "invalid_indentation", 2, 4],
    ]);
  }
});

test("yaml: empty properties release dedented prefixes to the enclosing mapping", () => {
  for (const property of ["&p", "!t", "!<tag:x>", "!t &p"]) {
    for (const compact of [false, true]) {
      const source = `${compact ? "a: b: " : "a:\n  b: "}${property}\n c: d\ne: f`;
      const at = source.indexOf("\n c") + 1;
      const nodes = parse(source);
      assert.deepEqual(
        issues(nodes),
        [
          ...(compact
            ? [["invalid_syntax", "invalid_compact_collection", 3, at]]
            : []),
          ["invalid_syntax", "invalid_indentation", at, at + 1],
        ],
        source,
      );
      assert.equal(counts(nodes, ["block_mapping_pair"])[0], 4);
      const properties = nodes.find(
        ({ kind }) => kind === "node_with_properties",
      );
      assert.equal(properties.end, at);
      assert.ok(
        !nodes.some(
          ({ field, parent }) =>
            field === "content" && nodes[parent] === properties,
        ),
      );
      const last = nodes.findLast(({ kind }) => kind === "block_mapping_pair");
      assert.equal(last.start, source.indexOf("e: f"));
    }
  }
});

test("yaml: a property-bearing block mapping can begin with an empty key", () => {
  for (const property of ["!tag", "&anchor", "!tag &anchor"]) {
    for (const [prefix, indentation, suffix] of [
      ["", "", ""],
      ["key: ", "  ", "\nnext: value"],
      ["- ", "  ", "\n- next"],
    ]) {
      const source = `${prefix}${property}\n${indentation}: value${suffix}`;
      const nodes = parse(source);
      assert.deepEqual(issues(nodes), [], source);
      const properties = nodes.find(
        ({ kind }) => kind === "node_with_properties",
      );
      const mapping = nodes.find(
        ({ kind, parent }) =>
          kind === "block_mapping" && nodes[parent] === properties,
      );
      assert.equal(mapping.field, "content");
      assert.equal(mapping.start, source.indexOf(": value"));
      const pair = nodes.find(
        ({ kind, parent }) =>
          kind === "block_mapping_pair" && nodes[parent] === mapping,
      );
      assert.deepEqual(
        nodes
          .filter(({ parent }) => nodes[parent] === pair)
          .map(({ field, kind }) => [field, kind]),
        [
          ["indicator", "value_indicator"],
          [null, "separation"],
          ["value", "plain_scalar"],
        ],
      );
    }
  }
});

test("yaml: mismatched flow closings release their line state in block values", () => {
  for (const [content, closer, reason] of [
    ["[a", "}", "missing_flow_sequence_close"],
    ["[&a", "}", "missing_flow_sequence_close"],
    ["{a", "]", "missing_flow_mapping_close"],
    ["{a: &b", "]", "missing_flow_mapping_close"],
  ]) {
    const source = `key: ${content}\n ${closer}`;
    const at = source.length - 1;
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", reason, at, at],
      ["invalid_syntax", "unexpected_document_content", at, at + 1],
      ["invalid_syntax", "invalid_scalar_start", at, at + 1],
    ]);
    assert.equal(counts(nodes, ["block_mapping_pair"])[0], 1);
    const value = nodes.find(({ field }) => field === "value");
    assert.equal(value.end, at);
  }
});

test("yaml: quoted scalars accept the non-C0 character set without splitting text", () => {
  for (const quote of ['"', "'"]) {
    for (const character of [
      "\u007f",
      "\u0080",
      "\u0085",
      "\u009f",
      "\ufffe",
      "\uffff",
    ]) {
      const source = `${quote}a${character}b${quote}`;
      const nodes = parse(source);
      assert.deepEqual(issues(nodes), [], source);
      assert.deepEqual(
        nodes
          .filter(({ kind }) => kind === "scalar_text")
          .map(({ start, end }) => [start, end]),
        [[1, Buffer.byteLength(source) - 1]],
        source,
      );
      if (character !== "\u0085") {
        assert.deepEqual(issues(parse(`a${character}b`)), [
          [
            "invalid_syntax",
            "invalid_character",
            1,
            1 + Buffer.byteLength(character),
          ],
        ]);
      }
    }
    for (const character of [
      Buffer.from([0]),
      Buffer.from([0x1f]),
      Buffer.from([0xff]),
    ]) {
      const source = Buffer.concat([
        Buffer.from(`${quote}a`),
        character,
        Buffer.from(`b${quote}`),
      ]);
      assert.deepEqual(issues(parse(source)), [
        [
          "invalid_syntax",
          character[0] === 0xff ? "invalid_encoding" : "invalid_character",
          2,
          3,
        ],
      ]);
    }
  }
});

test("yaml: escaped breaks on empty continuation lines own only their backslash issue", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const firstBreak of [newline, `\\${newline}`]) {
      for (const prefix of ["", "  ", " \t"]) {
        const before = `"a${firstBreak}${prefix}`;
        const source = `${before}\\${newline}b"`;
        const nodes = parse(source);
        const at = before.length;
        assert.deepEqual(
          issues(nodes),
          [["invalid_syntax", "invalid_line_continuation", at, at + 1]],
          source,
        );
        const problem = nodes.find(({ kind }) => kind === "syntax_issue");
        assert.equal(nodes[problem.parent].kind, "line_continuation");
        const indicator = nodes.find(
          ({ kind, start }) => kind === "escape_indicator" && start === at,
        );
        assert.equal(nodes[indicator.parent].kind, "invalid_line_continuation");
        assert.deepEqual(
          nodes
            .filter(({ kind }) => kind === "scalar_text")
            .map(({ start, end }) => source.slice(start, end)),
          ["a", "b"],
        );
      }
    }
    for (const source of [
      '"\\\nb"',
      '" \\\nb"',
      '"a\\\nb"',
      '"a\nb\\\nc"',
      '"a\n\\n\\\nb"',
      '"a\n\\ \\\nb"',
      '"a\n\\\t\\\nb"',
      '"a\n\\x20\\\nb"',
      '"a\n\\u0020\\\nb"',
      '"a\n\\U00000020\\\nb"',
      '"a\n\\\\\\\nb"',
      '"a\n\nb"',
      '"a\\\n\nb"',
      '"a\n \t\nb"',
      '"a\n"',
      '"a\\\n"',
    ]) {
      const normalized = source.replaceAll("\n", newline);
      assert.deepEqual(issues(parse(normalized)), [], normalized);
    }
  }
});

test("yaml: invalid line continuations preserve incomplete and adjacent syntax", () => {
  for (const { source, expected } of [
    {
      source: '"a\n\\',
      expected: [
        ["incomplete_syntax", "invalid_escape", 3, 4],
        ["incomplete_syntax", "missing_quote_close", 4, 4],
      ],
    },
    {
      source: '"a\n\\\n',
      expected: [
        ["invalid_syntax", "invalid_line_continuation", 3, 4],
        ["incomplete_syntax", "missing_quote_close", 5, 5],
      ],
    },
    {
      source: '"a\n\\\n"',
      expected: [["invalid_syntax", "invalid_line_continuation", 3, 4]],
    },
    {
      source: '"a\n\\\n\\\nb"',
      expected: [
        ["invalid_syntax", "invalid_line_continuation", 3, 4],
        ["invalid_syntax", "invalid_line_continuation", 5, 6],
      ],
    },
    {
      source: 'key: "a\n\\\nb"',
      expected: [
        ["invalid_syntax", "missing_indentation", 8, 8],
        ["invalid_syntax", "invalid_line_continuation", 8, 9],
        ["invalid_syntax", "missing_indentation", 10, 10],
      ],
    },
    {
      source: '"a\n  \\\n---\nnext',
      expected: [
        ["invalid_syntax", "invalid_line_continuation", 5, 6],
        ["invalid_syntax", "missing_quote_close", 7, 7],
      ],
    },
    {
      source: '["a\n\\\nb", "\\\nc"]',
      expected: [["invalid_syntax", "invalid_line_continuation", 4, 5]],
    },
  ]) {
    assert.deepEqual(issues(parse(source)), expected, source);
  }
});

test("yaml: whitespace-only final lines are layout at every block indentation", () => {
  for (const content of ["a: b", "a:", "- a", "a:\n  b: c", "a: [b]"]) {
    for (const ending of ["\n", "\r", "\r\n"]) {
      for (const whitespace of [" ", "  ", "\t", " \t "]) {
        const source = content + ending + whitespace;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [], JSON.stringify(source));
        const prefix = nodes.findLast(({ kind }) => kind === "line_prefix");
        assert.deepEqual(
          [prefix.start, prefix.end],
          [content.length + ending.length, source.length],
        );
      }
    }
  }
});

test("yaml: block scalar empty lines require a line break", () => {
  for (const style of ["|", "|-", "|+", ">", ">-", ">+"]) {
    for (const newline of ["\n", "\r", "\r\n"]) {
      for (const { owner, indentation } of [
        { owner: "", indentation: 2 },
        { owner: "a: ", indentation: 2 },
        { owner: "a:\n  b: ", indentation: 4 },
      ]) {
        const prefix = `${owner}${style}${newline}${" ".repeat(indentation)}x${newline}`;
        for (const width of [1, indentation, indentation + 1]) {
          for (const ending of ["", newline]) {
            const source = prefix + " ".repeat(width) + ending;
            const nodes = parse(source);
            assert.deepEqual(issues(nodes), [], JSON.stringify(source));
            const scalar = nodes.find(
              ({ kind }) =>
                kind === "literal_scalar" || kind === "folded_scalar",
            );
            const hasText = width > indentation;
            assert.equal(
              scalar.end,
              hasText || ending ? source.length : prefix.length,
            );
            assert.deepEqual(
              counts(nodes, [
                "block_scalar_empty_line",
                "block_scalar_spaced_line",
              ]),
              [ending && !hasText ? 1 : 0, hasText ? 1 : 0],
            );
            if (hasText) {
              const text = nodes.findLast(({ kind }) => kind === "scalar_text");
              assert.equal(source.slice(text.start, text.end), " ");
            } else if (!ending) {
              const layout = nodes.findLast(
                ({ kind }) => kind === "line_prefix",
              );
              assert.deepEqual(
                [layout.start, layout.end],
                [prefix.length, source.length],
              );
            }
          }
        }
      }
      for (const blank of ["", `    ${newline}`]) {
        const prefix = `a: ${style}${newline}${blank}`;
        const source = `${prefix}     `;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [], JSON.stringify(source));
        const scalar = nodes.find(
          ({ kind }) => kind === "literal_scalar" || kind === "folded_scalar",
        );
        assert.equal(scalar.end, prefix.length);
        assert.equal(
          counts(nodes, ["block_scalar_empty_line"])[0],
          blank ? 1 : 0,
        );
      }
    }
  }
});

test("yaml: shallow tab lines require indentation before more document content", () => {
  for (const style of ["|", ">", "|3", ">3-"]) {
    for (const newline of ["\n", "\r", "\r\n"]) {
      for (const width of [0, 1, 2]) {
        for (const text of ["\t", "\t# note"]) {
          for (const suffix of ["b: y", "   y", `# trailer${newline}b: y`]) {
            const prefix = `a: ${style}${newline}   x${newline}`;
            const source = `${prefix}${" ".repeat(width)}${text}${newline}${suffix}`;
            const nodes = parse(source);
            const at = prefix.length + width;
            assert.deepEqual(
              issues(nodes),
              [["invalid_syntax", "missing_indentation", at, at]],
              JSON.stringify(source),
            );
            const retained = nodes.find(
              ({ kind, start }) => kind === "scalar_text" && start === at,
            );
            assert.equal(source.slice(retained.start, retained.end), text);
          }
          for (const suffix of [
            "",
            newline,
            `${newline}---${newline}b: y`,
            `${newline}...`,
          ]) {
            const prefix = `a: ${style}${newline}   x${newline}`;
            const source = `${prefix}${" ".repeat(width)}${text}${suffix}`;
            const nodes = parse(source);
            assert.deepEqual(issues(nodes), [], JSON.stringify(source));
            const scalar = nodes.find(
              ({ kind }) =>
                kind === "literal_scalar" || kind === "folded_scalar",
            );
            assert.equal(scalar.end, prefix.length);
          }
        }
      }
      for (const [tail, expectedText, expectedComment] of [
        [`   \t# text${newline}b: y`, "\t# text", 0],
        [` # trailer${newline} \t# note${newline}b: y`, undefined, 2],
      ]) {
        const source = `a: ${style}${newline}   x${newline}${tail}`;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [], JSON.stringify(source));
        assert.equal(counts(nodes, ["comment"])[0], expectedComment);
        if (expectedText) {
          const text = nodes.find(
            ({ kind, start, end }) =>
              kind === "scalar_text" &&
              source.slice(start, end) === expectedText,
          );
          assert.ok(text);
        }
      }
    }
  }
  const source = "a: |\n   x\n \t\n \t# note\n  \n \t\nb: y";
  assert.deepEqual(issues(parse(source)), [
    ["invalid_syntax", "missing_indentation", 11, 11],
    ["invalid_syntax", "missing_indentation", 14, 14],
    ["invalid_syntax", "missing_indentation", 26, 26],
  ]);
});

test("yaml: an incomplete hexadecimal escape must still admit a Unicode scalar value", () => {
  for (const [prefix, outcome, reason] of [
    ["\\uD8", "invalid_syntax", "invalid_escape"],
    ["\\uDFf", "invalid_syntax", "invalid_escape"],
    ["\\U0000D8", "invalid_syntax", "invalid_escape"],
    ["\\U0011", "invalid_syntax", "invalid_escape"],
    ["\\U1", "invalid_syntax", "invalid_escape"],
    ["\\uD", "incomplete_syntax", "invalid_escape"],
    ["\\uD7", "incomplete_syntax", "invalid_escape"],
    ["\\uE0", "incomplete_syntax", "invalid_escape"],
    ["\\U0000D", "incomplete_syntax", "invalid_escape"],
    ["\\U0010FFF", "incomplete_syntax", "invalid_escape"],
    ["\\U0", "incomplete_syntax", "invalid_escape"],
    ["\\U", "incomplete_syntax", "invalid_escape"],
    ["\\xF", "incomplete_syntax", "invalid_escape"],
  ]) {
    const source = `"${prefix}`;
    assert.deepEqual(
      issues(parse(source)),
      [
        [outcome, reason, 1, source.length],
        [
          "incomplete_syntax",
          "missing_quote_close",
          source.length,
          source.length,
        ],
      ],
      source,
    );
  }
});

test("yaml: a nonseparating colon after a block key preserves the missing indicator", () => {
  for (const key of ['"k"', "'k'", "[]", "{}", '!<x> "k"']) {
    const source = `a: b\n${key}:value`;
    const at = 5 + key.length;
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [
        ["invalid_syntax", "missing_value_indicator", at, at],
        ["invalid_syntax", "unexpected_document_content", at, source.length],
      ],
      source,
    );
    const issue = nodes.find(
      ({ kind, start }) => kind === "syntax_issue" && start === at,
    );
    assert.equal(nodes[issue.parent].kind, "block_mapping_pair");
  }
});

test("yaml: flow punctuation cannot end property content outside a flow collection", () => {
  for (const { source, at } of [
    { source: "!tag }", at: 5 },
    { source: "&a ]", at: 3 },
    { source: "!tag ,plain", at: 5 },
    { source: "a: !b\n }", at: 7 },
    { source: "a: &b\n ]", at: 7 },
  ]) {
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [["invalid_syntax", "invalid_scalar_start", at, at + 1]],
      source,
    );
    const scalar = nodes.find(
      ({ kind, start }) => kind === "plain_scalar" && start === at,
    );
    assert.equal(scalar.field, "content");
    assert.equal(nodes[scalar.parent].kind, "node_with_properties");
  }
  for (const source of ["[!tag ]", "[&a, next]", "{a: !tag }"]) {
    assert.deepEqual(issues(parse(source)), [], source);
  }
});

test("yaml: collection keys distinguish scalar and property text from delimiters", () => {
  for (const key of [
    '[a"b]',
    "[a'b]",
    '[a"b, c]',
    '[a"b: c]',
    '{a"b: c}',
    '[&a"b c]',
    '[*a"b]',
    "[!foo'bar c]",
    "[!<tag:a[b> c]",
    "[!<tag:a]b> c]",
    "[\"a:b\", 'c''d']",
    '[a:"b:c"]',
    "[a:'b:c']",
    "['a'':b']",
    "['a''']",
    "[a#b, !foo#bar c]",
  ]) {
    for (const prefix of ["", "- ", "outer:\n  "]) {
      const source = `${prefix}${key}: value`;
      const nodes = parse(source);
      assert.deepEqual(issues(nodes), [], source);
      const collection = nodes.find(
        ({ field, start }) => field === "key" && start === prefix.length,
      );
      assert.equal(collection?.end, prefix.length + key.length, source);
      assert.equal(nodes[collection.parent].kind, "block_mapping_pair");
    }
  }
});

test("yaml: mismatched closings preserve collection keys and following block pairs", () => {
  for (const { key, reason, at } of [
    { key: "[{a]", reason: "missing_flow_mapping_close", at: 3 },
    { key: "{[a}", reason: "missing_flow_sequence_close", at: 3 },
    { key: "[[{a]]", reason: "missing_flow_mapping_close", at: 4 },
    { key: "[{[a}: b]", reason: "missing_flow_sequence_close", at: 4 },
  ]) {
    for (const prefix of ["", "- ", "outer:\n  "]) {
      const source = `${prefix}${key}: value\n${" ".repeat(prefix ? 2 : 0)}next: end`;
      const nodes = parse(source);
      assert.deepEqual(
        issues(nodes),
        [["invalid_syntax", reason, prefix.length + at, prefix.length + at]],
        source,
      );
      const first = nodes.find(
        ({ field, start }) => field === "key" && start === prefix.length,
      );
      assert.equal(first.end, prefix.length + key.length);
      const pair = nodes[first.parent];
      assert.equal(pair.kind, "block_mapping_pair");
      const following = nodes.find(
        ({ kind, start }) =>
          kind === "block_mapping_pair" && start === source.indexOf("next"),
      );
      assert.equal(following.parent, pair.parent);
    }
  }
  for (const depth of [32, 33, 64, 65, 128]) {
    const source = `${"[".repeat(depth)}{a${"]".repeat(depth)}: value`;
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "missing_flow_mapping_close", depth + 2, depth + 2],
    ]);
    assert.deepEqual(counts(nodes, ["block_mapping", "flow_sequence"]), [
      1,
      depth,
    ]);
  }
});

test("yaml: comments in collection keys cannot change nesting or quote state", () => {
  for (const comment of ['"', "'", "]", "}", "[", "{", "---", ":"]) {
    const key = `[ # ${comment}\n  item ]`;
    const source = `${key}: value`;
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [["invalid_syntax", "invalid_implicit_key", 0, key.length]],
      source,
    );
    const collection = nodes.find(({ field }) => field === "key");
    assert.deepEqual(
      [collection.kind, collection.start, collection.end],
      ["flow_sequence", 0, key.length],
    );
    assert.equal(nodes[collection.parent].kind, "invalid_implicit_key");
  }
  for (const [opening, entry, following, closing, kind] of [
    ["[", "", "item", "]", "flow_sequence"],
    ["[", '"item"', ", next", "]", "flow_sequence"],
    ["[", "[item]", ", next", "]", "flow_sequence"],
    ["{", "", "key: value", "}", "flow_mapping"],
    ["{", '"key"', ", next: value", "}", "flow_mapping"],
    ["{", "[key]", ", next: value", "}", "flow_mapping"],
  ]) {
    const collectionSource = `${opening}${entry}# ${closing}: fake\n  ${following}${closing}`;
    const at = opening.length + entry.length;
    for (const suffix of ["", ": value"]) {
      const source = collectionSource + suffix;
      const nodes = parse(source);
      assert.deepEqual(
        issues(nodes),
        [
          ...(suffix
            ? [
                [
                  "invalid_syntax",
                  "invalid_implicit_key",
                  0,
                  collectionSource.length,
                ],
              ]
            : []),
          ["invalid_syntax", "missing_separation", at, at],
        ],
        source,
      );
      const collection = nodes.find((node) => node.kind === kind);
      assert.equal(collection.end, collectionSource.length, source);
      assert.equal(collection.field, suffix ? "key" : "content", source);
      assert.equal(counts(nodes, ["block_mapping"])[0], suffix ? 1 : 0, source);
    }
  }
});

test("yaml: compact block collections retain their indentation and reject tabs", () => {
  for (const [prefix, owner] of [
    ["-", "block_sequence_entry"],
    ["?", "block_mapping_pair"],
    ["? key\n:", "block_mapping_pair"],
  ]) {
    for (const content of ["- value", "key: value"]) {
      for (const { spacing, ranges } of [
        { spacing: " ", ranges: [] },
        { spacing: "\t", ranges: [[0, 1]] },
        { spacing: " \t\t ", ranges: [[1, 3]] },
        {
          spacing: "\t \t",
          ranges: [
            [0, 1],
            [2, 3],
          ],
        },
      ]) {
        const source = `${prefix}${spacing}${content}`;
        const nodes = parse(source);
        const expected = ranges.map(([start, end]) => [
          "invalid_syntax",
          "invalid_indentation",
          prefix.length + start,
          prefix.length + end,
        ]);
        assert.deepEqual(issues(nodes), expected, source);
        const indentation = nodes.find(
          ({ kind, start }) =>
            kind === "line_prefix" && start === prefix.length,
        );
        assert.equal(indentation.end, prefix.length + spacing.length, source);
        assert.equal(nodes[indentation.parent].kind, owner, source);
      }
    }
    for (const content of [
      "value",
      "[value]",
      '"value"',
      "|\n  value",
      "# key: value\n  next",
    ]) {
      assert.deepEqual(issues(parse(`${prefix}\t${content}`)), [], content);
    }
  }
});

test("yaml: each flow mapping key determines its own colon adjacency", () => {
  for (const preceding of ["[]", "{}", '"x"', "'x'", "plain", "!tag", "*a"]) {
    for (const key of [":name", "?name", "name"]) {
      const source = `{${preceding}, ${key}}`;
      const nodes = parse(source);
      assert.deepEqual(issues(nodes), [], source);
      const keys = nodes.filter(({ field }) => field === "key");
      assert.equal(keys.length, 2, source);
      assert.deepEqual(
        [keys[1].kind, keys[1].start, keys[1].end],
        ["plain_scalar", preceding.length + 3, source.length - 1],
        source,
      );
      const pair = `{${preceding}, ${key}:[]}`;
      assert.deepEqual(
        issues(parse(pair)),
        [
          [
            "invalid_syntax",
            "missing_separation",
            pair.length - 3,
            pair.length - 3,
          ],
        ],
        pair,
      );
    }
  }
});

test("yaml: property-bearing implicit keys retain following indented values", () => {
  for (const property of ["!", "!tag", "&anchor", "!tag &anchor"]) {
    const source = `${property} key:\n value`;
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], source);
    const key = nodes.find(({ field }) => field === "key");
    const value = nodes.find(({ field }) => field === "value");
    assert.deepEqual(
      [key.kind, key.start, key.end],
      ["node_with_properties", 0, property.length + 4],
    );
    assert.deepEqual(
      [value.kind, value.start, value.end],
      ["plain_scalar", source.length - 5, source.length],
    );
    assert.equal(key.parent, value.parent);
  }
});

test("yaml: recovery retains colon-prefixed entries and invalid property collections", () => {
  for (const { source, expected } of [
    {
      source: "{*a :foo}",
      expected: [["invalid_syntax", "missing_flow_separator", 4, 4]],
    },
    {
      source: "[]:: value",
      expected: [["invalid_syntax", "unexpected_document_content", 2, 10]],
    },
    {
      source: "? key\n&a - value",
      expected: [
        ["invalid_syntax", "invalid_compact_collection", 9, 16],
        ["incomplete_syntax", "missing_value_indicator", 16, 16],
      ],
    },
  ]) {
    assert.deepEqual(issues(parse(source)), expected, source);
  }
});

test("yaml: flow value indicators do not become scalar continuation lines", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const value of ["[]", "{}", "", " value"]) {
      const source = `{key ${ending}:${value}}`;
      const nodes = parse(source);
      const key = nodes.find(({ field }) => field === "key");
      assert.deepEqual([key.kind, key.start, key.end], ["plain_scalar", 1, 4]);
      assert.deepEqual(
        nodes
          .filter(({ kind }) => kind === "line_break")
          .map(({ start, end }) => [start, end]),
        [[5, 5 + ending.length]],
      );
      const at = 6 + ending.length;
      assert.deepEqual(
        issues(nodes),
        value === "[]" || value === "{}"
          ? [["invalid_syntax", "missing_separation", at, at]]
          : [],
        source,
      );
    }
  }
});

test("yaml: invalid property-bearing keys preserve block content and following pairs", () => {
  for (const [content, kind] of [
    ["- entry", "block_sequence"],
    ["nested: value", "block_mapping"],
    ["|\n  body", "literal_scalar"],
    [">\n  body", "folded_scalar"],
  ]) {
    const source = `?\n!t\n ${content}\nnext: end`;
    const nodes = parse(source);
    const boundary = source.indexOf("next");
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "invalid_implicit_key", 2, boundary],
      ["invalid_syntax", "missing_value_indicator", boundary, boundary],
    ]);
    const reason = nodes.find(({ kind }) => kind === "invalid_implicit_key");
    const key = nodes.find(
      ({ parent, field }) => nodes[parent] === reason && field === "key",
    );
    assert.equal(key.kind, "node_with_properties");
    const value = nodes.find(
      ({ parent, field }) => nodes[parent] === key && field === "content",
    );
    assert.equal(value.kind, kind);
    const next = nodes.find(
      ({ field, start }) => field === "key" && start === source.indexOf("next"),
    );
    assert.equal(nodes[next.parent].kind, "block_mapping_pair");
    assert.equal(next.end, source.indexOf("next") + 4);
  }
});

test("yaml: a completed invalid key releases the next line indentation", () => {
  const source = ":\n! -\n r";
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "invalid_implicit_key", 2, 6],
    ["invalid_syntax", "invalid_compact_collection", 4, 6],
    ["invalid_syntax", "missing_value_indicator", 6, 6],
    ["invalid_syntax", "invalid_indentation", 6, 7],
    ["incomplete_syntax", "missing_value_indicator", 8, 8],
  ]);
  const key = nodes.find(({ field, start }) => field === "key" && start === 7);
  assert.equal(nodes[key.parent].kind, "block_mapping_pair");
});

test("yaml: invalid inline collections use their actual column after multiline keys", () => {
  for (const content of ["- entry", "nested: value"]) {
    const source = `"first""\n": ${content}\nnext: end`;
    const nodes = parse(source);
    const boundary = source.indexOf("next");
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "unexpected_document_content", 7, boundary],
      ["invalid_syntax", "invalid_implicit_key", 7, 10],
      ["invalid_syntax", "missing_indentation", 9, 9],
      ["invalid_syntax", "invalid_compact_collection", 12, boundary],
      [
        "invalid_syntax",
        "unexpected_document_content",
        boundary,
        source.length,
      ],
    ]);
    const reason = nodes.find(
      ({ kind }) => kind === "invalid_compact_collection",
    );
    const value = nodes.find(
      ({ parent, field }) => nodes[parent] === reason && field === "value",
    );
    assert.equal(
      value.kind,
      content.startsWith("-") ? "block_sequence" : "block_mapping",
    );
    assert.equal(value.start, source.indexOf(content));
    const next = nodes.find(
      ({ field, start }) => field === "key" && start === source.indexOf("next"),
    );
    assert.equal(nodes[next.parent].kind, "block_mapping_pair");
  }
});

test("yaml: recovered collection indentation is restored before document boundaries", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const boundary of ["---", "...", "\ufeff---"]) {
      for (const content of ["- entry", "nested: value"]) {
        const prefix = `"first""${ending}": ${content}${ending}`;
        const source = `${prefix}${boundary}${ending}next: end`;
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [
          ["invalid_syntax", "unexpected_document_content", 7, prefix.length],
          ["invalid_syntax", "invalid_implicit_key", 7, 9 + ending.length],
          [
            "invalid_syntax",
            "missing_indentation",
            8 + ending.length,
            8 + ending.length,
          ],
          [
            "invalid_syntax",
            "invalid_compact_collection",
            11 + ending.length,
            prefix.length,
          ],
        ]);
        const documents = nodes.filter(({ kind }) => kind === "document");
        assert.equal(documents.length, 2);
        const mapping = nodes.find(
          ({ parent, field }) =>
            nodes[parent] === documents[1] && field === "content",
        );
        assert.equal(mapping.kind, "block_mapping");
        const key = nodes.find(
          ({ field, start }) =>
            field === "key" &&
            start === Buffer.byteLength(`${prefix}${boundary}${ending}`),
        );
        assert.equal(nodes[nodes[key.parent].parent], mapping);
      }
    }
  }
});

test("yaml: colon-prefixed scalars remain the content of their properties", () => {
  for (const source of [
    "!tag :plain",
    "&a :plain",
    "[!tag :plain]",
    "{!tag :plain}",
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], source);
    const owner = nodes.findIndex(
      ({ kind }) => kind === "node_with_properties",
    );
    const content = nodes.find(
      ({ parent, field }) => parent === owner && field === "content",
    );
    assert.equal(content?.kind, "plain_scalar", source);
    assert.equal(
      Buffer.from(source).subarray(content.start, content.end).toString(),
      ":plain",
      source,
    );
  }
});

test("yaml: a backslash followed by a literal tab is a quoted escape", () => {
  const nodes = parse('"\\\t"');
  assert.deepEqual(issues(nodes), []);
  assert.deepEqual(
    nodes
      .filter(({ kind }) => kind === "quoted_escape")
      .map(({ start, end }) => [start, end]),
    [[1, 3]],
  );
});

test("yaml: flow indicators require their own separation rules", () => {
  for (const { source, expected } of [
    {
      source: "{?}",
      expected: [["invalid_syntax", "invalid_scalar_start", 1, 2]],
    },
    {
      source: "{?,x}",
      expected: [["invalid_syntax", "invalid_scalar_start", 1, 2]],
    },
    {
      source: "[a:[b]]",
      expected: [["invalid_syntax", "missing_separation", 3, 3]],
    },
    {
      source: "{a:[b]}",
      expected: [["invalid_syntax", "missing_separation", 3, 3]],
    },
    {
      source: "[:[b]]",
      expected: [["invalid_syntax", "missing_separation", 2, 2]],
    },
    {
      source: "{:[b]}",
      expected: [["invalid_syntax", "missing_separation", 2, 2]],
    },
    { source: '{"a":[b]}', expected: [] },
    { source: "{? }", expected: [] },
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), expected, source);
    if (source.includes("[b]")) {
      const pair = nodes.findIndex(({ kind }) => kind === "flow_mapping_pair");
      assert.equal(
        nodes.find(({ parent, field }) => parent === pair && field === "value")
          ?.kind,
        "flow_sequence",
        source,
      );
      assert.equal(
        nodes.find(
          ({ parent, field }) => parent === pair && field === "indicator",
        )?.kind,
        "value_indicator",
        source,
      );
    }
  }
});

test("yaml: tabs never supply missing scalar indentation", () => {
  for (const quote of ['"', "'"]) {
    const source = `a: ${quote}x\n\t\ty${quote}`;
    assert.deepEqual(issues(parse(source)), [
      ["invalid_syntax", "invalid_indentation", 6, 8],
      ["invalid_syntax", "missing_indentation", 8, 8],
    ]);
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

test("yaml: a stream BOM starts the line context of the following line", () => {
  for (const [source, expected, entries, mappings] of [
    ["\n\uFEFF -\n -", [], 2, 0],
    ["\uFEFF\uFEFF -\n -", [], 2, 0],
    [
      "\n\uFEFF -\n |",
      [["invalid_syntax", "unexpected_document_content", 8, 9]],
      1,
      0,
    ],
    ["\n\uFEFF  a: b\n  c: d", [], 0, 1],
    [
      "\n\uFEFF a: b\nc: d",
      [["invalid_syntax", "unexpected_document_content", 10, 14]],
      0,
      2,
    ],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), expected, JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, ["block_sequence_entry", "block_mapping"]),
      [entries, mappings],
      JSON.stringify(source),
    );
  }
});

test("yaml: block collections cannot start beside a document marker", () => {
  for (const source of ["--- - a", "--- key: value"]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "invalid_compact_collection", 4, source.length],
    ]);
    const document = nodes.findIndex(({ kind }) => kind === "document");
    assert.equal(
      nodes.find(({ kind }) => kind === "syntax_issue").parent,
      document,
    );
    const reason = nodes.findIndex(
      ({ kind }) => kind === "invalid_compact_collection",
    );
    assert.equal(
      nodes.find(
        ({ parent, field }) => parent === reason && field === "content",
      ).kind,
      source === "--- - a" ? "block_sequence" : "block_mapping",
    );
  }
});

test("yaml: scalar and property combinations remain valid in each flow-node context", () => {
  for (const scalar of [
    "text",
    ":text",
    "?text",
    "-text",
    "a:b",
    "''",
    '""',
    "[]",
    "{}",
  ]) {
    for (const property of ["", "&name ", "!tag ", "!<tag:x> &name "]) {
      const value = property + scalar;
      for (const source of [
        value,
        `[${value}]`,
        `{key: ${value}}`,
        `{${value}: v}`,
        `key: ${value}`,
        `- ${value}`,
        `--- ${value}`,
      ]) {
        assert.deepEqual(issues(parse(source)), [], source);
      }
    }
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

test("yaml: malformed nested entries keep every cause and the following pair", () => {
  for (const { source, expected } of [
    {
      source: "a:\n  - b\n  -x\nz: v",
      expected: [
        ["invalid_syntax", "invalid_indentation", 9, 11],
        ["invalid_syntax", "missing_value_indicator", 13, 13],
      ],
    },
    {
      source: "? a\n:b\nz: v",
      expected: [["invalid_syntax", "missing_value_indicator", 6, 6]],
    },
    {
      source: "a:\n    b: c\n  - d\nz: v",
      expected: [
        ["invalid_syntax", "invalid_indentation", 12, 14],
        ["invalid_syntax", "unexpected_document_content", 14, 18],
        ["invalid_syntax", "unexpected_document_content", 18, 22],
      ],
    },
    {
      source: "[]\n\uFEFFx",
      expected: [["invalid_syntax", "missing_document_start", 6, 6]],
    },
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), expected, source);
    if (source.endsWith("z: v")) {
      const key = nodes.find(
        ({ kind, start }) =>
          kind === "plain_scalar" && start === source.length - 4,
      );
      assert.equal(key?.field, "key", source);
    }
  }
});

test("yaml: an overlong Unicode key owns its trailing separation inside the issue", () => {
  const source = `[${"名".repeat(1024)} : v]`;
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "invalid_implicit_key", 1, 3074],
  ]);
  const reason = nodes.findIndex(({ kind }) => kind === "invalid_implicit_key");
  assert.deepEqual(
    nodes
      .filter(({ parent }) => parent === reason)
      .map(({ kind, field, start, end }) => [kind, field, start, end]),
    [
      ["plain_scalar", "key", 1, 3073],
      ["separation", null, 3073, 3074],
    ],
  );
});

test("yaml: an escape stops before an independently invalid encoding", () => {
  assert.deepEqual(issues(parse(Buffer.from([34, 92, 255, 34]))), [
    ["invalid_syntax", "invalid_encoding", 2, 3],
  ]);
});

test("yaml: parses empty and basic structures", () => {
  for (const [source, expected] of [
    ["", "(stream)"],
    ["a", "(stream (document content: (plain_scalar (scalar_text))))"],
    [
      "a: b",
      "(stream (document content: (block_mapping (block_mapping_pair key: (plain_scalar (scalar_text)) indicator: (value_indicator) (separation) value: (plain_scalar (scalar_text))))))",
    ],
    [
      "- a",
      "(stream (document content: (block_sequence (block_sequence_entry indicator: (sequence_indicator) (separation) value: (plain_scalar (scalar_text))))))",
    ],
    [
      "[]",
      "(stream (document content: (flow_sequence opening: (flow_sequence_open) closing: (flow_sequence_close))))",
    ],
    [
      '"a"',
      "(stream (document content: (double_quoted_scalar opening: (quote_open) (scalar_text) closing: (quote_close))))",
    ],
  ]) {
    assert.equal(sexp(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: properties preserve names tags and empty content without resolution", () => {
  for (const [source, ...expected] of [
    ["&a scalar", 1, 0],
    ["*unresolved", 0, 1],
    ["&名前:part#x scalar", 1, 0],
    ["&a\nk: v", 1, 0],
    ["k: &a\n- one\n- two\nnext: *a", 1, 1],
    ["- &a\n- b", 1, 0],
    ["{&a k: !<tag:x> v, ref: *a}", 2, 1],
    ["[&a, !, !!str x, !h!item y, *a]", 4, 1],
    ["!local%20tag 'value'", 1, 0],
    ["!<tag:example.test,2026:/a[0]> &a {k: v}", 1, 0],
    ["&a !local [a, b]", 1, 0],
    ["&a key: value", 1, 0],
    ["*a : value", 0, 1],
    ["!!str |\n  value", 1, 0],
    ["--- &a\n--- *a", 1, 1],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, ["node_with_properties", "alias"]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: nested block collections restore parent indentation", () => {
  for (const [source, ...expected] of [
    ["?plain: value\n:plain: value\n'a''b': c", 1, 0],
    ["a:\n  b: c\nd: e", 2, 0],
    ["- - a\n- b", 0, 2],
    ["a:\n  b:\n    c: d\ne: f", 3, 0],
    ["? [a, b]\n: value\n?\n: empty\n? lone", 1, 0],
    ["? - a\n  - b\n: - c\n  - d", 1, 2],
    ["key:\n- one\n- two\nnext: value", 1, 1],
    ["- a: b\n  c: d\n- e: f", 2, 1],
    ["- ? a\n  : b\n  ? c\n  : d", 1, 1],
    ["-\n- b", 0, 1],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, ["block_mapping", "block_sequence"]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: flow pairs and scalar styles follow their context", () => {
  for (const [source, ...expected] of [
    ["[one, two,]", 0],
    ["[one, two: three]", 1],
    ["{one: two, empty: , key, : value,}", 4],
    ["[one: two, {three: four}, [five]]", 2],
    ["[? one: two, ? : empty, ? key]", 3],
    ["{? one: two, ? : empty, ? key}", 3],
    ['{"key":"value", [a,b]:[c,d], {}:{}}', 3],
    ["[http://example.test/a, foo:bar, a#b, ?plain, :plain]", 0],
    ["[a'b, a\"b]", 0],
    ["[plain\n  text, {multi\n  line: value}]", 1],
    [
      '"\\0\\a\\b\\t\\n\\v\\f\\r\\e\\ \\"\\/\\\\\\N\\_\\L\\P\\x41\\u3042\\U0001F600"',
      0,
    ],
    ["'a''b'", 0],
    ["'a  \n  b'", 0],
    ['"a\\\r\n  b"', 0],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, ["flow_mapping_pair"]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: block scalar continuations preserve text breaks and prefixes", () => {
  for (const [source, ...expected] of [
    ["key: one\n  two\n\n  three\nnext: value", 4, 6, 3, 2],
    ["key: 'one\n  two'\nnext: \"three\n  four\"", 2, 6, 2, 2],
    ["key:\n  [a,\n   b]\nnext: value", 5, 5, 0, 0],
    ["key: one # comment\nnext: value", 4, 4, 0, 0],
    ["- one\n  two\n- three", 2, 3, 1, 1],
    ["one\nnext", 1, 2, 1, 0],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, [
        "plain_scalar",
        "scalar_text",
        "scalar_line_break",
        "scalar_line_prefix",
      ]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: block scalar headers and line kinds preserve source", () => {
  for (const [source, ...expected] of [
    ["|", 1, 0, 0, 0, 0],
    [">-", 0, 1, 0, 0, 0],
    ["key: |\n  one\n  two\nnext: value", 1, 0, 2, 0, 0],
    ["key: >-\n  one\n    two\n\n  three\nnext: value", 0, 1, 2, 1, 1],
    ['- |2+ # header\n  : # "text"\n  \n- >+2\n  next', 1, 1, 2, 0, 1],
    ["|1\ntext\n", 1, 0, 1, 0, 0],
    ["|\n  \n   \n", 1, 0, 0, 0, 2],
    ["key: |\n  one\n  \t\nnext: value", 1, 0, 1, 1, 0],
    ["key: >\n \t\n text", 0, 1, 1, 1, 0],
    ["key: |1\n   \n", 1, 0, 0, 1, 0],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, [
        "literal_scalar",
        "folded_scalar",
        "block_scalar_line",
        "block_scalar_spaced_line",
        "block_scalar_empty_line",
      ]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: document markers separate contents without synthesizing empty scalars", () => {
  for (const [source, ...expected] of [
    ["---", 1, 1, 0, 0],
    ["---\n---\n...", 2, 2, 1, 0],
    ["--- one\n--- two\n...\nthree", 3, 2, 1, 3],
    ["a: b\n...\n﻿---\nc: d", 2, 1, 1, 4],
    ["|\ntext\n---\nnext", 2, 1, 0, 1],
    ["one\n---suffix\n...suffix", 1, 0, 0, 1],
    ["# prefix\n﻿# another\n--- # empty\n... # suffix", 1, 1, 1, 0],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, [
        "document",
        "document_start",
        "document_end",
        "plain_scalar",
      ]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: directives preserve parameters and do not apply semantic resolution", () => {
  for (const [source, ...expected] of [
    ["%YAML 1.2\n---\na: b", 1, 0, 0, 1],
    ["%YAML 9.7\n%YAML 1.2\n---", 2, 0, 0, 1],
    ["%TAG !h! tag:example.test,2026:\n--- !h!x value", 0, 1, 0, 1],
    ["%TAG ! !local\n%TAG !! tag:x%20y\n%TAG !! tag:z\n---", 0, 3, 0, 1],
    ["%OTHER one two#part # comment\n--- value", 0, 0, 1, 1],
    ["%任意 a,b\n---", 0, 0, 1, 1],
    ["%EMPTY\r---\r...\r%YAML 1.2\r---", 1, 0, 1, 2],
    [
      "%YAML 1.2 # version\r\n# header\r\n---\r\n|\r\n%TAG is content\r\n...",
      1,
      0,
      0,
      1,
    ],
    ["plain\n%YAML 1.2\n--- next", 0, 0, 0, 2],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [], JSON.stringify(source));
    assert.deepEqual(
      counts(nodes, [
        "yaml_directive",
        "tag_directive",
        "reserved_directive",
        "document",
      ]),
      expected,
      JSON.stringify(source),
    );
  }
});

test("yaml: layout comments bom and unicode preserve source extent", () => {
  for (const source of [
    "# comment\n",
    "﻿",
    " a ",
    "a:\r\n  b: café\r\nc: 日本語",
    "a:\r  b: c\rd: e",
  ]) {
    assert.deepEqual(issues(parse(source)), [], JSON.stringify(source));
  }
});

test("yaml: missing closings and invalid bytes have exact issue ranges", () => {
  for (const [source, expected] of [
    ["[a", [["incomplete_syntax", "missing_flow_sequence_close", 2, 2]]],
    ["{a: b", [["incomplete_syntax", "missing_flow_mapping_close", 5, 5]]],
    ['"abc', [["incomplete_syntax", "missing_quote_close", 4, 4]]],
    ['"\\q"', [["invalid_syntax", "invalid_escape", 1, 3]]],
    [
      Buffer.from([97, 255, 98]),
      [["invalid_syntax", "invalid_encoding", 1, 2]],
    ],
    [Buffer.from([97, 0, 98]), [["invalid_syntax", "invalid_character", 1, 2]]],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: indentation and compact value issues keep their owners", () => {
  for (const [source, expected] of [
    ["\tkey: value", [["invalid_syntax", "invalid_indentation", 0, 1]]],
    ['key: "one\ntwo"', [["invalid_syntax", "missing_indentation", 10, 10]]],
    ["key: [one,\ntwo]", [["invalid_syntax", "missing_indentation", 11, 11]]],
    [
      "key: nested: value",
      [["invalid_syntax", "invalid_compact_collection", 5, 18]],
    ],
    ["key: - value", [["invalid_syntax", "invalid_compact_collection", 5, 12]]],
    ['"x"# comment', [["invalid_syntax", "missing_separation", 3, 3]]],
    ["key: [one\ntwo]", [["invalid_syntax", "missing_indentation", 10, 10]]],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: block scalar header and indentation errors have exact ranges", () => {
  for (const [source, expected] of [
    ["|0", [["invalid_syntax", "invalid_header_character", 1, 2]]],
    [
      "|00++",
      [
        ["invalid_syntax", "invalid_header_character", 1, 3],
        ["invalid_syntax", "unexpected_chomping_indicator", 4, 5],
      ],
    ],
    ["|22", [["invalid_syntax", "unexpected_indentation_indicator", 2, 3]]],
    [
      "|222",
      [
        ["invalid_syntax", "unexpected_indentation_indicator", 2, 3],
        ["invalid_syntax", "unexpected_indentation_indicator", 3, 4],
      ],
    ],
    ["| 2", [["invalid_syntax", "unexpected_indentation_indicator", 2, 3]]],
    ["|++", [["invalid_syntax", "unexpected_chomping_indicator", 2, 3]]],
    ["| -", [["invalid_syntax", "unexpected_chomping_indicator", 2, 3]]],
    ["key: |\n   \n  text", [["invalid_syntax", "invalid_indentation", 9, 10]]],
    ["key: |3\n  text", [["invalid_syntax", "missing_indentation", 10, 10]]],
    [
      "key: |\n   first\n  second",
      [["invalid_syntax", "missing_indentation", 18, 18]],
    ],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: forbidden runs stop at normal text and independent escapes", () => {
  for (const [source, expected] of [
    [
      '"\u0001\u0002\u007f\ufeff\u0003\u0004"',
      [
        ["invalid_syntax", "invalid_character", 1, 3],
        ["invalid_syntax", "invalid_character", 7, 9],
      ],
    ],
    ["a\u0001\u0002b", [["invalid_syntax", "invalid_character", 1, 3]]],
    [
      "!<^^a^^%Q%R> x",
      [
        ["invalid_syntax", "invalid_tag_character", 2, 4],
        ["invalid_syntax", "invalid_tag_character", 5, 7],
        ["invalid_syntax", "invalid_uri_escape", 7, 8],
        ["invalid_syntax", "invalid_uri_escape", 9, 10],
      ],
    ],
    [
      "%TAG !^^a^^! tag:x\n--- x",
      [
        ["invalid_syntax", "invalid_tag_handle", 6, 8],
        ["invalid_syntax", "invalid_tag_handle", 9, 11],
      ],
    ],
    [
      '"\\q\\z"',
      [
        ["invalid_syntax", "invalid_escape", 1, 3],
        ["invalid_syntax", "invalid_escape", 3, 5],
      ],
    ],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: document boundaries make earlier closing issues invalid", () => {
  for (const [source, expected] of [
    ['"one\n---\ntwo', [["invalid_syntax", "missing_quote_close", 5, 5]]],
    [
      "[one\n---\ntwo",
      [["invalid_syntax", "missing_flow_sequence_close", 5, 5]],
    ],
    [
      "{a: b\n...\n---\nc",
      [["invalid_syntax", "missing_flow_mapping_close", 6, 6]],
    ],
    [
      "--- a\n... junk",
      [["invalid_syntax", "unexpected_document_end_content", 10, 14]],
    ],
    ["[a]\nb", [["invalid_syntax", "unexpected_document_content", 4, 5]]],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: flow separator and escape issues preserve minimal ranges", () => {
  for (const [source, expected] of [
    ["[,a]", [["invalid_syntax", "unexpected_flow_separator", 1, 2]]],
    ["[a,,b]", [["invalid_syntax", "unexpected_flow_separator", 3, 4]]],
    ["[[] []]", [["invalid_syntax", "missing_flow_separator", 4, 4]]],
    ["[{a: b]", [["invalid_syntax", "missing_flow_mapping_close", 6, 6]]],
    ['"\\u12G"', [["invalid_syntax", "invalid_escape", 1, 5]]],
    ['"\\uD800"', [["invalid_syntax", "invalid_escape", 1, 7]]],
    ['"\\U00110000"', [["invalid_syntax", "invalid_escape", 1, 11]]],
    [
      '"\\x1',
      [
        ["incomplete_syntax", "invalid_escape", 1, 4],
        ["incomplete_syntax", "missing_quote_close", 4, 4],
      ],
    ],
    ["@word", [["invalid_syntax", "invalid_scalar_start", 0, 1]]],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: property issues preserve exact causes and structured properties", () => {
  for (const [source, expected] of [
    ["&", [["incomplete_syntax", "missing_anchor_name", 1, 1]]],
    ["*", [["incomplete_syntax", "missing_alias_name", 1, 1]]],
    [
      "[&, *]",
      [
        ["invalid_syntax", "missing_anchor_name", 2, 2],
        ["invalid_syntax", "missing_alias_name", 5, 5],
      ],
    ],
    ["!!", [["incomplete_syntax", "missing_tag_suffix", 2, 2]]],
    ["[!!, x]", [["invalid_syntax", "missing_tag_suffix", 3, 3]]],
    ["!<>", [["invalid_syntax", "missing_tag_uri", 2, 2]]],
    [
      "!<",
      [
        ["incomplete_syntax", "missing_tag_uri", 2, 2],
        ["incomplete_syntax", "missing_verbatim_tag_close", 2, 2],
      ],
    ],
    ["!<tag:x", [["incomplete_syntax", "missing_verbatim_tag_close", 7, 7]]],
    ["!<tag:x value", [["invalid_syntax", "missing_verbatim_tag_close", 7, 7]]],
    ["!<x%G0>", [["invalid_syntax", "invalid_uri_escape", 3, 4]]],
    [
      "!<x%0",
      [
        ["incomplete_syntax", "invalid_uri_escape", 3, 5],
        ["incomplete_syntax", "missing_verbatim_tag_close", 5, 5],
      ],
    ],
    ["!bad_name!x value", [["invalid_syntax", "invalid_tag_handle", 4, 5]]],
    ["!local!x!y value", [["invalid_syntax", "invalid_tag_character", 8, 9]]],
    ["&a &b value", [["invalid_syntax", "duplicate_anchor", 3, 5]]],
    ["!one !two value", [["invalid_syntax", "duplicate_tag", 5, 9]]],
    ["&a *b", [["invalid_syntax", "properties_on_alias", 3, 5]]],
    ["!<x>[a]", [["invalid_syntax", "missing_separation", 4, 4]]],
    ["!<x>&a value", [["invalid_syntax", "missing_separation", 4, 4]]],
    ["&a - item", [["invalid_syntax", "invalid_compact_collection", 3, 9]]],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: directive issues separate lexical defects from missing structure", () => {
  for (const [source, expected] of [
    ["%\n---", [["invalid_syntax", "missing_directive_name", 1, 1]]],
    [
      "%",
      [
        ["incomplete_syntax", "missing_directive_name", 1, 1],
        ["incomplete_syntax", "missing_document_start", 1, 1],
      ],
    ],
    ["%YAML\n---", [["invalid_syntax", "missing_yaml_version", 5, 5]]],
    [
      "%YAML",
      [
        ["incomplete_syntax", "missing_yaml_version", 5, 5],
        ["incomplete_syntax", "missing_document_start", 5, 5],
      ],
    ],
    [
      "%YAML 1",
      [
        ["incomplete_syntax", "invalid_yaml_version", 6, 7],
        ["incomplete_syntax", "missing_document_start", 7, 7],
      ],
    ],
    ["%YAML 1.\n---", [["invalid_syntax", "invalid_yaml_version", 6, 8]]],
    ["%YAML 1.x\n---", [["invalid_syntax", "invalid_yaml_version", 6, 9]]],
    [
      "%YAML 1.2 extra\n---",
      [["invalid_syntax", "unexpected_directive_parameter", 10, 15]],
    ],
    [
      "%YAML 1.2\nvalue",
      [["invalid_syntax", "missing_document_start", 10, 10]],
    ],
    ["%YAML 1.2\n...", [["invalid_syntax", "missing_document_start", 10, 10]]],
    [
      "%TAG\n---",
      [
        ["invalid_syntax", "missing_tag_handle", 4, 4],
        ["invalid_syntax", "missing_tag_prefix", 4, 4],
      ],
    ],
    [
      "%TAG !h tag:x\n---",
      [["invalid_syntax", "missing_tag_handle_close", 7, 7]],
    ],
    ["%TAG bad tag:x\n---", [["invalid_syntax", "invalid_tag_handle", 5, 8]]],
    ["%TAG !h!\n---", [["invalid_syntax", "missing_tag_prefix", 8, 8]]],
    ["%TAG !!str\n---", [["invalid_syntax", "missing_separation", 7, 7]]],
    ["%TAG ! ,a\n---", [["invalid_syntax", "invalid_tag_character", 7, 8]]],
    [
      "%TAG ! tag:x%G0\n---",
      [["invalid_syntax", "invalid_uri_escape", 12, 13]],
    ],
    ["%YAML \0 1.2\n---", [["invalid_syntax", "invalid_character", 6, 7]]],
    [
      "%YAML \0\n---",
      [
        ["invalid_syntax", "invalid_character", 6, 7],
        ["invalid_syntax", "missing_yaml_version", 7, 7],
      ],
    ],
    ["%TAG \0!h! tag:x\n---", [["invalid_syntax", "invalid_character", 5, 6]]],
    [
      "%TAG \0\n---",
      [
        ["invalid_syntax", "invalid_character", 5, 6],
        ["invalid_syntax", "missing_tag_handle", 6, 6],
        ["invalid_syntax", "missing_tag_prefix", 6, 6],
      ],
    ],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
  for (const [source, field, kind] of [
    ["%YAML \0 1.2\n---", "version", "yaml_version"],
    ["%TAG \0!h! tag:x\n---", "handle", "named_tag_handle"],
  ]) {
    const nodes = parse(source);
    const node = nodes.find((node) => node.field === field);
    assert.equal(node?.kind, kind, source);
    assert.equal(
      nodes[node.parent].kind,
      `${field === "version" ? "yaml" : "tag"}_directive`,
    );
  }
});

test("yaml: a directive line starts a document that needs a preceding end marker", () => {
  for (const [source, at] of [
    ["a: b\n%X\n---", 5],
    ["- a\n%X\n---", 4],
    ["[a]\n%X\n---", 4],
    ["a:\n  b: |\n    c\n%X\n---", 16],
    ["a\n\uFEFF%X\n---", 5],
    ["---\n\uFEFF%X\n---", 7],
    ["%X\n---\n%Y\n---", 7],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [["invalid_syntax", "missing_document_end", at, at]],
      JSON.stringify(source),
    );
    const documents = nodes.filter(({ kind }) => kind === "document");
    assert.equal(documents.length, 2, JSON.stringify(source));
    const issue = nodes.find(({ kind }) => kind === "syntax_issue");
    assert.equal(nodes[issue.parent], documents[1], JSON.stringify(source));
    assert.ok(
      nodes.some(
        ({ kind, parent }) =>
          kind === "reserved_directive" && parent === issue.parent,
      ),
      JSON.stringify(source),
    );
  }
  for (const source of [
    "a\n...\n%X\n---",
    "a\n%X\n---",
    "%X\n%Y\n---",
    "\uFEFF%X\n---",
    "# c\n%X\n---",
  ]) {
    assert.deepEqual(issues(parse(source)), [], JSON.stringify(source));
  }
  assert.deepEqual(issues(parse("a: b\n%X")), [
    ["invalid_syntax", "missing_document_end", 5, 5],
    ["incomplete_syntax", "missing_document_start", 7, 7],
  ]);
  assert.deepEqual(issues(parse("[a,\n%X]")), [
    ["invalid_syntax", "invalid_scalar_start", 4, 5],
  ]);
});

test("yaml: bom is only content inside quoted scalars", () => {
  for (const [source, expected] of [
    ["a﻿b", [["invalid_syntax", "invalid_character", 1, 4]]],
    ["# a﻿b", [["invalid_syntax", "invalid_character", 3, 6]]],
    [
      "... a\uFEFFb",
      [
        ["invalid_syntax", "unexpected_document_end_content", 4, 5],
        ["invalid_syntax", "invalid_character", 5, 8],
        ["invalid_syntax", "unexpected_document_end_content", 8, 9],
      ],
    ],
    [
      "|a\uFEFFb\n x",
      [
        ["invalid_syntax", "invalid_header_character", 1, 2],
        ["invalid_syntax", "invalid_character", 2, 5],
        ["invalid_syntax", "invalid_header_character", 5, 6],
      ],
    ],
    ["!a\uFEFFb value", [["invalid_syntax", "invalid_character", 2, 5]]],
    ["!<a\uFEFFb> value", [["invalid_syntax", "invalid_character", 3, 6]]],
    ["!a\uFEFF!b value", [["invalid_syntax", "invalid_character", 2, 5]]],
    [
      "%TAG !h! a\uFEFFb\n---\nx",
      [["invalid_syntax", "invalid_character", 10, 13]],
    ],
    [
      "%TAG !h\uFEFF! tag:x\n---\nx",
      [["invalid_syntax", "invalid_character", 7, 10]],
    ],
    ['\uFEFF\uFEFF---\n"a\uFEFFb"', []],
    ["'a﻿b'", []],
    ['"a﻿b"', []],
  ]) {
    assert.deepEqual(issues(parse(source)), expected, JSON.stringify(source));
  }
});

test("yaml: comment and separation lines have no content indentation requirement", () => {
  for (const source of [
    "a: [b,\n\t# comment\n c]",
    "a: [b,\n\t\n c]",
    "a:\n\t# comment: x\n b",
    "a:\n  b: c\n  \t# comment: x\n  d: e",
  ]) {
    assert.deepEqual(issues(parse(source)), [], source);
  }
  assert.deepEqual(issues(parse("a: [b\n\t\n c]")), [
    ["invalid_syntax", "invalid_indentation", 6, 7],
  ]);
});

test("yaml: missing block colons distinguish line boundaries from eof", () => {
  for (const [source, outcome, position, pairs] of [
    ["a: b\nc", "incomplete_syntax", 6, 2],
    ["a: b\nc\nd: e", "invalid_syntax", 6, 3],
    ["a: b\n[]", "incomplete_syntax", 7, 2],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [[outcome, "missing_value_indicator", position, position]],
      JSON.stringify(source),
    );
    assert.deepEqual(counts(nodes, ["block_mapping_pair"]), [pairs]);
  }
});

test("yaml: implicit keys count Unicode characters, properties, and separation", () => {
  for (const [source, expected] of [
    [`[${"名".repeat(1024)}: value]`, 0],
    [`[${"名".repeat(1024)} : value]`, 1],
    [`${"名".repeat(1025)}: value`, 1],
    [`{${"名".repeat(1025)}: value}`, 0],
    [`[? ${"名".repeat(1025)}: value]`, 0],
    ['["a\n b": value]', 1],
    ["[plain\n text: value]", 1],
    ["{plain\n text: value}", 0],
    [`[&a ${"名".repeat(1021)}: value]`, 0],
    [`[&a ${"名".repeat(1022)}: value]`, 1],
    [`[[${"名".repeat(1022)}]: value]`, 0],
    [`[[${"名".repeat(1023)}]: value]`, 1],
    [`[${"x".repeat(2048)}, [short]: value]`, 0],
    ["[[\n short: value]: outer, [short]: value]", 1],
    ["[[\r short: value]: outer, [short]: value]", 1],
    ["[[\r\n short: value]: outer, [short]: value]", 1],
  ]) {
    const actual = issues(parse(source));
    assert.equal(actual.length, expected, JSON.stringify(source));
    for (const [outcome, reason] of actual) {
      assert.equal(outcome, "invalid_syntax");
      assert.equal(reason, "invalid_implicit_key");
    }
  }
});

test("yaml: a misaligned entry preserves the following pair and its fields", () => {
  const nodes = parse("a:\n  b: c\n d: e\nf: g");
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "invalid_indentation", 10, 11],
  ]);
  const pair = nodes.findIndex(
    ({ kind, start }) => kind === "block_mapping_pair" && start === 16,
  );
  assert.notEqual(pair, -1);
  const fields = nodes.filter(({ parent }) => parent === pair);
  const key = fields.find(({ field }) => field === "key");
  const value = fields.find(({ field }) => field === "value");
  assert.deepEqual(
    [key.start, key.end, value.start, value.end],
    [16, 17, 19, 20],
  );
});

test("yaml: block scalar prefixes preserve spaced content with LF, CRLF, and CR", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const source = ["key: >2-", "  one", "    two", "  ", "next: value"].join(
      newline,
    );
    const nodes = parse(source);
    const lines = nodes.flatMap((node, index) =>
      node.kind.startsWith("block_scalar_") &&
      node.kind !== "block_scalar_header"
        ? [index]
        : [],
    );
    assert.equal(lines.length, 3);
    for (const [index, expected] of ["one", "  two", undefined].entries()) {
      const children = nodes.filter(({ parent }) => parent === lines[index]);
      const prefix = children.find(({ field }) => field === "prefix");
      const text = children.find(({ kind }) => kind === "scalar_text");
      const ending = children.at(-1);
      const bytes = Buffer.from(source);
      assert.equal(bytes.subarray(prefix.start, prefix.end).toString(), "  ");
      assert.equal(
        text && bytes.subarray(text.start, text.end).toString(),
        expected,
      );
      assert.equal(
        bytes.subarray(ending.start, ending.end).toString(),
        newline,
      );
    }
  }
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
      Buffer.from([255, 254, 128]),
      Buffer.from(suffix),
    ]);
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "invalid_encoding", prefix.length, prefix.length + 3],
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
        Buffer.from([255, 254, 128]),
        Buffer.from(source.slice(byte)),
      ]);
      assert.deepEqual(
        issues(parse(input))
          .filter(([, reason]) => reason === "invalid_encoding")
          .map(([, , start, end]) => [start, end]),
        [[byte, byte + 3]],
        JSON.stringify({ source, byte }),
      );
    }
  }
});
