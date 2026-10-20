//! Strict cooperative JSON core. No I/O, installed-record authority or allocator/RSS proof.
use serde::de::{DeserializeOwned, DeserializeSeed, Error, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;

pub(crate) trait Budget {
    type Failure: Copy;
    fn checkpoint(&mut self) -> Result<(), Self::Failure>;
    fn work(&mut self, units: u64) -> Result<(), Self::Failure>;
    fn collect_json_shape(&self) -> bool {
        false
    }
    fn accepted_json_shape(&mut self, _shape: JsonShape) -> Result<(), Self::Failure> {
        Ok(())
    }
}
// Emitted only after strict decoding AND typed conversion succeed. Not input authority.
#[derive(Default, Debug, PartialEq, Eq)]
pub(crate) struct JsonShape {
    pub(crate) bytes: u64,
    pub(crate) values: u64,
    pub(crate) keys: u64,
    pub(crate) text: u64,
    pub(crate) arrays: u64,
    pub(crate) text_events: u64,
}
enum ShapeEvent {
    Value,
    Key,
    Text(u64),
    Array,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Limit {
    Configuration,
    Bytes,
    Depth,
    Container,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Rejection<E> {
    InvalidRecord,
    Limit(Limit),
    Budget(E),
}
#[derive(Clone, Copy)]
pub(crate) struct Limits {
    pub max_bytes: usize,
    pub max_depth: usize,
    pub max_items: usize,
}
struct State<'a, B: Budget> {
    budget: &'a mut B,
    limits: Limits,
    first: Option<Rejection<B::Failure>>,
    shape: Option<JsonShape>,
}
impl<B: Budget> State<'_, B> {
    fn save(&mut self, reason: Rejection<B::Failure>) -> Rejection<B::Failure> {
        *self.first.get_or_insert(reason)
    }
    fn guard(&mut self) -> Result<(), Rejection<B::Failure>> {
        if let Some(e) = self.first {
            return Err(e);
        }
        self.budget
            .checkpoint()
            .map_err(|e| self.save(Rejection::Budget(e)))
    }
    fn work(&mut self, units: u64) -> Result<(), Rejection<B::Failure>> {
        self.guard()?;
        self.budget
            .work(units)
            .map_err(|e| self.save(Rejection::Budget(e)))?;
        self.guard()
    }
    fn text(&mut self, bytes: usize) -> Result<(), Rejection<B::Failure>> {
        // Count string/key work without copying it here. serde's internal unescape is not
        // interruptible by these visitor callbacks; max input bytes still bounds its input.
        let units = bytes.div_ceil(65536).max(1) as u64;
        self.work(units)?;
        self.collect(ShapeEvent::Text(units))
    }
    fn collect(&mut self, event: ShapeEvent) -> Result<(), Rejection<B::Failure>> {
        if self.shape.is_none() {
            return Ok(());
        }
        self.work(1)?;
        let s = self.shape.as_mut().expect("shape enabled");
        let (value, n) = match event {
            ShapeEvent::Value => (&mut s.values, 1),
            ShapeEvent::Key => (&mut s.keys, 1),
            ShapeEvent::Array => (&mut s.arrays, 1),
            ShapeEvent::Text(n) => {
                s.text_events = s
                    .text_events
                    .checked_add(1)
                    .ok_or(Rejection::Limit(Limit::Container))?;
                (&mut s.text, n)
            }
        };
        *value = value
            .checked_add(n)
            .ok_or(Rejection::Limit(Limit::Container))?;
        self.guard()
    }
    fn error<E: Error>(&mut self, reason: Rejection<B::Failure>) -> E {
        self.save(reason);
        E::custom("strict JSON rejected")
    }
    fn checked<E: Error>(&mut self, result: Result<(), Rejection<B::Failure>>) -> Result<(), E> {
        result.map_err(|reason| self.error(reason))
    }
}
struct Seed<'s, 'a, B: Budget> {
    state: &'s mut State<'a, B>,
    depth: usize,
}
impl<'de, B: Budget> DeserializeSeed<'de> for Seed<'_, '_, B> {
    type Value = Value;
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        let result = self.state.work(1);
        self.state.checked(result)?;
        let result = self.state.collect(ShapeEvent::Value);
        self.state.checked(result)?;
        if self.depth > self.state.limits.max_depth {
            return Err(self.state.error(Rejection::Limit(Limit::Depth)));
        }
        let result = d.deserialize_any(Tree {
            state: &mut *self.state,
            depth: self.depth,
        });
        // Reject late syntax errors or values after the original deadline/cancel.
        let checked = self.state.guard();
        self.state.checked(checked)?;
        result
    }
}
struct Tree<'s, 'a, B: Budget> {
    state: &'s mut State<'a, B>,
    depth: usize,
}
impl<'de, B: Budget> Visitor<'de> for Tree<'_, '_, B> {
    type Value = Value;
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("strict JSON")
    }
    fn visit_bool<E: Error>(self, v: bool) -> Result<Value, E> {
        Ok(Value::Bool(v))
    }
    fn visit_i64<E: Error>(self, v: i64) -> Result<Value, E> {
        Ok(Value::Number(v.into()))
    }
    fn visit_u64<E: Error>(self, v: u64) -> Result<Value, E> {
        Ok(Value::Number(v.into()))
    }
    fn visit_f64<E: Error>(self, v: f64) -> Result<Value, E> {
        Number::from_f64(v)
            .map(Value::Number)
            .ok_or_else(|| self.state.error(Rejection::InvalidRecord))
    }
    fn visit_unit<E: Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_str<E: Error>(self, v: &str) -> Result<Value, E> {
        let result = self.state.text(v.len());
        self.state.checked(result)?;
        Ok(Value::String(v.to_owned()))
    }
    fn visit_string<E: Error>(self, v: String) -> Result<Value, E> {
        let result = self.state.text(v.len());
        self.state.checked(result)?;
        Ok(Value::String(v))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        let mut values = Vec::new();
        loop {
            // At capacity, next_element_seed does not call the seed at ']'. If there IS
            // another element, reject before decoding/allocating that element's subtree.
            let next = if values.len() >= self.state.limits.max_items {
                a.next_element_seed(RejectSeed { state: self.state })?
            } else {
                a.next_element_seed(Seed {
                    state: self.state,
                    depth: self.depth + 1,
                })?
            };
            let Some(value) = next else {
                break;
            };
            let result = self.state.work(1);
            self.state.checked(result)?;
            let result = self.state.collect(ShapeEvent::Array);
            self.state.checked(result)?;
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        let mut values = Map::new();
        loop {
            let full = values.len() >= self.state.limits.max_items;
            let key = a.next_key_seed(KeySeed {
                state: self.state,
                full,
            })?;
            let Some(key) = key else {
                break;
            };
            if values.contains_key(&key) {
                return Err(self.state.error(Rejection::InvalidRecord));
            }
            let value = a.next_value_seed(Seed {
                state: self.state,
                depth: self.depth + 1,
            })?;
            let result = self.state.work(1);
            self.state.checked(result)?;
            values.insert(key, value);
        }
        Ok(Value::Object(values))
    }
}
struct RejectSeed<'s, 'a, B: Budget> {
    state: &'s mut State<'a, B>,
}
impl<'de, B: Budget> DeserializeSeed<'de> for RejectSeed<'_, '_, B> {
    type Value = Value;
    fn deserialize<D: serde::Deserializer<'de>>(self, _: D) -> Result<Value, D::Error> {
        let result = self.state.guard();
        self.state.checked(result)?;
        Err(self.state.error(Rejection::Limit(Limit::Container)))
    }
}
struct KeySeed<'s, 'a, B: Budget> {
    state: &'s mut State<'a, B>,
    full: bool,
}
impl<'de, B: Budget> DeserializeSeed<'de> for KeySeed<'_, '_, B> {
    type Value = String;
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<String, D::Error> {
        let result = self.state.work(1);
        self.state.checked(result)?;
        if self.full {
            return Err(self.state.error(Rejection::Limit(Limit::Container)));
        }
        let key = <String as serde::Deserialize>::deserialize(d)?;
        let result = self.state.collect(ShapeEvent::Key);
        self.state.checked(result)?;
        let result = self.state.text(key.len());
        self.state.checked(result)?;
        Ok(key)
    }
}
pub(crate) fn decode<T: DeserializeOwned, B: Budget>(
    bytes: &[u8],
    limits: Limits,
    budget: &mut B,
) -> Result<T, Rejection<B::Failure>> {
    let collect = budget.collect_json_shape();
    let mut state = State {
        budget,
        limits,
        first: None,
        shape: collect.then(|| JsonShape {
            bytes: bytes.len() as u64,
            ..JsonShape::default()
        }),
    };
    state.guard()?;
    if limits.max_bytes > 16 * 1024 * 1024 || limits.max_depth > 16 || limits.max_items > 100_000 {
        return Err(state.save(Rejection::Limit(Limit::Configuration)));
    }
    if bytes.len() > limits.max_bytes {
        return Err(state.save(Rejection::Limit(Limit::Bytes)));
    }
    if collect {
        state.work(1)?; // bounded profile initialization
    }
    // Account input inspection work before serde. This is not payload I/O charging.
    for _ in bytes.chunks(65536) {
        state.work(1)?;
    }
    let mut d = serde_json::Deserializer::from_slice(bytes);
    let parsed = Seed {
        state: &mut state,
        depth: 0,
    }
    .deserialize(&mut d);
    state.guard()?;
    let value = parsed.map_err(|_| state.save(Rejection::InvalidRecord))?;
    let ended = d.end();
    state.guard()?;
    ended.map_err(|_| state.save(Rejection::InvalidRecord))?;
    state.work(1)?;
    // The conversion is guarded on BOTH sides; serde's conversion itself is not a
    // cooperative cancellation boundary, nor does this core enforce allocator/RSS limits.
    let typed = serde_json::from_value(value);
    state.guard()?;
    let typed = typed.map_err(|_| state.save(Rejection::InvalidRecord))?;
    if collect {
        state.work(1)?; // completed profile publication
        let shape = state.shape.take().expect("shape enabled");
        state
            .budget
            .accepted_json_shape(shape)
            .map_err(Rejection::Budget)?;
        state.guard()?;
    }
    Ok(typed)
}

#[cfg(test)]
mod tests;
