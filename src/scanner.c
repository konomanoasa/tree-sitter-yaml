#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"
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
  OUTDENT,
  RESTORE_INDENT,
  MAPPING_START,
  MAPPING_END,
  MAPPING_IN_MAPPING_END,
  MAPPING_IN_SEQUENCE_END,
  SHARED_INDENT_MAPPING_END,
  PAIR_START,
  SEQUENCE_START,
  SEQUENCE_END,
  SEQUENCE_IN_MAPPING_END,
  SEQUENCE_IN_SEQUENCE_END,
  SHARED_INDENT_SEQUENCE_END,
  ENTRY_START,
  BLOCK_OUT_VALUE_START,
  BLOCK_IN_VALUE_START,
  EMPTY_BLOCK_NODE,
  EXPLICIT_VALUE_START,
  INVALID_COMPACT_START,
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
  INVALID_KEY_END,
  UNFINISHED_INVALID_KEY_END,
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
  DOCUMENT_CONTENT_END,
  DOCUMENT_COMPACT_START,
  UNEXPECTED_DOCUMENT_CONTENT_START,
  UNEXPECTED_COLLECTION_CONTENT_START,
  COLLECTION_CONTENT_END,
  PROPERTIES_START,
  PROPERTIES_END,
  BLOCK_PROPERTIES_END,
  EMPTY_PROPERTIES_END,
  PROPERTY_CONTINUE,
  PROPERTY_CONTENT_START,
  BLOCK_PROPERTY_CONTENT_START,
  BLOCK_KEY_CONTENT_START,
  DUPLICATE_ANCHOR_START,
  DUPLICATE_TAG_START,
  PROPERTY_ALIAS_START,
  PROPERTY_COMPACT_START,
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
  YAML_VERSION,
  TAG_PREFIX_START,
  TAG_PREFIX_END,
  DIRECTIVE_PARAMETER,
  UNFINISHED_UNEXPECTED_DOCUMENT_CONTENT_START,
  UNFINISHED_UNEXPECTED_COLLECTION_CONTENT_START,
  UNFINISHED_INVALID_DOCUMENT_COLLECTION_START,
  UNFINISHED_DUPLICATE_ANCHOR_START,
  UNFINISHED_DUPLICATE_TAG_START,
  UNFINISHED_PROPERTIES_ON_ALIAS_START,
  UNFINISHED_INVALID_PROPERTY_COLLECTION_START,
  UNFINISHED_INVALID_COMPACT_COLLECTION_START,
  INVALID_ENCODING,
  INVALID_CHARACTER,
  INVALID_ESCAPE,
  INCOMPLETE_ESCAPE,
  INVALID_LINE_CONTINUATION,
  INVALID_SCALAR_START,
  INCOMPLETE_SCALAR_START,
  MISSING_FLOW_SEPARATOR,
  UNEXPECTED_FLOW_SEPARATOR,
  INVALID_INDENTATION,
  TAB_IN_INDENTATION,
  MISSING_INDENTATION,
  MISSING_SEPARATION,
  INVALID_BLOCK_HEADER,
  INVALID_TAG_HANDLE,
  INVALID_TAG_CHARACTER,
  INVALID_TAG_PREFIX_START,
  INVALID_URI_ESCAPE,
  INCOMPLETE_URI_ESCAPE,
  INVALID_YAML_VERSION,
  UNFINISHED_YAML_VERSION,
  UNEXPECTED_DIRECTIVE_PARAMETER,
  UNEXPECTED_DOCUMENT_END_CONTENT,
  INVALID_HEADER_INDENTATION,
  INVALID_HEADER_CHOMPING,
  MISSING_DOCUMENT_END,
  MISSING_QUOTE_CLOSE,
  INCOMPLETE_QUOTE_CLOSE,
  MISSING_FLOW_SEQUENCE_CLOSE,
  INCOMPLETE_FLOW_SEQUENCE_CLOSE,
  MISSING_FLOW_MAPPING_CLOSE,
  INCOMPLETE_FLOW_MAPPING_CLOSE,
  MISSING_VALUE_INDICATOR,
  INCOMPLETE_VALUE_INDICATOR,
  MISSING_ANCHOR_NAME,
  INCOMPLETE_ANCHOR_NAME,
  MISSING_ALIAS_NAME,
  INCOMPLETE_ALIAS_NAME,
  MISSING_TAG_URI,
  INCOMPLETE_TAG_URI,
  MISSING_TAG_SUFFIX,
  INCOMPLETE_TAG_SUFFIX,
  MISSING_VERBATIM_TAG_CLOSE,
  INCOMPLETE_VERBATIM_TAG_CLOSE,
  MISSING_DIRECTIVE_NAME,
  INCOMPLETE_DIRECTIVE_NAME,
  MISSING_YAML_VERSION,
  INCOMPLETE_YAML_VERSION,
  MISSING_TAG_HANDLE,
  INCOMPLETE_TAG_HANDLE,
  MISSING_TAG_HANDLE_CLOSE,
  INCOMPLETE_TAG_HANDLE_CLOSE,
  MISSING_TAG_PREFIX,
  INCOMPLETE_TAG_PREFIX,
  MISSING_DOCUMENT_START,
  INCOMPLETE_DOCUMENT_START,
  UNFINISHED_INVALID_INDENTATION,
  UNFINISHED_TAB_IN_INDENTATION,
  UNFINISHED_MISSING_INDENTATION,
  UNFINISHED_MISSING_FLOW_SEPARATOR,
  UNDECODABLE_ESCAPE_PREFIX,
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
  DIRECTIVE_HANDLE,
  DIRECTIVE_PREFIX,
  DIRECTIVE_PARAMETERS
};
enum HandleForm { PRIMARY_HANDLE = 1, SECONDARY_HANDLE, NAMED_HANDLE };
enum PropertyKey { ANCHOR_KEY = 1, TAG_KEY = 2 };
enum KeyState { KEY_NONE, KEY_ENDED, BLOCK_KEY_ENDED };
enum PrefixIssue { PREFIX_INDENTATION = 1, PREFIX_TAB = 2 };
enum DirectiveKind { YAML_DIRECTIVE = 1, TAG_DIRECTIVE, RESERVED_DIRECTIVE };
enum Boundary {
  NO_BOUNDARY,
  DOCUMENT_START_LINE,
  DOCUMENT_END_LINE,
  DIRECTIVE_LINE,
  STREAM_BOM
};
#define SCANNER_FIELDS(F) \
  F(int64_t, indent, 8, 1) \
  F(uint32_t, flow, 4, 0) \
  F(uint8_t, mode, 1, 0) \
  F(bool, line, 1, 0) \
  F(uint32_t, column, 4, 0) \
  F(bool, prefix, 1, 0) \
  F(bool, first, 1, 0) \
  F(bool, json, 1, 0) \
  F(bool, continuation, 1, 0) \
  F(bool, quote_line_empty, 1, 0) \
  F(uint32_t, line_indent, 4, 0) \
  F(bool, tab_invalid, 1, 0) \
  F(bool, prefix_tab, 1, 0) \
  F(bool, indent_checked, 1, 0) \
  F(bool, line_prefixed, 1, 0) \
  F(bool, scalar_indent, 1, 0) \
  F(int32_t, line_head, 4, 0) \
  F(bool, line_context, 1, 0) \
  F(bool, layout_only, 1, 0) \
  F(bool, line_mapping_key, 1, 0) \
  F(bool, prefix_invalid, 1, 0) \
  F(bool, separated, 1, 0) \
  F(uint8_t, key_state, 1, 0) \
  F(bool, first_pair, 1, 0) \
  F(int64_t, block_indent, 8, 1) \
  F(bool, block_explicit_indent, 1, 0) \
  F(bool, header_separated, 1, 0) \
  F(uint8_t, return_mode, 1, 0) \
  F(bool, block_leading, 1, 0) \
  F(bool, block_empty, 1, 0) \
  F(bool, block_prefix, 1, 0) \
  F(uint32_t, block_layout_lines, 4, 0) \
  F(bool, block_marker_eof, 1, 0) \
  F(uint8_t, boundary, 1, 0) \
  F(bool, boundary_checked, 1, 0) \
  F(uint8_t, boundary_pending, 1, 0) \
  F(bool, document_started, 1, 0) \
  F(bool, document_start_line, 1, 0) \
  F(bool, document_content, 1, 0) \
  F(bool, after_document_end, 1, 0) \
  F(bool, block_out, 1, 0) \
  F(uint8_t, handle_form, 1, 0) \
  F(bool, properties_ready, 1, 0) \
  F(bool, property_separation_notified, 1, 0) \
  F(uint8_t, property_keys, 1, 0) \
  F(uint8_t, directive_kind, 1, 0) \
  F(bool, directive_handle, 1, 0) \
  F(bool, value_separation, 1, 0) \
  F(uint32_t, scalar_spaces, 4, 0) \
  F(bool, scalar_tab, 1, 0) \
  F(bool, explicit_document_required, 1, 0) \
  F(bool, eof_continuation, 1, 0) \
  F(bool, block_eof, 1, 0) \
  F(uint8_t, prefix_eof, 1, 0) \
  F(int64_t, provisional_indent, 8, 2) \
  F(uint8_t, block_kind, 1, 0)

