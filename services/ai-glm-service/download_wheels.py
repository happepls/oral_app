#!/usr/bin/env python3
"""
Script to download Python wheels for the GLM service dependencies.
This avoids network issues during Docker build by using pre-downloaded wheels.
"""

import subprocess
import sys
import os

def download_wheels():
    """Download all required wheels to the wheels directory."""
    
    # Change to the service directory
    service_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(service_dir)
    
    # Ensure wheels directory exists
    wheels_dir = os.path.join(service_dir, 'wheels')
    os.makedirs(wheels_dir, exist_ok=True)
    
    # First, try to download for current platform (macOS)
    cmd = [
        sys.executable, '-m', 'pip', 'download',
        '--only-binary=:all:',  # Only download wheels, no source distributions
        '--dest', wheels_dir,
        '-r', 'requirements.txt'
    ]
    
    print(f"Downloading wheels to {wheels_dir}...")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("Successfully downloaded wheels:")
        print(result.stdout)
        
        # List downloaded wheels
        downloaded_files = os.listdir(wheels_dir)
        if downloaded_files:
            print(f"\nDownloaded {len(downloaded_files)} wheels:")
            for file in sorted(downloaded_files):
                print(f"  - {file}")
        else:
            print("No wheels were downloaded.")
            
    except subprocess.CalledProcessError as e:
        print(f"Error downloading wheels: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False
    
    return True

if __name__ == "__main__":
    success = download_wheels()
    sys.exit(0 if success else 1)