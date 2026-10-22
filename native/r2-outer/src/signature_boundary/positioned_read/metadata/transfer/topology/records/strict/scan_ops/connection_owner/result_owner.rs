//! Inline upper-result retention and fixed protected dispatch. No runtime entry or success constructor.
use super::*;
use crate::signature_boundary::positioned_read::{ProtectedBridgeClaim, ScanSessionClaim};
use outer_result::{DropObservation, OuterPhase, OuterStrictFailure, PostReleaseCheckpoint};

pub(in super::super) const MODEL_ID: &str = "bp5-r2-strict-result-owner-0.1";
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super) enum InputStage {
    ModelInputUnavailable,
    InspectionBinding,
    ContextBinding,
    ReceiptBinding,
    SourceBinding,
    PolicyBinding,
    SlotBinding,
    // Owner-only: an awaiting result slot dropped without retain. Not a bridge guard stage.
    SlotAbandoned,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super) enum SupplyStage {
    InspectionEntry,
    Context,
    ReceiptTarget,
    HeldSources,
    PolicyCaps,
    Slots,
    SealPublish,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super) enum CreateStage {
    ClaimModel,
    InspectionPublish,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super) enum InputLocation {
    OwnerBegin,
    Supply(SupplyStage),
    Create(CreateStage),
    Use(InputStage),
    TransferCommit,
    SlotAbandoned,
}
impl InputLocation {
    fn legacy(self) -> Option<InputStage> {
        match self {
            Self::OwnerBegin => Some(InputStage::ModelInputUnavailable),
            Self::Use(s) => Some(s),
            Self::TransferCommit => Some(InputStage::InspectionBinding),
            Self::SlotAbandoned => Some(InputStage::SlotAbandoned),
            Self::Supply(_) | Self::Create(_) => None,
        }
    }
}
// Scalars only: no origin/lineage Rc, resource, path, raw bytes or identity authority.
pub(in super::super) struct InputRejected {
    primary: Failure,
    location: InputLocation,
    release: DropObservation,
    checkpoint: PostReleaseCheckpoint,
}
impl InputRejected {
    #[cfg(test)]
    pub(in super::super) fn new(
        stage: InputStage,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> Self {
        Self::at(
            if stage == InputStage::SlotAbandoned {
                InputLocation::SlotAbandoned
            } else {
                InputLocation::Use(stage)
            },
            reason,
            b,
        )
    }
    pub(super) fn at(location: InputLocation, reason: Failure, b: &mut SharedBudget<'_>) -> Self {
        Self {
            primary: b.stop::<()>(reason).unwrap_err(),
            location,
            release: DropObservation::NotReached,
            checkpoint: PostReleaseCheckpoint::NotReached,
        }
    }
    // Diagnostic join after the fixed bridge drops its payload, NOT an OS release proof.
    pub(in super::super) fn after_release(
        mut self,
        observed: DropObservation,
        b: &mut SharedBudget<'_>,
    ) -> Self {
        self.checkpoint = match b.checkpoint() {
            Ok(()) => PostReleaseCheckpoint::Passed,
            Err(e) => PostReleaseCheckpoint::Stopped(e),
        };
        let _ = b.stop::<()>(self.primary);
        self.release = observed;
        self
    }
}
#[allow(clippy::large_enum_variant)] // Preserve the bounded original Outer inline; no Box allocation after stop.
pub(in super::super) enum StrictBridgeFailure {
    InputRejected(InputRejected),
    Outer(OuterStrictFailure),
}
impl StrictBridgeFailure {
    pub(in super::super) fn input(value: InputRejected) -> Self {
        Self::InputRejected(value)
    }
    pub(in super::super) fn outer(value: OuterStrictFailure) -> Self {
        Self::Outer(value)
    }
    pub(in super::super) fn reason(&self) -> Failure {
        match self {
            Self::InputRejected(e) => e.primary,
            Self::Outer(e) => e.reason(),
        }
    }
    pub(in super::super) fn input_stage(&self) -> Option<InputStage> {
        match self {
            Self::InputRejected(e) => e.location.legacy(),
            _ => None,
        }
    }
    pub(in super::super) fn input_location(&self) -> Option<InputLocation> {
        match self {
            Self::InputRejected(e) => Some(e.location),
            Self::Outer(_) => None,
        }
    }
    pub(in super::super) fn outer_phase(&self) -> Option<OuterPhase> {
        match self {
            Self::Outer(e) => Some(e.phase()),
            _ => None,
        }
    }
    pub(in super::super) fn round(&self) -> Option<Round> {
        match self {
            Self::Outer(e) => e.round(),
            _ => None,
        }
    }
    pub(in super::super) fn completion(
        &self,
    ) -> Option<collector::completion::CompletionDiagnostic> {
        match self {
            Self::Outer(e) => e
                .inner()
                .and_then(|inner| inner.completion.as_ref())
                .map(|c| c.diagnostic()),
            _ => None,
        }
    }
    pub(in super::super) fn release(&self) -> DropObservation {
        match self {
            Self::InputRejected(e) => e.release,
            Self::Outer(e) => e.release(),
        }
    }
    pub(in super::super) fn checkpoint(&self) -> PostReleaseCheckpoint {
        match self {
            Self::InputRejected(e) => e.checkpoint,
            Self::Outer(e) => e.checkpoint(),
        }
    }
}
pub(in super::super) type StrictBridgeResult = Result<RecordComparison, StrictBridgeFailure>;
#[derive(PartialEq, Eq)]
enum State {
    Empty,
    Awaiting,
    Retained,
    Consumed,
}
pub(in super::super) struct StrictResultOwner {
    state: State,
    result: Option<StrictBridgeResult>,
}
pub(in super::super) struct ResultSlot<'o> {
    owner: &'o mut StrictResultOwner,
    completed: bool,
    bridge: Rc<ProtectedBridgeClaim>,
    session: Rc<ScanSessionClaim>,
}
impl StrictResultOwner {
    pub(in super::super) fn new() -> Self {
        Self {
            state: State::Empty,
            result: None,
        }
    }
    // Test-only low-level entry. Production reaches it only through fixed same-budget callers.
    #[cfg(test)]
    pub(in super::super) fn begin<'o>(
        &'o mut self,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<ResultSlot<'o>, Failure> {
        self.begin_slot(expected, b)
    }
    fn begin_slot<'o>(
        &'o mut self,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<ResultSlot<'o>, Failure> {
        // No work after a retained failure, and never replace the existing result.
        if self.state != State::Empty {
            return b.stop(Failure::Binding);
        }
        self.state = State::Awaiting; // irreversible before the first fallible guard
        let result = (|| {
            work(b)?; // O.result_owner 1: claim/model
            if expected != MODEL_ID {
                return Err(Failure::Unavailable);
            }
            work(b)?; // O.result_owner 2: inline slot publication
            b.checkpoint()
        })();
        if let Err(reason) = result {
            let e = InputRejected::at(InputLocation::OwnerBegin, reason, b);
            let reason = e.primary;
            self.result = Some(Err(StrictBridgeFailure::input(e)));
            self.state = State::Retained;
            return Err(reason);
        }
        Ok(ResultSlot {
            owner: self,
            completed: false,
            bridge: b.protected_bridge_claim.clone(),
            session: b.scan_session_claim.clone(),
        })
    }
    pub(in super::super) fn failure(&self) -> Option<&StrictBridgeFailure> {
        self.result.as_ref().and_then(|r| r.as_ref().err())
    }
    pub(in super::super) fn take(&mut self) -> Option<StrictBridgeResult> {
        if self.state != State::Retained {
            return None;
        }
        self.state = State::Consumed;
        self.result.take()
    }
    pub(in super::super) fn run_protected<
        R: MetadataOps + ResourceOrigin,
        T: TopologySource<R>,
        S: RecordSource,
        C: ScanOps,
    >(
        &mut self,
        inputs: protected_inputs::ProtectedStrictInputs<'_, R, T, S, C>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let fresh = self.state == State::Empty;
        let reason = match self.begin_slot(MODEL_ID, b) {
            Ok(slot) => {
                let result = inputs.into_release(b);
                let signal = result.as_ref().map(|_| ()).map_err(|e| e.reason());
                slot.retain_result(result); // No additional guard, budget, callback or foreign result input.
                return signal;
            }
            Err(reason) => reason,
        };
        let rejection = inputs.discard(InputLocation::OwnerBegin, reason, b);
        if fresh {
            // Same first begin rejection, now with the actual input-drop/checkpoint observations.
            self.result = Some(Err(StrictBridgeFailure::input(rejection)));
            self.state = State::Retained;
        }
        // On a duplicate begin, the previous result is never replaced.
        Err(reason)
    }
    pub(in super::super) fn run_creation<
        R: MetadataOps + ResourceOrigin,
        T: TopologySource<R>,
        S: RecordSource,
        C: ScanOps,
    >(
        &mut self,
        input: protected_inputs::preparation::PreparationEnvelope<'_, R, T, S, C>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let attempt = input.start_preparation(b); // Irreversible, before even the owner guard/work.
        let fresh = self.state == State::Empty;
        let reason = match self.begin_slot(MODEL_ID, b) {
            Ok(slot) => {
                let result = match input
                    .complete(attempt, b)
                    .and_then(|s| protected_inputs::create_typed(s, protected_inputs::MODEL_ID, b))
                {
                    Ok(bundle) => bundle.into_release(b),
                    Err(e) => Err(StrictBridgeFailure::input(e)),
                };
                let signal = result.as_ref().map(|_| ()).map_err(|e| e.reason());
                slot.retain_result(result);
                return signal;
            }
            Err(e) => e,
        };
        let rejection = input.discard(InputLocation::OwnerBegin, reason, b);
        if fresh {
            self.result = Some(Err(StrictBridgeFailure::input(rejection)));
            self.state = State::Retained;
        }
        Err(reason)
    }
}
impl ResultSlot<'_> {
    // Test-only low-level store; production stores only its fixed caller's actual result.
    #[cfg(test)]
    pub(in super::super) fn retain(self, result: StrictBridgeResult) {
        self.retain_result(result)
    }
    // Unique mutable slot + value consumption: no fallible check/work/callback after return.
    fn retain_result(mut self, result: StrictBridgeResult) {
        self.owner.result = Some(result);
        self.owner.state = State::Retained;
        self.completed = true;
    }
}
impl Drop for ResultSlot<'_> {
    fn drop(&mut self) {
        if !self.completed {
            let reason = self
                .bridge
                .failure
                .get()
                .or(self.session.failure.get())
                .unwrap_or(Failure::Unavailable);
            self.bridge.failure.set(Some(reason));
            self.owner.result = Some(Err(StrictBridgeFailure::input(InputRejected {
                primary: reason,
                location: InputLocation::SlotAbandoned,
                release: DropObservation::NotReached,
                checkpoint: PostReleaseCheckpoint::NotReached,
            })));
            self.owner.state = State::Retained;
        }
    }
}
macro_rules! opaque_debug {
    ($t:ty,$label:literal) => {
        impl std::fmt::Debug for $t {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str($label)
            }
        }
    };
}
opaque_debug!(InputRejected, "InputRejected(diagnostics_only)");
opaque_debug!(StrictBridgeFailure, "StrictBridgeFailure(diagnostics_only)");
opaque_debug!(
    StrictResultOwner,
    "StrictResultOwner(inline_retention_not_execution_authority)"
);
opaque_debug!(
    ResultSlot<'_>,
    "StrictResultSlot(one_shot_not_execution_authority)"
);

