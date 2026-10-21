use super::*;

const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const EMPTY: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
fn entry(size: u64, sha256: &str) -> closure::Entry {
    closure::Entry::File {
        path: "file".into(),
        mode: "0444".into(),
        size,
        sha256: sha256.into(),
    }
}
fn sized(state: &Rc<RefCell<State>>, size: u64) {
    let mut v = stat();
    v.size = size;
    state.borrow_mut().metadata_value = Some(MetaValue::Stat(v));
}

#[test]
fn digest_mismatch_never_completes_and_stops_following_source_calls() {
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().reads.extend([Ok(3), Ok(0)]);
    state.borrow_mut().read_data.push_back(b"abc".to_vec());
    sized(&state, 3);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let declaration = entry(3, EMPTY);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut bound = s.bind_declared(&f, &declaration, 1)?;
        s.read_declared(&mut bound, 0, &mut [0; 3])?;
        sized(&state, 3);
        let result = s.eof_declared(&mut bound, 3, &mut [0]);
        assert_eq!(result, Err(Failure::HashMismatch));
        let attempts = state.borrow().counts;
        assert_eq!(
            s.metadata(&f, MetaOp::Stat, &mut []).map(|_| ()),
            Err(Failure::HashMismatch)
        );
        assert_eq!(state.borrow().counts, attempts);
        result.map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::HashMismatch));
    assert_eq!(out.summary.declared_pending, 1);
    assert_eq!(out.summary.live, 0);
    assert_eq!(b.used, 3);
}

#[test]
fn golden_vectors_hash_fresh_bytes_not_mutated_caller_buffer_or_eof() {
    for empty in [false, true] {
        let (source, state, stop, tick) = fixture();
        let size = if empty { 0 } else { 3 };
        if !empty {
            state.borrow_mut().reads.push_back(Ok(3));
            state.borrow_mut().read_data.push_back(b"abc".to_vec());
        }
        state.borrow_mut().reads.push_back(Ok(0));
        sized(&state, size);
        let declaration = entry(size, if empty { EMPTY } else { ABC });
        let mut b = SharedBudget::new(tick.get(), &stop);
        let origin = b.inspection_origin.clone();
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut bound = s.bind_declared(&f, &declaration, 1)?;
            if !empty {
                let mut output = [0; 3];
                s.read_declared(&mut bound, 0, &mut output)?;
                assert_eq!(&output, b"abc");
                output.fill(b'z'); // too late to change the internal digest
            }
            sized(&state, size);
            s.eof_declared(&mut bound, size, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Ok(()));
        assert_eq!((out.summary.live, out.summary.declared_pending), (0, 0));
        assert_eq!(b.used, size);
        assert_eq!(b.json_work, if empty { 53 } else { 58 });
        assert!(Rc::ptr_eq(&origin, &b.inspection_origin));
        assert_eq!(
            (
                b.metadata_calls,
                b.metadata_name_bytes,
                b.topology_calls,
                b.reserved,
                b.retries_left
            ),
            (0, 0, 0, 0, 8)
        );
    }
}

#[test]
fn malformed_digest_is_rejected_before_metadata_or_read() {
    for digest in [
        "".into(),
        "a".repeat(63),
        "a".repeat(65),
        ABC.to_uppercase(),
        "g".repeat(64),
        "é".repeat(32),
    ] {
        let (source, state, stop, tick) = fixture();
        let declaration = entry(3, &digest);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.bind_declared(&f, &declaration, 1).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Binding));
        assert_eq!(state.borrow().counts, [2, 0, 0, 0, 2]);
        assert_eq!(out.summary.declared_pending, 0);
    }
}

#[test]
fn interrupted_output_and_eof_buffer_are_never_hashed() {
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().reads.extend([
        Err(OpFailure::Interrupted),
        Ok(3),
        Err(OpFailure::Interrupted),
        Ok(0),
    ]);
    state
        .borrow_mut()
        .read_data
        .extend([b"zzz".to_vec(), b"abc".to_vec(), vec![b'z'], vec![b'z']]);
    sized(&state, 3);
    let declaration = entry(3, ABC);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut bound = s.bind_declared(&f, &declaration, 1)?;
        assert_eq!(
            s.read_declared(&mut bound, 0, &mut [0; 3])?,
            ReadStep::Interrupted
        );
        s.read_declared(&mut bound, 0, &mut [0; 3])?;
        assert_eq!(
            s.eof_declared(&mut bound, 3, &mut [0])?,
            ReadStep::Interrupted
        );
        sized(&state, 3);
        s.eof_declared(&mut bound, 3, &mut [0]).map(|_| ())
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!((b.used, b.retries_left, b.json_work), (3, 6, 64));
    assert_eq!(
        state.borrow().read_requests,
        [(2, 0, 3), (2, 0, 3), (2, 3, 1), (2, 3, 1)]
    );
}

