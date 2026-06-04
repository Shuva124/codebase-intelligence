import os
from pathlib import Path
from typing import List, Dict, Any
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

class CodeParserService:
    def __init__(self):
        # Maps file extensions to LangChain language definitions for optimal splitting
        self.extension_map = {
            ".py": Language.PYTHON,
            ".js": Language.JS,
            ".ts": Language.TS,
            ".tsx": Language.TS,
            ".jsx": Language.JS,
            ".go": Language.GO,
            ".cpp": Language.CPP,
            ".java": Language.JAVA,
        }

    def walk_repository(self, repo_path: Path) -> List[Path]:
        """Walks through the cloned repository and finds all supported source code files."""
        supported_files = []
        # Files or directories we want to skip entirely to save database space
        ignore_dirs = {".git", "node_modules", "venv", "__pycache__", "dist", "build"}

        for root, dirs, files in os.walk(repo_path):
            # Modifying dirs in-place allows os.walk to skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                file_path = Path(root) / file
                if file_path.suffix in self.extension_map:
                    supported_files.append(file_path)
                    
        return supported_files

    def parse_file(self, file_path: Path, repo_root: Path) -> List[Dict[str, Any]]:
        """
        Reads a code file and chunks it logically based on its programming language.
        Tracks file metadata so the AI always knows where a piece of code lives.
        """
        suffix = file_path.suffix
        language = self.extension_map.get(suffix)
        
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            return []

        # If the file is empty, skip it
        if not content.strip():
            return []

        # Use Language-Aware splitting to break code at natural points (like function boundaries)
        splitter = RecursiveCharacterTextSplitter.from_language(
            language=language, 
            chunk_size=1200, 
            chunk_overlap=200
        )
        
        chunks = splitter.split_text(content)
        parsed_chunks = []
        
        # Calculate a relative path so it looks clean (e.g., "src/components/Button.tsx")
        relative_path = str(file_path.relative_to(repo_root))

        for i, chunk in enumerate(chunks):
            parsed_chunks.append({
                "content": chunk,
                "metadata": {
                    "file_path": relative_path,
                    "file_name": file_path.name,
                    "extension": suffix,
                    "chunk_index": i
                }
            })
            
        return parsed_chunks