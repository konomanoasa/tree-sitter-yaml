use std::ops::ControlFlow;
use std::time::{Duration, Instant};

use konomanoasa_tree_sitter_yaml as grammar;
use tree_sitter::{InputEdit, ParseOptions, Parser, Point, Query, Tree};

fn parser() -> Parser {
  let mut parser = Parser::new();
  parser.set_language(&grammar::LANGUAGE.into()).unwrap();
  parser
}

fn bounded_parse(
  parser: &mut Parser,
  source: &[u8],
  old: Option<&Tree>,
) -> Tree {
  let start = Instant::now();
  let mut progress = |_: &tree_sitter::ParseState| {
    if start.elapsed() > Duration::from_secs(2) {
      ControlFlow::Break(())
    } else {
      ControlFlow::Continue(())
    }
  };
  parser
    .parse_with_options(
      &mut |offset, _| source.get(offset..).unwrap_or_default(),
      old,
      Some(ParseOptions::new().progress_callback(&mut progress)),
    )
    .unwrap_or_else(|| {
      panic!(
        "Parser did not finish: {:?}",
        String::from_utf8_lossy(source)
      )
    })
}

fn issue_ranges(
  node: tree_sitter::Node<'_>,
  output: &mut Vec<(String, String, std::ops::Range<usize>)>,
) {
  if node.kind() == "syntax_issue" {
    let parent = node.parent().unwrap();
    let index = (0..parent.child_count())
      .find(|&index| parent.child(index) == Some(node))
      .unwrap();
    assert_eq!(
      parent.field_name_for_child(index),
      Some("issue"),
      "{}",
      parent.to_sexp()
    );
    let outcome = node.named_child(0).unwrap();
    let reason = outcome.named_child(0).unwrap();
    assert_eq!(node.byte_range(), outcome.byte_range());
    assert_eq!(node.byte_range(), reason.byte_range());
    output.push((
      outcome.kind().to_owned(),
      reason.kind().to_owned(),
      node.byte_range(),
    ));
  }
  let mut cursor = node.walk();
  for child in node.children(&mut cursor) {
    issue_ranges(child, output);
  }
}

fn assert_classified_recovery(node: tree_sitter::Node<'_>, source: &[u8]) {
  assert_eq!(node.kind(), "stream", "{source:?}: {}", node.to_sexp());
  let mut issues = Vec::new();
  issue_ranges(node, &mut issues);
  let mut pending = vec![node];
  while let Some(current) = pending.pop() {
    if current.is_missing()
      || (current.is_error() && current.child_count() == 0)
    {
      assert!(
        issues
          .iter()
          .any(|(_, _, range)| range.start <= current.start_byte()
            && range.end >= current.end_byte()),
        "Unclassified recovery for {source:?}: {}",
        node.to_sexp()
      );
    }
    let mut cursor = current.walk();
    pending.extend(current.children(&mut cursor));
  }
}

fn point(source: &[u8], end: usize) -> Point {
  let prefix = &source[..end];
  let row = prefix.iter().filter(|&&byte| byte == b'\n').count();
  let column = prefix
    .iter()
    .rposition(|&byte| byte == b'\n')
    .map_or(end, |last| end - last - 1);
  Point::new(row, column)
}

fn edit_source(
  source: &[u8],
  tree: &mut Tree,
  start: usize,
  remove: usize,
  insert: &[u8],
) -> Vec<u8> {
  let mut edited = source.to_vec();
  edited.splice(start..start + remove, insert.iter().copied());
  tree.edit(&InputEdit {
    start_byte: start,
    old_end_byte: start + remove,
    new_end_byte: start + insert.len(),
    start_position: point(source, start),
    old_end_position: point(source, start + remove),
    new_end_position: point(&edited, start + insert.len()),
  });
  edited
}

