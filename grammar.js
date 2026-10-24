const problems = [
  ["invalid_encoding", "invalid_syntax", "invalid_encoding"],
  ["invalid_character", "invalid_syntax", "invalid_character"],
  ["invalid_escape", "invalid_syntax", "invalid_escape"],
  ["incomplete_escape", "incomplete_syntax", "invalid_escape"],
  [
    "invalid_line_continuation",
    "invalid_syntax",
    "invalid_line_continuation",
    "escape_indicator",
  ],
  ["invalid_scalar_start", "invalid_syntax", "invalid_scalar_start"],
  ["incomplete_scalar_start", "incomplete_syntax", "invalid_scalar_start"],
  ["missing_flow_separator", "invalid_syntax", "missing_flow_separator"],
  ["unexpected_flow_separator", "invalid_syntax", "unexpected_flow_separator"],
  ["invalid_indentation", "invalid_syntax", "invalid_indentation"],
  ["tab_in_indentation", "invalid_syntax", "tab_in_indentation"],
  ["missing_indentation", "invalid_syntax", "missing_indentation"],
  ["missing_separation", "invalid_syntax", "missing_separation"],
  ["invalid_block_header", "invalid_syntax", "invalid_header_character"],
  ["invalid_tag_handle", "invalid_syntax", "invalid_tag_handle"],
  ["invalid_tag_character", "invalid_syntax", "invalid_tag_character"],
  ["invalid_tag_prefix_start", "invalid_syntax", "invalid_tag_prefix_start"],
  ["invalid_uri_escape", "invalid_syntax", "invalid_uri_escape"],
  ["incomplete_uri_escape", "incomplete_syntax", "invalid_uri_escape"],
  [
    "unexpected_document_end_content",
    "invalid_syntax",
    "unexpected_document_end_content",
  ],
  [
    "invalid_header_indentation",
    "invalid_syntax",
    "unexpected_indentation_indicator",
    "indentation_indicator",
  ],
  [
    "invalid_header_chomping",
    "invalid_syntax",
    "unexpected_chomping_indicator",
    "chomping_indicator",
  ],
  ["missing_document_end", "invalid_syntax", "missing_document_end"],
  ...[
    "quote_close",
    "flow_sequence_close",
    "flow_mapping_close",
    "value_indicator",
    "anchor_name",
    "alias_name",
    "tag_uri",
    "tag_suffix",
    "verbatim_tag_close",
    "directive_name",
    "yaml_version",
    "tag_handle",
    "tag_handle_close",
    "tag_prefix",
    "document_start",
  ].flatMap((name) => [
    [`missing_${name}`, "invalid_syntax", `missing_${name}`],
    [`incomplete_${name}`, "incomplete_syntax", `missing_${name}`],
  ]),
  ...[
    "invalid_indentation",
    "tab_in_indentation",
    "missing_indentation",
    "missing_flow_separator",
  ].map((name) => [`unfinished_${name}`, "incomplete_syntax", name]),
];

