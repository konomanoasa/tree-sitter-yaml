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

test("yaml: extra block content preserves its collection and following members", () => {
  for (const { source, owner, members, content, kind, preceding = [] } of [
    {
      source: 'k: "a" x\nc: 2',
      owner: "block_mapping",
      members: ['k: "a"', "c: 2"],
      content: "x",
      kind: "plain_scalar",
    },
    {
      source: '- "a" x\n- b',
      owner: "block_sequence",
      members: ['- "a"', "- b"],
      content: "x",
      kind: "plain_scalar",
    },
    {
      source: '- "x"\n  foo\n- b',
      owner: "block_sequence",
      members: ['- "x"', "- b"],
      content: "foo",
      kind: "plain_scalar",
      preceding: [["invalid_syntax", "invalid_indentation", 6, 8]],
    },
    {
      source: "a:\n  - b\n  -x\n  - c\nz: v",
      owner: "block_sequence",
      members: ["- b", "- c"],
      content: "-x",
      kind: "plain_scalar",
    },
    {
      source: 'a:\n  b: "c" x\n  d: e\nz: v',
      owner: "block_mapping",
      members: ['b: "c"', "d: e"],
      content: "x",
      kind: "plain_scalar",
    },
    {
      source: "k: v\n- a\nc: d",
      owner: "block_mapping",
      members: ["k: v", "c: d"],
      content: "- a\n",
      kind: "block_sequence",
    },
    {
      source: "- a\nb: c\n- d",
      owner: "block_sequence",
      members: ["- a", "- d"],
      content: "b: c\n",
      kind: "block_mapping",
    },
  ]) {
    const nodes = parse(source);
    const start = source.indexOf(content);
    assert.deepEqual(
      issues(nodes),
      [
        ...preceding,
        [
          "invalid_syntax",
          "unexpected_collection_content",
          start,
          start + content.length,
        ],
      ],
      source,
    );
    const reason = nodes.find(
      ({ kind }) => kind === "unexpected_collection_content",
    );
    const issue = nodes[nodes[reason.parent].parent];
    const collection = nodes[issue.parent];
    assert.equal(collection.kind, owner);
    assert.deepEqual(
      nodes
        .filter(
          ({ parent, field }) =>
            nodes[parent] === reason && field === "content",
        )
        .map(({ kind, start, end }) => [kind, source.slice(start, end)]),
      [[kind, content]],
    );
    assert.deepEqual(
      nodes
        .filter(
          ({ parent, kind }) =>
            nodes[parent] === collection &&
            (kind === "block_mapping_pair" || kind === "block_sequence_entry"),
        )
        .map(({ start, end }) => source.slice(start, end)),
      members,
    );
    if (source.endsWith("z: v")) {
      const last = nodes.findLast(({ kind }) => kind === "block_mapping_pair");
      assert.equal(last.start, source.indexOf("z: v"));
      assert.equal(nodes[nodes[last.parent].parent].kind, "document");
    }
  }
});

