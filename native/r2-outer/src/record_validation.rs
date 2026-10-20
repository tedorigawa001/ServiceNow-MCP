//! Private, pure inspection validation only. No installed-reader/registry/permit producer.
use crate::{
    json::shared::{self, Budget, Limits},
    schema::{Activation, LedgerV2, Time},
    signature_policy::{self, ParsedRegistry, PolicyFailure},
};
use sha2::{Digest, Sha256};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Rejection<E> {
    Json(shared::Rejection<E>),
    InvalidRecord,
    Binding,
    Expired,
    Limit,
    Policy(PolicyFailure),
    Budget(E),
}
pub(crate) fn step<B: Budget>(b: &mut B) -> Result<(), Rejection<B::Failure>> {
    b.checkpoint().map_err(Rejection::Budget)?;
    b.work(1).map_err(Rejection::Budget)?;
    b.checkpoint().map_err(Rejection::Budget)
}
pub(crate) fn hash_record<B: Budget>(
    bytes: &[u8],
    b: &mut B,
) -> Result<String, Rejection<B::Failure>> {
    step(b)?;
    if bytes.len() > 65536 {
        return Err(Rejection::Limit);
    }
    let mut h = Sha256::new();
    for chunk in bytes.chunks(65536) {
        step(b)?;
        h.update(chunk);
        step(b)?;
    }
    let hash = format!("{:x}", h.finalize());
    step(b)?;
    Ok(hash)
}
pub(crate) fn authenticate<B: Budget>(
    bytes: &[u8],
    expected: &[u8; 32],
    b: &mut B,
) -> Result<String, Rejection<B::Failure>> {
    let actual = hash_record(bytes, b)?;
    let expected = expected
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(Rejection::Binding);
    }
    Ok(actual)
}
pub(crate) fn time<B: Budget>(
    t: &Time,
    started: u64,
    now: u64,
    b: &mut B,
) -> Result<(), Rejection<B::Failure>> {
    step(b)?;
    if now < started {
        return Err(Rejection::Binding);
    }
    let result = t
        .validate(started, 460_000)
        .and_then(|_| t.validate(now, 450_000));
    step(b)?;
    result.map_err(|e| {
        if e == crate::Failure::Expired {
            Rejection::Expired
        } else {
            Rejection::InvalidRecord
        }
    })
}
pub(crate) struct Context<'a> {
    pub execution_uid: u32,
    pub reader_gid: u32,
    pub groups: &'a [u32],
    pub product_version: &'a str,
    pub os_build: &'a str,
    pub started_wall_ms: u64,
    pub now_wall_ms: u64,
}
pub(crate) struct Pins<'a> {
    pub activation_hash: &'a [u8; 32],
    pub registry_hash: &'a [u8; 32],
}
pub(crate) fn activation<B: Budget>(
    bytes: &[u8],
    expected: &[u8; 32],
    context: &Context<'_>,
    b: &mut B,
) -> Result<Activation, Rejection<B::Failure>> {
    authenticate(bytes, expected, b)?;
    let a: Activation = shared::decode(
        bytes,
        Limits {
            max_bytes: 65536,
            max_depth: 16,
            max_items: 65536,
        },
        b,
    )
    .map_err(Rejection::Json)?;
    step(b)?;
    let valid = a.validate();
    step(b)?;
    valid.map_err(|_| Rejection::InvalidRecord)?;
    let mut member = false;
    for group in context.groups {
        step(b)?;
        member |= *group == a.reader_gid;
    }
    if a.execution_uid != context.execution_uid || a.reader_gid != context.reader_gid || !member {
        return Err(Rejection::Binding);
    }
    time(&a.time(), context.started_wall_ms, context.now_wall_ms, b)?;
    step(b)?;
    Ok(a)
}
pub(crate) struct ValidatedRecords {
    _activation: Activation,
    _ledger: LedgerV2,
    _registry: ParsedRegistry,
}
#[cfg(test)]
std::thread_local! { static RECORD_VALIDATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }
#[cfg(test)]
pub(crate) fn record_validation_count() -> usize {
    RECORD_VALIDATIONS.with(|n| n.get())
}
impl std::fmt::Debug for ValidatedRecords {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ValidatedRecords(pure_pending_reader_closure_lease_not_execution_authority)")
    }
}
impl ValidatedRecords {
    pub(crate) fn inspection_parts(&self) -> (&Activation, &LedgerV2) {
        (&self._activation, &self._ledger)
    }
}
pub(crate) fn validate<B: Budget>(
    activation_bytes: &[u8],
    ledger_bytes: &[u8],
    registry_bytes: &[u8],
    pins: &Pins<'_>,
    context: &Context<'_>,
    b: &mut B,
) -> Result<ValidatedRecords, Rejection<B::Failure>> {
    #[cfg(test)]
    RECORD_VALIDATIONS.with(|n| n.set(n.get() + 1));
    let a = activation(activation_bytes, pins.activation_hash, context, b)?;
    let registry = signature_policy::parse_shared(registry_bytes, pins.registry_hash, b)?;
    let ledger = crate::ledger_v2::parse_shared(
        ledger_bytes,
        &registry,
        &crate::ledger_v2::Context {
            ledger_sha256: &a.ledger_sha256,
            generation: a.generation,
            release_id: &a.release_id,
            execution_uid: a.execution_uid,
            index_sha256: &a.artifact_index_sha256,
            product_version: context.product_version,
            os_build: context.os_build,
            start_wall_ms: context.started_wall_ms,
        },
        context.now_wall_ms,
        b,
    )?;
    step(b)?;
    Ok(ValidatedRecords {
        _activation: a,
        _ledger: ledger,
        _registry: registry,
    })
}

#[cfg(test)]
pub(crate) mod tests;
