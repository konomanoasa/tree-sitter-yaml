import assert from "node:assert/strict";
import { test } from "node:test";
import { counts, hasError, implicitKeyCharacterLimit } from "./support/cst.js";
import {
  applyEdits,
  assertIncrementalContract,
  parse,
} from "./support/parser.js";

test("yaml: block members exclude trailing layout across endings and nesting", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const prefix of ["", `root:${ending}  `]) {
      for (const [member, kind] of [
        ["a:", "block_mapping_pair"],
        [":", "block_mapping_pair"],
        ["?", "block_mapping_pair"],
        ["? key", "block_mapping_pair"],
        ["a: !tag", "block_mapping_pair"],
        ["a: value", "block_mapping_pair"],
        ["-", "block_sequence_entry"],
        ["- !tag", "block_sequence_entry"],
        ["- value", "block_sequence_entry"],
      ]) {
        const indent = prefix ? "  " : "";
        for (const suffix of ["", `${indent}${member}`, "---", "..."]) {
          const end = prefix.length + member.length;
          const source = `${prefix}${member} \t# tail${ending}${ending} \t# more${ending}${suffix}`;
          const nodes = parse(source);
          assert.equal(hasError(nodes), false, source);
          const owner = nodes.find(
            (node) => node.kind === kind && node.start === prefix.length,
          );
          assert.equal(owner.end, end, source);
          const layout = nodes.filter(
            (node) =>
              node.start >= end &&
              node.end <= source.length - suffix.length &&
              ["separation", "comment", "line_break", "line_prefix"].includes(
                node.kind,
              ) &&
              nodes[node.parent].kind !== "line_prefix",
          );
          assert.ok(layout.length > 0);
          for (const node of layout)
            assert.equal(node.parent, owner.parent, source);
        }
      }
    }
  }
});

test("yaml: layout before a later block value stays inside its member", () => {
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const [head, value, next, owner] of [
      ["a:", "  value", "b:", "block_mapping_pair"],
      ["-", "  value", "-", "block_sequence_entry"],
      ["?", "  key", ": value", "block_mapping_pair"],
      ["? key", ": value", "b:", "block_mapping_pair"],
      ["a:", "- value", "b:", "block_mapping_pair"],
    ]) {
      const source = `${head} # before${ending}${ending} \t# more${ending}${value}${ending}${next}`;
      const nodes = parse(source);
      assert.equal(hasError(nodes), false, source);
      const member = nodes.find((node) => node.kind === owner);
      for (const node of nodes.filter(({ kind }) => kind === "comment"))
        assert.equal(nodes[node.parent], member, source);
    }
  }
});

test("yaml: block scalar indentation detection stops at document boundaries", () => {
  for (const style of ["|", ">", "|+", ">-"]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
      for (const boundary of ["---", "...", "\ufeff---"]) {
        const source = `${style}${newline}  ${newline}${boundary}${newline}next`;
        const nodes = parse(source);
        assert.equal(hasError(nodes), false, source);
        const scalar = nodes.find(
          ({ kind }) => kind === "literal_scalar" || kind === "folded_scalar",
        );
        assert.equal(scalar.end, style.length + newline.length * 2 + 2);
        assert.equal(counts(nodes, ["document"])[0], 2);
      }
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
      assert.equal(hasError(nodes), false, source);
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

test("yaml: whitespace-only final lines are layout at every block indentation", () => {
  for (const content of ["a: b", "a:", "- a", "a:\n  b: c", "a: [b]"]) {
    for (const ending of ["\n", "\r", "\r\n"]) {
      for (const whitespace of [" ", "  ", "\t", " \t "]) {
        const source = content + ending + whitespace;
        const nodes = parse(source);
        assert.equal(hasError(nodes), false, JSON.stringify(source));
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
            assert.equal(hasError(nodes), false, JSON.stringify(source));
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
        assert.equal(hasError(nodes), false, JSON.stringify(source));
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
      assert.equal(hasError(nodes), false, source);
      const collection = nodes.find(
        ({ field, start }) => field === "key" && start === prefix.length,
      );
      assert.equal(collection?.end, prefix.length + key.length, source);
      assert.equal(nodes[collection.parent].kind, "block_mapping_pair");
    }
  }
});

test("yaml: property-bearing implicit keys retain following indented values", () => {
  for (const property of ["!", "!tag", "&anchor", "!tag &anchor"]) {
    const source = `${property} key:\n value`;
    const nodes = parse(source);
    assert.equal(hasError(nodes), false, source);
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

test("yaml: colon-prefixed scalars remain the content of their properties", () => {
  for (const source of [
    "!tag :plain",
    "&a :plain",
    "[!tag :plain]",
    "{!tag :plain}",
  ]) {
    const nodes = parse(source);
    assert.equal(hasError(nodes), false, source);
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
        assert.equal(hasError(parse(source)), false, source);
      }
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
    const nodes = assertIncrementalContract(
      source,
      edits,
      applyEdits(source, edits),
    );
    assert.equal(hasError(nodes), false, source);
    assert.equal(nodes.filter(({ kind }) => kind === owner).length, 1, source);
    const value = nodes.find(({ field }) => field === "value");
    assert.deepEqual(
      [value.kind, value.start, value.end],
      ["plain_scalar", start, end],
    );
    assert.equal(nodes[value.parent].kind, owner);
    edits.push({ byte, deleteBytes: 0, insert: "\n" });
    assertIncrementalContract(source, edits, source);
  }
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
    assert.equal(
      hasError(parse(source)),
      expected === 1,
      JSON.stringify(source),
    );
  }
});

test("quoted scalars accept non-C0 characters while unquoted contexts reject forbidden characters", () => {
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
      assert.equal(hasError(nodes), false);
      assert.deepEqual(
        nodes
          .filter(({ kind }) => kind === "scalar_text")
          .map(({ start, end }) => [start, end]),
        [[1, Buffer.byteLength(source) - 1]],
      );
      assert.equal(hasError(parse(`a${character}b`)), character !== "\u0085");
    }
  }
});

test("flow key adjacency depends on the current key rather than its predecessor", () => {
  for (const preceding of ["[]", "{}", '"x"', "'x'", "plain", "!tag", "*a"]) {
    for (const key of [":name", "?name", "name"]) {
      const nodes = parse(`{${preceding}, ${key}}`);
      assert.equal(hasError(nodes), false);
      const keys = nodes.filter(({ field }) => field === "key");
      assert.equal(keys.length, 2);
      assert.equal(keys[1].kind, "plain_scalar");
      assert.equal(hasError(parse(`{${preceding}, ${key}:[]}`)), true);
      assert.equal(hasError(parse(`{${preceding}, ${key}: []}`)), false);
    }
  }
});