fn snapshot(
  node: tree_sitter::Node<'_>,
) -> Vec<(String, Option<String>, usize, usize, usize)> {
  fn visit(
    node: tree_sitter::Node<'_>,
    depth: usize,
    field: Option<&str>,
    output: &mut Vec<(String, Option<String>, usize, usize, usize)>,
  ) {
    output.push((
      node.kind().to_owned(),
      field.map(str::to_owned),
      node.start_byte(),
      node.end_byte(),
      depth,
    ));
    for index in 0..node.child_count() {
      visit(
        node.child(index).unwrap(),
        depth + 1,
        node.field_name_for_child(index),
        output,
      );
    }
  }
  let mut output = Vec::new();
  visit(node, 0, None, &mut output);
  output
}

#[test]
fn parses_valid_source() {
  let source = "key: [value]";
  let language = grammar::LANGUAGE.into();
  let mut parser = Parser::new();
  parser.set_language(&language).unwrap();
  let tree = parser.parse(source, None).unwrap();
  let root = tree.root_node();
  assert_eq!(root.kind(), "stream");
  assert_eq!(root.byte_range(), 0..source.len());
  assert!(!root.has_error());
  assert!(grammar::NODE_TYPES.contains("\"stream\""));
  Query::new(&language, grammar::HIGHLIGHTS_QUERY).unwrap();
}

#[test]
fn utf16_uses_original_byte_ranges() {
  for big_endian in [false, true] {
    let source: Vec<u16> = "名前: 値"
      .encode_utf16()
      .map(|unit| {
        if big_endian {
          unit.to_be()
        } else {
          unit.to_le()
        }
      })
      .collect();
    let mut parser = parser();
    let tree = if big_endian {
      parser.parse_utf16_be(&source, None)
    } else {
      parser.parse_utf16_le(&source, None)
    }
    .unwrap();
    assert!(!tree.root_node().has_error());
    assert_eq!(tree.root_node().byte_range(), 0..10);
    let mut issues = Vec::new();
    issue_ranges(tree.root_node(), &mut issues);
    assert!(issues.is_empty());
    let pair = tree
      .root_node()
      .named_child(0)
      .unwrap()
      .child_by_field_name("content")
      .unwrap()
      .named_child(0)
      .unwrap();
    assert_eq!(pair.child_by_field_name("key").unwrap().byte_range(), 0..4);
    assert_eq!(
      pair.child_by_field_name("indicator").unwrap().byte_range(),
      4..6
    );
    assert_eq!(
      pair.child_by_field_name("value").unwrap().byte_range(),
      8..10
    );
  }
}

#[test]
fn utf16_unpaired_surrogates_have_exact_decoding_issue_ranges() {
  let source = [
    0x22_u16.to_le(),
    0xd800_u16.to_le(),
    0x78_u16.to_le(),
    0x22_u16.to_le(),
  ];
  let tree = parser().parse_utf16_le(source, None).unwrap();
  let mut issues = Vec::new();
  issue_ranges(tree.root_node(), &mut issues);
  assert_eq!(
    issues,
    vec![(
      "invalid_syntax".to_owned(),
      "invalid_encoding".to_owned(),
      2..4
    )]
  );
  assert!(!tree.root_node().has_error());
  assert_eq!(tree.root_node().end_byte(), 8);
}

#[test]
fn leading_bom_is_removed_by_input_layer_without_shifting_ranges() {
  let tree = parser().parse("\u{feff}a", None).unwrap();
  let scalar = tree
    .root_node()
    .named_child(0)
    .unwrap()
    .child_by_field_name("content")
    .unwrap();
  assert_eq!(scalar.byte_range(), 3..4);
  assert_eq!(tree.root_node().end_byte(), 4);
}

