//! Private native driver. Never installed, called by the launcher, or an execution authority.
use super::*;
use crate::signature_policy::{ObservedValue, Representation};
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

const NO_NETWORK: u32 = 1 << 29;
const STATIC_FLAGS: u32 = NO_NETWORK | 1 | (1 << 12); // all architectures, serial resources
const SIGNING_INFO: u32 = 1 << 1;
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    String,
    Number,
    Boolean,
    Dictionary,
    Data,
    Url,
    Other,
}
#[derive(Clone, Copy)]
enum Key {
    Team,
    Identifier,
    Flags,
    Entitlements,
    RawEntitlements,
}
// Raw tokens are private to this driver. Native only returns CF objects; fake never dereferences.
trait Api {
    fn release(&self, object: usize);
    fn create_static(&self, path: &str) -> (i32, usize);
    fn copy_self(&self) -> (i32, usize);
    fn copy_static(&self, object: usize) -> (i32, usize);
    fn copy_path(&self, object: usize) -> (i32, usize);
    fn requirement(&self, text: &str) -> (i32, usize);
    fn validate(&self, code: usize, requirement: usize, flags: u32, dynamic: bool) -> i32;
    fn signing(&self, code: usize, flags: u32) -> (i32, usize);
    fn kind(&self, object: usize) -> Kind;
    fn lookup(&self, dictionary: usize, key: Key) -> usize;
    fn string(&self, object: usize, limit: usize) -> Result<String, Rejection>;
    fn path(&self, object: usize) -> Result<String, Rejection>;
    fn number(&self, object: usize) -> Result<u32, Rejection>;
    fn boolean(&self, object: usize) -> bool;
    fn entries(&self, object: usize) -> Result<Vec<(usize, usize)>, Rejection>;
}
struct Owned<A: Api> {
    api: Rc<A>,
    raw: usize,
}
impl<A: Api> Drop for Owned<A> {
    fn drop(&mut self) {
        self.api.release(self.raw);
    }
}
fn owned<A: Api>(api: &Rc<A>, result: (i32, usize)) -> Result<Owned<A>, Rejection> {
    // Own even an anomalous non-null output on error before examining the status.
    let object = (result.1 != 0).then(|| Owned {
        api: api.clone(),
        raw: result.1,
    });
    if result.0 != 0 {
        return Err(status_error(result.0));
    }
    object.ok_or(Rejection::MissingObject)
}
fn status_error(code: i32) -> Rejection {
    match code {
        -67050 => Rejection::RequirementMismatch,
        -67062 | -67061 => Rejection::InvalidSignature,
        -67034 => Rejection::IdentityChanged,
        _ => Rejection::ApiFailed,
    }
}
fn requirement_text(p: &BoundPolicy<'_>) -> Result<String, Rejection> {
    if p.template != "developer_id_application_v1"
        || p.anchor != "apple_developer_id"
        || p.certificate_class != "developer_id_application"
        || p.team_id.is_empty()
        || p.team_id.len() > 128
        || !p
            .team_id
            .bytes()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        || !crate::signature_policy::id(p.identifier)
    {
        return Err(Rejection::PolicyRejected);
    }
    // Draft fixed template, not approval of a real issuer or a production requirement policy.
    Ok(format!(
        "anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"{}\" and identifier \"{}\"",
        p.team_id, p.identifier
    ))
}
// Must originate from the held-FD deployment inspector, never argv/env. Not wired to one yet.
trait Evidence {
    fn checkpoint(&self) -> Result<(), Rejection>;
    fn path(&self) -> &str;
    fn identity(&self) -> Result<Identity, Rejection>;
    fn path_identity(&self) -> Result<Identity, Rejection>;
    fn layout(&self) -> Result<Layout, Rejection>;
}
struct Native<A: Api, E: Evidence> {
    api: Rc<A>,
    evidence: E,
}
struct NativeHandle<A: Api> {
    code: Owned<A>,
    dynamic: Option<Owned<A>>,
    requirement: RefCell<Option<Owned<A>>>,
    checked: Cell<bool>,
    self_checked: Cell<bool>,
}
impl<A: Api, E: Evidence> Native<A, E> {
    fn copy(&self, call: impl FnOnce() -> (i32, usize)) -> Result<Owned<A>, Rejection> {
        self.evidence.checkpoint()?;
        let result = owned(&self.api, call());
        self.evidence.checkpoint()?;
        result
    }
    fn validity(&self, call: impl FnOnce() -> i32) -> Result<(), Rejection> {
        self.evidence.checkpoint()?;
        let status = call();
        self.evidence.checkpoint()?;
        if status != 0 {
            return Err(status_error(status));
        }
        Ok(())
    }
    fn verify_path(&self, code: usize) -> Result<Identity, Rejection> {
        let url = self.copy(|| self.api.copy_path(code))?;
        if self.api.kind(url.raw) != Kind::Url {
            return Err(Rejection::UnknownObservation);
        }
        if self.api.path(url.raw)? != self.evidence.path() {
            return Err(Rejection::IdentityChanged);
        }
        let held = self.evidence.identity()?;
        if self.evidence.path_identity()? != held {
            return Err(Rejection::IdentityChanged);
        }
        Ok(held)
    }
}
impl<A: Api, E: Evidence> Backend for Native<A, E> {
    type Handle = NativeHandle<A>;
    fn identity(&self) -> Result<Identity, Rejection> {
        self.evidence.identity()
    }
    fn acquire(&self, role: Role) -> Result<Option<Self::Handle>, Rejection> {
        let path = self.evidence.path();
        if !path.starts_with('/')
            || path.len() > 4096
            || path
                .split('/')
                .skip(1)
                .any(|p| p.is_empty() || p == "." || p == "..")
            || path.chars().any(char::is_control)
        {
            return Err(Rejection::IdentityChanged);
        }
        if self.evidence.layout()? != Layout::ThinArm64 {
            return Err(Rejection::Unsupported);
        }
        let dynamic = if role == Role::Launcher {
            Some(self.copy(|| self.api.copy_self())?)
        } else {
            None
        };
        let code = self.copy(|| match &dynamic {
            Some(d) => self.api.copy_static(d.raw),
            None => self.api.create_static(path),
        })?;
        self.verify_path(code.raw)?;
        Ok(Some(NativeHandle {
            code,
            dynamic,
            requirement: RefCell::new(None),
            checked: Cell::new(false),
            self_checked: Cell::new(false),
        }))
    }
    fn validate(
        &self,
        h: &Self::Handle,
        p: &BoundPolicy<'_>,
        _: ValidationProfile,
    ) -> Result<Status, Rejection> {
        h.checked.set(false);
        h.self_checked.set(false);
        h.requirement.borrow_mut().take();
        let text = requirement_text(p)?;
        let req = self.copy(|| self.api.requirement(&text))?;
        self.validity(|| self.api.validate(h.code.raw, req.raw, STATIC_FLAGS, false))?;
        self.verify_path(h.code.raw)?;
        *h.requirement.borrow_mut() = Some(req);
        h.checked.set(true);
        Ok(Status::Valid)
    }
    fn validate_self(
        &self,
        h: &Self::Handle,
        _: ValidationProfile,
    ) -> Result<SelfObservation, Rejection> {
        h.self_checked.set(false);
        if !h.checked.get() {
            return Err(Rejection::InvalidSignature);
        }
        let req = h.requirement.borrow();
        let req = req.as_ref().ok_or(Rejection::MissingObject)?;
        let d = h.dynamic.as_ref().ok_or(Rejection::MissingObject)?;
        self.validity(|| self.api.validate(d.raw, req.raw, NO_NETWORK, true))?;
        let own_static = self.copy(|| self.api.copy_static(d.raw))?;
        let own = SelfObservation {
            status: Status::Valid,
            identity: self.verify_path(own_static.raw)?,
        };
        h.self_checked.set(true);
        Ok(own)
    }
    fn snapshot(&self, h: &Self::Handle) -> Result<Option<Snapshot>, Rejection> {
        if !h.checked.get() || (h.dynamic.is_some() && !h.self_checked.get()) {
            return Err(Rejection::InvalidSignature);
        }
        let info = self.copy(|| self.api.signing(h.code.raw, SIGNING_INFO))?;
        if self.api.kind(info.raw) != Kind::Dictionary {
            return Err(Rejection::UnknownObservation);
        }
        let get = |key| {
            let raw = self.api.lookup(info.raw, key);
            if raw == 0 {
                Err(Rejection::UnknownObservation)
            } else {
                Ok(raw)
            }
        };
        let team = self.api.string(get(Key::Team)?, 128)?;
        let identifier = self.api.string(get(Key::Identifier)?, 128)?;
        let flags = self.api.number(get(Key::Flags)?)?;
        if flags & (2 | 0x20000) != 0 {
            return Err(Rejection::InvalidSignature);
        }
        let dictionary = get(Key::Entitlements)?;
        if self.api.kind(dictionary) != Kind::Dictionary {
            return Err(Rejection::UnknownObservation);
        }
        // Raw/DER-to-dictionary consistency and absence proof are NOT implemented. Do not guess.
        if self.api.lookup(info.raw, Key::RawEntitlements) != 0 {
            return Err(Rejection::Unsupported);
        }
        let entries = self.api.entries(dictionary)?;
        if entries.len() > 32 {
            return Err(Rejection::Limit);
        }
        let mut projected = Vec::new();
        let mut bytes = 0usize;
        for (key, value) in entries {
            self.evidence.checkpoint()?;
            let key = self.api.string(key, 128)?;
            bytes = bytes.checked_add(key.len() + 1).ok_or(Rejection::Limit)?;
            let value = match self.api.kind(value) {
                Kind::Boolean => ObservedValue::Boolean(self.api.boolean(value)),
                Kind::Number => ObservedValue::Number,
                Kind::String => ObservedValue::String,
                Kind::Data => ObservedValue::Data,
                Kind::Dictionary => ObservedValue::Container,
                _ => ObservedValue::Unknown,
            };
            projected.push((key, value));
        }
        Ok(Some(Snapshot {
            layout: self.evidence.layout()?,
            form: SignatureForm::DeveloperIdApplication,
            identity: self.verify_path(h.code.raw)?,
            team_id: team,
            identifier,
            // These predicates were satisfied by the fixed requirement, not copied from an untrusted display string.
            anchor: "apple_developer_id".into(),
            certificate_class: "developer_id_application".into(),
            static_flags: flags,
            entitlements: Observation {
                representation: Representation::Dictionary(projected),
                blob_bytes: bytes,
            },
        }))
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod ffi;
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod file;
#[cfg(test)]
mod tests;