const structuredProblems = [
  {
    name: "unexpected_document_content",
    reason: "unexpected_document_content",
    start: [
      "_unexpected_document_content_start",
      "_unfinished_unexpected_document_content_start",
    ],
    body: ($) => seq(field("content", $._node), $._document_content_end),
  },
  extraContent("unexpected_collection_content", "_node"),
  extraContent("unexpected_sequence_content", "_sequence_node"),
  extraContent("unexpected_shared_content", "_shared_node"),
  {
    name: "invalid_document_collection",
    reason: "invalid_compact_collection",
    start: [
      "_document_compact_start",
      "_unfinished_invalid_document_collection_start",
    ],
    body: ($) => field("content", $._collection_in_mapping),
  },
  {
    name: "duplicate_anchor",
    reason: "duplicate_anchor",
    start: ["_duplicate_anchor_start", "_unfinished_duplicate_anchor_start"],
    body: ($) => field("property", $.anchor),
  },
  {
    name: "duplicate_tag",
    reason: "duplicate_tag",
    start: ["_duplicate_tag_start", "_unfinished_duplicate_tag_start"],
    body: ($) => field("property", $._tag),
  },
  {
    name: "properties_on_alias",
    reason: "properties_on_alias",
    start: ["_property_alias_start", "_unfinished_properties_on_alias_start"],
    body: ($) => field("content", $.alias),
  },
  propertyCollection("invalid_property_collection", "_collection_in_mapping"),
  propertyCollection(
    "invalid_sequence_property_collection",
    "_collection_in_sequence",
  ),
  propertyCollection(
    "invalid_shared_property_collection",
    "_collection_in_shared",
  ),
  compactCollection("invalid_compact_collection", "_collection_in_mapping"),
  compactCollection(
    "invalid_shared_compact_collection",
    "_collection_in_shared",
  ),
  {
    name: "invalid_implicit_key",
    reason: "invalid_implicit_key",
    end: ["_invalid_key_end", "_unfinished_invalid_key_end"],
    body: ($) => seq($._implicit_key_start, field("key", $._flow_node)),
  },
  {
    name: "invalid_yaml_version",
    reason: "invalid_yaml_version",
    start: [
      "_invalid_yaml_version_start",
      "_unfinished_invalid_yaml_version_start",
    ],
    body: ($) => alias($._yaml_version_body, $.yaml_version),
  },
  {
    name: "unexpected_directive_parameter",
    reason: "unexpected_directive_parameter",
    start: ["_unexpected_directive_parameter_start"],
    body: ($) => alias($._directive_parameter_body, $.directive_parameter),
  },
];

const unfinishedStarts = [
  ...new Set(structuredProblems.flatMap(({ start = [] }) => start.slice(1))),
];

