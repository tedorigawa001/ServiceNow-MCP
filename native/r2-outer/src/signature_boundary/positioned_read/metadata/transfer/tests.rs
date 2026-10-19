use super::*;
use std::cell::{Cell, RefCell};

#[derive(Default)]
struct Life {
    made: RefCell<Vec<usize>>,
    dropped: RefCell<Vec<usize>>,
}
struct Resource {
    origin: Rc<()>,
    id: usize,
    token: Box<u8>,
    life: Rc<Life>,
    on_drop: Option<Box<dyn Fn()>>,
}
impl Resource {
    fn new(id: usize, life: &Rc<Life>) -> Self {
        life.made.borrow_mut().push(id);
        Self {
            origin: Rc::new(()),
            id,
            token: Box::new(7),
            life: life.clone(),
            on_drop: None,
        }
    }
}
impl ResourceOrigin for Resource {
    fn resource_origin(&self) -> &Rc<()> {
        &self.origin
    }
}
impl Drop for Resource {
    fn drop(&mut self) {
        self.life.dropped.borrow_mut().push(self.id);
        if let Some(hook) = &self.on_drop {
            hook();
        }
    }
}
fn released(life: &Life) {
    let mut made = life.made.borrow().clone();
    let mut freed = life.dropped.borrow().clone();
    made.sort_unstable();
    freed.sort_unstable();
    assert_eq!(made, freed);
    assert!(freed.windows(2).all(|v| v[0] != v[1]));
}
pub(super) fn records() -> RecordBinding {
    RecordBinding {
        activation_path: crate::ACTIVATION_PATH.into(),
        activation_hash: [1; 32],
        ledger_path: "/private/ledger.json".into(),
        ledger_hash: [2; 32],
        index_path: "/sealed/runtime/index.json".into(),
        index_hash: [3; 32],
        release: "synthetic-release".into(),
        generation: 1,
        execution_uid: 501,
        reader_gid: 80,
        product_version: "26.0".into(),
        os_build: "synthetic".into(),
        registry_schema: "bp5-r2-signature-registry-0.1".into(),
        registry_id: "synthetic-registry".into(),
        registry_hash: [4; 32],
        node_policy: "synthetic-node".into(),
        runtime_root: "/sealed/runtime".into(),
        start_wall_ms: 1_000,
        approved_wall_ms: 0,
        activation_expires_ms: 600_000,
        ledger_expires_ms: 600_000,
    }
}
pub(super) fn target() -> TargetDeclaration {
    TargetDeclaration {
        role: Role::Node,
        path: "/sealed/runtime/bin/node".into(),
        relative: "bin/node".into(),
        ledger_hash: [5; 32],
        index_hash: [5; 32],
        size: SizeEvidence::Indexed(4096),
        mode: 0o555,
        policy: "synthetic-node".into(),
        policy_role: Role::Node,
    }
}
pub(super) fn initial() -> Observation {
    let stat = Stat {
        device: 7,
        inode: 42,
        kind: FileType::Regular,
        uid: 0,
        gid: 80,
        mode: 0o555,
        links: 1,
        size: 4096,
        mtime: Timestamp {
            seconds: 123,
            nanoseconds: 10,
        },
        ctime: Timestamp {
            seconds: 456,
            nanoseconds: 20,
        },
    };
    Observation {
        before: stat.clone(),
        after: stat,
        acl: Acl::Absent,
        filesystem: Filesystem::Local,
        declared_name_bytes: 0,
        names: Some(Vec::new()),
    }
}
fn opened(bound: &BoundTarget<'_>, life: &Rc<Life>) -> OpenedTarget<Resource> {
    let leaf = Resource::new(99, life);
    OpenedTarget {
        lineage: bound.lineage.clone(),
        records: bound.records.clone(),
        target: bound.target.clone(),
        root_device: 7,
        initial: initial(),
        initial_origin: leaf.origin.clone(),
        leaf,
        ancestors: bound
            .chain_names
            .iter()
            .enumerate()
            .map(|(i, s)| Ancestor {
                resource: Resource::new(i, life),
                component: s.clone(),
            })
            .collect(),
    }
}