#[cfg(test)]
mod contracts {
    use super::*;
    #[test]
    fn input_location_distinguishes_creation_and_preserves_legacy_projection_and_first_reason() {
        use InputLocation as L;
        use InputStage as U;
        let locations = [
            (L::OwnerBegin, Some(U::ModelInputUnavailable)),
            (L::Supply(SupplyStage::InspectionEntry), None),
            (L::Supply(SupplyStage::Context), None),
            (L::Supply(SupplyStage::ReceiptTarget), None),
            (L::Supply(SupplyStage::HeldSources), None),
            (L::Supply(SupplyStage::PolicyCaps), None),
            (L::Supply(SupplyStage::Slots), None),
            (L::Supply(SupplyStage::SealPublish), None),
            (L::Create(CreateStage::ClaimModel), None),
            (L::Create(CreateStage::InspectionPublish), None),
            (
                L::Use(U::ModelInputUnavailable),
                Some(U::ModelInputUnavailable),
            ),
            (L::Use(U::InspectionBinding), Some(U::InspectionBinding)),
            (L::Use(U::ContextBinding), Some(U::ContextBinding)),
            (L::Use(U::ReceiptBinding), Some(U::ReceiptBinding)),
            (L::Use(U::SourceBinding), Some(U::SourceBinding)),
            (L::Use(U::PolicyBinding), Some(U::PolicyBinding)),
            (L::Use(U::SlotBinding), Some(U::SlotBinding)),
            (L::TransferCommit, Some(U::InspectionBinding)),
            (L::SlotAbandoned, Some(U::SlotAbandoned)),
        ];
        for (location, legacy) in locations {
            let cancel = std::sync::atomic::AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let mut owner = StrictResultOwner::new();
            let slot = owner.begin_slot(MODEL_ID, &mut b).unwrap();
            let _ = b.stop::<()>(Failure::Expired);
            let e = InputRejected::at(location, Failure::Binding, &mut b);
            b.json_work = 1_000_000;
            slot.retain_result(Err(StrictBridgeFailure::input(e)));
            let error = owner.take().unwrap().unwrap_err();
            assert_eq!(error.reason(), Failure::Expired);
            assert_eq!(error.input_location(), Some(location));
            assert_eq!(error.input_stage(), legacy);
            assert_eq!(b.json_work, 1_000_000);
            assert_eq!(
                format!("{error:?}"),
                "StrictBridgeFailure(diagnostics_only)"
            );
        }
    }
    #[test]
    fn upper_ownership_is_inline_move_only_and_not_serializable() {
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
        opaque!(InputRejected);
        opaque!(StrictBridgeFailure);
        opaque!(StrictResultOwner);
        opaque!(ResultSlot<'static>);
        assert!(std::mem::size_of::<InputRejected>() <= 48);
        assert!(std::mem::size_of::<StrictBridgeFailure>() <= 512);
        assert!(std::mem::size_of::<StrictResultOwner>() <= 512);
        assert!(std::mem::size_of::<ResultSlot<'static>>() <= 64);
    }
}
