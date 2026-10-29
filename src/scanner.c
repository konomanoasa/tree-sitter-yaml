#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#define COUNT(array) (sizeof(array) / sizeof(*(array)))

enum Token {
  LINE_BREAK,
  END_OF_FILE,
  DOCUMENT_OPEN,
  DOCUMENT_CLOSE,
  DOCUMENT_START,
  DOCUMENT_END,
  BYTE_ORDER_MARK,
  INDENT,
  DEDENT,
  MAPPING_START,
  MAPPING_END,
  PAIR_START,
  SEQUENCE_START,
  SEQUENCE_END,
  SEQUENCE_IN_MAPPING_END,
  ENTRY_START,
  BLOCK_OUT_VALUE_START,
  BLOCK_IN_VALUE_START,
  BLOCK_OUT_IMPLICIT_VALUE_START,
  EMPTY_BLOCK_NODE,
  EXPLICIT_VALUE_START,
  SEQUENCE_INDICATOR,
  VALUE_INDICATOR,
  KEY_INDICATOR,
  SINGLE_START,
  DOUBLE_START,
  FLOW_SEQUENCE_START,
  FLOW_MAPPING_START,
  FLOW_MAP_PAIR_START,
  FLOW_SEQ_PAIR_START,
  IMPLICIT_KEY_START,
  KEY_END,
  FLOW_NODE_END,
  PLAIN_START,
  PLAIN_END,
  PLAIN_CONTINUE,
  SCALAR_TEXT,
  SINGLE_OPEN,
  DOUBLE_OPEN,
  QUOTE_CLOSE,
  QUOTED_ESCAPE,
  ESCAPED_QUOTE,
  SCALAR_LINE_BREAK,
  SCALAR_LINE_PREFIX,
  SCALAR_LINE_SUFFIX,
  ESCAPE_INDICATOR,
  FLOW_SEQUENCE_OPEN,
  FLOW_SEQUENCE_CLOSE,
  FLOW_MAPPING_OPEN,
  FLOW_MAPPING_CLOSE,
  FLOW_SEPARATOR,
  COMMENT_START,
  COMMENT_MARKER,
  COMMENT_TEXT,
  COMMENT_END,
  LINE_PREFIX_START,
  LINE_PREFIX_END,
  INDENTATION,
  SEPARATION,
  LINE_CONTEXT,
  LITERAL_START,
  FOLDED_START,
  LITERAL_INDICATOR,
  FOLDED_INDICATOR,
  INDENTATION_INDICATOR,
  CHOMPING_INDICATOR,
  BLOCK_HEADER_BREAK,
  BLOCK_HEADER_END,
  BLOCK_BODY_START,
  BLOCK_SCALAR_END,
  BLOCK_TEXT_LINE_START,
  BLOCK_SPACED_LINE_START,
  BLOCK_EMPTY_LINE_START,
  BLOCK_LINE_END,
  BOUNDARY_CHECK,
  PROPERTIES_START,
  PROPERTIES_END,
  BLOCK_PROPERTIES_END,
  EMPTY_PROPERTIES_END,
  PROPERTY_CONTINUE,
  PROPERTY_CONTENT_START,
  BLOCK_PROPERTY_CONTENT_START,
  ANCHOR_INDICATOR,
  ALIAS_START,
  ALIAS_INDICATOR,
  ANCHOR_NAME,
  ALIAS_NAME,
  NAME_END,
  VERBATIM_TAG_START,
  VERBATIM_TAG_OPEN,
  VERBATIM_TAG_CLOSE,
  SHORTHAND_TAG_START,
  NON_SPECIFIC_TAG,
  TAG_HANDLE_START,
  PRIMARY_TAG_HANDLE,
  SECONDARY_TAG_HANDLE,
  TAG_HANDLE_OPEN,
  TAG_HANDLE_NAME,
  TAG_HANDLE_CLOSE,
  TAG_SUFFIX_START,
  TAG_END,
  TAG_URI_START,
  TAG_URI_END,
  URI_TEXT,
  TAG_SUFFIX_TEXT,
  URI_ESCAPE,
  YAML_DIRECTIVE_START,
  TAG_DIRECTIVE_START,
  RESERVED_DIRECTIVE_START,
  DIRECTIVE_INDICATOR,
  DIRECTIVE_NAME,
  DIRECTIVE_NAME_END,
  DIRECTIVE_END,
  YAML_VERSION_START,
  YAML_VERSION_TEXT,
  TAG_PREFIX_START,
  TAG_PREFIX_END,
  DIRECTIVE_PARAMETER_START,
  DIRECTIVE_PARAMETER_TEXT,
  DIRECTIVE_WORD_END,
  ERROR_SENTINEL
};

enum Mode {
  NORMAL,
  PLAIN,
  SINGLE,
  DOUBLE,
  COMMENT,
  PREFIX,
  COMPACT_PREFIX,
  COMMENT_BEGIN,
  BLOCK_HEADER,
  BLOCK_HEADER_DONE,
  BLOCK_DETECT,
  BLOCK_BODY,
  BLOCK_LINE,
  BLOCK_LINE_DONE,
  ANCHOR_BODY,
  ALIAS_BODY,
  HANDLE_SELECT,
  HANDLE_BODY,
  SUFFIX_BEGIN,
  SUFFIX_BODY,
  URI_BEGIN,
  URI_BODY,
  VERBATIM_CLOSE,
  PREFIX_BODY,
  DIRECTIVE_NAME_BODY,
  DIRECTIVE_VERSION,
  VERSION_BODY,
  DIRECTIVE_HANDLE,
  DIRECTIVE_PREFIX,
  DIRECTIVE_PARAMETERS,
  PARAMETER_BODY
};
enum HandleForm { PRIMARY_HANDLE = 1, SECONDARY_HANDLE, NAMED_HANDLE };
enum KeyState { KEY_NONE, KEY_ENDED };
enum DirectiveKind { YAML_DIRECTIVE = 1, TAG_DIRECTIVE, RESERVED_DIRECTIVE };
enum Boundary {
  NO_BOUNDARY,
  DOCUMENT_START_LINE,
  DOCUMENT_END_LINE,
  DIRECTIVE_LINE,
  STREAM_BOM
};
#define SCANNER_FLAGS(F) \
  F(line) \
  F(prefix) \
  F(first) \
  F(json) \
  F(continuation) \
  F(quote_line_empty) \
  F(tab_invalid) \
  F(prefix_tab) \
  F(indent_checked) \
  F(line_prefixed) \
  F(scalar_indent) \
  F(line_context) \
  F(layout_only) \
  F(prefix_invalid) \
  F(separated) \
  F(block_explicit_indent) \
  F(header_separated) \
  F(block_leading) \
  F(block_empty) \
  F(block_prefix) \
  F(boundary_checked) \
  F(document_started) \
  F(document_start_line) \
  F(after_document_end) \
  F(block_out) \
  F(properties_ready) \
  F(directive_handle) \
  F(scalar_tab) \
  F(explicit_document_required)
#define SCANNER_FIELDS(F) \
  F(int64_t, indent, 8, 1) \
  F(uint32_t, flow, 4, 0) \
  F(uint8_t, mode, 1, 0) \
  F(uint32_t, column, 4, 0) \
  F(uint32_t, line_indent, 4, 0) \
  F(int32_t, line_head, 4, 0) \
  F(uint8_t, key_state, 1, 0) \
  F(int64_t, block_indent, 8, 1) \
  F(uint8_t, return_mode, 1, 0) \
  F(uint32_t, block_layout_lines, 4, 0) \
  F(uint8_t, boundary, 1, 0) \
  F(uint8_t, handle_form, 1, 0) \
  F(uint8_t, directive_kind, 1, 0) \
  F(uint32_t, scalar_spaces, 4, 0) \
  F(uint8_t, block_kind, 1, 0)

#define FLAG_INDEX(name) FLAG_##name,
enum { SCANNER_FLAGS(FLAG_INDEX) SCANNER_FLAG_COUNT };
#undef FLAG_INDEX
#define FIELD_INDEX(type, name, width, bias) FIELD_##name,
enum { SCANNER_FIELDS(FIELD_INDEX) SCANNER_FIELD_COUNT };
#undef FIELD_INDEX
#define FIELD_BYTES(type, name, width, bias) +width
enum {
  IMPLICIT_KEY_LIMIT = 1024,
  IMPLICIT_KEY_WORDS = IMPLICIT_KEY_LIMIT / 64 + 1,
  SCANNER_FLAG_BYTES = (SCANNER_FLAG_COUNT + SCANNER_FIELD_COUNT + 7) / 8,
  SCANNER_MIN_STATE_BYTES = SCANNER_FLAG_BYTES + SCANNER_FIELD_COUNT,
  SCANNER_MAX_STATE_BYTES = SCANNER_FLAG_BYTES SCANNER_FIELDS(FIELD_BYTES),
  SCANNER_KEY_BYTES = IMPLICIT_KEY_LIMIT / 8 + 1
};
#undef FIELD_BYTES

typedef char ScannerSerializationFits
  [SCANNER_FLAG_COUNT + SCANNER_FIELD_COUNT <= 64 &&
        SCANNER_MAX_STATE_BYTES + SCANNER_KEY_BYTES <=
          TREE_SITTER_SERIALIZATION_BUFFER_SIZE
      ? 1
      : -1];

#define DECLARE_FIELD(type, name, width, bias) type name;
#define DECLARE_FLAG(name) bool name;
typedef struct {
  SCANNER_FIELDS(DECLARE_FIELD)
  SCANNER_FLAGS(DECLARE_FLAG)
  uint64_t implicit_keys[IMPLICIT_KEY_WORDS];
} Scanner;
#undef DECLARE_FLAG
#undef DECLARE_FIELD

typedef struct {
  TSLexer lexer;
  TSLexer *source;
  uint32_t column, marked_column;
  uint64_t characters;
  uint64_t marked_characters;
  bool broken, marked_broken;
  bool separated, marked_separation;
  bool allocation_failed;
} Cursor;

