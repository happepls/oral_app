#!/usr/bin/env python3
"""Download wheels for Python 3.9 and Linux platform"""

import subprocess
import sys
import os

def download_wheels():
    """Download all dependencies as wheels for Python 3.9"""
    
    # Read requirements
    with open('requirements.txt', 'r') as f:
        requirements = [line.strip() for line in f.readlines() if line.strip() and not line.startswith('#')]
    
    wheels_dir = 'wheels'
    
    # Create/clean wheels directory
    if os.path.exists(wheels_dir):
        subprocess.run(['rm', '-rf', wheels_dir])
    os.makedirs(wheels_dir)
    
    print(f"Downloading {len(requirements)} dependencies...")
    
    # Download each dependency
    for req in requirements:
        print(f"Downloading {req}...")
        
        # Try to download with specific platform first
        cmd = [
            sys.executable, '-m', 'pip', 'download',
            '--only-binary=:all:',
            '--platform', 'manylinux2014_x86_64',
            '--python-version', '3.9',  # Changed to 3.9
            '--implementation', 'cp',
            '--abi', 'cp39',  # Changed to cp39
            '--no-deps',
            '--dest', wheels_dir,
            req
        ]
        
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            print(f"✓ Successfully downloaded {req}")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to download {req} with specific platform, trying without platform restrictions...")
            # Fallback: try without platform restrictions
            fallback_cmd = [
                sys.executable, '-m', 'pip', 'download',
                '--only-binary=:all:',
                '--python-version', '3.9',  # Still use Python 3.9
                '--implementation', 'cp',
                '--abi', 'cp39',  # Still use cp39
                '--no-deps',
                '--dest', wheels_dir,
                req
            ]
            
            try:
                subprocess.run(fallback_cmd, check=True, capture_output=True)
                print(f"✓ Successfully downloaded {req} (fallback method)")
            except subprocess.CalledProcessError as e2:
                print(f"✗ Completely failed to download {req}")
                print(f"Error: {e2.stderr.decode() if e2.stderr else 'Unknown error'}")
                return False
    
    print("\nAll dependencies downloaded successfully!")
    
    # List downloaded files
    print("\nDownloaded files:")
    for file in sorted(os.listdir(wheels_dir)):
        if file.endswith('.whl'):
            print(f"  {file}")
    
    return True

if __name__ == "__main__":
    success = download_wheels()
    sys.exit(0 if success else 1)