test("yaml: extra nodes keep their normal structure and multiline boundaries", () => {
  for (const [content, kind] of [
    ["extra\n  continued", "plain_scalar"],
    ['"extra"', "double_quoted_scalar"],
    ["'extra'", "single_quoted_scalar"],
    ["[extra]", "flow_sequence"],
    ["{extra: value}", "flow_mapping"],
    ["*extra", "alias"],
    ["!tag extra", "node_with_properties"],
    ["|\n  extra\n", "literal_scalar"],
    ["nested: value\n", "block_mapping"],
  ]) {
    const source = `k: "a" ${content}\nc: 2`;
    const nodes = parse(source);
    const reason = nodes.find(
      ({ kind }) => kind === "unexpected_collection_content",
    );
    const node = nodes.find(
      ({ field, parent }) => field === "content" && nodes[parent] === reason,
    );
    assert.equal(node.kind, kind, source);
    assert.equal(node.start, 7);
    assert.ok(source.slice(node.start, node.end).startsWith(content));
    assert.equal(issues(nodes).length, 1, source);
    const mapping = nodes.find(({ kind }) => kind === "block_mapping");
    assert.deepEqual(
      nodes
        .filter(
          ({ field, parent }) =>
            field === "key" && nodes[nodes[parent].parent] === mapping,
        )
        .map(({ start, end }) => source.slice(start, end)),
      ["k", "c"],
    );
  }
  const nodes = parse('k: [] "a" [b]\nc: 2');
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "unexpected_collection_content", 6, 9],
    ["invalid_syntax", "unexpected_collection_content", 10, 13],
  ]);
  for (const source of ['k: "a" "extra\nc: 2', 'k: "a" [extra,\nc: 2']) {
    const nodes = parse(source);
    const extra = nodes.find(
      ({ kind }) => kind === "unexpected_collection_content",
    );
    assert.equal(extra.end, source.length);
    assert.equal(counts(nodes, ["block_mapping_pair"])[0], 1);
    assert.equal(issues(nodes).at(-1)[0], "incomplete_syntax");
  }
  const source = "k: first\n  second\nc: 2";
  const valid = parse(source);
  assert.deepEqual(issues(valid), []);
  assert.deepEqual(
    valid
      .filter(({ field }) => field === "value")
      .map(({ start, end }) => source.slice(start, end)),
    ["first\n  second", "2"],
  );
});

test("yaml: recovered collections close at physical document boundaries", () => {
  for (const ending of ["\n", "\r\n", "\r"]) {
    for (const boundary of ["---", "...", "\ufeff---"]) {
      const prefix = `- a${ending}b: c${ending}`;
      const source = `${prefix}${boundary}${ending}next: value`;
      const nodes = parse(source);
      assert.deepEqual(
        issues(nodes),
        [
          [
            "invalid_syntax",
            "unexpected_collection_content",
            3 + ending.length,
            prefix.length,
          ],
        ],
        source,
      );
      const documents = nodes.filter(({ kind }) => kind === "document");
      assert.equal(documents.length, 2);
      const mapping = nodes.find(
        ({ kind, parent }) =>
          kind === "block_mapping" && nodes[parent] === documents[1],
      );
      assert.equal(
        mapping.start,
        Buffer.byteLength(`${prefix}${boundary}${ending}`),
      );
    }
  }
});

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
      assert.equal(properties.end, at - 1);
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
      ["invalid_syntax", "unexpected_collection_content", at, at + 1],
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
        ["invalid_syntax", "unexpected_collection_content", at, source.length],
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

test("yaml: unfinished document markers in collection keys remain key text", () => {
  for (const { key, adjacentEntry } of [
    { key: "[a,\n-#x]", adjacentEntry: false },
    { key: "[a,\n--#x]", adjacentEntry: false },
    { key: "[a,\n.#x]", adjacentEntry: false },
    { key: "[a,\n...#x]", adjacentEntry: false },
    { key: "{a: b,\n-#x: y}", adjacentEntry: false },
    { key: '[[a]\n-:"]', adjacentEntry: true },
  ]) {
    const source = `${key}: value`;
    const nodes = parse(source);
    const line = key.indexOf("\n") + 1;
    assert.deepEqual(
      issues(nodes),
      [
        ["invalid_syntax", "invalid_implicit_key", 0, key.length],
        ["invalid_syntax", "missing_indentation", line, line],
        ...(adjacentEntry
          ? [["invalid_syntax", "missing_flow_separator", line, line]]
          : []),
      ],
      source,
    );
    const collection = nodes.find(({ field }) => field === "key");
    assert.deepEqual([collection.start, collection.end], [0, key.length]);
    assert.equal(nodes[collection.parent].kind, "invalid_implicit_key");
    const value = nodes.find(
      ({ field, parent }) =>
        field === "value" && nodes[parent].kind === "block_mapping_pair",
    );
    assert.equal(source.slice(value.start, value.end), "value", source);
  }
});

