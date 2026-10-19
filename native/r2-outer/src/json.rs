use crate::{Failure, MAX_BYTES};
use serde::de::{DeserializeOwned, DeserializeSeed, Error, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;
use std::time::{Duration, Instant};
struct Seed(usize, usize, Option<Instant>, usize);
impl<'de> DeserializeSeed<'de> for Seed {
    type Value = Value;
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        if self.0 > self.3 {
            return Err(D::Error::custom("depth"));
        }
        if self.2.is_some_and(|start| {
            Instant::now()
                .checked_duration_since(start)
                .is_none_or(|d| d >= Duration::from_secs(10))
        }) {
            return Err(D::Error::custom("deadline"));
        }
        d.deserialize_any(Tree(self.0, self.1, self.2, self.3))
    }
}
struct Tree(usize, usize, Option<Instant>, usize);
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
        while let Some(x) = a.next_element_seed(Seed(self.0 + 1, self.1, self.2, self.3))? {
            if v.len() >= self.1 {
                return Err(A::Error::custom("items"));
            }
            v.push(x);
        }
        Ok(Value::Array(v))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        let mut v = Map::new();
        while let Some(k) = a.next_key::<String>()? {
            if v.len() >= self.1 {
                return Err(A::Error::custom("items"));
            }
            if v.contains_key(&k) {
                return Err(A::Error::custom("duplicate"));
            }
            v.insert(
                k,
                a.next_value_seed(Seed(self.0 + 1, self.1, self.2, self.3))?,
            );
        }
        Ok(Value::Object(v))
    }
}
pub(crate) fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, Failure> {
    decode_inner(bytes, MAX_BYTES, MAX_BYTES, None, 16)
}
pub(crate) fn decode_bounded<T: DeserializeOwned>(
    bytes: &[u8],
    max_bytes: usize,
    max_items: usize,
    started: Instant,
) -> Result<T, Failure> {
    decode_inner(bytes, max_bytes, max_items, Some(started), 16)
}
pub(crate) fn decode_policy<T: DeserializeOwned>(
    bytes: &[u8],
    started: Instant,
) -> Result<T, Failure> {
    decode_inner(bytes, 65536, 32, Some(started), 8)
}
fn decode_inner<T: DeserializeOwned>(
    bytes: &[u8],
    max_bytes: usize,
    max_items: usize,
    started: Option<Instant>,
    max_depth: usize,
) -> Result<T, Failure> {
    if bytes.len() > max_bytes {
        return Err(Failure::InvalidRecord);
    }
    let text = std::str::from_utf8(bytes).map_err(|_| Failure::InvalidRecord)?;
    let mut d = serde_json::Deserializer::from_str(text);
    let v = Seed(0, max_items, started, max_depth)
        .deserialize(&mut d)
        .map_err(|_| Failure::InvalidRecord)?;
    d.end().map_err(|_| Failure::InvalidRecord)?;
    serde_json::from_value(v).map_err(|_| Failure::InvalidRecord)
}
#[cfg(test)]
mod bounded_tests {
    use super::*;
    #[test]
    fn visitor_itself_checks_the_shared_deadline() {
        assert!(
            decode_bounded::<Value>(b"{}", 16, 4, Instant::now() - Duration::from_secs(10))
                .is_err()
        );
        assert!(decode_bounded::<Value>(b"{}", 16, 4, Instant::now()).is_ok());
    }
    #[test]
    fn container_limit_is_enforced_while_building_the_tree() {
        assert!(decode_bounded::<Value>(b"[0,1]", 16, 2, Instant::now()).is_ok());
        assert!(decode_bounded::<Value>(b"[0,1,2]", 16, 2, Instant::now()).is_err());
        assert!(decode_bounded::<Value>(br#"{"a":0,"b":1,"c":2}"#, 64, 2, Instant::now()).is_err());
    }
    #[test]
    fn policy_depth_eight_is_separate_from_legacy_depth_sixteen() {
        let eight = format!("{}0{}", "[".repeat(8), "]".repeat(8));
        let nine = format!("{}0{}", "[".repeat(9), "]".repeat(9));
        assert!(decode_policy::<Value>(eight.as_bytes(), Instant::now()).is_ok());
        assert!(decode_policy::<Value>(nine.as_bytes(), Instant::now()).is_err());
        assert!(decode::<Value>(nine.as_bytes()).is_ok());
    }
}
