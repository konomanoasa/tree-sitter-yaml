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
  ["missing_flow_separator", "invalid_syntax", "missing_flow_separator"],
  ["unexpected_flow_separator", "invalid_syntax", "unexpected_flow_separator"],
  ["invalid_indentation", "invalid_syntax", "invalid_indentation"],
  ["missing_indentation", "invalid_syntax", "missing_indentation"],
  ["missing_separation", "invalid_syntax", "missing_separation"],
  ["invalid_block_header", "invalid_syntax", "invalid_header_character"],
  ["invalid_tag_handle", "invalid_syntax", "invalid_tag_handle"],
  ["invalid_tag_character", "invalid_syntax", "invalid_tag_character"],
  ["invalid_uri_escape", "invalid_syntax", "invalid_uri_escape"],
  ["incomplete_uri_escape", "incomplete_syntax", "invalid_uri_escape"],
  [
    "invalid_yaml_version",
    "invalid_syntax",
    "invalid_yaml_version",
    "yaml_version",
  ],
  [
    "unfinished_yaml_version",
    "incomplete_syntax",
    "invalid_yaml_version",
    "yaml_version",
  ],
  [
    "unexpected_directive_parameter",
    "invalid_syntax",
    "unexpected_directive_parameter",
    "directive_parameter",
  ],
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
];
const issue = ($, name) =>
  field("issue", alias($[`_${name}_issue`], $.syntax_issue));
const missing = ($, name) =>
  choice(issue($, `missing_${name}`), issue($, `incomplete_${name}`));
const invalid = ($) =>
  choice(issue($, "invalid_encoding"), issue($, "invalid_character"));
