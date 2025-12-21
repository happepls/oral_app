#!/usr/bin/env python3
"""Test script to check if wheels can be installed"""

import subprocess
import sys
import os

def test_wheels():
    """Test installing wheels from the wheels directory"""
    
    wheels_dir = "/Users/sgcc-work/IdeaProjects/oral_app/services/ai-glm-service/wheels"
    
    # Test installing minimal requirements
    cmd = [
        sys.executable, '-m', 'pip', 'install',
        '--no-cache-dir', '--no-index', f'--find-links={wheels_dir}',
        '-r', 'requirements-minimal.txt'
    ]
    
    print(f"Testing wheel installation: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)))
        print("✓ Successfully installed minimal requirements")
        print("Output:", result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print("✗ Failed to install minimal requirements")
        print("stdout:", e.stdout)
        print("stderr:", e.stderr)
        return False

if __name__ == "__main__":
    success = test_wheels()
    sys.exit(0 if success else 1)