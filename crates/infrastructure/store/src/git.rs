//! Reads git metadata straight from `.git`, without spawning git.

use std::{
    fs,
    path::{Path, PathBuf},
};

/// The git branch checked out in `path` or its nearest parent repository: the branch
/// name, or the short commit for a detached HEAD.
pub fn git_branch(path: &Path) -> Option<String> {
    let git = git_dir(path)?;
    let head = fs::read_to_string(git.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref: ") {
        Some(reference) => Some(reference.strip_prefix("refs/heads/").unwrap_or(reference).to_owned()),
        None => Some(head.chars().take(7).collect()),
    }
}

/// Local branches of the repository containing `path`, sorted.
pub fn git_branches(path: &Path) -> Vec<String> {
    let Some(git) = git_dir(path) else { return Vec::new() };
    // Linked worktrees keep refs in the main repository's git dir.
    let common = fs::read_to_string(git.join("commondir"))
        .map(|c| git.join(c.trim()))
        .unwrap_or_else(|_| git.clone());
    let mut branches = Vec::new();
    collect_refs(&common.join("refs/heads"), "", &mut branches);
    if let Ok(packed) = fs::read_to_string(common.join("packed-refs")) {
        for line in packed.lines() {
            if let Some((_, name)) = line.split_once(" refs/heads/") {
                branches.push(name.to_owned());
            }
        }
    }
    branches.sort();
    branches.dedup();
    branches
}

fn collect_refs(dir: &Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = format!("{prefix}{}", entry.file_name().to_string_lossy());
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            collect_refs(&entry.path(), &format!("{name}/"), out);
        } else {
            out.push(name);
        }
    }
}

/// `.git` of the repository containing `path`; follows `gitdir:` files (worktrees).
fn git_dir(path: &Path) -> Option<PathBuf> {
    let mut current = Some(path);
    while let Some(dir) = current {
        let candidate = dir.join(".git");
        if candidate.is_dir() {
            return Some(candidate);
        }
        if let Ok(text) = fs::read_to_string(&candidate) {
            let target = PathBuf::from(text.trim().strip_prefix("gitdir: ")?);
            return Some(if target.is_absolute() { target } else { dir.join(target) });
        }
        current = dir.parent();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_branch_from_head_and_worktree_files() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("repo");
        fs::create_dir_all(repo.join(".git/refs/heads/feature")).unwrap();
        fs::write(repo.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::write(repo.join(".git/refs/heads/main"), "abc\n").unwrap();
        fs::write(repo.join(".git/refs/heads/feature/x"), "abc\n").unwrap();
        fs::write(repo.join(".git/packed-refs"), "# pack\nabc refs/heads/old\n").unwrap();
        fs::create_dir_all(repo.join("sub")).unwrap();
        assert_eq!(git_branch(&repo.join("sub")).as_deref(), Some("main"));
        assert_eq!(git_branches(&repo), ["feature/x", "main", "old"]);

        let worktree = dir.path().join("wt");
        fs::create_dir_all(repo.join(".git/worktrees/wt")).unwrap();
        fs::write(repo.join(".git/worktrees/wt/HEAD"), "0123456789abcdef\n").unwrap();
        fs::write(repo.join(".git/worktrees/wt/commondir"), "../..\n").unwrap();
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join(".git"), format!("gitdir: {}\n", repo.join(".git/worktrees/wt").display())).unwrap();
        assert_eq!(git_branch(&worktree).as_deref(), Some("0123456"));
        assert_eq!(git_branches(&worktree), ["feature/x", "main", "old"]);
    }
}
