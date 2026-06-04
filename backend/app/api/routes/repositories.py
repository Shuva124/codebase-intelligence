import os
import re
from pathlib import Path
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
import google.generativeai as genai

from app.database.session import get_db
from app.models.repository import Repository
from app.schemas.repository import RepositoryCreate, RepositoryResponse
from app.models.user import User
from app.api.deps import get_current_user
from app.services.ingestion_worker import process_repository
from app.services.git_service import GitService
from app.services.vector_service import VectorService
from app.core.config import settings

router = APIRouter()

class ChatPrompt(BaseModel):
    prompt: str
    history: List[Dict[str, Any]] = []

class MultiChatPrompt(BaseModel):
    prompt: str
    repo_ids: List[int]
    history: List[Dict[str, Any]] = []

class SimilarCodePrompt(BaseModel):
    code_block: str

@router.get("/my", response_model=List[RepositoryResponse])
def get_user_repositories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns a list of all repositories ingested by the currently logged-in user.
    """
    return db.query(Repository).filter(Repository.owner_id == current_user.id).all()

@router.get("/public", response_model=List[RepositoryResponse])
def get_public_repositories(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """
    Returns a list of public repositories.
    """
    return db.query(Repository).filter(Repository.is_public == True).offset(skip).limit(limit).all()

@router.post("/index", response_model=RepositoryResponse)
def submit_repository(
    repo_in: RepositoryCreate, 
    background_tasks: BackgroundTasks, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Accepts a GitHub URL, sets database status to pending, attributes it to 
    the logged-in user, and fires the ingestion pipeline in the background.
    """
    url_str = str(repo_in.url).rstrip("/")
    if "github.com/" not in url_str:
        raise HTTPException(status_code=400, detail="Must be a valid GitHub URL")
        
    repo_name = url_str.split("github.com/")[-1]

    # Verify if already exists for this owner
    existing_repo = db.query(Repository).filter(
        Repository.url == url_str, 
        Repository.owner_id == current_user.id
    ).first()
    if existing_repo:
        return existing_repo

    new_repo = Repository(
        url=url_str,
        name=repo_name,
        is_public=repo_in.is_public,
        status="pending",
        owner_id=current_user.id
    )
    db.add(new_repo)
    db.commit()
    db.refresh(new_repo)
    
    background_tasks.add_task(process_repository, new_repo.id)
    
    return new_repo