test("yaml: stream character issues do not make following block collections compact", () => {
  for (const { damage, reason } of [
    { damage: Buffer.from([1, 2]), reason: "invalid_character" },
    { damage: Buffer.from([0xff, 0xfe]), reason: "invalid_encoding" },
  ]) {
    for (const prefix of ["", "...\n", "---\na: b\n...\n"]) {
      for (const [content, kind] of [
        ["a: b", "block_mapping"],
        ["- a", "block_sequence"],
      ]) {
        const source = Buffer.concat([
          Buffer.from(prefix),
          damage,
          Buffer.from(content),
        ]);
        const nodes = parse(source);
        assert.deepEqual(issues(nodes), [
          [
            "invalid_syntax",
            reason,
            prefix.length,
            prefix.length + damage.length,
          ],
        ]);
        const issue = nodes.find(({ kind }) => kind === "syntax_issue");
        assert.equal(nodes[issue.parent].kind, "stream");
        const collection = nodes.find(
          (node) =>
            node.kind === kind && node.start === prefix.length + damage.length,
        );
        assert.deepEqual(
          [collection.field, collection.end, nodes[collection.parent].kind],
          ["content", source.length, "document"],
        );
      }
    }
  }
  const source = "\x01a: b\n c: d";
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "invalid_character", 0, 1],
  ]);
  const pairs = nodes.filter(({ kind }) => kind === "block_mapping_pair");
  assert.deepEqual(
    pairs.map(({ start, end }) => [start, end]),
    [
      [1, 5],
      [7, 11],
    ],
  );
  assert.equal(pairs[0].parent, pairs[1].parent);
});

