import subprocess
import shutil
from pathlib import Path
from app.core.config import settings

class GitService:
    def __init__(self):
        """Initialize the Git Service using the path from our central settings."""
        self.storage_dir = Path(settings.REPO_STORAGE_DIR)
        # Automatically build the folders if they don't exist yet
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def parse_repo_url(self, url: str) -> str:
        """
        Converts an absolute URL like 'https://github.com/facebook/react' 
        into a safe directory name like 'facebook_react'.
        """
        clean_url = url.replace("https://github.com/", "").rstrip("/")
        return clean_url.replace("/", "_")

    def delete_repository_directory(self, path: Path):
        """
        Safely deletes a directory, handles read-only files on Windows.
        """
        import os
        import stat

        def remove_readonly(func, p, excinfo):
            try:
                os.chmod(p, stat.S_IWRITE)
                func(p)
            except Exception:
                pass

        if path.exists():
            shutil.rmtree(path, onerror=remove_readonly)

    def clone_repository(self, repo_url: str, github_token: str = None) -> Path:
        """
        Performs a rapid shallow clone of a GitHub repository.
        Supports authentication using OAuth tokens for private repositories.
        Returns the absolute Path to the local directory containing the code.
        """
        import re
        folder_name = self.parse_repo_url(repo_url)
        target_path = self.storage_dir / folder_name

        # If a copy already exists from a previous run, clear it out to prevent conflicts
        if target_path.exists():
            self.delete_repository_directory(target_path)

        # Reconstruct repo_url to include oauth token if present for private repos
        clone_url = repo_url
        if github_token and github_token != "mock_access_token":
            match = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", repo_url)
            if match:
                owner, repo_name = match.group(1), match.group(2)
                clone_url = f"https://x-oauth-basic:{github_token}@github.com/{owner}/{repo_name}.git"

        try:
            # We use '--depth 100' to download a window of the commit history.
            # This provides sufficient logs for timeline and ownership analytics while saving space.
            subprocess.run(
                ["git", "clone", "--depth", "100", clone_url, str(target_path)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            return target_path
            
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode().strip() if e.stderr else str(e)
            # Scrub the secret token from potential error messages to prevent leakage in log files
            if github_token:
                error_msg = error_msg.replace(github_token, "********")
            raise Exception(f"Failed to clone repository: {error_msg}")