export default grammar({
  name: "yaml",
  externals: ($) => [
    $.line_break,
    $._eof,
    $._document_open,
    $._document_close,
    $.document_start,
    $.document_end,
    $.byte_order_mark,
    $._indent,
    $._dedent,
    $._outdent,
    $._restore_indent,
    $._mapping_start,
    $._mapping_end,
    $._mapping_in_mapping_end,
    $._mapping_in_sequence_end,
    $._mapping_in_shared_end,
    $._pair_start,
    $._sequence_start,
    $._sequence_end,
    $._sequence_in_mapping_end,
    $._sequence_in_sequence_end,
    $._sequence_in_shared_end,
    $._entry_start,
    $._block_out_value_start,
    $._block_in_value_start,
    $._empty_block_node,
    $._explicit_value_start,
    $._invalid_compact_start,
    $.sequence_indicator,
    $.value_indicator,
    $.key_indicator,
    $._single_start,
    $._double_start,
    $._flow_sequence_start,
    $._flow_mapping_start,
    $._flow_map_pair_start,
    $._flow_seq_pair_start,
    $._implicit_key_start,
    $._key_end,
    $._invalid_key_end,
    $._unfinished_invalid_key_end,
    $._flow_node_end,
    $._plain_start,
    $._plain_end,
    $._plain_continue,
    $.scalar_text,
    $._single_open,
    $._double_open,
    $.quote_close,
    $.quoted_escape,
    $.escaped_quote,
    $.scalar_line_break,
    $.scalar_line_prefix,
    $.scalar_line_suffix,
    $.escape_indicator,
    $.flow_sequence_open,
    $.flow_sequence_close,
    $.flow_mapping_open,
    $.flow_mapping_close,
    $.flow_separator,
    $._comment_start,
    $.comment_marker,
    $.comment_text,
    $._comment_end,
    $._line_prefix_start,
    $._line_prefix_end,
    $.indentation,
    $.separation,
    $._line_context,
    $._literal_start,
    $._folded_start,
    $.literal_indicator,
    $.folded_indicator,
    $.indentation_indicator,
    $.chomping_indicator,
    $.block_header_break,
    $._block_header_end,
    $._block_body_start,
    $._block_scalar_end,
    $._block_text_line_start,
    $._block_spaced_line_start,
    $._block_empty_line_start,
    $._block_line_end,
    $._boundary_check,
    $._document_content_end,
    $._document_compact_start,
    $._unexpected_document_content_start,
    $._unexpected_collection_content_start,
    $._collection_content_end,
    $._properties_start,
    $._properties_end,
    $._block_properties_end,
    $._empty_properties_end,
    $._property_continue,
    $._property_content_start,
    $._block_property_content_start,
    $._block_key_content_start,
    $._duplicate_anchor_start,
    $._duplicate_tag_start,
    $._property_alias_start,
    $._property_compact_start,
    $.anchor_indicator,
    $._alias_start,
    $.alias_indicator,
    $.anchor_name,
    $.alias_name,
    $._name_end,
    $._verbatim_tag_start,
    $.verbatim_tag_open,
    $.verbatim_tag_close,
    $._shorthand_tag_start,
    $.non_specific_tag,
    $._tag_handle_start,
    $.primary_tag_handle,
    $.secondary_tag_handle,
    $.tag_handle_open,
    $.tag_handle_name,
    $.tag_handle_close,
    $._tag_suffix_start,
    $._tag_end,
    $._tag_uri_start,
    $._tag_uri_end,
    $.uri_text,
    $.tag_suffix_text,
    $.uri_escape,
    $._yaml_directive_start,
    $._tag_directive_start,
    $._reserved_directive_start,
    $.directive_indicator,
    $.directive_name,
    $._directive_name_end,
    $._directive_end,
    $._yaml_version_start,
    $._invalid_yaml_version_start,
    $.yaml_version_text,
    $._tag_prefix_start,
    $._tag_prefix_end,
    $._directive_parameter_start,
    $._unexpected_directive_parameter_start,
    $.directive_parameter_text,
    $._directive_word_end,
    ...unfinishedStarts.map((name) => $[name]),
    ...problems.map(([name]) => $[`_${name}`]),
    $._undecodable_escape_prefix,
    $._error_sentinel,
  ],
  extras: ($) => [
    $.line_break,
    $.separation,
    $.comment,
    $.line_prefix,
    $._line_context,
    $._boundary_check,
    $._unmatchable,
  ],
  rules: {
    stream: ($) =>
      seq(
        repeat(
          choice(
            $.document,
            $.document_end,
            $.byte_order_mark,
            invalid($),
            issue($, "unexpected_document_end_content"),
          ),
        ),
        $._eof,
      ),
    document: ($) =>
      seq(
        $._document_open,
        optional(issue($, "missing_document_end")),
        choice(
          seq(
            repeat1(
              choice($.yaml_directive, $.tag_directive, $.reserved_directive),
            ),
            $._document_start,
          ),
          optional($._document_start),
        ),
        optional($._document_content),
        repeat(unfinishedIssue($, "unexpected_document_content")),
        $._document_close,
      ),
    _document_start: ($) =>
      choice($.document_start, missing($, "document_start")),
    _document_content: ($) =>
      seq(
        choice(
          field("content", $._node),
          unfinishedIssue($, "invalid_document_collection"),
        ),
        $._document_content_end,
      ),
    yaml_directive: ($) =>
      seq(
        $._yaml_directive_start,
        $._directive_head,
        repeat(invalid($)),
        $._yaml_directive_version,
        $._directive_tail,
      ),
    _yaml_directive_version: ($) =>
      choice(
        field("version", $.yaml_version),
        missing($, "yaml_version"),
        issue($, "invalid_yaml_version"),
        issue($, "unfinished_invalid_yaml_version"),
      ),
    yaml_version: ($) => seq($._yaml_version_start, $._yaml_version_body),
    _yaml_version_body: ($) =>
      seq(
        repeat1(choice($.yaml_version_text, invalid($))),
        $._directive_word_end,
      ),
    tag_directive: ($) =>
      seq(
        $._tag_directive_start,
        $._directive_head,
        repeat(invalid($)),
        $._tag_directive_handle,
        repeat(invalid($)),
        optional(issue($, "missing_separation")),
        $._tag_directive_prefix,
        $._directive_tail,
      ),
    _tag_directive_handle: ($) =>
      choice(
        tagHandle($, alias($._directive_named_handle, $.named_tag_handle)),
        missing($, "tag_handle"),
        issue($, "invalid_tag_handle"),
      ),
    _tag_directive_prefix: ($) =>
      choice(field("prefix", $.tag_prefix), missing($, "tag_prefix")),
    reserved_directive: ($) =>
      seq(
        $._reserved_directive_start,
        $._directive_head,
        repeat(choice(field("parameter", $.directive_parameter), invalid($))),
        $._directive_end,
      ),
    _directive_head: ($) =>
      seq(
        field("indicator", $.directive_indicator),
        names($, "directive_name", $._directive_name_end),
      ),
    _directive_tail: ($) =>
      seq(
        repeat(choice(issue($, "unexpected_directive_parameter"), invalid($))),
        $._directive_end,
      ),
    directive_parameter: ($) =>
      seq($._directive_parameter_start, $._directive_parameter_body),
    _directive_parameter_body: ($) =>
      seq(
        repeat1(choice($.directive_parameter_text, invalid($))),
        $._directive_word_end,
      ),
    _directive_named_handle: ($) =>
      namedTagHandle($, closing($, "tag_handle_close")),
    tag_prefix: ($) =>
      seq(
        $._tag_prefix_start,
        repeat1(uriPart($, $.uri_text, issue($, "invalid_tag_prefix_start"))),
        $._tag_prefix_end,
      ),
    _node: ($) => choice($._node_content, $.alias, $.node_with_properties),
    _node_content: ($) =>
      nodeContent($, $._mapping_in_mapping, $._sequence_in_mapping),
    _sequence_node: ($) =>
      contextNode($, $._sequence_node_content, $._sequence_properties),
    _sequence_node_content: ($) =>
      nodeContent($, $._mapping_in_sequence, $._sequence_in_sequence),
    _shared_node: ($) =>
      contextNode($, $._shared_node_content, $._shared_properties),
    _shared_node_content: ($) =>
      nodeContent($, $._mapping_in_shared, $._sequence_in_shared),
    _collection_in_mapping: ($) =>
      blockCollection($, $._mapping_in_mapping, $._sequence_in_mapping),
    _collection_in_sequence: ($) =>
      blockCollection($, $._mapping_in_sequence, $._sequence_in_sequence),
    _collection_in_shared: ($) =>
      blockCollection($, $._mapping_in_shared, $._sequence_in_shared),
    _flow_node: ($) => contextNode($, $._flow_content, $._flow_properties),
    _flow_content: ($) =>
      choice(
        $.plain_scalar,
        $.single_quoted_scalar,
        $.double_quoted_scalar,
        $.flow_sequence,
        $.flow_mapping,
      ),
    node_with_properties: ($) =>
      blockProperties($, $._node_content, "invalid_property_collection"),
    _sequence_properties: ($) =>
      blockProperties(
        $,
        $._sequence_node_content,
        "invalid_sequence_property_collection",
      ),
    _shared_properties: ($) =>
      blockProperties(
        $,
        $._shared_node_content,
        "invalid_shared_property_collection",
      ),
    _flow_properties: ($) =>
      propertyNode(
        $,
        $._properties_end,
        choice(
          seq($._property_content_start, field("content", $._flow_content)),
          seq($._block_key_content_start, field("content", $._node_content)),
        ),
        "invalid_property_collection",
      ),
    _property_list: ($) => propertyList($),
    _tag: ($) => choice($.non_specific_tag, $.shorthand_tag, $.verbatim_tag),
    anchor: ($) =>
      seq(
        field("indicator", $.anchor_indicator),
        names($, "anchor_name", $._name_end),
      ),
    alias: ($) =>
      seq(
        $._alias_start,
        field("indicator", $.alias_indicator),
        names($, "alias_name", $._name_end),
      ),
    shorthand_tag: ($) =>
      seq(
        $._shorthand_tag_start,
        tagHandle($, $.named_tag_handle),
        choice(field("suffix", $.tag_suffix), missing($, "tag_suffix")),
        $._tag_end,
      ),
    named_tag_handle: ($) =>
      namedTagHandle($, field("closing", $.tag_handle_close)),
    verbatim_tag: ($) =>
      seq(
        $._verbatim_tag_start,
        field("opening", $.verbatim_tag_open),
        choice(field("uri", $.tag_uri), missing($, "tag_uri")),
        closing($, "verbatim_tag_close"),
      ),
    tag_uri: ($) =>
      seq($._tag_uri_start, repeat1(uriPart($, $.uri_text)), $._tag_uri_end),
    tag_suffix: ($) =>
      seq($._tag_suffix_start, repeat1(uriPart($, $.tag_suffix_text))),
    _indented_node: ($) =>
      seq(
        $._indent,
        choice($._indented_node, $.block_mapping, $.block_sequence),
        $._dedent,
      ),
    _dedented_node: ($) =>
      seq(
        $._outdent,
        choice($._dedented_node, $.block_mapping, $.block_sequence),
        $._restore_indent,
      ),
    block_mapping: ($) => blockMapping($, false, $._mapping_end),
    _mapping_in_mapping: ($) =>
      blockMapping($, false, $._mapping_in_mapping_end),
    _mapping_in_sequence: ($) =>
      blockMapping($, true, $._mapping_in_sequence_end),
    _mapping_in_shared: ($) => blockMapping($, true, $._mapping_in_shared_end),
    _mapping_layout: ($) =>
      choice(
        alias($._mapping_prefix, $.line_prefix),
        alias($._mapping_comment, $.comment),
      ),
    block_mapping_pair: ($) =>
      mappingPair(
        $,
        $._block_out_value_start,
        $._node,
        "invalid_compact_collection",
      ),
    _shared_pair: ($) =>
      mappingPair(
        $,
        $._block_in_value_start,
        $._shared_node,
        "invalid_shared_compact_collection",
      ),
    block_sequence: ($) => blockSequence($, false, $._sequence_end),
    _sequence_in_mapping: ($) =>
      blockSequence($, true, $._sequence_in_mapping_end),
    _sequence_in_sequence: ($) =>
      blockSequence($, false, $._sequence_in_sequence_end),
    _sequence_in_shared: ($) =>
      blockSequence($, true, $._sequence_in_shared_end),
    block_sequence_entry: ($) => blockSequenceEntry($, $._sequence_node),
    _shared_entry: ($) => blockSequenceEntry($, $._shared_node),
    literal_scalar: ($) => blockScalar($, $._literal_start),
    folded_scalar: ($) => blockScalar($, $._folded_start),
    block_scalar_header: ($) =>
      seq(
        field("style", choice($.literal_indicator, $.folded_indicator)),
        repeat($._block_header_issue),
        optional(
          choice(
            seq(
              $._block_header_indentation,
              optional($._block_header_chomping),
            ),
            seq(
              $._block_header_chomping,
              optional($._block_header_indentation),
            ),
          ),
        ),
        optional($.block_header_break),
        $._block_header_end,
      ),
    _block_header_issue: ($) =>
      choice(
        issue($, "invalid_block_header"),
        issue($, "invalid_header_indentation"),
        issue($, "invalid_header_chomping"),
        invalid($),
      ),
    _block_header_indentation: ($) =>
      seq(
        field("indentation", $.indentation_indicator),
        repeat($._block_header_issue),
      ),
    _block_header_chomping: ($) =>
      seq(
        field("chomping", $.chomping_indicator),
        repeat($._block_header_issue),
      ),
    block_scalar_line: ($) => blockLine($, $._block_text_line_start),
    block_scalar_spaced_line: ($) => blockLine($, $._block_spaced_line_start),
    block_scalar_empty_line: ($) =>
      seq(
        $._block_empty_line_start,
        optional(field("prefix", $.scalar_line_prefix)),
        optional(unfinishedIssue($, "invalid_indentation")),
        $.scalar_line_break,
        $._block_line_end,
      ),
    plain_scalar: ($) =>
      seq(
        $._plain_start,
        repeat1(
          choice(
            ...scalarParts($),
            $._plain_continue,
            issue($, "invalid_scalar_start"),
            issue($, "incomplete_scalar_start"),
          ),
        ),
        $._plain_end,
      ),
    single_quoted_scalar: ($) =>
      quotedScalar($, $._single_start, $._single_open, [$.escaped_quote]),
    double_quoted_scalar: ($) =>
      quotedScalar($, $._double_start, $._double_open, [
        $.quoted_escape,
        $.line_continuation,
        issue($, "invalid_escape"),
        issue($, "incomplete_escape"),
        seq($._undecodable_escape_prefix, issue($, "invalid_encoding")),
      ]),
    line_continuation: ($) =>
      prec.right(
        seq(
          choice($.escape_indicator, issue($, "invalid_line_continuation")),
          $.scalar_line_break,
          optional($.scalar_line_prefix),
        ),
      ),
    flow_sequence: ($) =>
      flowCollection(
        $,
        $._flow_sequence_start,
        $.flow_sequence_open,
        $._flow_sequence_entries,
        "flow_sequence_close",
      ),
    _flow_sequence_entries: ($) => flowEntries($, $._flow_sequence_entry),
    _flow_sequence_entry: ($) =>
      choice(
        seq($._implicit_key_start, $._flow_node, $._flow_node_end),
        alias($._flow_sequence_pair, $.flow_mapping_pair),
      ),
    flow_mapping: ($) =>
      flowCollection(
        $,
        $._flow_mapping_start,
        $.flow_mapping_open,
        $._flow_mapping_entries,
        "flow_mapping_close",
      ),
    _flow_mapping_entries: ($) => flowEntries($, $.flow_mapping_pair),
    flow_mapping_pair: ($) => seq($._flow_map_pair_start, $._flow_pair_body),
    _flow_sequence_pair: ($) =>
      choice(
        seq($._flow_seq_pair_start, choice(explicitFlowPair($), flowValue($))),
        seq($._implicit_key, flowValue($)),
      ),
    _implicit_key: ($) =>
      choice(
        seq($._implicit_key_start, field("key", $._flow_node), $._key_end),
        unfinishedIssue($, "invalid_implicit_key"),
      ),
    _flow_pair_body: ($) =>
      choice(
        explicitFlowPair($),
        seq(field("key", $._flow_node), optional(flowValue($))),
        flowValue($),
      ),
    comment,
    line_prefix: linePrefix,
    _mapping_comment: comment,
    _mapping_prefix: linePrefix,
    // Prevents lexer fallback from accepting EOF mid-input.
    _unmatchable: () => token(seq(/[\s\S]/, /[^\s\S]/)),
    ...issueRules(),
  },
});

