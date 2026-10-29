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
    $._mapping_start,
    $._mapping_end,
    $._pair_start,
    $._sequence_start,
    $._sequence_end,
    $._sequence_in_mapping_end,
    $._entry_start,
    $._block_out_value_start,
    $._block_in_value_start,
    $._block_out_implicit_value_start,
    $._empty_block_node,
    $._explicit_value_start,
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
    $._properties_start,
    $._properties_end,
    $._block_properties_end,
    $._empty_properties_end,
    $._property_continue,
    $._property_content_start,
    $._block_property_content_start,
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
    $.yaml_version_text,
    $._tag_prefix_start,
    $._tag_prefix_end,
    $._directive_parameter_start,
    $.directive_parameter_text,
    $._directive_word_end,
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
        repeat(choice($.document, $.document_end, $.byte_order_mark)),
        $._eof,
      ),
    document: ($) =>
      seq(
        $._document_open,
        choice(
          seq(
            repeat1(
              choice($.yaml_directive, $.tag_directive, $.reserved_directive),
            ),
            $.document_start,
          ),
          optional($.document_start),
        ),
        optional(field("content", $._node)),
        $._document_close,
      ),
    yaml_directive: ($) =>
      seq(
        $._yaml_directive_start,
        $._directive_head,
        field("version", $.yaml_version),
        $._directive_end,
      ),
    yaml_version: ($) =>
      seq($._yaml_version_start, $.yaml_version_text, $._directive_word_end),
    tag_directive: ($) =>
      seq(
        $._tag_directive_start,
        $._directive_head,
        tagHandle($, $.named_tag_handle),
        field("prefix", $.tag_prefix),
        $._directive_end,
      ),
    reserved_directive: ($) =>
      seq(
        $._reserved_directive_start,
        $._directive_head,
        repeat(field("parameter", $.directive_parameter)),
        $._directive_end,
      ),
    _directive_head: ($) =>
      seq(
        field("indicator", $.directive_indicator),
        names($, "directive_name", $._directive_name_end),
      ),
    directive_parameter: ($) =>
      seq(
        $._directive_parameter_start,
        $.directive_parameter_text,
        $._directive_word_end,
      ),
    tag_prefix: ($) =>
      seq(
        $._tag_prefix_start,
        repeat1(uriPart($, $.uri_text)),
        $._tag_prefix_end,
      ),
    _node: ($) => choice($._node_content, $.alias, $.node_with_properties),
    _node_content: ($) =>
      nodeContent($, alias($._sequence_in_mapping, $.block_sequence)),
    _sequence_node: ($) =>
      contextNode($, $._sequence_node_content, $._sequence_properties),
    _sequence_node_content: ($) => nodeContent($),
    _flow_node: ($) => contextNode($, $._flow_content, $._flow_properties),
    _flow_content: ($) =>
      choice(
        $.plain_scalar,
        $.single_quoted_scalar,
        $.double_quoted_scalar,
        $.flow_sequence,
        $.flow_mapping,
      ),
    node_with_properties: ($) => blockProperties($, $._node_content),
    _sequence_properties: ($) => blockProperties($, $._sequence_node_content),
    _flow_properties: ($) =>
      propertyNode(
        $,
        $._properties_end,
        seq($._property_content_start, field("content", $._flow_content)),
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
        field("suffix", $.tag_suffix),
        $._tag_end,
      ),
    named_tag_handle: ($) =>
      seq(
        field("opening", $.tag_handle_open),
        field("name", $.tag_handle_name),
        field("closing", $.tag_handle_close),
      ),
    verbatim_tag: ($) =>
      seq(
        $._verbatim_tag_start,
        field("opening", $.verbatim_tag_open),
        field("uri", $.tag_uri),
        field("closing", $.verbatim_tag_close),
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
    block_mapping: ($) =>
      seq(
        $._mapping_start,
        $.block_mapping_pair,
        repeat(choice($._mapping_layout, $.block_mapping_pair)),
        $._mapping_end,
      ),
    _mapping_layout: ($) =>
      choice(
        alias($._mapping_prefix, $.line_prefix),
        alias($._mapping_comment, $.comment),
      ),
    block_mapping_pair: ($) =>
      seq(
        $._pair_start,
        choice(
          seq(
            field("key_indicator", $.key_indicator),
            blockNode($, "key", $._block_out_value_start, $._node),
            choice(
              seq(
                $._explicit_value_start,
                field("indicator", $.value_indicator),
                blockNode($, "value", $._block_out_value_start, $._node),
              ),
              $._empty_block_node,
            ),
          ),
          seq(
            optional($._implicit_key),
            field("indicator", $.value_indicator),
            blockNode($, "value", $._block_out_implicit_value_start, $._node),
          ),
        ),
      ),
    block_sequence: ($) => blockSequence($, $._sequence_end),
    _sequence_in_mapping: ($) => blockSequence($, $._sequence_in_mapping_end),
    block_sequence_entry: ($) =>
      seq(
        $._entry_start,
        field("indicator", $.sequence_indicator),
        blockNode($, "value", $._block_in_value_start, $._sequence_node),
      ),
    literal_scalar: ($) => blockScalar($, $._literal_start),
    folded_scalar: ($) => blockScalar($, $._folded_start),
    block_scalar_header: ($) =>
      seq(
        field("style", choice($.literal_indicator, $.folded_indicator)),
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
    _block_header_indentation: ($) =>
      field("indentation", $.indentation_indicator),
    _block_header_chomping: ($) => field("chomping", $.chomping_indicator),
    block_scalar_line: ($) => blockLine($, $._block_text_line_start),
    block_scalar_spaced_line: ($) => blockLine($, $._block_spaced_line_start),
    block_scalar_empty_line: ($) =>
      seq(
        $._block_empty_line_start,
        optional(field("prefix", $.scalar_line_prefix)),
        $.scalar_line_break,
        $._block_line_end,
      ),
    plain_scalar: ($) =>
      seq(
        $._plain_start,
        repeat1(choice(...scalarParts($), $._plain_continue)),
        $._plain_end,
      ),
    single_quoted_scalar: ($) =>
      quotedScalar($, $._single_start, $._single_open, [$.escaped_quote]),
    double_quoted_scalar: ($) =>
      quotedScalar($, $._double_start, $._double_open, [
        $.quoted_escape,
        $.line_continuation,
      ]),
    line_continuation: ($) =>
      prec.right(
        seq(
          $.escape_indicator,
          $.scalar_line_break,
          optional($.scalar_line_prefix),
        ),
      ),
    flow_sequence: ($) =>
      flowCollection(
        $._flow_sequence_start,
        $.flow_sequence_open,
        $._flow_sequence_entries,
        $.flow_sequence_close,
      ),
    _flow_sequence_entries: ($) => flowEntries($, $._flow_sequence_entry),
    _flow_sequence_entry: ($) =>
      choice(
        seq($._implicit_key_start, $._flow_node, $._flow_node_end),
        alias($._flow_sequence_pair, $.flow_mapping_pair),
      ),
    flow_mapping: ($) =>
      flowCollection(
        $._flow_mapping_start,
        $.flow_mapping_open,
        $._flow_mapping_entries,
        $.flow_mapping_close,
      ),
    _flow_mapping_entries: ($) => flowEntries($, $.flow_mapping_pair),
    flow_mapping_pair: ($) => seq($._flow_map_pair_start, $._flow_pair_body),
    _flow_sequence_pair: ($) =>
      choice(
        seq($._flow_seq_pair_start, choice(explicitFlowPair($), flowValue($))),
        seq($._implicit_key, flowValue($)),
      ),
    _implicit_key: ($) =>
      seq($._implicit_key_start, field("key", $._flow_node), $._key_end),
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
  },
});

