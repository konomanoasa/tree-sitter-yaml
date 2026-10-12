import assert from "node:assert/strict";
import { test } from "node:test";
import { counts, issues } from "./support/cst.js";
import {
  applyEdits,
  assertEditHistory,
  assertIncrementalEqualsFresh,
  parse,
} from "./support/parser.js";

const implicitKeyCharacterLimit = 1024;

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
    ...["b:\n", "b: !t\n", "? b\n:\n", "?\n"].map((content) => ({
      source: `- a\n${content}- d`,
      owner: "block_sequence",
      members: ["- a", "- d"],
      content,
      kind: "block_mapping",
    })),
    {
      source: "x:\n  - a\n  b:\n  - d\nz: v",
      owner: "block_sequence",
      members: ["- a", "- d"],
      content: "b:\n",
      kind: "block_mapping",
    },
    {
      source: 'x:\n  - "a\n "b:\n  - d',
      owner: "block_sequence",
      members: ['- "a\n "', "- d"],
      content: "b:\n",
      kind: "block_mapping",
      preceding: [["invalid_syntax", "missing_indentation", 11, 11]],
    },
    {
      source: 'x:\n  k: "a\n "b:\n  - d',
      owner: "block_mapping",
      members: ['k: "a\n "'],
      content: "b:\n  - d",
      kind: "block_mapping",
      preceding: [["invalid_syntax", "missing_indentation", 12, 12]],
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

test("yaml: same-indent collections opened mid-line return later members to their parent", () => {
  for (const example of [
    {
      source: 'x:\n  - "a\n "- b\n  - c',
      owner: "block_sequence",
      first: '- "a\n "',
      last: "- c",
      child: "- b\n",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 16],
      ],
    },
    {
      source: 'x:\n  k: "a\n "b: 1\n  c: 2',
      owner: "block_mapping",
      first: 'k: "a\n "',
      last: "c: 2",
      child: "b: 1\n",
      expected: [
        ["invalid_syntax", "missing_indentation", 12, 12],
        ["invalid_syntax", "unexpected_collection_content", 13, 18],
      ],
    },
    {
      source: '-    "a\n b": ? c\n     d: e',
      owner: "block_mapping",
      first: '"a\n b": ? c\n',
      last: "d: e",
      child: "? c\n",
      expected: [
        ["invalid_syntax", "invalid_implicit_key", 5, 11],
        ["invalid_syntax", "missing_indentation", 9, 9],
        ["invalid_syntax", "invalid_compact_collection", 13, 17],
      ],
    },
    {
      source: 'x:\n  - "a\n "- b\n  k: v\n  - c',
      owner: "block_sequence",
      first: '- "a\n "',
      last: "- c",
      child: "- b\n  k: v\n",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 23],
        ["invalid_syntax", "unexpected_collection_content", 18, 23],
      ],
    },
    {
      source: 'x:\n  k: "a\n "b: 1\n  - d\n  c: 2',
      owner: "block_mapping",
      first: 'k: "a\n "',
      last: "c: 2",
      child: "b: 1\n  - d\n",
      expected: [
        ["invalid_syntax", "missing_indentation", 12, 12],
        ["invalid_syntax", "unexpected_collection_content", 13, 24],
        ["invalid_syntax", "unexpected_collection_content", 20, 24],
      ],
    },
    {
      source: 'x:\n  - "a\n "? "b\n "k: v\n  - d',
      owner: "block_sequence",
      first: '- "a\n "',
      last: "- d",
      child: '? "b\n "k: v\n',
      childKind: "block_mapping",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 24],
        ["invalid_syntax", "missing_indentation", 18, 18],
        ["invalid_syntax", "unexpected_collection_content", 19, 24],
      ],
    },
    {
      source: 'x:\n  - "a\n "? "b\n "k:\n  - d',
      owner: "block_sequence",
      first: '- "a\n "',
      last: "- d",
      child: '? "b\n "k:\n',
      childKind: "block_mapping",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 22],
        ["invalid_syntax", "missing_indentation", 18, 18],
        ["invalid_syntax", "unexpected_collection_content", 19, 22],
      ],
    },
    {
      source: 'x:\n  k: "a\n "- "b\n "- c\n  d: e',
      owner: "block_mapping",
      first: 'k: "a\n "',
      last: "d: e",
      child: '- "b\n "- c\n',
      childKind: "block_sequence",
      expected: [
        ["invalid_syntax", "missing_indentation", 12, 12],
        ["invalid_syntax", "unexpected_collection_content", 13, 24],
        ["invalid_syntax", "missing_indentation", 19, 19],
        ["invalid_syntax", "unexpected_collection_content", 20, 24],
      ],
    },
    {
      source: 'x:\n  - "a\n "? "b\n"! ? c\n  - d',
      owner: "block_sequence",
      first: '- "a\n "',
      last: "- d",
      child: '? "b\n"! ? c\n',
      childKind: "block_mapping",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 24],
        ["invalid_syntax", "missing_indentation", 17, 17],
        ["invalid_syntax", "unexpected_collection_content", 18, 24],
        ["invalid_syntax", "invalid_compact_collection", 20, 24],
      ],
    },
    {
      source: 'x:\n   - "a\n"! ? c\n   - d',
      owner: "block_sequence",
      first: '- "a\n"',
      last: "- d",
      child: "? c\n",
      childKind: "block_mapping",
      expected: [
        ["invalid_syntax", "missing_indentation", 11, 11],
        ["invalid_syntax", "unexpected_collection_content", 12, 18],
        ["invalid_syntax", "invalid_compact_collection", 14, 18],
      ],
    },
    {
      source: 'x:\n   - "a\n  ""b\n": ? c\n   - d',
      quotes: ['"'],
      owner: "block_sequence",
      first: '- "a\n  "',
      last: "- d",
      child: '"b\n": ? c\n',
      childKind: "block_mapping",
      expected: [
        ["invalid_syntax", "missing_indentation", 13, 13],
        ["invalid_syntax", "unexpected_collection_content", 14, 24],
        ["invalid_syntax", "invalid_implicit_key", 14, 18],
        ["invalid_syntax", "missing_indentation", 17, 17],
        ["invalid_syntax", "invalid_compact_collection", 20, 24],
      ],
    },
  ]) {
    for (const ending of ["\n", "\r\n", "\r"]) {
      for (const quote of example.quotes ?? ['"', "'"]) {
        const convert = (text) =>
          text.replaceAll("\n", ending).replaceAll('"', quote);
        const source = convert(example.source);
        const offset = (at) => convert(example.source.slice(0, at)).length;
        const nodes = parse(source);
        assert.deepEqual(
          issues(nodes),
          example.expected.map(([outcome, reason, start, end]) => [
            outcome,
            reason,
            offset(start),
            offset(end),
          ]),
          source,
        );
        const memberKind =
          example.owner === "block_mapping"
            ? "block_mapping_pair"
            : "block_sequence_entry";
        const members = [example.first, example.last].map((text) =>
          nodes.find(
            ({ kind, start, end }) =>
              kind === memberKind && source.slice(start, end) === convert(text),
          ),
        );
        assert.ok(members[0] && members[1], source);
        assert.equal(members[0].parent, members[1].parent, source);
        assert.equal(nodes[members[0].parent].kind, example.owner);
        const childKind = example.childKind ?? example.owner;
        const child = nodes.find(
          ({ kind, start, end }) =>
            kind === childKind &&
            source.slice(start, end) === convert(example.child),
        );
        assert.ok(child, source);
        const childMemberKind =
          childKind === "block_mapping"
            ? "block_mapping_pair"
            : "block_sequence_entry";
        assert.equal(
          nodes.filter(
            ({ kind, parent }) =>
              kind === childMemberKind && nodes[parent] === child,
          ).length,
          1,
        );
        const byte = source.lastIndexOf(quote);
        assertEditHistory({
          source,
          edits: [
            { byte, deleteBytes: 0, insert: "  " },
            { byte, deleteBytes: 2, insert: "" },
            { byte: source.length - 1, deleteBytes: 1, insert: "last" },
          ],
        });
      }
    }
  }
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
  const baseNestingDepth = 32;
  const nestingDepths = [
    baseNestingDepth,
    baseNestingDepth + 1,
    baseNestingDepth * 2,
    baseNestingDepth * 2 + 1,
    baseNestingDepth * 4,
  ];
  for (const depth of nestingDepths) {
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

test("yaml: tabs never supply missing scalar indentation", () => {
  for (const quote of ['"', "'"]) {
    const source = `a: ${quote}x\n\t\ty${quote}`;
    assert.deepEqual(issues(parse(source)), [
      ["invalid_syntax", "tab_in_indentation", 6, 8],
      ["invalid_syntax", "missing_indentation", 8, 8],
    ]);
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

test("yaml: an overlong Unicode key owns its trailing separation inside the issue", () => {
  const key = "名".repeat(implicitKeyCharacterLimit);
  const keyStart = Buffer.byteLength("[");
  const keyEnd = keyStart + Buffer.byteLength(key);
  const separationEnd = keyEnd + Buffer.byteLength(" ");
  const source = `[${key} : v]`;
  const nodes = parse(source);
  assert.deepEqual(issues(nodes), [
    ["invalid_syntax", "invalid_implicit_key", keyStart, separationEnd],
  ]);
  const reason = nodes.findIndex(({ kind }) => kind === "invalid_implicit_key");
  assert.deepEqual(
    nodes
      .filter(({ parent }) => parent === reason)
      .map(({ kind, field, start, end }) => [kind, field, start, end]),
    [
      ["plain_scalar", "key", keyStart, keyEnd],
      ["separation", null, keyEnd, separationEnd],
    ],
  );
});

test("yaml: implicit keys count Unicode characters, properties, and separation", () => {
  for (const [source, expected] of [
    [`[${"名".repeat(implicitKeyCharacterLimit)}: value]`, 0],
    [`[${"名".repeat(implicitKeyCharacterLimit)} : value]`, 1],
    [`${"名".repeat(implicitKeyCharacterLimit + 1)}: value`, 1],
    [`{${"名".repeat(implicitKeyCharacterLimit + 1)}: value}`, 0],
    [`[? ${"名".repeat(implicitKeyCharacterLimit + 1)}: value]`, 0],
    ['["a\n b": value]', 1],
    ["[plain\n text: value]", 1],
    ["{plain\n text: value}", 0],
    [`[&a ${"名".repeat(implicitKeyCharacterLimit - "&a ".length)}: value]`, 0],
    [
      `[&a ${"名".repeat(implicitKeyCharacterLimit - "&a ".length + 1)}: value]`,
      1,
    ],
    [`[[${"名".repeat(implicitKeyCharacterLimit - "[]".length)}]: value]`, 0],
    [
      `[[${"名".repeat(implicitKeyCharacterLimit - "[]".length + 1)}]: value]`,
      1,
    ],
    [`[${"x".repeat(implicitKeyCharacterLimit * 2)}, [short]: value]`, 0],
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

const histories = [
  ...[
    { source: 'k: "a"\nc: 2', byte: 6, insert: " x" },
    { source: '- "a"\n- b', byte: 5, insert: " x" },
    { source: '- "a"\n- b', byte: 5, insert: "\n  extra" },
    { source: "a:\n  - b\n  - c\nz: v", byte: 8, insert: "\n  -x" },
    { source: "- a\n- d", byte: 4, insert: "b: c\n" },
    { source: "k: v\nc: d", byte: 5, insert: "- a\n" },
  ].map(({ source, byte, insert }) => [
    `insert and remove extra collection content ${JSON.stringify(insert)} in ${JSON.stringify(source)}`,
    source,
    [
      { byte, deleteBytes: 0, insert },
      { byte, deleteBytes: insert.length, insert: "" },
    ],
  ]),
  ...["|", ">"].map((style) => {
    const prefix = `outer:\n  ?\n  !t\n   ${style}\n    body\n`;
    const source = `${prefix}  #c`;
    const completion = "\n  : value";
    return [
      `recover a ${style} key across comment completion and indentation edits`,
      source,
      [
        { byte: source.length, deleteBytes: 0, insert: completion },
        { byte: prefix.length, deleteBytes: 0, insert: "  " },
        { byte: prefix.length, deleteBytes: 2, insert: "" },
        { byte: prefix.length, deleteBytes: 4, insert: "" },
        { byte: prefix.length, deleteBytes: 0, insert: "  #c" },
        { byte: source.length + 1, deleteBytes: 2, insert: "" },
        { byte: source.length + 1, deleteBytes: 0, insert: "  " },
        { byte: source.length + 3, deleteBytes: 0, insert: "next" },
        { byte: source.length + 3, deleteBytes: 4, insert: "" },
        { byte: source.length, deleteBytes: completion.length, insert: "" },
        { byte: source.length, deleteBytes: 0, insert: "\n\n \t" },
        { byte: source.length, deleteBytes: 4, insert: "" },
      ],
    ];
  }),
  ...["- entry", "nested: value", "|\n    body", ">\n    body"].map(
    (content) => {
      const source = `outer:\n  ?\n  !t\n   ${content}`;
      const completion = "\n  : value";
      return [
        `complete and restore a multiline property key containing ${JSON.stringify(content)}`,
        source,
        [
          { byte: source.length, deleteBytes: 0, insert: completion },
          { byte: source.length + 1, deleteBytes: 2, insert: "" },
          { byte: source.length + 1, deleteBytes: 0, insert: "  " },
          { byte: source.length + 4, deleteBytes: 0, insert: "x" },
          { byte: source.length + 4, deleteBytes: 1, insert: "" },
          { byte: source.length, deleteBytes: completion.length, insert: "" },
        ],
      ];
    },
  ),
  ...["a: b", "- a"].map((source) => [
    `replace stream character issues with a document marker before ${JSON.stringify(source)}`,
    source,
    [
      { byte: 0, deleteBytes: 0, insert: "\x01" },
      { byte: 0, deleteBytes: 1, insert: "--- " },
      { byte: 3, deleteBytes: 1, insert: "\n" },
      { byte: 4, deleteBytes: 0, insert: "\x01" },
      { byte: 0, deleteBytes: 4, insert: "" },
      { byte: 0, deleteBytes: 1, insert: "" },
    ],
  ]),
  [
    "add and remove content after a property-only node's trailing layout",
    "a: !t # c\n\n  \nb: c",
    [
      { byte: 13, deleteBytes: 0, insert: "value" },
      { byte: 13, deleteBytes: 5, insert: "" },
      { byte: 5, deleteBytes: 8, insert: "" },
      { byte: 5, deleteBytes: 0, insert: " # c\n\n  " },
    ],
  ],
  [
    "change an empty property node into a flow scalar and back",
    "[!t , a]",
    [
      { byte: 4, deleteBytes: 0, insert: "value" },
      { byte: 4, deleteBytes: 5, insert: "" },
      { byte: 3, deleteBytes: 1, insert: " # c\n  " },
      { byte: 3, deleteBytes: 7, insert: " " },
    ],
  ],
  [
    "remove and restore the first property before its duplicate",
    "&a &b !t value",
    [
      { byte: 0, deleteBytes: 3, insert: "" },
      { byte: 0, deleteBytes: 0, insert: "&a " },
    ],
  ],
  [
    "remove and restore the first tag before its duplicate",
    "!t !u &a value",
    [
      { byte: 0, deleteBytes: 3, insert: "" },
      { byte: 0, deleteBytes: 0, insert: "!t " },
    ],
  ],
  [
    "split and rejoin a forbidden quoted character run",
    '"\u0001\u0002"',
    [
      { byte: 2, deleteBytes: 0, insert: "x" },
      { byte: 2, deleteBytes: 1, insert: "" },
    ],
  ],
  [
    "separate header character faults from independent indicators",
    "|00++",
    [
      { byte: 2, deleteBytes: 0, insert: "2" },
      { byte: 2, deleteBytes: 1, insert: "" },
      { byte: 1, deleteBytes: 2, insert: "" },
    ],
  ],
  [
    "remove and restore content before an escaped continuation break",
    '"a\nb\\\nc"',
    [
      {
        byte: 3,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 3,
        deleteBytes: 0,
        insert: "\\n",
      },
      {
        byte: 3,
        deleteBytes: 2,
        insert: "",
      },
      {
        byte: 3,
        deleteBytes: 0,
        insert: " ",
      },
      {
        byte: 3,
        deleteBytes: 1,
        insert: "b",
      },
      {
        byte: 4,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 4,
        deleteBytes: 0,
        insert: "\\",
      },
    ],
  ],
  [
    "turn a first-line escaped break into an empty continuation and restore it",
    '"\\\nb"',
    [
      {
        byte: 1,
        deleteBytes: 0,
        insert: "\n",
      },
      {
        byte: 1,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 2,
        deleteBytes: 1,
        insert: "\r\n",
      },
      {
        byte: 1,
        deleteBytes: 0,
        insert: "\r\n",
      },
      {
        byte: 1,
        deleteBytes: 2,
        insert: "",
      },
    ],
  ],
  [
    "complete and remove the newline after an unfinished continuation escape",
    '"a\n\\',
    [
      {
        byte: 4,
        deleteBytes: 0,
        insert: "\n",
      },
      {
        byte: 5,
        deleteBytes: 0,
        insert: 'b"',
      },
      {
        byte: 4,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 4,
        deleteBytes: 0,
        insert: "\n",
      },
    ],
  ],
  [
    "damage and restore a nested closing without losing block mapping ownership",
    "[{a}]: value\nnext: end",
    [
      {
        byte: 3,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 3,
        deleteBytes: 0,
        insert: "}",
      },
      {
        byte: 1,
        deleteBytes: 1,
        insert: "[",
      },
      {
        byte: 1,
        deleteBytes: 1,
        insert: "{",
      },
    ],
  ],
  [
    "remove and restore separation before a comment containing a fake mapping",
    "[ # ]: fake\n  item]",
    [
      {
        byte: 1,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 1,
        deleteBytes: 0,
        insert: " ",
      },
      {
        byte: 1,
        deleteBytes: 2,
        insert: '"a"#',
      },
      {
        byte: 1,
        deleteBytes: 4,
        insert: " #",
      },
    ],
  ],
  [
    "remove and restore the colon before a property-bearing block sequence",
    "?\n!t :\n - item\nnext: end",
    [
      {
        byte: 5,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 5,
        deleteBytes: 0,
        insert: ":",
      },
    ],
  ],
  [
    "remove and restore the colon before a property-bearing block scalar",
    "?\n!t :\n |\n  body\nnext: end",
    [
      {
        byte: 5,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 5,
        deleteBytes: 0,
        insert: ":",
      },
    ],
  ],
  [
    "release and restore indentation after an invalid compact key",
    ":\n! -\n r",
    [
      {
        byte: 6,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 6,
        deleteBytes: 0,
        insert: " ",
      },
      {
        byte: 2,
        deleteBytes: 1,
        insert: "&name",
      },
      {
        byte: 2,
        deleteBytes: 5,
        insert: "!",
      },
    ],
  ],
  [
    "change the indentation direction of an invalid inline sequence",
    '"first""\n": - entry\nnext: end',
    [
      {
        byte: 1,
        deleteBytes: 5,
        insert: "",
      },
      {
        byte: 1,
        deleteBytes: 0,
        insert: "first",
      },
    ],
  ],
  [
    "change the indentation direction of an invalid inline mapping",
    '"first""\n": nested: value\nnext: end',
    [
      {
        byte: 1,
        deleteBytes: 5,
        insert: "",
      },
      {
        byte: 1,
        deleteBytes: 0,
        insert: "first",
      },
    ],
  ],
  [
    "change a property-bearing mapping to an empty first key and restore it",
    "a: !t\n  b: value\nnext: end",
    [
      {
        byte: 8,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 8,
        deleteBytes: 0,
        insert: "b",
      },
    ],
  ],
  [
    "repair a mismatched multiline flow closing inside a block value",
    "a: [b\n ]",
    [
      {
        byte: 7,
        deleteBytes: 1,
        insert: "}",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: "]",
      },
    ],
  ],
  [
    "keep damaged plain text and restore its following mapping pair",
    "key: one\u007f two\nnext: value",
    [
      {
        byte: 8,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 8,
        deleteBytes: 0,
        insert: "\u007f",
      },
      {
        byte: 8,
        deleteBytes: 0,
        insert: " ",
      },
      {
        byte: 10,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 8,
        deleteBytes: 2,
        insert: "",
      },
    ],
  ],
  [
    "recompute an empty block scalar when a document marker becomes content",
    "|\n  \n---\nnext",
    [
      {
        byte: 8,
        deleteBytes: 0,
        insert: "word",
      },
      {
        byte: 8,
        deleteBytes: 4,
        insert: "",
      },
      {
        byte: 5,
        deleteBytes: 0,
        insert: "\ufeff",
      },
      {
        byte: 5,
        deleteBytes: 3,
        insert: "",
      },
    ],
  ],
  [
    "retain property content when a block scalar starts with flow punctuation",
    "a: !b\n x",
    [
      {
        byte: 7,
        deleteBytes: 1,
        insert: "}",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: ",",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: "]",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: "x",
      },
    ],
  ],
  [
    "change quoted character eligibility and restore its source range",
    '"a\u007fb"',
    [
      {
        byte: 0,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 0,
        deleteBytes: 0,
        insert: '"',
      },
      {
        byte: 2,
        deleteBytes: 1,
        insert: "\u009f",
      },
      {
        byte: 2,
        deleteBytes: 2,
        insert: "\u007f",
      },
    ],
  ],
  [
    "change whether an unfinished Unicode escape can be completed",
    '"\\uD7',
    [
      {
        byte: 4,
        deleteBytes: 1,
        insert: "8",
      },
      {
        byte: 4,
        deleteBytes: 1,
        insert: "7",
      },
      {
        byte: 5,
        deleteBytes: 0,
        insert: 'FF"',
      },
      {
        byte: 5,
        deleteBytes: 3,
        insert: "",
      },
    ],
  ],
  [
    "change a final whitespace line into content and restore it",
    "a: b\n\t",
    [
      {
        byte: 6,
        deleteBytes: 0,
        insert: "c",
      },
      {
        byte: 6,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 5,
        deleteBytes: 1,
        insert: "  ",
      },
      {
        byte: 7,
        deleteBytes: 0,
        insert: "\n",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
  [
    "remove and restore separation after a block key colon",
    'a: b\n"k": value',
    [
      {
        byte: 9,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 9,
        deleteBytes: 0,
        insert: " ",
      },
    ],
  ],
  [
    "change quote-like text inside a collection key",
    '[a"b]: value',
    [
      {
        byte: 2,
        deleteBytes: 1,
        insert: "'",
      },
      {
        byte: 2,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 2,
        deleteBytes: 0,
        insert: '"',
      },
    ],
  ],
  [
    "replace compact collection indentation with a tab and restore it",
    "- key: value\n  next: other",
    [
      {
        byte: 1,
        deleteBytes: 1,
        insert: "\t",
      },
      {
        byte: 1,
        deleteBytes: 1,
        insert: " ",
      },
    ],
  ],
  [
    "change scalar continuation into a flow value boundary",
    "{key\n:word}",
    [
      {
        byte: 6,
        deleteBytes: 4,
        insert: "[]",
      },
      {
        byte: 6,
        deleteBytes: 2,
        insert: "word",
      },
    ],
  ],
  [
    "remove and restore a compact sequence",
    "- - a\n- b",
    [
      {
        byte: 2,
        deleteBytes: 2,
        insert: "",
      },
      {
        byte: 2,
        deleteBytes: 0,
        insert: "- ",
      },
    ],
  ],
  [
    "close and reopen a flow sequence",
    "[a",
    [
      {
        byte: 2,
        deleteBytes: 0,
        insert: "]",
      },
      {
        byte: 2,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
  [
    "add a flow value after blank and prefixed lines and remove it",
    "{:\n  \r\n",
    [
      {
        byte: 7,
        deleteBytes: 0,
        insert: "1",
      },
      {
        byte: 7,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
  [
    "insert and remove a comment between a flow sequence key and its colon",
    "[a\n : b]",
    [
      {
        byte: 2,
        deleteBytes: 0,
        insert: " # c",
      },
      {
        byte: 2,
        deleteBytes: 4,
        insert: "",
      },
    ],
  ],
  [
    "turn a property line into the mapping value of the previous property",
    "!t\n&a b: c",
    [
      {
        byte: 7,
        deleteBytes: 2,
        insert: "",
      },
      {
        byte: 7,
        deleteBytes: 0,
        insert: ": ",
      },
    ],
  ],
  [
    "turn an alias key line into the alias content of the previous property",
    "!t\n  *x : y",
    [
      {
        byte: 7,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 7,
        deleteBytes: 0,
        insert: " ",
      },
    ],
  ],
  [
    "replace a tab-indented blank line after a block scalar with spaces",
    "a: |\n   x\n \t\nb: c",
    [
      {
        byte: 11,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 11,
        deleteBytes: 0,
        insert: "\t",
      },
    ],
  ],
  [
    "change the boundary after repeated shallow tab lines",
    "a: |\n   x\n \t\n \t# note\nb: y",
    [
      { byte: 22, deleteBytes: 0, insert: "---\n" },
      { byte: 22, deleteBytes: 4, insert: "" },
      { byte: 22, deleteBytes: 4, insert: "" },
      { byte: 22, deleteBytes: 0, insert: "b: y" },
      { byte: 10, deleteBytes: 0, insert: " # trailer\n" },
      { byte: 10, deleteBytes: 11, insert: "" },
    ],
  ],
  [
    "change a final scalar layout prefix into an empty or spaced content line",
    "a: |\n  x\n  ",
    [
      { byte: 11, deleteBytes: 0, insert: "\n" },
      { byte: 11, deleteBytes: 1, insert: "" },
      { byte: 11, deleteBytes: 0, insert: " " },
      { byte: 11, deleteBytes: 1, insert: "" },
      { byte: 7, deleteBytes: 1, insert: "" },
      { byte: 7, deleteBytes: 0, insert: "x" },
    ],
  ],
  [
    "insert and remove the end marker before a directive document",
    "a: b\n%X\n---",
    [
      {
        byte: 5,
        deleteBytes: 0,
        insert: "...\n",
      },
      {
        byte: 5,
        deleteBytes: 4,
        insert: "",
      },
      {
        byte: 5,
        deleteBytes: 1,
        insert: "&",
      },
      {
        byte: 5,
        deleteBytes: 1,
        insert: "%",
      },
    ],
  ],
  [
    "insert and remove a forbidden character before a directive version",
    "%YAML 1.2\n---",
    [
      {
        byte: 6,
        deleteBytes: 0,
        insert: "\u007f",
      },
      {
        byte: 6,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
];

for (const [name, source, edits] of histories) {
  test(`yaml: ${name}`, () => {
    assertEditHistory({ source, edits });
  });
}

test("yaml: comment break edits reclassify block values and their owners", () => {
  for (const { source, byte, owner, start, end } of [
    {
      source: "a:\n # c\nb\n  d",
      byte: 7,
      owner: "block_mapping_pair",
      start: 11,
      end: 12,
    },
    {
      source: "? a\n# c\nb\n: c",
      byte: 7,
      owner: "block_mapping_pair",
      start: 11,
      end: 12,
    },
    {
      source: "-\n # c\nb\n  d",
      byte: 6,
      owner: "block_sequence_entry",
      start: 10,
      end: 11,
    },
  ]) {
    const edits = [{ byte, deleteBytes: 1, insert: "" }];
    const nodes = assertIncrementalEqualsFresh(
      source,
      edits,
      applyEdits(source, edits),
    );
    assert.deepEqual(issues(nodes), [], source);
    assert.equal(nodes.filter(({ kind }) => kind === owner).length, 1, source);
    const value = nodes.find(({ field }) => field === "value");
    assert.deepEqual(
      [value.kind, value.start, value.end],
      ["plain_scalar", start, end],
    );
    assert.equal(nodes[value.parent].kind, owner);
    edits.push({ byte, deleteBytes: 0, insert: "\n" });
    assertIncrementalEqualsFresh(source, edits, source);
  }
});
