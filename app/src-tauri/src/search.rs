//! The search index: what each document says, section by section, and how a query finds it.
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use unicode_properties::{GeneralCategoryGroup, UnicodeGeneralCategory};

/// One heading and the text under it. Level 0 holds the text before the first heading.
#[derive(Debug, Clone)]
pub struct Section {
    pub slug: String,
    pub heading: String,
    pub level: u8,
    pub text: String,
    heading_f: String,
    text_f: String,
}

impl Section {
    fn new(slug: String, heading: String, level: u8, text: String) -> Self {
        Section { heading_f: fold(&heading), text_f: fold(&text), slug, heading, level, text }
    }
}

#[derive(Debug, Clone)]
pub struct DocEntry {
    pub title: String,
    title_f: String,
    pub sections: Vec<Section>,
}

/// Lower-cases one character for one character, so a position in the folded text is the same position in the original.
pub fn fold(s: &str) -> String {
    s.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect()
}

/// JavaScript's `\s` (and what `String.trim` strips). Not `char::is_whitespace`: that has U+0085 and lacks U+FEFF.
fn is_js_space(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// The rules of `slugify` in src/lib/markdown/slug.ts: keep letters (\p{L}), numbers (\p{N}) and "-", and
/// turn runs of whitespace into one "-". tests/fixtures/slug-cases.json keeps the two in step.
pub fn slugify(text: &str) -> String {
    let mut out = String::new();
    let mut in_space = false;
    for c in text.to_lowercase().trim_matches(is_js_space).chars() {
        if is_js_space(c) {
            if !in_space {
                out.push('-');
                in_space = true;
            }
        } else if c == '-' || matches!(c.general_category_group(), GeneralCategoryGroup::Letter | GeneralCategoryGroup::Number) {
            out.push(c);
            in_space = false;
        } // other characters are dropped and don't end a run of spaces: "a & b" -> "a-b"
    }
    out
}

/// `uniqueSlugger` from slug.ts: repeated headings get -1, -2 … and an issued slug is never reused.
#[derive(Default)]
pub struct Slugger {
    seen: HashMap<String, usize>,
    issued: HashSet<String>,
}

impl Slugger {
    pub fn next(&mut self, text: &str) -> String {
        let base = slugify(text);
        let mut n = self.seen.get(&base).copied().unwrap_or(0);
        let mut slug = if n > 0 { format!("{base}-{n}") } else { base.clone() };
        while self.issued.contains(&slug) {
            n += 1;
            slug = format!("{base}-{n}");
        }
        self.seen.insert(base, n + 1);
        self.issued.insert(slug.clone());
        slug
    }
}

fn level_number(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn unquote(s: &str) -> String {
    let s = s.strip_prefix(['"', '\'']).unwrap_or(s);
    s.strip_suffix(['"', '\'']).unwrap_or(s).to_string()
}

/// The frontmatter's `title:` and the body after the frontmatter. Same rules as splitFrontmatter in frontmatter.ts.
fn split_frontmatter(text: &str) -> (Option<String>, &str) {
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return (None, text);
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']).trim_end_matches([' ', '\t']) == "---" {
            // The block excludes the line break before the closing rule, as in frontmatter.ts.
            let block = &rest[..offset];
            let block = block.strip_suffix('\n').unwrap_or(block);
            let block = block.strip_suffix('\r').unwrap_or(block);
            let keyed = |l: &str| {
                l.split_once(':')
                    .is_some_and(|(k, _)| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
            };
            if !block.is_empty() && !block.lines().any(keyed) {
                return (None, text); // a horizontal rule, not frontmatter
            }
            let title = block
                .lines()
                .find_map(|l| l.strip_prefix("title:"))
                .map(|v| unquote(v.trim()))
                .filter(|v| !v.is_empty() && !(v.starts_with('[') && v.ends_with(']')));
            return (title, &rest[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, text)
}

/// "[[Target|label]]" reads as "label" and "[[Target]]" as "Target", as the reader shows them. Matches the wiki
/// tokenizer in parser.ts: one line, a target without `]` or `|`, an optional label without `]`.
fn strip_wiki(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("[[") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let target_len = after.find([']', '|', '\n']).unwrap_or(after.len());
        let (target, tail) = after.split_at(target_len);
        let link = match tail.strip_prefix('|') {
            Some(t) => {
                let n = t.find([']', '\n']).unwrap_or(t.len());
                t[n..].strip_prefix("]]").filter(|_| n > 0).map(|after_link| (&t[..n], after_link))
            }
            None => tail.strip_prefix("]]").map(|after_link| (target, after_link)),
        };
        match link {
            Some((shown, after_link)) if !target.is_empty() => {
                out.push_str(shown.trim());
                rest = after_link;
            }
            _ => {
                out.push('[');
                rest = &rest[start + 1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// What a reader sees: callout markers go, and runs of space become one. (Wiki links are rewritten in `extract`.)
fn tidy(raw: &str) -> String {
    let mut s = raw.to_string();
    for kind in ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] {
        s = s.replace(&format!("[!{kind}]"), "");
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Same as friendlyName in slug.ts: "Guides/getting_started.md" -> "getting started".
fn friendly_name(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    let lower = name.to_ascii_lowercase();
    let stem = [".markdown", ".md", ".txt"]
        .iter()
        .find(|ext| lower.ends_with(**ext))
        .map_or(name, |ext| &name[..name.len() - ext.len()]);
    let mut out = String::new();
    let mut joined = false;
    for c in stem.chars() {
        if c == '-' || c == '_' {
            if !joined {
                out.push(' ');
                joined = true;
            }
        } else {
            out.push(c);
            joined = false;
        }
    }
    out
}

/// Appends to the heading being read, or else to the text of the current section.
fn put(drafts: &mut [(u8, String, String)], in_heading: bool, s: &str) {
    let d = drafts.last_mut().expect("never empty");
    if in_heading { d.1.push_str(s) } else { d.2.push_str(s) }
}

/// Splits a document into sections the way the reader shows it, with the same heading slugs.
pub fn extract(text: &str, path: &str) -> DocEntry {
    let (fm_title, body) = split_frontmatter(text);
    // (level, heading, text): the text before any heading, then one entry per heading in order.
    let mut drafts: Vec<(u8, String, String)> = vec![(0, String::new(), String::new())];
    let mut in_heading = false;
    let mut in_code_block = false;
    // Consecutive plain text, which the parser may split at "[". Wiki links are rewritten on the whole run:
    // never across a break and never in code.
    let mut run = String::new();
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    for event in Parser::new_ext(body, options) {
        if let Event::Text(t) = &event {
            if !in_code_block {
                run.push_str(t);
                continue;
            }
        }
        put(&mut drafts, in_heading, &strip_wiki(&std::mem::take(&mut run)));
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                drafts.push((level_number(level), String::new(), String::new()));
                in_heading = true;
            }
            Event::End(TagEnd::Heading(_)) => in_heading = false,
            Event::Start(Tag::CodeBlock(_)) => in_code_block = true,
            Event::Text(t) | Event::Code(t) => put(&mut drafts, in_heading, &t),
            // Line breaks and the ends of paragraphs, list items, table cells and code blocks separate words.
            Event::SoftBreak
            | Event::HardBreak
            | Event::End(TagEnd::Paragraph | TagEnd::Item | TagEnd::TableCell) => put(&mut drafts, in_heading, " "),
            Event::End(TagEnd::CodeBlock) => {
                in_code_block = false;
                put(&mut drafts, in_heading, " ");
            }
            _ => {}
        }
    }
    put(&mut drafts, in_heading, &strip_wiki(&run));
    let mut slugger = Slugger::default();
    let mut sections = Vec::new();
    for (level, heading, text) in drafts {
        let heading = tidy(&heading);
        let text = tidy(&text);
        if level == 0 {
            if !text.is_empty() {
                sections.push(Section::new(String::new(), heading, 0, text));
            }
        } else {
            sections.push(Section::new(slugger.next(&heading), heading, level, text));
        }
    }
    let title = fm_title
        .or_else(|| sections.iter().find(|s| s.level == 1 && !s.heading.is_empty()).map(|s| s.heading.clone()))
        .unwrap_or_else(|| friendly_name(path));
    DocEntry { title_f: fold(&title), title, sections }
}

pub const MAX_QUERY_CHARS: usize = 200;
pub const MAX_RESULTS: usize = 100;
const HITS_SHOWN: usize = 3;

/// Where to search, as the Search screen sends it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Scope {
    All,
    Collection {
        #[serde(rename = "collectionId")]
        collection_id: String,
    },
    Document {
        #[serde(rename = "collectionId")]
        collection_id: String,
        path: String,
    },
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filters {
    pub headings_only: bool,
    pub whole_words: bool,
    /// A top-level folder of the collection, or "" for all of it.
    pub folder: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub slug: String,
    pub heading: String,
    pub level: u8,
    pub snippet: String,
    pub heading_match: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub collection_id: String,
    pub path: String,
    pub title: String,
    pub title_match: bool,
    /// Every matching section; `hits` holds the best three.
    pub total: usize,
    pub hits: Vec<Hit>,
    #[serde(skip)]
    pub score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    /// True while a folder in scope is still being indexed, so results may be incomplete.
    pub indexing: bool,
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Byte offset of `needle` in `hay` (both folded). "Whole words" wants no letter, digit or _ on either side.
fn find(hay: &str, needle: &str, whole: bool) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    if !whole {
        return hay.find(needle);
    }
    hay.match_indices(needle).map(|(i, _)| i).find(|&i| {
        let before = hay[..i].chars().next_back().map_or(true, |c| !is_word(c));
        let after = hay[i + needle.len()..].chars().next().map_or(true, |c| !is_word(c));
        before && after
    })
}

/// About 200 characters of the section around the first matching word, cut at a space.
fn snippet(text: &str, text_f: &str, words: &[&str], whole: bool) -> String {
    let at_byte = words.iter().filter_map(|w| find(text_f, w, whole)).min().unwrap_or(0);
    let at = text_f[..at_byte].chars().count(); // folding keeps character positions
    let mut start = at.saturating_sub(70);
    if start > 0 {
        start = text.chars().skip(start).position(|c| c == ' ').map_or(start, |i| start + i + 1).min(at);
    }
    let mut window = text.chars().skip(start);
    let body: String = window.by_ref().take(200).collect();
    format!("{}{body}{}", if start > 0 { "… " } else { "" }, if window.next().is_some() { " …" } else { "" })
}

/// A document that matched: only its scores are worked out until it is known to make the cut.
struct Found<'a> {
    collection_id: &'a str,
    path: &'a str,
    doc: &'a DocEntry,
    /// (score, section, heading matched), in document order.
    hits: Vec<(u32, &'a Section, bool)>,
    title_match: bool,
    score: f64,
}

/// The prototype's searchDocs: a section matches on the phrase or on all its words; headings and titles rank first.
pub fn search_docs<'a>(
    docs: impl IntoIterator<Item = (&'a str, &'a str, &'a DocEntry)>,
    query: &str,
    filters: &Filters,
) -> Vec<SearchResult> {
    let folded = fold(&query.trim().chars().take(MAX_QUERY_CHARS).collect::<String>());
    let phrase = folded.trim();
    if phrase.is_empty() {
        return Vec::new();
    }
    let words: Vec<&str> = phrase.split_whitespace().collect();
    let whole = filters.whole_words;
    let has = |hay: &str, needle: &str| find(hay, needle, whole).is_some();
    let folder = format!("{}/", filters.folder);
    let mut found: Vec<Found> = Vec::new();
    for (collection_id, path, doc) in docs {
        if !filters.folder.is_empty() && !path.starts_with(&folder) {
            continue;
        }
        let mut hits: Vec<(u32, &Section, bool)> = Vec::new();
        for s in &doc.sections {
            let in_head = !s.heading.is_empty() && (has(&s.heading_f, phrase) || words.iter().all(|w| has(&s.heading_f, w)));
            let score = if filters.headings_only {
                if in_head { 10 } else { 0 }
            } else {
                let in_text = has(&s.text_f, phrase);
                let all_words = words.iter().all(|w| has(&s.text_f, w) || has(&s.heading_f, w));
                if in_head || in_text || all_words {
                    (if in_head { 10 } else { 0 }) + (if in_text { 5 } else { 1 })
                } else {
                    0
                }
            };
            if score > 0 {
                hits.push((score, s, in_head));
            }
        }
        let title_match = has(&doc.title_f, phrase);
        if hits.is_empty() && (filters.headings_only || !title_match) {
            continue;
        }
        let best = hits.iter().map(|h| h.0).max().unwrap_or(0);
        let score = (if title_match { 20.0 } else { 0.0 }) + f64::from(best) + hits.len() as f64 * 0.1;
        found.push(Found { collection_id, path, doc, hits, title_match, score });
    }
    // Ties end on collection and path, so the order never depends on how the documents were handed in.
    found.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.doc.title.cmp(&b.doc.title))
            .then_with(|| a.collection_id.cmp(b.collection_id))
            .then_with(|| a.path.cmp(b.path))
    });
    found.truncate(MAX_RESULTS);
    found
        .into_iter()
        .map(|mut f| {
            f.hits.sort_by(|a, b| b.0.cmp(&a.0)); // stable: equal scores keep document order
            let total = f.hits.len();
            let hits = f
                .hits
                .into_iter()
                .take(HITS_SHOWN)
                .map(|(_, s, in_head)| Hit {
                    slug: s.slug.clone(),
                    heading: s.heading.clone(),
                    level: s.level,
                    snippet: snippet(&s.text, &s.text_f, &words, whole),
                    heading_match: in_head,
                })
                .collect();
            SearchResult {
                collection_id: f.collection_id.to_string(),
                path: f.path.to_string(),
                title: f.doc.title.clone(),
                title_match: f.title_match,
                total,
                hits,
                score: f.score,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn headings(doc: &DocEntry) -> Vec<(u8, &str, &str)> {
        doc.sections.iter().map(|s| (s.level, s.slug.as_str(), s.heading.as_str())).collect()
    }

    #[test]
    fn slugs_follow_the_shared_cases() {
        let cases: Value = serde_json::from_str(include_str!("../../tests/fixtures/slug-cases.json")).unwrap();
        for case in cases["single"].as_array().unwrap() {
            assert_eq!(slugify(case[0].as_str().unwrap()), case[1].as_str().unwrap(), "slug of {case}");
        }
        for case in cases["sequences"].as_array().unwrap() {
            let mut slugger = Slugger::default();
            let got: Vec<String> = case["in"].as_array().unwrap().iter().map(|t| slugger.next(t.as_str().unwrap())).collect();
            let want: Vec<&str> = case["out"].as_array().unwrap().iter().map(|t| t.as_str().unwrap()).collect();
            assert_eq!(got, want);
        }
    }

    #[test]
    fn splits_sections_and_numbers_repeated_headings() {
        let doc = extract("# Guide\nIntro text.\n\n## Setup\nStep one.\n\n## Setup\nAgain.\n", "Guide.md");
        assert_eq!(doc.title, "Guide");
        assert_eq!(headings(&doc), [(1, "guide", "Guide"), (2, "setup", "Setup"), (2, "setup-1", "Setup")]);
        assert_eq!(doc.sections[1].text, "Step one.");
    }

    #[test]
    fn keeps_text_before_the_first_heading() {
        let doc = extract("Opening words.\n\n# Title\nBody.", "a.md");
        let first = &doc.sections[0];
        assert_eq!((first.level, first.slug.as_str(), first.text.as_str()), (0, "", "Opening words."));
    }

    #[test]
    fn code_blocks_are_text_not_headings() {
        let doc = extract("```\n# not a heading\n```\n\n# Real\n", "a.md");
        assert_eq!(headings(&doc), [(0, "", ""), (1, "real", "Real")]);
        assert_eq!(doc.sections[0].text, "# not a heading");
    }

    #[test]
    fn underlined_headings_count() {
        let doc = extract("Title\n=====\n\nBody text.\n", "a.md");
        assert_eq!(headings(&doc), [(1, "title", "Title")]);
    }

    #[test]
    fn frontmatter_title_wins_and_is_not_searched() {
        let doc = extract("---\ntitle: \"Wi-Fi Guide\"\ntags: [net, help]\n---\n# Other\nBody.", "a.md");
        assert_eq!(doc.title, "Wi-Fi Guide");
        assert!(doc.sections.iter().all(|s| !s.text.contains("tags")));
    }

    #[test]
    fn a_leading_rule_is_not_frontmatter() {
        let doc = extract("---\n\nJust a rule above.\n\n# Heading\n", "a.md");
        assert_eq!(doc.title, "Heading");
        assert_eq!(doc.sections[0].text, "Just a rule above.");
    }

    #[test]
    fn wiki_links_show_their_label() {
        let doc = extract("# See [[Security|the guide]]\nRead [[Glossary]] and [[Guides/Intro#Wi-Fi]].", "a.md");
        assert_eq!((doc.sections[0].slug.as_str(), doc.sections[0].heading.as_str()), ("see-the-guide", "See the guide"));
        assert_eq!(doc.sections[0].text, "Read Glossary and Guides/Intro#Wi-Fi.");
    }

    #[test]
    fn a_rule_pair_without_keys_is_not_frontmatter() {
        let doc = extract("---\n\nJust text.\n\n---\n# H", "a.md");
        assert_eq!(doc.title, "H");
        assert_eq!(doc.sections[0].text, "Just text.");
    }

    #[test]
    fn an_empty_frontmatter_block_is_frontmatter() {
        assert_eq!(split_frontmatter("---\n\n---\n# H"), (None, "# H"));
        assert_eq!(split_frontmatter("---\n---\n# H"), (None, "# H"));
    }

    #[test]
    fn wiki_links_are_left_alone_in_code_and_across_lines() {
        let doc = extract("```\nif [[ -n $x || -z $y ]]; then\n```\n\nText [[a\nb]] and [[x]].\n", "a.md");
        assert_eq!(doc.sections[0].text, "if [[ -n $x || -z $y ]]; then Text [[a b]] and x.");
        let doc = extract("# Use `[[a|b]]` here\nBody.", "a.md");
        assert_eq!((doc.sections[0].heading.as_str(), doc.sections[0].slug.as_str()), ("Use [[a|b]] here", "use-ab-here"));
    }

    #[test]
    fn callout_markers_are_dropped() {
        assert_eq!(extract("> [!NOTE]\n> Keep it short.\n", "a.md").sections[0].text, "Keep it short.");
    }

    #[test]
    fn title_falls_back_to_the_file_name() {
        assert_eq!(extract("No headings here.", "Guides/getting_started-now.md").title, "getting started now");
    }

    #[test]
    fn table_cells_and_list_items_stay_separate_words() {
        let doc = extract("| a | b |\n|---|---|\n| one | two |\n\n- first\n- second\n", "a.md");
        assert_eq!(doc.sections[0].text, "a b one two first second");
    }

    fn doc(text: &str) -> DocEntry {
        extract(text, "doc.md")
    }

    fn run(docs: &[(&str, &str, &DocEntry)], q: &str, f: &Filters) -> Vec<SearchResult> {
        search_docs(docs.iter().map(|(c, p, d)| (*c, *p, *d)), q, f)
    }

    fn opts() -> Filters {
        Filters::default()
    }

    #[test]
    fn ranks_title_and_heading_matches_first() {
        let a = doc("# Printing\nHow to print a page.");
        let b = doc("# Welcome\nYou can find printing help later.");
        let res = run(&[("c", "b.md", &b), ("c", "a.md", &a)], "printing", &opts());
        assert_eq!(res.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), ["a.md", "b.md"]);
        assert!(res[0].title_match && res[0].hits[0].heading_match);
    }

    #[test]
    fn all_words_in_any_order_match() {
        let d = doc("# Network\nThe guest password changes weekly.");
        assert_eq!(run(&[("c", "d.md", &d)], "weekly password", &opts()).len(), 1);
        assert!(run(&[("c", "d.md", &d)], "weekly modem", &opts()).is_empty());
    }

    #[test]
    fn headings_only_ignores_body_text() {
        let d = doc("# Network\nPrinting is elsewhere.");
        let f = Filters { headings_only: true, ..opts() };
        assert!(run(&[("c", "d.md", &d)], "printing", &f).is_empty());
        assert_eq!(run(&[("c", "d.md", &d)], "network", &f).len(), 1);
    }

    #[test]
    fn whole_words_skip_longer_words() {
        let d = doc("# Help\nThe printer is upstairs.");
        assert_eq!(run(&[("c", "d.md", &d)], "print", &opts()).len(), 1);
        assert!(run(&[("c", "d.md", &d)], "print", &Filters { whole_words: true, ..opts() }).is_empty());
    }

    #[test]
    fn folder_filter_keeps_that_folder_only() {
        let d = doc("# Wi-Fi\nConnect here.");
        let f = Filters { folder: "Guides".into(), ..opts() };
        let res = run(&[("c", "Guides/a.md", &d), ("c", "Guidesx/b.md", &d), ("c", "c.md", &d)], "wi-fi", &f);
        assert_eq!(res.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), ["Guides/a.md"]);
    }

    #[test]
    fn ignores_case_including_accented_letters() {
        let d = doc("# Café\nOpen daily.");
        assert_eq!(run(&[("c", "d.md", &d)], "CAFÉ", &opts()).len(), 1);
    }

    #[test]
    fn special_characters_match_literally() {
        let d = doc("# Pricing\nC++ (beta) costs $5.");
        assert_eq!(run(&[("c", "d.md", &d)], "c++ (beta)", &opts()).len(), 1);
        assert_eq!(run(&[("c", "d.md", &d)], "$5", &opts()).len(), 1);
    }

    #[test]
    fn snippets_show_the_match_in_long_text_without_splitting_characters() {
        let long = format!("{} needle {}", "日本語 ".repeat(60), "émoji 🎉 ".repeat(60));
        let d = doc(&format!("# T\n{long}"));
        let res = run(&[("c", "d.md", &d)], "NEEDLE", &opts());
        let hit = &res[0].hits[0];
        assert!(hit.snippet.starts_with("… ") && hit.snippet.ends_with(" …"));
        assert!(hit.snippet.contains("needle"));
        assert!(hit.snippet.chars().count() <= 205);
    }

    #[test]
    fn title_alone_can_match() {
        let d = doc("---\ntitle: Wi-Fi Guide\n---\nNothing else.");
        let res = run(&[("c", "d.md", &d)], "wi-fi guide", &opts());
        assert_eq!((res.len(), res[0].title_match, res[0].hits.len()), (1, true, 0));
    }

    #[test]
    fn empty_and_space_only_queries_find_nothing() {
        let d = doc("# A\nB");
        assert!(run(&[("c", "d.md", &d)], "   ", &opts()).is_empty());
    }

    #[test]
    fn shows_three_hits_and_counts_the_rest() {
        let d = doc("# One\nlamp\n# Two\nlamp\n# Three\nlamp\n# Four\nlamp");
        let res = run(&[("c", "d.md", &d)], "lamp", &opts());
        assert_eq!((res[0].total, res[0].hits.len()), (4, 3));
        assert_eq!(res[0].hits[0].slug, "one"); // equal scores keep document order
    }

    #[test]
    fn caps_the_number_of_documents() {
        let d = doc("# Lamp\nlamp");
        let paths: Vec<String> = (0..150).map(|i| format!("{i}.md")).collect();
        let docs: Vec<(&str, &str, &DocEntry)> = paths.iter().map(|p| ("c", p.as_str(), &d)).collect();
        assert_eq!(search_docs(docs, "lamp", &opts()).len(), MAX_RESULTS);
    }

    #[test]
    fn scope_and_filters_arrive_from_the_screens() {
        let s: Scope = serde_json::from_str(r#"{"kind":"document","collectionId":"c1","path":"a.md"}"#).unwrap();
        assert_eq!(s, Scope::Document { collection_id: "c1".into(), path: "a.md".into() });
        let f: Filters = serde_json::from_str(r#"{"wholeWords":true}"#).unwrap();
        assert!(f.whole_words && !f.headings_only && f.folder.is_empty());
    }

    #[test]
    fn results_reach_the_screens_in_camel_case() {
        let d = doc("# Lamp\nlamp");
        let v = serde_json::to_value(&run(&[("c", "d.md", &d)], "lamp", &opts())[0]).unwrap();
        assert_eq!(v["collectionId"], "c");
        assert_eq!(v["titleMatch"], true);
        assert_eq!(v["hits"][0]["headingMatch"], true);
        assert!(v.get("score").is_none());
    }

    #[test]
    fn a_long_query_is_cut_to_200_characters() {
        let d = doc(&format!("# T
{}", "日".repeat(200)));
        assert_eq!(run(&[("c", "d.md", &d)], &"日".repeat(300), &opts()).len(), 1);
    }

    #[test]
    fn ties_come_back_in_a_fixed_order() {
        let d = doc("# Lamp
lamp");
        let all = [("b", "z.md", &d), ("a", "z.md", &d), ("b", "a.md", &d), ("a", "a.md", &d)];
        let want = [("a", "a.md"), ("a", "z.md"), ("b", "a.md"), ("b", "z.md")];
        for order in [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1]] {
            let docs: Vec<_> = order.iter().map(|&i| all[i]).collect();
            let got: Vec<_> = run(&docs, "lamp", &opts()).iter().map(|r| (r.collection_id.clone(), r.path.clone())).collect();
            assert_eq!(got, want.map(|(c, p)| (c.to_string(), p.to_string())));
        }
    }

    #[test]
    #[ignore = "speed check: cargo test --release search_speed -- --ignored"]
    fn search_speed_5000_documents() {
        // Every document matches, with the query at the end of one 20 KB section, so snippets must only be built for the 100 shown.
        let big = "words of plain text about the library and its halls ".repeat(400);
        let d = doc(&format!("# Handbook
{big} many rooms at the end"));
        let paths: Vec<String> = (0..5000).map(|i| format!("{i}.md")).collect();
        let docs: Vec<(&str, &str, &DocEntry)> = paths.iter().map(|p| ("c", p.as_str(), &d)).collect();
        let started = std::time::Instant::now();
        let res = search_docs(docs, "many rooms", &opts());
        assert_eq!(res.len(), MAX_RESULTS);
        assert!(started.elapsed().as_millis() < 200, "took {:?}", started.elapsed());
    }
}
