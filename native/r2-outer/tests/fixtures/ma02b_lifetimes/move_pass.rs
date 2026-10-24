// Borrow ends before moving the actual estimate into the existing fixed consumer.
fn ma02b_move_case<'p, 'i, 'd, 's, 'r>(
    estimate: ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let partial = project(&estimate, inputs, scope, MANAGEMENT_ID, b)?;
    partial.consume(&estimate, inputs, scope, b)?;
    let moved = estimate;
    moved.consume_for_collector(inputs, scope, b)
}
