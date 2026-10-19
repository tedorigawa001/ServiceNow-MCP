use crate::{InspectedRecords, exec_os::Image, inspect_installed_records, launch_args};
use std::convert::Infallible;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchFailure {
    InvalidArguments,
    RecordRejected,
    TrustGatePending,
    SetupFailed,
    ExecFailed,
    Unsupported,
}
impl LaunchFailure {
    pub fn code(self) -> i32 {
        match self {
            Self::InvalidArguments => 90,
            Self::RecordRejected => 91,
            Self::TrustGatePending => 92,
            Self::SetupFailed => 93,
            Self::ExecFailed => 94,
            Self::Unsupported => 95,
        }
    }
}
fn runtime_gate(_records: &InspectedRecords) -> Result<(), LaunchFailure> {
    // OL-02 is not execution authority. Signed deployment, actual binary signatures, closure
    // verification and group exclusivity must be implemented before this gate can succeed.
    Err(LaunchFailure::TrustGatePending)
}
fn finish(
    records: InspectedRecords,
    args: launch_args::Arguments,
) -> Result<Infallible, LaunchFailure> {
    runtime_gate(&records)?;
    let (node, cwd) = records._ledger.launch_paths();
    Image::new(node, cwd, args)
        .map_err(|_| LaunchFailure::SetupFailed)?
        .replace()
        .map_err(|code| match code {
            94 => LaunchFailure::ExecFailed,
            95 => LaunchFailure::Unsupported,
            _ => LaunchFailure::SetupFailed,
        })
}
/// Dedicated-process use only. Currently fail-closed until independent runtime trust gates exist.
/// No operational launcher executable or caller-controlled runtime-verification hook is provided.
pub fn exec_installed(args: &[String]) -> Result<Infallible, LaunchFailure> {
    let args = launch_args::parse(args).map_err(|_| LaunchFailure::InvalidArguments)?;
    let records = inspect_installed_records().map_err(|_| LaunchFailure::RecordRejected)?;
    finish(records, args)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn codes_do_not_overlap_entry() {
        for c in [
            LaunchFailure::InvalidArguments,
            LaunchFailure::RecordRejected,
            LaunchFailure::TrustGatePending,
            LaunchFailure::SetupFailed,
            LaunchFailure::ExecFailed,
            LaunchFailure::Unsupported,
        ] {
            assert!((90..=95).contains(&c.code()));
        }
    }
    #[test]
    fn rejects_override_before_read_or_exec() {
        assert_eq!(
            exec_installed(&["run".into(), "/p".into(), "--node".into(), "/evil".into()]).err(),
            Some(LaunchFailure::InvalidArguments)
        );
    }
    #[test]
    fn opaque_records_cannot_authorize_exec() {
        let f = crate::tests::fixture();
        let r = crate::inspect(&f).unwrap();
        assert_eq!(
            finish(r, launch_args::parse(&["/p".into()]).unwrap()).err(),
            Some(LaunchFailure::TrustGatePending)
        );
    }
}