static bool blank(int32_t c) {
  return c == ' ' || c == '\t';
}
static bool newline(int32_t c) {
  return c == '\n' || c == '\r';
}
static bool space(int32_t c) {
  return blank(c) || newline(c);
}
static bool flow_indicator(int32_t c) {
  return c == ',' || c == '[' || c == ']' || c == '{' || c == '}';
}
static bool flow_entry_end(int32_t c) {
  return c == ',' || c == ']' || c == '}';
}
static bool invalid_encoding(int32_t c) {
  return c < 0 || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff);
}
static bool invalid_quoted(int32_t c) {
  return invalid_encoding(c) ||
    (c < 0x20 && c != '\t' && c != '\n' && c != '\r');
}
static bool invalid_unquoted(int32_t c) {
  return invalid_quoted(c) ||
    (c >= 0x7f && c <= 0x9f && c != 0x85) ||
    c == 0xfeff ||
    c == 0xfffe ||
    c == 0xffff;
}

static bool block_value_follows(
  const Scanner *s,
  const bool *valid,
  bool line,
  uint32_t line_indent,
  int32_t line_head
) {
  bool indicator = line && line_indent == s->indent;
  if (valid[EXPLICIT_VALUE_START] && indicator && line_head == ':') return true;
  return (valid[BLOCK_OUT_VALUE_START] ||
           valid[BLOCK_IN_VALUE_START] ||
           valid[BLOCK_OUT_IMPLICIT_VALUE_START]) &&
    (!line ||
      line_indent > s->indent ||
      ((valid[BLOCK_OUT_VALUE_START] ||
         valid[BLOCK_OUT_IMPLICIT_VALUE_START]) &&
        indicator &&
        line_head == '-'));
}
static bool property_line_follows(
  const Scanner *s,
  bool line,
  uint32_t line_indent,
  int32_t line_head
) {
  return s->flow ||
    !line ||
    line_indent > s->indent ||
    (s->block_out && line_indent == s->indent && line_head == '-');
}

static void cursor_advance(TSLexer *lexer, bool skip) {
  Cursor *cursor = (Cursor *)lexer;
  cursor->characters++;
  cursor->separated = space(lexer->lookahead);
  cursor->broken |= newline(lexer->lookahead);
  cursor->column = newline(lexer->lookahead) ? 0 : cursor->column + 1;
  cursor->source->advance(cursor->source, skip);
  lexer->lookahead = cursor->source->lookahead;
}
static void cursor_mark(TSLexer *lexer) {
  Cursor *cursor = (Cursor *)lexer;
  cursor->marked_column = cursor->column;
  cursor->marked_characters = cursor->characters;
  cursor->marked_broken = cursor->broken;
  cursor->marked_separation = cursor->separated;
  cursor->source->mark_end(cursor->source);
}
static uint32_t cursor_column(TSLexer *lexer) {
  return ((Cursor *)lexer)->column;
}
static bool cursor_eof(const TSLexer *lexer) {
  const Cursor *cursor = (const Cursor *)lexer;
  return cursor->source->eof(cursor->source);
}
static uint64_t cursor_characters(const TSLexer *lexer) {
  return ((const Cursor *)lexer)->characters;
}
static bool cursor_broken(const TSLexer *lexer) {
  return ((const Cursor *)lexer)->broken;
}
static void cursor_start_line(TSLexer *lexer) {
  ((Cursor *)lexer)->column = 0;
}

static bool emit(TSLexer *l, const bool *valid, enum Token token) {
  if (!valid[token]) return false;
  l->result_symbol = token;
  return true;
}
static void step(TSLexer *l) {
  l->advance(l, false);
}
static bool step_boundary(TSLexer *l, bool flow) {
  step(l);
  return l->eof(l) ||
    space(l->lookahead) ||
    (flow && flow_indicator(l->lookahead));
}
static bool finish(TSLexer *l, const bool *valid, enum Token token) {
  l->mark_end(l);
  return emit(l, valid, token);
}
static uint32_t count_spaces(TSLexer *l) {
  uint32_t spaces = 0;
  while (l->lookahead == ' ') {
    step(l);
    spaces++;
  }
  return spaces;
}
static void skip_blanks(TSLexer *l) {
  while (blank(l->lookahead)) step(l);
}
static void skip_line(TSLexer *l) {
  while (!l->eof(l) && !newline(l->lookahead)) step(l);
}
static bool layout_follows(TSLexer *l) {
  return l->eof(l) || newline(l->lookahead) || l->lookahead == '#';
}
static bool take(TSLexer *l, const bool *valid, enum Token token) {
  if (!valid[token]) return false;
  step(l);
  return finish(l, valid, token);
}

static bool scan_separation(TSLexer *l, const bool *valid) {
  skip_blanks(l);
  return finish(l, valid, SEPARATION);
}

static void skip_line_break(TSLexer *l) {
  int32_t first = l->lookahead;
  step(l);
  if (first == '\r' && l->lookahead == '\n') step(l);
}
static bool skip_layout_lines(TSLexer *l, bool line, uint32_t *line_indent) {
  for (;;) {
    if (line) *line_indent = count_spaces(l);
    skip_blanks(l);
    if (l->lookahead == '#') skip_line(l);
    if (!newline(l->lookahead)) return line;
    skip_line_break(l);
    line = true;
  }
}
static bool line_break(TSLexer *l, const bool *valid, enum Token token) {
  skip_line_break(l);
  return finish(l, valid, token);
}
static void reset_line(Scanner *s) {
  s->line = true;
  s->document_start_line = false;
  s->line_context = false;
  s->line_prefixed = false;
  s->line_indent = 0;
  s->line_head = 0;
  s->layout_only = false;
  s->prefix_invalid = false;
  s->after_document_end = false;
}
static bool
close_flow(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  if (!s->flow) return false;
  s->flow--;
  s->json = s->flow > 0;
  s->line = false;
  return take(l, valid, token);
}
static bool
emit_structure(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  if (token == DEDENT) s->indent--;
  else if (token == INDENT) s->indent++;
  return emit(l, valid, token);
}
static bool end_collection(TSLexer *l, const bool *valid) {
  return emit(l, valid, MAPPING_END) ||
    emit(l, valid, SEQUENCE_END) ||
    emit(l, valid, SEQUENCE_IN_MAPPING_END);
}
static bool restore_indent(Scanner *s, TSLexer *l, const bool *valid) {
  return valid[DEDENT] && emit_structure(s, l, valid, DEDENT);
}
static bool
any_valid(const bool *valid, const enum Token *tokens, size_t count) {
  for (size_t i = 0; i < count; i++)
    if (valid[tokens[i]]) return true;
  return false;
}
static bool start_plain(Scanner *s, TSLexer *l, const bool *valid) {
  if (!valid[PLAIN_START]) return false;
  s->mode = PLAIN;
  s->first = true;
  s->json = false;
  return emit(l, valid, PLAIN_START);
}

static bool word_end(TSLexer *l) {
  return l->eof(l) || space(l->lookahead);
}
static bool word_part_end(TSLexer *l) {
  return word_end(l) || invalid_unquoted(l->lookahead);
}
static bool scan_word(TSLexer *l, const bool *valid, enum Token token) {
  do {
    step(l);
  } while (!word_part_end(l));
  return finish(l, valid, token);
}
static bool scan_line_text(TSLexer *l, const bool *valid, enum Token token) {
  if (invalid_unquoted(l->lookahead)) return false;
  do {
    step(l);
  } while (
    !l->eof(l) && !newline(l->lookahead) && !invalid_unquoted(l->lookahead)
  );
  return finish(l, valid, token);
}

static enum Boundary document_marker_tail(TSLexer *l, int32_t marker) {
  for (unsigned i = 0; i < 2; i++) {
    if (l->lookahead != marker) return NO_BOUNDARY;
    step(l);
  }
  if (!space(l->lookahead) && !l->eof(l)) return NO_BOUNDARY;
  return marker == '-' ? DOCUMENT_START_LINE : DOCUMENT_END_LINE;
}
static enum Boundary document_marker(TSLexer *l) {
  if (l->get_column(l) != 0 || (l->lookahead != '-' && l->lookahead != '.'))
    return NO_BOUNDARY;
  int32_t marker = l->lookahead;
  step(l);
  return document_marker_tail(l, marker);
}
/* Requires column 0. */
static bool stream_boundary(const Scanner *s, TSLexer *l) {
  return (!s->flow && l->lookahead == 0xfeff) || document_marker(l);
}
static enum Boundary line_boundary(const Scanner *s, TSLexer *l) {
  if (l->lookahead == '-' || l->lookahead == '.') return document_marker(l);
  if (s->flow || (s->mode != NORMAL && s->mode != BLOCK_BODY))
    return NO_BOUNDARY;
  if (l->lookahead == '%')
    return s->mode == NORMAL ? DIRECTIVE_LINE : NO_BOUNDARY;
  return l->lookahead == 0xfeff ? STREAM_BOM : NO_BOUNDARY;
}
static bool line_head_boundary(
  const Scanner *s,
  TSLexer *l,
  bool line,
  int32_t *line_head
) {
  int32_t first = *line_head = l->lookahead;
  if (first == '-' && line && !s->flow) {
    bool column_zero = l->get_column(l) == 0;
    if (!step_boundary(l, false)) *line_head = 0;
    return column_zero && document_marker_tail(l, first) != NO_BOUNDARY;
  }
  return l->get_column(l) == 0 && line_boundary(s, l) != NO_BOUNDARY;
}
/* Comment edits must invalidate preceding node reductions. */
static bool start_comment(
  Scanner *s,
  TSLexer *l,
  const bool *valid,
  enum Mode return_mode,
  bool missing_separation
) {
  if (missing_separation) return false;
  skip_line(l);
  s->mode = COMMENT_BEGIN;
  s->return_mode = (uint8_t)return_mode;
  return emit(l, valid, COMMENT_START);
}

