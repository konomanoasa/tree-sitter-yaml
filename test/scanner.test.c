#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/scanner.c"

#ifdef TREE_SITTER_REUSE_ALLOCATOR
static unsigned live_allocations;
static void *reuse_calloc(size_t count, size_t size) {
  void *result = calloc(count, size);
  if (result)
    live_allocations++;
  return result;
}
static void reuse_free(void *allocation) {
  if (allocation) {
    assert(live_allocations > 0);
    live_allocations--;
  }
  free(allocation);
}
void *(*ts_current_calloc)(size_t, size_t) = reuse_calloc;
void (*ts_current_free)(void *) = reuse_free;
#endif

typedef struct {
  TSLexer lexer;
  const int32_t *input;
  uint32_t length, position, marked;
} Input;

static void advance(TSLexer *lexer, bool skip) {
  (void)skip;
  Input *input = (Input *)lexer;
  if (input->position < input->length)
    input->position++;
  lexer->lookahead =
    input->position < input->length ? input->input[input->position] : 0;
}
static void mark_end(TSLexer *lexer) {
  ((Input *)lexer)->marked = ((Input *)lexer)->position;
}
static uint32_t column(TSLexer *lexer) {
  return ((Input *)lexer)->position;
}
static bool at_end(const TSLexer *lexer) {
  return ((const Input *)lexer)->position == ((const Input *)lexer)->length;
}
static Input input(const int32_t *source, uint32_t length) {
  Input result = {0};
  result.input = source;
  result.length = length;
  result.lexer.advance = advance;
  result.lexer.mark_end = mark_end;
  result.lexer.get_column = column;
  result.lexer.eof = at_end;
  result.lexer.lookahead = length ? source[0] : 0;
  return result;
}

