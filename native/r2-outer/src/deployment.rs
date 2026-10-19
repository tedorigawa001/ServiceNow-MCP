//! Read-only deployment inspection. No execution permit, process launch or record trust upgrade.
use crate::closure::{Binding, CheckedIndex, ClosureFailure};
use std::time::Instant;

#[derive(Debug, PartialEq, Eq)]
pub enum DeploymentFailure {
    Metadata,
    Changed,
    Unavailable,
    Unsupported,
    Limit,
    Deadline,
    Index(ClosureFailure),
}
/// Root and binding are inspection inputs, not trusted execution authority.
/// The future runtime adapter must derive them from independently verified records.
pub fn inspect_deployment(
    root: &str,
    binding: &Binding<'_>,
    started: Instant,
) -> Result<CheckedIndex, DeploymentFailure> {
    platform_inspect(root, binding, started)
}
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn platform_inspect(
    _: &str,
    _: &Binding<'_>,
    _: Instant,
) -> Result<CheckedIndex, DeploymentFailure> {
    Err(DeploymentFailure::Unsupported)
}
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use darwin::inspect as platform_inspect;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod darwin {
    use super::*;
    use crate::closure::{self, Entry};
    use sha2::{Digest, Sha256};
    use std::{
        collections::{BTreeMap, BTreeSet},
        ffi::CString,
        fs::File,
        io::Read,
        os::{
            fd::{AsRawFd, FromRawFd, IntoRawFd},
            unix::fs::MetadataExt,
        },
    };
    const MAX_INDEX: usize = 16 * 1024 * 1024;
    const MAX_ITEMS: usize = 100_001;
    const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
    #[cfg(test)]
    type Hook = Box<dyn FnMut(&str, &str)>;
    #[cfg(test)]
    std::thread_local! {static HOOK:std::cell::RefCell<Option<Hook>>=const{std::cell::RefCell::new(None)};}
    #[cfg(test)]
    fn notify(event: &str, path: &str) {
        HOOK.with(|h| {
            if let Some(callback) = h.borrow_mut().as_mut() {
                callback(event, path);
            }
        });
    }
    #[derive(Clone, PartialEq, Eq)]
    struct Snapshot {
        identity: Vec<u64>,
        names: Vec<Vec<u8>>,
        directory: bool,
        regular: bool,
        uid: u32,
        mode: u32,
        links: u64,
        size: u64,
        dev: u64,
    }
    fn budget(start: Instant) -> Result<(), DeploymentFailure> {
        if Instant::now()
            .checked_duration_since(start)
            .is_none_or(|d| d >= std::time::Duration::from_secs(10))
        {
            Err(DeploymentFailure::Deadline)
        } else {
            Ok(())
        }
    }
    fn identity(m: &std::fs::Metadata) -> Vec<u64> {
        vec![
            m.dev(),
            m.ino(),
            m.uid() as u64,
            m.gid() as u64,
            m.mode() as u64,
            m.nlink(),
            m.size(),
            m.mtime() as u64,
            m.mtime_nsec() as u64,
            m.ctime() as u64,
            m.ctime_nsec() as u64,
        ]
    }
    fn attribute_names(fd: i32) -> Result<Vec<Vec<u8>>, DeploymentFailure> {
        // SAFETY: borrowed live fd; first query writes nothing, second has a strictly bounded buffer.
        let n = unsafe { libc::flistxattr(fd, std::ptr::null_mut(), 0, 0) };
        if n < 0 || n as usize > 65536 {
            return Err(DeploymentFailure::Metadata);
        }
        if n == 0 {
            return Ok(Vec::new());
        }
        let mut bytes = vec![0u8; n as usize];
        let got = unsafe { libc::flistxattr(fd, bytes.as_mut_ptr().cast(), bytes.len(), 0) };
        if got != n {
            return Err(DeploymentFailure::Changed);
        }
        parse_names(&bytes)
    }
    fn parse_names(bytes: &[u8]) -> Result<Vec<Vec<u8>>, DeploymentFailure> {
        if bytes.is_empty() {
            return Ok(Vec::new());
        }
        if bytes.last() != Some(&0) || bytes.len() > 65536 {
            return Err(DeploymentFailure::Metadata);
        }
        let mut names = BTreeSet::new();
        for name in bytes[..bytes.len() - 1].split(|b| *b == 0) {
            if name.is_empty()
                || name.len() > 255
                || name != b"com.apple.provenance"
                || !names.insert(name.to_vec())
            {
                return Err(DeploymentFailure::Metadata);
            }
        }
        Ok(names.into_iter().collect())
    }
    fn snapshot(file: &File, xattrs: bool) -> Result<Snapshot, DeploymentFailure> {
        let before = file
            .metadata()
            .map_err(|_| DeploymentFailure::Unavailable)?;
        if !crate::filesystem::no_acl(file).map_err(|_| DeploymentFailure::Metadata)? {
            return Err(DeploymentFailure::Metadata);
        }
        let names = if xattrs {
            attribute_names(file.as_raw_fd())?
        } else {
            Vec::new()
        };
        let after = file
            .metadata()
            .map_err(|_| DeploymentFailure::Unavailable)?;
        if identity(&before) != identity(&after) {
            return Err(DeploymentFailure::Changed);
        }
        Ok(Snapshot {
            identity: identity(&after),
            names,
            directory: after.is_dir(),
            regular: after.is_file(),
            uid: after.uid(),
            mode: after.mode() & 0o7777,
            links: after.nlink(),
            size: after.size(),
            dev: after.dev(),
        })
    }
    fn policy(
        s: &Snapshot,
        owner: u32,
        dir: bool,
        mode: u32,
        device: u64,
    ) -> Result<(), DeploymentFailure> {
        if s.uid != owner
            || s.mode != mode
            || s.dev != device
            || if dir {
                !s.directory || s.regular
            } else {
                !s.regular || s.directory || s.links != 1
            }
        {
            return Err(DeploymentFailure::Metadata);
        }
        Ok(())
    }
    fn open_at(parent: &File, name: &str, dir: bool) -> Result<File, DeploymentFailure> {
        // name is one validated component, except the internal "." used to enumerate the same directory.
        if name.is_empty() || name.contains('/') || name == ".." {
            return Err(DeploymentFailure::Metadata);
        }
        let name = CString::new(name).map_err(|_| DeploymentFailure::Metadata)?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if dir { libc::O_DIRECTORY } else { 0 };
        // SAFETY: borrowed directory fd, NUL-terminated component, returned fd is owned once.
        let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(DeploymentFailure::Metadata);
        }
        Ok(unsafe { File::from_raw_fd(fd) })
    }
    fn remember(
        seen: &mut BTreeMap<String, Snapshot>,
        path: &str,
        value: Snapshot,
    ) -> Result<(), DeploymentFailure> {
        if let Some(old) = seen.get(path) {
            if old != &value {
                return Err(DeploymentFailure::Changed);
            }
        } else {
            if seen.len() > MAX_ITEMS {
                return Err(DeploymentFailure::Limit);
            }
            seen.insert(path.into(), value);
        }
        Ok(())
    }
    fn resolve(
        root: &File,
        path: &str,
        kind_mode: (bool, u32),
        owner: u32,
        device: u64,
        seen: &mut BTreeMap<String, Snapshot>,
        started: Instant,
    ) -> Result<File, DeploymentFailure> {
        let (dir, mode) = kind_mode;
        if !closure::path(path) {
            return Err(DeploymentFailure::Metadata);
        }
        let mut parent = root
            .try_clone()
            .map_err(|_| DeploymentFailure::Unavailable)?;
        let mut relative = String::new();
        let parts = path.split('/').collect::<Vec<_>>();
        for (i, part) in parts.iter().enumerate() {
            budget(started)?;
            if i > 0 {
                relative.push('/');
            }
            relative.push_str(part);
            let is_dir = i + 1 < parts.len() || dir;
            let expected = if i + 1 < parts.len() { 0o555 } else { mode };
            let child = open_at(&parent, part, is_dir)?;
            let state = snapshot(&child, true)?;
            policy(&state, owner, is_dir, expected, device)?;
            remember(seen, &relative, state)?;
            parent = child;
        }
        Ok(parent)
    }
    fn names(
        file: &File,
        max: usize,
        started: Instant,
    ) -> Result<BTreeSet<String>, DeploymentFailure> {
        struct Directory(*mut libc::DIR);
        impl Drop for Directory {
            fn drop(&mut self) {
                unsafe {
                    libc::closedir(self.0);
                }
            }
        }
        let opened = open_at(file, ".", true)?.into_raw_fd();
        // SAFETY: owned fd transferred to DIR on success; readdir's result is copied before its next call.
        let raw = unsafe { libc::fdopendir(opened) };
        if raw.is_null() {
            unsafe {
                libc::close(opened);
            }
            return Err(DeploymentFailure::Unavailable);
        }
        let dir = Directory(raw);
        let mut result = BTreeSet::new();
        loop {
            budget(started)?;
            unsafe {
                *libc::__error() = 0;
            }
            let entry = unsafe { libc::readdir(dir.0) };
            if entry.is_null() {
                if unsafe { *libc::__error() } != 0 {
                    return Err(DeploymentFailure::Unavailable);
                }
                break;
            }
            let entry = unsafe { &*entry };
            let length = entry.d_namlen as usize;
            if length == 0
                || length > 255
                || length >= entry.d_name.len()
                || entry.d_name[length] != 0
            {
                return Err(DeploymentFailure::Metadata);
            }
            let bytes = entry.d_name[..length]
                .iter()
                .map(|v| *v as u8)
                .collect::<Vec<_>>();
            if bytes == b"." || bytes == b".." {
                continue;
            }
            let name = std::str::from_utf8(&bytes).map_err(|_| DeploymentFailure::Metadata)?;
            if !closure::path(name)
                || name.contains('/')
                || result.len() >= max
                || !result.insert(name.into())
            {
                return Err(DeploymentFailure::Metadata);
            }
        }
        Ok(result)
    }
    pub(super) fn inspect(
        root: &str,
        binding: &Binding<'_>,
        started: Instant,
    ) -> Result<CheckedIndex, DeploymentFailure> {
        budget(started)?;
        let parts = root.strip_prefix('/').ok_or(DeploymentFailure::Metadata)?;
        if root.len() > 4096
            || parts.is_empty()
            || parts.split('/').count() > 64
            || parts.split('/').any(|p| {
                p.is_empty()
                    || p == "."
                    || p == ".."
                    || p.len() > 255
                    || p.chars().any(char::is_control)
            })
        {
            return Err(DeploymentFailure::Metadata);
        }
        // SAFETY: fixed absolute directory; no caller-controlled flags, environment or owner override.
        let fd = unsafe {
            libc::open(
                c"/".as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err(DeploymentFailure::Unavailable);
        }
        let mut chain = vec![(unsafe { File::from_raw_fd(fd) }, String::new())];
        let mut states = Vec::new();
        let first = snapshot(&chain[0].0, false)?;
        if first.uid != 0 || !first.directory || first.mode & 0o7022 != 0 {
            return Err(DeploymentFailure::Metadata);
        }
        states.push(first);
        for part in parts.split('/') {
            budget(started)?;
            let child = open_at(
                &chain.last().ok_or(DeploymentFailure::Metadata)?.0,
                part,
                true,
            )?;
            let state = snapshot(&child, false)?;
            if state.uid != 0 || !state.directory || state.mode & 0o7022 != 0 {
                return Err(DeploymentFailure::Metadata);
            }
            chain.push((child, part.into()));
            states.push(state);
        }
        let result = scan_root(
            &chain.last().ok_or(DeploymentFailure::Metadata)?.0,
            binding,
            started,
            0,
        )?;
        for (i, (file, name)) in chain.iter().enumerate() {
            budget(started)?;
            if snapshot(file, false)? != states[i] {
                return Err(DeploymentFailure::Changed);
            }
            if i > 0 && snapshot(&open_at(&chain[i - 1].0, name, true)?, false)? != states[i] {
                return Err(DeploymentFailure::Changed);
            }
        }
        budget(started)?;
        Ok(result)
    }
    fn scan_root(
        root: &File,
        binding: &Binding<'_>,
        started: Instant,
        owner: u32,
    ) -> Result<CheckedIndex, DeploymentFailure> {
        budget(started)?;
        let mut fs = std::mem::MaybeUninit::<libc::statfs>::uninit();
        // SAFETY: borrowed live root fd, correctly sized statfs output; read only on success.
        if unsafe { libc::fstatfs(root.as_raw_fd(), fs.as_mut_ptr()) } != 0 {
            return Err(DeploymentFailure::Metadata);
        }
        if unsafe { fs.assume_init() }.f_flags & (libc::MNT_LOCAL as u32) == 0 {
            return Err(DeploymentFailure::Metadata);
        }
        let root_state = snapshot(root, true)?;
        let device = root_state.dev;
        policy(&root_state, owner, true, 0o555, device)?;
        let mut seen = BTreeMap::from([(String::new(), root_state)]);
        let mut index = resolve(
            root,
            binding.index_path,
            (false, 0o444),
            owner,
            device,
            &mut seen,
            started,
        )?;
        if index
            .metadata()
            .map_err(|_| DeploymentFailure::Unavailable)?
            .len()
            > MAX_INDEX as u64
        {
            return Err(DeploymentFailure::Limit);
        }
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 65536];
        #[cfg(test)]
        notify("opened", binding.index_path);
        loop {
            budget(started)?;
            let remaining = (MAX_INDEX + 1 - bytes.len()).min(buffer.len());
            let n = index
                .read(&mut buffer[..remaining])
                .map_err(|_| DeploymentFailure::Unavailable)?;
            if n == 0 {
                break;
            }
            if bytes.len() + n > MAX_INDEX {
                return Err(DeploymentFailure::Limit);
            }
            bytes.extend_from_slice(&buffer[..n]);
        }
        remember(&mut seen, binding.index_path, snapshot(&index, true)?)?;
        if bytes.len() as u64 != seen[binding.index_path].size {
            return Err(DeploymentFailure::Changed);
        }
        let mut expected =
            closure::declared(&bytes, binding, started).map_err(DeploymentFailure::Index)?;
        expected.push(Entry::File {
            path: binding.index_path.into(),
            mode: "0444".into(),
            size: bytes.len() as u64,
            sha256: binding.index_sha256.into(),
        });
        let mut children =
            BTreeMap::<String, BTreeSet<String>>::from([(String::new(), BTreeSet::new())]);
        for entry in &expected {
            if let Entry::Directory { path, .. } = entry {
                children.entry(path.clone()).or_default();
            }
            let (parent, name) = entry.path().rsplit_once('/').unwrap_or(("", entry.path()));
            children
                .entry(parent.into())
                .or_default()
                .insert(name.into());
        }
        let mut observed = Vec::new();
        let mut total = bytes.len() as u64;
        let mut file_ids = BTreeSet::new();
        for entry in &expected {
            budget(started)?;
            match entry {
                Entry::Directory { path, mode } => {
                    let file =
                        resolve(root, path, (true, 0o555), owner, device, &mut seen, started)?;
                    if names(&file, children[path].len(), started)? != children[path] {
                        return Err(DeploymentFailure::Changed);
                    }
                    remember(&mut seen, path, snapshot(&file, true)?)?;
                    observed.push(Entry::Directory {
                        path: path.clone(),
                        mode: mode.clone(),
                    });
                }
                Entry::File {
                    path, mode, size, ..
                } => {
                    let mut file = resolve(
                        root,
                        path,
                        (false, if mode == "0555" { 0o555 } else { 0o444 }),
                        owner,
                        device,
                        &mut seen,
                        started,
                    )?;
                    let state = &seen[path];
                    if state.size != *size {
                        return Err(DeploymentFailure::Changed);
                    }
                    if !file_ids.insert((state.identity[0], state.identity[1])) {
                        return Err(DeploymentFailure::Metadata);
                    }
                    if path == binding.index_path {
                        observed.push(entry.clone());
                        continue;
                    }
                    #[cfg(test)]
                    notify("opened", path);
                    let mut length = 0u64;
                    let mut hash = Sha256::new();
                    loop {
                        budget(started)?;
                        let remaining =
                            size.saturating_sub(length)
                                .saturating_add(1)
                                .min(buffer.len() as u64) as usize;
                        let n = file
                            .read(&mut buffer[..remaining])
                            .map_err(|_| DeploymentFailure::Unavailable)?;
                        if n == 0 {
                            break;
                        }
                        length = length
                            .checked_add(n as u64)
                            .ok_or(DeploymentFailure::Limit)?;
                        total = total
                            .checked_add(n as u64)
                            .ok_or(DeploymentFailure::Limit)?;
                        if length > *size || total > MAX_BYTES {
                            return Err(DeploymentFailure::Limit);
                        }
                        hash.update(&buffer[..n]);
                        #[cfg(test)]
                        notify("chunk", path);
                    }
                    if length != *size {
                        return Err(DeploymentFailure::Changed);
                    }
                    remember(&mut seen, path, snapshot(&file, true)?)?;
                    observed.push(Entry::File {
                        path: path.clone(),
                        mode: mode.clone(),
                        size: length,
                        sha256: format!("{:x}", hash.finalize()),
                    });
                }
            }
        }
        if names(root, children[""].len(), started)? != children[""] {
            return Err(DeploymentFailure::Changed);
        }
        remember(&mut seen, "", snapshot(root, true)?)?;
        // Re-resolve all links from the retained root, not from a potentially redirected absolute path.
        #[cfg(test)]
        notify("final", "");
        let captured = seen.clone();
        for (path, state) in &captured {
            if path.is_empty() {
                continue;
            }
            let file = resolve(
                root,
                path,
                (state.directory, state.mode),
                owner,
                device,
                &mut seen,
                started,
            )?;
            if snapshot(&file, true)? != *state {
                return Err(DeploymentFailure::Changed);
            }
        }
        remember(&mut seen, "", snapshot(root, true)?)?;
        budget(started)?;
        closure::check(&bytes, binding, &observed, started).map_err(DeploymentFailure::Index)
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        use sha2::{Digest, Sha256};
        use std::os::unix::fs::PermissionsExt;
        struct Fixture(std::path::PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) {
                fn unlock(path: &std::path::Path) {
                    if std::fs::symlink_metadata(path).is_ok_and(|m| m.is_dir()) {
                        let _ =
                            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700));
                        if let Ok(entries) = std::fs::read_dir(path) {
                            for entry in entries.flatten() {
                                unlock(&entry.path());
                            }
                        }
                    }
                }
                unlock(&self.0);
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        fn digest(v: &[u8]) -> String {
            format!("{:x}", Sha256::digest(v))
        }
        fn fixture() -> (Fixture, Vec<u8>) {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "r2-deployment-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir(&root).unwrap();
            let fixture = Fixture(root);
            std::fs::create_dir_all(fixture.0.join("dist/review")).unwrap();
            let index=serde_json::to_vec(&serde_json::json!({"schema_version":"bp5-r2-closure-index-0.1","release_id":"synthetic","generation":1,"entries":[
                {"kind":"directory","path":"dist","mode":"0555"},
                {"kind":"directory","path":"dist/review","mode":"0555"},
                {"kind":"file","path":"dist/review/r2-launcher-entry.js","mode":"0444","size":2,"sha256":digest(b"js")},
                {"kind":"file","path":"node","mode":"0555","size":4,"sha256":digest(b"node")}
            ]})).unwrap();
            for (path, bytes, mode) in [
                ("index.json", index.as_slice(), 0o444),
                ("node", b"node".as_slice(), 0o555),
                ("dist/review/r2-launcher-entry.js", b"js".as_slice(), 0o444),
            ] {
                let p = fixture.0.join(path);
                std::fs::write(&p, bytes).unwrap();
                std::fs::set_permissions(p, std::fs::Permissions::from_mode(mode)).unwrap();
            }
            for p in [
                &fixture.0,
                &fixture.0.join("dist"),
                &fixture.0.join("dist/review"),
            ] {
                std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o555)).unwrap();
            }
            (fixture, index)
        }
        fn run(f: &Fixture, index: &[u8]) -> Result<CheckedIndex, DeploymentFailure> {
            let binding = Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &digest(index),
                index_path: "index.json",
                node_path: "node",
            };
            scan_root(
                &File::open(&f.0).unwrap(),
                &binding,
                Instant::now(),
                unsafe { libc::getuid() },
            )
        }
        #[test]
        fn owned_fixture_reads_actual_bytes_and_returns_counts_only() {
            let (f, index) = fixture();
            let summary = run(&f, &index).unwrap();
            assert_eq!(summary.entries, 4);
            assert_eq!(summary.file_bytes, index.len() as u64 + 6);
        }
        fn permissions(path: &std::path::Path, mode: u32) {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
        }
        #[test]
        fn production_entry_never_accepts_the_user_owned_fixture() {
            let (f, index) = fixture();
            let binding = Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &digest(&index),
                index_path: "index.json",
                node_path: "node",
            };
            assert!(inspect_deployment(f.0.to_str().unwrap(), &binding, Instant::now()).is_err());
        }
        #[test]
        fn leaf_and_intermediate_symlinks_are_not_followed() {
            use std::os::unix::fs::symlink;
            for directory in [false, true] {
                let (f, index) = fixture();
                permissions(&f.0, 0o700);
                if directory {
                    std::fs::rename(f.0.join("dist"), f.0.join("saved")).unwrap();
                    symlink("saved", f.0.join("dist")).unwrap();
                } else {
                    std::fs::remove_file(f.0.join("node")).unwrap();
                    symlink("index.json", f.0.join("node")).unwrap();
                }
                permissions(&f.0, 0o555);
                assert!(run(&f, &index).is_err());
                if directory {
                    permissions(&f.0, 0o700);
                    std::fs::remove_file(f.0.join("dist")).unwrap();
                    std::fs::rename(f.0.join("saved"), f.0.join("dist")).unwrap();
                }
            }
        }
        #[test]
        fn hardlinks_and_special_files_are_rejected_without_blocking() {
            for fifo in [false, true] {
                let (f, index) = fixture();
                permissions(&f.0, 0o700);
                if fifo {
                    std::fs::remove_file(f.0.join("node")).unwrap();
                    let name = CString::new(f.0.join("node").to_str().unwrap()).unwrap();
                    assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o555) }, 0);
                } else {
                    std::fs::hard_link(f.0.join("node"), f.0.join("alias")).unwrap();
                }
                permissions(&f.0, 0o555);
                assert_eq!(run(&f, &index).unwrap_err(), DeploymentFailure::Metadata);
            }
        }
        #[test]
        fn incorrect_modes_on_any_runtime_component_are_rejected() {
            for (name, mode) in [
                ("", 0o777),
                ("dist", 0o775),
                ("dist/review", 0o755),
                ("node", 0o666),
                ("index.json", 0o644),
                ("dist/review/r2-launcher-entry.js", 0o555),
            ] {
                let (f, index) = fixture();
                permissions(&f.0.join(name), mode);
                assert_eq!(
                    std::fs::metadata(f.0.join(name)).unwrap().mode() & 0o7777,
                    mode,
                    "fixture mode setup {name}"
                );
                assert_eq!(run(&f, &index).unwrap_err(), DeploymentFailure::Metadata);
            }
        }
        #[test]
        fn owner_device_and_link_rules_are_fail_closed_in_synthetic_metadata() {
            let (f, _) = fixture();
            let node = File::open(f.0.join("node")).unwrap();
            let s = snapshot(&node, true).unwrap();
            for (owner, device, links) in [
                (s.uid.wrapping_add(1), s.dev, 1),
                (s.uid, s.dev.wrapping_add(1), 1),
                (s.uid, s.dev, 2),
            ] {
                let mut changed = s.clone();
                changed.links = links;
                assert_eq!(
                    policy(&changed, owner, false, 0o555, device),
                    Err(DeploymentFailure::Metadata)
                );
            }
            let mut special = s.clone();
            special.mode = 0o4555;
            assert_eq!(
                policy(&special, s.uid, false, 0o555, s.dev),
                Err(DeploymentFailure::Metadata)
            );
        }
        #[test]
        fn changed_bytes_or_size_are_not_hidden_by_matching_names() {
            for bytes in [b"evil".as_slice(), b"grown".as_slice()] {
                let (f, index) = fixture();
                let p = f.0.join("node");
                permissions(&p, 0o700);
                std::fs::write(&p, bytes).unwrap();
                permissions(&p, 0o555);
                assert!(run(&f, &index).is_err());
            }
        }
        #[test]
        fn unknown_missing_and_extra_nested_files_are_rejected() {
            for path in ["extra", "dist/review/extra", "missing-node"] {
                let (f, index) = fixture();
                let parent = if path.contains('/') {
                    f.0.join("dist/review")
                } else {
                    f.0.clone()
                };
                permissions(&parent, 0o700);
                if path == "missing-node" {
                    std::fs::remove_file(f.0.join("node")).unwrap();
                } else {
                    std::fs::write(f.0.join(path), b"extra").unwrap();
                }
                permissions(&parent, 0o555);
                assert!(run(&f, &index).is_err());
            }
        }
        #[test]
        fn xattr_policy_allows_only_absence_or_provenance_names() {
            assert_eq!(parse_names(b"").unwrap(), Vec::<Vec<u8>>::new());
            assert_eq!(
                parse_names(b"com.apple.provenance\0").unwrap(),
                vec![b"com.apple.provenance".to_vec()]
            );
            for names in [
                b"com.apple.quarantine\0".as_slice(),
                b"com.apple.ResourceFork\0",
                b"other\0",
                b"com.apple.provenance",
                b"\0",
                b"com.apple.provenance\0com.apple.provenance\0",
            ] {
                assert_eq!(parse_names(names), Err(DeploymentFailure::Metadata));
            }
        }
        #[test]
        fn unknown_xattr_on_owned_temporary_file_is_rejected() {
            let (f, index) = fixture();
            permissions(&f.0.join("node"), 0o700);
            let node = File::open(f.0.join("node")).unwrap();
            let status = unsafe {
                libc::fsetxattr(
                    node.as_raw_fd(),
                    c"com.example.r2-synthetic".as_ptr(),
                    b"dummy".as_ptr().cast(),
                    5,
                    0,
                    0,
                )
            };
            assert_eq!(
                status,
                0,
                "fixture xattr setup errno={:?}",
                std::io::Error::last_os_error().raw_os_error()
            );
            permissions(&f.0.join("node"), 0o555);
            assert_eq!(run(&f, &index).unwrap_err(), DeploymentFailure::Metadata);
        }
        struct HookGuard;
        impl Drop for HookGuard {
            fn drop(&mut self) {
                HOOK.with(|h| {
                    h.borrow_mut().take();
                });
            }
        }
        fn hook(callback: impl FnMut(&str, &str) + 'static) -> HookGuard {
            HOOK.with(|h| {
                assert!(h.borrow_mut().replace(Box::new(callback)).is_none());
            });
            HookGuard
        }
        #[test]
        fn leaf_replaced_after_open_never_returns_success() {
            let (f, index) = fixture();
            let root = f.0.clone();
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, path| {
                if event == "opened" && path == "node" && !flag.replace(true) {
                    permissions(&root, 0o700);
                    std::fs::rename(root.join("node"), root.join("saved")).unwrap();
                    std::fs::write(root.join("node"), b"node").unwrap();
                    permissions(&root.join("node"), 0o555);
                    std::fs::remove_file(root.join("saved")).unwrap();
                    permissions(&root, 0o555);
                }
            });
            assert!(run(&f, &index).is_err());
            assert!(triggered.get());
        }
        #[test]
        fn in_place_growth_during_hashing_is_rejected() {
            use std::io::Write;
            let (f, index) = fixture();
            let node = f.0.join("node");
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, path| {
                if event == "chunk" && path == "node" && !flag.replace(true) {
                    permissions(&node, 0o700);
                    let mut file = std::fs::OpenOptions::new()
                        .append(true)
                        .open(&node)
                        .unwrap();
                    file.write_all(b"x").unwrap();
                    permissions(&node, 0o555);
                }
            });
            assert!(run(&f, &index).is_err());
            assert!(triggered.get());
        }
        #[test]
        fn directory_replaced_after_child_open_is_rejected() {
            let (f, index) = fixture();
            let root = f.0.clone();
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, path| {
                if event == "opened"
                    && path == "dist/review/r2-launcher-entry.js"
                    && !flag.replace(true)
                {
                    let dist = root.join("dist");
                    permissions(&dist, 0o700);
                    std::fs::rename(dist.join("review"), dist.join("saved")).unwrap();
                    std::fs::create_dir(dist.join("review")).unwrap();
                    std::fs::write(dist.join("review/r2-launcher-entry.js"), b"js").unwrap();
                    permissions(&dist.join("review/r2-launcher-entry.js"), 0o444);
                    permissions(&dist.join("review"), 0o555);
                    permissions(&dist, 0o555);
                }
            });
            assert!(run(&f, &index).is_err());
            assert!(triggered.get());
            permissions(&f.0.join("dist"), 0o700);
            permissions(&f.0.join("dist/saved"), 0o700);
            std::fs::remove_dir_all(f.0.join("dist/saved")).unwrap();
        }
        #[test]
        fn mutation_after_all_hashes_is_detected_by_final_identity_check() {
            let (f, index) = fixture();
            let node = f.0.join("node");
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, _| {
                if event == "final" && !flag.replace(true) {
                    permissions(&node, 0o700);
                    std::fs::write(&node, b"evil").unwrap();
                    permissions(&node, 0o555);
                }
            });
            assert!(run(&f, &index).is_err());
            assert!(triggered.get());
        }
        #[test]
        fn expired_inspection_stops_before_opening_any_path() {
            let binding = Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &"a".repeat(64),
                index_path: "index.json",
                node_path: "node",
            };
            assert_eq!(
                inspect_deployment(
                    "not-an-absolute-path",
                    &binding,
                    Instant::now() - std::time::Duration::from_secs(10)
                )
                .unwrap_err(),
                DeploymentFailure::Deadline
            );
        }
        #[test]
        fn index_replaced_after_open_is_rejected_even_with_identical_bytes() {
            let (f, index) = fixture();
            let root = f.0.clone();
            let copy = index.clone();
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, path| {
                if event == "opened" && path == "index.json" && !flag.replace(true) {
                    permissions(&root, 0o700);
                    std::fs::rename(root.join("index.json"), root.join("saved")).unwrap();
                    std::fs::write(root.join("index.json"), &copy).unwrap();
                    permissions(&root.join("index.json"), 0o444);
                    std::fs::remove_file(root.join("saved")).unwrap();
                    permissions(&root, 0o555);
                }
            });
            assert!(run(&f, &index).is_err());
            assert!(triggered.get());
        }
        #[test]
        fn invalid_index_binding_stops_before_any_payload_read() {
            let (f, _) = fixture();
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, path| {
                if event == "opened" && path != "index.json" {
                    flag.set(true);
                }
            });
            let binding = Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &"a".repeat(64),
                index_path: "index.json",
                node_path: "node",
            };
            assert_eq!(
                scan_root(
                    &File::open(&f.0).unwrap(),
                    &binding,
                    Instant::now(),
                    unsafe { libc::getuid() }
                )
                .unwrap_err(),
                DeploymentFailure::Index(ClosureFailure::Binding)
            );
            assert!(!triggered.get());
        }
        #[test]
        fn oversized_index_is_rejected_using_metadata_before_read() {
            let (f, index) = fixture();
            let path = f.0.join("index.json");
            permissions(&path, 0o600);
            std::fs::OpenOptions::new()
                .write(true)
                .open(&path)
                .unwrap()
                .set_len(MAX_INDEX as u64 + 1)
                .unwrap();
            permissions(&path, 0o444);
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |_, _| flag.set(true));
            assert_eq!(run(&f, &index).unwrap_err(), DeploymentFailure::Limit);
            assert!(!triggered.get());
        }
        #[test]
        fn xattr_added_after_hashing_is_not_accepted() {
            let (f, index) = fixture();
            let node = f.0.join("node");
            let triggered = std::rc::Rc::new(std::cell::Cell::new(false));
            let flag = triggered.clone();
            let _guard = hook(move |event, _| {
                if event == "final" && !flag.replace(true) {
                    permissions(&node, 0o700);
                    let file = File::open(&node).unwrap();
                    assert_eq!(
                        unsafe {
                            libc::fsetxattr(
                                file.as_raw_fd(),
                                c"com.example.r2-synthetic".as_ptr(),
                                b"dummy".as_ptr().cast(),
                                5,
                                0,
                                0,
                            )
                        },
                        0
                    );
                    permissions(&node, 0o555);
                }
            });
            assert_eq!(run(&f, &index).unwrap_err(), DeploymentFailure::Metadata);
            assert!(triggered.get());
        }
    }
}
