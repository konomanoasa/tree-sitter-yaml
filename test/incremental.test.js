import { test } from "node:test";
import {
  applyEdits,
  assertEditHistory,
  assertIncrementalEqualsFresh,
} from "./support/parser.js";

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
];

for (const [name, source, edits] of histories) {
  test(`yaml: ${name}`, () => {
    assertEditHistory({ source, edits });
  });
}

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
