import assert from "node:assert/strict";
import { test } from "node:test";
import { implicitKeyCharacterLimit, issues } from "./support/cst.js";
import {
  applyEdits,
  assertEditHistory,
  assertIncrementalEqualsFresh,
} from "./support/parser.js";

const invalidBytes = Buffer.from([0xff, 0xfe, 0x80]);
const tagPrefix = "!u ";
const overlongTaggedKey = `!\n${tagPrefix}${"a".repeat(implicitKeyCharacterLimit - tagPrefix.length + 1)}`;

const indentationWidth = 128;
const indentedCollection = `${" ".repeat(indentationWidth)}[a]`;

const histories = [
  [
    "insert and remove an enclosing mapping around an EOF sequence tab",
    "- a\n\t-",
    [
      { byte: 0, deleteBytes: 0, insert: "a:\n" },
      { byte: 9, deleteBytes: 0, insert: "x" },
      { byte: 9, deleteBytes: 1, insert: "" },
      { byte: 0, deleteBytes: 3, insert: "" },
    ],
  ],
  [
    "indent and dedent a sequence whose EOF tab follows a mapping value",
    "a:\n- b\n\t-",
    [
      { byte: 7, deleteBytes: 0, insert: "  " },
      { byte: 3, deleteBytes: 0, insert: "  " },
      { byte: 3, deleteBytes: 2, insert: "" },
      { byte: 7, deleteBytes: 2, insert: "" },
    ],
  ],
  [
    "retain an outer mapping after an inner mapping ends before an EOF tab",
    "a:\n- b: 1\n- c\n\t-",
    [
      { byte: 0, deleteBytes: 3, insert: "" },
      { byte: 0, deleteBytes: 0, insert: "a:\n" },
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
    "invalidate cached classification when an indented collection becomes a key",
    indentedCollection,
    [
      {
        byte: Buffer.byteLength(indentedCollection),
        deleteBytes: 0,
        insert: ": value",
      },
      {
        byte: Buffer.byteLength(indentedCollection),
        deleteBytes: Buffer.byteLength(": value"),
        insert: "",
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
    "add and remove a value indicator after comment lines that follow a flow key",
    "{ab #c\n #d\n w}",
    [
      {
        byte: 11,
        deleteBytes: 0,
        insert: ":",
      },
      {
        byte: 11,
        deleteBytes: 1,
        insert: "",
      },
    ],
  ],
  ...[
    ["[-", "x]"],
    ["{a: ?", "x}"],
    ["{: :", "x}"],
    [": :", "x"],
    ["!t -", "x"],
    ["--- -", "x"],
    ["a: b:", "x"],
    ["a\n:", "x"],
    ["a\nb:", "x"],
    ["k: 1\na\n", "  x: v"],
    ["k: 1\na\r\n", "  x: v"],
    ["k: 1\na\n\n \t", "\n  x: v"],
    ["k: 1\n!t\n", "  x: v\n: w"],
    ["k: 1\n!t #c", "\n  x: v\n: w"],
    ["k: 1\n!t &a\n#c\n \t", "\n  x: v\n: w"],
    [": 1\n-", "x: y"],
    ["!\n!", " p:"],
    ["&x\n&x", " p:"],
    ["!t\n&x: !t", " p:"],
    ["\ta:", "x"],
    ["!t\n*x", " :"],
    ["k:\n a\n :", "x"],
    ["#c\n[\n]:", "x"],
    ["k:\n [\n]:", "x"],
    ["{a: b :", "x}"],
    ["a: [b]:", "x"],
    ['--- "b":', "x"],
    ["a: *x :", "x"],
    [": !<x>:", "x"],
    ["!\n!u [a,\nb]", ": "],
    [overlongTaggedKey, ": "],
    ["[a\n---", "x]"],
    ["{a\n...", "x}"],
    ["'\n---", "x'"],
    ['"\n...', 'x"'],
    ["%YAML 1.2\n-", "--"],
    ["%YAML 1.2\n--", "-"],
    ["[]\n-", "--"],
    ["[]\n..", "."],
    ["|2\n--", "-"],
    ["|2\n.", ".."],
  ].map(([source, completion]) => [
    `complete and restore EOF-dependent classification in ${JSON.stringify(source)}`,
    source,
    [
      { byte: source.length, deleteBytes: 0, insert: completion },
      { byte: source.length, deleteBytes: completion.length, insert: "" },
      { byte: source.length, deleteBytes: 0, insert: " # end\n" },
      {
        byte: source.length,
        deleteBytes: Buffer.byteLength(" # end\n"),
        insert: "",
      },
    ],
  ]),
  [
    "insert and remove a forbidden BOM inside a damaged block header",
    "|ab\n x",
    [
      {
        byte: 2,
        deleteBytes: 0,
        insert: "\ufeff",
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
    "insert and remove a stream BOM before an indented sequence",
    "\n -\n -",
    [
      {
        byte: 1,
        deleteBytes: 0,
        insert: "\ufeff",
      },
      {
        byte: 1,
        deleteBytes: 3,
        insert: "",
      },
    ],
  ],
  [
    "add and remove inline and next-line values after an empty mapping pair",
    "a: # c\nb:",
    [
      { byte: 2, deleteBytes: 0, insert: " value" },
      { byte: 2, deleteBytes: 6, insert: "" },
      { byte: 7, deleteBytes: 0, insert: "  value\n" },
      { byte: 7, deleteBytes: 8, insert: "" },
    ],
  ],
  [
    "add and remove inline and next-line values after an empty sequence entry",
    "- # c\n- tail",
    [
      { byte: 1, deleteBytes: 0, insert: " value" },
      { byte: 1, deleteBytes: 6, insert: "" },
      { byte: 6, deleteBytes: 0, insert: "  value\n" },
      { byte: 6, deleteBytes: 8, insert: "" },
    ],
  ],
  [
    "move layout into and out of an explicit pair by editing its colon and value",
    "? # k\n: # v\nnext: end",
    [
      { byte: 6, deleteBytes: 2, insert: "" },
      { byte: 6, deleteBytes: 0, insert: ": " },
      { byte: 12, deleteBytes: 0, insert: "  value\n" },
      { byte: 12, deleteBytes: 8, insert: "" },
    ],
  ],
  [
    "move trailing nested mapping layout before an inserted value and back",
    "root:\n  a: # c\nnext: end",
    [
      { byte: 15, deleteBytes: 0, insert: "    value\n" },
      { byte: 15, deleteBytes: 10, insert: "" },
    ],
  ],
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
    "edit scalar layout and document boundaries before percent content",
    "|\n a\n\t\t  #d\n%x\n",
    [
      { byte: 5, deleteBytes: 7, insert: "" },
      { byte: 5, deleteBytes: 0, insert: "\t\t  #d\n" },
      { byte: 12, deleteBytes: 0, insert: "# trailer\n" },
      { byte: 12, deleteBytes: 10, insert: "" },
      { byte: 12, deleteBytes: 0, insert: "...\n" },
      { byte: 12, deleteBytes: 4, insert: "" },
      { byte: 12, deleteBytes: 3, insert: "" },
      { byte: 12, deleteBytes: 0, insert: "%x\n" },
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

for (const [prefix, suffix] of [
  ['"a', 'b"'],
  ['"\\', 'b"'],
  ["!<tag:%A", "> x"],
  ["# a", "\n"],
  ["key: a", "\n"],
]) {
  test(`yaml: splitting a character merges the preceding decoding issue after ${JSON.stringify(prefix)}`, () => {
    const invalidByte = Buffer.from([0xff]);
    const character = "é";
    const characterBytes = Buffer.byteLength(character);
    const start = Buffer.byteLength(prefix);
    const source = Buffer.concat([
      Buffer.from(prefix),
      invalidByte,
      Buffer.from(character + suffix),
    ]);
    const edits = [
      {
        byte: start + invalidByte.length + characterBytes - 1,
        deleteBytes: 1,
        insert: "",
      },
    ];
    const incremental = assertIncrementalEqualsFresh(
      source,
      edits,
      applyEdits(source, edits),
    );
    assert.deepEqual(
      issues(incremental)
        .filter(([, reason]) => reason === "invalid_encoding")
        .map(([, , start, end]) => [start, end]),
      [[start, start + invalidByte.length + characterBytes - 1]],
    );
  });
}

test("yaml: repairing a decoding failure after a backslash restores a quoted escape", () => {
  const prefix = '"\\';
  const source = Buffer.concat([
    Buffer.from(prefix),
    invalidBytes,
    Buffer.from('"'),
  ]);
  const edits = [
    {
      byte: Buffer.byteLength(prefix),
      deleteBytes: invalidBytes.length,
      insert: "n",
    },
  ];
  const incremental = assertIncrementalEqualsFresh(source, edits, '"\\n"');
  assert.deepEqual(issues(incremental), []);
});

test("yaml: directive name edits reclassify arguments and incomplete EOF names", () => {
  for (const damage of [
    Buffer.from([0x01]),
    Buffer.from([0x00]),
    Buffer.from("\uFEFF"),
    Buffer.from([0xff]),
  ]) {
    for (const [head, tail] of [
      ["%YA", "ML 1.2\n---"],
      ["%T", "AG ! x\n---"],
    ]) {
      const byte = head.length;
      assertEditHistory({
        source: Buffer.concat([Buffer.from(head), damage, Buffer.from(tail)]),
        edits: [
          { byte, deleteBytes: damage.length, insert: "\uFEFF" },
          { byte, deleteBytes: 1, insert: "" },
          { byte, deleteBytes: 2, insert: "" },
          { byte, deleteBytes: 0, insert: "\x01" },
          { byte, deleteBytes: 1, insert: "" },
        ],
      });
    }
  }
  for (const damage of ["\x01", "\uFEFF"]) {
    const width = Buffer.byteLength(damage);
    for (const [name, arguments_] of [
      ["YAML", "1.2"],
      ["TAG", "! x"],
      ["YAMLX", "one"],
      ["TAGX", "one"],
    ]) {
      for (let position = 0; position <= name.length; position++) {
        const byte = position + 1;
        assertEditHistory({
          source: `%${name} ${arguments_}\n---`,
          edits: [
            { byte, deleteBytes: 0, insert: damage },
            { byte: name.length + 1 + width, deleteBytes: 0, insert: "X" },
            { byte: name.length + 1 + width, deleteBytes: 1, insert: "" },
            { byte, deleteBytes: width, insert: "" },
          ],
        });
      }
    }
    for (const [prefix, completion, arguments_] of [
      ["YA", "ML", "1.2"],
      ["T", "AG", "! x"],
    ]) {
      const source = `%${prefix}${damage}`;
      const byte = Buffer.byteLength(source);
      const nameEnd = byte + completion.length;
      const tail = ` ${arguments_}\n---`;
      assertEditHistory({
        source,
        edits: [
          { byte, deleteBytes: 0, insert: completion },
          { byte: nameEnd, deleteBytes: 0, insert: "X" },
          { byte: nameEnd, deleteBytes: 1, insert: "" },
          { byte: nameEnd, deleteBytes: 0, insert: tail },
          { byte: prefix.length + 1, deleteBytes: width, insert: "\t" },
          { byte: prefix.length + 1, deleteBytes: 1, insert: damage },
          { byte: nameEnd, deleteBytes: tail.length, insert: "" },
          { byte, deleteBytes: completion.length, insert: "" },
        ],
      });
    }
  }
});

test("yaml: directive argument edits restore their structure and EOF outcomes", () => {
  for (const damage of ["\x01", "\uFEFF"]) {
    const width = Buffer.byteLength(damage);
    for (const { source, byte, completion } of [
      { source: "%YAML 1", byte: 7, completion: ".2" },
      { source: "%TAG !", byte: 6, completion: "a! x" },
      { source: "%TAG a", byte: 6, completion: "b x" },
      { source: "%FUTURE a", byte: 9, completion: "b" },
      { source: "%YAML 1.2 a", byte: 11, completion: "b" },
    ]) {
      assertEditHistory({
        source,
        edits: [
          { byte, deleteBytes: 0, insert: damage },
          { byte: byte + width, deleteBytes: 0, insert: completion },
          { byte, deleteBytes: width, insert: "" },
          { byte, deleteBytes: 0, insert: damage },
          {
            byte: byte + width + completion.length,
            deleteBytes: 0,
            insert: "\n---",
          },
          {
            byte: byte + width + completion.length,
            deleteBytes: 4,
            insert: "",
          },
          { byte: byte + width, deleteBytes: completion.length, insert: "" },
          { byte, deleteBytes: width, insert: "" },
        ],
      });
    }
    for (const { source, byte } of [
      { source: `%YAML 1${damage}.2`, byte: 7 + width },
      { source: `%FUTURE a${damage}b`, byte: 9 },
      { source: `%TAG !a!${damage}x\n---`, byte: 8 },
      { source: `%TAG a${damage}b x\n---`, byte: 6 + width },
    ]) {
      assertEditHistory({
        source,
        edits: [
          { byte, deleteBytes: 0, insert: " " },
          { byte, deleteBytes: 1, insert: "" },
          { byte, deleteBytes: 0, insert: "\t" },
          { byte, deleteBytes: 1, insert: "" },
        ],
      });
    }
  }
});

test("yaml: fixed-seed generated histories preserve CLI edit handling and issue ranges", () => {
  const seed = 0x79616d6c;
  const sampleCount = 48;
  const editCount = 4;
  const lcgMultiplier = 1664525;
  const lcgIncrement = 1013904223;
  const lowercaseStart = "a".charCodeAt(0);
  const lowercaseEnd = "z".charCodeAt(0);
  const fallbackByte = Buffer.byteLength("[");
  let state = seed;
  const next = (maximum) => {
    state = (Math.imul(state, lcgMultiplier) + lcgIncrement) >>> 0;
    return state % maximum;
  };
  const seeds = [
    "[a, b]",
    "{key: value}",
    "key: [one, two]\n",
    "---\n[a]\n...\n",
  ];
  const replacements = ["a", "b", "name", "名", "", " ", "\n "];
  for (let sample = 0; sample < sampleCount; sample++) {
    const source = seeds[sample % seeds.length];
    let bytes = Buffer.from(source);
    const edits = [];
    for (let step = 0; step < editCount; step++) {
      const candidates = Array.from(bytes.entries())
        .filter(([, byte]) => byte >= lowercaseStart && byte <= lowercaseEnd)
        .map(([index]) => index);
      const byte = candidates.length
        ? candidates[next(candidates.length)]
        : fallbackByte;
      const edit = {
        byte,
        deleteBytes: candidates.length ? 1 : 0,
        insert: replacements[next(replacements.length)],
      };
      edits.push(edit);
      bytes = applyEdits(bytes, [edit]);
      try {
        assertIncrementalEqualsFresh(source, edits, bytes);
      } catch (error) {
        throw new Error(JSON.stringify({ seed, source, edits }), {
          cause: error,
        });
      }
    }
  }
});
