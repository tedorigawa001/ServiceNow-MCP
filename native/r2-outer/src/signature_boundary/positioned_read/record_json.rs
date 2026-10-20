//! Private bridge, used by the synthetic record pipeline. No installed-reader producer.
use super::*;
use crate::{json::shared, record_validation as r};
impl SharedBudget<'_> {
    pub(super) fn validate_record_json(
        &mut self,
        a: &[u8],
        l: &[u8],
        registry: &[u8],
        pins: &r::Pins<'_>,
        context: &r::Context<'_>,
    ) -> Result<r::ValidatedRecords, r::Rejection<Failure>> {
        let result = r::validate(a, l, registry, pins, context, self);
        if let Err(ref reason) = result {
            let failure = match reason {
                r::Rejection::Budget(e) | r::Rejection::Json(shared::Rejection::Budget(e)) => *e,
                r::Rejection::Limit | r::Rejection::Json(shared::Rejection::Limit(_)) => {
                    Failure::Limit
                }
                r::Rejection::Expired => Failure::Expired,
                _ => Failure::Binding,
            };
            let _ = self.stop::<()>(failure);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::record_validation::tests::{NOW, context, fixture, hash};
    use std::cell::Cell;
    #[test]
    fn strict_record_bridge_consumes_shared_work_without_io_or_clock_reset() {
        let f = fixture();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let mut b = SharedBudget::new(start, &stop);
        b.validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &context())
            .unwrap();
        let work = b.json_work;
        assert!(work > 0);
        b.validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &context())
            .unwrap();
        assert_eq!(b.json_work, 2 * work);
        assert_eq!(b.started, start);
        assert_eq!(b.used, 0);
        assert_eq!(b.reserved, 0);
        assert_eq!(b.metadata_calls, 0);
        assert_eq!(b.topology_calls, 0);
    }
    #[test]
    fn admission_deadline_cancel_and_existing_reason_are_never_flattened() {
        let f = fixture();
        for case in 0..3 {
            let stop = AtomicBool::new(case == 1);
            let mut b = SharedBudget::new(
                Instant::now() - Duration::from_secs(if case == 0 { 10 } else { 0 }),
                &stop,
            );
            let reason = match case {
                0 => Failure::Deadline,
                1 => Failure::Cancelled,
                _ => Failure::HashMismatch,
            };
            if case == 2 {
                b.failed = Some(reason);
            }
            assert_eq!(
                b.validate_record_json(b"{", &f.l, &f.registry, &f.pins(), &context())
                    .unwrap_err(),
                r::Rejection::Budget(reason)
            );
            assert_eq!(b.failed, Some(reason));
            assert_eq!(b.json_work, 0);
        }
    }
    #[test]
    fn mid_parse_deadline_or_cancel_is_kept_across_json_and_semantic_layers() {
        let f = fixture();
        for cancelled in [false, true] {
            let stop = AtomicBool::new(false);
            let start = Instant::now();
            let calls = Cell::new(0);
            let clock = || {
                let n = calls.get() + 1;
                calls.set(n);
                if n == 200 && cancelled {
                    stop.store(true, Ordering::Release);
                }
                if n >= 200 && !cancelled {
                    start + Duration::from_secs(10)
                } else {
                    start
                }
            };
            let mut b = SharedBudget::new(start, &stop);
            b.now = &clock;
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            let out = b
                .validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &context())
                .unwrap_err();
            assert!(
                matches!(out,r::Rejection::Budget(e)|r::Rejection::Json(shared::Rejection::Budget(e)) if e==reason)
            );
            assert_eq!(b.failed, Some(reason));
            assert!(b.json_work > 0);
        }
    }
    #[test]
    fn shared_work_limit_is_latched_and_not_reset_between_layers() {
        let f = fixture();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        b.json_work = 999999;
        assert_eq!(
            b.validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &context())
                .unwrap_err(),
            r::Rejection::Budget(Failure::Limit)
        );
        assert_eq!(b.failed, Some(Failure::Limit));
        assert_eq!(
            b.validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &context())
                .unwrap_err(),
            r::Rejection::Budget(Failure::Limit)
        );
    }
    #[test]
    fn limits_invalid_hash_and_expiry_retain_typed_result_and_stop_budget() {
        for case in 0..5 {
            let mut f = fixture();
            let stop = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &stop);
            let mut c = context();
            match case {
                0 => f.a.resize(65537, b' '),
                1 => {
                    f.a = b"{".to_vec();
                    f.ah = hash(&f.a);
                }
                2 => f.a = b"{".to_vec(),
                3 => c.now_wall_ms = NOW + 600001,
                _ => {
                    let mut v: serde_json::Value = serde_json::from_slice(&f.registry).unwrap();
                    v["policies"] = serde_json::json!(vec![v["policies"][0].clone(); 33]);
                    f.registry = serde_json::to_vec(&v).unwrap();
                    f.rh = hash(&f.registry);
                }
            };
            let e = b
                .validate_record_json(&f.a, &f.l, &f.registry, &f.pins(), &c)
                .unwrap_err();
            let reason = match case {
                0 | 4 => Failure::Limit,
                3 => Failure::Expired,
                _ => Failure::Binding,
            };
            assert_eq!(b.failed, Some(reason));
            match case {
                0 => assert_eq!(e, r::Rejection::Limit),
                1 => assert_eq!(e, r::Rejection::Json(shared::Rejection::InvalidRecord)),
                2 => assert_eq!(e, r::Rejection::Binding),
                3 => assert_eq!(e, r::Rejection::Expired),
                _ => assert!(matches!(e, r::Rejection::Json(shared::Rejection::Limit(_)))),
            };
        }
    }
}
