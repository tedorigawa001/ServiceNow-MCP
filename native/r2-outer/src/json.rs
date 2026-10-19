use crate::{Failure, MAX_BYTES};
use serde::de::{DeserializeOwned, DeserializeSeed, Error, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;
struct Seed(usize);
impl<'de> DeserializeSeed<'de> for Seed {
    type Value = Value;
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        if self.0 > 16 {
            return Err(D::Error::custom("depth"));
        }
        d.deserialize_any(Tree(self.0))
    }
}
struct Tree(usize);
impl<'de> Visitor<'de> for Tree {
    type Value = Value;
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("bounded JSON")
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
            .ok_or_else(|| E::custom("number"))
    }
    fn visit_str<E: Error>(self, v: &str) -> Result<Value, E> {
        Ok(Value::String(v.into()))
    }
    fn visit_string<E: Error>(self, v: String) -> Result<Value, E> {
        Ok(Value::String(v))
    }
    fn visit_unit<E: Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        let mut v = Vec::new();
        while let Some(x) = a.next_element_seed(Seed(self.0 + 1))? {
            v.push(x);
        }
        Ok(Value::Array(v))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        let mut v = Map::new();
        while let Some(k) = a.next_key::<String>()? {
            if v.contains_key(&k) {
                return Err(A::Error::custom("duplicate"));
            }
            v.insert(k, a.next_value_seed(Seed(self.0 + 1))?);
        }
        Ok(Value::Object(v))
    }
}
pub(crate) fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, Failure> {
    if bytes.len() > MAX_BYTES {
        return Err(Failure::InvalidRecord);
    }
    let text = std::str::from_utf8(bytes).map_err(|_| Failure::InvalidRecord)?;
    let mut d = serde_json::Deserializer::from_str(text);
    let v = Seed(0)
        .deserialize(&mut d)
        .map_err(|_| Failure::InvalidRecord)?;
    d.end().map_err(|_| Failure::InvalidRecord)?;
    serde_json::from_value(v).map_err(|_| Failure::InvalidRecord)
}
