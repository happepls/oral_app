import subprocess
import sys
import os

def download_wheels():
    # Split into groups to avoid dependency hell
    groups = [
        # Group 1: Core numerical/ML (Exact versions to prevent backtracking)
        [
            "numpy==1.26.3",
            "torch==2.1.2",
            "torchaudio==2.1.2",
        ],
        # Group 2: Hugging Face ecosystem
        [
            "transformers==4.36.2",
            "accelerate==0.26.1",
            "huggingface-hub",
            "tokenizers",
            "safetensors",
            "filelock",
            "packaging",
            "regex",
            "psutil",
            "pyyaml"
        ],
        # Group 3: Audio processing
        [
            "soundfile",
            "librosa",
            "scipy",
            "pooch",
            "numba",
            "llvmlite",
            "decorator",
            "audioread",
            "lazy_loader",
            "msgpack"
        ]
    ]
    
    base_cmd = [
        sys.executable, "-m", "pip", "download",
        "--dest", "wheels",
        "--only-binary=:all:",
        "--platform", "manylinux2014_aarch64",
        "--python-version", "3.10",
        "--implementation", "cp",
        "--abi", "cp310",
        # Add Aliyun mirror for metadata speedup
        "-i", "https://mirrors.aliyun.com/pypi/simple/",
        "--extra-index-url", "https://download.pytorch.org/whl/cpu"
    ]

    for i, packages in enumerate(groups):
        print(f"\n--- Downloading Group {i+1} ---")
        cmd = base_cmd + packages
        print(f"Command: {' '.join(cmd)}")
        try:
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            print(f"Error downloading group {i+1}: {e}")
            # Don't exit immediately, try next group
            pass

if __name__ == "__main__":
    if not os.path.exists("wheels"):
        os.makedirs("wheels")
    download_wheels()