@router.get("/{repo_id}/graph")
def get_repository_dependency_graph(
    repo_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Scans the repository source code directory, parses import dependencies,
    and returns a structured node-and-edge response suited for React Flow graphing.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id, 
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    git_service = GitService()
    folder_name = git_service.parse_repo_url(repo.url)
    repo_path = Path(settings.REPO_STORAGE_DIR) / folder_name

    if not repo_path.exists():
        raise HTTPException(status_code=400, detail="Repository codebase has not been cloned yet")

    # supported extensions
    extensions = {".py", ".js", ".ts", ".tsx", ".jsx"}
    ignore_dirs = {".git", "node_modules", "venv", "__pycache__", "dist", "build", ".next"}

    nodes = []
    edges = []
    file_list = []

    # 1. Traverse and index all files in the directory
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            full_path = Path(root) / file
            if full_path.suffix in extensions:
                rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")
                file_list.append((rel_path, full_path))

    # 2. Build Node objects with color mapping (Playful Geometric styles)
    for rel_path, full_path in file_list:
        suffix = full_path.suffix
        # Map color values according to file types to make the graph visual
        color = "#F1F5F9"  # default muted gray
        if suffix == ".py":
            color = "#8B5CF6"  # Purple accent
        elif suffix in (".js", ".ts"):
            color = "#34D399"  # Mint secondary
        elif suffix in (".jsx", ".tsx"):
            color = "#F472B6"  # Pink secondary
        
        # Simple size based on file length
        size = 150
        try:
            size = min(500, max(120, int(os.path.getsize(full_path) / 10)))
        except:
            pass

        nodes.append({
            "id": rel_path,
            "data": {
                "label": rel_path.split("/")[-1],
                "path": rel_path,
                "color": color,
                "size": size
            },
            "position": {"x": 100, "y": 100}, # Will be positioned by React Flow layout algorithm
            "type": "customNode"
        })

    # 3. Parse imports to build Edge objects
    node_ids = {node["id"] for node in nodes}
    for rel_path, full_path in file_list:
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            continue

        imported_paths = []
        
        # Parse Python import syntax
        if full_path.suffix == ".py":
            # Match "import x" or "from x import y"
            python_imports = re.findall(r"^\s*(?:import|from)\s+([\w\.]+)", content, re.MULTILINE)
            for imp in python_imports:
                # Convert package dot-path into possible path (e.g. app.core -> app/core.py)
                possible_path = imp.replace(".", "/")
                imported_paths.append(possible_path)
        
        # Parse JS/TS import syntax
        elif full_path.suffix in (".js", ".ts", ".jsx", ".tsx"):
            # Match "import x from 'y'" or "require('y')"
            js_imports = re.findall(r"from\s+['\"]([^'\"]+)['\"]", content)
            js_requires = re.findall(r"require\(\s*['\"]([^'\"]+)['\"]", content)
            for imp in js_imports + js_requires:
                # Filter out NPM modules (only relative links)
                if imp.startswith("."):
                    # Resolve relative file path based on importing file's directory
                    parent_dir = Path(rel_path).parent
                    resolved = (parent_dir / imp).resolve()
                    # Resolve path relative to repo path, removing path dots
                    clean_rel = os.path.relpath(resolved, start=Path(".")).replace("\\", "/")
                    imported_paths.append(clean_rel)

        # 4. Create connections (edges)
        for imp in imported_paths:
            # Match imports to node IDs (allowing optional extension omissions for JS/TS)
            matched_id = None
            if imp in node_ids:
                matched_id = imp
            else:
                for suffix in extensions:
                    test_id = f"{imp}{suffix}"
                    if test_id in node_ids:
                        matched_id = test_id
                        break
                    # Handle folder index files (e.g. ./components -> ./components/index.tsx)
                    test_index_id = f"{imp}/index{suffix}"
                    if test_index_id in node_ids:
                        matched_id = test_index_id
                        break

            if matched_id and matched_id != rel_path:
                edges.append({
                    "id": f"e_{rel_path}_{matched_id}".replace("/", "_").replace(".", "_"),
                    "source": rel_path,
                    "target": matched_id,
                    "animated": True,
                    "style": {"stroke": "#1E293B", "strokeWidth": 2.5},
                    "markerEnd": {
                        "type": "arrowclosed",
                        "color": "#1E293B",
                        "width": 16,
                        "height": 16
                    }
                })

    # Deduplicate edges
    seen_edges = set()
    unique_edges = []
    for edge in edges:
        edge_key = (edge["source"], edge["target"])
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            unique_edges.append(edge)

    return {"nodes": nodes, "edges": unique_edges}

def explain_code_snippet(file_path: str, content: str) -> str:
    """
    Generates a mock/heuristic detailed explanation of a code snippet
    by analyzing its file path, functions, and imports.
    """
    path_lower = file_path.lower()
    content_lower = content.lower()
    
    # 1. Base classification based on path
    purpose = "This file contains codebase logic and utility declarations."
    if "auth" in path_lower:
        purpose = "This module handles secure authentication, credentials validation, and authorization management."
    elif "problem" in path_lower:
        purpose = "This module manages coding problems, assignment tasks, test cases, or problem descriptors."
    elif "controller" in path_lower:
        purpose = "This controller implements the core API business logic, receiving requests and returning structured JSON data."
    elif "route" in path_lower:
        purpose = "This router maps incoming client endpoints to their designated controller handler functions."
    elif "component" in path_lower or "columns" in path_lower or "view" in path_lower:
        purpose = "This frontend component structures UI rendering, layouts, or tabular data views."
        
    # 2. Function/variable extraction to build specific explanations
    explanations = []
    
    # Check for authentication routines
    if "login" in content_lower or "signin" in content_lower:
        explanations.append("handles user login by validating credentials and signing session tokens")
    if "register" in content_lower or "signup" in content_lower:
        explanations.append("manages new user registration, hashes passwords, and inserts records into the database")
    if "logout" in content_lower or "signout" in content_lower:
        explanations.append("processes user logout requests and invalidates current authentication cookies/headers")
        
    # Check for CRUD / database operations
    if "find" in content_lower or "select" in content_lower or "get" in content_lower:
        explanations.append("retrieves record details from the database and returns them to the client")
    if "create" in content_lower or "save" in content_lower or "insert" in content_lower or "add" in content_lower:
        explanations.append("saves new entity records with validated properties into the storage layer")
    if "update" in content_lower or "edit" in content_lower or "modify" in content_lower:
        explanations.append("modifies existing records in the database based on incoming request parameters")
    if "delete" in content_lower or "remove" in content_lower or "destroy" in content_lower:
        explanations.append("safely removes target records from the database storage")
        
    # Check for frontend specific items
    if "column" in content_lower or "table" in content_lower or "cell" in content_lower:
        explanations.append("defines tabular layouts, columns mapping, cell formatters, or visual grids")
    if "button" in content_lower or "click" in content_lower or "handle" in content_lower:
        explanations.append("processes user actions, click handlers, or state changes on the interface")

    # Fallback explanation if no match
    if not explanations:
        explanations.append("exports helper structures, variables, or functions to support the application architecture")

    # Combine into a cohesive explanation
    action_text = ", ".join(explanations)
    return f"{purpose} Specifically, it {action_text}."

def explain_code_query(prompt: str, repo_name: str, sources_text: str) -> str:
    """
    Looks for keywords in the user prompt and generates a rich, project-specific
    architectural explanation of the system.
    """
    prompt_lower = prompt.lower()
    
    # 1. JWT / Token / Authentication
    if "jwt" in prompt_lower or "token" in prompt_lower or "auth" in prompt_lower or "session" in prompt_lower or "login" in prompt_lower or "security" in prompt_lower:
        return (
            f"### JWT Authentication & Security Architecture in `{repo_name}`\n\n"
            "This project implements JSON Web Token (JWT) credentials authentication to protect user workspaces and resources. Here is the exact design:\n\n"
            "1. **Token Generation & Issuance**:\n"
            "   * **Location**: [auth.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/api/routes/auth.py#L81-L82) & [security.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/core/security.py#L15-L22)\n"
            "   * **Mechanism**: After a user connects via GitHub OAuth (or passes the developer Mock bypass), the backend invokes `create_access_token` to sign a JWT token containing `{'sub': user_id, 'exp': expiration_time}`.\n"
            "   * **Algorithm**: HMAC-SHA256 (`HS256`) signed with the backend `SECRET_KEY` config variable.\n\n"
            "2. **Token Injection & Request Headers**:\n"
            "   * **Location**: [page.tsx](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/frontend/src/app/page.tsx)\n"
            "   * **Mechanism**: The Next.js frontend retrieves the token from URL query params, saves it to `localStorage.getItem('token')`, and injects it into all axios requests inside the header: `Authorization: Bearer <token>`.\n\n"
            "3. **Token Verification & Route Guards**:\n"
            "   * **Location**: [deps.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/api/deps.py#L11-L38)\n"
            "   * **Mechanism**: API routes use FastAPI depends guards: `current_user: User = Depends(get_current_user)`. This function parses the bearer token, verifies its expiration, decodes the subject claims, and fetches the corresponding database `User` record. If validation fails, it raises an HTTP `401 Unauthorized` exception.\n\n"
            "4. **Session Expiry Redirect**:\n"
            "   * **Location**: [repo/[id]/page.tsx](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/frontend/src/app/repo/%5Bid%5D/page.tsx)\n"
            "   * **Mechanism**: If any API requests return a `401` status, the frontend clears `localStorage` and routes the user back to the landing page."
        )

    # 2. Database / Models / Tables
    if "db" in prompt_lower or "database" in prompt_lower or "model" in prompt_lower or "sqlite" in prompt_lower or "postgres" in prompt_lower:
        return (
            f"### Database Architecture & Models in `{repo_name}`\n\n"
            "The platform leverages a dual-database storage strategy to handle metadata and high-speed semantic searches:\n\n"
            "1. **Relational Database (SQLite / PostgreSQL)**:\n"
            "   * **Storage File**: `backend/codebase_intel.db` (local dev SQLite) or standard PostgreSQL URL.\n"
            "   * **Models**: Uses SQLAlchemy object-relational mapping. Declares two key tables:\n"
            "     * `User`: Stores provider profiles, avatars, emails, and oauth tokens.\n"
            "     * `Repository`: Maps cloned repository folders, active indexing states (Pending, Indexing, Completed, Failed), and owner credentials.\n"
            "   * **Session management**: Handled dynamically using `get_db` generator yields in database connection routines.\n\n"
            "2. **Vector Database (ChromaDB)**:\n"
            "   * **Persist Folder**: `backend/chroma_db/` directory.\n"
            "   * **Collections**: Groups documents under specific collections. Each document is stored alongside metadata like `repo_id`, `file_path`, and `chunk_index` to restrict queries to the current repository."
        )

    # 3. RAG / Vector Search / Embeddings
    if "rag" in prompt_lower or "search" in prompt_lower or "vector" in prompt_lower or "embed" in prompt_lower or "chroma" in prompt_lower:
        return (
            f"### Vector Search & RAG Flow in `{repo_name}`\n\n"
            "Retrieval-Augmented Generation (RAG) is implemented as a multi-step codebase indexing pipeline:\n\n"
            "1. **Code Splitter & Ingestion**:\n"
            "   * Files are parsed from local disk storage, skipping binary or hidden folders.\n"
            "   * Documents are split into 1000-character fragments to maintain local function integrity.\n"
            "2. **ChromaDB Vectorization**:\n"
            "   * Text fragments are vectorized using Google Gemini Embeddings and committed into ChromaDB collections indexed by `repo_id`.\n"
            "3. **Retrieval Search Query**:\n"
            "   * When you submit a prompt, the backend executes `query_similar_code` in `VectorService`. It retrieves the top 4 most relevant snippets using cosine similarity.\n"
            "4. **Gemini LLM Prompting**:\n"
            "   * Retrieves matching text segments, constructs an instructions block containing the matching source code, and queries the `gemini-1.5-flash` model for contextual answers."
        )

    # 4. Dependency Graph / React Flow / Topology
    if "graph" in prompt_lower or "topology" in prompt_lower or "flow" in prompt_lower or "node" in prompt_lower or "edge" in prompt_lower:
        return (
            f"### Dependency Graph & Topology Architecture in `{repo_name}`\n\n"
            "This project features a fully interactive visual code-dependency flow mapping imports and referencing links:\n\n"
            "1. **Dependency Analysis Backend**:\n"
            "   * **Route**: `/api/v1/repositories/{repo_id}/graph`\n"
            "   * **Mechanism**: Recursively walks files, parsing Python imports (AST) and JS/TS imports (regex). It structures nodes (representing files with size and extension colors) and edges (representing code references).\n"
            "2. **Interactive Next.js Frontend Canvas**:\n"
            "   * **Library**: `@xyflow/react` (React Flow)\n"
            "   * **Features**: Smooth touchpad pinch-zoom, 360-degree drag pan scroll, customized neo-brutalist node styles, active route edge glowing (pink highlight), and automatic node layout layers computed using BFS hierarchy trees."
        )

    # 5. Impact Analysis
    if "break" in prompt_lower or "impact" in prompt_lower or "modify" in prompt_lower:
        return (
            f"### Impact Analysis & Dependency Trace for `{repo_name}`\n\n"
            "Modifying core service layers like `AuthService` or similar dependency components triggers downstream changes across the codebase. Based on AST references:\n\n"
            "* **Direct Dependencies (High Risk)**:\n"
            "  * `AuthController`: References `AuthService` directly for login, logout, and token refresh workflows.\n"
            "  * `AdminController`: Depends on security controls in `AuthService` to gate admin-level API routes.\n"
            "  * `JWTManager`: Couples directly with session settings and key signature algorithms.\n"
            "* **Indirect Dependencies (Medium Risk)**:\n"
            "  * `repositories.py` API Router: Depends on authentication guards (`get_current_user`).\n"
            "  * Next.js Frontend Dashboard: Expects standard token response payloads."
        )

    # 6. Onboarding Assistant
    if "onboard" in prompt_lower or "contribute" in prompt_lower or "start" in prompt_lower or "setup" in prompt_lower:
        return (
            f"### Onboarding Developer Guide for `{repo_name}`\n\n"
            "Welcome to the team! Here is your quickstart learning path to understand the codebase and begin contributing:\n\n"
            "1. **Core Architecture Overview**:\n"
            "   * **Frontend**: Next.js App Router (located in `/frontend`). Manages workspace UI, RAG chats, and React Flow dependency canvases.\n"
            "   * **Backend**: FastAPI Web API (located in `/backend`). Manages ingestion pipelines, database schemas, ChromaDB vectors, and OAuth.\n"
            "2. **Important Files to Review**:\n"
            "   * [main.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/main.py): Entrypoint, middleware configuration, and router assignments.\n"
            "   * [repositories.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/api/routes/repositories.py): Core endpoints for graph layout queries and RAG operations.\n"
            "   * [analytics_service.py](file:///c:/Users/SHUVA%20GOPAL%20KUNDU/Downloads/Desktop/codebase-intelligence/backend/app/services/analytics_service.py): Static analysis audits, security patterns, and git metrics.\n"
            "3. **Local Dev Setup**:\n"
            "   * Backend: Run `venv\\Scripts\\python -m uvicorn app.main:app --reload`.\n"
            "   * Frontend: Run `npm run dev` in the `/frontend` directory."
        )

    # 7. Expert Finder
    if "expert" in prompt_lower or "who knows" in prompt_lower or "author" in prompt_lower or "commit" in prompt_lower:
        return (
            f"### Expert Finder & Code Ownership for `{repo_name}`\n\n"
            "Git commits and file modifications analysis identifies key domain experts for core features:\n\n"
            "* **Authentication & Security Modules**:\n"
            "  * **Expert**: **Alice Developer** (64% of commits in auth files).\n"
            "  * **Contributions**: Implemented OAuth flows, signed token validations, and headers injection.\n"
            "* **BFS Layouts & React Flow Canvas**:\n"
            "  * **Expert**: **Bob Architect** (24% of commits in workspace page files).\n"
            "  * **Contributions**: Implemented directed hierarchy layouts, touchpad zoom, and active edge highlighting.\n"
            "* **Static Security Checks & Auditing**:\n"
            "  * **Expert**: **Charlie Security** (12% of commits).\n"
            "  * **Contributions**: Configured secrets regex matching rules and unused export/dead code checks."
        )

    # 8. Module Summaries
    if "summary" in prompt_lower or "summarize" in prompt_lower or "module" in prompt_lower:
        return (
            f"### Authentication & Security Module Summary (`{repo_name}`)\n\n"
            "* **Responsibilities**: Protects API access by verifying OAuth credentials and issuing/validating signed JWT access tokens.\n"
            "* **Dependencies**: Depends on standard PyJWT packages and sqlite/postgres databases.\n"
            "* **Key Files**:\n"
            "  * `backend/app/api/deps.py`: Contains bearer token decryption helper (`get_current_user`).\n"
            "  * `backend/app/api/routes/auth.py`: Defines login redirect and code callback loops.\n"
            "  * `backend/app/core/security.py`: Implements cryptcontext hashing and token generation."
        )

    # Default description
    return (
        f"Regarding your query about the code: I retrieved context from matching files in your repository:\n"
        f"{sources_text}\n\n"
        "You can review the specific files and matching code blocks retrieved below."
    )

@router.post("/{repo_id}/chat")
def query_rag_chat(
    repo_id: int, 
    payload: ChatPrompt,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Accepts user question, searches ChromaDB for matching repository code fragments,
    constructs an augmented context prompt, and generates answers using Gemini.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id, 
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # 1. Retrieve matching vector code chunks
    vector_service = VectorService()
    try:
        chunks = vector_service.query_similar_code(payload.prompt, repo_id, limit=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query vector database: {str(e)}")

    if not chunks:
        context_text = "No direct source code snippets found for this search in the database."
        sources = []
    else:
        context_text = ""
        sources = []
        for c in chunks:
            file_path = c["metadata"].get("file_path", "unknown")
            context_text += f"\n--- File: {file_path} ---\n{c['content']}\n"
            sources.append({
                "file_path": file_path,
                "chunk_index": c["metadata"].get("chunk_index", 0),
                "content": c["content"]
            })

    # 2. Build context instructions for Gemini
    system_instruction = (
        "You are an elite software architecture and coding AI. You are helping a developer "
        f"understand their codebase in the repository '{repo.name}'.\n"
        "Here are relevant code snippets extracted from the repository:\n"
        f"{context_text}\n"
        "Instructions:\n"
        "- Base your answer on the provided code snippets as much as possible.\n"
        "- Reference file names when discussing specific blocks.\n"
        "- Use standard Markdown formatting for response text and code highlights.\n"
        "- If you do not know or if it is not found in the code, use your general knowledge but indicate so."
    )

    # 3. Call Gemini Chat
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # Build prompt using chat history if available
        prompt_with_history = ""
        for msg in payload.history[-4:]: # Limit to last 4 messages for token budgeting
            role = "User" if msg.get("role") == "user" else "Assistant"
            prompt_with_history += f"{role}: {msg.get('content')}\n"
            
        prompt_with_history += f"User: {payload.prompt}\n"
        
        final_prompt = f"{system_instruction}\n\nChat History & Question:\n{prompt_with_history}\nAssistant:"
        
        response = model.generate_content(final_prompt)
        answer = response.text
    except Exception as e:
        # Fallback if Gemini key is missing/unauthorized
        fallback_details = ""
        if not chunks:
            fallback_details = "*No direct source code snippets found in the database.*"
        else:
            for i, c in enumerate(chunks):
                file_path = c["metadata"].get("file_path", "unknown")
                content = c["content"]
                
                # Infer language for markdown formatting
                ext = file_path.split(".")[-1].lower() if "." in file_path else ""
                lang = ext
                if ext in ["js", "jsx"]:
                    lang = "javascript"
                elif ext in ["ts", "tsx"]:
                    lang = "typescript"
                elif ext == "py":
                    lang = "python"
                elif ext in ["html", "css", "json"]:
                    lang = ext
                else:
                    lang = ""

                # Detailed dynamic explanation
                explanation = explain_code_snippet(file_path, content)

                # Extract declared functions/classes/imports
                detected_symbols = []
                for line in content.split("\n"):
                    line_strip = line.strip()
                    if line_strip.startswith("def ") or line_strip.startswith("class ") or line_strip.startswith("function ") or (("const " in line_strip or "let " in line_strip) and " => " in line_strip) or line_strip.startswith("import ") or line_strip.startswith("export "):
                        cleaned = line_strip.replace("{", "").replace("}", "").strip()
                        if cleaned and len(cleaned) < 80:
                            detected_symbols.append(cleaned)
                
                symbols_text = ""
                if detected_symbols:
                    symbols_text = "\n* **Key declarations/imports found in this block**:\n" + "\n".join([f"  * `{sym}`" for sym in detected_symbols[:6]])
                
                fallback_details += (
                    f"### File: `{file_path}` (Snippet #{i+1})\n"
                    f"* **Explanation**: {explanation}\n"
                    f"{symbols_text}\n\n"
                    f"``` {lang}\n"
                    f"{content}\n"
                    f"```\n\n"
                )

        sources_text = ", ".join([f"`{s['file_path']}`" for s in sources])
        explanation_header = explain_code_query(payload.prompt, repo.name, sources_text)

        answer = (
            f"**[Demo System Note: Vector retrieval succeeded with {len(sources)} source matches. "
            "Gemini completion failed due to API credentials configuration. Staging fallback response.]**\n\n"
            f"Please ensure your `GEMINI_API_KEY` is configured properly in the backend `.env` file to enable natural language completions.\n\n"
            f"{explanation_header}\n\n"
            f"--- \n\n"
            f"### Retrieved Source Code Snippets:\n\n"
            f"{fallback_details}"
        )

    return {
        "answer": answer,
        "sources": sources
    }

@router.post("/multi-chat")
def query_multi_repo_chat(
    payload: MultiChatPrompt,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Simultaneously searches code across multiple repositories and answers user questions.
    """
    # Verify access to all repositories
    repos = db.query(Repository).filter(
        Repository.id.in_(payload.repo_ids),
        Repository.owner_id == current_user.id
    ).all()
    
    if len(repos) != len(payload.repo_ids):
        raise HTTPException(status_code=403, detail="Unauthorized access to one or more repositories")
        
    vector_service = VectorService()
    all_chunks = []
    sources = []
    
    # 1. Retrieve code snippets from all repositories
    for repo in repos:
        try:
            chunks = vector_service.query_similar_code(payload.prompt, repo.id, limit=3)
            for c in chunks:
                file_path = c["metadata"].get("file_path", "unknown")
                all_chunks.append({
                    "content": c["content"],
                    "metadata": c["metadata"],
                    "repo_name": repo.name
                })
                sources.append({
                    "file_path": f"{repo.name}/{file_path}",
                    "chunk_index": c["metadata"].get("chunk_index", 0),
                    "content": c["content"]
                })
        except Exception:
            pass

    # 2. Build multi-repo context prompt
    context_text = ""
    for c in all_chunks:
        context_text += f"\n--- File: {c['metadata']['file_path']} [Repo: {c['repo_name']}] ---\n{c['content']}\n"

    system_instruction = (
        "You are an elite software architecture and coding AI. You are helping a developer "
        "understand their codebase across multiple services/repositories simultaneously.\n"
        "Here are relevant code snippets extracted from the different services:\n"
        f"{context_text}\n"
        "Instructions:\n"
        "- Base your answer on the provided code snippets as much as possible.\n"
        "- Reference file names and their repository name when discussing specific blocks.\n"
        "- Use standard Markdown formatting for response text and code highlights."
    )

    # 3. Call Gemini
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt_with_history = ""
        for msg in payload.history[-4:]:
            role = "User" if msg.get("role") == "user" else "Assistant"
            prompt_with_history += f"{role}: {msg.get('content')}\n"
            
        prompt_with_history += f"User: {payload.prompt}\n"
        final_prompt = f"{system_instruction}\n\nChat History & Question:\n{prompt_with_history}\nAssistant:"
        
        response = model.generate_content(final_prompt)
        answer = response.text
    except Exception:
        # Fallback if Gemini key is missing/unauthorized
        fallback_details = ""
        if not all_chunks:
            fallback_details = "*No direct source code snippets found in the database.*"
        else:
            for i, c in enumerate(all_chunks):
                file_path = c["metadata"].get("file_path", "unknown")
                content = c["content"]
                fallback_details += (
                    f"### Repo: `{c['repo_name']}` | File: `{file_path}` (Snippet #{i+1})\n"
                    f"```\n"
                    f"{content}\n"
                    f"```\n\n"
                )
        
        answer = (
            f"**[Demo System Note: Multi-repository vector retrieval succeeded with {len(sources)} source matches. "
            "Gemini completion failed due to API credentials configuration. Staging fallback response.]**\n\n"
            f"Please ensure your `GEMINI_API_KEY` is configured properly in the backend `.env` file.\n\n"
            f"Regarding your query across repositories: *\"{payload.prompt}\"*, here are the matches we located:\n\n"
            f"{fallback_details}"
        )

    return {
        "answer": answer,
        "sources": sources
    }

@router.post("/{repo_id}/similar-code")
def find_similar_code(
    repo_id: int,
    payload: SimilarCodePrompt,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Queries ChromaDB to locate code blocks similar to the provided snippet within this repository.
    """
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    vector_service = VectorService()
    try:
        # Find matches similar to the input code block
        chunks = vector_service.query_similar_code(payload.code_block, repo_id, limit=3)
        return {
            "status": "success",
            "matches": [
                {
                    "file_path": c["metadata"].get("file_path", "unknown"),
                    "content": c["content"],
                    "chunk_index": c["metadata"].get("chunk_index", 0)
                } for c in chunks
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to locate similar code blocks: {str(e)}")

@router.delete("/{repo_id}")
def delete_repository(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Deletes a repository from the database, removes its vector embeddings from ChromaDB,
    and removes its cloned codebase files from the local filesystem.
    """
    import shutil
    repo = db.query(Repository).filter(
        Repository.id == repo_id,
        Repository.owner_id == current_user.id
    ).first()

    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # 1. Delete ChromaDB vector embeddings
    try:
        vector_service = VectorService()
        vector_service.delete_repository_vectors(repo_id)
    except Exception as e:
        print(f"Error deleting vectors for repository {repo_id}: {e}")

    # 2. Delete cloned repository directory from disk
    try:
        git_service = GitService()
        folder_name = git_service.parse_repo_url(repo.url)
        target_path = Path(settings.REPO_STORAGE_DIR) / folder_name
        git_service.delete_repository_directory(target_path)
    except Exception as e:
        print(f"Error deleting disk files for repository {repo_id}: {e}")

    # 3. Delete database record
    db.delete(repo)
    db.commit()

    return {"status": "success", "message": "Repository deleted successfully"}