import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, issues, parse } from "./support/parser.js";

const histories = [
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
    "insert and remove a forbidden BOM inside a damaged block header",
    "|ab\n x",
    [
      {
        byte: 2,
        deleteBytes: 0,
        insert: "﻿",
      },
      {
        byte: 2,
        deleteBytes: 3,
        insert: "",
      },
    ],
  ],
  [
    "insert and remove a forbidden BOM inside document suffix content",
    "... ab\n---\nx",
    [
      {
        byte: 5,
        deleteBytes: 0,
        insert: "﻿",
      },
      {
        byte: 5,
        deleteBytes: 3,
        insert: "",
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
    "key: one two\nnext: value",
    [
      {
        byte: 8,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 8,
        deleteBytes: 0,
        insert: "",
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
        insert: "﻿",
      },
      {
        byte: 5,
        deleteBytes: 3,
        insert: "",
      },
    ],
  ],
  [
    "release property layout when an edited line dedents",
    "a:\n  b: &p\n    value\nc: end",
    [
      {
        byte: 11,
        deleteBytes: 4,
        insert: " ",
      },
      {
        byte: 11,
        deleteBytes: 1,
        insert: "    ",
      },
      {
        byte: 15,
        deleteBytes: 5,
        insert: "next: item",
      },
      {
        byte: 11,
        deleteBytes: 4,
        insert: " ",
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
    '"ab"',
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
        insert: "",
      },
      {
        byte: 2,
        deleteBytes: 2,
        insert: "",
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
    "invalidate cached classification when an indented collection becomes a key",
    "                                                                                                                                [a]",
    [
      {
        byte: 131,
        deleteBytes: 0,
        insert: ": value",
      },
      {
        byte: 131,
        deleteBytes: 7,
        insert: "",
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
    "change the preceding flow entry without reclassifying the next key",
    "{[], :name, ?name:[]}",
    [
      {
        byte: 1,
        deleteBytes: 2,
        insert: "plain",
      },
      {
        byte: 1,
        deleteBytes: 5,
        insert: '"x"',
      },
      {
        byte: 1,
        deleteBytes: 3,
        insert: "[]",
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
    "change and restore nested indentation",
    "a:\n  b: c\nd: e",
    [
      {
        byte: 3,
        deleteBytes: 2,
        insert: "    ",
      },
      {
        byte: 3,
        deleteBytes: 4,
        insert: "  ",
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
    "edit text before a multibyte character",
    "a: café",
    [
      {
        byte: 6,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 6,
        deleteBytes: 0,
        insert: "f",
      },
    ],
  ],
  [
    "split and repair CRLF",
    "a:\r\n  b: c",
    [
      {
        byte: 3,
        deleteBytes: 1,
        insert: "",
      },
      {
        byte: 3,
        deleteBytes: 0,
        insert: "\n",
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
    "insert and remove a preceding comment",
    "a: b",
    [
      {
        byte: 0,
        deleteBytes: 0,
        insert: "# c\n",
      },
      {
        byte: 0,
        deleteBytes: 4,
        insert: "",
      },
    ],
  ],
  [
    "turn a flow value comment into a directive line and restore it",
    "{1: # !!t",
    [
      {
        byte: 6,
        deleteBytes: 0,
        insert: "%YAML 1.2\n",
      },
      {
        byte: 6,
        deleteBytes: 10,
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
    "insert and remove a stream BOM before an indented sequence",
    "\n -\n -",
    [
      {
        byte: 1,
        deleteBytes: 0,
        insert: "﻿",
      },
      {
        byte: 1,
        deleteBytes: 3,
        insert: "",
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
        insert: "",
      },
      {
        byte: 6,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
];
for (const [name, source, steps] of histories) {
  test(`yaml: ${name}`, () => {
    const edits = [];
    for (const edit of steps) {
      edits.push(edit);
      assert.deepEqual(parse(source, edits), parse(applyEdits(source, edits)));
    }
  });
}

test("yaml: comment break edits reclassify block values and their owners", () => {
  for (const [source, byte, owner, start, end] of [
    ["a:\n # c\nb\n  d", 7, "block_mapping_pair", 11, 12],
    ["? a\n# c\nb\n: c", 7, "block_mapping_pair", 11, 12],
    ["-\n # c\nb\n  d", 6, "block_sequence_entry", 10, 11],
  ]) {
    const edits = [{ byte, deleteBytes: 1, insert: "" }];
    const nodes = parse(source, edits);
    assert.deepEqual(nodes, parse(applyEdits(source, edits)), source);
    assert.deepEqual(issues(nodes), [], source);
    assert.equal(nodes.filter(({ kind }) => kind === owner).length, 1, source);
    const value = nodes.find(({ field }) => field === "value");
    assert.deepEqual(
      [value.kind, value.start, value.end],
      ["plain_scalar", start, end],
    );
    assert.equal(nodes[value.parent].kind, owner);
    edits.push({ byte, deleteBytes: 0, insert: "\n" });
    assert.deepEqual(parse(source, edits), parse(source), source);
  }
});

test("yaml: fixed-seed generated histories preserve CLI edit handling and issue ranges", () => {
  let state = 0x79616d6c;
  const next = (maximum) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % maximum;
  };
  const seeds = [
    "[a, b]",
    "{key: value}",
    "key: [one, two]\n",
    "---\n[a]\n...\n",
  ];
  const replacements = ["a", "b", "name", "名", "", " ", "\n "];
  for (let sample = 0; sample < 48; sample++) {
    const source = seeds[sample % seeds.length];
    let bytes = Buffer.from(source);
    const edits = [];
    for (let step = 0; step < 4; step++) {
      const candidates = Array.from(bytes.entries())
        .filter(([, byte]) => byte >= 97 && byte <= 122)
        .map(([index]) => index);
      const byte = candidates.length ? candidates[next(candidates.length)] : 1;
      const edit = {
        byte,
        deleteBytes: candidates.length ? 1 : 0,
        insert: replacements[next(replacements.length)],
      };
      edits.push(edit);
      bytes = applyEdits(bytes, [edit]);
      const incremental = parse(source, edits);
      const fresh = parse(bytes);
      assert.deepEqual(incremental, fresh, JSON.stringify({ source, edits }));
      issues(fresh);
    }
  }
});