#define FIELD_BYTES(type, name, width, bias) +width
enum {
  IMPLICIT_KEY_LIMIT = 1024,
  IMPLICIT_KEY_WORDS = IMPLICIT_KEY_LIMIT / 64 + 1,
  SCANNER_STATE_BYTES = 0 SCANNER_FIELDS(FIELD_BYTES),
  SCANNER_KEY_BYTES = IMPLICIT_KEY_LIMIT / 8 + 1
};
#undef FIELD_BYTES

#define DECLARE_FIELD(type, name, width, bias) type name;
typedef struct {
  SCANNER_FIELDS(DECLARE_FIELD)
  uint64_t implicit_keys[IMPLICIT_KEY_WORDS];
} Scanner;
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
static bool colon_boundary(TSLexer *l, bool flow) {
  return l->eof(l) ||
    space(l->lookahead) ||
    (flow && flow_indicator(l->lookahead));
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

static bool indicator_line(const Scanner *s, int32_t indicator) {
  return s->line && s->line_indent == s->indent && s->line_head == indicator;
}
static bool eof_pending(const Scanner *s) {
  return s->eof_continuation || s->boundary_pending;
}
static bool
block_value_follows(const Scanner *s, const TSLexer *l, const bool *valid) {
  if (l->eof(l)) return false;
  if (valid[EXPLICIT_VALUE_START] && indicator_line(s, ':')) return true;
  return (valid[BLOCK_OUT_VALUE_START] || valid[BLOCK_IN_VALUE_START]) &&
    (!s->line ||
      s->line_indent > s->indent ||
      (valid[BLOCK_OUT_VALUE_START] && indicator_line(s, '-')));
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
static bool emit_missing(
  TSLexer *l,
  const bool *valid,
  enum Token missing,
  enum Token incomplete
) {
  return emit(l, valid, l->eof(l) ? incomplete : missing);
}
static bool scan_separation(TSLexer *l, const bool *valid) {
  step(l);
  skip_blanks(l);
  return finish(l, valid, SEPARATION);
}
static bool separation_missing(const Scanner *s) {
  return !s->separated && !s->property_separation_notified;
}
static bool emit_missing_separation(Scanner *s, TSLexer *l, const bool *valid) {
  s->property_separation_notified = true;
  return emit(l, valid, MISSING_SEPARATION);
}
static void skip_line_break(TSLexer *l) {
  int32_t first = l->lookahead;
  step(l);
  if (first == '\r' && l->lookahead == '\n') step(l);
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
  s->line_mapping_key = false;
  s->prefix_invalid = false;
  s->after_document_end = false;
}
/* Comment edits must invalidate preceding node reductions. */
static bool start_comment(
  Scanner *s,
  TSLexer *l,
  const bool *valid,
  enum Mode return_mode,
  bool missing_separation
) {
  if (!valid[COMMENT_START]) return false;
  skip_line(l);
  s->mode = COMMENT_BEGIN;
  s->return_mode = (uint8_t)return_mode;
  s->first = missing_separation;
  return emit(l, valid, COMMENT_START);
}
static bool
close_flow(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  s->flow--;
  s->json = s->flow > 0;
  s->line = false;
  return token == FLOW_SEQUENCE_CLOSE || token == FLOW_MAPPING_CLOSE
    ? take(l, valid, token)
    : emit(l, valid, token);
}
static bool
emit_structure(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  switch (token) {
    case MISSING_FLOW_SEQUENCE_CLOSE:
    case MISSING_FLOW_MAPPING_CLOSE:
    case INCOMPLETE_FLOW_SEQUENCE_CLOSE:
    case INCOMPLETE_FLOW_MAPPING_CLOSE:
      return close_flow(s, l, valid, token);
    case DEDENT:
    case OUTDENT:
      s->indent--;
      if (s->indent <= s->provisional_indent) s->provisional_indent = -2;
      break;
    case RESTORE_INDENT:
    case INDENT:
      s->indent++;
      break;
    default:
      break;
  }
  return emit(l, valid, token);
}
static bool emit_first(
  Scanner *s,
  TSLexer *l,
  const bool *valid,
  const enum Token *tokens,
  size_t count
) {
  for (size_t i = 0; i < count; i++)
    if (valid[tokens[i]]) return emit_structure(s, l, valid, tokens[i]);
  return false;
}
static bool end_collection(Scanner *s, TSLexer *l, const bool *valid) {
  static const enum Token endings[] = {
    MAPPING_END,
    MAPPING_IN_MAPPING_END,
    MAPPING_IN_SEQUENCE_END,
    SHARED_INDENT_MAPPING_END,
    SEQUENCE_END,
    SEQUENCE_IN_MAPPING_END,
    SEQUENCE_IN_SEQUENCE_END,
    SHARED_INDENT_SEQUENCE_END
  };
  return emit_first(s, l, valid, endings, COUNT(endings));
}
static bool
any_valid(const bool *valid, const enum Token *tokens, size_t count) {
  for (size_t i = 0; i < count; i++)
    if (valid[tokens[i]]) return true;
  return false;
}
static bool start_plain(Scanner *s, TSLexer *l, const bool *valid) {
  if (!valid[PLAIN_START]) return false;
  s->eof_continuation = false;
  s->mode = PLAIN;
  s->first = true;
  s->json = false;
  return emit(l, valid, PLAIN_START);
}
static bool scan_invalid_character(TSLexer *l, const bool *valid, bool quoted) {
  bool (*invalid)(int32_t) = quoted ? invalid_quoted : invalid_unquoted;
  if (l->eof(l) || !invalid(l->lookahead)) return false;
  bool undecodable = invalid_encoding(l->lookahead);
  enum Token token = undecodable ? INVALID_ENCODING : INVALID_CHARACTER;
  if (!valid[token]) return false;
  do {
    step(l);
  } while (
    !l->eof(l) &&
    invalid(l->lookahead) &&
    invalid_encoding(l->lookahead) == undecodable
  );
  return finish(l, valid, token);
}

static bool scan_line_text(TSLexer *l, const bool *valid, enum Token token) {
  if (scan_invalid_character(l, valid, false)) return true;
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
/* After document_marker(), EOF may leave a partial "---" or "...". */
static bool partial_marker(const TSLexer *l, int32_t first) {
  return (first == '-' || first == '.') && l->eof(l);
}
static enum Boundary line_boundary(const Scanner *s, TSLexer *l) {
  if (l->lookahead == '-' || l->lookahead == '.') return document_marker(l);
  if (s->flow || (s->mode != NORMAL && s->mode != BLOCK_BODY))
    return NO_BOUNDARY;
  if (l->lookahead == '%')
    return s->mode == NORMAL ? DIRECTIVE_LINE : NO_BOUNDARY;
  return l->lookahead == 0xfeff ? STREAM_BOM : NO_BOUNDARY;
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
static bool block_key_colon(const Scanner *s, TSLexer *l) {
  return l->lookahead == ':' && (!s->line || l->get_column(l) == s->indent);
}
static bool scan_key_end(Scanner *s, TSLexer *l, const bool *valid) {
  if (!s->line && blank(l->lookahead)) return scan_separation(l, valid);
  unsigned age = end_key(s);
  if (s->flow) skip_layout(l);
  bool key_invalid =
    cursor_broken(l) || age + cursor_characters(l) > IMPLICIT_KEY_LIMIT;
  bool colon_eof = false;
  if (valid[FLOW_NODE_END]) {
    bool colon = l->lookahead == ':';
    if (colon) {
      step(l);
      colon_eof = !s->json && l->eof(l);
      colon = s->json || colon_boundary(l, true);
    }
    if (!colon) return emit(l, valid, FLOW_NODE_END);
  } else if (key_invalid && !s->flow && block_key_colon(s, l)) {
    step(l);
    colon_eof = s->first_pair && l->eof(l);
  }
  if (!s->flow) {
    s->key_state = s->line ? BLOCK_KEY_ENDED : KEY_ENDED;
    s->first_pair = false;
  }
  if (key_invalid && colon_eof)
    return emit(l, valid, UNFINISHED_INVALID_KEY_END);
  return emit(l, valid, key_invalid ? INVALID_KEY_END : KEY_END);
}

static void skip_property_or_alias(TSLexer *l) {
  bool tag = l->lookahead == '!';
  step(l);
  if (tag && l->lookahead == '<') {
    step(l);
    while (!l->eof(l) && !space(l->lookahead) && l->lookahead != '>') step(l);
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
static bool pop_flow(FlowStack *flows, int32_t closing) {
  while (flows->depth && flows->closings[flows->depth - 1] != closing)
    flows->depth--;
  if (!flows->depth) return false;
  flows->depth--;
  return true;
}

static bool key_colon_follows(
  TSLexer *l,
  enum Token content,
  bool adjacent,
  bool *unfinished
) {
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
        adjacent = true;
        if (!flows.depth) complete = true;
        separated = false;
        if (c == '\'') continue;
      }
    } else if (structured && !plain && (c == '\'' || c == '"')) quote = c;
    else if (flows.depth && !plain && (c == '&' || c == '*' || c == '!')) {
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
      plain = false;
      adjacent = false;
    } else if ((c == ']' || c == '}') && flows.depth) {
      if (!pop_flow(&flows, c)) break;
      plain = false;
      adjacent = true;
      if (!flows.depth) complete = true;
    } else if (flows.depth && c == ',') {
      plain = false;
      adjacent = false;
    } else if (c == ':') {
      step(l);
      bool indicator = colon_boundary(l, flows.depth > 0);
      if (!flows.depth && indicator) {
        colon = true;
        if (unfinished) *unfinished = l->eof(l);
        break;
      }
      if (!flows.depth && complete) break;
      plain = !indicator && !adjacent;
      adjacent = false;
      separated = false;
      continue;
    } else if (flows.depth && !plain && c == '?') {
      step(l);
      plain = !space(l->lookahead) && !l->eof(l);
      adjacent = false;
      separated = false;
      continue;
    } else if (!space(c)) {
      plain = true;
      adjacent = false;
    }
    separated = space(c);
    step(l);
  }
  if (flows.closings != flows.initial) ts_free(flows.closings);
  return colon;
}

static enum Token classify_block_node(TSLexer *l, bool *unfinished) {
  if (unfinished) *unfinished = false;
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
  if (first == '-' || first == '?') {
    step(l);
    if (space(l->lookahead) || l->eof(l)) {
      if (unfinished) *unfinished = l->eof(l);
      return properties ? PROPERTIES_START
        : first == '-'  ? SEQUENCE_START
                        : MAPPING_START;
    }
  }
  if (key_colon_follows(l, content, attached, unfinished)) return MAPPING_START;
  return properties ? PROPERTIES_START : content;
}

static enum Token classify_block_start(Scanner *s, TSLexer *l) {
  if (!s->block_kind)
    s->block_kind = (uint8_t)(classify_block_node(l, &s->block_eof) + 1);
  return (enum Token)(s->block_kind - 1);
}

static enum Token
property_content_start(Scanner *s, TSLexer *l, const bool *valid) {
  if (l->lookahead == '*' && !(s->line && s->line_mapping_key)) {
    if (s->line && !s->flow) {
      skip_property_or_alias(l);
      skip_blanks(l);
      if (l->eof(l)) return UNFINISHED_PROPERTIES_ON_ALIAS_START;
    }
    return PROPERTY_ALIAS_START;
  }
  if (!s->flow) {
    enum Token kind = classify_block_start(s, l);
    if (
      s->line &&
      valid[BLOCK_KEY_CONTENT_START] &&
      (block_collection(kind) || kind == LITERAL_START || kind == FOLDED_START)
    )
      return BLOCK_KEY_CONTENT_START;
    if (
      !s->line &&
      valid[PROPERTY_COMPACT_START] &&
      (kind == SEQUENCE_START ||
        (kind == MAPPING_START && valid[BLOCK_PROPERTY_CONTENT_START]))
    )
      return s->block_eof ? UNFINISHED_INVALID_PROPERTY_COLLECTION_START
                          : PROPERTY_COMPACT_START;
  }
  return valid[BLOCK_PROPERTY_CONTENT_START] ? BLOCK_PROPERTY_CONTENT_START
                                             : PROPERTY_CONTENT_START;
}

static bool
emit_indicator(Scanner *s, TSLexer *l, const bool *valid, enum Token token) {
  l->mark_end(l);
  if (!s->flow && blank(l->lookahead)) {
    skip_blanks(l);
    if (!layout_follows(l)) {
      bool unfinished;
      enum Token kind = classify_block_node(l, &unfinished);
      if (block_collection(kind)) {
        s->prefix_eof = unfinished ? PREFIX_TAB : 0;
        s->mode = COMPACT_PREFIX;
      }
    }
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
    if (s->first) {
      s->first = false;
      return anchor
        ? emit_missing(l, valid, MISSING_ANCHOR_NAME, INCOMPLETE_ANCHOR_NAME)
        : emit_missing(l, valid, MISSING_ALIAS_NAME, INCOMPLETE_ALIAS_NAME);
    }
    s->mode = NORMAL;
    return emit(l, valid, NAME_END);
  }
  s->first = false;
  if (scan_invalid_character(l, valid, false)) return true;
  do {
    step(l);
  } while (!name_boundary(l) && !invalid_unquoted(l->lookahead));
  return finish(l, valid, anchor ? ANCHOR_NAME : ALIAS_NAME);
}

/* Clear handle state before reuse compares later tokens. */
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
  if (s->directive_handle && (l->eof(l) || space(l->lookahead))) {
    end_handle(s);
    return emit_missing(
      l,
      valid,
      MISSING_TAG_HANDLE_CLOSE,
      INCOMPLETE_TAG_HANDLE_CLOSE
    );
  }
  if (l->lookahead == '!') {
    end_handle(s);
    return take(l, valid, TAG_HANDLE_CLOSE);
  }
  if (scan_invalid_character(l, valid, false)) return true;
  if (!word_char(l->lookahead)) {
    do {
      step(l);
    } while (
      !l->eof(l) &&
      !space(l->lookahead) &&
      l->lookahead != '!' &&
      !invalid_unquoted(l->lookahead) &&
      !word_char(l->lookahead)
    );
    return finish(l, valid, INVALID_TAG_HANDLE);
  }
  do {
    step(l);
  } while (word_char(l->lookahead));
  return finish(l, valid, TAG_HANDLE_NAME);
}

static bool scan_tag_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == URI_BEGIN) {
    s->mode = URI_BODY;
    if (l->eof(l) || space(l->lookahead) || l->lookahead == '>') {
      s->mode = VERBATIM_CLOSE;
      return emit_missing(l, valid, MISSING_TAG_URI, INCOMPLETE_TAG_URI);
    }
    return emit(l, valid, TAG_URI_START);
  }
  if (s->mode == VERBATIM_CLOSE) {
    s->mode = NORMAL;
    if (l->lookahead == '>') return take(l, valid, VERBATIM_TAG_CLOSE);
    return emit_missing(
      l,
      valid,
      MISSING_VERBATIM_TAG_CLOSE,
      INCOMPLETE_VERBATIM_TAG_CLOSE
    );
  }
  s->mode = SUFFIX_BODY;
  if (name_boundary(l))
    return emit_missing(l, valid, MISSING_TAG_SUFFIX, INCOMPLETE_TAG_SUFFIX);
  return emit(l, valid, TAG_SUFFIX_START);
}