const problemRules = Object.fromEntries(
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
const structuredProblems = [
  {
    name: "unexpected_document_content",
    reason: "unexpected_document_content",
    body: ($) =>
      seq(
        $._unexpected_content_start,
        field("content", $._node),
        $._document_content_end,
      ),
  },
  {
    name: "invalid_document_collection",
    reason: "invalid_compact_collection",
    body: ($) => seq($._document_compact_start, field("content", $._node)),
  },
  {
    name: "duplicate_anchor",
    reason: "duplicate_anchor",
    body: ($) => seq($._duplicate_anchor_start, field("property", $.anchor)),
  },
  {
    name: "duplicate_tag",
    reason: "duplicate_tag",
    body: ($) => seq($._duplicate_tag_start, field("property", $._tag)),
  },
  {
    name: "properties_on_alias",
    reason: "properties_on_alias",
    body: ($) => seq($._property_alias_start, field("content", $.alias)),
  },
  {
    name: "invalid_property_collection",
    reason: "invalid_compact_collection",
    body: ($) =>
      seq($._property_compact_start, field("content", $._node_content)),
  },
  {
    name: "invalid_compact_collection",
    reason: "invalid_compact_collection",
    body: ($) => seq($._invalid_compact_start, field("value", $._node)),
  },
  {
    name: "invalid_implicit_key",
    reason: "invalid_implicit_key",
    body: ($) =>
      seq(
        $._implicit_key_start,
        field("key", $._flow_node),
        $._invalid_key_end,
      ),
  },
];
for (const { name, reason, body } of structuredProblems) {
  problemRules[`_${name}_reason`] = body;
  problemRules[`_${name}_outcome`] = ($) =>
    alias($[`_${name}_reason`], $[reason]);
  problemRules[`_${name}_issue`] = ($) =>
    alias($[`_${name}_outcome`], $.invalid_syntax);
}
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
    $._pair_start,
    $._sequence_start,
    $._sequence_end,
    $._entry_start,
    $._value_start,
    $._sequence_value_start,
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
    $._unexpected_content_start,
    $._properties_start,
    $._properties_end,
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
    $.yaml_version,
    $._tag_prefix_start,
    $._tag_prefix_end,
    $.directive_parameter,
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
            choice($.document_start, missing($, "document_start")),
          ),
          optional(choice($.document_start, missing($, "document_start"))),
        ),
        optional(
          seq(
            choice(
              field("content", $._node),
              issue($, "invalid_document_collection"),
            ),
            $._document_content_end,
          ),
        ),
        repeat(issue($, "unexpected_document_content")),
        $._document_close,
      ),
    yaml_directive: ($) =>
      seq(
        directiveHead($, $._yaml_directive_start),
        repeat(invalid($)),
        choice(
          field("version", $.yaml_version),
          missing($, "yaml_version"),
          issue($, "invalid_yaml_version"),
          issue($, "unfinished_yaml_version"),
        ),
        directiveTail($),
      ),
    tag_directive: ($) =>
      seq(
        directiveHead($, $._tag_directive_start),
        repeat(invalid($)),
        choice(
          seq(
            $._tag_handle_start,
            field(
              "handle",
              choice(
                $.primary_tag_handle,
                $.secondary_tag_handle,
                alias($._directive_named_handle, $.named_tag_handle),
              ),
            ),
          ),
          missing($, "tag_handle"),
          issue($, "invalid_tag_handle"),
        ),
        optional(issue($, "missing_separation")),
        choice(field("prefix", $.tag_prefix), missing($, "tag_prefix")),
        directiveTail($),
      ),
    reserved_directive: ($) =>
      seq(
        directiveHead($, $._reserved_directive_start),
        repeat(choice(field("parameter", $.directive_parameter), invalid($))),
        $._directive_end,
      ),
    _directive_named_handle: ($) =>
      seq(
        field("opening", $.tag_handle_open),
        repeat1(
          choice(
            field("name", $.tag_handle_name),
            issue($, "invalid_tag_handle"),
            invalid($),
          ),
        ),
        choice(
          field("closing", $.tag_handle_close),
          missing($, "tag_handle_close"),
        ),
      ),
    tag_prefix: ($) =>
      seq(
        $._tag_prefix_start,
        repeat1(uriPart($, $.uri_text)),
        $._tag_prefix_end,
      ),
    _node: ($) => choice($._node_content, $.alias, $.node_with_properties),
    _node_content: ($) =>
      choice(
        $._flow_content,
        $._indented_node,
        $._dedented_node,
        $.block_mapping,
        $.block_sequence,
        $.literal_scalar,
        $.folded_scalar,
      ),
    _flow_node: ($) =>
      choice(
        $._flow_content,
        $.alias,
        alias($._flow_properties, $.node_with_properties),
      ),
    _flow_content: ($) =>
      choice(
        $.plain_scalar,
        $.single_quoted_scalar,
        $.double_quoted_scalar,
        $.flow_sequence,
        $.flow_mapping,
      ),
    node_with_properties: ($) =>
      propertyNode(
        $,
        seq($._block_property_content_start, field("content", $._node_content)),
      ),
    _flow_properties: ($) =>
      propertyNode(
        $,
        choice(
          seq($._property_content_start, field("content", $._flow_content)),
          seq($._block_key_content_start, field("content", $._node_content)),
        ),
      ),
    _property: ($) => choice($.anchor, $._tag),
    _tag: ($) => choice($.non_specific_tag, $.shorthand_tag, $.verbatim_tag),
    anchor: ($) =>
      seq(
        field("indicator", $.anchor_indicator),
        choice(
          repeat1(choice(field("name", $.anchor_name), invalid($))),
          missing($, "anchor_name"),
        ),
        $._name_end,
      ),
    alias: ($) =>
      seq(
        $._alias_start,
        field("indicator", $.alias_indicator),
        choice(
          repeat1(choice(field("name", $.alias_name), invalid($))),
          missing($, "alias_name"),
        ),
        $._name_end,
      ),
    shorthand_tag: ($) =>
      seq(
        $._shorthand_tag_start,
        $._tag_handle_start,
        field(
          "handle",
          choice(
            $.primary_tag_handle,
            $.secondary_tag_handle,
            $.named_tag_handle,
          ),
        ),
        choice(field("suffix", $.tag_suffix), missing($, "tag_suffix")),
        $._tag_end,
      ),
    named_tag_handle: ($) =>
      seq(
        field("opening", $.tag_handle_open),
        repeat1(
          choice(
            field("name", $.tag_handle_name),
            issue($, "invalid_tag_handle"),
            invalid($),
          ),
        ),
        field("closing", $.tag_handle_close),
      ),
    verbatim_tag: ($) =>
      seq(
        $._verbatim_tag_start,
        field("opening", $.verbatim_tag_open),
        choice(field("uri", $.tag_uri), missing($, "tag_uri")),
        choice(
          field("closing", $.verbatim_tag_close),
          missing($, "verbatim_tag_close"),
        ),
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
    block_mapping: ($) =>
      seq($._mapping_start, repeat1($.block_mapping_pair), $._mapping_end),
    block_mapping_pair: ($) =>
      seq(
        $._pair_start,
        choice(
          seq(
            field("key_indicator", $.key_indicator),
            choice(
              seq($._value_start, field("key", $._node)),
              $._empty_block_node,
            ),
            choice(
              seq(
                $._explicit_value_start,
                field("indicator", $.value_indicator),
                choice(
                  seq($._value_start, field("value", $._node)),
                  $._empty_block_node,
                ),
              ),
              $._empty_block_node,
            ),
          ),
          seq(
            optional($._implicit_key),
            choice(
              seq(
                field("indicator", $.value_indicator),
                choice(
                  seq($._value_start, field("value", $._node)),
                  issue($, "invalid_compact_collection"),
                  $._empty_block_node,
                ),
              ),
              missing($, "value_indicator"),
            ),
          ),
        ),
      ),
    block_sequence: ($) =>
      seq($._sequence_start, repeat1($.block_sequence_entry), $._sequence_end),
    block_sequence_entry: ($) =>
      seq(
        $._entry_start,
        field("indicator", $.sequence_indicator),
        choice(
          seq($._sequence_value_start, field("value", $._node)),
          $._empty_block_node,
        ),
      ),
    literal_scalar: ($) => blockScalar($, $._literal_start),
    folded_scalar: ($) => blockScalar($, $._folded_start),
    block_scalar_header: ($) =>
      seq(
        field("style", choice($.literal_indicator, $.folded_indicator)),
        repeat(
          choice(
            field("indentation", $.indentation_indicator),
            field("chomping", $.chomping_indicator),
            issue($, "invalid_block_header"),
            issue($, "invalid_header_indentation"),
            issue($, "invalid_header_chomping"),
            invalid($),
          ),
        ),
        optional($.block_header_break),
        $._block_header_end,
      ),
    block_scalar_line: ($) => blockLine($, $._block_text_line_start),
    block_scalar_spaced_line: ($) => blockLine($, $._block_spaced_line_start),
    block_scalar_empty_line: ($) => blockLine($, $._block_empty_line_start),
    plain_scalar: ($) =>
      seq(
        $._plain_start,
        repeat1(
          choice(
            $.scalar_text,
            $._plain_continue,
            $.scalar_line_break,
            $.scalar_line_prefix,
            $.scalar_line_suffix,
            issue($, "invalid_indentation"),
            issue($, "missing_indentation"),
            invalid($),
            issue($, "invalid_scalar_start"),
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
      seq(
        $._flow_sequence_start,
        field("opening", $.flow_sequence_open),
        flowContent(
          $,
          choice(
            seq($._implicit_key_start, $._flow_node, $._flow_node_end),
            alias($._flow_sequence_pair, $.flow_mapping_pair),
          ),
        ),
        choice(
          field("closing", $.flow_sequence_close),
          missing($, "flow_sequence_close"),
        ),
      ),
    flow_mapping: ($) =>
      seq(
        $._flow_mapping_start,
        field("opening", $.flow_mapping_open),
        flowContent($, $.flow_mapping_pair),
        choice(
          field("closing", $.flow_mapping_close),
          missing($, "flow_mapping_close"),
        ),
      ),
    flow_mapping_pair: ($) => seq($._flow_map_pair_start, $._flow_pair_body),
    _flow_sequence_pair: ($) =>
      choice(
        seq($._flow_seq_pair_start, choice(explicitFlowPair($), flowValue($))),
        seq($._implicit_key, flowValue($)),
      ),
    _implicit_key: ($) =>
      choice(
        seq($._implicit_key_start, field("key", $._flow_node), $._key_end),
        issue($, "invalid_implicit_key"),
      ),
    _flow_pair_body: ($) =>
      choice(
        explicitFlowPair($),
        seq(field("key", $._flow_node), optional(flowValue($))),
        flowValue($),
      ),
    comment: ($) =>
      seq(
        $._comment_start,
        optional(issue($, "missing_separation")),
        $.comment_marker,
        repeat(choice($.comment_text, invalid($))),
        $._comment_end,
      ),
    line_prefix: ($) =>
      seq(
        $._line_prefix_start,
        repeat1(
          choice(
            $.indentation,
            $.separation,
            issue($, "invalid_indentation"),
            issue($, "missing_indentation"),
          ),
        ),
        $._line_prefix_end,
      ),
    // A nonmatching internal token keeps lexer fallback from accepting EOF mid-input.
    _unmatchable: () => token(seq(/[\s\S]/, /[^\s\S]/)),
    ...problemRules,
  },
});

function flowContent($, entry) {
  const extra = () => repeat(issue($, "unexpected_flow_separator"));
  return seq(
    extra(),
    optional(
      seq(
        entry,
        repeat(
          seq(
            choice($.flow_separator, issue($, "missing_flow_separator")),
            extra(),
            entry,
          ),
        ),
        optional(seq($.flow_separator, extra())),
      ),
    ),
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
    repeat(
      choice(
        $.scalar_text,
        issue($, "missing_indentation"),
        issue($, "invalid_indentation"),
        invalid($),
      ),
    ),
    optional($.scalar_line_break),
    $._block_line_end,
  );
}

function propertyNode($, content) {
  return seq(
    $._properties_start,
    repeat1(
      choice(
        field("property", $._property),
        issue($, "duplicate_anchor"),
        issue($, "duplicate_tag"),
        issue($, "missing_separation"),
      ),
    ),
    $._properties_end,
    optional(issue($, "missing_separation")),
    optional(
      choice(
        content,
        issue($, "properties_on_alias"),
        issue($, "invalid_property_collection"),
      ),
    ),
  );
}
function directiveHead($, start) {
  return seq(
    start,
    field("indicator", $.directive_indicator),
    choice(
      repeat1(choice(field("name", $.directive_name), invalid($))),
      missing($, "directive_name"),
    ),
    $._directive_name_end,
  );
}
function directiveTail($) {
  return seq(
    repeat(choice(issue($, "unexpected_directive_parameter"), invalid($))),
    $._directive_end,
  );
}
function uriPart($, text) {
  return choice(
    text,
    $.uri_escape,
    issue($, "invalid_uri_escape"),
    issue($, "incomplete_uri_escape"),
    seq($._undecodable_escape_prefix, issue($, "invalid_encoding")),
    issue($, "invalid_tag_character"),
    invalid($),
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
function quotedScalar($, start, opening, escapes) {
  return seq(
    start,
    field("opening", alias(opening, $.quote_open)),
    repeat(
      choice(
        $.scalar_text,
        $.scalar_line_break,
        $.scalar_line_prefix,
        $.scalar_line_suffix,
        issue($, "invalid_indentation"),
        issue($, "missing_indentation"),
        invalid($),
        ...escapes,
      ),
    ),
    choice(field("closing", $.quote_close), missing($, "quote_close")),
  );
}