test("yaml: only collections on the document marker line are compact", () => {
  for (const content of ["a: b", "- a"]) {
    assert.deepEqual(issues(parse(`--- ${content}`)), [
      ["invalid_syntax", "invalid_compact_collection", 4, 4 + content.length],
    ]);
    for (const ending of ["\n", "\r", "\r\n"]) {
      assert.deepEqual(issues(parse(`---${ending}${content}`)), []);
      assert.deepEqual(issues(parse(`---${ending}\x01${content}`)), [
        [
          "invalid_syntax",
          "invalid_character",
          3 + ending.length,
          4 + ending.length,
        ],
      ]);
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
          "tab_in_indentation",
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

test("yaml: multiline property keys recover same-indent colons outside the key range", () => {
  for (const [content, kind] of [
    ["- entry", "block_sequence"],
    ["nested: value", "block_mapping"],
    ["|\n  body", "literal_scalar"],
    [">\n  body", "folded_scalar"],
  ]) {
    for (const [outer, indentation] of [
      ["", ""],
      ["", " "],
      ["outer:\n", "  "],
    ]) {
      for (const ending of ["\n", "\r", "\r\n"]) {
        const prefix =
          `${outer}${indentation}?\n${indentation}!t\n${indentation} ${content.replaceAll("\n", `\n${indentation}`)}`.replaceAll(
            "\n",
            ending,
          );
        assert.deepEqual(
          issues(parse(prefix)),
          [
            [
              "invalid_syntax",
              "invalid_implicit_key",
              prefix.indexOf("!t"),
              prefix.length,
            ],
            [
              "incomplete_syntax",
              "missing_value_indicator",
              prefix.length,
              prefix.length,
            ],
          ],
          prefix,
        );
        const source = `${prefix}${ending}${indentation}: value${ending}${indentation}next: end`;
        const nodes = parse(source);
        const keyEnd = prefix.length + ending.length;
        assert.deepEqual(
          issues(nodes),
          [
            [
              "invalid_syntax",
              "invalid_implicit_key",
              prefix.indexOf("!t"),
              keyEnd,
            ],
          ],
          source,
        );
        const reason = nodes.find(
          ({ kind }) => kind === "invalid_implicit_key",
        );
        const key = nodes.find(
          ({ parent, field }) => nodes[parent] === reason && field === "key",
        );
        const contentNode = nodes.find(
          ({ parent, field }) => nodes[parent] === key && field === "content",
        );
        assert.deepEqual(
          [key.kind, key.end, contentNode.kind],
          ["node_with_properties", keyEnd, kind],
        );
        const pair = nodes[nodes[nodes[reason.parent].parent].parent];
        const indicator = nodes.find(
          ({ kind, start }) =>
            kind === "value_indicator" && start === keyEnd + indentation.length,
        );
        assert.equal(nodes[indicator.parent], pair);
        if (indentation) {
          const linePrefix = nodes.find(
            ({ kind, start }) => kind === "line_prefix" && start === keyEnd,
          );
          assert.deepEqual(
            [linePrefix.end, nodes[linePrefix.parent]],
            [indicator.start, pair],
          );
        }
        const next = nodes.find(
          ({ field, start }) =>
            field === "key" && start === source.indexOf("next"),
        );
        assert.equal(nodes[nodes[next.parent].parent], nodes[pair.parent]);
      }
    }
  }
});

test("yaml: multiline key recovery preserves colon boundaries and plain key termination", () => {
  for (const indentation of ["", " ", "  "]) {
    const prefix = `${indentation}?\n${indentation}plain`;
    const source = `${prefix}\n${indentation}: value`;
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      [
        "invalid_syntax",
        "missing_value_indicator",
        prefix.length,
        prefix.length,
      ],
    ]);
    const key = nodes.find(({ field }) => field === "key");
    const indicator = nodes.find(({ kind }) => kind === "value_indicator");
    assert.notEqual(key.parent, indicator.parent);
  }
  const prefix = " ?\n !t\n  - a\n";
  for (const { suffix, expected, keyEnd = prefix.length } of [
    { suffix: " :", expected: [] },
    {
      suffix: " :value",
      expected: [
        [
          "invalid_syntax",
          "missing_value_indicator",
          prefix.length,
          prefix.length,
        ],
        [
          "incomplete_syntax",
          "missing_value_indicator",
          prefix.length + 7,
          prefix.length + 7,
        ],
      ],
    },
    {
      suffix: "  : v",
      keyEnd: prefix.length + 5,
      expected: [
        [
          "invalid_syntax",
          "unexpected_collection_content",
          prefix.length + 2,
          prefix.length + 5,
        ],
        [
          "incomplete_syntax",
          "missing_value_indicator",
          prefix.length + 5,
          prefix.length + 5,
        ],
      ],
    },
    {
      suffix: " \t: v",
      expected: [
        [
          "invalid_syntax",
          "tab_in_indentation",
          prefix.length + 1,
          prefix.length + 2,
        ],
      ],
    },
  ]) {
    assert.deepEqual(
      issues(parse(prefix + suffix)),
      [["invalid_syntax", "invalid_implicit_key", 4, keyEnd], ...expected],
      suffix,
    );
  }
  const scalarKey = " ?\n !t\n  |\n   b\n";
  for (const layout of ["  ", " \t# c", " \t\n #c"]) {
    assert.deepEqual(
      issues(parse(scalarKey + layout)),
      [
        ["invalid_syntax", "invalid_implicit_key", 4, scalarKey.length],
        [
          "incomplete_syntax",
          "missing_value_indicator",
          scalarKey.length + layout.length,
          scalarKey.length + layout.length,
        ],
      ],
      layout,
    );
  }
  assert.deepEqual(issues(parse(`${scalarKey} \t# c\n : v`)), [
    ["invalid_syntax", "invalid_implicit_key", 4, scalarKey.length + 6],
    [
      "invalid_syntax",
      "missing_indentation",
      scalarKey.length + 1,
      scalarKey.length + 1,
    ],
  ]);
});

test("yaml: block scalar keys recover colons across comments owned by the pair", () => {
  for (const [style, kind] of [
    ["|", "literal_scalar"],
    [">", "folded_scalar"],
  ]) {
    for (const [outer, indent] of [
      ["", ""],
      ["", " "],
      ["outer:\n", "  "],
    ]) {
      for (const ending of ["\n", "\r", "\r\n"]) {
        const prefix =
          `${outer}${indent}?\n${indent}!t\n${indent} ${style}\n${indent}  body\n`.replaceAll(
            "\n",
            ending,
          );
        const layout = `${indent}# first${ending}${ending} \t# second${ending}`;
        const source = `${prefix}${layout}${indent}: value`;
        const nodes = parse(source);
        assert.deepEqual(
          issues(nodes),
          [
            [
              "invalid_syntax",
              "invalid_implicit_key",
              prefix.indexOf("!t"),
              prefix.length,
            ],
          ],
          source,
        );
        const key = nodes.find(
          ({ kind, field }) =>
            kind === "node_with_properties" && field === "key",
        );
        const scalar = nodes.find((node) => node.kind === kind);
        assert.equal(key.end, prefix.length);
        assert.equal(scalar.end, prefix.length);
        const indicator = nodes.find(
          ({ kind, start }) =>
            kind === "value_indicator" &&
            start === prefix.length + layout.length + indent.length,
        );
        const pair = nodes[indicator.parent];
        assert.deepEqual(
          [pair.kind, pair.start, pair.end],
          ["block_mapping_pair", key.start, source.length],
        );
        const comments = nodes.filter(({ kind }) => kind === "comment");
        assert.equal(comments.length, 2);
        for (const node of nodes.filter(
          ({ kind, start }) =>
            start >= prefix.length &&
            ["comment", "line_break", "line_prefix"].includes(kind),
        )) {
          assert.equal(nodes[node.parent], pair);
        }
      }
    }
  }
});

test("yaml: missing colons after block key comments occur at the recovery boundary", () => {
  const prefix = "outer:\n  ?\n  !t\n   |\n    body\n";
  const keyIssue = [
    "invalid_syntax",
    "invalid_implicit_key",
    prefix.indexOf("!t"),
    prefix.length,
  ];
  for (const layout of ["#c", "#c\n", "#c\n \t", "#c\n\n  # more"]) {
    const source = prefix + layout;
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [
        keyIssue,
        [
          "incomplete_syntax",
          "missing_value_indicator",
          source.length,
          source.length,
        ],
      ],
      source,
    );
    assert.deepEqual(issues(parse(`${source}\n  : value`)), [keyIssue], source);
  }
  const layout = "#c\n\n";
  const boundary = prefix.length + layout.length;
  for (const suffix of [
    "  next: value",
    "---\nnext: value",
    "...",
    ": value",
    "  :text: value",
  ]) {
    const source = prefix + layout + suffix;
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [
        keyIssue,
        ["invalid_syntax", "missing_value_indicator", boundary, boundary],
      ],
      source,
    );
    const missing = nodes.find(
      ({ kind }) => kind === "missing_value_indicator",
    );
    const pair = nodes[nodes[nodes[missing.parent].parent].parent];
    assert.deepEqual(
      [pair.kind, pair.start, pair.end],
      ["block_mapping_pair", prefix.indexOf("!t"), boundary],
    );
    const comment = nodes.find(({ kind }) => kind === "comment");
    assert.equal(nodes[comment.parent], pair);
    const next = nodes.find(
      ({ kind, start }) =>
        start >= boundary &&
        ["value_indicator", "document_start", "document_end"].includes(kind),
    );
    assert.ok(next);
    assert.notEqual(nodes[next.parent], pair);
  }
});