function flowCollection(start, opening, entries, closing) {
  return seq(
    start,
    field("opening", opening),
    optional(entries),
    field("closing", closing),
  );
}

function flowEntries($, entry) {
  return seq(
    entry,
    repeat(seq($.flow_separator, entry)),
    optional($.flow_separator),
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
    optional(field("value", $._flow_node)),
  );
}

function blockSequence($, end) {
  return seq($._sequence_start, repeat1($.block_sequence_entry), end);
}

function contextNode($, content, properties) {
  return choice(content, $.alias, alias(properties, $.node_with_properties));
}

function nodeContent($, ...sameIndentCollections) {
  return choice(
    $._flow_content,
    $._indented_node,
    ...sameIndentCollections,
    $.literal_scalar,
    $.folded_scalar,
  );
}

function blockNode($, name, start, node) {
  return choice(seq(start, field(name, node)), $._empty_block_node);
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
    optional($.scalar_text),
    optional($.scalar_line_break),
    $._block_line_end,
  );
}

function blockProperties($, content) {
  return propertyNode(
    $,
    $._block_properties_end,
    seq($._block_property_content_start, field("content", content)),
  );
}

function propertyNode($, end, content) {
  return seq(
    $._property_list,
    choice($._empty_properties_end, seq(end, content)),
  );
}

function propertyList($) {
  const next = (rule) => seq($._property_continue, field("property", rule));
  return seq(
    $._properties_start,
    choice(
      seq(field("property", $.anchor), optional(next($._tag))),
      seq(field("property", $._tag), optional(next($.anchor))),
    ),
  );
}

function names($, name, end) {
  return seq(field("name", $[name]), end);
}

function uriPart($, text) {
  return choice(text, $.uri_escape);
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

function scalarParts($) {
  return [
    $.scalar_text,
    $.scalar_line_break,
    $.scalar_line_prefix,
    $.scalar_line_suffix,
  ];
}

function quotedScalar($, start, opening, escapes) {
  return seq(
    start,
    field("opening", alias(opening, $.quote_open)),
    repeat(choice(...scalarParts($), ...escapes)),
    field("closing", $.quote_close),
  );
}

function comment($) {
  return seq(
    $._comment_start,
    $.comment_marker,
    optional($.comment_text),
    $._comment_end,
  );
}

function linePrefix($) {
  return seq(
    $._line_prefix_start,
    repeat1(choice($.indentation, $.separation)),
    $._line_prefix_end,
  );
}