static enum Token node_start(int32_t c) {
  switch (c) {
    case '[':
      return FLOW_SEQUENCE_START;
    case '{':
      return FLOW_MAPPING_START;
    case '\'':
      return SINGLE_START;
    case '"':
      return DOUBLE_START;
    case '&':
    case '!':
      return PROPERTIES_START;
    case '*':
      return ALIAS_START;
    default:
      return PLAIN_START;
  }
}
static bool name_boundary(TSLexer *l) {
  return l->eof(l) || space(l->lookahead) || flow_indicator(l->lookahead);
}
static bool uri_boundary(TSLexer *l, bool prefix, bool suffix) {
  return l->eof(l) ||
    space(l->lookahead) ||
    (suffix ? flow_indicator(l->lookahead) : !prefix && l->lookahead == '>');
}
static bool block_collection(enum Token kind) {
  return kind == MAPPING_START || kind == SEQUENCE_START;
}

static void advance_keys(Scanner *s, uint64_t characters, bool broken) {
  if (broken || characters > IMPLICIT_KEY_LIMIT) {
    memset(s->implicit_keys, 0, sizeof(s->implicit_keys));
    return;
  }
  unsigned words = (unsigned)(characters / 64);
  unsigned bits = (unsigned)(characters % 64);
  for (unsigned i = IMPLICIT_KEY_WORDS; i-- > 0;) {
    uint64_t value = i >= words ? s->implicit_keys[i - words] << bits : 0;
    if (bits && i > words)
      value |= s->implicit_keys[i - words - 1] >> (64 - bits);
    s->implicit_keys[i] = value;
  }
  s->implicit_keys[IMPLICIT_KEY_WORDS - 1] &= 1;
}
static unsigned end_key(Scanner *s) {
  for (unsigned i = 0; i < IMPLICIT_KEY_WORDS; i++) {
    uint64_t word = s->implicit_keys[i];
    if (word) {
      s->implicit_keys[i] &= word - 1;
      unsigned age = i * 64;
      while (!(word & 1)) {
        word >>= 1;
        age++;
      }
      return age;
    }
  }
  return IMPLICIT_KEY_LIMIT + 1;
}

/* Layout edits must invalidate preceding node reductions. */
static void skip_layout(TSLexer *l) {
  for (;;) {
    while (space(l->lookahead)) step(l);
    if (l->lookahead != '#') return;
    skip_line(l);
  }
}

static bool scan_key_end(Scanner *s, TSLexer *l, const bool *valid) {
  if (!s->line && blank(l->lookahead)) return scan_separation(l, valid);
  unsigned age = end_key(s);
  if (s->flow) skip_layout(l);
  bool too_long =
    cursor_broken(l) || age + cursor_characters(l) > IMPLICIT_KEY_LIMIT;
  if (valid[FLOW_NODE_END]) {
    bool colon = l->lookahead == ':';
    if (colon) colon = step_boundary(l, true) || s->json;
    if (!colon) return emit(l, valid, FLOW_NODE_END);
  }
  if (too_long) return false;
  if (!s->flow) s->key_state = KEY_ENDED;
  return emit(l, valid, KEY_END);
}

static void skip_property_or_alias(TSLexer *l) {
  bool tag = l->lookahead == '!';
  step(l);
  if (tag && l->lookahead == '<') {
    step(l);
    while (!uri_boundary(l, false, false)) step(l);
    if (l->lookahead == '>') step(l);
  } else {
    while (!name_boundary(l)) step(l);
  }
}

typedef struct {
  char initial[32];
  char *closings;
  size_t depth, capacity;
} FlowStack;
/* This bit is unused by ']' and '}'. */
enum { VALUE_CLOSING = 0x02 };
enum FlowPosition { AT_ENTRY, AT_KEY, AT_VALUE, AT_VALUE_PROPERTIES };
static bool flow_value(enum FlowPosition position) {
  return position == AT_VALUE || position == AT_VALUE_PROPERTIES;
}

static bool push_flow(FlowStack *flows, int32_t opening) {
  if (flows->depth == flows->capacity) {
    if (flows->capacity > SIZE_MAX / 2) return false;
    size_t capacity = flows->capacity * 2;
    char *expanded = ts_calloc(capacity, sizeof(*expanded));
    if (!expanded) return false;
    memcpy(expanded, flows->closings, flows->depth);
    if (flows->closings != flows->initial) ts_free(flows->closings);
    flows->closings = expanded;
    flows->capacity = capacity;
  }
  flows->closings[flows->depth++] = opening == '[' ? ']' : '}';
  return true;
}
static bool key_colon_follows(TSLexer *l, enum Token content, bool adjacent) {
  FlowStack flows = {.capacity = sizeof(flows.initial)};
  flows.closings = flows.initial;
  bool structured = content == SINGLE_START ||
    content == DOUBLE_START ||
    content == FLOW_SEQUENCE_START ||
    content == FLOW_MAPPING_START;
  bool complete = content == ALIAS_START;
  bool plain = content == PLAIN_START;
  bool separated = false;
  bool colon = false;
  int32_t quote = 0;
  enum FlowPosition position = AT_ENTRY;
  while (!l->eof(l)) {
    if (
      l->get_column(l) == 0 &&
      cursor_characters(l) &&
      (l->lookahead == '-' || l->lookahead == '.')
    ) {
      if (document_marker(l) || l->eof(l)) break;
      if (!quote) {
        plain = true;
        adjacent = false;
        position = AT_ENTRY;
      }
      separated = false;
    }
    int32_t c = l->lookahead;
    if (!quote && !flows.depth) {
      if (complete && !space(c) && c != ':') break;
      if (newline(c) || (c == '#' && separated)) break;
    }
    if (quote) {
      if (c == '\\' && quote == '"') {
        step(l);
        if (l->eof(l)) break;
      } else if (c == quote) {
        if (quote == '\'') {
          step(l);
          if (l->lookahead == '\'') {
            step(l);
            continue;
          }
        }
        quote = 0;
        adjacent = !flow_value(position);
        position = AT_ENTRY;
        if (!flows.depth) complete = true;
        separated = false;
        if (c == '\'') continue;
      }
    } else if (structured && !plain && (c == '\'' || c == '"')) quote = c;
    else if (flows.depth && !plain && (c == '&' || c == '*' || c == '!')) {
      position = c == '*'      ? AT_ENTRY
        : flow_value(position) ? AT_VALUE_PROPERTIES
                               : AT_KEY;
      skip_property_or_alias(l);
      adjacent = false;
      separated = false;
      continue;
    } else if (flows.depth && c == '#' && (separated || !plain)) {
      skip_line(l);
      plain = false;
      separated = true;
      continue;
    } else if (structured && (c == '[' || c == '{')) {
      if (!push_flow(&flows, c)) {
        ((Cursor *)l)->allocation_failed = true;
        break;
      }
      if (flow_value(position))
        flows.closings[flows.depth - 1] |= VALUE_CLOSING;
      plain = false;
      adjacent = false;
      position = AT_ENTRY;
    } else if ((c == ']' || c == '}') && flows.depth) {
      char closing = flows.closings[flows.depth - 1];
      if ((closing & ~VALUE_CLOSING) != c) break;
      flows.depth--;
      plain = false;
      adjacent = !(closing & VALUE_CLOSING);
      position = AT_ENTRY;
      if (!flows.depth) complete = true;
    } else if (flows.depth && c == ',') {
      plain = false;
      adjacent = false;
      position = AT_ENTRY;
    } else if (c == ':') {
      bool indicator = step_boundary(l, flows.depth > 0);
      if (!flows.depth && indicator) {
        colon = true;
        break;
      }
      if (!flows.depth && complete) break;
      plain = indicator ? position == AT_VALUE : !adjacent;
      position = plain ? AT_ENTRY : AT_VALUE;
      adjacent = false;
      separated = false;
      continue;
    } else if (flows.depth && !plain && c == '?') {
      plain = !step_boundary(l, false) || position != AT_ENTRY;
      position = plain ? AT_ENTRY : AT_KEY;
      adjacent = false;
      separated = false;
      continue;
    } else if (!space(c)) {
      plain = true;
      adjacent = false;
      position = AT_ENTRY;
    }
    separated = space(c);
    step(l);
  }
  if (flows.closings != flows.initial) ts_free(flows.closings);
  return colon;
}

static enum Token classify_block_node(TSLexer *l) {
  bool properties = l->lookahead == '&' || l->lookahead == '!';
  bool attached = false;
  while (l->lookahead == '&' || l->lookahead == '!') {
    skip_property_or_alias(l);
    attached = !blank(l->lookahead);
    skip_blanks(l);
    if (layout_follows(l)) return PROPERTIES_START;
  }
  int32_t first = l->lookahead;
  if (first == '|' || first == '>')
    return properties ? PROPERTIES_START
      : first == '|'  ? LITERAL_START
                      : FOLDED_START;
  enum Token content = node_start(first);
  if (first == '*') skip_property_or_alias(l);
  if ((first == '-' || first == '?') && step_boundary(l, false)) {
    return properties ? PROPERTIES_START
      : first == '-'  ? SEQUENCE_START
                      : MAPPING_START;
  }
  if (key_colon_follows(l, content, attached)) return MAPPING_START;
  return properties ? PROPERTIES_START : content;
}

static enum Token classify_block_start(Scanner *s, TSLexer *l) {
  if (!s->block_kind) s->block_kind = (uint8_t)(classify_block_node(l) + 1);
  return (enum Token)(s->block_kind - 1);
}

static bool
emit_indicator(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  l->mark_end(l);
  if (!s->flow && blank(l->lookahead)) {
    skip_blanks(l);
    if (!layout_follows(l) && block_collection(classify_block_node(l)))
      s->mode = COMPACT_PREFIX;
  }
  return emit(l, valid, token);
}

