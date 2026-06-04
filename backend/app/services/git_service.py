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

    def clone_repository(self, repo_url: str) -> Path:
        """
        Performs a rapid shallow clone of a GitHub repository.
        Returns the absolute Path to the local directory containing the code.
        """
        folder_name = self.parse_repo_url(repo_url)
        target_path = self.storage_dir / folder_name

        # If a copy already exists from a previous run, clear it out to prevent conflicts
        if target_path.exists():
            shutil.rmtree(target_path)

        try:
            # We use '--depth 1' to download only the final snapshot of the code.
            # This skips downloading the entire git commit history, saving massive disk space.
            subprocess.run(
                ["git", "clone", "--depth", "1", repo_url, str(target_path)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            return target_path
            
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode().strip() if e.stderr else str(e)
            raise Exception(f"Failed to clone repository: {error_msg}")