#[test]
fn deeply_nested_flow_nodes_and_expired_keys_keep_their_structure() {
  let depth = 4096;
  let source = format!("{}x{}", "[".repeat(depth), "]".repeat(depth));
  let tree = bounded_parse(&mut parser(), source.as_bytes(), None);
  assert!(!tree.root_node().has_error());
  let document = tree.root_node().named_child(0).unwrap();
  let mut node = document.child_by_field_name("content").unwrap();
  for index in 0..depth {
    assert_eq!(node.kind(), "flow_sequence");
    assert_eq!(node.byte_range(), index..source.len() - index);
    assert_eq!(node.named_child_count(), 3);
    node = node.named_child(1).unwrap();
  }
  assert_eq!(node.kind(), "plain_scalar");
  assert_eq!(node.byte_range(), depth..depth + 1);

  let depth = 512;
  let source = format!("{}x{}", "[".repeat(depth), ": v]".repeat(depth));
  let tree = bounded_parse(&mut parser(), source.as_bytes(), None);
  assert!(!tree.root_node().has_error());
  let document = tree.root_node().named_child(0).unwrap();
  let mut node = document.child_by_field_name("content").unwrap();
  for index in 0..depth {
    assert_eq!(node.kind(), "flow_sequence");
    assert_eq!(node.named_child_count(), 3);
    let pair = node.named_child(1).unwrap();
    assert_eq!(pair.kind(), "flow_mapping_pair");
    let key_range = index + 1..source.len() - 4 * (index + 1);
    if index < 307 {
      let issue = pair.child_by_field_name("issue").unwrap();
      let outcome = issue.named_child(0).unwrap();
      let reason = outcome.named_child(0).unwrap();
      assert_eq!(issue.kind(), "syntax_issue");
      assert_eq!(outcome.kind(), "invalid_syntax");
      assert_eq!(reason.kind(), "invalid_implicit_key");
      for wrapper in [issue, outcome, reason] {
        assert_eq!(wrapper.byte_range(), key_range);
      }
      node = reason.child_by_field_name("key").unwrap();
    } else {
      assert!(pair.child_by_field_name("issue").is_none());
      node = pair.child_by_field_name("key").unwrap();
    }
    assert_eq!(node.byte_range(), key_range);
    let value = pair.child_by_field_name("value").unwrap();
    assert_eq!(&source[value.byte_range()], "v");
  }
  assert_eq!(node.kind(), "plain_scalar");
}

#[test]
fn fixed_seed_byte_damage_and_repairs_preserve_incremental_results() {
  for mut seed in [0x7961_6d6c_u64, 1, 0x1234_5678, 0xffff_ffff] {
    let replacements: &[&[u8]] = &[
      b"",
      b"a",
      b" ",
      b"\n",
      b"\r",
      b"\t",
      b":",
      b"-",
      b"?",
      b"[",
      b"]",
      b"{",
      b"}",
      b"'",
      b"\"",
      b"%",
      b"!",
      b"&",
      b"*",
      b"#",
      b"<",
      b">",
      b"0",
      b".",
      b"\0",
      b"\xff",
      "名".as_bytes(),
      "\u{feff}".as_bytes(),
    ];
    for initial in [
      "a: [one, {two: \"three\"}]\nb: *alias\n",
      "- &name !!str 'value'\n- !<tag:x%20y> text\n",
      "%YAML 1.2\n%TAG !h! tag:x\n--- !h!y |2-\n  a\n...\n--- [b]\n",
      "a:\n  - b: 日本語\n    c: >+\n      text\n  - d\n",
      "[a\"b, !<tag:a[b> c]: value\n",
      "{[], :name, ?name:[], ? :value}\n",
      "- key: value\n  next: other\n? key\n: - value\n",
      "{key\n:[]}\n",
      "a: b\n\"k\":value",
      "a: b\n \t ",
      "[\"a\u{7f}b\", 'a\u{9f}b', \"\u{ffff}\"]",
      "\"\\uD8",
      "key: one\0 two\nnext: value",
      "|\n  \n---\nnext",
      "|\ntext\n\u{feff}---\nnext",
      "a:\n  b: &p\n c: d\ne: f",
      "a: b: !t\n c: d\ne: f",
      "a: !t\n  : value\nnext: end",
      "a: [&p\n }",
      "?\n!t\n - item\nnext: end",
      "?\n!t\n |\n  body\nnext: end",
      ":\n! -\n r",
      "\"first\"\"\n\": - entry\nnext: end",
      "\"first\"\"\n\": nested: value\nnext: end",
      "\"first\"\"\n\": - entry\n---\nnext: end",
    ] {
      let mut parser = parser();
      let mut source = initial.as_bytes().to_vec();
      let mut tree = bounded_parse(&mut parser, &source, None);
      for iteration in 0..400 {
        seed = seed
          .wrapping_mul(6364136223846793005)
          .wrapping_add(1442695040888963407);
        let start = (seed >> 32) as usize % (source.len() + 1);
        seed = seed.rotate_left(17).wrapping_add(0x9e3779b97f4a7c15);
        let remove = ((seed >> 32) as usize % 4).min(source.len() - start);
        let insert = replacements[seed as usize % replacements.len()];
        let (start, remove, insert) = if iteration % 20 == 19 {
          (0, source.len(), initial.as_bytes())
        } else {
          (start, remove, insert)
        };
        let next = edit_source(&source, &mut tree, start, remove, insert);
        let incremental = bounded_parse(&mut parser, &next, Some(&tree));
        let fresh = bounded_parse(&mut parser, &next, None);
        assert_eq!(
          snapshot(incremental.root_node()),
          snapshot(fresh.root_node()),
          "iteration {iteration}: {source:?} -> {next:?}"
        );
        assert_eq!(
          fresh.root_node().end_byte(),
          next.len(),
          "{next:?}: {}",
          fresh.root_node().to_sexp()
        );
        assert_classified_recovery(fresh.root_node(), &next);
        tree = incremental;
        source = next;
      }
    }
  }
}

