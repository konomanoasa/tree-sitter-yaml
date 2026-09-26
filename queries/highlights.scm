[
  (comment_marker)
  (comment_text)
] @comment

[
  (scalar_text)
  (quote_open)
  (quote_close)
  (directive_parameter)
] @string

[
  (quoted_escape)
  (escaped_quote)
  (escape_indicator)
  (uri_escape)
] @string.escape

[
  (anchor_name)
  (alias_name)
] @label

[
  (tag_handle_name)
  (tag_suffix_text)
  (uri_text)
] @type

[
  (directive_indicator)
  (directive_name)
] @keyword.directive

[
  (yaml_version)
  (indentation_indicator)
] @number

[
  (flow_sequence_open)
  (flow_sequence_close)
  (flow_mapping_open)
  (flow_mapping_close)
] @punctuation.bracket

[
  (sequence_indicator)
  (key_indicator)
  (value_indicator)
  (flow_separator)
  (anchor_indicator)
  (alias_indicator)
  (primary_tag_handle)
  (secondary_tag_handle)
  (tag_handle_open)
  (tag_handle_close)
  (verbatim_tag_open)
  (verbatim_tag_close)
  (non_specific_tag)
] @punctuation.delimiter

[
  (document_start)
  (document_end)
  (literal_indicator)
  (folded_indicator)
  (chomping_indicator)
] @punctuation.special

(_
  key: [
    (plain_scalar
      (scalar_text) @property)
    (single_quoted_scalar
      (scalar_text) @property)
    (double_quoted_scalar
      (scalar_text) @property)
    (node_with_properties
      content: [
        (plain_scalar
          (scalar_text) @property)
        (single_quoted_scalar
          (scalar_text) @property)
        (double_quoted_scalar
          (scalar_text) @property)
      ])
  ])
