//! Pure, staged shared-budget declaration and full-set comparison. No observed-files producer.
use super::*;
use crate::json::shared::{self as json, Budget, Limits};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Rejection<E> {
    Json(json::Rejection<E>),
    Closure(ClosureFailure),
    Budget(E),
}
fn step<B: Budget>(b: &mut B) -> Result<(), Rejection<B::Failure>> {
    b.checkpoint().map_err(Rejection::Budget)?;
    b.work(1).map_err(Rejection::Budget)?;
    b.checkpoint().map_err(Rejection::Budget)
}
fn parse<B: Budget>(
    bytes: &[u8],
    binding: &Binding<'_>,
    b: &mut B,
) -> Result<Index, Rejection<B::Failure>> {
    step(b)?;
    if bytes.len() > MAX_BYTES {
        return Err(Rejection::Closure(ClosureFailure::Limit));
    }
    if !hex(binding.index_sha256) {
        return Err(Rejection::Closure(ClosureFailure::Binding));
    }
    let mut hash = Sha256::new();
    for chunk in bytes.chunks(65536) {
        step(b)?;
        hash.update(chunk);
        step(b)?;
    }
    let digest = format!("{:x}", hash.finalize());
    step(b)?;
    if digest != binding.index_sha256 {
        return Err(Rejection::Closure(ClosureFailure::Binding));
    }
    let index: Index = json::decode(
        bytes,
        Limits {
            max_bytes: MAX_BYTES,
            max_depth: 16,
            max_items: MAX_ENTRIES,
        },
        b,
    )
    .map_err(Rejection::Json)?;
    step(b)?;
    let checked = header(&index, binding, || digest);
    step(b)?;
    checked.map_err(Rejection::Closure)?;
    Ok(index)
}
pub(crate) struct Declaration {
    entries: Vec<Entry>,
}
impl std::fmt::Debug for Declaration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ClosureDeclaration(pure_not_observation_or_execution_authority)")
    }
}
pub(crate) fn declared<B: Budget>(
    bytes: &[u8],
    binding: &Binding<'_>,
    b: &mut B,
) -> Result<Declaration, Rejection<B::Failure>> {
    let index = parse(bytes, binding, b)?;
    let validated = check_entries(
        &index,
        bytes.len(),
        binding,
        None,
        &mut || step(b),
        Rejection::Closure,
    );
    b.checkpoint().map_err(Rejection::Budget)?;
    validated?;
    step(b)?;
    Ok(Declaration {
        entries: index.entries,
    })
}
pub(crate) struct Comparison {
    checked: CheckedIndex,
}
impl std::fmt::Debug for Comparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            "ClosureComparison(pure_pending_observation_producer_lease_not_execution_authority)",
        )
    }
}
pub(crate) fn check<B: Budget>(
    bytes: &[u8],
    binding: &Binding<'_>,
    observed: &[Entry],
    b: &mut B,
) -> Result<Comparison, Rejection<B::Failure>> {
    step(b)?;
    if observed.len() > MAX_ENTRIES + 1 {
        return Err(Rejection::Closure(ClosureFailure::Limit));
    }
    let index = parse(bytes, binding, b)?;
    let compared = check_entries(
        &index,
        bytes.len(),
        binding,
        Some(observed),
        &mut || step(b),
        Rejection::Closure,
    );
    b.checkpoint().map_err(Rejection::Budget)?;
    let checked = compared?;
    step(b)?;
    Ok(Comparison { checked })
}

#[cfg(test)]
pub(crate) mod tests;