#[test]
fn incremental_flow_and_block_edits_match_fresh_parse() {
  for initial in [
    "?\n!t\n - item\nnext: end",
    "?\n!t\n nested: value\nnext: end",
    "?\n!t\n |\n  body\nnext: end",
    ":\n! -\n r",
    "\"first\"\"\n\": - entry\nnext: end",
    "\"first\"\"\n\": nested: value\nnext: end",
    "\"first\"\"\n\": - entry\n---\nnext: end",
    "[a\"b]: value",
    "[ # \"\n a ]: value",
    "[!<tag:a[b> c]: value",
    "{[], :name, ?name:[]}",
    "-\tkey: value\n  next: other",
    "? key\n:\t- value",
    "{key\n:[]}",
    "{!tag :plain}",
    "a: [b,\n\t# comment\n c]",
    "a:\n # c\nb\n  d",
    "? a\n# c\nb\n: c",
    "-\n # c\nb\n  d",
    "a: \"x\n\t\ty\"",
    "a:\n  - b\n  -x",
    "[]\n\u{feff}---\nx",
    "%YAML 1.2\n%TAG !h! tag:x\n--- !h!y [a]\n...",
    "%UNKNOWN one # comment\n---\n&a value",
    "&a !local {key: *a, next: !!str value}",
    "k: &a\n- !<tag:x> one\nnext: *a",
    "[!h!x%20y, &anchor, *alias]",
    "[one: two, {\"k\": [a,b]}]",
    "'a''b'",
    "\"a\\u3042\\\n b\"",
    "a:\n  b: c\n d: e\nf: g",
    "? [a,b]\n: c\n? d\n: e",
    "key:\n- a\n- b\nnext: value",
    "key: one\n  two\nnext: value",
    "key: |2-\n  one\n\n  two\nnext: value",
    "key: >\n   \n  one\n    two\nnext: value",
    "---\na: b\n...\n---\n[c,d]",
    "\"one\n---\ntwo",
  ] {
    for start in 0..=initial.len() {
      for insert in ["", ",", ":", "\"", "[", "]", "\n", "\t", "?", "-"] {
        let remove = usize::from(start < initial.len());
        let mut parser = parser();
        let mut tree = bounded_parse(&mut parser, initial.as_bytes(), None);
        let source = edit_source(
          initial.as_bytes(),
          &mut tree,
          start,
          remove,
          insert.as_bytes(),
        );
        let incremental = bounded_parse(&mut parser, &source, Some(&tree));
        let fresh = bounded_parse(&mut parser, &source, None);
        assert_eq!(
          snapshot(incremental.root_node()),
          snapshot(fresh.root_node()),
          "{initial:?} -> {:?}",
          String::from_utf8_lossy(&source)
        );
        assert_eq!(
          fresh.root_node().end_byte(),
          source.len(),
          "{:?}: {}",
          String::from_utf8_lossy(&source),
          fresh.root_node().to_sexp()
        );
        assert_classified_recovery(fresh.root_node(), &source);
      }
    }
  }
}

