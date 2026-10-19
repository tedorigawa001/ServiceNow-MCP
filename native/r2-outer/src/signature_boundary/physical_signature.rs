//! Pure borrowed-range inventory. No file reads, Security API, signature validity or permits.
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    ops::Range,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
const MAX_FILE: u64 = 512 * 1024 * 1024;
const MAX_COMMANDS: usize = 1024 * 1024;
const MAX_SIGNATURE: usize = 5 * 1024 * 1024;
const MAX_CD_HEADER: usize = 65536;
const MAX_CODE_SLOTS: usize = 131072;
const MAX_ENTITLEMENTS: usize = 65536;
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Rejection {
    InvalidMachO,
    InvalidRange,
    InvalidBlob,
    InvalidPadding,
    DuplicateSlot,
    OverlappingBlob,
    MissingSignature,
    UnsupportedCommand,
    UnsupportedSlot,
    UnsupportedCodeDirectory,
    SpecialHashMismatch,
    UnsupportedDer,
    AbsenceUnproven,
    UnverifiedXml,
    Limit,
    Deadline,
    Cancelled,
}
// Caller supplies ranges, NOT proof that they were obtained from the same held FD.
pub(super) struct Input<'a> {
    pub file_bytes: u64,
    pub header_commands: &'a [u8],
    pub signature: &'a [u8],
}
pub(super) struct Inventory<'a> {
    slot_count: usize,
    code: CodeDirectory<'a>,
    xml: Option<&'a [u8]>,
    der: Option<&'a [u8]>,
}
struct CodeDirectory<'a> {
    version: u32,
    flags: u32,
    identifier: &'a str,
    team: &'a str,
    exec_flags: u64,
    runtime: Option<u32>,
    full_digest: [u8; 32],
}
impl std::fmt::Debug for Inventory<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PhysicalInventory(structure_only_not_execution_authority)")
    }
}
impl Inventory<'_> {
    // Deliberately never succeeds: XML/DER/absence and API binding are not integrated.
    pub(super) fn entitlement_gate(&self) -> Result<(), Rejection> {
        Err(if self.der.is_some() {
            Rejection::UnsupportedDer
        } else if self.xml.is_none() {
            Rejection::AbsenceUnproven
        } else {
            Rejection::UnverifiedXml
        })
    }
}
struct Budget<'a> {
    started: Instant,
    cancelled: &'a AtomicBool,
    now: &'a dyn Fn() -> Instant,
}
impl Budget<'_> {
    fn check(&self) -> Result<(), Rejection> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(Rejection::Cancelled);
        }
        if (self.now)()
            .checked_duration_since(self.started)
            .is_none_or(|d| d >= Duration::from_secs(10))
        {
            return Err(Rejection::Deadline);
        }
        Ok(())
    }
}
fn add(a: usize, b: usize) -> Result<usize, Rejection> {
    a.checked_add(b).ok_or(Rejection::InvalidRange)
}
fn mul(a: usize, b: usize) -> Result<usize, Rejection> {
    a.checked_mul(b).ok_or(Rejection::InvalidRange)
}
fn slice(bytes: &[u8], start: usize, length: usize) -> Result<&[u8], Rejection> {
    bytes
        .get(start..add(start, length)?)
        .ok_or(Rejection::InvalidRange)
}
fn be(bytes: &[u8], at: usize) -> Result<u32, Rejection> {
    Ok(u32::from_be_bytes(
        slice(bytes, at, 4)?
            .try_into()
            .map_err(|_| Rejection::InvalidRange)?,
    ))
}
fn le(bytes: &[u8], at: usize) -> Result<u32, Rejection> {
    Ok(u32::from_le_bytes(
        slice(bytes, at, 4)?
            .try_into()
            .map_err(|_| Rejection::InvalidRange)?,
    ))
}
fn be64(bytes: &[u8], at: usize) -> Result<u64, Rejection> {
    Ok(u64::from_be_bytes(
        slice(bytes, at, 8)?
            .try_into()
            .map_err(|_| Rejection::InvalidRange)?,
    ))
}
fn zeros(bytes: &[u8], budget: &Budget<'_>) -> Result<(), Rejection> {
    for part in bytes.chunks(65536) {
        budget.check()?;
        if part.iter().any(|v| *v != 0) {
            return Err(Rejection::InvalidPadding);
        }
    }
    budget.check()
}
fn hash(bytes: &[u8], budget: &Budget<'_>) -> Result<[u8; 32], Rejection> {
    let mut h = Sha256::new();
    for part in bytes.chunks(65536) {
        budget.check()?;
        h.update(part);
    }
    budget.check()?;
    Ok(h.finalize().into())
}
pub(super) fn parse<'a>(
    input: Input<'a>,
    started: Instant,
    cancelled: &AtomicBool,
) -> Result<Inventory<'a>, Rejection> {
    parse_inner(input, started, cancelled, &Instant::now)
}
fn parse_inner<'a>(
    input: Input<'a>,
    started: Instant,
    cancelled: &AtomicBool,
    now: &dyn Fn() -> Instant,
) -> Result<Inventory<'a>, Rejection> {
    let budget = Budget {
        started,
        cancelled,
        now,
    };
    budget.check()?;
    let sig_offset = macho(&input, &budget)?;
    let signature = input.signature;
    if be(signature, 0)? != 0xfade0cc0 {
        return Err(Rejection::InvalidBlob);
    }
    let length = be(signature, 4)? as usize;
    let count = be(signature, 8)? as usize;
    if count > 64 {
        return Err(Rejection::Limit);
    }
    let table_end = add(12, mul(8, count)?)?;
    if table_end > length || length > signature.len() {
        return Err(Rejection::InvalidRange);
    }
    let mut seen = BTreeSet::new();
    let mut slots = Vec::with_capacity(count);
    for i in 0..count {
        budget.check()?;
        let at = add(12, mul(8, i)?)?;
        let kind = be(signature, at)?;
        let start = be(signature, add(at, 4)?)? as usize;
        if !seen.insert(kind) {
            return Err(Rejection::DuplicateSlot);
        }
        if !matches!(kind, 0 | 2 | 5 | 7 | 0x10000) {
            return Err(Rejection::UnsupportedSlot);
        }
        if start < table_end {
            return Err(Rejection::InvalidRange);
        }
        let size = be(slice(signature, 0, length)?, add(start, 4)?)? as usize;
        if size < 8 {
            return Err(Rejection::InvalidBlob);
        }
        let end = add(start, size)?;
        if end > length {
            return Err(Rejection::InvalidRange);
        }
        slots.push(Slot {
            kind,
            range: start..end,
        });
    }
    budget.check()?;
    slots.sort_unstable_by_key(|s| s.range.start);
    budget.check()?;
    let mut cursor = table_end;
    for s in &slots {
        budget.check()?;
        if s.range.start < cursor {
            return Err(Rejection::OverlappingBlob);
        }
        zeros(slice(signature, cursor, s.range.start - cursor)?, &budget)?;
        cursor = s.range.end;
    }
    zeros(slice(signature, cursor, signature.len() - cursor)?, &budget)?;
    for s in &slots {
        budget.check()?;
        let expected = match s.kind {
            0 => 0xfade0c02,
            2 => 0xfade0c01,
            5 => 0xfade7171,
            7 => 0xfade7172,
            0x10000 => 0xfade0b01,
            _ => return Err(Rejection::UnsupportedSlot),
        };
        if be(signature, s.range.start)? != expected {
            return Err(Rejection::InvalidBlob);
        }
        if s.kind == 0x10000 && s.range.len() <= 8 {
            return Err(Rejection::InvalidBlob);
        }
    }
    let get = |kind| {
        slots
            .iter()
            .find(|s| s.kind == kind)
            .map(|s| &signature[s.range.clone()])
    };
    let cd = get(0).ok_or(Rejection::MissingSignature)?;
    get(0x10000).ok_or(Rejection::MissingSignature)?;
    let xml = get(5);
    let der = get(7);
    if add(xml.map_or(0, |b| b.len()), der.map_or(0, |b| b.len()))? > MAX_ENTITLEMENTS {
        return Err(Rejection::Limit);
    }
    let code = code_directory(cd, sig_offset, get(2), xml, der, &budget)?;
    budget.check()?;
    Ok(Inventory {
        slot_count: count,
        code,
        xml,
        der,
    })
}
struct Slot {
    kind: u32,
    range: Range<usize>,
}
fn macho(input: &Input<'_>, budget: &Budget<'_>) -> Result<usize, Rejection> {
    if input.file_bytes > MAX_FILE
        || input.header_commands.len() > 32 + MAX_COMMANDS
        || input.signature.len() > MAX_SIGNATURE
    {
        return Err(Rejection::Limit);
    }
    let h = input.header_commands;
    if h.len() < 32
        || le(h, 0)? != 0xfeedfacf
        || le(h, 4)? != 0x0100000c
        || le(h, 8)? != 0
        || le(h, 12)? != 2
        || le(h, 28)? != 0
    {
        return Err(Rejection::InvalidMachO);
    }
    let count = le(h, 16)? as usize;
    let size = le(h, 20)? as usize;
    if count > 4096 || size > MAX_COMMANDS {
        return Err(Rejection::Limit);
    }
    if add(32, size)? != h.len() || h.len() as u64 > input.file_bytes || mul(count, 8)? > size {
        return Err(Rejection::InvalidRange);
    }
    let mut cursor = 32;
    let mut signature = None;
    for _ in 0..count {
        budget.check()?;
        let kind = le(h, cursor)?;
        let size = le(h, add(cursor, 4)?)? as usize;
        if size < 8 || !size.is_multiple_of(8) {
            return Err(Rejection::InvalidRange);
        }
        let end = add(cursor, size)?;
        if end > h.len() {
            return Err(Rejection::InvalidRange);
        }
        if kind == 0x1d {
            if signature.is_some() {
                return Err(Rejection::DuplicateSlot);
            }
            if size != 16 {
                return Err(Rejection::InvalidRange);
            }
            let offset = le(h, add(cursor, 8)?)? as usize;
            let length = le(h, add(cursor, 12)?)? as usize;
            if length > MAX_SIGNATURE {
                return Err(Rejection::Limit);
            }
            if offset < h.len()
                || length < 12
                || length != input.signature.len()
                || add(offset, length)? as u64 != input.file_bytes
            {
                return Err(Rejection::InvalidRange);
            }
            signature = Some(offset);
        } else if kind & 0x80000000 != 0
            && !matches!(
                kind,
                0x80000018
                    | 0x8000001c
                    | 0x8000001f
                    | 0x80000022
                    | 0x80000023
                    | 0x80000028
                    | 0x80000033
                    | 0x80000034
            )
        {
            return Err(Rejection::UnsupportedCommand);
        }
        cursor = end;
    }
    if cursor != h.len() {
        return Err(Rejection::InvalidRange);
    }
    budget.check()?;
    signature.ok_or(Rejection::MissingSignature)
}
fn cd_string(
    cd: &[u8],
    offset: usize,
    minimum: usize,
    end: usize,
) -> Result<(&str, Range<usize>), Rejection> {
    if offset < minimum || offset >= end {
        return Err(Rejection::UnsupportedCodeDirectory);
    }
    let available = slice(cd, offset, (end - offset).min(129))?;
    let size = available
        .iter()
        .position(|b| *b == 0)
        .ok_or(Rejection::UnsupportedCodeDirectory)?;
    if size == 0 || size > 128 {
        return Err(Rejection::UnsupportedCodeDirectory);
    }
    let value =
        std::str::from_utf8(&available[..size]).map_err(|_| Rejection::UnsupportedCodeDirectory)?;
    if value.chars().any(char::is_control) {
        return Err(Rejection::UnsupportedCodeDirectory);
    }
    Ok((value, offset..add(offset, size + 1)?))
}
fn code_directory<'a>(
    cd: &'a [u8],
    sig_offset: usize,
    requirements: Option<&[u8]>,
    xml: Option<&[u8]>,
    der: Option<&[u8]>,
    budget: &Budget<'_>,
) -> Result<CodeDirectory<'a>, Rejection> {
    budget.check()?;
    if cd.len() > 4 * 1024 * 1024 + MAX_CD_HEADER {
        return Err(Rejection::Limit);
    }
    let version = be(cd, 8)?;
    let minimum = match version {
        0x20400 => 88,
        0x20500 => 96,
        _ => return Err(Rejection::UnsupportedCodeDirectory),
    };
    if cd.len() < minimum || be(cd, 4)? as usize != cd.len() {
        return Err(Rejection::InvalidRange);
    }
    if cd[36] != 32
        || cd[37] != 2
        || cd[38] != 0
        || be(cd, 40)? != 0
        || be(cd, 44)? != 0
        || be(cd, 52)? != 0
        || be64(cd, 56)? != 0
        || (version == 0x20500 && be(cd, 92)? != 0)
    {
        return Err(Rejection::UnsupportedCodeDirectory);
    }
    let offset = be(cd, 16)? as usize;
    let specials = be(cd, 24)? as usize;
    let codes = be(cd, 28)? as usize;
    if offset > MAX_CD_HEADER || specials > 7 || codes > MAX_CODE_SLOTS {
        return Err(Rejection::Limit);
    }
    let special_start = offset
        .checked_sub(mul(32, specials)?)
        .ok_or(Rejection::InvalidRange)?;
    if special_start < minimum || add(offset, mul(32, codes)?)? != cd.len() {
        return Err(Rejection::InvalidRange);
    }
    let (identifier, id_range) = cd_string(cd, be(cd, 20)? as usize, minimum, special_start)?;
    let (team, team_range) = cd_string(cd, be(cd, 48)? as usize, minimum, special_start)?;
    if id_range.start < team_range.end && team_range.start < id_range.end {
        return Err(Rejection::InvalidRange);
    }
    let limit = be(cd, 32)? as usize;
    let page = match cd[39] {
        12 => 4096,
        14 => 16384,
        _ => return Err(Rejection::UnsupportedCodeDirectory),
    };
    if limit == 0 || limit != sig_offset || (limit - 1) / page + 1 != codes {
        return Err(Rejection::InvalidRange);
    }
    if be64(cd, 64)?
        .checked_add(be64(cd, 72)?)
        .is_none_or(|end| end > limit as u64)
    {
        return Err(Rejection::InvalidRange);
    }
    for k in 1..=7 {
        budget.check()?;
        let stored = if k <= specials {
            Some(slice(cd, offset - mul(k, 32)?, 32)?)
        } else {
            None
        };
        let child = match k {
            2 => requirements,
            5 => xml,
            7 => der,
            _ => None,
        };
        match (stored, child) {
            (Some(digest), Some(bytes)) if digest == hash(bytes, budget)? => (),
            (Some(digest), None) if digest.iter().all(|b| *b == 0) => (),
            (None, None) => (),
            _ => {
                return Err(if matches!(k, 2 | 5 | 7) {
                    Rejection::SpecialHashMismatch
                } else {
                    Rejection::UnsupportedSlot
                });
            }
        }
    }
    let full_digest = hash(cd, budget)?;
    budget.check()?;
    Ok(CodeDirectory {
        version,
        flags: be(cd, 12)?,
        identifier,
        team,
        exec_flags: be64(cd, 80)?,
        runtime: if version == 0x20500 {
            Some(be(cd, 88)?)
        } else {
            None
        },
        full_digest,
    })
}
#[cfg(test)]
mod tests;
