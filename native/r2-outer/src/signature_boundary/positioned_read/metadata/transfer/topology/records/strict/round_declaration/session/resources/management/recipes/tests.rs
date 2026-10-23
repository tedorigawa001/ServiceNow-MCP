use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;
use std::{sync::atomic::AtomicBool, time::Duration};

fn catalog(entries: &[Recipe]) -> Catalog<'_> {
    Catalog {
        model: RECIPE_MODEL,
        entries,
        claim: CoverageClaim {
            recipe_sites: 7,
            real_layout_sites: 0,
            whole_management: false,
        },
    }
}

#[test]
fn literal_oracle_checks_three_recipes_and_all_missing_dimensions_not_layout_bytes() {
    let entries = fixed_entries();
    // Independent literals, not a second call to the production descriptor/coverage helper.
    assert!(entries[0].site == Site::Counts);
    assert_eq!(entries[0].source, "profile/collect.rs");
    assert!(
        entries[0].storage
            == Storage::VectorU64 {
                maximum_elements: 100_000
            }
    );
    assert!(entries[0].phase == Phase::B2 && entries[0].lifetime == Lifetime::BuildTemporary);
    assert_eq!(
        (
            entries[0].allocation_prefix.minimum,
            entries[0].allocation_prefix.maximum
        ),
        (0, 1)
    );
    assert!(entries[1].site == Site::Keys);
    assert_eq!(entries[1].source, "draft/slots.rs");
    assert!(
        entries[1].storage
            == Storage::RcUnits {
                groups: 1,
                nonces: 3
            }
    );
    assert!(entries[1].phase == Phase::B3 && entries[1].lifetime == Lifetime::UntilDraftDrop);
    assert_eq!(
        (
            entries[1].allocation_prefix.minimum,
            entries[1].allocation_prefix.maximum
        ),
        (0, 4)
    );
    assert!(entries[2].site == Site::InlineMap);
    assert_eq!(entries[2].source, "caps/allocation_view/cap_map.rs");
    assert!(
        entries[2].storage
            == Storage::InlineScalars {
                session_round: 32,
                local: 21
            }
    );
    assert!(entries[2].lifetime == Lifetime::WithDraft);
    assert_eq!(
        (
            entries[2].allocation_prefix.minimum,
            entries[2].allocation_prefix.maximum
        ),
        (0, 0)
    );
    let catalog = catalog(&entries);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let result = review(&catalog, &mut b).unwrap();
    assert_eq!(b.json_work, 23);
    assert!(std::ptr::eq(result.catalog, &catalog));
    assert!(
        result
            .layouts
            .iter()
            .all(|v| *v == LayoutKnowledge::Unmodeled)
    );
    assert!(
        result.missing
            == [
                Missing::CountsLayout,
                Missing::KeysLayout,
                Missing::InlineParent,
                Missing::ControlOwners,
                Missing::ParserNested,
                Missing::Collector,
                Missing::Discard,
                Missing::WholeLifetime
            ]
    );
    assert_eq!(
        format!("{result:?}"),
        "ModuleRecipeReview(all_layouts_unknown_not_requirement_or_evidence)"
    );
    assert_eq!(result.require_complete(&mut b), Err(Failure::Unavailable));
    assert_eq!(b.json_work, 24);
}

#[test]
fn every_recipe_field_mismatch_duplicate_and_swap_is_rejected() {
    for site in 0..3 {
        for fault in 0..8 {
            let mut entries = fixed_entries();
            match fault {
                0 => entries[site].site = [Site::Keys, Site::InlineMap, Site::Counts][site],
                1 => entries[site].revision = "old-recipe",
                2 => entries[site].source = "arbitrary-source",
                3 => {
                    entries[site].storage = Storage::VectorU64 {
                        maximum_elements: 99_999,
                    }
                }
                4 => entries[site].phase = Phase::S0,
                5 => {
                    entries[site].lifetime = [
                        Lifetime::WithDraft,
                        Lifetime::BuildTemporary,
                        Lifetime::UntilDraftDrop,
                    ][site]
                }
                6 => entries[site].allocation_prefix.minimum = 1,
                _ => entries[site].allocation_prefix.maximum = 255,
            }
            let c = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &c);
            assert_eq!(
                review(&catalog(&entries), &mut b).unwrap_err(),
                Failure::Binding
            );
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
        }
    }
    for pair in [(0, 1), (0, 2), (1, 2)] {
        let mut entries = fixed_entries();
        entries.swap(pair.0, pair.1);
        let c = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &c);
        assert_eq!(
            review(&catalog(&entries), &mut b).unwrap_err(),
            Failure::Binding
        );
    }
}

