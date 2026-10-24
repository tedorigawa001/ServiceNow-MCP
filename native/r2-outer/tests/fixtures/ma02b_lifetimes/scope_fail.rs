// Same real pipeline as scope_pass, but a scope-bound projection escapes its callback.
fn ma02b_scope_case<'s>(
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let mut escaped = None;
    with_round(receipt, target, context, Round::Initial, b, |scope, b| {
        let declaration = scope.decode(b)?;
        let phases = declaration.prepare_scan(scope, phases::PHASE_MODEL_ID, b)?;
        let inputs = phases.bind_inputs(scope, b)?;
        let profile = build(&inputs, scope, MODEL_ID, b)?;
        let estimate = calculate(profile, &inputs, scope, CALCULATOR_ID, b)?;
        escaped = Some(project(&estimate, &inputs, scope, MANAGEMENT_ID, b)?);
        Ok(())
    })?;
    let _ = escaped;
    Ok(())
}