static bool uri_boundary(TSLexer *l, bool prefix, bool suffix) {
  return l->eof(l) ||
    space(l->lookahead) ||
    (suffix ? flow_indicator(l->lookahead) : !prefix && l->lookahead == '>');
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
  if (scan_invalid_character(l, valid, false)) return true;
  if (prefix && s->first) {
    s->first = false;
    if (flow_indicator(l->lookahead) && uri_char(l->lookahead, false))
      return take(l, valid, INVALID_TAG_PREFIX_START);
  }
  if (l->lookahead == '%') {
    step(l);
    l->mark_end(l);
    uint32_t value;
    unsigned remaining = hex_digits(l, 2, &value);
    if (remaining && invalid_encoding(l->lookahead))
      return emit(l, valid, UNDECODABLE_ESCAPE_PREFIX);
    return emit(
      l,
      valid,
      !remaining    ? URI_ESCAPE
        : l->eof(l) ? INCOMPLETE_URI_ESCAPE
                    : INVALID_URI_ESCAPE
    );
  }
  if (!uri_char(l->lookahead, suffix)) {
    do {
      step(l);
    } while (
      !uri_boundary(l, prefix, suffix) &&
      !invalid_unquoted(l->lookahead) &&
      l->lookahead != '%' &&
      !uri_char(l->lookahead, suffix)
    );
    return finish(l, valid, INVALID_TAG_CHARACTER);
  }
  do {
    step(l);
  } while (uri_char(l->lookahead, suffix));
  return finish(l, valid, suffix ? TAG_SUFFIX_TEXT : URI_TEXT);
}