static unsigned hex_value(int32_t c) {
  if (c >= '0' && c <= '9') return (unsigned)(c - '0');
  if (c >= 'a' && c <= 'f') return (unsigned)(c - 'a' + 10);
  if (c >= 'A' && c <= 'F') return (unsigned)(c - 'A' + 10);
  return 16;
}
static unsigned hex_digits(TSLexer *l, unsigned remaining, uint32_t *value) {
  *value = 0;
  while (remaining && !l->eof(l)) {
    unsigned digit = hex_value(l->lookahead);
    if (digit == 16) break;
    *value = (*value << 4) | digit;
    step(l);
    l->mark_end(l);
    remaining--;
  }
  return remaining;
}

static bool word_char(int32_t c) {
  return (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c == '-';
}
static bool uri_char(int32_t c, bool suffix) {
  return word_char(c) ||
    (c > 0 &&
      c < 128 &&
      strchr("#;/?:@&=+$,_.!~*'()[]", (int)c) &&
      (!suffix || (c != '!' && !flow_indicator(c))));
}
static bool scan_name(Scanner *s, TSLexer *l, const bool *valid) {
  bool anchor = s->mode == ANCHOR_BODY;
  if (name_boundary(l)) {
    s->mode = NORMAL;
    return emit(l, valid, NAME_END);
  }
  if (invalid_unquoted(l->lookahead)) return false;
  do {
    step(l);
  } while (!name_boundary(l) && !invalid_unquoted(l->lookahead));
  return finish(l, valid, anchor ? ANCHOR_NAME : ALIAS_NAME);
}

static void end_handle(Scanner *s) {
  s->mode = s->directive_handle ? DIRECTIVE_PREFIX : SUFFIX_BEGIN;
  s->directive_handle = false;
}
static bool scan_handle(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == HANDLE_SELECT) {
    step(l);
    enum Token token = s->handle_form == PRIMARY_HANDLE ? PRIMARY_TAG_HANDLE
      : s->handle_form == SECONDARY_HANDLE              ? SECONDARY_TAG_HANDLE
                                                        : TAG_HANDLE_OPEN;
    if (s->handle_form == SECONDARY_HANDLE) step(l);
    l->mark_end(l);
    if (s->handle_form == NAMED_HANDLE) s->mode = HANDLE_BODY;
    else end_handle(s);
    s->handle_form = 0;
    return emit(l, valid, token);
  }
  if (l->lookahead == '!') {
    end_handle(s);
    return take(l, valid, TAG_HANDLE_CLOSE);
  }
  if (!word_char(l->lookahead)) return false;
  do {
    step(l);
  } while (word_char(l->lookahead));
  return finish(l, valid, TAG_HANDLE_NAME);
}

static bool scan_tag_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == URI_BEGIN) {
    if (uri_boundary(l, false, false)) return false;
    s->mode = URI_BODY;
    return emit(l, valid, TAG_URI_START);
  }
  if (s->mode == VERBATIM_CLOSE) {
    if (l->lookahead != '>') return false;
    s->mode = NORMAL;
    return take(l, valid, VERBATIM_TAG_CLOSE);
  }
  if (name_boundary(l)) return false;
  s->mode = SUFFIX_BODY;
  return emit(l, valid, TAG_SUFFIX_START);
}

static bool scan_uri(Scanner *s, TSLexer *l, const bool *valid) {
  bool prefix = s->mode == PREFIX_BODY;
  bool suffix = s->mode == SUFFIX_BODY;
  if (uri_boundary(l, prefix, suffix)) {
    if (prefix) {
      s->mode = DIRECTIVE_PARAMETERS;
      return emit(l, valid, TAG_PREFIX_END);
    }
    if (suffix) {
      s->mode = NORMAL;
      return emit(l, valid, TAG_END);
    }
    s->mode = VERBATIM_CLOSE;
    return emit(l, valid, TAG_URI_END);
  }
  if (invalid_unquoted(l->lookahead)) return false;
  if (prefix && s->first) {
    s->first = false;
    if (flow_indicator(l->lookahead) && uri_char(l->lookahead, false))
      return false;
  }
  if (l->lookahead == '%') {
    step(l);
    l->mark_end(l);
    uint32_t value;
    unsigned remaining = hex_digits(l, 2, &value);
    return !remaining && emit(l, valid, URI_ESCAPE);
  }
  if (!uri_char(l->lookahead, suffix)) return false;
  do {
    step(l);
  } while (uri_char(l->lookahead, suffix));
  return finish(l, valid, suffix ? TAG_SUFFIX_TEXT : URI_TEXT);
}

static bool start_directive(Scanner *s, TSLexer *l, const bool *valid) {
  char name[5] = {0};
  unsigned length = 0;
  step(l);
  while (!word_end(l)) {
    if (invalid_unquoted(l->lookahead)) return false;
    if (length < 4 && l->lookahead < 128) name[length] = (char)l->lookahead;
    if (length < 5) length++;
    step(l);
  }
  s->directive_kind = length == 4 && !strcmp(name, "YAML") ? YAML_DIRECTIVE
    : length == 3 && !strcmp(name, "TAG")                  ? TAG_DIRECTIVE
                                                           : RESERVED_DIRECTIVE;
  return emit(
    l,
    valid,
    s->directive_kind == YAML_DIRECTIVE    ? YAML_DIRECTIVE_START
      : s->directive_kind == TAG_DIRECTIVE ? TAG_DIRECTIVE_START
                                           : RESERVED_DIRECTIVE_START
  );
}
static bool scan_directive_name(Scanner *s, TSLexer *l, const bool *valid) {
  if (word_end(l)) {
    s->mode = s->directive_kind == YAML_DIRECTIVE ? DIRECTIVE_VERSION
      : s->directive_kind == TAG_DIRECTIVE        ? DIRECTIVE_HANDLE
                                                  : DIRECTIVE_PARAMETERS;
    return emit(l, valid, DIRECTIVE_NAME_END);
  }
  if (invalid_unquoted(l->lookahead)) return false;
  return scan_word(l, valid, DIRECTIVE_NAME);
}
static bool
scan_yaml_version(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (end) return false;
  unsigned part = 0;
  do {
    int32_t c = l->lookahead;
    if (c >= '0' && c <= '9') {
      if (part == 0 || part == 2) part++;
    } else if (c == '.' && part == 1) part = 2;
    else return false;
    step(l);
  } while (!word_end(l));
  if (part != 3) return false;
  s->mode = VERSION_BODY;
  return emit(l, valid, YAML_VERSION_START);
}
static bool scan_directive_word(Scanner *s, TSLexer *l, const bool *valid) {
  if (word_end(l)) {
    s->mode = DIRECTIVE_PARAMETERS;
    return emit(l, valid, DIRECTIVE_WORD_END);
  }
  if (invalid_unquoted(l->lookahead)) return false;
  return scan_word(
    l,
    valid,
    s->mode == VERSION_BODY ? YAML_VERSION_TEXT : DIRECTIVE_PARAMETER_TEXT
  );
}
static bool
scan_directive_handle(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (end || l->lookahead != '!') return false;
  step(l);
  s->handle_form = l->lookahead == '!' ? SECONDARY_HANDLE
    : word_end(l)                      ? PRIMARY_HANDLE
                                       : NAMED_HANDLE;
  s->directive_handle = true;
  s->mode = HANDLE_SELECT;
  return emit(l, valid, TAG_HANDLE_START);
}
static bool
scan_directive_prefix(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (end || !s->separated) return false;
  s->mode = PREFIX_BODY;
  s->first = true;
  return emit(l, valid, TAG_PREFIX_START);
}
static bool scan_directive(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == DIRECTIVE_NAME_BODY) return scan_directive_name(s, l, valid);
  if (blank(l->lookahead)) return scan_separation(l, valid);
  bool end =
    l->eof(l) || newline(l->lookahead) || (l->lookahead == '#' && s->separated);
  switch ((enum Mode)s->mode) {
    case DIRECTIVE_VERSION:
      return scan_yaml_version(s, l, valid, end);
    case DIRECTIVE_HANDLE:
      return scan_directive_handle(s, l, valid, end);
    case DIRECTIVE_PREFIX:
      return scan_directive_prefix(s, l, valid, end);
    default:
      break;
  }
  if (l->lookahead == '#' && s->separated)
    return start_comment(s, l, valid, DIRECTIVE_PARAMETERS, false);
  if (end) {
    s->mode = NORMAL;
    return emit(l, valid, DIRECTIVE_END);
  }
  if (invalid_unquoted(l->lookahead)) return false;
  if (s->directive_kind != RESERVED_DIRECTIVE) return false;
  s->mode = PARAMETER_BODY;
  return emit(l, valid, DIRECTIVE_PARAMETER_START);
}

static void end_scalar(Scanner *s) {
  s->mode = NORMAL;
  s->first = false;
  s->prefix = false;
  s->continuation = false;
  s->quote_line_empty = false;
  s->scalar_indent = false;
  s->scalar_spaces = 0;
  s->scalar_tab = false;
  s->block_indent = -1;
  s->block_explicit_indent = false;
  s->header_separated = false;
  s->block_leading = false;
  s->block_empty = false;
  s->block_prefix = false;
  s->block_layout_lines = 0;
}

static bool scalar_break(Scanner *s, TSLexer *l, const bool *valid) {
  s->prefix = true;
  s->continuation = false;
  s->quote_line_empty = s->mode == DOUBLE;
  s->scalar_indent = true;
  s->scalar_spaces = 0;
  s->scalar_tab = false;
  return line_break(l, valid, SCALAR_LINE_BREAK);
}
static bool resume_scalar_line(Scanner *s) {
  s->prefix = false;
  s->continuation = false;
  if (!s->scalar_indent) return true;
  s->scalar_indent = false;
  return s->scalar_spaces > s->indent;
}