static void creation_and_destruction_preserve_allocator_ownership(void) {
  Scanner *scanner = tree_sitter_yaml_external_scanner_create();
  assert(scanner != NULL);
  assert(scanner->indent == -1 && scanner->block_indent == -1);
  assert(scanner->mode == NORMAL && scanner->line && scanner->separated);
#ifdef TREE_SITTER_REUSE_ALLOCATOR
  assert(live_allocations == 1);
#endif
  tree_sitter_yaml_external_scanner_destroy(scanner);
#ifdef TREE_SITTER_REUSE_ALLOCATOR
  assert(live_allocations == 0);
#endif
}
static void restored_dedent_matches_original_at_large_depth(void) {
  Scanner original = {.indent = 100000, .mode = NORMAL, .line = true};
  char bytes[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&original, bytes);
  assert(size <= sizeof(bytes));
  Scanner restored = {0};
  tree_sitter_yaml_external_scanner_deserialize(&restored, bytes, size);
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[DEDENT] = true;
  for (unsigned i = 0; i < 100001; i++) {
    Input a = input(NULL, 0), b = input(NULL, 0);
    assert(tree_sitter_yaml_external_scanner_scan(&original, &a.lexer, valid));
    assert(tree_sitter_yaml_external_scanner_scan(&restored, &b.lexer, valid));
    assert(a.lexer.result_symbol == DEDENT && b.lexer.result_symbol == DEDENT);
    assert(original.indent == restored.indent);
  }
  assert(original.indent == -1);
}
static void failed_scan_preserves_serialized_state(void) {
  Scanner scanner =
    {.indent = 2, .mode = DOUBLE, .flow = 1, .implicit_keys = {5}};
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&scanner, before);
  bool valid[ERROR_SENTINEL + 1] = {false};
  const int32_t source[] = {'"'};
  Input value = input(source, 1);
  assert(
    !tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
  );
  assert(size == tree_sitter_yaml_external_scanner_serialize(&scanner, after));
  assert(memcmp(before, after, size) == 0);
}
static void lookahead_does_not_extend_missing_issue_range(void) {
  Scanner scanner = {.indent = 0, .mode = PLAIN};
  const int32_t source[] = {' ', ' ', '#', 'x'};
  Input value = input(source, 4);
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[PLAIN_END] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.marked == 0);
  assert(scanner.mode == NORMAL);
}
static void flow_entry_start_does_not_scan_collection_body(void) {
  Scanner scanner = {.indent = -1, .flow = 1};
  const int32_t source[] = {'[', '[', 'x', ']', ']', ':', ' ', 'v'};
  Input value = input(source, 8);
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[IMPLICIT_KEY_START] = true;
  valid[FLOW_SEQ_PAIR_START] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == IMPLICIT_KEY_START);
  assert(value.position == 1 && value.marked == 0);
  value = input(source, 8);
  memset(valid, 0, sizeof(valid));
  valid[FLOW_SEQUENCE_START] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == FLOW_SEQUENCE_START);
  assert(value.position == 1 && value.marked == 0);
}
static void block_key_lookahead_survives_indentation_and_restoration(void) {
  Scanner scanner = {
    .indent = -1,
    .column = 3,
    .line = true,
    .line_context = true,
    .line_indent = 3
  };
  const int32_t source[] = {'[', 'a', '"', 'b', ']', ':', ' ', 'v'};
  Input value = input(source, 8);
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[INDENT] = true;
  valid[MAPPING_START] = true;
  valid[FLOW_SEQUENCE_START] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == INDENT && value.marked == 0);
  assert(value.position == 7 && scanner.block_kind == MAPPING_START + 1);

  char bytes[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&scanner, bytes);
  Scanner restored = {0};
  tree_sitter_yaml_external_scanner_deserialize(&restored, bytes, size);
  value = input(source, 8);
  assert(
    tree_sitter_yaml_external_scanner_scan(&restored, &value.lexer, valid)
  );
  assert(value.lexer.result_symbol == INDENT && value.marked == 0);
  assert(value.position == 1 && restored.block_kind == MAPPING_START + 1);

  const int32_t colon[] = {':', ' ', 'v'};
  value = input(colon, 3);
  memset(valid, 0, sizeof(valid));
  valid[VALUE_INDICATOR] = true;
  assert(
    tree_sitter_yaml_external_scanner_scan(&restored, &value.lexer, valid)
  );
  assert(value.lexer.result_symbol == VALUE_INDICATOR && value.marked == 1);
  assert(restored.block_kind == 0);
}
static void deep_mismatched_key_lookahead_releases_its_storage(void) {
  enum { depth = 96 };
  int32_t source[depth * 2 + 5];
  for (unsigned i = 0; i < depth; i++) {
    source[i] = '[';
    source[depth + 2 + i] = ']';
  }
  source[depth] = '{';
  source[depth + 1] = 'a';
  source[depth * 2 + 2] = ':';
  source[depth * 2 + 3] = ' ';
  source[depth * 2 + 4] = 'v';
  for (unsigned i = 0; i < 3; i++) {
    Scanner scanner = {.indent = 0, .line = true, .line_context = true};
    if (i == 2) {
      source[depth] = 'a';
      source[depth + 1] = '}';
    }
    Input value = input(source, depth * 2 + (i == 1 ? 2 : 5));
    bool valid[ERROR_SENTINEL + 1] = {false};
    valid[MAPPING_START] = true;
    valid[FLOW_SEQUENCE_START] = true;
    assert(
      tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
    );
    assert(
      value.lexer.result_symbol ==
      (i == 0 ? MAPPING_START : FLOW_SEQUENCE_START)
    );
    assert(value.marked == 0);
#ifdef TREE_SITTER_REUSE_ALLOCATOR
    assert(live_allocations == 0);
#endif
  }
}
static void all_state_bytes_survive_restoration(void) {
  Scanner original = {
    .indent = 1048576,
    .flow = 65537,
    .column = 0x1020304,
    .mode = DIRECTIVE_PREFIX,
    .line = true,
    .document = true,
    .prefix = true,
    .first = true,
    .json = true,
    .continuation = true,
    .quote_line_empty = true,
    .line_indent = 0x3040506,
    .tab_invalid = true,
    .prefix_tab = true,
    .indent_checked = true,
    .line_prefixed = true,
    .scalar_indent = true,
    .line_head = -1,
    .line_context = true,
    .layout_only = true,
    .line_mapping_key = true,
    .prefix_invalid = true,
    .separated = true,
    .key_done = true,
    .block_indent = 0x6070809,
    .header_flags = 7,
    .return_mode = BLOCK_HEADER,
    .block_leading = true,
    .block_empty = true,
    .block_prefix = true,
    .block_layout_lines = 0x708090a,
    .boundary = 2,
    .boundary_checked = true,
    .document_started = true,
    .document_content = true,
    .after_document_end = true,
    .block_out = true,
    .property_flags = 3,
    .handle_form = 3,
    .properties_ready = true,
    .duplicate_pending = true,
    .property_separation_notified = true,
    .directive_kind = 2,
    .directive_handle = true,
    .value_separation = true,
    .scalar_spaces = 0x4050607,
    .scalar_tab = true,
    .explicit_document_required = true,
    .block_kind = MAPPING_START + 1,
  };
  for (unsigned i = 0; i < 16; i++)
    original.implicit_keys[i] = UINT64_C(0x1020304050607080) + i;
  original.implicit_keys[16] = 1;
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size =
    tree_sitter_yaml_external_scanner_serialize(&original, before);
  assert(size == 210 && size <= sizeof(before));
  Scanner restored = {0};
  tree_sitter_yaml_external_scanner_deserialize(&restored, before, size);
  assert(size == tree_sitter_yaml_external_scanner_serialize(&restored, after));
  assert(memcmp(before, after, size) == 0);
  assert(
    restored.indent ==
    original.indent &&
    restored.block_indent == original.block_indent
  );
  assert(restored.flow == original.flow && restored.column == original.column);
  assert(
    restored.line_indent ==
    original.line_indent &&
    restored.line_head == original.line_head
  );
  assert(restored.directive_kind == 2 && restored.directive_handle);
  assert(restored.value_separation && restored.scalar_spaces == 0x4050607);
  assert(restored.scalar_tab && restored.explicit_document_required);
  assert(restored.quote_line_empty);
  assert(restored.block_kind == MAPPING_START + 1);
  assert(restored.block_layout_lines == original.block_layout_lines);
  assert(
    memcmp(
      original.implicit_keys,
      restored.implicit_keys,
      sizeof(original.implicit_keys)
    ) == 0
  );
  tree_sitter_yaml_external_scanner_deserialize(&restored, NULL, 0);
  assert(restored.indent == -1 && restored.block_indent == -1);
  assert(restored.mode == NORMAL && restored.line && restored.separated);
  assert(
    !restored.document &&
    !restored.properties_ready &&
    !restored.directive_handle
  );
  assert(!restored.quote_line_empty);
  assert(restored.block_layout_lines == 0);
  assert(tree_sitter_yaml_external_scanner_serialize(&restored, after) == 81);
}