static bool directive_boundary(TSLexer *l) {
  return l->eof(l) || space(l->lookahead) || invalid_unquoted(l->lookahead);
}
static bool
scan_directive_word(TSLexer *l, const bool *valid, enum Token token) {
  do {
    step(l);
  } while (!directive_boundary(l));
  return finish(l, valid, token);
}
static bool start_directive(Scanner *s, TSLexer *l, const bool *valid) {
  char name[5] = {0};
  unsigned length = 0;
  step(l);
  while (!directive_boundary(l)) {
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
  if (l->eof(l) || space(l->lookahead)) {
    if (s->first) {
      s->first = false;
      return emit_missing(
        l,
        valid,
        MISSING_DIRECTIVE_NAME,
        INCOMPLETE_DIRECTIVE_NAME
      );
    }
    s->mode = s->directive_kind == YAML_DIRECTIVE ? DIRECTIVE_VERSION
      : s->directive_kind == TAG_DIRECTIVE        ? DIRECTIVE_HANDLE
                                                  : DIRECTIVE_PARAMETERS;
    return emit(l, valid, DIRECTIVE_NAME_END);
  }
  s->first = false;
  if (scan_invalid_character(l, valid, false)) return true;
  return scan_directive_word(l, valid, DIRECTIVE_NAME);
}
static bool
scan_yaml_version(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (scan_invalid_character(l, valid, false)) return true;
  s->mode = DIRECTIVE_PARAMETERS;
  if (end)
    return emit_missing(
      l,
      valid,
      MISSING_YAML_VERSION,
      INCOMPLETE_YAML_VERSION
    );
  unsigned part = 0;
  bool correct = true;
  do {
    int32_t c = l->lookahead;
    if (c >= '0' && c <= '9') {
      if (part == 0 || part == 2) part++;
    } else if (c == '.' && part == 1) part = 2;
    else correct = false;
    step(l);
  } while (!directive_boundary(l));
  return finish(
    l,
    valid,
    correct && part == 3     ? YAML_VERSION
      : correct && l->eof(l) ? UNFINISHED_YAML_VERSION
                             : INVALID_YAML_VERSION
  );
}
static bool
scan_directive_handle(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (scan_invalid_character(l, valid, false)) return true;
  s->mode = DIRECTIVE_PREFIX;
  s->property_separation_notified = false;
  if (end)
    return emit_missing(l, valid, MISSING_TAG_HANDLE, INCOMPLETE_TAG_HANDLE);
  if (l->lookahead == '!') {
    step(l);
    s->handle_form = l->lookahead == '!' ? SECONDARY_HANDLE
      : directive_boundary(l)            ? PRIMARY_HANDLE
                                         : NAMED_HANDLE;
    s->directive_handle = true;
    s->mode = HANDLE_SELECT;
    return emit(l, valid, TAG_HANDLE_START);
  }
  return scan_directive_word(l, valid, INVALID_TAG_HANDLE);
}
static bool
scan_directive_prefix(Scanner *s, TSLexer *l, const bool *valid, bool end) {
  if (end) {
    s->mode = DIRECTIVE_PARAMETERS;
    return emit_missing(l, valid, MISSING_TAG_PREFIX, INCOMPLETE_TAG_PREFIX);
  }
  if (separation_missing(s)) return emit_missing_separation(s, l, valid);
  s->mode = PREFIX_BODY;
  s->first = true;
  s->property_separation_notified = false;
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
  if (scan_invalid_character(l, valid, false)) return true;
  return scan_directive_word(
    l,
    valid,
    s->directive_kind == RESERVED_DIRECTIVE ? DIRECTIVE_PARAMETER
                                            : UNEXPECTED_DIRECTIVE_PARAMETER
  );
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
  s->block_marker_eof = false;
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
static bool provisional_indentation(const Scanner *s, uint32_t spaces) {
  return s->boundary_pending ||
    (s->provisional_indent >= -1 && spaces > s->provisional_indent);
}
static enum Token missing_indentation(const Scanner *s, uint32_t spaces) {
  return provisional_indentation(s, spaces) ? UNFINISHED_MISSING_INDENTATION
                                            : MISSING_INDENTATION;
}
static bool scalar_prefix(Scanner *s, TSLexer *l, const bool *valid) {
  if (l->lookahead == '\t' && s->scalar_spaces <= s->indent) {
    s->scalar_tab = true;
    do {
      step(l);
    } while (l->lookahead == '\t');
    return finish(
      l,
      valid,
      provisional_indentation(s, s->scalar_spaces) || s->block_marker_eof
        ? UNFINISHED_TAB_IN_INDENTATION
        : TAB_IN_INDENTATION
    );
  }
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
    return emit(
      l,
      valid,
      s->quote_line_empty ? INVALID_LINE_CONTINUATION : ESCAPE_INDICATOR
    );
  if (l->eof(l)) return emit(l, valid, INCOMPLETE_ESCAPE);
  if (invalid_quoted(l->lookahead))
    return emit(
      l,
      valid,
      invalid_encoding(l->lookahead) ? UNDECODABLE_ESCAPE_PREFIX
                                     : INVALID_ESCAPE
    );
  int32_t c = l->lookahead;
  bool ok = c > 0 && c < 128 && strchr("0abtnvfre \t\"/\\N_LP", (int)c);
  unsigned digits = c == 'x' ? 2 : c == 'u' ? 4 : c == 'U' ? 8 : 0;
  step(l);
  l->mark_end(l);
  if (digits) {
    uint32_t value;
    unsigned remaining = hex_digits(l, digits, &value);
    uint64_t lower = (uint64_t)value << (remaining * 4);
    uint64_t upper = lower | ((UINT64_C(1) << (remaining * 4)) - 1);
    ok = lower <= 0x10ffff && (lower < 0xd800 || upper > 0xdfff);
    if (remaining && ok && invalid_encoding(l->lookahead))
      return emit(l, valid, UNDECODABLE_ESCAPE_PREFIX);
    if (remaining)
      return emit(
        l,
        valid,
        l->eof(l) && ok ? INCOMPLETE_ESCAPE : INVALID_ESCAPE
      );
  }
  if (ok) s->quote_line_empty = false;
  return emit(l, valid, ok ? QUOTED_ESCAPE : INVALID_ESCAPE);
}
static bool scan_quote(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t quote = s->mode == SINGLE ? '\'' : '"';
  if (l->eof(l)) return close_quote(s, l, valid, INCOMPLETE_QUOTE_CLOSE);
  if (newline(l->lookahead)) return scalar_break(s, l, valid);
  if (s->prefix && blank(l->lookahead)) return scalar_prefix(s, l, valid);
  if (!resume_scalar_line(s))
    return emit(l, valid, missing_indentation(s, s->scalar_spaces));
  if (scan_invalid_character(l, valid, true)) return true;
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
      step(l);
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

enum PlainSpace { PLAIN_STOPS, PLAIN_SAME_LINE, PLAIN_NEXT_LINE };
static enum PlainSpace plain_space(Scanner *s, TSLexer *l) {
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
  bool more = !l->eof(l) &&
    l->lookahead != '#' &&
    (!s->flow || !flow_indicator(l->lookahead)) &&
    (!broken || s->flow || indentation > s->indent);
  if (more && l->lookahead == ':') {
    step(l);
    s->eof_continuation = l->eof(l);
    more = !colon_boundary(l, s->flow);
  }
  if (more && l->get_column(l) == 0) {
    int32_t first = l->lookahead;
    if (first == 0xfeff || document_marker(l)) more = false;
    else s->block_marker_eof = partial_marker(l, first);
  }
  return !more ? PLAIN_STOPS : broken ? PLAIN_NEXT_LINE : PLAIN_SAME_LINE;
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
      strchr(",]}@`%&*!|>", (int)l->lookahead)
    )
      return take(l, valid, INVALID_SCALAR_START);
    if (l->lookahead == '-' || l->lookahead == '?' || l->lookahead == ':') {
      step(l);
      if (colon_boundary(l, s->flow)) {
        return finish(
          l,
          valid,
          l->eof(l) ? INCOMPLETE_SCALAR_START : INVALID_SCALAR_START
        );
      }
      text = true;
    }
  }
  if (s->continuation || s->prefix) {
    if (newline(l->lookahead)) return scalar_break(s, l, valid);
    if (blank(l->lookahead)) {
      if (s->prefix) return scalar_prefix(s, l, valid);
      step(l);
      skip_blanks(l);
      return finish(l, valid, SCALAR_LINE_SUFFIX);
    }
    if (!resume_scalar_line(s))
      return emit(l, valid, missing_indentation(s, s->scalar_spaces));
  } else if (space(l->lookahead)) {
    enum PlainSpace next = plain_space(s, l);
    if (next == PLAIN_SAME_LINE) {
      text = true;
    } else if (next == PLAIN_NEXT_LINE && valid[PLAIN_CONTINUE]) {
      s->continuation = true;
      return emit(l, valid, PLAIN_CONTINUE);
    } else {
      s->eof_continuation |= l->eof(l);
      return end_plain(s, l, valid);
    }
  }
  if (!text && scan_invalid_character(l, valid, false)) return true;
  l->mark_end(l);
  while (!l->eof(l)) {
    int32_t c = l->lookahead;
    if (newline(c) || invalid_unquoted(c) || (s->flow && flow_indicator(c)))
      break;
    if (c == ':') {
      step(l);
      if (colon_boundary(l, s->flow)) {
        s->eof_continuation = l->eof(l);
        break;
      }
      text = true;
      l->mark_end(l);
      continue;
    }
    if (blank(c)) {
      step(l);
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
  if (scan_invalid_character(l, valid, false)) return true;
  if (newline(l->lookahead)) {
    s->mode = BLOCK_HEADER_DONE;
    return line_break(l, valid, BLOCK_HEADER_BREAK);
  }
  if (blank(l->lookahead)) {
    s->header_separated = true;
    return scan_separation(l, valid);
  }
  if (l->lookahead == '#' && valid[COMMENT_START])
    return start_comment(s, l, valid, BLOCK_HEADER, !s->separated);
  if (l->lookahead >= '1' && l->lookahead <= '9') {
    if (valid[INDENTATION_INDICATOR] && !s->header_separated) {
      s->block_indent = s->indent + l->lookahead - '0';
      s->block_explicit_indent = true;
      return take(l, valid, INDENTATION_INDICATOR);
    }
    return take(l, valid, INVALID_HEADER_INDENTATION);
  }
  if (l->lookahead == '+' || l->lookahead == '-')
    return take(
      l,
      valid,
      valid[CHOMPING_INDICATOR] && !s->header_separated
        ? CHOMPING_INDICATOR
        : INVALID_HEADER_CHOMPING
    );
  step(l);
  while (
    !l->eof(l) &&
    !space(l->lookahead) &&
    l->lookahead != '#' &&
    !invalid_unquoted(l->lookahead) &&
    !(l->lookahead >= '1' && l->lookahead <= '9') &&
    l->lookahead != '+' &&
    l->lookahead != '-'
  )
    step(l);
  return finish(l, valid, INVALID_BLOCK_HEADER);
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
        int32_t first = l->lookahead;
        bool content = !l->eof(l) && spaces > s->indent;
        if (content && !spaces && (first == 0xfeff || document_marker(l)))
          content = false;
        s->block_marker_eof = content && !spaces && partial_marker(l, first);
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
/* Cache layout to avoid repeated lookahead on shallow tab lines. */
static bool block_stream_layout_follows(Scanner *s, TSLexer *l) {
  uint32_t lines = 1;
  bool shallow_comment = false;
  s->block_marker_eof = false;
  for (;;) {
    skip_blanks(l);
    if (l->lookahead == '#') skip_line(l);
    if (l->eof(l)) {
      if (!shallow_comment) s->eof_continuation = true;
      return true;
    }
    if (!newline(l->lookahead)) {
      s->block_layout_lines = lines;
      if (l->get_column(l) != 0) return false;
      int32_t first = l->lookahead;
      if (first == 0xfeff || first == '%' || document_marker(l)) return true;
      s->block_marker_eof = partial_marker(l, first);
      return false;
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
  if (end) s->eof_continuation = true;
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
    if (s->block_empty && s->block_leading && l->lookahead == ' ') {
      count_spaces(l);
      return finish(
        l,
        valid,
        s->block_marker_eof ? UNFINISHED_INVALID_INDENTATION
                            : INVALID_INDENTATION
      );
    }
    if (!s->block_empty && l->get_column(l) < s->block_indent)
      return emit(
        l,
        valid,
        s->boundary_pending || (s->block_marker_eof && s->block_layout_lines)
          ? UNFINISHED_MISSING_INDENTATION
          : MISSING_INDENTATION
      );
  }
  if (newline(l->lookahead)) {
    s->mode = BLOCK_LINE_DONE;
    reset_line(s);
    return line_break(l, valid, SCALAR_LINE_BREAK);
  }
  return scan_line_text(l, valid, SCALAR_TEXT);
}

static void close_document(Scanner *s) {
  s->document_content = false;
  s->explicit_document_required = true;
}
static void open_document(Scanner *s, bool started) {
  s->document_started = started;
  s->document_start_line = false;
  s->document_content = false;
  s->eof_continuation = false;
  s->directive_kind = 0;
  s->flow = 0;
  s->indent = -1;
  s->provisional_indent = -2;
  s->block_out = false;
}

static bool check_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t first = l->lookahead;
  enum Boundary boundary = line_boundary(s, l);
  if (!boundary && first != '-' && first != '.') return false;
  s->boundary = (uint8_t)boundary;
  s->boundary_pending = l->eof(l)
    ? first == '-' ? DOCUMENT_START_LINE : DOCUMENT_END_LINE
    : NO_BOUNDARY;
  s->boundary_checked = true;
  return emit(l, valid, BOUNDARY_CHECK);
}
static bool scan_boundary(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == SINGLE || s->mode == DOUBLE) {
    end_scalar(s);
    return emit(
      l,
      valid,
      s->boundary_pending ? INCOMPLETE_QUOTE_CLOSE : MISSING_QUOTE_CLOSE
    );
  }
  if (s->mode == BLOCK_BODY) return end_block_scalar(s, l, valid);
  const enum Token closings[] = {
    EMPTY_BLOCK_NODE,
    s->boundary_pending ? INCOMPLETE_FLOW_SEQUENCE_CLOSE
                        : MISSING_FLOW_SEQUENCE_CLOSE,
    s->boundary_pending ? INCOMPLETE_FLOW_MAPPING_CLOSE
                        : MISSING_FLOW_MAPPING_CLOSE,
  };
  if (
    emit_first(s, l, valid, closings, COUNT(closings)) ||
    end_collection(s, l, valid)
  )
    return true;
  static const enum Token restorations[] = {DEDENT, RESTORE_INDENT};
  if (emit_first(s, l, valid, restorations, COUNT(restorations))) return true;
  if (valid[DOCUMENT_CLOSE] && s->document_started) {
    close_document(s);
    return emit(l, valid, DOCUMENT_CLOSE);
  }
  enum Boundary boundary = (enum Boundary)s->boundary;
  bool opens = boundary == DOCUMENT_START_LINE || boundary == DIRECTIVE_LINE;
  if (opens && valid[DOCUMENT_OPEN]) {
    open_document(s, false);
    return emit(l, valid, DOCUMENT_OPEN);
  }
  if (boundary == DIRECTIVE_LINE || boundary == STREAM_BOM) {
    if (
      boundary == DIRECTIVE_LINE &&
      s->explicit_document_required &&
      valid[MISSING_DOCUMENT_END]
    ) {
      s->explicit_document_required = false;
      return emit(l, valid, MISSING_DOCUMENT_END);
    }
    return false;
  }
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
    if (s->first) {
      s->first = false;
      return emit(l, valid, MISSING_SEPARATION);
    }
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
  s->prefix_tab = false;
  s->mode = PREFIX;
  return emit(l, valid, LINE_PREFIX_START);
}
static bool scan_prefix(Scanner *s, TSLexer *l, const bool *valid) {
  if (s->mode == COMPACT_PREFIX)
    return start_line_prefix(s, l, valid, false, true, true);
  if (l->lookahead == ' ' && !s->prefix_tab) {
    bool excess = s->prefix_invalid && l->get_column(l) >= s->indent;
    do {
      step(l);
    } while (
      l->lookahead == ' ' &&
      (excess || !s->prefix_invalid || l->get_column(l) < s->indent)
    );
    if (!excess) return finish(l, valid, INDENTATION);
    return finish(
      l,
      valid,
      s->prefix_eof & PREFIX_INDENTATION ? UNFINISHED_INVALID_INDENTATION
                                         : INVALID_INDENTATION
    );
  }
  if (blank(l->lookahead)) {
    s->prefix_tab = true;
    if (s->tab_invalid && l->lookahead == '\t') {
      do {
        step(l);
      } while (l->lookahead == '\t');
      return finish(
        l,
        valid,
        s->prefix_eof & PREFIX_TAB || provisional_indentation(s, s->line_indent)
          ? UNFINISHED_TAB_IN_INDENTATION
          : TAB_IN_INDENTATION
      );
    }
    do {
      step(l);
    } while (blank(l->lookahead) && !(s->tab_invalid && l->lookahead == '\t'));
    return finish(l, valid, SEPARATION);
  }
  if (
    !s->indent_checked &&
    s->flow &&
    !newline(l->lookahead) &&
    !l->eof(l) &&
    l->lookahead != '#' &&
    s->line_indent <= s->indent
  ) {
    s->indent_checked = true;
    return emit(l, valid, missing_indentation(s, s->line_indent));
  }
  /* Clear prefix state before reuse compares later tokens. */
  s->mode = NORMAL;
  s->tab_invalid = false;
  s->prefix_tab = false;
  s->indent_checked = false;
  s->prefix_eof = 0;
  return emit(l, valid, LINE_PREFIX_END);
}

static bool start_pair(Scanner *s, TSLexer *l, const bool *valid) {
  s->key_state = KEY_NONE;
  s->first_pair = !valid[MAPPING_END] &&
    !valid[MAPPING_IN_MAPPING_END] &&
    !valid[MAPPING_IN_SEQUENCE_END] &&
    !valid[SHARED_INDENT_MAPPING_END];
  return emit(l, valid, PAIR_START);
}
static bool
scan_node_start(Scanner *s, TSLexer *l, const bool *valid, int64_t column) {
  int32_t first = l->lookahead;
  enum Token kind = s->flow ? node_start(first) : classify_block_start(s, l);
  if (
    s->document_start_line &&
    valid[DOCUMENT_COMPACT_START] &&
    block_collection(kind)
  )
    return emit(
      l,
      valid,
      s->block_eof ? UNFINISHED_INVALID_DOCUMENT_COLLECTION_START
                   : DOCUMENT_COMPACT_START
    );
  if (
    !s->flow &&
    s->line &&
    (column == s->indent || s->prefix_invalid) &&
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
    if (s->block_eof && s->provisional_indent == -2 && column > s->indent)
      s->provisional_indent = s->indent;
    enum Token shift = column < s->indent ? OUTDENT : INDENT;
    if (column != s->indent && valid[shift])
      return emit_structure(s, l, valid, shift);
    if (column == s->indent || (s->line && s->prefix_invalid)) {
      if (kind == MAPPING_START && valid[PAIR_START])
        return start_pair(s, l, valid);
      if (kind == SEQUENCE_START && valid[ENTRY_START])
        return emit(l, valid, ENTRY_START);
      if (valid[kind]) return emit(l, valid, kind);
    }
  }
  if (kind == PLAIN_START) return start_plain(s, l, valid);
  if (kind == PROPERTIES_START) {
    s->json = false;
    s->properties_ready = false;
    s->property_separation_notified = false;
    s->property_keys = 0;
  }
  return !block_collection(kind) && emit(l, valid, kind);
}

static bool scan_node_open(Scanner *s, TSLexer *l, const bool *valid) {
  switch (l->lookahead) {
    case '\'':
    case '"':
      s->mode = l->lookahead == '\'' ? SINGLE : DOUBLE;
      s->quote_line_empty = false;
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
      s->block_indent = -1;
      s->block_layout_lines = 0;
      s->block_marker_eof = false;
      s->block_explicit_indent = false;
      s->header_separated = false;
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
  s->line_head = l->lookahead;
  s->layout_only = layout_follows(l);
  if (s->line_head == '-' || s->line_head == ':') {
    step(l);
    if (!space(l->lookahead) && !l->eof(l)) s->line_head = 0;
  } else if (
    !s->flow &&
    (s->line_head == '&' || s->line_head == '!' || s->line_head == '*')
  ) {
    s->line_mapping_key = classify_block_start(s, l) == MAPPING_START;
  }
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
    !valid[INDENT] &&
    (valid[PAIR_START] || valid[ENTRY_START]);
  bool tab_invalid = !s->layout_only && spaces <= s->indent;
  s->prefix_eof =
    prefix_invalid && s->eof_continuation ? PREFIX_INDENTATION | PREFIX_TAB : 0;
  if (!s->layout_only && !s->flow) {
    bool unfinished;
    bool collection = block_collection(classify_block_node(l, &unfinished));
    if (collection && unfinished && !tab_invalid) s->prefix_eof |= PREFIX_TAB;
    tab_invalid |= collection;
  }
  s->line_prefixed = true;
  return start_line_prefix(s, l, valid, prefix_invalid, tab_invalid, false);
}

static bool start_implicit_key(Scanner *s, TSLexer *l, const bool *valid) {
  int32_t first = l->lookahead;
  bool indicator = false;
  if (l->lookahead == '?' || l->lookahead == ':') {
    step(l);
    indicator = colon_boundary(l, first == ':' && s->flow);
  }
  if (indicator) {
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
static bool
scan_entry(Scanner *s, TSLexer *l, const bool *valid, int64_t column) {
  if (
    l->lookahead == ',' &&
    !valid[FLOW_SEPARATOR] &&
    valid[UNEXPECTED_FLOW_SEPARATOR]
  )
    return take(l, valid, UNEXPECTED_FLOW_SEPARATOR);
  if (valid[FLOW_MAP_PAIR_START] && !flow_entry_end(l->lookahead)) {
    s->json = false;
    return emit(l, valid, FLOW_MAP_PAIR_START);
  }
  if (valid[IMPLICIT_KEY_START] && !(s->flow && flow_entry_end(l->lookahead)))
    return start_implicit_key(s, l, valid);
  if (l->lookahead == '?' && valid[KEY_INDICATOR]) {
    step(l);
    if (space(l->lookahead) || l->eof(l))
      return emit_indicator(s, l, valid, KEY_INDICATOR);
    return start_plain(s, l, valid);
  }
  if (l->lookahead == ':' && valid[VALUE_INDICATOR]) {
    bool adjacent = s->flow && s->json;
    step(l);
    if (adjacent || colon_boundary(l, s->flow)) {
      s->value_separation =
        s->flow && !adjacent && (l->lookahead == '[' || l->lookahead == '{');
      s->json = false;
      return emit_indicator(s, l, valid, VALUE_INDICATOR);
    }
    return start_plain(s, l, valid) || emit(l, valid, MISSING_FLOW_SEPARATOR);
  }
  if (l->lookahead == '-' && valid[SEQUENCE_INDICATOR]) {
    step(l);
    return emit_indicator(s, l, valid, SEQUENCE_INDICATOR);
  }
  if (s->value_separation && valid[MISSING_SEPARATION]) {
    s->value_separation = false;
    return emit(l, valid, MISSING_SEPARATION);
  }
  if (l->lookahead == ',' && valid[FLOW_SEPARATOR])
    return take(l, valid, FLOW_SEPARATOR);
  if (l->lookahead == ']' && valid[FLOW_SEQUENCE_CLOSE])
    return close_flow(s, l, valid, FLOW_SEQUENCE_CLOSE);
  if (l->lookahead == '}' && valid[FLOW_MAPPING_CLOSE])
    return close_flow(s, l, valid, FLOW_MAPPING_CLOSE);
  if (l->lookahead == ']' && valid[MISSING_FLOW_MAPPING_CLOSE])
    return close_flow(s, l, valid, MISSING_FLOW_MAPPING_CLOSE);
  if (l->lookahead == '}' && valid[MISSING_FLOW_SEQUENCE_CLOSE])
    return close_flow(s, l, valid, MISSING_FLOW_SEQUENCE_CLOSE);
  static const enum Token flow_starts[] = {
    PLAIN_START,
    SINGLE_START,
    DOUBLE_START,
    FLOW_SEQUENCE_START,
    FLOW_MAPPING_START
  };
  if (
    valid[MISSING_FLOW_SEPARATOR] &&
    !any_valid(valid, flow_starts, COUNT(flow_starts)) &&
    !flow_entry_end(l->lookahead)
  )
    return emit(
      l,
      valid,
      eof_pending(s) ? UNFINISHED_MISSING_FLOW_SEPARATOR
                     : MISSING_FLOW_SEPARATOR
    );
  static const enum Token node_starts[] = {
    PAIR_START,
    ENTRY_START,
    MAPPING_START,
    SEQUENCE_START,
    PLAIN_START,
    INDENT,
    OUTDENT,
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
    return scan_node_start(s, l, valid, column);
  return scan_node_open(s, l, valid);
}

static bool start_block_value(Scanner *s, TSLexer *l, const bool *valid) {
  if (!block_value_follows(s, l, valid))
    return emit(l, valid, EMPTY_BLOCK_NODE);
  if (!s->line && valid[INVALID_COMPACT_START]) {
    bool unfinished;
    enum Token kind = classify_block_node(l, &unfinished);
    if (block_collection(kind))
      return emit(
        l,
        valid,
        unfinished ? UNFINISHED_INVALID_COMPACT_COLLECTION_START
                   : INVALID_COMPACT_START
      );
  }
  s->block_out = valid[BLOCK_OUT_VALUE_START];
  return emit(
    l,
    valid,
    s->block_out ? BLOCK_OUT_VALUE_START : BLOCK_IN_VALUE_START
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
  if (scan_invalid_character(l, valid, false)) return true;
  bool end = l->eof(l);
  if (s->after_document_end && !end) {
    do {
      step(l);
    } while (
      !l->eof(l) && !space(l->lookahead) && !invalid_unquoted(l->lookahead)
    );
    return finish(l, valid, UNEXPECTED_DOCUMENT_END_CONTENT);
  }
  int64_t column = s->line ? s->line_indent : l->get_column(l);
  if (
    valid[EXPLICIT_VALUE_START] && l->lookahead == ':' && indicator_line(s, ':')
  )
    return emit(l, valid, EXPLICIT_VALUE_START);
  if (
    valid[BLOCK_OUT_VALUE_START] ||
    valid[BLOCK_IN_VALUE_START] ||
    valid[EMPTY_BLOCK_NODE]
  )
    return start_block_value(s, l, valid);
  if (valid[DOCUMENT_CLOSE] && end) {
    close_document(s);
    return emit(l, valid, DOCUMENT_CLOSE);
  }
  if (valid[DOCUMENT_OPEN] && !end) {
    open_document(s, !s->explicit_document_required);
    return emit(l, valid, DOCUMENT_OPEN);
  }
  if (valid[UNEXPECTED_DOCUMENT_CONTENT_START] && s->document_content && !end) {
    s->document_content = false;
    return emit(
      l,
      valid,
      eof_pending(s) ? UNFINISHED_UNEXPECTED_DOCUMENT_CONTENT_START
                     : UNEXPECTED_DOCUMENT_CONTENT_START
    );
  }
  if (
    !end &&
    valid[UNEXPECTED_COLLECTION_CONTENT_START] &&
    (!s->line ||
      (valid[PAIR_START] && s->line_head == '-') ||
      (valid[ENTRY_START] && s->line_head != '-'))
  ) {
    s->block_out = false;
    bool unfinished = eof_pending(s);
    if (s->line && valid[PAIR_START]) {
      classify_block_start(s, l);
      unfinished |= s->block_eof;
    }
    return emit(
      l,
      valid,
      unfinished ? UNFINISHED_UNEXPECTED_COLLECTION_CONTENT_START
                 : UNEXPECTED_COLLECTION_CONTENT_START
    );
  }
  if ((end || (!s->flow && !s->line)) && end_collection(s, l, valid))
    return true;
  if (end) {
    static const enum Token endings[] = {
      INCOMPLETE_FLOW_SEQUENCE_CLOSE,
      INCOMPLETE_FLOW_MAPPING_CLOSE,
      END_OF_FILE
    };
    return emit_first(s, l, valid, endings, COUNT(endings));
  }
  return scan_entry(s, l, valid, column);
}

static void begin_property(Scanner *s, unsigned key) {
  s->property_separation_notified = false;
  s->property_keys &= (uint8_t)~key;
}
static bool start_tag_handle(Scanner *s, TSLexer *l, const bool *valid) {
  s->directive_handle = false;
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
  begin_property(s, TAG_KEY);
  return emit(l, valid, TAG_HANDLE_START);
}
static bool scan_properties(
  Scanner *s,
  TSLexer *l,
  const bool *valid,
  bool property_pending
) {
  if (property_pending) {
    if (separation_missing(s) && valid[MISSING_SEPARATION])
      return emit_missing_separation(s, l, valid);
    s->properties_ready = false;
    s->property_separation_notified = false;
    return emit(l, valid, property_content_start(s, l, valid));
  }
  if (
    separation_missing(s) &&
    valid[MISSING_SEPARATION] &&
    ((l->lookahead == '&' &&
       (valid[ANCHOR_INDICATOR] || valid[DUPLICATE_ANCHOR_START])) ||
      (l->lookahead == '!' &&
        (valid[SHORTHAND_TAG_START] || valid[DUPLICATE_TAG_START])))
  )
    return emit_missing_separation(s, l, valid);
  if (
    (l->lookahead == '&' && valid[DUPLICATE_ANCHOR_START]) ||
    (l->lookahead == '!' && valid[DUPLICATE_TAG_START])
  ) {
    bool anchor = l->lookahead == '&';
    bool unfinished = s->property_keys & (anchor ? ANCHOR_KEY : TAG_KEY);
    return emit(
      l,
      valid,
      anchor
        ? (unfinished ? UNFINISHED_DUPLICATE_ANCHOR_START
                      : DUPLICATE_ANCHOR_START)
        : (unfinished ? UNFINISHED_DUPLICATE_TAG_START : DUPLICATE_TAG_START)
    );
  }
  if (
    (l->lookahead == '&' && valid[ANCHOR_INDICATOR]) ||
    (l->lookahead == '*' && valid[ALIAS_INDICATOR])
  ) {
    bool anchor = l->lookahead == '&';
    begin_property(s, anchor ? ANCHOR_KEY : 0);
    s->mode = anchor ? ANCHOR_BODY : ALIAS_BODY;
    s->first = true;
    s->json = false;
    return take(l, valid, anchor ? ANCHOR_INDICATOR : ALIAS_INDICATOR);
  }
  if (
    l->lookahead == '!' &&
    (valid[VERBATIM_TAG_START] ||
      valid[SHORTHAND_TAG_START] ||
      valid[NON_SPECIFIC_TAG])
  ) {
    step(l);
    if (l->lookahead == '<') return emit(l, valid, VERBATIM_TAG_START);
    if (!name_boundary(l)) return emit(l, valid, SHORTHAND_TAG_START);
    l->mark_end(l);
    begin_property(s, TAG_KEY);
    return emit(l, valid, NON_SPECIFIC_TAG);
  }
  if (valid[VERBATIM_TAG_OPEN]) {
    step(l);
    step(l);
    l->mark_end(l);
    begin_property(s, TAG_KEY);
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
    valid[LINE_PREFIX_START] &&
    (blank(l->lookahead) ||
      (s->flow &&
        s->indent >= 0 &&
        !newline(l->lookahead) &&
        !l->eof(l) &&
        l->lookahead != '#'))
  )
    return begin_line_prefix(s, l, valid);
  if (newline(l->lookahead) && valid[LINE_BREAK]) {
    reset_line(s);
    return line_break(l, valid, LINE_BREAK);
  }
  if (blank(l->lookahead) && valid[SEPARATION])
    return scan_separation(l, valid);
  if (l->lookahead == '#' && valid[COMMENT_START])
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
  if (
    s->key_state == BLOCK_KEY_ENDED &&
    (!s->line || s->layout_only) &&
    scan_layout(s, l, valid)
  )
    return true;
  bool line_colon = indicator_line(s, ':');
  if (
    line_colon &&
    !s->line_prefixed &&
    blank(l->lookahead) &&
    valid[LINE_PREFIX_START]
  )
    return begin_line_prefix(s, l, valid);
  s->key_state = KEY_NONE;
  if (l->lookahead == ':' && (!s->line || line_colon)) {
    step(l);
    if (colon_boundary(l, false))
      return emit_indicator(s, l, valid, VALUE_INDICATOR);
  }
  return emit(
    l,
    valid,
    l->eof(l) || s->eof_continuation || (!s->line && s->boundary_pending)
      ? INCOMPLETE_VALUE_INDICATOR
      : MISSING_VALUE_INDICATOR
  );
}
static bool close_by_line(Scanner *s, TSLexer *l, const bool *valid) {
  if (valid[EMPTY_BLOCK_NODE] && !block_value_follows(s, l, valid))
    return emit(l, valid, EMPTY_BLOCK_NODE);
  if (s->line_indent < s->indent) return end_collection(s, l, valid);
  if (s->line_indent != s->indent) return false;
  static const enum Token shared_endings[] = {
    SHARED_INDENT_MAPPING_END,
    SHARED_INDENT_SEQUENCE_END
  };
  if (emit_first(s, l, valid, shared_endings, COUNT(shared_endings)))
    return true;
  if (s->line_head != '-') {
    static const enum Token endings[] = {
      MAPPING_IN_MAPPING_END,
      SEQUENCE_IN_MAPPING_END
    };
    return emit_first(s, l, valid, endings, COUNT(endings));
  }
  if (valid[MAPPING_IN_SEQUENCE_END] && !valid[BLOCK_OUT_VALUE_START])
    return emit(l, valid, MAPPING_IN_SEQUENCE_END);
  return emit(l, valid, SEQUENCE_IN_SEQUENCE_END);
}
static bool
emit_missing_document_start(Scanner *s, TSLexer *l, const bool *valid) {
  bool directives = s->directive_kind;
  s->document_started = true;
  s->explicit_document_required = false;
  s->directive_kind = 0;
  if (
    s->boundary_pending == DOCUMENT_START_LINE ||
    (s->boundary_pending == DOCUMENT_END_LINE && !directives)
  )
    return emit(l, valid, INCOMPLETE_DOCUMENT_START);
  return emit_missing(
    l,
    valid,
    MISSING_DOCUMENT_START,
    INCOMPLETE_DOCUMENT_START
  );
}
static bool key_end_valid(const bool *valid) {
  return valid[KEY_END] || valid[INVALID_KEY_END] || valid[FLOW_NODE_END];
}
static bool key_colon_pending(const Scanner *s, const bool *valid) {
  return s->key_state != KEY_NONE &&
    (valid[MISSING_VALUE_INDICATOR] || valid[INCOMPLETE_VALUE_INDICATOR]);
}
static bool
scan_normal(Scanner *s, TSLexer *l, const bool *valid, bool property_pending) {
  if (!property_pending && key_end_valid(valid))
    return scan_key_end(s, l, valid);
  if (s->line && !s->line_context && valid[LINE_CONTEXT])
    return scan_line_context(s, l, valid);
  if (key_colon_pending(s, valid)) return scan_key_colon(s, l, valid);
  if (
    s->line_context &&
    !s->layout_only &&
    !property_line_follows(s, s->line, s->line_indent, s->line_head)
  ) {
    s->properties_ready = false;
    property_pending = false;
  }
  static const enum Token restorations[] = {DEDENT, RESTORE_INDENT};
  if (
    !property_pending &&
    emit_first(s, l, valid, restorations, COUNT(restorations))
  )
    return true;
  if (
    !property_pending &&
    s->line &&
    s->line_context &&
    !s->layout_only &&
    !s->flow &&
    close_by_line(s, l, valid)
  )
    return true;
  if (scan_layout(s, l, valid)) return true;
  if (valid[DIRECTIVE_INDICATOR]) {
    s->mode = DIRECTIVE_NAME_BODY;
    s->first = true;
    return take(l, valid, DIRECTIVE_INDICATOR);
  }
  if (
    l->lookahead == '%' &&
    l->get_column(l) == 0 &&
    valid[RESERVED_DIRECTIVE_START]
  )
    return start_directive(s, l, valid);
  if (
    !s->document_started &&
    (valid[MISSING_DOCUMENT_START] || valid[INCOMPLETE_DOCUMENT_START])
  )
    return emit_missing_document_start(s, l, valid);
  return scan_properties(s, l, valid, property_pending);
}

static bool scan_property_tail(Scanner *s, TSLexer *l, const bool *valid) {
  bool line = s->line;
  uint32_t line_indent = s->line_indent;
  for (;;) {
    if (line) line_indent = count_spaces(l);
    skip_blanks(l);
    if (l->lookahead == '#') skip_line(l);
    if (!newline(l->lookahead)) break;
    skip_line_break(l);
    line = true;
  }
  bool end = l->eof(l);
  s->eof_continuation |= end;
  int32_t first = l->lookahead;
  int32_t line_head = first;
  bool boundary = false;
  if (first == '-' && line && !s->flow) {
    bool column_zero = l->get_column(l) == 0;
    step(l);
    if (!space(l->lookahead) && !l->eof(l)) line_head = 0;
    if (column_zero) boundary = document_marker_tail(l, first) != NO_BOUNDARY;
  } else if (l->get_column(l) == 0) {
    boundary = line_boundary(s, l) != NO_BOUNDARY;
  }
  enum Token content_end =
    valid[BLOCK_PROPERTIES_END] ? BLOCK_PROPERTIES_END : PROPERTIES_END;
  enum Token token = content_end;
  if (
    boundary ||
    end ||
    (s->flow && flow_entry_end(first)) ||
    !property_line_follows(s, line, line_indent, line_head)
  ) {
    token = EMPTY_PROPERTIES_END;
  } else if (first == ':') {
    step(l);
    if (colon_boundary(l, s->flow)) {
      if (s->flow || !line || !valid[BLOCK_PROPERTIES_END])
        token = EMPTY_PROPERTIES_END;
      s->eof_continuation = l->eof(l);
    }
  } else if (first == '&' || first == '!') {
    token = PROPERTY_CONTINUE;
    if (line && !s->flow) {
      if (classify_block_node(l, NULL) == MAPPING_START) token = content_end;
      s->property_keys = l->eof(l) ? ANCHOR_KEY | TAG_KEY : 0;
    }
  }
  s->properties_ready = token == content_end;
  s->property_separation_notified = false;
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
    valid[BOUNDARY_CHECK] &&
    check_boundary(s, l, valid)
  )
    return true;
  if (s->boundary) s->properties_ready = false;
  bool property_pending = s->properties_ready &&
    (valid[PROPERTY_CONTENT_START] || valid[BLOCK_PROPERTY_CONTENT_START]);
  if (s->mode == NORMAL) {
    if (s->boundary == DOCUMENT_END_LINE && valid[MISSING_DOCUMENT_START]) {
      s->document_started = true;
      s->directive_kind = 0;
      return emit(l, valid, MISSING_DOCUMENT_START);
    }
    if (!property_pending && valid[DOCUMENT_CONTENT_END]) {
      s->document_content = true;
      return emit(l, valid, DOCUMENT_CONTENT_END);
    }
    if (!property_pending && valid[COLLECTION_CONTENT_END])
      return emit(l, valid, COLLECTION_CONTENT_END);
  }
  if (
    boundary_mode &&
    s->boundary &&
    !(s->mode == NORMAL &&
      (key_end_valid(valid) || key_colon_pending(s, valid)))
  ) {
    if (scan_boundary(s, l, valid)) return true;
    if (s->boundary != DIRECTIVE_LINE && s->boundary != STREAM_BOM)
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
    case INVALID_INDENTATION:
    case TAB_IN_INDENTATION:
    case UNFINISHED_INVALID_INDENTATION:
    case UNFINISHED_TAB_IN_INDENTATION:
    case BYTE_ORDER_MARK:
    case LINE_CONTEXT:
    case BOUNDARY_CHECK:
      return true;
    default:
      return false;
  }
}
static void reset_scanner(Scanner *s) {
  *s = (Scanner){
    .indent = -1,
    .provisional_indent = -2,
    .block_indent = -1,
    .line = true,
    .separated = true
  };
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
  char *cursor = buffer;
#define WRITE_FIELD(type, name, width, bias) \
  write_integer(&cursor, (uint64_t)(s->name + bias), width);
  SCANNER_FIELDS(WRITE_FIELD)
#undef WRITE_FIELD
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
    length < SCANNER_STATE_BYTES ||
    length > SCANNER_STATE_BYTES + SCANNER_KEY_BYTES
  )
    return;
  const char *cursor = buffer;
#define READ_FIELD(type, name, width, bias) \
  s->name = (type)read_integer(&cursor, width) - bias;
  SCANNER_FIELDS(READ_FIELD)
#undef READ_FIELD
  for (unsigned i = 0; i < length - SCANNER_STATE_BYTES; i++)
    s->implicit_keys[i / 8] |= (uint64_t)(uint8_t)*cursor++ << ((i % 8) * 8);
}
#undef SCANNER_FIELDS

bool tree_sitter_yaml_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid
) {
  if (!payload) return false;
  Scanner next = *(Scanner *)payload;
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
  if (
    cursor.lexer.result_symbol == MAPPING_END ||
    cursor.lexer.result_symbol == MAPPING_IN_MAPPING_END ||
    cursor.lexer.result_symbol == MAPPING_IN_SEQUENCE_END ||
    cursor.lexer.result_symbol == SHARED_INDENT_MAPPING_END
  ) {
    next.first_pair = false;
  }
  /* Include the final lookahead codepoint in edit invalidation. */
  if (!cursor.lexer.eof(&cursor.lexer)) step(&cursor.lexer);
  if (next.flow && !layout_token(cursor.lexer.result_symbol))
    skip_layout(&cursor.lexer);
  next.column = cursor.marked_column;
  next.separated = cursor.marked_separation;
  if (cursor.marked_characters) {
    next.block_kind = 0;
    advance_keys(&next, cursor.marked_characters, cursor.marked_broken);
    next.boundary = 0;
    next.boundary_checked = false;
    next.boundary_pending = 0;
    if (!layout_token(cursor.lexer.result_symbol)) next.line = false;
  }
  lexer->result_symbol = cursor.lexer.result_symbol;
  *(Scanner *)payload = next;
  return true;
}