function issueRules() {
  const rules = Object.fromEntries(
    problems.flatMap(([name, outcome, reason, leaf]) => [
      ...(leaf
        ? [[`_${name}_reason`, ($) => alias($[`_${name}`], $[leaf])]]
        : []),
      [
        `_${name}_outcome`,
        ($) => alias($[leaf ? `_${name}_reason` : `_${name}`], $[reason]),
      ],
      [`_${name}_issue`, ($) => alias($[`_${name}_outcome`], $[outcome])],
    ]),
  );
  for (const { name, reason, start, end, body } of structuredProblems) {
    for (const [index, boundary] of (start ?? end).entries()) {
      const unfinished = index !== 0;
      const id = unfinished ? `unfinished_${name}` : name;
      rules[`_${id}_reason`] = ($) =>
        end ? seq(body($), $[boundary]) : seq($[boundary], body($));
      rules[`_${id}_outcome`] = ($) => alias($[`_${id}_reason`], $[reason]);
      rules[`_${id}_issue`] = ($) =>
        alias(
          $[`_${id}_outcome`],
          unfinished ? $.incomplete_syntax : $.invalid_syntax,
        );
    }
  }
  return rules;
}

function extraContent(name, node) {
  return {
    name,
    reason: "unexpected_collection_content",
    start: [
      "_unexpected_collection_content_start",
      "_unfinished_unexpected_collection_content_start",
    ],
    body: ($) => seq(field("content", $[node]), $._collection_content_end),
  };
}