test("yaml: comment recovery retains explicit and collection keys and plain key boundaries", () => {
  for (const style of ["|", ">"]) {
    const nodes = parse(`? ${style}\n body\n#c\n: value`);
    assert.deepEqual(issues(nodes), []);
    const key = nodes.find(({ field }) => field === "key");
    const indicator = nodes.find(({ kind }) => kind === "value_indicator");
    const comment = nodes.find(({ kind }) => kind === "comment");
    assert.equal(key.parent, indicator.parent);
    assert.equal(comment.parent, indicator.parent);
  }
  for (const content of ["- a", "a: b"]) {
    const source = `?\n!t\n ${content}\n#c\n: value`;
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "invalid_implicit_key", 2, source.lastIndexOf(":")],
    ]);
    const indicator = nodes.find(
      ({ kind, start }) =>
        kind === "value_indicator" && start === source.lastIndexOf(":"),
    );
    const pair = nodes[indicator.parent];
    assert.deepEqual(
      [pair.kind, pair.start, pair.end],
      ["block_mapping_pair", 2, source.length],
    );
  }
  const source = "?\nplain\n#c\n: value";
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "missing_value_indicator", 7, 7],
  ]);
  const key = nodes.find(({ field }) => field === "key");
  const indicator = nodes.find(({ kind }) => kind === "value_indicator");
  assert.notEqual(key.parent, indicator.parent);
});

