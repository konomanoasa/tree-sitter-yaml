import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "@konomanoasa/tree-sitter-yaml";
import Parser from "tree-sitter";

test("Node.js language parses YAML with the external scanner and exposes node metadata", () => {
  const parser = new Parser();
  parser.setLanguage(YAML);
  const source = "key:\n  - value\n";
  const tree = parser.parse(source);
  assert.equal(tree.rootNode.type, "stream");
  assert.equal(tree.rootNode.hasError, false);
  assert.equal(tree.rootNode.text, source);
  assert.equal(
    tree.rootNode.descendantsOfType("block_sequence_entry").length,
    1,
  );
  assert.ok(
    YAML.nodeTypeInfo.some((node) => node.type === "stream" && node.named),
  );
});

test("Node.js packaged highlights capture comment text", () => {
  const parser = new Parser();
  parser.setLanguage(YAML);
  const tree = parser.parse("# hello\n");
  const query = new Parser.Query(YAML, YAML.HIGHLIGHTS_QUERY);
  assert.deepEqual(
    query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]),
    [
      ["comment", "#"],
      ["comment", " hello"],
    ],
  );
});