function propertyCollection(name, collection) {
  return {
    name,
    reason: "invalid_compact_collection",
    start: [
      "_property_compact_start",
      "_unfinished_invalid_property_collection_start",
    ],
    body: ($) => field("content", $[collection]),
  };
}

function compactCollection(name, collection) {
  return {
    name,
    reason: "invalid_compact_collection",
    start: [
      "_invalid_compact_start",
      "_unfinished_invalid_compact_collection_start",
    ],
    body: ($) => field("value", $[collection]),
  };
}

function issue($, name) {
  return field("issue", alias($[`_${name}_issue`], $.syntax_issue));
}

function missing($, name) {
  return choice(issue($, `missing_${name}`), issue($, `incomplete_${name}`));
}

function closing($, name) {
  return choice(field("closing", $[name]), missing($, name));
}

function invalid($) {
  return choice(issue($, "invalid_encoding"), issue($, "invalid_character"));
}

function unfinishedIssue($, name) {
  return choice(issue($, name), issue($, `unfinished_${name}`));
}

function indentationIssue($) {
  return choice(
    unfinishedIssue($, "invalid_indentation"),
    unfinishedIssue($, "tab_in_indentation"),
    unfinishedIssue($, "missing_indentation"),
  );
}

function flowCollection($, start, opening, entries, closingName) {
  return seq(
    start,
    field("opening", opening),
    optional(entries),
    closing($, closingName),
  );
}