#[test]
fn included_range_bom_keeps_its_original_position() {
  for (source, start) in
    [("ignored\n\u{feff}---\nx", 8), ("ignored \u{feff}x", 8)]
  {
    let mut parser = parser();
    parser
      .set_included_ranges(&[tree_sitter::Range {
        start_byte: start,
        end_byte: source.len(),
        start_point: point(source.as_bytes(), start),
        end_point: point(source.as_bytes(), source.len()),
      }])
      .unwrap();
    let tree = bounded_parse(&mut parser, source.as_bytes(), None);
    let mut issues = Vec::new();
    issue_ranges(tree.root_node(), &mut issues);
    assert!(issues.is_empty(), "{}", tree.root_node().to_sexp());
    assert_eq!(tree.root_node().end_byte(), source.len());
    assert!(snapshot(tree.root_node()).iter().any(
      |(kind, _, begin, end, _)| kind == "byte_order_mark"
        && *begin == start
        && *end == start + 3
    ));
  }
}

#[test]
fn incremental_nested_keys_restore_length_and_line_state() {
  for depth in [64, 512, 513, 1200] {
    let initial = format!("{}x{}", "[".repeat(depth), "]".repeat(depth));
    let end = initial.len();
    for (start, remove, insert) in [
      (1, 0, "&anchor "),
      (end - 1, 0, ": value"),
      (depth, 1, "\n 名"),
      (end - 1, 1, ""),
      (0, 1, "{"),
    ] {
      let mut parser = parser();
      let mut tree = bounded_parse(&mut parser, initial.as_bytes(), None);
      let source = edit_source(
        initial.as_bytes(),
        &mut tree,
        start,
        remove,
        insert.as_bytes(),
      );
      let mut incremental = bounded_parse(&mut parser, &source, Some(&tree));
      let fresh = bounded_parse(&mut parser, &source, None);
      assert_eq!(
        snapshot(incremental.root_node()),
        snapshot(fresh.root_node()),
        "depth {depth}, edit {start}/{remove}/{insert:?}"
      );
      assert_eq!(fresh.root_node().end_byte(), source.len());
      if insert == ": value" {
        let mut issues = Vec::new();
        issue_ranges(fresh.root_node(), &mut issues);
        let expected = if depth > 512 {
          vec![(
            "invalid_syntax".to_owned(),
            "invalid_implicit_key".to_owned(),
            1..end - 1,
          )]
        } else {
          Vec::new()
        };
        assert_eq!(issues, expected);
      }
      let restored_source = edit_source(
        &source,
        &mut incremental,
        start,
        insert.len(),
        &initial.as_bytes()[start..start + remove],
      );
      assert_eq!(restored_source, initial.as_bytes());
      let restored =
        bounded_parse(&mut parser, initial.as_bytes(), Some(&incremental));
      let fresh = bounded_parse(&mut parser, initial.as_bytes(), None);
      assert_eq!(
        snapshot(restored.root_node()),
        snapshot(fresh.root_node()),
        "restore depth {depth}, edit {start}/{remove}/{insert:?}"
      );
    }
  }
}
