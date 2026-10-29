import assert from "node:assert/strict";

const implicitKeyCharacterLimit = 1024;
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
    const match = /^(([a-z_]+): )?(MISSING )?([a-z_]+|ERROR)/.exec(
      line.slice(position.length).replace(/^•/, ""),
    );
    if (!match) continue;
    const [, , field, missing, kind] = match;
    const indentation = position.length;
    while (ancestors.length && ancestors.at(-1).indentation >= indentation)
      ancestors.pop();
    const start = starts[Number(startRow)] + Number(startColumn);
    const end = starts[Number(endRow)] + Number(endColumn);
    nodes.push({
      kind,
      ...(missing ? { missing: true } : {}),
      field: field ?? null,
      start,
      end,
      parent: ancestors.at(-1)?.index ?? null,
    });
    ancestors.push({ indentation, index: nodes.length - 1 });
  }
  assert.ok(nodes.length > 0, text);
  if (hasError(nodes)) return nodes;
  assert.equal(nodes[0].kind, "stream", text);
  assert.equal(nodes[0].end, bytes.length, text);
  const parents = new Set(nodes.map(({ parent }) => parent));
  let covered = bytes.subarray(0, utf8Bom.length).equals(utf8Bom)
    ? utf8Bom.length
    : 0;
  for (const [index, node] of nodes.entries()) {
    if (parents.has(index) || node.start === node.end) continue;
    assert.equal(node.start, covered, `Unowned or overlapping source: ${text}`);
    covered = node.end;
  }
  assert.equal(covered, bytes.length, `Unowned source suffix: ${text}`);
  return nodes;
}

function hasError(nodes) {
  return nodes.some(({ kind, missing }) => kind === "ERROR" || missing);
}

function counts(nodes, kinds) {
  return kinds.map((kind) => nodes.filter((node) => node.kind === kind).length);
}

export { counts, hasError, implicitKeyCharacterLimit, parseCst };