function flowEntries($, entry) {
  const unexpectedSeparator = issue($, "unexpected_flow_separator");
  return choice(
    repeat1(unexpectedSeparator),
    seq(
      repeat(unexpectedSeparator),
      entry,
      repeat(
        seq(
          choice(
            $.flow_separator,
            unfinishedIssue($, "missing_flow_separator"),
          ),
          repeat(unexpectedSeparator),
          entry,
        ),
      ),
      optional(seq($.flow_separator, repeat(unexpectedSeparator))),
    ),
  );
}

function explicitFlowPair($) {
  return seq(
    field("key_indicator", $.key_indicator),
    optional(field("key", $._flow_node)),
    optional(flowValue($)),
  );
}

function flowValue($) {
  return seq(
    field("indicator", $.value_indicator),
    optional(issue($, "missing_separation")),
    optional(field("value", $._flow_node)),
  );
}

function blockMapping($, shared, end) {
  const pair = shared
    ? alias($._shared_pair, $.block_mapping_pair)
    : $.block_mapping_pair;
  const content = shared
    ? "unexpected_shared_content"
    : "unexpected_collection_content";
  return seq(
    $._mapping_start,
    pair,
    repeat(choice($._mapping_layout, pair, unfinishedIssue($, content))),
    end,
  );
}