#[test]
fn missing_extra_real_layout_and_whole_coverage_claims_never_pass() {
    let entries = fixed_entries();
    for mask in [0, 1, 2, 3, 4, 5, 6, 8, 15, 255] {
        let mut catalog = catalog(&entries);
        catalog.claim.recipe_sites = mask;
        let c = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &c);
        assert_eq!(review(&catalog, &mut b).unwrap_err(), Failure::Unavailable);
        assert_eq!(b.json_work, 3);
    }
    for mask in [1, 2, 4, 7, 128, 255] {
        let mut catalog = catalog(&entries);
        catalog.claim.real_layout_sites = mask;
        let c = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &c);
        assert_eq!(review(&catalog, &mut b).unwrap_err(), Failure::Unavailable);
    }
    let mut catalog = catalog(&entries);
    catalog.claim.whole_management = true;
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    assert_eq!(review(&catalog, &mut b).unwrap_err(), Failure::Unavailable);
}

#[test]
fn bounded_envelope_and_shared_work_precheck_stop_before_recipe_walk() {
    let entries = fixed_entries();
    let extra = [entries[0]; 4];
    for values in [&entries[..0], &entries[..1], &entries[..2], &extra[..]] {
        let c = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &c);
        assert_eq!(
            review(&catalog(values), &mut b).unwrap_err(),
            Failure::Unavailable
        );
        assert_eq!(b.json_work, 2);
    }
    let mut catalog = catalog(&entries);
    catalog.model = "unknown";
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    assert_eq!(review(&catalog, &mut b).unwrap_err(), Failure::Unavailable);
    assert_eq!(b.json_work, 1);
    catalog.model = RECIPE_MODEL;
    for remaining in [22, 23] {
        let mut b = SharedBudget::new(Instant::now(), &c);
        b.json_work = 1_000_000 - remaining;
        let result = review(&catalog, &mut b);
        if remaining == 22 {
            assert_eq!(result.unwrap_err(), Failure::Limit);
            assert_eq!(b.json_work, 1_000_000 - 22 + 3);
        } else {
            assert!(result.is_ok());
            assert_eq!(b.json_work, 1_000_000);
        }
    }
}

fn mock() -> mock_layout::MockLayout {
    mock_layout::MockLayout {
        payload: 8,
        overhead: 24,
        alignment: 8,
        capacity_bounded: true,
        nested_covered: true,
        owner_covered: true,
    }
}

#[test]
fn mock_layout_success_is_test_only_and_never_changes_runtime_unknowns() {
    let mut fixture = mock();
    let check = mock_layout::check(Site::Counts, &fixture).unwrap();
    assert!(check.site == Site::Counts);
    assert_eq!(check.requested, 32); // literal MOCK layout; not an actual Vec layout
    fixture.payload = 0;
    let check = mock_layout::check(Site::Keys, &fixture).unwrap();
    assert_eq!(check.requested, 24); // literal MOCK header, not Rust Rc internals
    assert_eq!(
        format!("{check:?}"),
        "MockLayoutCheck(test_only_not_verified_layout)"
    );
    let entries = fixed_entries();
    let catalog = catalog(&entries);
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let review = review(&catalog, &mut b).unwrap();
    assert_eq!(review.missing.len(), 8);
    assert!(
        review
            .layouts
            .iter()
            .all(|v| *v == LayoutKnowledge::Unmodeled)
    );
    assert_eq!(review.require_complete(&mut b), Err(Failure::Unavailable));
}