static bool scalar_prefix(Scanner *s, TSLexer *l, const bool *valid) {
  if (l->lookahead == '\t' && s->scalar_spaces <= s->indent) return false;
  do {
    if (l->lookahead == '\t') s->scalar_tab = true;
    else if (!s->scalar_tab) s->scalar_spaces++;
    step(l);
  } while (
    blank(l->lookahead) &&
    !(l->lookahead == '\t' && s->scalar_spaces <= s->indent)
  );
  return finish(l, valid, SCALAR_LINE_PREFIX);
}
static bool
close_quote(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  end_scalar(s);
  s->json = s->flow > 0;
  return emit(l, valid, token);
}
static bool scan_escape(Scanner *s, TSLexer *l, const bool *valid) {
  step(l);
  l->mark_end(l);
  if (newline(l->lookahead))
    return !s->quote_line_empty && emit(l, valid, ESCAPE_INDICATOR);
  if (l->eof(l) || invalid_quoted(l->lookahead)) return false;
  int32_t c = l->lookahead;
  bool ok = c > 0 && c < 128 && strchr("0abtnvfre \t\"/\\N_LP", (int)c);
  unsigned digits = c == 'x' ? 2 : c == 'u' ? 4 : c == 'U' ? 8 : 0;
  step(l);
  l->mark_end(l);
  if (digits) {
    uint32_t value;
    if (hex_digits(l, digits, &value)) return false;
    ok = value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
  }
  if (!ok) return false;
  s->quote_line_empty = false;
  return emit(l, valid, QUOTED_ESCAPE);
}
static bool scan_quote(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t quote = s->mode == SINGLE ? '\'' : '"';
  if (l->eof(l)) return false;
  if (newline(l->lookahead)) return scalar_break(s, l, valid);
  if (s->prefix && blank(l->lookahead)) return scalar_prefix(s, l, valid);
  if (!resume_scalar_line(s)) return false;
  if (invalid_quoted(l->lookahead)) return false;
  if (l->lookahead == quote) {
    step(l);
    l->mark_end(l);
    if (quote == '\'' && l->lookahead == '\'') {
      step(l);
      return finish(l, valid, ESCAPED_QUOTE);
    }
    return close_quote(s, l, valid, QUOTE_CLOSE);
  }
  if (s->mode == DOUBLE && l->lookahead == '\\')
    return scan_escape(s, l, valid);
  bool text = false;
  while (
    !l->eof(l) &&
    l->lookahead != quote &&
    !newline(l->lookahead) &&
    !invalid_quoted(l->lookahead) &&
    !(s->mode == DOUBLE && l->lookahead == '\\')
  ) {
    if (blank(l->lookahead)) {
      skip_blanks(l);
      if (newline(l->lookahead)) {
        if (text) return emit(l, valid, SCALAR_TEXT);
        return finish(l, valid, SCALAR_LINE_SUFFIX);
      }
      text = true;
      l->mark_end(l);
      continue;
    }
    step(l);
    s->quote_line_empty = false;
    text = true;
    l->mark_end(l);
  }
  return text && emit(l, valid, SCALAR_TEXT);
}

static bool plain_line_follows(Scanner *s, TSLexer *l) {
  bool broken = false;
  uint32_t indentation = 0;
  bool tab = false;
  while (space(l->lookahead)) {
    broken |= newline(l->lookahead);
    if (newline(l->lookahead)) {
      indentation = 0;
      tab = false;
    } else if (l->lookahead == '\t') tab = true;
    else if (!tab) indentation++;
    step(l);
  }
  bool more = broken &&
    !layout_follows(l) &&
    (s->flow ? !flow_indicator(l->lookahead) : indentation > s->indent);
  if (more && l->lookahead == ':') more = !step_boundary(l, s->flow);
  if (more && l->get_column(l) == 0 && stream_boundary(s, l)) more = false;
  return more;
}
static bool end_plain(Scanner *s, TSLexer *l, const bool *valid) {
  end_scalar(s);
  return emit(l, valid, PLAIN_END);
}
static bool scan_plain(Scanner *s, TSLexer *l, const bool *valid) {
  bool text = false;
  if (s->first) {
    s->first = false;
    if (
      l->lookahead > 0 &&
      l->lookahead < 128 &&
      strchr(",]}#@`%&*!|>", (int)l->lookahead)
    )
      return false;
    if (l->lookahead == '-' || l->lookahead == '?' || l->lookahead == ':') {
      if (step_boundary(l, s->flow)) return false;
      text = true;
    }
  }
  if (s->continuation || s->prefix) {
    if (newline(l->lookahead)) return scalar_break(s, l, valid);
    if (blank(l->lookahead)) {
      if (s->prefix) return scalar_prefix(s, l, valid);
      skip_blanks(l);
      return finish(l, valid, SCALAR_LINE_SUFFIX);
    }
    if (!resume_scalar_line(s)) return false;
  } else if (space(l->lookahead)) {
    if (!plain_line_follows(s, l) || !valid[PLAIN_CONTINUE])
      return end_plain(s, l, valid);
    s->continuation = true;
    return emit(l, valid, PLAIN_CONTINUE);
  }
  if (!text && invalid_unquoted(l->lookahead) && !l->eof(l)) return false;
  l->mark_end(l);
  while (!l->eof(l)) {
    int32_t c = l->lookahead;
    if (newline(c) || invalid_unquoted(c) || (s->flow && flow_indicator(c)))
      break;
    if (c == ':') {
      if (step_boundary(l, s->flow)) break;
      text = true;
      l->mark_end(l);
      continue;
    }
    if (blank(c)) {
      skip_blanks(l);
      if (layout_follows(l)) break;
      if (invalid_unquoted(l->lookahead)) {
        text = true;
        l->mark_end(l);
        break;
      }
      continue;
    }
    step(l);
    text = true;
    l->mark_end(l);
  }
  if (text) return emit(l, valid, SCALAR_TEXT);
  return end_plain(s, l, valid);
}

static bool end_block_scalar(Scanner *s, TSLexer *l, const bool *valid) {
  end_scalar(s);
  reset_line(s);
  return emit(l, valid, BLOCK_SCALAR_END);
}

static bool scan_block_header(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == BLOCK_HEADER_DONE || l->eof(l)) {
    s->mode = BLOCK_DETECT;
    return emit(l, valid, BLOCK_HEADER_END);
  }
  if (newline(l->lookahead)) {
    s->mode = BLOCK_HEADER_DONE;
    return line_break(l, valid, BLOCK_HEADER_BREAK);
  }
  if (blank(l->lookahead)) {
    s->header_separated = true;
    return scan_separation(l, valid);
  }
  if (l->lookahead == '#')
    return start_comment(s, l, valid, BLOCK_HEADER, !s->separated);
  if (s->header_separated) return false;
  if (
    l->lookahead >= '1' && l->lookahead <= '9' && valid[INDENTATION_INDICATOR]
  ) {
    s->block_indent = s->indent + l->lookahead - '0';
    s->block_explicit_indent = true;
    return take(l, valid, INDENTATION_INDICATOR);
  }
  if (l->lookahead == '+' || l->lookahead == '-')
    return take(l, valid, CHOMPING_INDICATOR);
  return false;
}

static bool detect_block_indent(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->block_indent < 0) {
    uint32_t longest = 0;
    for (;;) {
      uint32_t spaces = count_spaces(l);
      if (newline(l->lookahead)) {
        if (spaces > longest) longest = spaces;
        skip_line_break(l);
      } else {
        bool content = !l->eof(l) && spaces > s->indent;
        if (content && !spaces && stream_boundary(s, l)) content = false;
        s->block_indent = content ? spaces
          : longest > s->indent   ? longest
                                  : s->indent + 1;
        break;
      }
    }
  }
  s->block_leading = true;
  s->mode = BLOCK_BODY;
  return emit(l, valid, BLOCK_BODY_START);
}
static bool block_stream_layout_follows(Scanner *s, TSLexer *l) {
  uint32_t lines = 1;
  bool shallow_comment = false;
  for (;;) {
    skip_blanks(l);
    if (l->lookahead == '#') skip_line(l);
    if (l->eof(l)) return true;
    if (!newline(l->lookahead)) {
      s->block_layout_lines = lines;
      if (l->get_column(l) != 0) return false;
      if (l->lookahead == '%') return shallow_comment || s->indent >= 0;
      return stream_boundary(s, l);
    }
    skip_line_break(l);
    lines++;
    if (count_spaces(l) < s->block_indent && l->lookahead == '#')
      shallow_comment = true;
  }
}
static bool scan_block_body(Scanner *s, TSLexer *l, const bool *valid) {
  if (l->eof(l)) return end_block_scalar(s, l, valid);
  uint32_t spaces = count_spaces(l);
  int32_t first = l->lookahead;
  bool empty = newline(first);
  bool spaced = spaces > s->block_indent || first == '\t';
  bool shallow_tab = spaces < s->block_indent && first == '\t';
  bool leading = s->block_leading && !s->block_explicit_indent;
  bool end = l->eof(l) && (spaces <= s->block_indent || leading);
  if (shallow_tab && !s->block_layout_lines)
    end = block_stream_layout_follows(s, l);
  if (
    end ||
    (!empty &&
      ((spaces <= s->indent && !shallow_tab) ||
        (spaces < s->block_indent && first == '#')))
  )
    return end_block_scalar(s, l, valid);
  if (s->block_layout_lines) s->block_layout_lines--;
  s->block_empty = empty && (spaces <= s->block_indent || leading);
  if (!s->block_empty) s->block_leading = false;
  s->block_prefix = true;
  s->scalar_indent = true;
  s->mode = BLOCK_LINE;
  return emit(
    l,
    valid,
    s->block_empty ? BLOCK_EMPTY_LINE_START
      : spaced     ? BLOCK_SPACED_LINE_START
                   : BLOCK_TEXT_LINE_START
  );
}
static bool scan_block_line(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == BLOCK_LINE_DONE || l->eof(l)) {
    s->mode = BLOCK_BODY;
    return emit(l, valid, BLOCK_LINE_END);
  }
  if (s->block_prefix) {
    s->block_prefix = false;
    bool consumed = false;
    while (l->lookahead == ' ' && l->get_column(l) < s->block_indent) {
      step(l);
      consumed = true;
    }
    if (consumed) return finish(l, valid, SCALAR_LINE_PREFIX);
  }
  if (s->scalar_indent) {
    s->scalar_indent = false;
    if (s->block_empty && s->block_leading && l->lookahead == ' ') return false;
    if (!s->block_empty && l->get_column(l) < s->block_indent) return false;
  }
  if (newline(l->lookahead)) {
    s->mode = BLOCK_LINE_DONE;
    reset_line(s);
    return line_break(l, valid, SCALAR_LINE_BREAK);
  }
  return scan_line_text(l, valid, SCALAR_TEXT);
}

