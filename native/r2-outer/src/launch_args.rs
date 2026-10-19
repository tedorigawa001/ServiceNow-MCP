#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    CheckPlan,
    Run,
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Arguments {
    pub mode: Mode,
    pub manifest: String,
}
pub(crate) fn absolute(path: &str) -> bool {
    path.starts_with('/')
        && path.len() > 1
        && path.len() <= 4096
        && !path.chars().any(char::is_control)
        && path[1..]
            .split('/')
            .all(|s| !s.is_empty() && s != "." && s != "..")
}
impl Mode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CheckPlan => "check-plan",
            Self::Run => "run",
        }
    }
}
pub(crate) fn parse(args: &[String]) -> Result<Arguments, ()> {
    let (mode, manifest) = match args {
        [path] => (Mode::CheckPlan, path),
        [mode, path] if mode == "check-plan" => (Mode::CheckPlan, path),
        [mode, path] if mode == "run" => (Mode::Run, path),
        _ => return Err(()),
    };
    if !absolute(manifest) {
        return Err(());
    }
    Ok(Arguments {
        mode,
        manifest: manifest.clone(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_is_offline_not_run() {
        assert_eq!(
            parse(&["/private/synthetic/manifest.json".into()]),
            Ok(Arguments {
                mode: Mode::CheckPlan,
                manifest: "/private/synthetic/manifest.json".into()
            })
        );
    }
    #[test]
    fn explicit_modes_and_rejects_injection_options() {
        assert_eq!(
            parse(&["run".into(), "/private/p.json".into()])
                .unwrap()
                .mode,
            Mode::Run
        );
        assert_eq!(
            parse(&["check-plan".into(), "/private/p.json".into()])
                .unwrap()
                .mode,
            Mode::CheckPlan
        );
        for args in [
            vec![],
            vec!["--inspect"],
            vec!["relative"],
            vec!["/a/../b"],
            vec!["/a//b"],
            vec!["/a\0b"],
            vec!["run", "/p", "--yes"],
            vec!["run", "/p", "--digest", "x"],
            vec!["--import", "/p"],
        ] {
            assert!(parse(&args.into_iter().map(str::to_string).collect::<Vec<_>>()).is_err());
        }
    }
}
