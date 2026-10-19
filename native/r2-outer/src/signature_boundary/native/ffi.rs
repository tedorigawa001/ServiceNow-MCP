//! SDK declarations checked against macOS 26.5 headers. No invocation in synthetic tests.
use super::*;
use std::{ffi::c_void, ptr};
type Raw = *const c_void;
#[repr(C)]
struct Range {
    location: isize,
    length: isize,
}
#[link(name = "Security", kind = "framework")]
unsafe extern "C" {
    fn SecStaticCodeCreateWithPath(url: Raw, flags: u32, out: *mut Raw) -> i32;
    fn SecCodeCopySelf(flags: u32, out: *mut Raw) -> i32;
    fn SecCodeCopyStaticCode(code: Raw, flags: u32, out: *mut Raw) -> i32;
    fn SecCodeCopyPath(code: Raw, flags: u32, out: *mut Raw) -> i32;
    fn SecRequirementCreateWithString(text: Raw, flags: u32, out: *mut Raw) -> i32;
    fn SecStaticCodeCheckValidity(code: Raw, flags: u32, req: Raw) -> i32;
    fn SecCodeCheckValidity(code: Raw, flags: u32, req: Raw) -> i32;
    fn SecCodeCopySigningInformation(code: Raw, flags: u32, out: *mut Raw) -> i32;
    static kSecCodeInfoTeamIdentifier: Raw;
    static kSecCodeInfoIdentifier: Raw;
    static kSecCodeInfoFlags: Raw;
    static kSecCodeInfoEntitlementsDict: Raw;
    static kSecCodeInfoEntitlements: Raw;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(object: Raw);
    fn CFGetTypeID(object: Raw) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFDictionaryGetTypeID() -> usize;
    fn CFNumberGetTypeID() -> usize;
    fn CFBooleanGetTypeID() -> usize;
    fn CFDataGetTypeID() -> usize;
    fn CFURLGetTypeID() -> usize;
    fn CFURLCreateFromFileSystemRepresentation(
        alloc: Raw,
        bytes: *const u8,
        length: isize,
        directory: u8,
    ) -> Raw;
    fn CFURLGetFileSystemRepresentation(url: Raw, resolve: u8, bytes: *mut u8, max: isize) -> u8;
    fn CFStringCreateWithBytes(
        alloc: Raw,
        bytes: *const u8,
        length: isize,
        encoding: u32,
        external: u8,
    ) -> Raw;
    fn CFStringGetLength(object: Raw) -> isize;
    fn CFStringGetBytes(
        object: Raw,
        range: Range,
        encoding: u32,
        loss: u8,
        external: u8,
        bytes: *mut u8,
        max: isize,
        used: *mut isize,
    ) -> isize;
    fn CFDictionaryGetValue(object: Raw, key: Raw) -> Raw;
    fn CFDictionaryGetCount(object: Raw) -> isize;
    fn CFDictionaryGetKeysAndValues(object: Raw, keys: *mut Raw, values: *mut Raw);
    fn CFNumberIsFloatType(object: Raw) -> u8;
    fn CFNumberGetValue(object: Raw, number_type: isize, out: *mut c_void) -> u8;
    fn CFBooleanGetValue(object: Raw) -> u8;
}
const UTF8: u32 = 0x08000100;
// Temporary Create objects only. Copy outputs transfer directly to driver's Owned, even on error.
struct Local(Raw);
impl Drop for Local {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) };
        }
    }
}
pub(super) struct SystemApi;
fn copied(call: impl FnOnce(*mut Raw) -> i32) -> (i32, usize) {
    let mut out = ptr::null();
    let status = call(&mut out);
    (status, out as usize)
}
impl Api for SystemApi {
    // SAFETY throughout: tokens originate solely from CF/Security create/copy or dictionary get.
    // Owned objects outlive all borrowed dictionary members; types/bounds checked before projection.
    fn release(&self, object: usize) {
        if object != 0 {
            unsafe { CFRelease(object as Raw) };
        }
    }
    fn create_static(&self, path: &str) -> (i32, usize) {
        let url = Local(unsafe {
            CFURLCreateFromFileSystemRepresentation(
                ptr::null(),
                path.as_ptr(),
                path.len() as isize,
                0,
            )
        });
        if url.0.is_null() {
            return (-1, 0);
        }
        copied(|out| unsafe { SecStaticCodeCreateWithPath(url.0, 0, out) })
    }
    fn copy_self(&self) -> (i32, usize) {
        copied(|out| unsafe { SecCodeCopySelf(0, out) })
    }
    fn copy_static(&self, code: usize) -> (i32, usize) {
        copied(|out| unsafe { SecCodeCopyStaticCode(code as Raw, 0, out) })
    }
    fn copy_path(&self, code: usize) -> (i32, usize) {
        copied(|out| unsafe { SecCodeCopyPath(code as Raw, 0, out) })
    }
    fn requirement(&self, text: &str) -> (i32, usize) {
        let text = Local(unsafe {
            CFStringCreateWithBytes(ptr::null(), text.as_ptr(), text.len() as isize, UTF8, 0)
        });
        if text.0.is_null() {
            return (-1, 0);
        }
        copied(|out| unsafe { SecRequirementCreateWithString(text.0, 0, out) })
    }
    fn validate(&self, code: usize, req: usize, flags: u32, dynamic: bool) -> i32 {
        if dynamic {
            unsafe { SecCodeCheckValidity(code as Raw, flags, req as Raw) }
        } else {
            unsafe { SecStaticCodeCheckValidity(code as Raw, flags, req as Raw) }
        }
    }
    fn signing(&self, code: usize, flags: u32) -> (i32, usize) {
        copied(|out| unsafe { SecCodeCopySigningInformation(code as Raw, flags, out) })
    }
    fn kind(&self, object: usize) -> Kind {
        if object == 0 {
            return Kind::Other;
        }
        unsafe {
            let id = CFGetTypeID(object as Raw);
            if id == CFStringGetTypeID() {
                Kind::String
            } else if id == CFNumberGetTypeID() {
                Kind::Number
            } else if id == CFBooleanGetTypeID() {
                Kind::Boolean
            } else if id == CFDictionaryGetTypeID() {
                Kind::Dictionary
            } else if id == CFDataGetTypeID() {
                Kind::Data
            } else if id == CFURLGetTypeID() {
                Kind::Url
            } else {
                Kind::Other
            }
        }
    }
    fn lookup(&self, dictionary: usize, key: Key) -> usize {
        if self.kind(dictionary) != Kind::Dictionary {
            return 0;
        }
        unsafe {
            CFDictionaryGetValue(
                dictionary as Raw,
                match key {
                    Key::Team => kSecCodeInfoTeamIdentifier,
                    Key::Identifier => kSecCodeInfoIdentifier,
                    Key::Flags => kSecCodeInfoFlags,
                    Key::Entitlements => kSecCodeInfoEntitlementsDict,
                    Key::RawEntitlements => kSecCodeInfoEntitlements,
                },
            ) as usize
        }
    }
    fn string(&self, object: usize, limit: usize) -> Result<String, Rejection> {
        if self.kind(object) != Kind::String {
            return Err(Rejection::UnknownObservation);
        }
        let length = unsafe { CFStringGetLength(object as Raw) };
        if !(0..=128).contains(&length) || limit > 128 {
            return Err(Rejection::Limit);
        }
        let mut bytes = [0u8; 128];
        let mut used = 0;
        let converted = unsafe {
            CFStringGetBytes(
                object as Raw,
                Range {
                    location: 0,
                    length,
                },
                UTF8,
                0,
                0,
                bytes.as_mut_ptr(),
                limit as isize,
                &mut used,
            )
        };
        if converted != length || used < 0 || used as usize > limit {
            return Err(Rejection::Limit);
        }
        let value = std::str::from_utf8(&bytes[..used as usize])
            .map_err(|_| Rejection::UnknownObservation)?;
        if value.chars().any(char::is_control) {
            return Err(Rejection::UnknownObservation);
        }
        Ok(value.into())
    }
    fn path(&self, object: usize) -> Result<String, Rejection> {
        if self.kind(object) != Kind::Url {
            return Err(Rejection::UnknownObservation);
        }
        let mut bytes = [0u8; 4097];
        if unsafe {
            CFURLGetFileSystemRepresentation(
                object as Raw,
                0,
                bytes.as_mut_ptr(),
                bytes.len() as isize,
            )
        } == 0
        {
            return Err(Rejection::Limit);
        }
        let end = bytes.iter().position(|b| *b == 0).ok_or(Rejection::Limit)?;
        std::str::from_utf8(&bytes[..end])
            .map(str::to_owned)
            .map_err(|_| Rejection::UnknownObservation)
    }
    fn number(&self, object: usize) -> Result<u32, Rejection> {
        if self.kind(object) != Kind::Number || unsafe { CFNumberIsFloatType(object as Raw) } != 0 {
            return Err(Rejection::UnknownObservation);
        }
        let mut value = 0i64;
        if unsafe { CFNumberGetValue(object as Raw, 4, (&mut value as *mut i64).cast()) } == 0 {
            return Err(Rejection::UnknownObservation);
        }
        u32::try_from(value).map_err(|_| Rejection::UnknownObservation)
    }
    fn boolean(&self, object: usize) -> bool {
        self.kind(object) == Kind::Boolean && unsafe { CFBooleanGetValue(object as Raw) } != 0
    }
    fn entries(&self, object: usize) -> Result<Vec<(usize, usize)>, Rejection> {
        if self.kind(object) != Kind::Dictionary {
            return Err(Rejection::UnknownObservation);
        }
        let count = unsafe { CFDictionaryGetCount(object as Raw) };
        if !(0..=32).contains(&count) {
            return Err(Rejection::Limit);
        }
        let mut keys = [ptr::null(); 32];
        let mut values = [ptr::null(); 32];
        unsafe {
            CFDictionaryGetKeysAndValues(object as Raw, keys.as_mut_ptr(), values.as_mut_ptr())
        };
        Ok((0..count as usize)
            .map(|i| (keys[i] as usize, values[i] as usize))
            .collect())
    }
}