function mappingPair($, valueStart, node, compact) {
  return seq(
    $._pair_start,
    choice(
      seq(
        field("key_indicator", $.key_indicator),
        blockNode($, "key", valueStart, node),
        choice(
          seq(
            $._explicit_value_start,
            field("indicator", $.value_indicator),
            blockNode($, "value", valueStart, node),
          ),
          $._empty_block_node,
        ),
      ),
      seq(
        optional($._implicit_key),
        choice(
          seq(
            field("indicator", $.value_indicator),
            blockNode(
              $,
              "value",
              valueStart,
              node,
              unfinishedIssue($, compact),
            ),
          ),
          missing($, "value_indicator"),
        ),
      ),
    ),
  );
}

function blockSequence($, shared, end) {
  const entry = shared
    ? alias($._shared_entry, $.block_sequence_entry)
    : $.block_sequence_entry;
  const content = shared
    ? "unexpected_shared_content"
    : "unexpected_sequence_content";
  return seq(
    $._sequence_start,
    entry,
    repeat(choice(entry, unfinishedIssue($, content))),
    end,
  );
}

function contextNode($, content, properties) {
  return choice(content, $.alias, alias(properties, $.node_with_properties));
}

function nodeContent($, sameIndentMapping, sameIndentSequence) {
  return choice(
    $._flow_content,
    blockCollection($, sameIndentMapping, sameIndentSequence),
    $.literal_scalar,
    $.folded_scalar,
  );
}

