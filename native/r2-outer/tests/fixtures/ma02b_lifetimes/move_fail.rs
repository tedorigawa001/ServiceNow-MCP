// Actual projection is used after the move, so NLL cannot end the borrow early.
fn ma02b_move_case<'p, 'i, 'd, 's, 'r>(
    estimate: ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let partial = project(&estimate, inputs, scope, MANAGEMENT_ID, b)?;
    let moved = estimate;
    partial.consume(&moved, inputs, scope, b)
}
