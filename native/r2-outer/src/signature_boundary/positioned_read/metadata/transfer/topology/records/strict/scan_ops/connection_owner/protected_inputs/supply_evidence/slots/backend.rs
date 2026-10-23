//! Sealed backend-state inspection. Only the cfg(test) synthetic source implements it.
use super::*;
mod sealed {
    pub trait Sealed {}
}
pub(in super::super::super::super::super) trait Backend:
    sealed::Sealed
{
    fn origin(&self) -> &Rc<()>;
    fn model(&self) -> &'static str;
    fn unstarted(&self) -> bool;
}
pub(super) const MODEL: &str = "bp5-r2-evidence-synthetic-scan-0.1";
#[cfg(test)]
pub(in super::super::super::super::super) struct SyntheticBackend {
    pub(super) origin: Rc<()>,
    pub(super) model: &'static str,
    started: bool,
    audit: Audit,
}
#[cfg(test)]
#[derive(Clone, Default)]
pub(in super::super::super::super::super) struct Audit(Rc<Counts>);
#[cfg(test)]
#[derive(Default)]
struct Counts {
    operations: std::cell::Cell<usize>,
    dropped: std::cell::Cell<usize>,
}
#[cfg(test)]
impl Audit {
    pub(in super::super::super::super::super) fn operations(&self) -> usize {
        self.0.operations.get()
    }
    pub(in super::super::super::super::super) fn dropped(&self) -> usize {
        self.0.dropped.get()
    }
}
#[cfg(test)]
impl SyntheticBackend {
    pub(super) fn fresh(audit: Audit) -> Self {
        Self {
            origin: Rc::new(()),
            model: MODEL,
            started: false,
            audit,
        }
    }
    fn start(&mut self) {
        self.started = true;
        self.audit
            .0
            .operations
            .set(self.audit.0.operations.get() + 1);
    }
}
#[cfg(test)]
impl Drop for SyntheticBackend {
    fn drop(&mut self) {
        self.audit.0.dropped.set(self.audit.0.dropped.get() + 1);
    }
}
#[cfg(test)]
impl sealed::Sealed for SyntheticBackend {}
#[cfg(test)]
impl Backend for SyntheticBackend {
    fn origin(&self) -> &Rc<()> {
        &self.origin
    }
    fn model(&self) -> &'static str {
        self.model
    }
    fn unstarted(&self) -> bool {
        !self.started
    }
}
// Actual operation attempts, including failed ones, mark this source as started.
// No successful handle/scan/cleanup proof is manufactured.
#[cfg(test)]
impl ScanOps for SyntheticBackend {
    type Handle = ();
    fn open(
        &mut self,
        _: Option<&()>,
        _: Option<&str>,
        _: scan_ops::Kind,
    ) -> Result<(), scan_ops::OpFailure> {
        self.start();
        Err(scan_ops::OpFailure::Unavailable)
    }
    fn acl_init(&mut self, _: &()) -> Result<(), scan_ops::OpFailure> {
        self.start();
        Err(scan_ops::OpFailure::Unavailable)
    }
    fn enumerate(
        &mut self,
        _: &(),
        _: &mut [u8; 255],
    ) -> Result<scan_ops::EnumValue, scan_ops::OpFailure> {
        self.start();
        Err(scan_ops::OpFailure::Unavailable)
    }
    fn read(&mut self, _: &(), _: u64, _: &mut [u8]) -> Result<usize, scan_ops::OpFailure> {
        self.start();
        Err(scan_ops::OpFailure::Unavailable)
    }
    fn metadata(
        &mut self,
        _: &(),
        _: scan_ops::MetaOp,
        _: &mut [u8],
    ) -> Result<scan_ops::MetaValue, scan_ops::OpFailure> {
        self.start();
        Err(scan_ops::OpFailure::Unavailable)
    }
    fn cleanup(&mut self, _: ()) -> scan_ops::Cleanup {
        self.start();
        scan_ops::Cleanup::Unconfirmed
    }
}