static void close_document(Scanner *s) {
  s->explicit_document_required = true;
}
static void open_document(Scanner *s, bool started) {
  s->document_started = started;
  s->document_start_line = false;
  s->directive_kind = 0;
  s->flow = 0;
  s->indent = -1;
  s->block_out = false;
}

static bool check_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t first = l->lookahead;
  enum Boundary boundary = line_boundary(s, l);
  if (!boundary && first != '-' && first != '.') return false;
  s->boundary = (uint8_t)boundary;
  s->boundary_checked = true;
  return emit(l, valid, BOUNDARY_CHECK);
}
static bool scan_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == SINGLE || s->mode == DOUBLE || s->flow) return false;
  if (s->mode == BLOCK_BODY) return end_block_scalar(s, l, valid);
  if (
    emit(l, valid, EMPTY_BLOCK_NODE) ||
    end_collection(l, valid) ||
    restore_indent(s, l, valid)
  )
    return true;
  if (valid[DOCUMENT_CLOSE] && s->document_started) {
    close_document(s);
    return emit(l, valid, DOCUMENT_CLOSE);
  }
  enum Boundary boundary = (enum Boundary)s->boundary;
  bool opens = boundary == DOCUMENT_START_LINE || boundary == DIRECTIVE_LINE;
  if (boundary == DIRECTIVE_LINE && s->explicit_document_required) return false;
  if (opens && valid[DOCUMENT_OPEN]) {
    open_document(s, false);
    return emit(l, valid, DOCUMENT_OPEN);
  }
  if (boundary == DIRECTIVE_LINE || boundary == STREAM_BOM) return false;
  enum Token token =
    boundary == DOCUMENT_START_LINE ? DOCUMENT_START : DOCUMENT_END;
  if (!valid[token]) return false;
  for (unsigned i = 0; i < 3; i++) step(l);
  l->mark_end(l);
  s->document_started = token == DOCUMENT_START;
  s->document_start_line = token == DOCUMENT_START;
  s->after_document_end = token == DOCUMENT_END;
  s->explicit_document_required = false;
  s->directive_kind = 0;
  return emit(l, valid, token);
}

static bool scan_comment(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == COMMENT_BEGIN) {
    s->mode = COMMENT;
    return take(l, valid, COMMENT_MARKER);
  }
  if (l->eof(l) || newline(l->lookahead)) {
    s->mode = s->return_mode;
    s->return_mode = NORMAL;
    return emit(l, valid, COMMENT_END);
  }
  return scan_line_text(l, valid, COMMENT_TEXT);
}

static bool start_line_prefix(
  Scanner *s,
  TSLexer *l,
  const bool *valid,
  bool prefix_invalid,
  bool tab_invalid,
  bool indent_checked
) {
  s->prefix_invalid = prefix_invalid;
  s->tab_invalid = tab_invalid;
  s->indent_checked = indent_checked;
  s->mode = PREFIX;
  return emit(l, valid, LINE_PREFIX_START);
}
static bool scan_prefix(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == COMPACT_PREFIX)
    return start_line_prefix(s, l, valid, false, true, true);
  if (s->prefix_invalid) return false;
  if (l->lookahead == ' ' && !s->prefix_tab) {
    count_spaces(l);
    return finish(l, valid, INDENTATION);
  }
  if (blank(l->lookahead)) {
    if (s->tab_invalid) return false;
    s->prefix_tab = true;
    skip_blanks(l);
    return finish(l, valid, SEPARATION);
  }
  if (
    !s->indent_checked &&
    s->flow &&
    !layout_follows(l) &&
    s->line_indent <= s->indent
  )
    return false;
  s->mode = NORMAL;
  s->tab_invalid = false;
  s->prefix_tab = false;
  s->indent_checked = false;
  return emit(l, valid, LINE_PREFIX_END);
}

static bool start_pair(Scanner *s, TSLexer *l, const bool *valid) {
  s->key_state = KEY_NONE;
  return emit(l, valid, PAIR_START);
}
static bool scan_node_start(Scanner *s, TSLexer *l, const bool *valid) {
  int64_t column = s->line ? s->line_indent : l->get_column(l);
  int32_t first = l->lookahead;
  enum Token kind = s->flow ? node_start(first) : classify_block_start(s, l);
  if (s->document_start_line && block_collection(kind)) return false;
  if (
    !s->flow &&
    s->line &&
    column == s->indent &&
    valid[PAIR_START] &&
    kind != SEQUENCE_START
  )
    return start_pair(s, l, valid);
  if (
    kind == MAPPING_START &&
    !valid[MAPPING_START] &&
    !valid[INDENT] &&
    !valid[PAIR_START]
  )
    kind = node_start(first);
  if ((kind == LITERAL_START || kind == FOLDED_START) && !valid[kind])
    kind = PLAIN_START;
  if (!s->flow && block_collection(kind)) {
    if (column > s->indent && valid[INDENT])
      return emit_structure(s, l, valid, INDENT);
    if (column == s->indent) {
      if (kind == MAPPING_START && valid[PAIR_START])
        return start_pair(s, l, valid);
      if (kind == SEQUENCE_START && valid[ENTRY_START])
        return emit(l, valid, ENTRY_START);
      if (valid[kind]) return emit_structure(s, l, valid, kind);
    }
  }
  if (kind == PLAIN_START) return start_plain(s, l, valid);
  if (kind == PROPERTIES_START) {
    s->json = false;
    s->properties_ready = false;
  }
  return !block_collection(kind) && emit(l, valid, kind);
}

static bool scan_node_open(Scanner *s, TSLexer *l, const bool *valid) {
  switch (l->lookahead) {
    case '\'':
    case '"':
      s->mode = l->lookahead == '\'' ? SINGLE : DOUBLE;
      return take(l, valid, s->mode == SINGLE ? SINGLE_OPEN : DOUBLE_OPEN);
    case '[':
    case '{':
      s->flow++;
      return take(
        l,
        valid,
        l->lookahead == '[' ? FLOW_SEQUENCE_OPEN : FLOW_MAPPING_OPEN
      );
    case '|':
    case '>':
      s->mode = BLOCK_HEADER;
      return take(
        l,
        valid,
        l->lookahead == '|' ? LITERAL_INDICATOR : FOLDED_INDICATOR
      );
    default:
      return false;
  }
}

static bool scan_line_context(Scanner *s, TSLexer *l, const bool *valid) {
  s->line_indent = count_spaces(l);
  skip_blanks(l);
  int32_t line_head = l->lookahead;
  s->line_head = line_head;
  s->layout_only = layout_follows(l);
  if ((line_head == '-' || line_head == ':') && !step_boundary(l, false))
    s->line_head = 0;
  s->line_context = true;
  return emit(l, valid, LINE_CONTEXT);
}
static bool begin_line_prefix(Scanner *s, TSLexer *l, const bool *valid) {
  uint32_t spaces = count_spaces(l);
  skip_blanks(l);
  bool prefix_invalid = !s->layout_only &&
    !s->flow &&
    spaces > s->indent &&
    !valid[BLOCK_OUT_VALUE_START] &&
    !valid[BLOCK_IN_VALUE_START] &&
    !valid[BLOCK_OUT_IMPLICIT_VALUE_START] &&
    !valid[INDENT] &&
    (valid[PAIR_START] || valid[ENTRY_START]);
  bool tab_invalid = !s->layout_only && spaces <= s->indent;
  if (!s->layout_only && !s->flow && !layout_follows(l))
    tab_invalid |= block_collection(classify_block_node(l));
  s->line_prefixed = true;
  return start_line_prefix(s, l, valid, prefix_invalid, tab_invalid, false);
}

static bool start_implicit_key(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t first = l->lookahead;
  if (
    (first == '?' || first == ':') && step_boundary(l, first == ':' && s->flow)
  ) {
    if (valid[FLOW_SEQ_PAIR_START]) {
      s->json = false;
      return emit(l, valid, FLOW_SEQ_PAIR_START);
    }
    return emit_indicator(
      s,
      l,
      valid,
      first == '?' ? KEY_INDICATOR : VALUE_INDICATOR
    );
  }
  s->implicit_keys[0] |= 1;
  if (!s->flow) s->block_out = false;
  return emit(l, valid, IMPLICIT_KEY_START);
}
static bool scan_entry(Scanner *s, TSLexer *l, const bool *valid) {
  if (valid[FLOW_MAP_PAIR_START] && !flow_entry_end(l->lookahead)) {
    s->json = false;
    return emit(l, valid, FLOW_MAP_PAIR_START);
  }
  if (valid[IMPLICIT_KEY_START] && !(s->flow && flow_entry_end(l->lookahead)))
    return start_implicit_key(s, l, valid);
  if (l->lookahead == '?' && valid[KEY_INDICATOR]) {
    if (step_boundary(l, false))
      return emit_indicator(s, l, valid, KEY_INDICATOR);
    return start_plain(s, l, valid);
  }
  if (l->lookahead == ':' && valid[VALUE_INDICATOR]) {
    bool adjacent = s->flow && s->json;
    if (step_boundary(l, s->flow) || adjacent) {
      if (s->flow && !adjacent && (l->lookahead == '[' || l->lookahead == '{'))
        return false;
      s->json = false;
      return emit_indicator(s, l, valid, VALUE_INDICATOR);
    }
    return start_plain(s, l, valid);
  }
  if (l->lookahead == '-' && valid[SEQUENCE_INDICATOR]) {
    if (!step_boundary(l, false)) return false;
    return emit_indicator(s, l, valid, SEQUENCE_INDICATOR);
  }
  if (l->lookahead == ',' && valid[FLOW_SEPARATOR]) {
    s->json = false;
    return take(l, valid, FLOW_SEPARATOR);
  }
  if (l->lookahead == ']' && valid[FLOW_SEQUENCE_CLOSE])
    return close_flow(s, l, valid, FLOW_SEQUENCE_CLOSE);
  if (l->lookahead == '}' && valid[FLOW_MAPPING_CLOSE])
    return close_flow(s, l, valid, FLOW_MAPPING_CLOSE);
  static const enum Token node_starts[] = {
    PAIR_START,
    ENTRY_START,
    MAPPING_START,
    SEQUENCE_START,
    PLAIN_START,
    INDENT,
    SINGLE_START,
    DOUBLE_START,
    FLOW_SEQUENCE_START,
    FLOW_MAPPING_START,
    LITERAL_START,
    FOLDED_START,
    PROPERTIES_START,
    ALIAS_START
  };
  if (any_valid(valid, node_starts, COUNT(node_starts)))
    return scan_node_start(s, l, valid);
  return scan_node_open(s, l, valid);
}

