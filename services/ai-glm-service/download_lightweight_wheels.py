#!/usr/bin/env python3
"""Download only the lightweight dependencies compatible with Python 3.9"""

import subprocess
import sys
import os

def download_lightweight_wheels():
    """Download only lightweight dependencies as wheels"""
    
    # List of lightweight dependencies compatible with Python 3.9
    lightweight_deps = [
        "fastapi==0.109.2",
        "uvicorn==0.27.1", 
        "websockets==12.0",
        "httpx==0.27.0",
        "python-dotenv==1.0.1"
    ]
    
    wheels_dir = 'wheels'
    
    # Create/clean wheels directory
    if os.path.exists(wheels_dir):
        subprocess.run(['rm', '-rf', wheels_dir])
    os.makedirs(wheels_dir)
    
    print(f"Downloading {len(lightweight_deps)} lightweight dependencies...")
    
    # Download each dependency
    for dep in lightweight_deps:
        print(f"Downloading {dep}...")
        
        # Try to download with specific platform first
        cmd = [
            sys.executable, '-m', 'pip', 'download',
            '--only-binary=:all:',
            '--platform', 'manylinux2014_x86_64',
            '--python-version', '3.9',
            '--implementation', 'cp',
            '--abi', 'cp39',
            '--no-deps',
            '--dest', wheels_dir,
            dep
        ]
        
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            print(f"✓ Successfully downloaded {dep}")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to download {dep} with specific platform, trying without platform restrictions...")
            # Fallback: try without platform restrictions
            fallback_cmd = [
                sys.executable, '-m', 'pip', 'download',
                '--only-binary=:all:',
                '--python-version', '3.9',
                '--implementation', 'cp',
                '--abi', 'cp39',
                '--no-deps',
                '--dest', wheels_dir,
                dep
            ]
            
            try:
                subprocess.run(fallback_cmd, check=True, capture_output=True)
                print(f"✓ Successfully downloaded {dep} (fallback method)")
            except subprocess.CalledProcessError as e2:
                print(f"✗ Completely failed to download {dep}")
                print(f"Error: {e2.stderr.decode() if e2.stderr else 'Unknown error'}")
                return False
    
    print("\nLightweight dependencies downloaded successfully!")
    
    # List downloaded files
    print("\nDownloaded files:")
    for file in sorted(os.listdir(wheels_dir)):
        if file.endswith('.whl'):
            print(f"  {file}")
    
    return True

if __name__ == "__main__":
    success = download_lightweight_wheels()
    sys.exit(0 if success else 1)