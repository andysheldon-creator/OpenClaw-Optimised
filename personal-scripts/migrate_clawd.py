#!/usr/bin/env python3
"""
Migrate from ~/.clawd to ~/clawd and update all cron job paths.
This consolidates everything to use ~/clawd as the single source of truth.
"""
import json
import shutil
import os
from pathlib import Path

JOBS_FILE = Path.home() / ".clawdbot/cron/jobs.json"
OLD_CLAWD = Path.home() / ".clawd"
NEW_CLAWD = Path.home() / "clawd"

def migrate_paths_in_jobs():
    """Update all job message paths from ~/.clawd to ~/clawd"""
    with open(JOBS_FILE, 'r') as f:
        data = json.load(f)
    
    updated = 0
    for job in data.get('jobs', []):
        msg = job['payload'].get('message', '')
        if '/.clawd' in msg:
            # Replace paths
            new_msg = msg.replace('/Users/steve/.clawd/scripts/', '/Users/steve/clawd/personal-scripts/')
            new_msg = new_msg.replace('/Users/steve/.clawd/skills/', '/Users/steve/clawd/skills/')
            new_msg = new_msg.replace('cd /Users/steve/.clawd &&', 'cd /Users/steve/clawd &&')
            new_msg = new_msg.replace('cd /Users/steve/.clawd ', 'cd /Users/steve/clawd ')
            
            if new_msg != msg:
                job['payload']['message'] = new_msg
                print(f"✓ Updated paths in: {job['name']}")
                updated += 1
    
    with open(JOBS_FILE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return updated

def migrate_skills():
    """Move personal skills from ~/.clawd/skills to ~/clawd/skills"""
    old_skills = OLD_CLAWD / "skills"
    new_skills = NEW_CLAWD / "skills"
    
    if not old_skills.exists():
        print("No skills to migrate from ~/.clawd/skills")
        return 0
    
    migrated = 0
    for skill_dir in old_skills.iterdir():
        if skill_dir.name.startswith('.'):
            continue
        if skill_dir.is_dir():
            dest = new_skills / skill_dir.name
            if dest.exists():
                print(f"⚠️  Skill already exists, skipping: {skill_dir.name}")
            else:
                shutil.copytree(skill_dir, dest)
                print(f"✓ Migrated skill: {skill_dir.name}")
                migrated += 1
    
    return migrated

def migrate_data():
    """Move data files from ~/.clawd/data to ~/clawd/data"""
    old_data = OLD_CLAWD / "data"
    new_data = NEW_CLAWD / "data"
    
    if not old_data.exists():
        print("No data to migrate from ~/.clawd/data")
        return 0
    
    new_data.mkdir(exist_ok=True)
    migrated = 0
    for item in old_data.iterdir():
        if item.name.startswith('.'):
            continue
        dest = new_data / item.name
        if dest.exists():
            print(f"⚠️  Data file already exists, skipping: {item.name}")
        else:
            shutil.copy2(item, dest)
            print(f"✓ Migrated data: {item.name}")
            migrated += 1
    
    return migrated

def main():
    print("=" * 50)
    print("Migrating from ~/.clawd to ~/clawd")
    print("=" * 50)
    
    # 1. Migrate skills
    print("\n[1/3] Migrating personal skills...")
    skills_migrated = migrate_skills()
    
    # 2. Migrate data
    print("\n[2/3] Migrating data files...")
    data_migrated = migrate_data()
    
    # 3. Update job paths
    print("\n[3/3] Updating cron job paths...")
    jobs_updated = migrate_paths_in_jobs()
    
    print("\n" + "=" * 50)
    print(f"Migration complete!")
    print(f"  Skills migrated: {skills_migrated}")
    print(f"  Data files migrated: {data_migrated}")
    print(f"  Jobs updated: {jobs_updated}")
    print("=" * 50)
    
    if skills_migrated > 0 or data_migrated > 0:
        print("\n⚠️  Remember to:")
        print("  1. git add/commit the migrated files in ~/clawd")
        print("  2. Delete ~/.clawd after confirming everything works")

if __name__ == "__main__":
    main()
