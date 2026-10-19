# Experimental OL-02 development requirements

Observed for the synthetic verification on 2026-10-19:

- rustc 1.98.1 (48a229cea 2026-09-01)
- cargo 1.98.1 (797e8a9bc 2026-08-05)
- installed toolchain name: stable-aarch64-apple-darwin

Verify these exact versions before repeating the recorded development commands.
This record does not pin a mutable stable installation or approve a production toolchain.
No rust-toolchain.toml is supplied: the exact-version toolchain name was not installed,
and rustup must not download/install it implicitly as part of a synthetic check.
Cargo.toml's rust-version is a minimum compatibility check, not an exact-version check.
Production toolchain identity, authenticated acquisition, fixed build environment and
offline vendor closure remain OL-01 approval/deployment requirements.