mod m0;
fn check(
    records: &RecordBinding,
    target: &TargetDeclaration,
    open: impl FnOnce(&BoundTarget<'_>) -> Result<OpenedTarget<Resource>, Failure>,
    body: impl FnOnce(&HeldTargetScope<'_, Resource>) -> Result<(), Failure>,
) -> Result<TransferDiagnostic, Failure> {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let id = Rc::new(());
    with_target(&mut b, records, &id, target, open, body)
}

#[test]
fn resource_moves_to_source_without_clone_reopen_or_early_drop() {
    let life = Rc::new(Life::default());
    let address = Cell::new(0);
    let result = check(
        &records(),
        &target(),
        |b| {
            let o = opened(b, &life);
            address.set((&*o.leaf.token as *const u8) as usize);
            Ok(o)
        },
        |held| {
            assert!(life.dropped.borrow().is_empty());
            assert_eq!(held.source.leaf.id, 99);
            assert_eq!(
                (&*held.source.leaf.token as *const u8) as usize,
                address.get()
            );
            assert_eq!(held.ancestors.len(), 4);
            assert_eq!(held.bound.bytes, 4096);
            assert_eq!(held.initial.stat.inode, 42);
            assert!(
                held.ancestors
                    .iter()
                    .enumerate()
                    .all(|(i, a)| a.resource.id == i)
            );
            Ok(())
        },
    )
    .unwrap();
    released(&life);
    assert_eq!(life.dropped.borrow().first(), Some(&99));
    assert_eq!(
        format!("{result:?}"),
        "MovedTarget(pending_m0_topology_records_not_execution_authority)"
    );
    assert_eq!(result.execution_gate(), Err(Failure::Unavailable));
}

#[test]
fn every_record_binding_field_mismatch_rejects_and_releases_before_body() {
    for field in 0..21 {
        let life = Rc::new(Life::default());
        let used = Cell::new(false);
        let result = check(
            &records(),
            &target(),
            |b| {
                let mut o = opened(b, &life);
                let r = &mut o.records;
                match field {
                    0 => r.activation_path.push('x'),
                    1 => r.activation_hash[0] ^= 1,
                    2 => r.ledger_path.push('x'),
                    3 => r.ledger_hash[0] ^= 1,
                    4 => r.index_path.push('x'),
                    5 => r.index_hash[0] ^= 1,
                    6 => r.release.push('x'),
                    7 => r.generation += 1,
                    8 => r.execution_uid += 1,
                    9 => r.reader_gid += 1,
                    10 => r.product_version.push('x'),
                    11 => r.os_build.push('x'),
                    12 => r.registry_schema.push('x'),
                    13 => r.registry_id.push('x'),
                    14 => r.registry_hash[0] ^= 1,
                    15 => r.node_policy.push('x'),
                    16 => r.runtime_root.push('x'),
                    17 => r.start_wall_ms += 1,
                    18 => r.approved_wall_ms += 1,
                    19 => r.activation_expires_ms += 1,
                    _ => r.ledger_expires_ms += 1,
                }
                Ok(o)
            },
            |_| {
                used.set(true);
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err(), Failure::Binding);
        assert!(!used.get());
        released(&life);
    }
}

#[test]
fn record_expiry_boundaries_and_overflow_stop_before_open() {
    for case in 0..5 {
        let mut r = records();
        let reason = match case {
            0 => {
                r.activation_expires_ms = r.start_wall_ms + 460_000;
                Failure::Expired
            }
            1 => {
                r.ledger_expires_ms = r.start_wall_ms + 460_000;
                Failure::Expired
            }
            2 => {
                r.approved_wall_ms = r.start_wall_ms + 1;
                Failure::Binding
            }
            3 => {
                r.start_wall_ms = u64::MAX;
                Failure::Binding
            }
            _ => {
                r.ledger_expires_ms = 0;
                Failure::Expired
            }
        };
        assert_eq!(
            check(&r, &target(), |_| panic!("unexpected open"), |_| Ok(())).unwrap_err(),
            reason
        );
    }
    let mut r = records();
    r.activation_expires_ms = r.start_wall_ms + 460_001;
    r.ledger_expires_ms = r.activation_expires_ms;
    let life = Rc::new(Life::default());
    assert!(check(&r, &target(), |b| Ok(opened(b, &life)), |_| Ok(())).is_ok());
    released(&life);
    assert_eq!(
        record_time(&r, r.activation_expires_ms - 450_000, 450_000),
        Err(Failure::Expired)
    );
}
#[test]
fn identical_record_values_from_another_session_are_not_interchangeable() {
    let life = Rc::new(Life::default());
    let out = check(
        &records(),
        &target(),
        |b| {
            let mut o = opened(b, &life);
            o.lineage = Rc::new(());
            Ok(o)
        },
        |_| panic!("unexpected source use"),
    );
    assert_eq!(out.unwrap_err(), Failure::Binding);
    released(&life);
}
#[test]
fn target_receipt_mismatch_rejects_every_field_before_body() {
    for field in 0..10 {
        let life = Rc::new(Life::default());
        let out = check(
            &records(),
            &target(),
            |b| {
                let mut o = opened(b, &life);
                let t = &mut o.target;
                match field {
                    0 => t.role = Role::Launcher,
                    1 => t.path.push('x'),
                    2 => t.relative.push('x'),
                    3 => t.ledger_hash[0] ^= 1,
                    4 => t.index_hash[0] ^= 1,
                    5 => t.size = SizeEvidence::ObservedBounded(4096),
                    6 => t.size = SizeEvidence::Indexed(4097),
                    7 => t.mode = 0o444,
                    8 => t.policy.push('x'),
                    _ => t.policy_role = Role::Launcher,
                }
                Ok(o)
            },
            |_| panic!("unexpected source use"),
        );
        assert_eq!(out.unwrap_err(), Failure::Binding);
        released(&life);
    }
}
#[test]
fn invalid_target_bindings_stop_before_resource_acquisition() {
    for case in 0..12 {
        let mut t = target();
        match case {
            0 => t.ledger_hash[0] ^= 1,
            1 => t.index_hash[0] ^= 1,
            2 => t.policy = "other".into(),
            3 => t.policy_role = Role::Launcher,
            4 => t.mode = 0o755,
            5 => t.relative = "../node".into(),
            6 => t.path = "/sealed/runtime-other/bin/node".into(),
            7 => t.path = "/sealed/runtime/bin/../node".into(),
            8 => t.size = SizeEvidence::ObservedBounded(4096),
            9 => t.size = SizeEvidence::Indexed(31),
            10 => t.size = SizeEvidence::Indexed(MAX_FILE + 1),
            _ => {
                t.path = "/sealed/runtime/index.json".into();
                t.relative = "index.json".into();
            }
        }
        let out = check(&records(), &t, |_| panic!("unexpected open"), |_| Ok(()));
        assert_eq!(out.unwrap_err(), Failure::Binding);
    }
}
#[test]
fn launcher_is_unavailable_even_with_matching_policy_hash_and_observed_size() {
    let mut t = target();
    t.role = Role::Launcher;
    t.policy_role = Role::Launcher;
    t.size = SizeEvidence::ObservedBounded(4096);
    assert_eq!(
        check(&records(), &t, |_| panic!("unexpected open"), |_| Ok(())).unwrap_err(),
        Failure::Unavailable
    );
}
#[test]
fn malformed_record_contract_stops_before_open() {
    for case in 0..13 {
        let mut r = records();
        match case {
            0 => r.activation_path = "/other".into(),
            1 => r.generation = 0,
            2 => r.generation = 9_007_199_254_740_992,
            3 => r.execution_uid = 0,
            4 => r.reader_gid = 0,
            5 => r.release = String::new(),
            6 => r.registry_schema = "other".into(),
            7 => r.registry_id = "bad id".into(),
            8 => r.ledger_path = "/a/../ledger".into(),
            9 => r.runtime_root = "/sealed/".into(),
            10 => r.index_path = "/sealed/runtime-other/index".into(),
            11 => r.product_version = "\0".into(),
            _ => r.node_policy = "".into(),
        }
        assert_eq!(
            check(&r, &target(), |_| panic!("unexpected open"), |_| Ok(())).unwrap_err(),
            Failure::Binding
        );
    }
}
#[test]
fn path_shape_is_bounded_without_normalization_or_alias_repair() {
    for path in [
        "", "/", "relative", "/a//b", "/a/./b", "/a/../b", "/a\\b", "/\0",
    ] {
        assert!(absolute(path).is_err());
    }
    assert!(absolute(&format!("/{}", "x".repeat(256))).is_err());
    assert!(absolute(&format!("/{}", vec!["a"; 65].join("/"))).is_err());
    assert!(absolute("/Library/Application Support/sealed").is_ok());
}
#[test]
fn missing_reordered_or_wrong_ancestor_components_fail_without_use() {
    for case in 0..3 {
        let life = Rc::new(Life::default());
        let out = check(
            &records(),
            &target(),
            |b| {
                let mut o = opened(b, &life);
                match case {
                    0 => {
                        o.ancestors.pop();
                    }
                    1 => o.ancestors.swap(1, 2),
                    _ => o.ancestors[1].component = "other".into(),
                };
                Ok(o)
            },
            |_| panic!("unexpected source use"),
        );
        assert_eq!(out.unwrap_err(), Failure::Binding);
        released(&life);
    }
}
#[test]
fn excessive_resources_are_rejected_and_all_returned_resources_are_dropped() {
    let life = Rc::new(Life::default());
    let out = check(
        &records(),
        &target(),
        |b| {
            let mut o = opened(b, &life);
            for id in 100..230 {
                o.ancestors.push(Ancestor {
                    resource: Resource::new(id, &life),
                    component: "extra".into(),
                });
            }
            Ok(o)
        },
        |_| panic!("unexpected source use"),
    );
    assert_eq!(out.unwrap_err(), Failure::Limit);
    released(&life);
}
#[test]
fn opened_leaf_policy_and_before_after_races_reject_and_release() {
    for case in 0..7 {
        let life = Rc::new(Life::default());
        let out = check(
            &records(),
            &target(),
            |b| {
                let mut o = opened(b, &life);
                match case {
                    0 => o.root_device = 8,
                    1 => o.initial.before.uid = 1,
                    2 => o.initial.acl = Acl::Present,
                    3 => o.initial.filesystem = Filesystem::Unknown,
                    4 => o.initial.names = None,
                    5 => {
                        o.initial.before.size = 4097;
                        o.initial.after = o.initial.before.clone();
                    }
                    _ => o.initial.after.ctime.nanoseconds += 1,
                }
                Ok(o)
            },
            |_| panic!("unexpected source use"),
        );
        assert!(matches!(out, Err(Failure::Metadata | Failure::Changed)));
        released(&life);
    }
}
#[test]
fn partial_opener_failure_releases_only_resources_that_were_created() {
    for stop in 0..6 {
        let life = Rc::new(Life::default());
        let out = check(
            &records(),
            &target(),
            |_| {
                let mut partial = Vec::new();
                for i in 0..stop {
                    partial.push(Resource::new(i, &life));
                }
                Err(Failure::MetadataUnavailable)
            },
            |_| Ok(()),
        );
        assert_eq!(out.unwrap_err(), Failure::MetadataUnavailable);
        assert_eq!(life.made.borrow().len(), stop);
        released(&life);
    }
}
#[test]
fn body_failure_latches_and_forbids_a_second_acquisition() {
    let life = Rc::new(Life::default());
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let id = Rc::new(());
    let r = records();
    let t = target();
    assert_eq!(
        with_target(
            &mut b,
            &r,
            &id,
            &t,
            |bound| Ok(opened(bound, &life)),
            |_| Err(Failure::HashMismatch)
        )
        .unwrap_err(),
        Failure::HashMismatch
    );
    released(&life);
    assert_eq!(
        with_target::<Resource>(
            &mut b,
            &r,
            &id,
            &t,
            |_| panic!("unexpected second open"),
            |_| Ok(())
        )
        .unwrap_err(),
        Failure::HashMismatch
    );
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_calls, 0);
}
#[test]
fn late_open_or_body_success_and_error_drop_everything_before_stopping() {
    for stage in 0..2 {
        for fail in [false, true] {
            for cancelled in [false, true] {
                let started = Instant::now();
                let now = Cell::new(started);
                let clock = || now.get();
                let cancel = AtomicBool::new(false);
                let expire = || {
                    if cancelled {
                        cancel.store(true, Ordering::Release);
                    } else {
                        now.set(started + Duration::from_secs(10));
                    }
                };
                let mut b = SharedBudget::new(started, &cancel);
                b.now = &clock;
                let life = Rc::new(Life::default());
                let id = Rc::new(());
                let out = with_target(
                    &mut b,
                    &records(),
                    &id,
                    &target(),
                    |bound| {
                        let o = opened(bound, &life);
                        if stage == 0 {
                            expire();
                            if fail {
                                return Err(Failure::MetadataUnavailable);
                            }
                        }
                        Ok(o)
                    },
                    |_| {
                        if stage == 1 {
                            expire();
                            if fail {
                                return Err(Failure::MetadataUnavailable);
                            }
                        }
                        Ok(())
                    },
                );
                let reason = if cancelled {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                };
                assert_eq!(out.unwrap_err(), reason);
                assert_eq!(b.checkpoint(), Err(reason));
                released(&life);
            }
        }
    }
}
#[test]
fn initial_cancel_deadline_and_existing_failure_do_not_acquire() {
    for case in 0..3 {
        let cancel = AtomicBool::new(case == 0);
        let started = Instant::now();
        let mut b = SharedBudget::new(started, &cancel);
        let old = || started + Duration::from_secs(10);
        if case == 1 {
            b.now = &old;
        }
        if case == 2 {
            b.failed = Some(Failure::Binding);
        }
        let expected = match case {
            0 => Failure::Cancelled,
            1 => Failure::Deadline,
            _ => Failure::Binding,
        };
        assert_eq!(
            with_target::<Resource>(
                &mut b,
                &records(),
                &Rc::new(()),
                &target(),
                |_| panic!("unexpected open"),
                |_| Ok(())
            )
            .unwrap_err(),
            expected
        );
    }
}
#[test]
fn cancellation_during_resource_drop_is_not_reported_as_success() {
    let cancel = Rc::new(AtomicBool::new(false));
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let life = Rc::new(Life::default());
    let c = cancel.clone();
    let out = with_target(
        &mut b,
        &records(),
        &Rc::new(()),
        &target(),
        |bound| {
            let mut o = opened(bound, &life);
            o.leaf.on_drop = Some(Box::new(move || c.store(true, Ordering::Release)));
            Ok(o)
        },
        |_| Ok(()),
    );
    assert_eq!(out.unwrap_err(), Failure::Cancelled);
    released(&life);
}
#[test]
fn unwind_in_source_use_drops_leaf_and_chain_once_without_operational_recovery() {
    let life = Rc::new(Life::default());
    let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        check(
            &records(),
            &target(),
            |b| Ok(opened(b, &life)),
            |_| panic!("synthetic unwind"),
        )
    }));
    assert!(out.is_err());
    released(&life);
}