#[test]
fn mock_missing_capacity_nested_owner_fake_zero_header_and_overflow_are_rejected() {
    for fault in 0..3 {
        let mut fixture = mock();
        match fault {
            0 => fixture.capacity_bounded = false,
            1 => fixture.nested_covered = false,
            _ => fixture.owner_covered = false,
        }
        assert_eq!(
            mock_layout::check(Site::Counts, &fixture).unwrap_err(),
            Failure::Unavailable
        );
    }
    let mut fixture = mock();
    fixture.overhead = 0;
    assert_eq!(
        mock_layout::check(Site::Keys, &fixture).unwrap_err(),
        Failure::Unavailable
    );
    fixture.payload = 0;
    assert_eq!(
        mock_layout::check(Site::Keys, &fixture).unwrap_err(),
        Failure::Limit
    );
    fixture.payload = u64::MAX;
    fixture.overhead = 1;
    assert_eq!(
        mock_layout::check(Site::Counts, &fixture).unwrap_err(),
        Failure::Limit
    );
    for alignment in [0, 3, 8192, u32::MAX] {
        let fixture = mock_layout::MockLayout {
            alignment,
            ..mock()
        };
        assert_eq!(
            mock_layout::check(Site::Counts, &fixture).unwrap_err(),
            Failure::Limit
        );
    }
    assert_eq!(
        mock_layout::check(Site::InlineMap, &mock()).unwrap_err(),
        Failure::Unavailable
    );
}

#[test]
fn all_work_boundaries_stop_and_preserve_first_reason_without_source_operations() {
    let entries = fixed_entries();
    let catalog = catalog(&entries);
    for mode in 0..3 {
        for at in 1..=23 {
            let c = Rc::new(AtomicBool::new(false));
            let audit = Audit::default();
            let start = Instant::now();
            let clock = || {
                if mode == 2 && audit.counts().iter().sum::<u64>() >= at {
                    start + Duration::from_secs(10)
                } else {
                    start
                }
            };
            let mut b = SharedBudget::new(start, &c);
            b.now = &clock;
            b.work_audit = Some(audit.clone());
            if mode == 0 {
                b.json_work = 1_000_000 - (at - 1);
            }
            if mode == 1 {
                audit.cancel_after_work(at, c.clone());
            }
            let reason = [Failure::Limit, Failure::Cancelled, Failure::Deadline][mode];
            assert_eq!(review(&catalog, &mut b).unwrap_err(), reason);
            let spent = b.json_work;
            assert_eq!(review(&catalog, &mut b).unwrap_err(), reason);
            assert_eq!(b.json_work, spent);
            assert_eq!(
                (b.used, b.reserved, b.metadata_calls, b.topology_calls),
                (0, 0, 0, 0)
            );
            assert!(!b.scan_session_claim.started.get());
            assert!(!b.protected_bridge_claim.generated.get());
            assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
        }
    }
}

#[test]
fn review_is_repeatable_consistency_only_not_a_bound_projection_or_complete_witness() {
    let entries = fixed_entries();
    let catalog = catalog(&entries);
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let retry = b.retries_left;
    let a = review(&catalog, &mut b).unwrap();
    let other = review(&catalog, &mut b).unwrap();
    assert!(std::ptr::eq(a.catalog, other.catalog));
    assert_eq!(b.json_work, 46);
    assert_eq!(b.retries_left, retry);
    assert!(
        b.protected_bridge_claim.allocation.get()
            == crate::signature_boundary::positioned_read::allocation_claim::State::Fresh
    );
    let mut foreign = SharedBudget::new(b.started, &c);
    assert!(review(&catalog, &mut foreign).is_ok()); // no receipt/budget/profile evidence is claimed
    b.stop::<()>(Failure::HashMismatch).unwrap_err();
    assert_eq!(review(&catalog, &mut b).unwrap_err(), Failure::HashMismatch);
    assert_eq!(b.json_work, 46);
}

#[test]
fn review_and_mock_types_are_move_only_opaque_and_non_serializable() {
    macro_rules! not_impl {
        ($t:ty,$bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <$t as Ambiguous<_>>::check;
        }};
    }
    macro_rules! opaque {
        ($t:ty) => {{
            not_impl!($t, Clone);
            not_impl!($t, Copy);
            not_impl!($t, serde::Serialize);
            not_impl!($t, serde::de::DeserializeOwned);
        }};
    }
    opaque!(ModuleRecipeReview<'static, 'static>);
    opaque!(mock_layout::MockCheck);
    assert!(std::mem::size_of::<[Recipe; 3]>() <= 1024);
    assert!(std::mem::size_of::<ModuleRecipeReview<'static, 'static>>() <= 128);
}
