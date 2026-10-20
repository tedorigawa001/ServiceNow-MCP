use super::*;
use crate::record_validation::tests::{Fixture, context, fixture, hash};
use serde_json::{Value, json};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stop {
    Deadline,
    Cancelled,
    Limit,
    Existing,
}
struct Meter {
    work: u64,
    cap: u64,
    checks: usize,
    fail: usize,
    first: Option<Stop>,
    reason: Stop,
}
impl Default for Meter {
    fn default() -> Self {
        Self {
            work: 0,
            cap: 1_000_000,
            checks: 0,
            fail: usize::MAX,
            first: None,
            reason: Stop::Deadline,
        }
    }
}
impl Budget for Meter {
    type Failure = Stop;
    fn checkpoint(&mut self) -> Result<(), Stop> {
        self.checks += 1;
        if self.checks == self.fail && self.first.is_none() {
            self.first = Some(self.reason);
        }
        self.first.map_or(Ok(()), Err)
    }
    fn work(&mut self, n: u64) -> Result<(), Stop> {
        self.checkpoint()?;
        let Some(total) = self.work.checked_add(n).filter(|v| *v <= self.cap) else {
            self.first = Some(Stop::Limit);
            return Err(Stop::Limit);
        };
        self.work = total;
        Ok(())
    }
}
fn run<'a>(
    f: &'a Fixture,
    pins: &'a Pins<'a>,
    c: &'a Context<'a>,
    b: &mut Meter,
) -> Result<Profiled<'a>, Error<Stop>> {
    validate_profiled(&f.a, &f.l, &f.registry, pins, c, b)
}
fn rejection(e: Error<Stop>) -> Option<Stop> {
    match e {
        Error::Record(Rejection::Budget(e) | Rejection::Json(shared::Rejection::Budget(e))) => {
            Some(e)
        }
        _ => None,
    }
}
// Independent oracle used ONLY in tests; the product never reparses to obtain statistics.
fn oracle(bytes: &[u8]) -> shared::JsonShape {
    fn visit(v: &Value, s: &mut shared::JsonShape) {
        s.values += 1;
        match v {
            Value::Object(o) => {
                for (k, v) in o {
                    s.keys += 1;
                    s.text_events += 1;
                    s.text += (k.len().div_ceil(65536).max(1)) as u64;
                    visit(v, s);
                }
            }
            Value::Array(a) => {
                for v in a {
                    s.arrays += 1;
                    visit(v, s);
                }
            }
            Value::String(t) => {
                s.text_events += 1;
                s.text += t.len().div_ceil(65536).max(1) as u64;
            }
            _ => (),
        }
    }
    let mut s = shared::JsonShape {
        bytes: bytes.len() as u64,
        ..Default::default()
    };
    visit(&serde_json::from_slice(bytes).unwrap(), &mut s);
    s
}
#[test]
fn kernel_fixed19_and_collection_fixed12_are_exact_not_allowances() {
    let f = fixture();
    let pins = f.pins();
    let c = context();
    let mut plain = Meter::default();
    validate(&f.a, &f.l, &f.registry, &pins, &c, &mut plain).unwrap();
    let mut b = Meter::default();
    let out = run(&f, &pins, &c, &mut b).unwrap();
    let p = &out.profile;
    let expected = [oracle(&f.a), oracle(&f.registry), oracle(&f.l)];
    assert_eq!(p.shapes, expected);
    let mut variable = 0;
    let mut events = 0;
    for s in &expected {
        let (j, h, e) = component::<Stop>(s).unwrap();
        variable += j + h;
        events += e;
    }
    // Pure validate has 17 fixed steps; the caller's projection contributes the other two.
    assert_eq!(plain.work - variable - c.groups.len() as u64 - 2, 17);
    assert_eq!(p.kernel, plain.work + 2);
    assert_eq!(p.collection, events + 12);
    assert_eq!(p.per_validation(), b.work + 2);
    assert_eq!(p.six_validations(), 6 * (b.work + 2));
    assert_eq!(
        format!("{p:?}"),
        "RecordWork(sealed_record_only_not_admission_or_execution_authority)"
    );
    assert!(out.records.inspection_parts().0.reader_gid == 80);
}
#[test]
fn groups_boundary_is_model_local_and_counts_duplicates() {
    let f = fixture();
    let pins = f.pins();
    for n in [1, 2, 1024] {
        let groups = vec![80; n];
        let mut c = context();
        c.groups = &groups;
        let mut b = Meter::default();
        let p = run(&f, &pins, &c, &mut b).unwrap();
        assert_eq!(p.profile.per_validation(), b.work + 2);
    }
    let groups = vec![80; 1025];
    let mut c = context();
    c.groups = &groups;
    let mut b = Meter::default();
    assert!(matches!(run(&f, &pins, &c, &mut b), Err(Error::Limit)));
    assert_eq!(b.work, 1);
    // The old pure contract is not silently capped; the model wrapper is stricter.
    validate(&f.a, &f.l, &f.registry, &pins, &c, &mut Meter::default()).unwrap();
    c.groups = &[];
    assert!(matches!(
        run(&f, &pins, &c, &mut Meter::default()),
        Err(Error::Record(Rejection::Binding))
    ));
}
fn rebind(f: &mut Fixture) {
    f.rh = hash(&f.registry);
    let mut l: Value = serde_json::from_slice(&f.l).unwrap();
    l["signature_registry"]["sha256"] = json!(format!("{:x}", Sha256::digest(&f.registry)));
    f.l = serde_json::to_vec(&l).unwrap();
    let mut a: Value = serde_json::from_slice(&f.a).unwrap();
    a["ledger_sha256"] = json!(format!("{:x}", Sha256::digest(&f.l)));
    f.a = serde_json::to_vec(&a).unwrap();
    f.ah = hash(&f.a);
}
#[test]
fn policies_and_dictionary_boundary_use_actual_accepted_shape() {
    for n in [2, 32] {
        let mut f = fixture();
        let mut g: Value = serde_json::from_slice(&f.registry).unwrap();
        let node = g["policies"][1].clone();
        for i in 2..n {
            let mut p = node.clone();
            p["id"] = json!(format!("extra-{i}"));
            g["policies"].as_array_mut().unwrap().push(p);
        }
        let mut dict = serde_json::Map::new();
        for i in 0..32 {
            dict.insert(
                format!("com.apple.security.test-{i}"),
                json!({"type":"boolean","value":true}),
            );
        }
        g["policies"][1]["entitlement_expectation"] = json!({"kind":"dictionary","entries":dict});
        f.registry = serde_json::to_vec(&g).unwrap();
        rebind(&mut f);
        let pins = f.pins();
        let c = context();
        let mut b = Meter::default();
        let p = run(&f, &pins, &c, &mut b).unwrap();
        assert_eq!(p.profile.shapes[1], oracle(&f.registry));
        assert_eq!(p.profile.per_validation(), b.work + 2);
    }
}
#[test]
fn whitespace_escaped_text_and_64k_record_boundary() {
    for kind in 0..3 {
        let mut f = fixture();
        // Same decoded string, larger raw input: text statistics must count decoded bytes.
        f.a = String::from_utf8(f.a)
            .unwrap()
            .replace("SYNTHETIC", "SYNTHETI\\u0043")
            .into_bytes();
        match kind {
            0 => {
                f.a.resize(65536, b' ');
                f.ah = hash(&f.a);
            }
            1 => {
                f.l.resize(65536, b' ');
                let mut a: Value = serde_json::from_slice(&f.a).unwrap();
                a["ledger_sha256"] = json!(format!("{:x}", Sha256::digest(&f.l)));
                f.a = serde_json::to_vec(&a).unwrap();
                f.ah = hash(&f.a);
            }
            _ => {
                f.registry.resize(65536, b' ');
                rebind(&mut f);
            }
        }
        let pins = f.pins();
        let c = context();
        let mut b = Meter::default();
        let p = run(&f, &pins, &c, &mut b).unwrap();
        assert_eq!(p.profile.per_validation(), b.work + 2);
        assert_eq!(
            p.profile.shapes,
            [oracle(&f.a), oracle(&f.registry), oracle(&f.l)]
        );
    }
}
#[test]
fn shape_collector_handles_arrays_primitives_and_publishes_only_accepted_typed_values() {
    let raw = br#"{"a":[true,null,1,1.5,{},[],"\u0041"],"b":""}"#;
    let limits = || shared::Limits {
        max_bytes: 65536,
        max_depth: 16,
        max_items: 65536,
    };
    let mut b = Meter::default();
    let mut collector = Collector {
        budget: &mut b,
        shapes: std::array::from_fn(|_| None),
        count: 0,
    };
    shared::decode::<Value, _>(raw, limits(), &mut collector).unwrap();
    assert_eq!(collector.shapes[0].as_ref().unwrap(), &oracle(raw));
    for invalid in [br#"{"a":1,"a":2}"#.as_slice(), br#"{} {}"#, b"{"] {
        assert!(shared::decode::<Value, _>(invalid, limits(), &mut collector).is_err());
    }
    assert!(shared::decode::<Activation, _>(b"{}", limits(), &mut collector).is_err());
    assert_eq!(collector.count, 1);
}
#[test]
fn model_guard_rejects_unknown_model_and_different_borrowed_inputs() {
    let f = fixture();
    let pins = f.pins();
    let c = context();
    let mut b = Meter::default();
    let out = run(&f, &pins, &c, &mut b).unwrap();
    let raw = [f.a.as_slice(), f.l.as_slice(), f.registry.as_slice()];
    let before = b.work;
    out.profile
        .require(MODEL_ID, raw, &pins, &c, &mut b)
        .unwrap();
    assert_eq!(b.work - before, 1);
    assert_eq!(
        out.profile.require("unknown", raw, &pins, &c, &mut b),
        Err(Error::ModelMismatch)
    );
    let copy = f.a.clone();
    assert_eq!(
        out.profile
            .require(MODEL_ID, [&copy, &f.l, &f.registry], &pins, &c, &mut b),
        Err(Error::Binding)
    );
    let other = f.pins();
    assert_eq!(
        out.profile.require(MODEL_ID, raw, &other, &c, &mut b),
        Err(Error::Binding)
    );
    let other_c = context();
    assert_eq!(
        out.profile.require(MODEL_ID, raw, &pins, &other_c, &mut b),
        Err(Error::Binding)
    );
}
#[test]
fn generic_shape_text_units_are_not_confused_with_collection_event_count() {
    // The shared visitor supports larger inputs; record profiles still reject >64KiB.
    let raw = serde_json::to_vec(&json!(["x".repeat(65537)])).unwrap();
    let limits = || shared::Limits {
        max_bytes: 131072,
        max_depth: 16,
        max_items: 32,
    };
    let mut plain = Meter::default();
    shared::decode::<Value, _>(&raw, limits(), &mut plain).unwrap();
    let mut b = Meter::default();
    let mut collector = Collector {
        budget: &mut b,
        shapes: std::array::from_fn(|_| None),
        count: 0,
    };
    shared::decode::<Value, _>(&raw, limits(), &mut collector).unwrap();
    let shape = collector.shapes[0].take().unwrap();
    assert_eq!(shape, oracle(&raw));
    assert_eq!((shape.text, shape.text_events), (2, 1));
    assert_eq!(
        b.work - plain.work,
        shape.values + shape.keys + shape.text_events + shape.arrays + 2
    );
    assert_eq!(component::<Stop>(&shape), Err(Error::Limit));
}
#[test]
fn every_new_and_existing_checkpoint_preserves_deadline_cancel_and_first_reason() {
    let f = fixture();
    let pins = f.pins();
    let c = context();
    let mut normal = Meter::default();
    run(&f, &pins, &c, &mut normal).unwrap();
    for reason in [Stop::Deadline, Stop::Cancelled] {
        for fail in 1..=normal.checks {
            let mut b = Meter {
                fail,
                reason,
                ..Default::default()
            };
            assert_eq!(
                rejection(run(&f, &pins, &c, &mut b).err().unwrap()),
                Some(reason)
            );
        }
    }
    let mut b = Meter {
        first: Some(Stop::Existing),
        ..Default::default()
    };
    assert_eq!(
        rejection(run(&f, &pins, &c, &mut b).err().unwrap()),
        Some(Stop::Existing)
    );
    assert_eq!(b.work, 0);
}
#[test]
fn exact_work_cap_one_less_and_spent_overflow_stop_without_reset() {
    let f = fixture();
    let pins = f.pins();
    let c = context();
    let mut b = Meter::default();
    run(&f, &pins, &c, &mut b).unwrap();
    let exact = b.work;
    let mut b = Meter {
        cap: exact,
        ..Default::default()
    };
    run(&f, &pins, &c, &mut b).unwrap();
    assert_eq!(
        rejection(run(&f, &pins, &c, &mut b).err().unwrap()),
        Some(Stop::Limit)
    );
    for (work, cap) in [(0, exact - 1), (u64::MAX, u64::MAX)] {
        let mut b = Meter {
            work,
            cap,
            ..Default::default()
        };
        assert_eq!(
            rejection(run(&f, &pins, &c, &mut b).err().unwrap()),
            Some(Stop::Limit)
        );
    }
}
#[test]
fn checked_arithmetic_shape_limits_and_six_fresh_validations() {
    assert_eq!(add::<Stop>(u64::MAX, 1), Err(Error::Limit));
    assert_eq!(mul::<Stop>(u64::MAX, 6), Err(Error::Limit));
    for bytes in [0, 65537] {
        assert_eq!(
            component::<Stop>(&shared::JsonShape {
                bytes,
                ..Default::default()
            }),
            Err(Error::Limit)
        );
    }
    assert_eq!(
        component::<Stop>(&shared::JsonShape {
            bytes: 1,
            values: u64::MAX,
            ..Default::default()
        }),
        Err(Error::Limit)
    );
    let f = fixture();
    let pins = f.pins();
    let c = context();
    let mut b = Meter::default();
    let start = record_validation_count();
    let mut bound = 0;
    for _ in 0..6 {
        let p = run(&f, &pins, &c, &mut b).unwrap();
        bound = p.profile.six_validations();
    }
    assert_eq!(record_validation_count() - start, 6);
    assert_eq!(bound, b.work + 12);
}
#[test]
fn authenticated_and_unauthenticated_failures_do_not_publish_profiles() {
    for authenticated in [true, false] {
        let mut f = fixture();
        f.a = b"{".to_vec();
        if authenticated {
            f.ah = hash(&f.a);
        }
        let pins = f.pins();
        let c = context();
        let result = run(&f, &pins, &c, &mut Meter::default());
        assert!(matches!(
            result,
            Err(Error::Record(
                Rejection::Binding | Rejection::Json(shared::Rejection::InvalidRecord)
            ))
        ));
    }
}
