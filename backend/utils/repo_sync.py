from __future__ import annotations

import subprocess
from datetime import datetime
from pathlib import Path

from .config import ROOT_DIR, get_settings


class RepoSyncError(RuntimeError):
    pass


def sync_project_to_render_branch(project_slug: str) -> dict[str, str]:
    settings = get_settings()
    project_path = ROOT_DIR / "project" / project_slug
    if not project_path.exists():
        raise RepoSyncError(f"待同步项目不存在: {project_path}")

    relative_project_path = str(project_path.relative_to(ROOT_DIR))
    status_result = _run_git(["status", "--short", "--", relative_project_path])
    changed = bool(status_result.stdout.strip())

    if not settings.render_git_push_enabled:
        if changed:
            raise RepoSyncError(
                "当前 project 只存在于主控实例本地，Render 无法直接读取。"
                "请开启 RENDER_GIT_PUSH_ENABLED 并配置 RENDER_GIT_REMOTE_URL，把生成项目先推到远端分支。"
            )
        return {"status": "skipped", "detail": "git_push_disabled"}
    if not settings.render_git_remote_url:
        raise RepoSyncError("Render 自动部署需要把生成项目推送到 Git 分支，但缺少 RENDER_GIT_REMOTE_URL。")
    if not settings.render_repo_branch:
        raise RepoSyncError("Render 自动部署需要明确目标分支，但缺少 RENDER_REPO_BRANCH。")
    if changed:
        _run_git(["add", "--", relative_project_path])
        commit_message = f"render deploy sync {project_slug} {datetime.utcnow().isoformat(timespec='seconds')}"
        commit_result = _run_git(
            [
                "-c",
                f"user.name={settings.render_git_author_name}",
                "-c",
                f"user.email={settings.render_git_author_email}",
                "commit",
                "-m",
                commit_message,
                "--",
                relative_project_path,
            ],
            allow_empty=False,
            allow_noop=True,
        )
        commit_status = "committed" if commit_result.returncode == 0 else "noop"
    else:
        commit_status = "noop"

    push_result = _run_git(
        ["push", settings.render_git_remote_url, f"HEAD:{settings.render_repo_branch}"],
        allow_empty=False,
    )
    return {
        "status": "pushed",
        "detail": push_result.stdout.strip() or push_result.stderr.strip() or commit_status,
    }


def _run_git(args: list[str], allow_empty: bool = True, allow_noop: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return result
    output = (result.stderr or result.stdout or "").strip()
    if allow_noop and "nothing to commit" in output.lower():
        return result
    if allow_empty:
        return result
    raise RepoSyncError(output or f"git {' '.join(args)} 执行失败")
