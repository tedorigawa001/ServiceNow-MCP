//! Record-only charged-work profile. No reservation, trusted context producer or permit.
use super::*;

pub(crate) const MODEL_ID: &str = "bp5-r2-record-work-0.1";
// Internal inspection-model limit, NOT a claim about the OS's maximum group count.
pub(crate) const MAX_GROUPS: usize = 1024;
const FIXED_KERNEL: u64 = 19; // includes the strict caller's two projection steps
const FIXED_PROFILE: u64 = 12; // groups guard1 + JSON start/end6 + calculation5

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Error<E> {
    Record(Rejection<E>),
    ModelMismatch,
    Binding,
    Limit,
}
fn tick<B: Budget>(b: &mut B) -> Result<(), Error<B::Failure>> {
    step(b).map_err(Error::Record)
}
fn add<E>(a: u64, b: u64) -> Result<u64, Error<E>> {
    a.checked_add(b).ok_or(Error::Limit)
}
fn mul<E>(a: u64, b: u64) -> Result<u64, Error<E>> {
    a.checked_mul(b).ok_or(Error::Limit)
}
fn sum<E>(items: &[u64]) -> Result<u64, Error<E>> {
    items.iter().try_fold(0, |n, item| add(n, *item))
}
struct Collector<'a, B: Budget> {
    budget: &'a mut B,
    shapes: [Option<shared::JsonShape>; 3],
    count: usize,
}
impl<B: Budget> Budget for Collector<'_, B> {
    type Failure = B::Failure;
    fn checkpoint(&mut self) -> Result<(), Self::Failure> {
        self.budget.checkpoint()
    }
    fn work(&mut self, n: u64) -> Result<(), Self::Failure> {
        self.budget.work(n)
    }
    fn collect_json_shape(&self) -> bool {
        true
    }
    fn accepted_json_shape(&mut self, shape: shared::JsonShape) -> Result<(), Self::Failure> {
        self.budget.checkpoint()?;
        if self.count < 3 {
            self.shapes[self.count] = Some(shape);
        }
        // Saturate at one over the fixed capacity; never allocate an unbounded list.
        self.count = (self.count + 1).min(4);
        self.budget.checkpoint()
    }
}
pub(crate) struct Profile<'a> {
    model: &'static str,
    raw: [&'a [u8]; 3],
    pins: &'a Pins<'a>,
    context: &'a Context<'a>,
    shapes: [shared::JsonShape; 3], // decode order: activation, registry, ledger
    kernel: u64,
    collection: u64,
    per_validation: u64,
    six_validations: u64,
}
impl std::fmt::Debug for Profile<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RecordWork(sealed_record_only_not_admission_or_execution_authority)")
    }
}
pub(crate) struct Profiled<'a> {
    pub(crate) records: ValidatedRecords,
    pub(crate) profile: Profile<'a>,
}
impl Profile<'_> {
    // A scalar is not a permit. Consumers must first check the original borrowed inputs.
    pub(crate) fn per_validation(&self) -> u64 {
        self.per_validation
    }
    pub(crate) fn six_validations(&self) -> u64 {
        self.six_validations
    }
    pub(crate) fn require<B: Budget>(
        &self,
        expected: &str,
        raw: [&[u8]; 3],
        pins: &Pins<'_>,
        context: &Context<'_>,
        b: &mut B,
    ) -> Result<(), Error<B::Failure>> {
        tick(b)?; // extra guard cost, outside the normal validation profile
        if expected != MODEL_ID || self.model != MODEL_ID {
            return Err(Error::ModelMismatch);
        }
        if !self.raw.iter().zip(raw).all(|(a, z)| std::ptr::eq(*a, z))
            || !std::ptr::eq(self.pins, pins)
            || !std::ptr::eq(self.context, context)
        {
            return Err(Error::Binding);
        }
        b.checkpoint()
            .map_err(|e| Error::Record(Rejection::Budget(e)))
    }
}
fn component<E>(s: &shared::JsonShape) -> Result<(u64, u64, u64), Error<E>> {
    if s.bytes == 0 || s.bytes > 65536 || s.text_events > s.text {
        return Err(Error::Limit);
    }
    let c = s.bytes.div_ceil(65536);
    let json = sum(&[c, s.values, mul(2, s.keys)?, s.text, s.arrays, 1])?;
    let hash = add(2, mul(2, c)?)?;
    let events = sum(&[s.values, s.keys, s.text_events, s.arrays])?;
    Ok((json, hash, events))
}
// Does not change validate()/activation() or index decoding's default work contract.
// Profiles are rebuilt for EACH call; first-only profile reuse/admission is not connected.
pub(crate) fn validate_profiled<'a, B: Budget>(
    a: &'a [u8],
    l: &'a [u8],
    registry: &'a [u8],
    pins: &'a Pins<'a>,
    context: &'a Context<'a>,
    b: &mut B,
) -> Result<Profiled<'a>, Error<B::Failure>> {
    tick(b)?;
    if context.groups.len() > MAX_GROUPS {
        return Err(Error::Limit);
    }
    let mut collector = Collector {
        budget: b,
        shapes: std::array::from_fn(|_| None),
        count: 0,
    };
    let records = validate(a, l, registry, pins, context, &mut collector).map_err(Error::Record)?;
    if collector.count != 3 {
        return Err(Error::Limit);
    }
    let [Some(sa), Some(sg), Some(sl)] = collector.shapes else {
        return Err(Error::Limit);
    };
    tick(b)?; // calculation1: fixed model and accepted record group/policy shape
    let policies = records._registry.inspection_policy_count();
    if !(2..=32).contains(&policies) {
        return Err(Error::Limit);
    }
    let mut kernel = add(FIXED_KERNEL, context.groups.len() as u64)?;
    kernel = add(kernel, policies as u64)?;
    let mut collection = FIXED_PROFILE;
    for shape in [&sa, &sg, &sl] {
        tick(b)?; // calculation2..4: one bounded component calculation per record
        let (json, hash, events) = component(shape)?;
        kernel = sum(&[kernel, json, hash])?;
        collection = add(collection, events)?;
    }
    tick(b)?; // calculation5: total; no spent subtraction or reservation
    let per_validation = add(kernel, collection)?;
    let six_validations = mul(6, per_validation)?;
    b.checkpoint()
        .map_err(|e| Error::Record(Rejection::Budget(e)))?;
    Ok(Profiled {
        records,
        profile: Profile {
            model: MODEL_ID,
            raw: [a, l, registry],
            pins,
            context,
            shapes: [sa, sg, sl],
            kernel,
            collection,
            per_validation,
            six_validations,
        },
    })
}

#[cfg(test)]
mod tests;
