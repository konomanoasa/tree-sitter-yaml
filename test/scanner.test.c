#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/scanner.c"

#ifdef TREE_SITTER_REUSE_ALLOCATOR
static unsigned live_allocations;
static size_t allocations_before_failure = SIZE_MAX;
static void *reuse_calloc(size_t count, size_t size) {
  if (!allocations_before_failure) return NULL;
  if (allocations_before_failure != SIZE_MAX) allocations_before_failure--;
  void *result = calloc(count, size);
  if (result) live_allocations++;
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
  if (input->position < input->length) input->position++;
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

static void test_creation_and_destruction_preserve_allocator_ownership(void) {
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
static void test_flow_stack_rejects_capacity_overflow(void) {
  const size_t capacity = SIZE_MAX / 2 + 1;
  FlowStack flows = {.capacity = capacity, .depth = capacity};
  flows.closings = flows.initial;
  assert(!push_flow(&flows, '['));
  assert(flows.closings == flows.initial);
  assert(flows.capacity == capacity && flows.depth == capacity);
}
#ifdef TREE_SITTER_REUSE_ALLOCATOR
static void test_failed_creation_allows_every_scanner_callback(void) {
  allocations_before_failure = 0;
  void *scanner = tree_sitter_yaml_external_scanner_create();
  assert(scanner == NULL);
  char bytes[] = "unchanged";
  assert(tree_sitter_yaml_external_scanner_serialize(scanner, bytes) == 0);
  assert(strcmp(bytes, "unchanged") == 0);
  tree_sitter_yaml_external_scanner_deserialize(scanner, NULL, 0);
  tree_sitter_yaml_external_scanner_deserialize(scanner, bytes, sizeof(bytes));
  Input value = input(NULL, 0);
  bool valid[ERROR_SENTINEL + 1] = {false};
  assert(!tree_sitter_yaml_external_scanner_scan(scanner, &value.lexer, valid));
  tree_sitter_yaml_external_scanner_destroy(scanner);
  assert(live_allocations == 0);
  allocations_before_failure = SIZE_MAX;
}
static void test_failed_flow_growth_preserves_existing_storage(void) {
  FlowStack flows = {.capacity = sizeof(flows.initial)};
  flows.closings = flows.initial;
  for (unsigned i = 0; i < 64; i++) assert(push_flow(&flows, '['));
  assert(live_allocations == 1);
  char *closings = flows.closings;
  allocations_before_failure = 0;
  assert(!push_flow(&flows, '{'));
  assert(flows.closings == closings);
  assert(flows.depth == 64 && flows.capacity == 64);
  for (unsigned i = 0; i < 64; i++) assert(flows.closings[i] == ']');
  ts_free(flows.closings);
  assert(live_allocations == 0);
  allocations_before_failure = SIZE_MAX;
}
static void
test_failed_key_lookahead_releases_storage_and_preserves_state(void) {
  enum { NESTING_DEPTH = 96 };
  int32_t source[NESTING_DEPTH * 2];
  for (unsigned i = 0; i < NESTING_DEPTH; i++) {
    source[i] = '[';
    source[NESTING_DEPTH + i] = ']';
  }
  Scanner scanner = {.indent = 0, .line = true, .line_context = true};
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[MAPPING_START] = true;
  valid[FLOW_SEQUENCE_START] = true;
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&scanner, before);
  for (size_t allowed = 0; allowed < 2; allowed++) {
    allocations_before_failure = allowed;
    Input value = input(source, NESTING_DEPTH * 2);
    assert(
      !tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
    );
    assert(live_allocations == 0);
    assert(
      size == tree_sitter_yaml_external_scanner_serialize(&scanner, after)
    );
    assert(memcmp(before, after, size) == 0);
  }
  allocations_before_failure = SIZE_MAX;
  Input value = input(source, NESTING_DEPTH * 2);
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == FLOW_SEQUENCE_START && value.marked == 0);
  assert(live_allocations == 0);
}
#endif
static void test_restored_dedent_matches_original_at_large_depth(void) {
  enum { INITIAL_INDENT = 100000 };
  Scanner original = {.indent = INITIAL_INDENT, .mode = NORMAL, .line = true};
  char bytes[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&original, bytes);
  assert(size <= sizeof(bytes));
  Scanner restored = {0};
  tree_sitter_yaml_external_scanner_deserialize(&restored, bytes, size);
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[DEDENT] = true;
  for (unsigned i = 0; i <= INITIAL_INDENT; i++) {
    Input a = input(NULL, 0), b = input(NULL, 0);
    assert(tree_sitter_yaml_external_scanner_scan(&original, &a.lexer, valid));
    assert(tree_sitter_yaml_external_scanner_scan(&restored, &b.lexer, valid));
    assert(a.lexer.result_symbol == DEDENT && b.lexer.result_symbol == DEDENT);
    assert(original.indent == restored.indent);
  }
  assert(original.indent == -1);
}
static void test_failed_scan_preserves_serialized_state(void) {
  Scanner scanner =
    {.indent = 2, .mode = DOUBLE, .flow = 1, .implicit_keys = {5}};
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&scanner, before);
  bool valid[ERROR_SENTINEL + 1] = {false};
  const int32_t source[] = {'"'};
  Input value = input(source, sizeof(source) / sizeof(source[0]));
  assert(
    !tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
  );
  assert(size == tree_sitter_yaml_external_scanner_serialize(&scanner, after));
  assert(memcmp(before, after, size) == 0);
}
static void
test_error_recovery_refuses_all_tokens_without_changing_state(void) {
  Scanner scanner;
  reset_scanner(&scanner);
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size = tree_sitter_yaml_external_scanner_serialize(&scanner, before);
  bool valid[ERROR_SENTINEL + 1];
  for (unsigned i = 0; i < COUNT(valid); i++) valid[i] = true;
  const int32_t source[] = {'[', 'a', ']'};
  Input value = input(source, COUNT(source));
  assert(
    !tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
  );
  assert(value.position == 0 && value.marked == 0);
  assert(size == tree_sitter_yaml_external_scanner_serialize(&scanner, after));
  assert(memcmp(before, after, size) == 0);
}
static void test_lookahead_does_not_extend_missing_issue_range(void) {
  Scanner scanner = {.indent = 0, .mode = PLAIN};
  const int32_t source[] = {' ', ' ', '#', 'x'};
  Input value = input(source, sizeof(source) / sizeof(source[0]));
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[PLAIN_END] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.marked == 0);
  assert(scanner.mode == NORMAL);
}
static void test_flow_entry_start_does_not_scan_collection_body(void) {
  Scanner scanner = {.indent = -1, .flow = 1};
  const int32_t source[] = {'[', '[', 'x', ']', ']', ':', ' ', 'v'};
  Input value = input(source, sizeof(source) / sizeof(source[0]));
  bool valid[ERROR_SENTINEL + 1] = {false};
  valid[IMPLICIT_KEY_START] = true;
  valid[FLOW_SEQ_PAIR_START] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == IMPLICIT_KEY_START);
  assert(value.position == 1 && value.marked == 0);
  value = input(source, sizeof(source) / sizeof(source[0]));
  memset(valid, 0, sizeof(valid));
  valid[FLOW_SEQUENCE_START] = true;
  assert(tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid));
  assert(value.lexer.result_symbol == FLOW_SEQUENCE_START);
  assert(value.position == 1 && value.marked == 0);
}
static void
test_block_key_lookahead_survives_indentation_and_restoration(void) {
  Scanner scanner = {
    .indent = -1,
    .column = 3,
    .line = true,
    .line_context = true,
    .line_indent = 3
  };
  const int32_t source[] = {'[', 'a', '"', 'b', ']', ':', ' ', 'v'};
  Input value = input(source, sizeof(source) / sizeof(source[0]));
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
  value = input(source, sizeof(source) / sizeof(source[0]));
  assert(
    tree_sitter_yaml_external_scanner_scan(&restored, &value.lexer, valid)
  );
  assert(value.lexer.result_symbol == INDENT && value.marked == 0);
  assert(value.position == 1 && restored.block_kind == MAPPING_START + 1);

  const int32_t colon[] = {':', ' ', 'v'};
  value = input(colon, sizeof(colon) / sizeof(colon[0]));
  memset(valid, 0, sizeof(valid));
  valid[VALUE_INDICATOR] = true;
  assert(
    tree_sitter_yaml_external_scanner_scan(&restored, &value.lexer, valid)
  );
  assert(value.lexer.result_symbol == VALUE_INDICATOR && value.marked == 1);
  assert(restored.block_kind == 0);
}
static void test_deep_mismatched_key_lookahead_releases_its_storage(void) {
  enum { NESTING_DEPTH = 96 };
  const struct {
    int32_t inner[2];
    bool has_value;
    enum Token expected;
  } cases[] = {
    {{'{', 'a'}, true, MAPPING_START},
    {{'{', 'a'}, false, FLOW_SEQUENCE_START},
    {{'a', '}'}, true, FLOW_SEQUENCE_START},
  };
  const int32_t suffix[] = {':', ' ', 'v'};
  enum {
    INNER_LENGTH = sizeof(cases[0].inner) / sizeof(cases[0].inner[0]),
    SUFFIX_LENGTH = sizeof(suffix) / sizeof(suffix[0]),
    KEY_LENGTH = NESTING_DEPTH * 2 + INNER_LENGTH,
  };
  int32_t source[KEY_LENGTH + SUFFIX_LENGTH];
  for (unsigned i = 0; i < NESTING_DEPTH; i++) {
    source[i] = '[';
    source[NESTING_DEPTH + INNER_LENGTH + i] = ']';
  }
  memcpy(source + KEY_LENGTH, suffix, sizeof(suffix));
  for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    Scanner scanner = {.indent = 0, .line = true, .line_context = true};
    memcpy(source + NESTING_DEPTH, cases[i].inner, sizeof(cases[i].inner));
    Input value =
      input(source, KEY_LENGTH + (cases[i].has_value ? SUFFIX_LENGTH : 0));
    bool valid[ERROR_SENTINEL + 1] = {false};
    valid[MAPPING_START] = true;
    valid[FLOW_SEQUENCE_START] = true;
    assert(
      tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
    );
    assert(value.lexer.result_symbol == cases[i].expected);
    assert(value.marked == 0);
#ifdef TREE_SITTER_REUSE_ALLOCATOR
    assert(live_allocations == 0);
#endif
  }
}

