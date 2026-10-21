//! Fixed internal round only; no topology/normal-strict entry or policy producer.
use super::*;
use round_declaration::scan_inputs::profile::{self, calculator};

impl<S: RecordSource, C> RoundSlot<'_, '_, '_, S, C> {
    #[allow(clippy::result_large_err)] // Preserve bounded cleanup diagnostics without allocation.
    pub(in super::super) fn run_fixed(
        mut self,
        quotas: Option<Quotas>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), StrictInspectionFailure>
    where
        C: ScanOps,
    {
        self.precheck_records(b)?;
        let (receipt, target, context, round) = (
            self.owner.receipt,
            self.owner.target,
            self.owner.context,
            self.round,
        );
        // Slot acquisition was irreversible; never manufacture another source/lease.
        let Some(scan) = self.scan.take() else {
            return Err(self.stop_inspection(Failure::Binding, b));
        };
        let mut failure = None;
        let result =
            round_declaration::with_round(receipt, target, context, round, b, |scope, b| {
                macro_rules! stage {
                    ($e:expr) => {
                        match $e {
                            Ok(v) => v,
                            Err(e) => {
                                let reason = e.reason();
                                failure = Some(e);
                                return Err(reason);
                            }
                        }
                    };
                }
                let d = scope.decode(b)?;
                let mut phases =
                    d.prepare_scan(scope, round_declaration::phases::PHASE_MODEL_ID, b)?;
                let inputs = phases.bind_inputs(scope, b)?;
                let lease = self.owner.ledger.begin(scope, b)?;
                let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
                let e = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
                let pending = stage!(collector::collect_owned_round(
                    lease,
                    e,
                    &inputs,
                    scope,
                    (scan, quotas),
                    b
                ));
                drop(inputs);
                let after = stage!(pending.after_scan(&mut phases, b));
                let records = stage!(after.revalidate_records(self.owner.source, &phases, b));
                let index = stage!(records.verify_final_index(&mut phases, b));
                let clock = stage!(index.verify_final_clock(self.owner.source, &phases, b));
                stage!(clock.acknowledge(&phases, b));
                Ok(())
            });
        if let Err(reason) = result {
            return Err(match failure {
                Some(e) => self.stop_with_completion(e, b),
                None => self.stop_inspection(reason, b),
            });
        }
        // An ack alone is not sufficient: with_round's terminal checkpoint returned.
        let result = (|| {
            work(b)?; // O.kernel_complete 1: real same-ledger ack and owner binding
            self.owner.binding(b)?;
            self.owner.ledger.require_acknowledged(round, b)?;
            if self.owner.progress != Progress::Taken(round) || failure.is_some() {
                return Err(Failure::Binding);
            }
            work(b)?; // O.kernel_complete 2: late-stop guard before owner publication
            b.checkpoint()
        })();
        if let Err(reason) = result {
            return Err(self.stop_inspection(reason, b));
        }
        self.owner.progress = match round {
            Round::Initial => Progress::Expected(Round::BeforeM4),
            Round::BeforeM4 => Progress::Expected(Round::AfterM4),
            Round::AfterM4 => Progress::Finished,
        };
        self.completed = true;
        Ok(())
    }
}
