#!/usr/bin/env python3
"""
Script to download ALL Linux-compatible Python wheels for the GLM service dependencies.
This avoids network issues during Docker build by using pre-downloaded wheels.
"""

import subprocess
import sys
import os

def download_linux_wheels():
    """Download ALL Linux-compatible wheels to the wheels directory."""
    
    # Change to the service directory
    service_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(service_dir)
    
    # Ensure wheels directory exists
    wheels_dir = os.path.join(service_dir, 'wheels')
    os.makedirs(wheels_dir, exist_ok=True)
    
    # Read requirements from requirements.txt
    requirements_file = os.path.join(service_dir, 'requirements.txt')
    with open(requirements_file, 'r') as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    
    print(f"Downloading Linux-compatible wheels for {len(requirements)} packages...")
    print(f"Requirements: {requirements}")
    
    success_count = 0
    total_count = len(requirements)
    
    for package in requirements:
        print(f"\nDownloading {package}...")
        
        # Try to download with Linux platform specification
        cmd = [
            sys.executable, '-m', 'pip', 'download',
            '--only-binary=:all:',  # Only download wheels
            '--platform', 'manylinux2014_x86_64',  # Linux x86_64
            '--python-version', '3.10',
            '--implementation', 'cp',  # CPython
            '--abi', 'cp310',
            '--no-deps',  # Don't download dependencies to avoid conflicts
            '--dest', wheels_dir,
            package
        ]
        
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(f"✓ Successfully downloaded {package}")
            success_count += 1
            
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to download {package} for Linux platform")
            print(f"  Error: {e.stderr.strip() if e.stderr else 'Unknown error'}")
            
            # Fallback: try without platform restrictions (might work for pure Python packages)
            fallback_cmd = [
                sys.executable, '-m', 'pip', 'download',
                '--only-binary=:all:',
                '--no-deps',
                '--dest', wheels_dir,
                package
            ]
            
            try:
                result = subprocess.run(fallback_cmd, check=True, capture_output=True, text=True)
                print(f"  ✓ Downloaded with fallback method")
                success_count += 1
            except subprocess.CalledProcessError as fallback_error:
                print(f"  ✗ Fallback also failed: {fallback_error.stderr.strip() if fallback_error.stderr else 'Unknown error'}")
    
    # List downloaded wheels
    downloaded_files = os.listdir(wheels_dir)
    if downloaded_files:
        print(f"\n\nSuccessfully downloaded {success_count}/{total_count} packages:")
        for file in sorted(downloaded_files):
            print(f"  - {file}")
        
        print(f"\nTotal wheels: {len(downloaded_files)}")
        return success_count > 0
    else:
        print("No wheels were downloaded.")
        return False

if __name__ == "__main__":
    success = download_linux_wheels()
    sys.exit(0 if success else 1)