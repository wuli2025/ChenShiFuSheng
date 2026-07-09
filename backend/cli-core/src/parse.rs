//! 两个引擎的流式输出解析器。
//!
//! claude: `--output-format stream-json --verbose` → 每行一个 JSON，`type=result` 收尾。
//! codex:  `exec --json` → JSONL，按 `item.id` 增量去重（否则同一条消息重复发 delta）。

use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum CliEvent {
    Delta(String),
    Tool { name: String, arg: Value },
    /// 引擎自报的收尾。`turn_failed` 独立于退出码。
    Done { text: String, turn_failed: bool },
    Ignored,
}

pub trait StreamParser: Send {
    fn feed_line(&mut self, line: &str) -> CliEvent;
}

// ---------------------------------------------------------------- claude

#[derive(Default)]
pub struct ClaudeParser;

impl StreamParser for ClaudeParser {
    fn feed_line(&mut self, line: &str) -> CliEvent {
        let line = line.trim();
        if line.is_empty() {
            return CliEvent::Ignored;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return CliEvent::Ignored;
        };
        match v.get("type").and_then(Value::as_str) {
            Some("assistant") => {
                // message.content[] 里挑 text / tool_use
                let content = v
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut buf = String::new();
                for c in &content {
                    match c.get("type").and_then(Value::as_str) {
                        Some("text") => {
                            if let Some(t) = c.get("text").and_then(Value::as_str) {
                                buf.push_str(t);
                            }
                        }
                        Some("tool_use") => {
                            let name = c
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("tool")
                                .to_string();
                            let arg = c.get("input").cloned().unwrap_or(Value::Null);
                            return CliEvent::Tool { name, arg };
                        }
                        _ => {}
                    }
                }
                if buf.is_empty() {
                    CliEvent::Ignored
                } else {
                    CliEvent::Delta(buf)
                }
            }
            Some("result") => {
                let text = v
                    .get("result")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let turn_failed = v
                    .get("is_error")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                    || v.get("subtype").and_then(Value::as_str) == Some("error_during_execution");
                CliEvent::Done { text, turn_failed }
            }
            _ => CliEvent::Ignored,
        }
    }
}

// ---------------------------------------------------------------- codex

/// codex 的 item 会带着**全量文本**反复出现。必须按 item.id 记住已发长度，
/// 只发增量，否则 UI 上同一句话刷屏。（chat.rs::handle_codex_event 的核心逻辑）
#[derive(Default)]
pub struct CodexParser {
    sent: HashMap<String, usize>,
}

impl StreamParser for CodexParser {
    fn feed_line(&mut self, line: &str) -> CliEvent {
        let line = line.trim();
        if line.is_empty() {
            return CliEvent::Ignored;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            // codex 的 stderr/非 JSON 行由调用方按日志处理
            return CliEvent::Ignored;
        };

        let kind = v.get("type").and_then(Value::as_str).unwrap_or("");

        if kind == "turn.completed" {
            return CliEvent::Done {
                text: String::new(),
                turn_failed: false,
            };
        }
        if kind == "turn.failed" {
            let reason = v
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("codex turn.failed")
                .to_string();
            return CliEvent::Done {
                text: reason,
                turn_failed: true,
            };
        }

        // item.started / item.updated / item.completed
        let Some(item) = v.get("item") else {
            return CliEvent::Ignored;
        };
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        match item.get("item_type").and_then(Value::as_str) {
            Some("agent_message") | Some("assistant_message") => {
                let full = item.get("text").and_then(Value::as_str).unwrap_or_default();
                let already = self.sent.get(&id).copied().unwrap_or(0);
                if full.len() > already {
                    let delta = full[already..].to_string();
                    self.sent.insert(id, full.len());
                    return CliEvent::Delta(delta);
                }
                CliEvent::Ignored
            }
            Some("command_execution") => {
                let cmd = item
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if self.sent.insert(id, 1).is_none() {
                    CliEvent::Tool {
                        name: "bash".into(),
                        arg: Value::String(cmd.to_string()),
                    }
                } else {
                    CliEvent::Ignored
                }
            }
            Some(other) => {
                if self.sent.insert(id, 1).is_none() {
                    CliEvent::Tool {
                        name: other.to_string(),
                        arg: item.clone(),
                    }
                } else {
                    CliEvent::Ignored
                }
            }
            None => CliEvent::Ignored,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_result_and_text() {
        let mut p = ClaudeParser;
        let e = p.feed_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"你好"}]}}"#,
        );
        assert_eq!(e, CliEvent::Delta("你好".into()));
        let e = p.feed_line(r#"{"type":"result","result":"done","is_error":false}"#);
        assert_eq!(
            e,
            CliEvent::Done {
                text: "done".into(),
                turn_failed: false
            }
        );
    }

    #[test]
    fn claude_is_error_marks_turn_failed() {
        let mut p = ClaudeParser;
        let e = p.feed_line(r#"{"type":"result","result":"boom","is_error":true}"#);
        match e {
            CliEvent::Done { turn_failed, .. } => assert!(turn_failed),
            _ => panic!("expect Done"),
        }
    }

    /// 这是 codex 最容易踩的坑：同一 item 重复推全量文本。
    #[test]
    fn codex_dedups_by_item_id() {
        let mut p = CodexParser::default();
        let l1 = r#"{"type":"item.updated","item":{"id":"i1","item_type":"agent_message","text":"你好"}}"#;
        let l2 = r#"{"type":"item.updated","item":{"id":"i1","item_type":"agent_message","text":"你好世界"}}"#;
        let l3 = r#"{"type":"item.completed","item":{"id":"i1","item_type":"agent_message","text":"你好世界"}}"#;
        assert_eq!(p.feed_line(l1), CliEvent::Delta("你好".into()));
        assert_eq!(p.feed_line(l2), CliEvent::Delta("世界".into()));
        assert_eq!(p.feed_line(l3), CliEvent::Ignored); // 不重复
    }

    #[test]
    fn codex_turn_failed() {
        let mut p = CodexParser::default();
        let e = p.feed_line(r#"{"type":"turn.failed","error":{"message":"额度不足"}}"#);
        match e {
            CliEvent::Done { turn_failed, text } => {
                assert!(turn_failed);
                assert_eq!(text, "额度不足");
            }
            _ => panic!("expect Done"),
        }
    }

    #[test]
    fn garbage_lines_are_ignored() {
        let mut p = CodexParser::default();
        assert_eq!(p.feed_line("2026-07-09 INFO tracing noise"), CliEvent::Ignored);
        assert_eq!(p.feed_line(""), CliEvent::Ignored);
    }
}