static bool start_block_value(Scanner *s, TSLexer *l, const bool *valid) {
  uint32_t line_indent = s->line_indent;
  bool line = skip_layout_lines(l, s->line, &line_indent);
  int32_t line_head;
  if (l->eof(l) || line_head_boundary(s, l, line, &line_head))
    return emit(l, valid, EMPTY_BLOCK_NODE);
  if (line_head == ':' && (!line || !step_boundary(l, false))) line_head = 0;
  if (!block_value_follows(s, valid, line, line_indent, line_head))
    return emit(l, valid, EMPTY_BLOCK_NODE);
  if (valid[EXPLICIT_VALUE_START] && line_head == ':')
    return emit(l, valid, EXPLICIT_VALUE_START);
  bool implicit = valid[BLOCK_OUT_IMPLICIT_VALUE_START];
  if (!line && implicit && block_collection(classify_block_node(l)))
    return false;
  s->block_out = implicit || valid[BLOCK_OUT_VALUE_START];
  return emit(
    l,
    valid,
    implicit         ? BLOCK_OUT_IMPLICIT_VALUE_START
      : s->block_out ? BLOCK_OUT_VALUE_START
                     : BLOCK_IN_VALUE_START
  );
}
static bool scan_content(Scanner *s, TSLexer *l, const bool *valid) {
  if (
    l->lookahead == 0xfeff && l->get_column(l) == 0 && valid[BYTE_ORDER_MARK]
  ) {
    step(l);
    cursor_start_line(l);
    reset_line(s);
    return finish(l, valid, BYTE_ORDER_MARK);
  }
  bool end = l->eof(l);
  if (!end && (invalid_unquoted(l->lookahead) || s->after_document_end))
    return false;
  if (valid[DOCUMENT_CLOSE] && end) {
    close_document(s);
    return emit(l, valid, DOCUMENT_CLOSE);
  }
  if (valid[DOCUMENT_OPEN] && !end) {
    if (s->explicit_document_required) return false;
    open_document(s, true);
    return emit(l, valid, DOCUMENT_OPEN);
  }
  if ((end || (!s->flow && !s->line)) && end_collection(l, valid)) return true;
  if (end) return emit(l, valid, END_OF_FILE);
  return scan_entry(s, l, valid);
}

static bool start_tag_handle(Scanner *s, TSLexer *l, const bool *valid) {
  step(l);
  s->handle_form = PRIMARY_HANDLE;
  if (l->lookahead == '!') s->handle_form = SECONDARY_HANDLE;
  else {
    while (!name_boundary(l)) {
      if (l->lookahead == '!') {
        s->handle_form = NAMED_HANDLE;
        break;
      }
      step(l);
    }
  }
  s->mode = HANDLE_SELECT;
  return emit(l, valid, TAG_HANDLE_START);
}
static bool start_property_content(Scanner *s, TSLexer *l, const bool *valid) {
  if (!s->separated) return false;
  if (
    l->lookahead == '*' &&
    (s->flow || !s->line || classify_block_start(s, l) != MAPPING_START)
  )
    return false;
  if (!s->flow && !s->line) {
    enum Token kind = classify_block_start(s, l);
    if (
      kind == SEQUENCE_START ||
      (kind == MAPPING_START && valid[BLOCK_PROPERTY_CONTENT_START])
    )
      return false;
  }
  s->properties_ready = false;
  return emit(
    l,
    valid,
    valid[BLOCK_PROPERTY_CONTENT_START] ? BLOCK_PROPERTY_CONTENT_START
                                        : PROPERTY_CONTENT_START
  );
}
static bool scan_properties(Scanner *s, TSLexer *l, const bool *valid) {
  bool anchor = l->lookahead == '&';
  bool tag = l->lookahead == '!';
  if (
    (anchor && valid[ANCHOR_INDICATOR]) ||
    (l->lookahead == '*' && valid[ALIAS_INDICATOR])
  ) {
    s->mode = anchor ? ANCHOR_BODY : ALIAS_BODY;
    s->json = false;
    return take(l, valid, anchor ? ANCHOR_INDICATOR : ALIAS_INDICATOR);
  }
  if (
    tag &&
    (valid[VERBATIM_TAG_START] ||
      valid[SHORTHAND_TAG_START] ||
      valid[NON_SPECIFIC_TAG])
  ) {
    step(l);
    if (l->lookahead == '<') return emit(l, valid, VERBATIM_TAG_START);
    if (!name_boundary(l)) return emit(l, valid, SHORTHAND_TAG_START);
    l->mark_end(l);
    return emit(l, valid, NON_SPECIFIC_TAG);
  }
  if (valid[VERBATIM_TAG_OPEN]) {
    step(l);
    step(l);
    l->mark_end(l);
    s->mode = URI_BEGIN;
    return emit(l, valid, VERBATIM_TAG_OPEN);
  }
  if (valid[TAG_HANDLE_START]) return start_tag_handle(s, l, valid);
  return scan_content(s, l, valid);
}

static bool scan_layout(Scanner *s, TSLexer *l, const bool *valid) {
  if (
    s->line &&
    !s->line_prefixed &&
    (blank(l->lookahead) || (s->flow && s->indent >= 0 && !layout_follows(l)))
  )
    return begin_line_prefix(s, l, valid);
  if (newline(l->lookahead)) {
    reset_line(s);
    return line_break(l, valid, LINE_BREAK);
  }
  if (blank(l->lookahead)) return scan_separation(l, valid);
  if (l->lookahead == '#')
    return start_comment(
      s,
      l,
      valid,
      NORMAL,
      !s->separated && l->get_column(l) != 0
    );
  return false;
}

static bool scan_key_colon(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->line || l->lookahead != ':' || !step_boundary(l, false)) return false;
  s->key_state = KEY_NONE;
  return emit_indicator(s, l, valid, VALUE_INDICATOR);
}
static bool close_by_line(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->line_indent < s->indent) return end_collection(l, valid);
  return s->line_indent == s->indent &&
    s->line_head != '-' &&
    emit(l, valid, SEQUENCE_IN_MAPPING_END);
}

static bool key_end_valid(const bool *valid) {
  return valid[KEY_END] || valid[FLOW_NODE_END];
}
static bool key_colon_pending(const Scanner *s, const bool *valid) {
  return s->key_state == KEY_ENDED && valid[VALUE_INDICATOR];
}
static bool
scan_normal(Scanner *s, TSLexer *l, const bool *valid, bool property_pending) {
  if (!property_pending && key_end_valid(valid))
    return scan_key_end(s, l, valid);
  if (valid[EMPTY_BLOCK_NODE]) return start_block_value(s, l, valid);
  if (s->line && !s->line_context) return scan_line_context(s, l, valid);
  if (key_colon_pending(s, valid)) return scan_key_colon(s, l, valid);
  if (
    s->line_context &&
    !s->layout_only &&
    !property_line_follows(s, s->line, s->line_indent, s->line_head)
  ) {
    s->properties_ready = false;
    property_pending = false;
  }
  if (!property_pending && restore_indent(s, l, valid)) return true;
  if (
    !property_pending &&
    s->line &&
    !s->layout_only &&
    !s->flow &&
    close_by_line(s, l, valid)
  )
    return true;
  if (scan_layout(s, l, valid)) return true;
  if (valid[DIRECTIVE_INDICATOR]) {
    s->mode = DIRECTIVE_NAME_BODY;
    return take(l, valid, DIRECTIVE_INDICATOR);
  }
  if (
    l->lookahead == '%' &&
    l->get_column(l) == 0 &&
    valid[RESERVED_DIRECTIVE_START]
  )
    return start_directive(s, l, valid);
  return property_pending ? start_property_content(s, l, valid)
                          : scan_properties(s, l, valid);
}

static bool scan_property_tail(Scanner *s, TSLexer *l, const bool *valid) {
  uint32_t line_indent = s->line_indent;
  bool line = skip_layout_lines(l, s->line, &line_indent);
  bool end = l->eof(l);
  int32_t line_head;
  bool boundary = line_head_boundary(s, l, line, &line_head);
  enum Token content_end =
    valid[BLOCK_PROPERTIES_END] ? BLOCK_PROPERTIES_END : PROPERTIES_END;
  enum Token token = content_end;
  if (
    boundary ||
    end ||
    (s->flow && flow_entry_end(line_head)) ||
    !property_line_follows(s, line, line_indent, line_head)
  ) {
    token = EMPTY_PROPERTIES_END;
  } else if (line_head == ':' && step_boundary(l, s->flow)) {
    if (s->flow || !line || !valid[BLOCK_PROPERTIES_END])
      token = EMPTY_PROPERTIES_END;
  } else if (line_head == '&' || line_head == '!') {
    token = PROPERTY_CONTINUE;
    if (line && !s->flow && classify_block_node(l) == MAPPING_START)
      token = content_end;
  }
  if (token == PROPERTY_CONTINUE && !s->separated && !cursor_characters(l))
    return false;
  s->properties_ready = token == content_end;
  return emit(l, valid, token);
}