test("yaml: a dedented colon after a multiline property key belongs to the enclosing mapping", () => {
  for (const content of [
    "- entry",
    "nested: value",
    "|\n    body",
    ">\n    body",
  ]) {
    const source = `x:\n  ?\n  !t\n   ${content}\n: end`;
    const nodes = parse(source);
    const boundary = source.lastIndexOf(":");
    assert.deepEqual(issues(nodes), [
      ["invalid_syntax", "invalid_implicit_key", 9, boundary],
      ["invalid_syntax", "missing_value_indicator", boundary, boundary],
    ]);
    const indicator = nodes.find(
      ({ kind, start }) => kind === "value_indicator" && start === boundary,
    );
    const pair = nodes[indicator.parent];
    assert.deepEqual(
      [pair.kind, nodes[pair.parent].kind, nodes[pair.parent].start],
      ["block_mapping_pair", "block_mapping", 0],
    );
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
      ["invalid_syntax", "tab_in_indentation", 6, 8],
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
      [["invalid_syntax", "unexpected_collection_content", 8, 9]],
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
      expected: [["invalid_syntax", "unexpected_collection_content", 11, 13]],
    },
    {
      source: "? a\n:b\nz: v",
      expected: [["invalid_syntax", "missing_value_indicator", 6, 6]],
    },
    {
      source: "a:\n    b: c\n  - d\nz: v",
      expected: [
        ["invalid_syntax", "invalid_indentation", 12, 14],
        ["invalid_syntax", "unexpected_collection_content", 14, 18],
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
    ["\tkey: value", [["invalid_syntax", "tab_in_indentation", 0, 1]]],
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
    [
      "|2+2+",
      [
        ["invalid_syntax", "unexpected_indentation_indicator", 3, 4],
        ["invalid_syntax", "unexpected_chomping_indicator", 4, 5],
      ],
    ],
    [
      "|+2+2",
      [
        ["invalid_syntax", "unexpected_chomping_indicator", 3, 4],
        ["invalid_syntax", "unexpected_indentation_indicator", 4, 5],
      ],
    ],
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
    [
      "&a &b !t !u &c value",
      [
        ["invalid_syntax", "duplicate_anchor", 3, 5],
        ["invalid_syntax", "duplicate_tag", 9, 11],
        ["invalid_syntax", "duplicate_anchor", 12, 14],
      ],
    ],
    [
      "!t !u &a &b !v value",
      [
        ["invalid_syntax", "duplicate_tag", 3, 5],
        ["invalid_syntax", "duplicate_anchor", 9, 11],
        ["invalid_syntax", "duplicate_tag", 12, 14],
      ],
    ],
    [
      "!<t>&a !<u>&b value",
      [
        ["invalid_syntax", "missing_separation", 4, 4],
        ["invalid_syntax", "duplicate_tag", 7, 11],
        ["invalid_syntax", "missing_separation", 11, 11],
        ["invalid_syntax", "duplicate_anchor", 11, 13],
      ],
    ],
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
    ["%TAG ! ,a\n---", [["invalid_syntax", "invalid_tag_prefix_start", 7, 8]]],
    ["%TAG ! {>a\n---", [["invalid_syntax", "invalid_tag_character", 7, 9]]],
    [
      "%TAG ! ]}a\n---",
      [
        ["invalid_syntax", "invalid_tag_prefix_start", 7, 8],
        ["invalid_syntax", "invalid_tag_character", 8, 9],
      ],
    ],
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
    ["invalid_syntax", "tab_in_indentation", 6, 7],
  ]);
});

