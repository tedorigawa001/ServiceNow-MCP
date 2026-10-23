//! Synthetic root/acquisition only. Never compiled into an operational issuer.
use super::*;

pub(in super::super::super::super) fn acquire<'s, S: RecordSource>(
    context: &'s InspectionContext<'s>,
    bound: &'s BoundTarget<'s>,
    receipt: RecordReceipt,
    source: S,
    b: &mut SharedBudget<'_>,
) -> Result<EvidenceInputs<'s, S>, InputRejected> {
    let mut inputs = EvidenceInputs {
        source,
        receipt,
        context,
        bound,
        identity: Rc::new(Identity {
            model: MODEL,
            origin: b.inspection_origin.clone(),
            bridge: b.protected_bridge_claim.clone(),
            session: b.scan_session_claim.clone(),
            started: b.started,
            context_issued_here: std::cell::Cell::new(false),
        }),
        source_origin: Rc::new(()), // Exists before acquisition checks, tied to this owned source.
    };
    let context_result = (|| {
        work(b)?; // Synthetic root dispatch/limits. No caller-supplied approval flag.
        check_identity(&inputs.identity, b)?;
        if context.registry.len() > 65536
            || context.groups.len() > crate::record_validation::work_model::MAX_GROUPS
        {
            return Err(Failure::Limit);
        }
        let approved = crate::record_validation::tests::fixture().registry;
        work(b)?; // Fixed bounded registry comparison (one <=64KiB chunk).
        if context.registry != approved {
            return Err(Failure::Unavailable);
        }
        for group in context.groups {
            work(b)?;
            if *group != 80 {
                return Err(Failure::Binding);
            }
        }
        if context.groups != [80] {
            return Err(Failure::Binding);
        } // Fixed synthetic effective groups.
        b.checkpoint()
    })();
    if let Err(e) = context_result {
        return Err(rejected(&inputs.identity, SupplyStage::Context, e, b));
    }
    let record_result = (|| {
        work(b)?; // Synthetic records acquisition dispatch.
        if inputs.receipt.binding.execution_uid != 501 || inputs.receipt.binding.reader_gid != 80 {
            return Err(Failure::Binding);
        }
        validate_receipt(&inputs.receipt, bound, b)?;
        reread_bytes(&mut inputs.source, &inputs.receipt, b)?;
        let reading = clock_check(&mut inputs.source, &inputs.receipt, b, 450_000)?;
        verify_records(&inputs.receipt, bound.target, context, reading.wall_ms, b)?;
        round_declaration::with_round(
            &inputs.receipt,
            bound.target,
            context,
            Round::Initial,
            b,
            |scope, b| {
                let d = scope.decode(b)?;
                verify_node_entries(d.entries(), bound.target, b)
            },
        )?;
        b.checkpoint()
    })();
    if let Err(e) = record_result {
        return Err(rejected(&inputs.identity, SupplyStage::ReceiptTarget, e, b));
    }
    Ok(inputs)
}
