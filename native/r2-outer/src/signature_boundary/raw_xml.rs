//! Bounded, deliberately narrow XML grammar, not a general XML/DTD/plist parser.
//! Proves only agreement between caller-supplied API XML and dictionary observations.
use crate::signature_policy::{Observation, ObservedValue, Representation};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
const MAX: usize = 65536;
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Rejection {
    InvalidEnvelope,
    UnsupportedRepresentation,
    InvalidXml,
    DuplicateKey,
    InvalidDictionary,
    RepresentationMismatch,
    AbsenceUnproven,
    Limit,
    Deadline,
    Cancelled,
}
pub(super) struct ApiXmlMatch {
    pub key_count: usize,
}
impl std::fmt::Debug for ApiXmlMatch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ApiXmlMatch(api_only_not_execution_authority)")
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
pub(super) fn compare(
    blob: Option<&[u8]>,
    observed: &Observation,
    started: Instant,
    cancelled: &AtomicBool,
) -> Result<ApiXmlMatch, Rejection> {
    compare_inner(blob, observed, started, cancelled, &Instant::now)
}
fn compare_inner(
    blob: Option<&[u8]>,
    observed: &Observation,
    started: Instant,
    cancelled: &AtomicBool,
    now: &dyn Fn() -> Instant,
) -> Result<ApiXmlMatch, Rejection> {
    let budget = Budget {
        started,
        cancelled,
        now,
    };
    budget.check()?;
    let blob = blob.ok_or(Rejection::AbsenceUnproven)?;
    if blob.len() > MAX || observed.blob_bytes > MAX {
        return Err(Rejection::Limit);
    }
    if blob.len() < 8 {
        return Err(Rejection::InvalidEnvelope);
    }
    let magic = u32::from_be_bytes(
        blob[..4]
            .try_into()
            .map_err(|_| Rejection::InvalidEnvelope)?,
    );
    if magic != 0xfade7171 {
        return Err(Rejection::UnsupportedRepresentation);
    }
    let length = u32::from_be_bytes(
        blob[4..8]
            .try_into()
            .map_err(|_| Rejection::InvalidEnvelope)?,
    ) as usize;
    if length != blob.len() {
        return Err(Rejection::InvalidEnvelope);
    }
    let entries = match &observed.representation {
        Representation::Dictionary(v) => v,
        Representation::AbsenceProven => return Err(Rejection::AbsenceUnproven),
        Representation::UnsupportedOrUnknown => return Err(Rejection::UnsupportedRepresentation),
    };
    if entries.len() > 32 {
        return Err(Rejection::Limit);
    }
    let mut seen = BTreeSet::new();
    for (k, _) in entries {
        budget.check()?;
        if k.len() > 128 {
            return Err(Rejection::Limit);
        }
        if !valid_key(k) {
            return Err(Rejection::InvalidDictionary);
        }
        if !seen.insert(k) {
            return Err(Rejection::DuplicateKey);
        }
    }
    let text = std::str::from_utf8(&blob[8..]).map_err(|_| Rejection::InvalidXml)?;
    let parsed = Parser {
        text,
        pos: 0,
        budget: &budget,
    }
    .parse()?;
    if parsed.len() != entries.len() {
        return Err(Rejection::RepresentationMismatch);
    }
    for (k, v) in entries {
        budget.check()?;
        match v {
            ObservedValue::Boolean(value) if parsed.get(k) == Some(value) => (),
            _ => return Err(Rejection::RepresentationMismatch),
        }
    }
    budget.check()?;
    Ok(ApiXmlMatch {
        key_count: parsed.len(),
    })
}
fn xml_char(c: char) -> bool {
    matches!(c as u32, 0x9 | 0xa | 0xd | 0x20..=0xd7ff | 0xe000..=0xfffd | 0x10000..=0x10ffff)
}
fn valid_key(k: &str) -> bool {
    !k.is_empty() && k.chars().all(|c| xml_char(c) && !c.is_control())
}
struct Parser<'a> {
    text: &'a str,
    pos: usize,
    budget: &'a Budget<'a>,
}
impl Parser<'_> {
    fn rest(&self) -> &str {
        &self.text[self.pos..]
    }
    fn take(&mut self, s: &str) -> Result<(), Rejection> {
        self.budget.check()?;
        if !self.rest().starts_with(s) {
            return Err(Rejection::InvalidXml);
        }
        self.pos += s.len();
        Ok(())
    }
    fn ws(&mut self) -> Result<bool, Rejection> {
        let start = self.pos;
        while self
            .text
            .as_bytes()
            .get(self.pos)
            .is_some_and(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
        {
            if self.pos.is_multiple_of(64) {
                self.budget.check()?;
            }
            self.pos += 1;
        }
        Ok(start != self.pos)
    }
    fn required_ws(&mut self) -> Result<(), Rejection> {
        if self.ws()? {
            Ok(())
        } else {
            Err(Rejection::InvalidXml)
        }
    }
    fn attribute(&mut self, name: &str, value: &str) -> Result<(), Rejection> {
        self.take(name)?;
        self.ws()?;
        self.take("=")?;
        self.ws()?;
        let quote = match self.text.as_bytes().get(self.pos) {
            Some(b'\"') => "\"",
            Some(b'\'') => "'",
            _ => return Err(Rejection::InvalidXml),
        };
        self.take(quote)?;
        self.take(value)?;
        self.take(quote)
    }
    fn tag(&mut self, name: &str) -> Result<bool, Rejection> {
        self.take("<")?;
        self.take(name)?;
        self.ws()?;
        if self.rest().starts_with("/>") {
            self.take("/>")?;
            Ok(true)
        } else {
            self.take(">")?;
            Ok(false)
        }
    }
    fn close(&mut self, name: &str) -> Result<(), Rejection> {
        self.take("</")?;
        self.take(name)?;
        self.ws()?;
        self.take(">")
    }
    fn parse(mut self) -> Result<BTreeMap<String, bool>, Rejection> {
        self.budget.check()?;
        // Declaration must be first; no BOM, preceding whitespace, unknown PI or standalone attribute.
        if self.rest().starts_with("<?xml") {
            self.take("<?xml")?;
            self.required_ws()?;
            self.attribute("version", "1.0")?;
            let space = self.ws()?;
            if self.rest().starts_with("encoding") {
                if !space {
                    return Err(Rejection::InvalidXml);
                }
                self.attribute("encoding", "UTF-8")?;
                self.ws()?;
            }
            self.take("?>")?;
        }
        self.ws()?;
        self.take("<plist")?;
        self.required_ws()?;
        self.attribute("version", "1.0")?;
        self.ws()?;
        self.take(">")?;
        self.ws()?;
        let empty = self.tag("dict")?;
        let mut map = BTreeMap::new();
        if !empty {
            loop {
                self.budget.check()?;
                self.ws()?;
                if self.rest().starts_with("</dict") {
                    self.close("dict")?;
                    break;
                }
                if map.len() >= 32 {
                    return Err(Rejection::Limit);
                }
                if self.tag("key")? {
                    return Err(Rejection::InvalidXml);
                }
                let key = self.key()?;
                self.close("key")?;
                if map.contains_key(&key) {
                    return Err(Rejection::DuplicateKey);
                }
                self.ws()?;
                let (name, value) = if self.rest().starts_with("<true") {
                    ("true", true)
                } else {
                    ("false", false)
                };
                if !self.tag(name)? {
                    self.close(name)?;
                }
                map.insert(key, value);
            }
        }
        self.ws()?;
        self.close("plist")?;
        self.ws()?;
        if !self.rest().is_empty() {
            return Err(Rejection::InvalidXml);
        }
        self.budget.check()?;
        Ok(map)
    }
    fn key(&mut self) -> Result<String, Rejection> {
        let mut result = String::new();
        loop {
            self.budget.check()?;
            let c = self.rest().chars().next().ok_or(Rejection::InvalidXml)?;
            if c == '<' {
                break;
            }
            if self.rest().starts_with("]]>") {
                return Err(Rejection::InvalidXml);
            }
            let c = if c == '&' {
                self.entity()?
            } else {
                self.pos += c.len_utf8();
                c
            };
            if !xml_char(c) || c.is_control() {
                return Err(Rejection::InvalidXml);
            }
            if result.len() + c.len_utf8() > 128 {
                return Err(Rejection::Limit);
            }
            result.push(c);
        }
        if !valid_key(&result) {
            return Err(Rejection::InvalidXml);
        }
        Ok(result)
    }
    fn entity(&mut self) -> Result<char, Rejection> {
        self.take("&")?;
        for (name, value) in [
            ("amp;", '&'),
            ("lt;", '<'),
            ("gt;", '>'),
            ("quot;", '"'),
            ("apos;", '\''),
        ] {
            if self.rest().starts_with(name) {
                self.take(name)?;
                return Ok(value);
            }
        }
        self.take("#")?;
        let radix = if self.rest().starts_with('x') {
            self.take("x")?;
            16
        } else {
            10
        };
        let mut value = 0u32;
        let mut count = 0;
        loop {
            self.budget.check()?;
            let c = self.rest().chars().next().ok_or(Rejection::InvalidXml)?;
            if c == ';' {
                self.take(";")?;
                break;
            }
            if !c.is_ascii() {
                return Err(Rejection::InvalidXml);
            }
            let digit = c.to_digit(radix).ok_or(Rejection::InvalidXml)?;
            value = value
                .checked_mul(radix)
                .and_then(|v| v.checked_add(digit))
                .ok_or(Rejection::InvalidXml)?;
            self.pos += 1;
            count += 1;
        }
        if count == 0 {
            return Err(Rejection::InvalidXml);
        }
        char::from_u32(value)
            .filter(|c| xml_char(*c))
            .ok_or(Rejection::InvalidXml)
    }
}
#[cfg(test)]
mod tests;