test("yaml: missing block colons distinguish continuable keys from closed boundaries", () => {
  for (const [source, outcome, position, pairs] of [
    ["a: b\nc", "incomplete_syntax", 6, 2],
    ["a: b\nc\n", "incomplete_syntax", 6, 2],
    ["a: b\nc\r", "incomplete_syntax", 6, 2],
    ["a: b\nc\r\n", "incomplete_syntax", 6, 2],
    ["a: b\nc\n\n \t", "incomplete_syntax", 6, 2],
    ["a: b\nc #c", "invalid_syntax", 7, 2],
    ["a: b\nc\n#c\n", "invalid_syntax", 6, 2],
    ["a: b\nc\nd: e", "invalid_syntax", 6, 3],
    ["a: b\nc\n---\nd: e", "invalid_syntax", 6, 3],
    ["a: b\nc\n:", "invalid_syntax", 6, 3],
    ["a: b\n[]", "incomplete_syntax", 7, 2],
    ["a: b\n[]\n", "invalid_syntax", 7, 2],
    ['a: b\n"c"\n', "invalid_syntax", 8, 2],
    ["a: b\n'c'\n", "invalid_syntax", 8, 2],
    ["a: b\n*x\n", "invalid_syntax", 7, 2],
    ["a: b\n!t\n", "incomplete_syntax", 7, 2],
    ["a: b\n!t\n\n \t", "incomplete_syntax", 7, 2],
    ["a: b\n!t #c", "incomplete_syntax", 8, 2],
    ["a: b\n!t\n#c\n", "incomplete_syntax", 7, 2],
    ["a: b\n!t &a\n#c\n \t", "incomplete_syntax", 10, 2],
    ["a: b\n!t c\n", "incomplete_syntax", 9, 2],
    ['a: b\n!t "c"\n', "invalid_syntax", 11, 2],
    ["a: b\n!t\nd: e", "invalid_syntax", 7, 3],
    ["a: b\n!t\n---\nd: e", "invalid_syntax", 7, 3],
  ]) {
    const nodes = parse(source);
    assert.deepEqual(
      issues(nodes),
      [[outcome, "missing_value_indicator", position, position]],
      JSON.stringify(source),
    );
    assert.deepEqual(counts(nodes, ["block_mapping_pair"]), [pairs]);
  }
  for (const { source, keyEnd } of [
    { source: "k: 1\na\n  x: v", keyEnd: 10 },
    { source: "k: 1\na\n\n \t\n  x: v", keyEnd: 14 },
    { source: "k: 1\n!t\n  x: v\n: w", keyEnd: 15 },
    { source: "k: 1\n!t #c\n  x: v\n: w", keyEnd: 18 },
    { source: "k: 1\n!t &a\n#c\n \t\n  x: v\n: w", keyEnd: 24 },
  ]) {
    assert.deepEqual(
      issues(parse(source)),
      [["invalid_syntax", "invalid_implicit_key", 5, keyEnd]],
      source,
    );
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
    `k: 1\n${"a".repeat(1025)}:`,
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
  const key = `!u ${"a".repeat(1021)}`;
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
    assert.deepEqual(issues(parse(source)), expected, source.slice(0, 16));
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
      source: `!\n!u ${"a".repeat(1022)}`,
      completion: ": ",
      expected: [["incomplete_syntax", "duplicate_tag", 2, 4]],
      completed: [["invalid_syntax", "invalid_implicit_key", 2, 1027]],
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

test("yaml: document markers at EOF remain provisional until separated", () => {
  for (const [opening, closing, reason] of [
    ["[a\n", "]", "missing_flow_sequence_close"],
    ["{a\n", "}", "missing_flow_mapping_close"],
    ["'\n", "'", "missing_quote_close"],
    ['"\n', '"', "missing_quote_close"],
  ]) {
    for (const marker of ["---", "..."]) {
      const source = opening + marker;
      assert.deepEqual(
        issues(parse(source)),
        [["incomplete_syntax", reason, opening.length, opening.length]],
        source,
      );
      assert.deepEqual(issues(parse(`${source}x${closing}`)), [], source);
      for (const boundary of [" ", "\n"]) {
        assert.deepEqual(
          issues(parse(source + boundary)),
          [["invalid_syntax", reason, opening.length, opening.length]],
          source + boundary,
        );
      }
      const key = `k: 1\n${opening}`;
      const keyIssues = (outcome) => [
        ["invalid_syntax", "invalid_implicit_key", 5, key.length],
        [outcome, reason, key.length, key.length],
        [outcome, "missing_value_indicator", key.length, key.length],
      ];
      assert.deepEqual(
        issues(parse(key + marker)),
        keyIssues("incomplete_syntax"),
        key + marker,
      );
      assert.deepEqual(
        issues(parse(`${key}${marker}x${closing}: v`)),
        [
          ["invalid_syntax", "invalid_implicit_key", 5, key.length + 5],
          ["invalid_syntax", "missing_indentation", key.length, key.length],
        ],
        key + marker,
      );
      for (const boundary of [" ", "\n"]) {
        assert.deepEqual(
          issues(parse(key + marker + boundary)),
          keyIssues("invalid_syntax"),
          key + marker + boundary,
        );
      }
    }
  }
  for (const [prefix, reason] of [
    ["%YAML 1.2\n", "missing_document_start"],
    ["[]\n", "unexpected_document_content"],
    ["|2\n", "missing_indentation"],
  ]) {
    for (const marker of reason === "missing_document_start"
      ? ["---"]
      : ["---", "..."]) {
      for (const length of [1, 2]) {
        const source = prefix + marker.slice(0, length);
        const end =
          reason === "unexpected_document_content"
            ? source.length
            : prefix.length;
        assert.deepEqual(
          issues(parse(source)),
          [["incomplete_syntax", reason, prefix.length, end]],
          source,
        );
        assert.deepEqual(issues(parse(prefix + marker)), [], prefix + marker);
        for (const boundary of [" ", "\n"]) {
          const fixed = issues(parse(source + boundary));
          assert.equal(fixed.length, 1, source + boundary);
          assert.deepEqual(
            fixed[0].slice(0, 2),
            ["invalid_syntax", reason],
            source + boundary,
          );
        }
      }
    }
  }
});

test("yaml: property-only nodes release trailing layout before keys and delimiters", () => {
  for (const { source, start, end, field, expected = [] } of [
    { source: "a: !t # c\n\n  \nb: c", start: 3, end: 5, field: "value" },
    { source: "{!t : a}", start: 1, end: 3, field: "key" },
    { source: "[!t , a]", start: 1, end: 3, field: null },
    { source: "!t &a # c\n\n", start: 0, end: 5, field: "content" },
    { source: "a: !t # c\n...", start: 3, end: 5, field: "value" },
    {
      source: "?\n!t\n : item\nnext: end",
      start: 2,
      end: 4,
      field: "key",
      expected: [
        ["invalid_syntax", "missing_value_indicator", 4, 4],
        ["invalid_syntax", "invalid_indentation", 5, 6],
      ],
    },
    {
      source: "k: &a\n-!<tag:x> one\nnext: *a",
      start: 3,
      end: 5,
      field: "value",
      expected: [["invalid_syntax", "missing_value_indicator", 19, 19]],
    },
  ]) {
    const nodes = parse(source);
    assert.deepEqual(issues(nodes), expected, source);
    const properties = nodes.find(
      (node) => node.kind === "node_with_properties",
    );
    assert.deepEqual(
      [properties.start, properties.end, properties.field],
      [start, end, field],
      source,
    );
    assert.ok(
      !nodes.some(
        (node) =>
          node.parent === nodes.indexOf(properties) && node.field === "content",
      ),
      source,
    );
  }
});

test("yaml: distinct indentation and tag-prefix faults have distinct reasons", () => {
  assert.deepEqual(issues(parse("a:\n  b: c\n \td: e\nz: v")), [
    ["invalid_syntax", "invalid_indentation", 10, 11],
    ["invalid_syntax", "tab_in_indentation", 11, 12],
  ]);
  assert.deepEqual(issues(parse("%TAG ! ]}\n---")), [
    ["invalid_syntax", "invalid_tag_prefix_start", 7, 8],
    ["invalid_syntax", "invalid_tag_character", 8, 9],
  ]);
});
