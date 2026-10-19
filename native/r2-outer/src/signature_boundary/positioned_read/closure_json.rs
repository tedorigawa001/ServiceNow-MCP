//! Pure shared-budget closure check; no filesystem observation or runtime registration.
use super::*;
use crate::{
    closure::{self, ClosureFailure, shared as c},
    json::shared as json,
};
impl SharedBudget<'_> {
    pub(super) fn check_closure_json(
        &mut self,
        bytes: &[u8],
        binding: &closure::Binding<'_>,
        observed: &[closure::Entry],
    ) -> Result<c::Comparison, c::Rejection<Failure>> {
        let result = c::check(bytes, binding, observed, self);
        self.closure_result(result)
    }
    pub(super) fn declare_closure_json(
        &mut self,
        bytes: &[u8],
        binding: &closure::Binding<'_>,
    ) -> Result<c::Declaration, c::Rejection<Failure>> {
        let result = c::declared(bytes, binding, self);
        self.closure_result(result)
    }
    fn closure_result<T>(
        &mut self,
        result: Result<T, c::Rejection<Failure>>,
    ) -> Result<T, c::Rejection<Failure>> {
        if let Err(ref e) = result {
            let reason = match e {
                c::Rejection::Budget(e) | c::Rejection::Json(json::Rejection::Budget(e)) => *e,
                c::Rejection::Closure(ClosureFailure::Limit)
                | c::Rejection::Json(json::Rejection::Limit(_)) => Failure::Limit,
                c::Rejection::Closure(ClosureFailure::Set) => Failure::Changed,
                c::Rejection::Closure(ClosureFailure::Deadline) => Failure::Deadline,
                _ => Failure::Binding,
            };
            let _ = self.stop::<()>(reason);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::closure::shared::tests::fixture;
    use std::cell::Cell;
    #[test]
    fn declaration_and_full_check_share_work_without_claiming_filesystem_io() {
        let f = fixture();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let mut b = SharedBudget::new(start, &stop);
        b.declare_closure_json(&f.bytes, &f.binding()).unwrap();
        let work = b.json_work;
        assert!(work > 0);
        b.check_closure_json(&f.bytes, &f.binding(), &f.observed)
            .unwrap();
        assert!(b.json_work > 2 * work);
        assert_eq!(b.started, start);
        assert_eq!(b.used, 0);
        assert_eq!(b.reserved, 0);
        assert_eq!(b.metadata_calls, 0);
        assert_eq!(b.topology_calls, 0);
    }
    #[test]
    fn preexisting_deadline_cancel_and_first_failure_keep_their_reason() {
        let f = fixture();
        for case in 0..3 {
            let stop = AtomicBool::new(case == 1);
            let mut b = SharedBudget::new(
                Instant::now() - Duration::from_secs(if case == 0 { 10 } else { 0 }),
                &stop,
            );
            let expected = match case {
                0 => Failure::Deadline,
                1 => Failure::Cancelled,
                _ => Failure::HashMismatch,
            };
            if case == 2 {
                b.failed = Some(expected);
            }
            assert_eq!(
                b.check_closure_json(b"{", &f.binding(), &[]).unwrap_err(),
                c::Rejection::Budget(expected)
            );
            assert_eq!(b.failed, Some(expected));
            assert_eq!(b.json_work, 0);
        }
    }
    #[test]
    fn mid_parse_fake_clock_deadline_and_cancel_are_not_invalid_json() {
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
            let expected = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            let out = b
                .check_closure_json(&f.bytes, &f.binding(), &f.observed)
                .unwrap_err();
            assert!(
                matches!(out,c::Rejection::Budget(e)|c::Rejection::Json(json::Rejection::Budget(e)) if e==expected)
            );
            assert_eq!(b.failed, Some(expected));
            assert!(b.json_work > 0);
        }
    }
    #[test]
    fn shared_work_limit_latches_for_declaration_and_set_check() {
        let f = fixture();
        for declaration in [false, true] {
            let stop = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &stop);
            b.json_work = 999999;
            let e = if declaration {
                b.declare_closure_json(&f.bytes, &f.binding()).unwrap_err()
            } else {
                b.check_closure_json(&f.bytes, &f.binding(), &f.observed)
                    .unwrap_err()
            };
            assert_eq!(e, c::Rejection::Budget(Failure::Limit));
            assert_eq!(b.failed, Some(Failure::Limit));
            assert_eq!(
                b.check_closure_json(&f.bytes, &f.binding(), &f.observed)
                    .unwrap_err(),
                c::Rejection::Budget(Failure::Limit)
            );
        }
    }
    #[test]
    fn local_limit_binding_json_and_set_errors_are_typed_then_latched() {
        for case in 0..4 {
            let mut f = fixture();
            let stop = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &stop);
            match case {
                0 => f.bytes.resize(16 * 1024 * 1024 + 1, b' '),
                1 => f.bytes = b"{".to_vec(),
                2 => {
                    f.bytes = b"{".to_vec();
                    use sha2::{Digest, Sha256};
                    f.hash = format!("{:x}", Sha256::digest(&f.bytes));
                }
                _ => {
                    f.observed.pop();
                }
            };
            let e = b
                .check_closure_json(&f.bytes, &f.binding(), &f.observed)
                .unwrap_err();
            match case {
                0 => {
                    assert_eq!(e, c::Rejection::Closure(ClosureFailure::Limit));
                    assert_eq!(b.failed, Some(Failure::Limit));
                }
                1 => {
                    assert_eq!(e, c::Rejection::Closure(ClosureFailure::Binding));
                    assert_eq!(b.failed, Some(Failure::Binding));
                }
                2 => {
                    assert_eq!(e, c::Rejection::Json(json::Rejection::InvalidRecord));
                    assert_eq!(b.failed, Some(Failure::Binding));
                }
                _ => {
                    assert_eq!(e, c::Rejection::Closure(ClosureFailure::Set));
                    assert_eq!(b.failed, Some(Failure::Changed));
                }
            }
        }
    }
}
