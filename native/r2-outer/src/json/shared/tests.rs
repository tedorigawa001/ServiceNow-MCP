use super::*;
use serde::Deserialize;
use std::{cell::Cell, rc::Rc};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stop {
    Deadline,
    Cancelled,
    Limit,
    Existing,
}
struct Synthetic {
    checks: usize,
    fail_at: usize,
    reason: Stop,
    first: Option<Stop>,
    used: u64,
    cap: u64,
    signal: Rc<Cell<Option<Stop>>>,
}
impl Default for Synthetic {
    fn default() -> Self {
        Self {
            checks: 0,
            fail_at: usize::MAX,
            reason: Stop::Deadline,
            first: None,
            used: 0,
            cap: 1_000_000,
            signal: Rc::new(Cell::new(None)),
        }
    }
}
impl Budget for Synthetic {
    type Failure = Stop;
    fn checkpoint(&mut self) -> Result<(), Stop> {
        self.checks += 1;
        if self.first.is_none() {
            if self.checks == self.fail_at {
                self.first = Some(self.reason);
            } else if let Some(reason) = self.signal.get() {
                self.first = Some(reason);
            }
        }
        self.first.map_or(Ok(()), Err)
    }
    fn work(&mut self, units: u64) -> Result<(), Stop> {
        self.checkpoint()?;
        let Some(total) = self.used.checked_add(units).filter(|n| *n <= self.cap) else {
            self.first = Some(Stop::Limit);
            return Err(Stop::Limit);
        };
        self.used = total;
        Ok(())
    }
}
fn limits() -> Limits {
    Limits {
        max_bytes: 65536,
        max_depth: 16,
        max_items: 65536,
    }
}
fn parse(bytes: &[u8]) -> Result<Value, Rejection<Stop>> {
    decode(bytes, limits(), &mut Synthetic::default())
}
#[test]
fn valid_scalars_arrays_objects_and_unicode_match_legacy() {
    for b in [
        b"null".as_slice(),
        b"true",
        b"-2",
        b"1.25",
        br#"{"a":[0,false,"\u65e5\u672c"],"b":{}}"#,
    ] {
        assert_eq!(parse(b).unwrap(), crate::json::decode::<Value>(b).unwrap());
    }
}
#[test]
fn duplicate_decoded_keys_are_rejected_at_every_depth() {
    for b in [
        br#"{"a":1,"a":2}"#.as_slice(),
        br#"{"a":1,"\u0061":2}"#,
        br#"{"x":{"a":1,"a":2}}"#,
    ] {
        assert_eq!(parse(b), Err(Rejection::InvalidRecord));
    }
}
#[test]
fn malformed_utf8_trailing_and_numbers_do_not_expose_parser_text() {
    for b in [
        b"{".as_slice(),
        b"true false",
        b"\xff",
        b"[1,]",
        b"1e9999",
        b"NaN",
    ] {
        assert_eq!(parse(b), Err(Rejection::InvalidRecord));
    }
}
#[derive(Deserialize, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
struct Record {
    name: String,
}
#[test]
fn typed_unknown_missing_and_wrong_fields_remain_strict() {
    for b in [
        br#"{"name":"ok","secret":"marker"}"#.as_slice(),
        br#"{}"#,
        br#"{"name":1}"#,
    ] {
        let e = decode::<Record, _>(b, limits(), &mut Synthetic::default()).unwrap_err();
        assert_eq!(e, Rejection::InvalidRecord);
        assert_eq!(format!("{e:?}"), "InvalidRecord");
    }
}
#[test]
fn exact_byte_limit_is_inclusive_and_over_limit_is_typed() {
    let l = Limits {
        max_bytes: 2,
        ..limits()
    };
    let mut b = Synthetic::default();
    assert!(decode::<Value, _>(b"{}", l, &mut b).is_ok());
    assert_eq!(
        decode::<Value, _>(b"{} ", l, &mut b),
        Err(Rejection::Limit(Limit::Bytes))
    );
}
#[test]
fn depth_sixteen_and_policy_eight_have_separate_exact_boundaries() {
    for depth in [8, 16] {
        let l = Limits {
            max_depth: depth,
            ..limits()
        };
        let s = format!("{}0{}", "[".repeat(depth), "]".repeat(depth));
        assert!(decode::<Value, _>(s.as_bytes(), l, &mut Synthetic::default()).is_ok());
        let s = format!("[{}]", s);
        assert_eq!(
            decode::<Value, _>(s.as_bytes(), l, &mut Synthetic::default()),
            Err(Rejection::Limit(Limit::Depth))
        );
    }
}
#[test]
fn container_rejects_excess_subtree_before_decoding_it() {
    let l = Limits {
        max_items: 1,
        ..limits()
    };
    for bytes in [b"[0,{malformed".as_slice(), br#"{"a":0,"b":{"malformed"#] {
        assert_eq!(
            decode::<Value, _>(bytes, l, &mut Synthetic::default()),
            Err(Rejection::Limit(Limit::Container))
        );
    }
}
#[test]
fn zero_container_limit_accepts_empty_containers_only() {
    let l = Limits {
        max_items: 0,
        ..limits()
    };
    for bytes in [b"[]".as_slice(), b"{}"] {
        assert!(decode::<Value, _>(bytes, l, &mut Synthetic::default()).is_ok());
    }
    for bytes in [b"[0]".as_slice(), br#"{"x":0}"#] {
        assert_eq!(
            decode::<Value, _>(bytes, l, &mut Synthetic::default()),
            Err(Rejection::Limit(Limit::Container))
        );
    }
}
#[test]
fn unsupported_limits_are_rejected_before_parsing() {
    for l in [
        Limits {
            max_bytes: 16 * 1024 * 1024 + 1,
            ..limits()
        },
        Limits {
            max_depth: 17,
            ..limits()
        },
        Limits {
            max_items: 100001,
            ..limits()
        },
    ] {
        assert_eq!(
            decode::<Value, _>(b"{}", l, &mut Synthetic::default()),
            Err(Rejection::Limit(Limit::Configuration))
        );
    }
}
#[test]
fn preexisting_stop_wins_over_invalid_syntax_and_byte_limit() {
    let mut b = Synthetic {
        first: Some(Stop::Existing),
        ..Synthetic::default()
    };
    assert_eq!(
        decode::<Value, _>(
            b"malformed",
            Limits {
                max_bytes: 0,
                ..limits()
            },
            &mut b
        ),
        Err(Rejection::Budget(Stop::Existing))
    );
    assert_eq!(b.used, 0);
}
#[test]
fn all_checkpoint_deadlines_and_cancellations_preserve_typed_reason() {
    let bytes = br#"{"a":[1,2,{"b":"text"}],"c":null}"#;
    let mut normal = Synthetic::default();
    decode::<Value, _>(bytes, limits(), &mut normal).unwrap();
    assert!(normal.checks > 20);
    for reason in [Stop::Deadline, Stop::Cancelled] {
        for n in 1..=normal.checks {
            let mut b = Synthetic {
                fail_at: n,
                reason,
                ..Synthetic::default()
            };
            assert_eq!(
                decode::<Value, _>(bytes, limits(), &mut b),
                Err(Rejection::Budget(reason))
            );
            assert_eq!(b.first, Some(reason));
        }
    }
}
#[test]
fn shared_work_is_not_reset_between_documents() {
    let mut b = Synthetic {
        cap: 8,
        ..Synthetic::default()
    };
    assert!(decode::<Value, _>(b"{}", limits(), &mut b).is_ok());
    let used = b.used;
    assert!(used > 0);
    let mut rejected = false;
    for _ in 0..8 {
        if decode::<Value, _>(b"{}", limits(), &mut b) == Err(Rejection::Budget(Stop::Limit)) {
            rejected = true;
            break;
        }
    }
    assert!(rejected);
    assert!(b.used <= 8);
}
#[test]
fn work_overflow_is_typed_and_latched() {
    let mut b = Synthetic {
        used: u64::MAX,
        cap: u64::MAX,
        ..Synthetic::default()
    };
    assert_eq!(
        decode::<Value, _>(b"{}", limits(), &mut b),
        Err(Rejection::Budget(Stop::Limit))
    );
    assert_eq!(b.first, Some(Stop::Limit));
}
#[test]
fn long_strings_and_keys_consume_chunk_work() {
    let mut b = Synthetic::default();
    let bytes = format!("{{\"{}\":\"{}\"}}", "k".repeat(65537), "v".repeat(65537));
    assert!(
        decode::<Value, _>(
            bytes.as_bytes(),
            Limits {
                max_bytes: bytes.len(),
                ..limits()
            },
            &mut b
        )
        .is_ok()
    );
    assert!(b.used >= 10);
}
thread_local! {static SIGNAL:std::cell::RefCell<Option<Rc<Cell<Option<Stop>>>>>=const{std::cell::RefCell::new(None)};}
thread_local! {static LATE_STOP:Cell<Stop>=const{Cell::new(Stop::Cancelled)};}
#[derive(Debug)]
struct LateTyped;
impl<'de> serde::Deserialize<'de> for LateTyped {
    fn deserialize<D: serde::Deserializer<'de>>(_: D) -> Result<Self, D::Error> {
        SIGNAL.with(|slot| {
            slot.borrow()
                .as_ref()
                .unwrap()
                .set(Some(LATE_STOP.with(Cell::get)))
        });
        Err(serde::de::Error::custom("secret marker must not escape"))
    }
}
#[test]
fn cancellation_or_deadline_during_typed_conversion_wins_over_serde_error() {
    for reason in [Stop::Cancelled, Stop::Deadline] {
        let mut b = Synthetic::default();
        LATE_STOP.with(|slot| slot.set(reason));
        SIGNAL.with(|slot| *slot.borrow_mut() = Some(b.signal.clone()));
        let out = decode::<LateTyped, _>(b"{}", limits(), &mut b);
        SIGNAL.with(|slot| *slot.borrow_mut() = None);
        assert!(matches!(out, Err(Rejection::Budget(e)) if e==reason));
    }
}
#[test]
fn legacy_failures_remain_invalid_record_not_new_typed_results() {
    assert_eq!(
        crate::json::decode_bounded::<Value>(b"[]", 1, 1, std::time::Instant::now()),
        Err(crate::Failure::InvalidRecord)
    );
    assert_eq!(
        crate::json::decode_bounded::<Value>(
            b"{}",
            8,
            4,
            std::time::Instant::now() - std::time::Duration::from_secs(10)
        ),
        Err(crate::Failure::InvalidRecord)
    );
}
