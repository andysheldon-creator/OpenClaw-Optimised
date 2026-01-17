Vercel Deployer Skill for Clawdbot

This skill enables your Clawdbot to instantly deploy static landing pages, charts, and reports to Vercel.

1. Installation

Ensure npm is installed on your Mac Mini.

Install the Vercel CLI globally:

npm install -g vercel


Copy this folder (vercel-deployer) into your skills directory:
~/clawd/skills/vercel-deployer/

2. Configuration (Critical)

You must generate a Vercel Token so the bot can deploy without typing a password.

Go to your Vercel Account Settings > Tokens.

Create a token named "Clawdbot".

Add this token to your Clawdbot's environment variables.

Option A: .env file (if supported by your Clawdbot setup)

VERCEL_TOKEN=your_token_here_xyz
# Optional: If opie.website is owned by a team, find your Team ID in Vercel Settings
# VERCEL_SCOPE=team_12345


Option B: System Environment (Mac Mini)
Add this to your ~/.zshrc:

export VERCEL_TOKEN="your_token_here_xyz"


3. Domain Usage

By default, the script attempts to create URLs like:
https://[project-name].opie.website

Requirement: Ensure opie.website is added to your Vercel Domains and the nameservers are pointing to Vercel. This allows wildcard subdomains or automatic aliasing to work.

If the alias fails (e.g., DNS issues), the bot will gracefully return the default https://[project-name].vercel.app URL.