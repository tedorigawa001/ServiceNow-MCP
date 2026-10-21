use super::*;

#[test]
fn fixed_bridge_moves_typed_cleanup_for_success_failure_and_no_boundary() {
    for (case, expected, status) in [
        (Case::Good, None, 0),
        (Case::Surplus, Some(Failure::Changed), 0),
        (Case::Corrupt, Some(Failure::HashMismatch), 1), // abandoned declaration, not a clean scan
        (Case::CleanupUnknown, Some(Failure::Unavailable), 1),
        (Case::Cancel(1), Some(Failure::Cancelled), 0),
        (Case::Deadline(1), Some(Failure::Deadline), 0),
        (Case::NoQuotas, Some(Failure::Unavailable), 2),
    ] {
        let (f, state) = fixture(case);
        let _ = with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
            let out = execute(
                inputs,
                scope,
                &state,
                if status == 2 { None } else { quotas() },
                b,
            )?;
            assert_eq!(
                out.result.as_ref().map(|_| ()).map_err(|e| *e),
                expected.map_or(Ok(()), Err)
            );
            match status {
                0 => assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_))),
                1 => assert!(matches!(out.cleanup, CleanupDisposition::Incomplete(_))),
                _ => assert!(matches!(out.cleanup, CleanupDisposition::NotStarted)),
            }
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.pending_cleanup, 0);
            assert!(state.borrow().alive.is_empty());
            out.result.map(|_| ())
        });
    }
}
