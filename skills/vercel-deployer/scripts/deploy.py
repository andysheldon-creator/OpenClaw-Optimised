#!/usr/bin/env python3
import os
import sys
import argparse
import subprocess
import json
import shutil
import urllib.request
import urllib.error
from pathlib import Path

# --- CONFIGURATION ---
# Base domain for your aliases
BASE_DOMAIN = "opie.website"
# Directory where the bot will store source files before deploying
WORK_DIR = os.path.expanduser("~/clawd/deployments")

def setup_project_dir(project_name, html_content):
    """Creates the directory and index.html file."""
    project_path = Path(WORK_DIR) / project_name
    
    # Create fresh directory (overwrite if exists to ensure clean state)
    if project_path.exists():
        shutil.rmtree(project_path)
    project_path.mkdir(parents=True, exist_ok=True)

    # Write the HTML file
    with open(project_path / "index.html", "w", encoding="utf-8") as f:
        f.write(html_content)

    # Create a basic vercel.json to ensure static configuration
    vercel_config = {
        "name": project_name,
        "version": 2,
        "builds": [{"src": "index.html", "use": "@vercel/static"}]
    }
    with open(project_path / "vercel.json", "w", encoding="utf-8") as f:
        json.dump(vercel_config, f, indent=2)

    return project_path

def disable_sso_protection(project_name, token):
    """Disables SSO protection on the project so custom domains work publicly."""
    try:
        url = f"https://api.vercel.com/v9/projects/{project_name}"
        data = json.dumps({"ssoProtection": None}).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, method='PATCH')
        req.add_header('Authorization', f'Bearer {token}')
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode('utf-8'))
            if result.get('ssoProtection') is None:
                print(f"SSO protection disabled for {project_name}")
                return True
    except urllib.error.HTTPError as e:
        print(f"Warning: Could not disable SSO protection: {e.code}")
    except Exception as e:
        print(f"Warning: Could not disable SSO protection: {str(e)}")
    return False

def run_vercel_deploy(project_path, project_name):
    """Runs the Vercel CLI to deploy the project."""
    
    # Check for Token
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        return {"error": "VERCEL_TOKEN environment variable is missing."}

    # 1. DEPLOY (Production)
    # We use --prod to ensure it's a "production" deployment which stays active
    # We use --yes to skip confirmation prompts
    cmd = ["vercel", "deploy", "--prod", "--yes", "--token", token]
    
    # If a specific Team/Scope is required, add it here
    scope = os.environ.get("VERCEL_SCOPE")
    if scope:
        cmd.extend(["--scope", scope])

    try:
        print(f"Deploying {project_name} to Vercel...")
        result = subprocess.run(
            cmd,
            cwd=project_path,
            capture_output=True,
            text=True,
            check=True
        )
        deployment_url = result.stdout.strip()
        
        # 2. DISABLE SSO PROTECTION (so custom domains work publicly)
        disable_sso_protection(project_name, token)
        
        # 3. ALIAS (Optional but requested)
        # Attempt to alias to project-name.opie.website
        custom_url = f"{project_name}.{BASE_DOMAIN}"
        alias_cmd = ["vercel", "alias", "set", deployment_url, custom_url, "--token", token]
        if scope:
            alias_cmd.extend(["--scope", scope])

        try:
            subprocess.run(alias_cmd, cwd=project_path, capture_output=True, check=True)
            final_url = f"https://{custom_url}"
        except subprocess.CalledProcessError:
            # Fallback if the user doesn't own the domain on Vercel or DNS isn't set
            print("Warning: Domain aliasing failed. Returning default Vercel URL.")
            final_url = deployment_url

        return {
            "status": "success",
            "project": project_name,
            "url": final_url,
            "deploy_path": str(project_path)
        }

    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": e.stderr}

def main():
    parser = argparse.ArgumentParser(description="Deploy HTML content to Vercel.")
    parser.add_argument("--name", required=True, help="The slug/name of the project (e.g. q1-report)")
    parser.add_argument("--content", required=True, help="The full HTML content string")
    
    args = parser.parse_args()
    
    # 1. Setup Files
    try:
        path = setup_project_dir(args.name, args.content)
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"File system error: {str(e)}"}))
        sys.exit(1)

    # 2. Deploy
    result = run_vercel_deploy(path, args.name)
    
    # 3. Output Result JSON
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
