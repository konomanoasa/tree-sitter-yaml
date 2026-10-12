import assert from "node:assert/strict";

const newlineByte = 0x0a;
const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);

function parseCst(text, source) {
  const bytes = Buffer.from(source);
  const starts = [0];
  for (const [offset, value] of bytes.entries())
    if (value === newlineByte) starts.push(offset + 1);
  const nodes = [],
    ancestors = [];
  for (const line of text.split("\n")) {
    const location = /^([0-9]+):([0-9]+) +- +([0-9]+):([0-9]+) +/.exec(line);
    if (!location) continue;
    const [position, startRow, startColumn, endRow, endColumn] = location;
    const match = /^(([a-z_]+): )?([a-z_]+|ERROR|MISSING)/.exec(
      line.slice(position.length),
    );
    if (!match) continue;
    const [, , field, kind] = match;
    const indentation = position.length;
    while (ancestors.length && ancestors.at(-1).indentation >= indentation)
      ancestors.pop();
    const start = starts[Number(startRow)] + Number(startColumn);
    const end = starts[Number(endRow)] + Number(endColumn);
    nodes.push({
      kind,
      field: field ?? null,
      start,
      end,
      parent: ancestors.at(-1)?.index ?? null,
    });
    ancestors.push({ indentation, index: nodes.length - 1 });
  }
  assert.equal(nodes[0]?.kind, "stream", text);
  assert.equal(nodes[0].end, bytes.length, text);
  assert.ok(
    !nodes.some(({ kind }) => kind === "ERROR" || kind === "MISSING"),
    text,
  );
  const parents = new Set(nodes.map(({ parent }) => parent));
  let covered = bytes.subarray(0, utf8Bom.length).equals(utf8Bom)
    ? utf8Bom.length
    : 0;
  for (const [index, node] of nodes.entries()) {
    if (parents.has(index) || node.start === node.end) continue;
    if (node.start > covered && node.kind === "invalid_encoding") {
      const prefix = bytes.subarray(covered, node.start).toString();
      assert.match(prefix, /^(\\([xuU][0-9A-Fa-f]*)?|%[0-9A-Fa-f]?)$/);
      const issue = nodes[nodes[node.parent].parent];
      const owner = nodes[issue.parent];
      assert.ok(owner.start <= covered && owner.end >= node.end, text);
      covered = node.start;
    }
    assert.equal(node.start, covered, `Unowned or overlapping source: ${text}`);
    covered = node.end;
  }
  assert.equal(covered, bytes.length, `Unowned source suffix: ${text}`);
  issues(nodes);
  return nodes;
}

function issues(nodes) {
  return nodes.flatMap((node, index) => {
    if (node.kind !== "syntax_issue") return [];
    const outcome = nodes[index + 1],
      reason = nodes[index + 2];
    assert.equal(node.field, "issue");
    assert.equal(outcome.parent, index);
    assert.ok(["invalid_syntax", "incomplete_syntax"].includes(outcome.kind));
    assert.equal(reason.parent, index + 1);
    assert.deepEqual(
      [outcome.start, outcome.end, reason.start, reason.end],
      [node.start, node.end, node.start, node.end],
    );
    return [[outcome.kind, reason.kind, node.start, node.end]];
  });
}

function counts(nodes, kinds) {
  return kinds.map((kind) => nodes.filter((node) => node.kind === kind).length);
}

export { counts, issues, parseCst };
