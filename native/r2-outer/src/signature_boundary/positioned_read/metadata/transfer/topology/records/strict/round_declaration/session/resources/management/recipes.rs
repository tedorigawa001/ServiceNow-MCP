//! MA-02A: finite recipe consistency only. No layout evidence, profile projection or authority.
use super::*;
const RECIPE_MODEL: &str = "bp5-r2-module-recipe-review-0.1";
const REVIEW_WORK: u64 = 23;
#[derive(Clone, Copy, PartialEq, Eq)]
enum Site {
    Counts,
    Keys,
    InlineMap,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Storage {
    VectorU64 { maximum_elements: u32 },
    RcUnits { groups: u8, nonces: u8 },
    InlineScalars { session_round: u8, local: u8 },
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Lifetime {
    BuildTemporary,
    UntilDraftDrop,
    WithDraft,
}
#[derive(Clone, Copy, PartialEq, Eq)]
struct Prefix {
    minimum: u8,
    maximum: u8,
}
#[derive(Clone, Copy)]
struct Recipe {
    site: Site,
    revision: &'static str,
    source: &'static str,
    storage: Storage,
    phase: Phase,
    lifetime: Lifetime,
    allocation_prefix: Prefix,
    layout: LayoutKnowledge,
}
// Intentionally no Verified/Real/Synthetic-success variant in the runtime contract.
#[derive(Clone, Copy, PartialEq, Eq)]
enum LayoutKnowledge {
    Unmodeled,
}
struct CoverageClaim {
    recipe_sites: u8,
    real_layout_sites: u8,
    whole_management: bool,
}
struct Catalog<'a> {
    model: &'static str,
    entries: &'a [Recipe],
    claim: CoverageClaim,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Missing {
    CountsLayout,
    KeysLayout,
    InlineParent,
    ControlOwners,
    ParserNested,
    Collector,
    Discard,
    WholeLifetime,
}
struct ModuleRecipeReview<'a, 'r> {
    catalog: &'a Catalog<'r>,
    layouts: [LayoutKnowledge; 3],
    missing: [Missing; 8],
}
impl std::fmt::Debug for ModuleRecipeReview<'_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ModuleRecipeReview(all_layouts_unknown_not_requirement_or_evidence)")
    }
}
fn fixed_entries() -> [Recipe; 3] {
    [
        Recipe {
            site: Site::Counts,
            revision: "profile-counts-0.1",
            source: "profile/collect.rs",
            storage: Storage::VectorU64 {
                maximum_elements: 100_000,
            },
            phase: Phase::B2,
            lifetime: Lifetime::BuildTemporary,
            allocation_prefix: Prefix {
                minimum: 0,
                maximum: 1,
            },
            layout: LayoutKnowledge::Unmodeled,
        },
        Recipe {
            site: Site::Keys,
            revision: "draft-logical-keys-0.1",
            source: "draft/slots.rs",
            storage: Storage::RcUnits {
                groups: 1,
                nonces: 3,
            },
            phase: Phase::B3,
            lifetime: Lifetime::UntilDraftDrop,
            allocation_prefix: Prefix {
                minimum: 0,
                maximum: 4,
            },
            layout: LayoutKnowledge::Unmodeled,
        },
        Recipe {
            site: Site::InlineMap,
            revision: "draft-inline-map-0.1",
            source: "caps/allocation_view/cap_map.rs",
            storage: Storage::InlineScalars {
                session_round: 32,
                local: 21,
            },
            phase: Phase::B3,
            lifetime: Lifetime::WithDraft,
            allocation_prefix: Prefix {
                minimum: 0,
                maximum: 0,
            },
            layout: LayoutKnowledge::Unmodeled,
        },
    ]
}
fn review<'a, 'r>(
    catalog: &'a Catalog<'r>,
    b: &mut SharedBudget<'_>,
) -> Result<ModuleRecipeReview<'a, 'r>, Failure> {
    let result = (|| {
        work(b)?; // fixed model only, no source/build authentication
        if catalog.model != RECIPE_MODEL {
            return Err(Failure::Unavailable);
        }
        work(b)?; // exact bounded envelope BEFORE iteration
        if catalog.entries.len() != 3 {
            return Err(Failure::Unavailable);
        }
        work(b)?;
        if catalog.claim.recipe_sites != 0b111
            || catalog.claim.real_layout_sites != 0
            || catalog.claim.whole_management
        {
            return Err(Failure::Unavailable);
        }
        if !b.work_available(REVIEW_WORK - 3) {
            return Err(Failure::Limit);
        }
        let expected = fixed_entries(); // three inline descriptors; no variable scratch/heap
        for (actual, expected) in catalog.entries.iter().zip(&expected) {
            work(b)?; // row1: canonical site/revision; duplicates/swaps rejected
            if actual.site != expected.site || actual.revision != expected.revision {
                return Err(Failure::Binding);
            }
            work(b)?; // row2: source label (not a provenance/closure attestation)
            if actual.source != expected.source {
                return Err(Failure::Binding);
            }
            work(b)?; // row3: fixed storage recipe, no byte/layout arithmetic
            if actual.storage != expected.storage {
                return Err(Failure::Binding);
            }
            work(b)?; // row4: phase and lifetime ownership
            if actual.phase != expected.phase || actual.lifetime != expected.lifetime {
                return Err(Failure::Binding);
            }
            work(b)?; // row5: success/rejection allocation prefix
            if actual.allocation_prefix != expected.allocation_prefix {
                return Err(Failure::Binding);
            }
            work(b)?; // row6: layout remains unknown even when inline heap count is zero
            if actual.layout != LayoutKnowledge::Unmodeled {
                return Err(Failure::Unavailable);
            }
        }
        work(b)?; // fixed missing coverage; never inferred from input flags
        let missing = [
            Missing::CountsLayout,
            Missing::KeysLayout,
            Missing::InlineParent,
            Missing::ControlOwners,
            Missing::ParserNested,
            Missing::Collector,
            Missing::Discard,
            Missing::WholeLifetime,
        ];
        work(b)?; // opaque partial review only; no witness/claim/parts issuance
        b.checkpoint()?;
        Ok(ModuleRecipeReview {
            catalog,
            layouts: [LayoutKnowledge::Unmodeled; 3],
            missing,
        })
    })();
    match result {
        Ok(value) => Ok(value),
        Err(e) => b.stop(e),
    }
}
impl ModuleRecipeReview<'_, '_> {
    fn require_complete(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<std::convert::Infallible, Failure> {
        work(b)?;
        b.stop(Failure::Unavailable) // no complete variant or constructor exists
    }
}

// Owned recipe facts only: no self-referential Catalog, layout proof or raw public constructor.
pub(in super::super::super::super) struct RecipeFacts {
    model: &'static str,
    layouts: [LayoutKnowledge; 3],
    missing: [Missing; 8],
}
pub(in super::super::super::super) fn inspect_fixed(
    b: &mut SharedBudget<'_>,
) -> Result<RecipeFacts, Failure> {
    let entries = fixed_entries();
    let catalog = Catalog {
        model: RECIPE_MODEL,
        entries: &entries,
        claim: CoverageClaim {
            recipe_sites: 7,
            real_layout_sites: 0,
            whole_management: false,
        },
    };
    let result = review(&catalog, b)?;
    work(b)?; // owned fixed facts publication; original 23-work review is unchanged
    b.checkpoint()?;
    Ok(RecipeFacts {
        model: RECIPE_MODEL,
        layouts: result.layouts,
        missing: result.missing,
    })
}
impl RecipeFacts {
    pub(in super::super::super::super) fn require(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        work(b)?; // bounded 3+8 fixed coverage checks, never a source/layout attestation
        if self.model != RECIPE_MODEL
            || self.layouts != [LayoutKnowledge::Unmodeled; 3]
            || self.missing
                != [
                    Missing::CountsLayout,
                    Missing::KeysLayout,
                    Missing::InlineParent,
                    Missing::ControlOwners,
                    Missing::ParserNested,
                    Missing::Collector,
                    Missing::Discard,
                    Missing::WholeLifetime,
                ]
        {
            return b.stop(Failure::Unavailable);
        }
        b.checkpoint()
    }
}

// Mock layout checks exist ONLY in tests, in a distinct type with no conversion to runtime review.
#[cfg(test)]
mod mock_layout {
    use super::*;
    pub(super) struct MockLayout {
        pub payload: u64,
        pub overhead: u64,
        pub alignment: u32,
        pub capacity_bounded: bool,
        pub nested_covered: bool,
        pub owner_covered: bool,
    }
    pub(super) struct MockCheck {
        pub site: Site,
        pub requested: u64,
    }
    impl std::fmt::Debug for MockCheck {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("MockLayoutCheck(test_only_not_verified_layout)")
        }
    }
    pub(super) fn check(site: Site, layout: &MockLayout) -> Result<MockCheck, Failure> {
        let requested = layout
            .payload
            .checked_add(layout.overhead)
            .ok_or(Failure::Limit)?;
        if requested == 0
            || requested > 16 * 1024 * 1024
            || layout.alignment == 0
            || layout.alignment > 4096
            || !layout.alignment.is_power_of_two()
        {
            return Err(Failure::Limit);
        }
        if !layout.capacity_bounded
            || !layout.nested_covered
            || !layout.owner_covered
            || (site == Site::Keys && layout.overhead == 0)
            || site == Site::InlineMap
        {
            return Err(Failure::Unavailable);
        }
        Ok(MockCheck { site, requested })
    }
}

#[cfg(test)]
mod tests;
