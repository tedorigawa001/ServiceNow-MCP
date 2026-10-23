//! Fixed cap copying for an INERT plan only. No ResourcePolicy/Input/Quotas constructor.
use super::*;
const MAP_ID: &str = "bp5-r2-inert-cap-map-0.1";
struct Block {
    attempts: [u64; 5],
    total: u64,
    live: u64,
    names: u64,
}
struct Local {
    attempts: [u64; 5],
    live: u64,
    names: u64,
}
pub(in super::super::super::super::super::super::super::super) struct DraftCapMap<'a> {
    source: &'a ScanResourceCaps,
    model: &'static str,
    session: Block,
    rounds: [Block; 3],
    locals: [Local; 3],
}
fn copy(value: u64, b: &mut SharedBudget<'_>) -> Result<u64, Failure> {
    work(b)?;
    Ok(value)
}
fn block(v: &[u64], b: &mut SharedBudget<'_>) -> Result<Block, Failure> {
    Ok(Block {
        attempts: [
            copy(v[0], b)?,
            copy(v[1], b)?,
            copy(v[2], b)?,
            copy(v[3], b)?,
            copy(v[4], b)?,
        ],
        total: copy(v[5], b)?,
        live: copy(v[6], b)?,
        names: copy(v[7], b)?,
    })
}
fn local(block: &Block, b: &mut SharedBudget<'_>) -> Result<Local, Failure> {
    Ok(Local {
        attempts: [
            copy(block.attempts[0], b)?,
            copy(block.attempts[1], b)?,
            copy(block.attempts[2], b)?,
            copy(block.attempts[3], b)?,
            copy(block.attempts[4], b)?,
        ],
        live: copy(block.live, b)?,
        names: copy(block.names, b)?,
    })
}
impl<'a> ScanCapAllocationView<'a> {
    pub(in super::super::super::super::super::super::super::super) fn inert_mapping(
        &self,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<DraftCapMap<'a>, Failure> {
        let result = (|| {
            self.require(scope, b)?; // three original guards
            let v = &self.proof.caps.values;
            let session = block(&v[..8], b)?;
            let rounds = [
                block(&v[8..16], b)?,
                block(&v[16..24], b)?,
                block(&v[24..32], b)?,
            ];
            let locals = [
                local(&rounds[0], b)?,
                local(&rounds[1], b)?,
                local(&rounds[2], b)?,
            ];
            b.checkpoint()?;
            Ok(DraftCapMap {
                source: self.proof.caps,
                model: MAP_ID,
                session,
                rounds,
                locals,
            })
        })();
        result.map_err(|e| self.reject(e, b))
    }
}
fn equal(actual: u64, expected: u64, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    work(b)?;
    if actual != expected {
        return Err(Failure::Binding);
    }
    Ok(())
}
fn check_block(x: &Block, v: &[u64], b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    for (a, e) in x.attempts.iter().zip(&v[..5]) {
        equal(*a, *e, b)?;
    }
    equal(x.total, v[5], b)?;
    equal(x.live, v[6], b)?;
    equal(x.names, v[7], b)
}
impl DraftCapMap<'_> {
    pub(in super::super::super::super::super::super::super::super) fn require(
        &self,
        view: &ScanCapAllocationView<'_>,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            view.require(scope, b)?; // every public recheck also enforces the actual receipt/budget
            work(b)?; // same immutable cap object, never a same-value replacement
            if self.model != MAP_ID {
                return Err(Failure::Unavailable);
            }
            if !std::ptr::eq(self.source, view.proof.caps) {
                return Err(Failure::Binding);
            }
            let v = &self.source.values;
            check_block(&self.session, &v[..8], b)?;
            for i in 0..3 {
                check_block(&self.rounds[i], &v[8 + i * 8..16 + i * 8], b)?;
                for (a, e) in self.locals[i]
                    .attempts
                    .iter()
                    .zip(&v[8 + i * 8..13 + i * 8])
                {
                    equal(*a, *e, b)?;
                }
                equal(self.locals[i].live, v[14 + i * 8], b)?;
                equal(self.locals[i].names, v[15 + i * 8], b)?;
            }
            b.checkpoint()
        })();
        result.map_err(|e| view.reject(e, b))
    }
}
impl std::fmt::Debug for DraftCapMap<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("DraftCapMap(inert_snapshot_not_policy_or_quota)")
    }
}
#[cfg(test)]
pub(in super::super::super::super::super::super::super::super) struct MapSnapshot {
    pub(in super::super::super::super::super::super::super::super) session: [u64; 8],
    pub(in super::super::super::super::super::super::super::super) rounds: [[u64; 8]; 3],
    pub(in super::super::super::super::super::super::super::super) locals: [[u64; 7]; 3],
}
#[cfg(test)]
pub(in super::super::super::super::super::super::super::super) enum MapFault {
    Session(usize),
    Round(usize, usize),
    Local(usize, usize),
    Model,
}
#[cfg(test)]
impl DraftCapMap<'_> {
    pub(in super::super::super::super::super::super::super::super) fn snapshot(
        &self,
    ) -> MapSnapshot {
        let flatten = |v: &Block| {
            [
                v.attempts[0],
                v.attempts[1],
                v.attempts[2],
                v.attempts[3],
                v.attempts[4],
                v.total,
                v.live,
                v.names,
            ]
        };
        MapSnapshot {
            session: flatten(&self.session),
            rounds: std::array::from_fn(|i| flatten(&self.rounds[i])),
            locals: std::array::from_fn(|i| {
                let v = &self.locals[i];
                [
                    v.attempts[0],
                    v.attempts[1],
                    v.attempts[2],
                    v.attempts[3],
                    v.attempts[4],
                    v.live,
                    v.names,
                ]
            }),
        }
    }
    pub(in super::super::super::super::super::super::super::super) fn corrupt(
        &mut self,
        f: MapFault,
    ) {
        let change = |b: &mut Block, k: usize| match k {
            0..=4 => b.attempts[k] ^= 1,
            5 => b.total ^= 1,
            6 => b.live ^= 1,
            _ => b.names ^= 1,
        };
        match f {
            MapFault::Session(k) => change(&mut self.session, k),
            MapFault::Round(i, k) => change(&mut self.rounds[i], k),
            MapFault::Local(i, k) => match k {
                0..=4 => self.locals[i].attempts[k] ^= 1,
                5 => self.locals[i].live ^= 1,
                _ => self.locals[i].names ^= 1,
            },
            MapFault::Model => self.model = "unknown",
        }
    }
}