function blockCollection($, sameIndentMapping, sameIndentSequence) {
  return choice(
    $._indented_node,
    $._dedented_node,
    alias(sameIndentMapping, $.block_mapping),
    alias(sameIndentSequence, $.block_sequence),
  );
}

function blockSequenceEntry($, node) {
  return seq(
    $._entry_start,
    field("indicator", $.sequence_indicator),
    blockNode($, "value", $._block_in_value_start, node),
  );
}

function blockNode($, name, start, node, ...issues) {
  return choice(
    seq(start, choice(field(name, node), ...issues)),
    $._empty_block_node,
  );
}

function blockScalar($, start) {
  return seq(
    start,
    field("header", $.block_scalar_header),
    $._block_body_start,
    repeat(
      choice(
        $.block_scalar_line,
        $.block_scalar_spaced_line,
        $.block_scalar_empty_line,
      ),
    ),
    $._block_scalar_end,
  );
}

function blockLine($, start) {
  return seq(
    start,
    optional(field("prefix", $.scalar_line_prefix)),
    repeat(choice($.scalar_text, indentationIssue($), invalid($))),
    optional($.scalar_line_break),
    $._block_line_end,
  );
}

function blockProperties($, content, compact) {
  return propertyNode(
    $,
    $._block_properties_end,
    seq($._block_property_content_start, field("content", content)),
    compact,
  );
}

function propertyNode($, end, content, compact) {
  return seq(
    $._property_list,
    choice(
      $._empty_properties_end,
      seq(
        end,
        optional(issue($, "missing_separation")),
        choice(
          content,
          unfinishedIssue($, "properties_on_alias"),
          unfinishedIssue($, compact),
        ),
      ),
    ),
  );
}

function propertyList($) {
  const duplicate = (name) => unfinishedIssue($, `duplicate_${name}`);
  const next = (rule) =>
    seq($._property_continue, optional(issue($, "missing_separation")), rule);
  const both = repeat(next(choice(duplicate("anchor"), duplicate("tag"))));
  const property = { anchor: $.anchor, tag: $._tag };
  const ordered = (first, second) =>
    seq(
      field("property", property[first]),
      repeat(next(duplicate(first))),
      optional(seq(next(field("property", property[second])), both)),
    );
  return seq(
    $._properties_start,
    choice(ordered("anchor", "tag"), ordered("tag", "anchor")),
  );
}

function names($, name, end) {
  return seq(
    choice(
      repeat1(choice(field("name", $[name]), invalid($))),
      missing($, name),
    ),
    end,
  );
}

function uriPart($, text, ...issues) {
  return choice(
    text,
    $.uri_escape,
    issue($, "invalid_uri_escape"),
    issue($, "incomplete_uri_escape"),
    seq($._undecodable_escape_prefix, issue($, "invalid_encoding")),
    issue($, "invalid_tag_character"),
    ...issues,
    invalid($),
  );
}

function tagHandle($, named) {
  return seq(
    $._tag_handle_start,
    field(
      "handle",
      choice($.primary_tag_handle, $.secondary_tag_handle, named),
    ),
  );
}

function namedTagHandle($, end) {
  return seq(
    field("opening", $.tag_handle_open),
    repeat1(
      choice(
        field("name", $.tag_handle_name),
        issue($, "invalid_tag_handle"),
        invalid($),
      ),
    ),
    end,
  );
}

function scalarParts($) {
  return [
    $.scalar_text,
    $.scalar_line_break,
    $.scalar_line_prefix,
    $.scalar_line_suffix,
    indentationIssue($),
    invalid($),
  ];
}

function quotedScalar($, start, opening, escapes) {
  return seq(
    start,
    field("opening", alias(opening, $.quote_open)),
    repeat(choice(...scalarParts($), ...escapes)),
    closing($, "quote_close"),
  );
}

function comment($) {
  return seq(
    $._comment_start,
    optional(issue($, "missing_separation")),
    $.comment_marker,
    repeat(choice($.comment_text, invalid($))),
    $._comment_end,
  );
}

function linePrefix($) {
  return seq(
    $._line_prefix_start,
    repeat1(choice($.indentation, $.separation, indentationIssue($))),
    $._line_prefix_end,
  );
}