static bool scan(Scanner *s, TSLexer *l, const bool *valid) {
  if (valid[ERROR_SENTINEL]) return false;
  l->mark_end(l);
  if (s->mode == NORMAL && valid[EMPTY_PROPERTIES_END])
    return scan_property_tail(s, l, valid);
  bool boundary_mode = s->mode == NORMAL ||
    s->mode == PLAIN ||
    s->mode == SINGLE ||
    s->mode == DOUBLE ||
    s->mode == BLOCK_BODY;
  if (
    boundary_mode &&
    !s->boundary_checked &&
    l->get_column(l) == 0 &&
    check_boundary(s, l, valid)
  )
    return true;
  if (s->boundary) s->properties_ready = false;
  bool property_pending = s->properties_ready &&
    (valid[PROPERTY_CONTENT_START] || valid[BLOCK_PROPERTY_CONTENT_START]);
  if (
    boundary_mode &&
    s->boundary &&
    !(s->mode == NORMAL &&
      (key_end_valid(valid) || key_colon_pending(s, valid)))
  ) {
    if (scan_boundary(s, l, valid)) return true;
    if (
      s->flow ||
      s->mode == SINGLE ||
      s->mode == DOUBLE ||
      (s->boundary == DIRECTIVE_LINE && s->explicit_document_required) ||
      (s->boundary != DIRECTIVE_LINE && s->boundary != STREAM_BOM)
    )
      return false;
  }
  switch ((enum Mode)s->mode) {
    case NORMAL:
      break;
    case PLAIN:
      return scan_plain(s, l, valid);
    case SINGLE:
    case DOUBLE:
      return scan_quote(s, l, valid);
    case COMMENT_BEGIN:
    case COMMENT:
      return scan_comment(s, l, valid);
    case COMPACT_PREFIX:
    case PREFIX:
      return scan_prefix(s, l, valid);
    case BLOCK_HEADER:
    case BLOCK_HEADER_DONE:
      return scan_block_header(s, l, valid);
    case BLOCK_DETECT:
      return detect_block_indent(s, l, valid);
    case BLOCK_BODY:
      return scan_block_body(s, l, valid);
    case BLOCK_LINE:
    case BLOCK_LINE_DONE:
      return scan_block_line(s, l, valid);
    case ANCHOR_BODY:
    case ALIAS_BODY:
      return scan_name(s, l, valid);
    case HANDLE_SELECT:
    case HANDLE_BODY:
      return scan_handle(s, l, valid);
    case URI_BEGIN:
    case VERBATIM_CLOSE:
    case SUFFIX_BEGIN:
      return scan_tag_boundary(s, l, valid);
    case URI_BODY:
    case SUFFIX_BODY:
    case PREFIX_BODY:
      return scan_uri(s, l, valid);
    case DIRECTIVE_NAME_BODY:
    case DIRECTIVE_VERSION:
    case DIRECTIVE_HANDLE:
    case DIRECTIVE_PREFIX:
    case DIRECTIVE_PARAMETERS:
      return scan_directive(s, l, valid);
    case VERSION_BODY:
    case PARAMETER_BODY:
      return scan_directive_word(s, l, valid);
    default:
      return false;
  }
  return scan_normal(s, l, valid, property_pending);
}

static bool layout_token(TSSymbol token) {
  switch (token) {
    case LINE_BREAK:
    case SEPARATION:
    case COMMENT_START:
    case COMMENT_MARKER:
    case COMMENT_TEXT:
    case COMMENT_END:
    case LINE_PREFIX_START:
    case LINE_PREFIX_END:
    case INDENTATION:
    case BYTE_ORDER_MARK:
    case LINE_CONTEXT:
    case BOUNDARY_CHECK:
      return true;
    default:
      return false;
  }
}
static void reset_scanner(Scanner *s) {
  memset(s, 0, sizeof(*s));
  s->indent = -1;
  s->block_indent = -1;
  s->line = true;
  s->separated = true;
}
static void write_integer(char **cursor, uint64_t value, unsigned width) {
  for (unsigned i = 0; i < width; i++) {
    *(*cursor)++ = (char)value;
    value >>= 8;
  }
}
static uint64_t read_integer(const char **cursor, unsigned width) {
  uint64_t value = 0;
  for (unsigned i = 0; i < width; i++)
    value |= (uint64_t)(uint8_t)*(*cursor)++ << (i * 8);
  return value;
}

void *tree_sitter_yaml_external_scanner_create(void) {
  Scanner *s = ts_calloc(1, sizeof(Scanner));
  if (s) reset_scanner(s);
  return s;
}
void tree_sitter_yaml_external_scanner_destroy(void *payload) {
  ts_free(payload);
}
unsigned
tree_sitter_yaml_external_scanner_serialize(void *payload, char *buffer) {
  if (!payload) return 0;
  const Scanner *s = payload;
  char *cursor = buffer + SCANNER_MIN_STATE_BYTES;
  uint64_t flags = 0;
#define WRITE_FLAG(name) flags |= (uint64_t)s->name << FLAG_##name;
  SCANNER_FLAGS(WRITE_FLAG)
#undef WRITE_FLAG
#define WRITE_FIELD(type, name, width, bias) \
  { \
    uint64_t value = \
      ((uint64_t)s->name + bias) & (UINT64_MAX >> ((8 - width) * 8)); \
    buffer[SCANNER_FLAG_BYTES + FIELD_##name] = (char)value; \
    if (width > 1 && value >> 8) { \
      flags |= UINT64_C(1) << (SCANNER_FLAG_COUNT + FIELD_##name); \
      write_integer(&cursor, value >> 8, width - 1); \
    } \
  }
  SCANNER_FIELDS(WRITE_FIELD)
#undef WRITE_FIELD
  char *header = buffer;
  write_integer(&header, flags, SCANNER_FLAG_BYTES);
  unsigned words = IMPLICIT_KEY_WORDS;
  while (words && !s->implicit_keys[words - 1]) words--;
  unsigned key_bytes =
    words * 8 < SCANNER_KEY_BYTES ? words * 8 : SCANNER_KEY_BYTES;
  while (
    key_bytes &&
    !(uint8_t)(s->implicit_keys[(key_bytes - 1) / 8] >>
      (((key_bytes - 1) % 8) * 8))
  )
    key_bytes--;
  for (unsigned i = 0; i < key_bytes; i++)
    *cursor++ = (char)(s->implicit_keys[i / 8] >> ((i % 8) * 8));
  return (unsigned)(cursor - buffer);
}
void tree_sitter_yaml_external_scanner_deserialize(
  void *payload,
  const char *buffer,
  unsigned length
) {
  if (!payload) return;
  Scanner *s = payload;
  reset_scanner(s);
  if (
    length < SCANNER_MIN_STATE_BYTES ||
    length > TREE_SITTER_SERIALIZATION_BUFFER_SIZE
  )
    return;
  const char *cursor = buffer;
  uint64_t flags = read_integer(&cursor, SCANNER_FLAG_BYTES);
#define READ_FLAG(name) s->name = (flags >> FLAG_##name) & 1;
  SCANNER_FLAGS(READ_FLAG)
#undef READ_FLAG
#define READ_FIELD(type, name, width, bias) \
  s->name = (type)((uint64_t)(uint8_t)*cursor++ - bias);
  SCANNER_FIELDS(READ_FIELD)
#undef READ_FIELD
  if (flags >> SCANNER_FLAG_COUNT) {
#define READ_HIGH_BYTES(type, name, width, bias) \
  if ( \
    width > 1 && \
    (flags & (UINT64_C(1) << (SCANNER_FLAG_COUNT + FIELD_##name))) \
  ) { \
    if ((unsigned)(buffer + length - cursor) < width - 1) goto invalid; \
    uint64_t value = (uint8_t)buffer[SCANNER_FLAG_BYTES + FIELD_##name] | \
      (read_integer(&cursor, width - 1) << 8); \
    s->name = (type)(value - bias); \
  }
    SCANNER_FIELDS(READ_HIGH_BYTES)
#undef READ_HIGH_BYTES
  }
  unsigned state_bytes = (unsigned)(cursor - buffer);
  if (length < state_bytes || length > state_bytes + SCANNER_KEY_BYTES)
    goto invalid;
  for (unsigned i = 0; i < length - state_bytes; i++)
    s->implicit_keys[i / 8] |= (uint64_t)(uint8_t)*cursor++ << ((i % 8) * 8);
  return;
invalid:
  reset_scanner(s);
}
#undef SCANNER_FIELDS
#undef SCANNER_FLAGS

bool tree_sitter_yaml_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid
) {
  if (!payload) return false;
  Scanner next;
  memcpy(&next, payload, sizeof(next));
  Cursor cursor = {
    .lexer =
      {.lookahead = lexer->lookahead,
        .advance = cursor_advance,
        .mark_end = cursor_mark,
        .get_column = cursor_column,
        .eof = cursor_eof},
    .source = lexer,
    .column = next.column,
    .marked_column = next.column,
    .separated = next.separated,
    .marked_separation = next.separated
  };
  if (!scan(&next, &cursor.lexer, valid) || cursor.allocation_failed)
    return false;
  /* Look ahead through flow layout and the next codepoint for edit invalidation. */
  if (
    next.flow &&
    next.mode == NORMAL &&
    !layout_token(cursor.lexer.result_symbol) &&
    (cursor.separated || cursor.characters == cursor.marked_characters)
  )
    skip_layout(&cursor.lexer);
  if (!cursor.lexer.eof(&cursor.lexer)) step(&cursor.lexer);
  next.column = cursor.marked_column;
  next.separated = cursor.marked_separation;
  if (cursor.marked_characters) {
    next.block_kind = 0;
    advance_keys(&next, cursor.marked_characters, cursor.marked_broken);
    next.boundary = 0;
    next.boundary_checked = false;
    if (!layout_token(cursor.lexer.result_symbol)) {
      next.line = false;
      next.layout_only = false;
    }
  }
  lexer->result_symbol = cursor.lexer.result_symbol;
  memcpy(payload, &next, sizeof(next));
  return true;
}