static void unicode_escape_boundaries_preserve_tokens_and_ranges(void) {
  const struct {
    const char *source;
    enum Token token;
    unsigned length;
  } cases[] = {
    {"\\U", INCOMPLETE_ESCAPE, 2},
    {"\\U00000000", QUOTED_ESCAPE, 10},
    {"\\U0010FFFF", QUOTED_ESCAPE, 10},
    {"\\UFFFFFFFF", INVALID_ESCAPE, 10},
    {"\\U1", INVALID_ESCAPE, 3},
    {"\\uD", INCOMPLETE_ESCAPE, 3},
    {"\\uD8", INVALID_ESCAPE, 4},
    {"\\uD800", INVALID_ESCAPE, 6},
  };
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[QUOTED_ESCAPE] = true;
  valid[INVALID_ESCAPE] = true;
  valid[INCOMPLETE_ESCAPE] = true;
  for (unsigned i = 0; i < sizeof(cases) / sizeof(*cases); i++) {
    Scanner scanner = {.indent = -1, .mode = DOUBLE};
    int32_t source[10];
    for (unsigned j = 0; j < cases[i].length; j++)
      source[j] = cases[i].source[j];
    Input value = input(source, cases[i].length);
    assert(
      tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
    );
    assert(value.lexer.result_symbol == cases[i].token);
    assert(value.marked == cases[i].length);
  }
}

int main(void) {
  creation_and_destruction_preserve_allocator_ownership();
  restored_dedent_matches_original_at_large_depth();
  failed_scan_preserves_serialized_state();
  lookahead_does_not_extend_missing_issue_range();
  flow_entry_start_does_not_scan_collection_body();
  block_key_lookahead_survives_indentation_and_restoration();
  deep_mismatched_key_lookahead_releases_its_storage();
  all_state_bytes_survive_restoration();
  unicode_escape_boundaries_preserve_tokens_and_ranges();
  puts("scanner state, progress, and ranges passed");
  return 0;
}
