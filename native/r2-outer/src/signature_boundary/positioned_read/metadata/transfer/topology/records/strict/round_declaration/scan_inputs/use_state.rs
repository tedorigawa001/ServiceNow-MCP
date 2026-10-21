//! Private input-local state, not a transferable permit. Collector entry is not connected.
use super::Instant;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum State {
    Fresh,
    Attempted,
    BridgeReady { started: Instant, retries: u8 },
    // Reserved for the later collector entry guard; no production transition exists yet.
    Entered,
}
impl std::fmt::Debug for State {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanUseState(private_not_execution_authority)")
    }
}