#[test]
fn interleaved_files_keep_separate_hash_state_bound_to_their_resource() {
    const XYZ: &str = "3608bca1e44ea6c4d268eb6db02260269892c0b42b86bbf1e77a6fa16c3c9282";
    let (source, state, stop, tick) = fixture();
    state
        .borrow_mut()
        .reads
        .extend([Ok(3), Ok(3), Ok(0), Ok(0)]);
    state
        .borrow_mut()
        .read_data
        .extend([b"abc".to_vec(), b"xyz".to_vec()]);
    let first = entry(3, ABC);
    let second = entry(3, XYZ);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let g = s.acquire(Some(&a), Some("other"), Kind::File)?;
        sized(&state, 3);
        let mut f = s.bind_declared(&f, &first, 1)?;
        sized(&state, 3);
        let mut g = s.bind_declared(&g, &second, 1)?;
        s.read_declared(&mut f, 0, &mut [0; 3])?;
        s.read_declared(&mut g, 0, &mut [0; 3])?;
        sized(&state, 3);
        s.eof_declared(&mut f, 3, &mut [0])?;
        sized(&state, 3);
        s.eof_declared(&mut g, 3, &mut [0]).map(|_| ())
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!(
        state.borrow().read_requests,
        [(2, 0, 3), (3, 0, 3), (2, 3, 1), (3, 3, 1)]
    );
    assert_eq!(b.used, 6);
    assert_eq!(out.summary.declared_pending, 0);
    assert!(!state.borrow().duplicate);
}

#[test]
fn multichunk_stream_matches_independent_one_shot_digest() {
    use sha2::{Digest, Sha256};
    let mut content = vec![b'a'; MAX_CHUNK];
    content.extend_from_slice(b"tail!");
    let expected = format!("{:x}", Sha256::digest(&content));
    let size = content.len() as u64;
    let (source, state, stop, tick) = fixture();
    state
        .borrow_mut()
        .reads
        .extend([Ok(MAX_CHUNK), Ok(5), Ok(0)]);
    state
        .borrow_mut()
        .read_data
        .extend([content[..MAX_CHUNK].to_vec(), b"tail!".to_vec()]);
    sized(&state, size);
    let declaration = entry(size, &expected);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut bound = s.bind_declared(&f, &declaration, 1)?;
        s.read_declared(&mut bound, 0, &mut [0; MAX_CHUNK])?;
        s.read_declared(&mut bound, MAX_CHUNK as u64, &mut [0; 5])?;
        sized(&state, size);
        s.eof_declared(&mut bound, size, &mut [0]).map(|_| ())
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!((b.used, b.json_work), (size, 63));
}

#[test]
fn deadline_and_cancel_at_hash_phase_checkpoints_never_return_success() {
    // Capture checkpoints during bind/decode/init, after data I/O and after post-stat.
    // Includes hash update/progress and finalize/compare guards, not OS timing sleeps.
    let positions = RefCell::new(Vec::new());
    let run = |trigger: Option<(usize, bool)>| {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(3), Ok(0)]);
        state.borrow_mut().read_data.push_back(b"abc".to_vec());
        sized(&state, 3);
        let counter = Cell::new(0);
        let start = tick.get();
        let now = || {
            let n = counter.get() + 1;
            counter.set(n);
            if trigger.is_none()
                && matches!(state.borrow().counts.iter().sum::<u64>(), 2 | 12 | 13 | 24)
            {
                positions.borrow_mut().push(n);
            }
            if let Some((at, deadline)) = trigger
                && n >= at
            {
                if deadline {
                    return start + Duration::from_secs(10);
                }
                stop.store(true, Ordering::Release);
            }
            start
        };
        let mut b = SharedBudget::new(start, &stop);
        b.now = &now;
        let declaration = entry(3, ABC);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut bound = s.bind_declared(&f, &declaration, 1)?;
            s.read_declared(&mut bound, 0, &mut [0; 3])?;
            sized(&state, 3);
            s.eof_declared(&mut bound, 3, &mut [0]).map(|_| ())
        });
        assert_eq!(out.summary.live, 0);
        assert_eq!(state.borrow().next, state.borrow().counts[4]);
        assert!(!state.borrow().duplicate);
        assert!(b.used <= 3);
        out.result
    };
    assert_eq!(run(None), Ok(()));
    let captured = positions.borrow().clone();
    assert!(captured.len() >= 10);
    for at in captured {
        for deadline in [false, true] {
            assert_eq!(
                run(Some((at, deadline))),
                Err(if deadline {
                    Failure::Deadline
                } else {
                    Failure::Cancelled
                })
            );
        }
    }
}
