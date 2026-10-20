//! Private bridge, used by the synthetic record pipeline. No installed-reader producer.
use super::*;
use crate::{json::shared, record_validation as r};
impl SharedBudget<'_> {
    // Opt-in internal model bridge only; the strict pipeline still uses validate_record_json.
    pub(super) fn profile_record_json<'a>(
        &mut self,
        a: &'a [u8],
        l: &'a [u8],
        registry: &'a [u8],
        pins: &'a r::Pins<'a>,
        context: &'a r::Context<'a>,
    ) -> Result<r::work_model::Profiled<'a>, r::work_model::Error<Failure>> {
        use r::work_model::Error;
        let result = r::work_model::validate_profiled(a, l, registry, pins, context, self);
        if let Err(ref reason) = result {
            let failure = match reason {
                Error::Record(
                    r::Rejection::Budget(e) | r::Rejection::Json(shared::Rejection::Budget(e)),
                ) => *e,
                Error::Limit
                | Error::Record(
                    r::Rejection::Limit | r::Rejection::Json(shared::Rejection::Limit(_)),
                ) => Failure::Limit,
                Error::Record(r::Rejection::Expired) => Failure::Expired,
                Error::ModelMismatch => Failure::Unavailable,
                _ => Failure::Binding,
            };
            let _ = self.stop::<()>(failure);
        }
        result
    }
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
    fn profiled_record_bridge_keeps_shared_origin_start_and_independent_resource_ledgers() {
        let f = fixture();
        let pins = f.pins();
        let context = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let mut b = SharedBudget::new(start, &stop);
        let origin = b.inspection_origin.clone();
        let profile = b
            .profile_record_json(&f.a, &f.l, &f.registry, &pins, &context)
            .unwrap();
        assert_eq!(profile.profile.per_validation(), b.json_work + 2);
        let work = b.json_work;
        b.profile_record_json(&f.a, &f.l, &f.registry, &pins, &context)
            .unwrap();
        assert_eq!(b.json_work, 2 * work);
        assert_eq!(b.started, start);
        assert!(Rc::ptr_eq(&b.inspection_origin, &origin));
        assert_eq!(
            (b.used, b.reserved, b.metadata_calls, b.topology_calls),
            (0, 0, 0, 0)
        );
        stop.store(true, Ordering::Release);
        assert!(
            b.profile_record_json(&f.a, &f.l, &f.registry, &pins, &context)
                .is_err()
        );
        assert_eq!(b.failed, Some(Failure::Cancelled));
        assert_eq!(b.json_work, 2 * work);
    }
    #[test]
    fn profiled_bridge_latches_groups_limit_deadline_and_existing_failure() {
        let f = fixture();
        let pins = f.pins();
        let groups = vec![80; r::work_model::MAX_GROUPS + 1];
        for case in 0..4 {
            let stop = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &stop);
            let mut c = context();
            let expected = match case {
                0 => {
                    c.groups = &groups;
                    Failure::Limit
                }
                1 => {
                    b.started -= Duration::from_secs(10);
                    Failure::Deadline
                }
                2 => {
                    b.failed = Some(Failure::HashMismatch);
                    Failure::HashMismatch
                }
                _ => {
                    b.json_work = 999_999;
                    Failure::Limit
                }
            };
            assert!(
                b.profile_record_json(&f.a, &f.l, &f.registry, &pins, &c)
                    .is_err()
            );
            assert_eq!(b.failed, Some(expected));
            assert!(
                b.profile_record_json(&f.a, &f.l, &f.registry, &pins, &c)
                    .is_err()
            );
            assert_eq!(b.failed, Some(expected));
        }
    }
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