static void test_all_state_bytes_survive_restoration(void) {
  enum { FULL_STATE_BYTES = 224, EMPTY_STATE_BYTES = 95 };
  Scanner original = {
    .indent = 0x100000,
    .flow = 0x10001,
    .column = 0x1020304,
    .mode = DIRECTIVE_PREFIX,
    .line = true,
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
    .key_state = BLOCK_KEY_ENDED,
    .first_pair = true,
    .block_indent = 0x6070809,
    .block_explicit_indent = true,
    .header_separated = true,
    .return_mode = BLOCK_HEADER,
    .block_leading = true,
    .block_empty = true,
    .block_prefix = true,
    .block_layout_lines = 0x708090a,
    .block_marker_eof = true,
    .boundary = DOCUMENT_END_LINE,
    .boundary_checked = true,
    .document_started = true,
    .document_start_line = true,
    .document_content = true,
    .after_document_end = true,
    .block_out = true,
    .handle_form = NAMED_HANDLE,
    .properties_ready = true,
    .property_separation_notified = true,
    .property_keys = ANCHOR_KEY | TAG_KEY,
    .boundary_pending = DOCUMENT_START_LINE,
    .prefix_eof = PREFIX_INDENTATION | PREFIX_TAB,
    .provisional_indent = 4,
    .directive_kind = TAG_DIRECTIVE,
    .directive_handle = true,
    .value_separation = true,
    .scalar_spaces = 0x4050607,
    .scalar_tab = true,
    .explicit_document_required = true,
    .eof_continuation = true,
    .block_eof = true,
    .block_kind = MAPPING_START + 1,
  };
  const unsigned key_words =
    sizeof(original.implicit_keys) / sizeof(original.implicit_keys[0]);
  for (unsigned i = 0; i < key_words - 1; i++)
    original.implicit_keys[i] = UINT64_C(0x1020304050607080) + i;
  original.implicit_keys[key_words - 1] = 1;
  char before[TREE_SITTER_SERIALIZATION_BUFFER_SIZE],
    after[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned size =
    tree_sitter_yaml_external_scanner_serialize(&original, before);
  assert(size == FULL_STATE_BYTES && size <= sizeof(before));
  Scanner restored = {0};
  tree_sitter_yaml_external_scanner_deserialize(&restored, before, size);
  assert(size == tree_sitter_yaml_external_scanner_serialize(&restored, after));
  assert(memcmp(before, after, size) == 0);
  assert(
    restored.indent == original.indent &&
    restored.block_indent == original.block_indent
  );
  assert(restored.flow == original.flow && restored.column == original.column);
  assert(
    restored.line_indent == original.line_indent &&
    restored.line_head == original.line_head
  );
  assert(
    restored.directive_kind == original.directive_kind &&
    restored.directive_handle
  );
  assert(
    restored.value_separation &&
    restored.scalar_spaces == original.scalar_spaces
  );
  assert(restored.scalar_tab && restored.explicit_document_required);
  assert(restored.quote_line_empty);
  assert(restored.block_kind == MAPPING_START + 1);
  assert(restored.eof_continuation && restored.block_eof);
  assert(restored.property_keys == (ANCHOR_KEY | TAG_KEY));
  assert(restored.boundary_pending == DOCUMENT_START_LINE);
  assert(restored.prefix_eof == (PREFIX_INDENTATION | PREFIX_TAB));
  assert(restored.provisional_indent == original.provisional_indent);
  assert(restored.block_layout_lines == original.block_layout_lines);
  assert(restored.block_marker_eof && restored.first_pair);
  assert(restored.document_start_line);
  assert(restored.key_state == BLOCK_KEY_ENDED);
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
  assert(!restored.properties_ready && !restored.directive_handle);
  assert(!restored.quote_line_empty);
  assert(restored.block_layout_lines == 0 && !restored.block_marker_eof);
  assert(!restored.eof_continuation && !restored.block_eof);
  assert(!restored.property_keys);
  assert(!restored.boundary_pending && !restored.prefix_eof);
  assert(restored.provisional_indent == -2);
  assert(!restored.first_pair);
  assert(!restored.document_start_line);
  assert(restored.key_state == KEY_NONE);
  assert(
    tree_sitter_yaml_external_scanner_serialize(&restored, after) ==
    EMPTY_STATE_BYTES
  );
}

static void test_unicode_escape_boundaries_preserve_tokens_and_ranges(void) {
  enum { MAX_ESCAPE_CHARACTERS = 10 };
  const struct {
    const char *source;
    enum Token token;
    unsigned end;
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
    int32_t source[MAX_ESCAPE_CHARACTERS];
    const size_t length = strlen(cases[i].source);
    assert(length <= MAX_ESCAPE_CHARACTERS);
    for (size_t j = 0; j < length; j++) source[j] = cases[i].source[j];
    Input value = input(source, (uint32_t)length);
    assert(
      tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
    );
    assert(value.lexer.result_symbol == cases[i].token);
    assert(value.marked == cases[i].end);
  }
}

static void test_scalar_endings_converge_after_different_indentation(void) {
  const struct {
    enum Mode mode;
    enum Token token;
    bool boundary;
  } cases[] = {
    {PLAIN, PLAIN_END, false},
    {SINGLE, INCOMPLETE_QUOTE_CLOSE, false},
    {DOUBLE, INCOMPLETE_QUOTE_CLOSE, false},
    {BLOCK_BODY, BLOCK_SCALAR_END, false},
    {SINGLE, MISSING_QUOTE_CLOSE, true},
    {DOUBLE, MISSING_QUOTE_CLOSE, true},
    {BLOCK_BODY, BLOCK_SCALAR_END, true},
  };
  const struct {
    unsigned indentation;
    unsigned layout_lines;
    bool layout_flags;
  } histories[] = {{2, 1, false}, {3, 2, true}};
  enum { HISTORY_COUNT = sizeof(histories) / sizeof(histories[0]) };
  for (unsigned i = 0; i < sizeof(cases) / sizeof(*cases); i++) {
    char bytes[HISTORY_COUNT][TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
    unsigned sizes[HISTORY_COUNT];
    for (unsigned history = 0; history < HISTORY_COUNT; history++) {
      Scanner scanner = {
        .mode = cases[i].mode,
        .indent = 0,
        .scalar_spaces = histories[history].indentation,
        .scalar_tab = histories[history].layout_flags,
        .quote_line_empty = histories[history].layout_flags,
        .block_indent = histories[history].indentation,
        .block_explicit_indent = histories[history].layout_flags,
        .header_separated = histories[history].layout_flags,
        .block_leading = histories[history].layout_flags,
        .block_empty = histories[history].layout_flags,
        .block_layout_lines = histories[history].layout_lines,
        .block_marker_eof = histories[history].layout_flags,
        .boundary = cases[i].boundary ? DOCUMENT_START_LINE : NO_BOUNDARY,
        .boundary_checked = true,
        .eof_continuation = true,
      };
      const int32_t marker[] = {'-', '-', '-', '\n'};
      Input value = input(
        marker,
        cases[i].boundary ? sizeof(marker) / sizeof(marker[0]) : 0
      );
      bool valid[ERROR_SENTINEL + 1] = {false};
      valid[cases[i].token] = true;
      assert(
        tree_sitter_yaml_external_scanner_scan(&scanner, &value.lexer, valid)
      );
      assert(value.lexer.result_symbol == cases[i].token && value.marked == 0);
      assert(scanner.eof_continuation);
      sizes[history] =
        tree_sitter_yaml_external_scanner_serialize(&scanner, bytes[history]);
    }
    assert(sizes[0] == sizes[1]);
    assert(memcmp(bytes[0], bytes[1], sizes[0]) == 0);
  }
}

int main(void) {
  test_creation_and_destruction_preserve_allocator_ownership();
  test_flow_stack_rejects_capacity_overflow();
#ifdef TREE_SITTER_REUSE_ALLOCATOR
  test_failed_creation_allows_every_scanner_callback();
  test_failed_flow_growth_preserves_existing_storage();
  test_failed_key_lookahead_releases_storage_and_preserves_state();
#endif
  test_restored_dedent_matches_original_at_large_depth();
  test_failed_scan_preserves_serialized_state();
  test_error_recovery_refuses_all_tokens_without_changing_state();
  test_lookahead_does_not_extend_missing_issue_range();
  test_flow_entry_start_does_not_scan_collection_body();
  test_block_key_lookahead_survives_indentation_and_restoration();
  test_deep_mismatched_key_lookahead_releases_its_storage();
  test_all_state_bytes_survive_restoration();
  test_unicode_escape_boundaries_preserve_tokens_and_ranges();
  test_scalar_endings_converge_after_different_indentation();
  puts("scanner state, progress, and ranges passed");
  return 0;
}
