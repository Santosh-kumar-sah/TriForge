import os
import shutil

# Config map of typical power draw (kWh per 1,000 processed local tokens)
# based on execution efficiency profiles
POWER_PROFILES = {
    "ROCM": {
        "backend": "ROCm",
        "kwh_per_1k_tokens": 0.0035,
        "co2_kg_per_kwh": 0.385,
        "description": "AMD ROCm GPU Acceleration"
    },
    "CUDA": {
        "backend": "CUDA",
        "kwh_per_1k_tokens": 0.0038,
        "co2_kg_per_kwh": 0.385,
        "description": "NVIDIA CUDA GPU Acceleration"
    },
    "MPS": {
        "backend": "MPS",
        "kwh_per_1k_tokens": 0.0008,
        "co2_kg_per_kwh": 0.385,
        "description": "Apple Silicon MPS (Metal Performance Shaders)"
    },
    "NPU": {
        "backend": "NPU",
        "kwh_per_1k_tokens": 0.0005,
        "co2_kg_per_kwh": 0.385,
        "description": "Dedicated Neural Processing Unit"
    },
    "CPU": {
        "backend": "CPU",
        "kwh_per_1k_tokens": 0.0012,
        "co2_kg_per_kwh": 0.385,
        "description": "Host CPU Execution"
    }
}

def detect_compute_backend() -> str:
    """
    Auto-detect the active compute hardware backend (ROCm / CUDA / MPS / NPU / CPU).
    Checks env overrides first, then system utilities (rocm-smi, nvidia-smi),
    and PyTorch runtime if available.
    """
    # 1. Check explicit environment override
    env_override = os.getenv("COMPUTE_BACKEND", "").strip().upper()
    if env_override in POWER_PROFILES:
        return POWER_PROFILES[env_override]["backend"]

    # 2. Check for AMD ROCm
    if os.getenv("ROCM_PATH") or os.getenv("HIP_VISIBLE_DEVICES") or shutil.which("rocm-smi"):
        return "ROCm"

    # 3. Check for NVIDIA CUDA
    if os.getenv("CUDA_VISIBLE_DEVICES") or shutil.which("nvidia-smi"):
        return "CUDA"

    # 4. Check PyTorch hardware reporting if installed
    try:
        import torch
        if hasattr(torch.version, "hip") and torch.version.hip:
            return "ROCm"
        if torch.cuda.is_available():
            return "CUDA"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "MPS"
    except ImportError:
        pass

    # 5. Default to CPU
    return "CPU"

def get_hardware_info() -> dict:
    """Return complete compute backend profile info for analytics and settings."""
    backend = detect_compute_backend()
    profile = POWER_PROFILES.get(backend.upper(), POWER_PROFILES["CPU"])
    return {
        "compute_backend": profile["backend"],
        "description": profile["description"],
        "kwh_per_1k_tokens": profile["kwh_per_1k_tokens"]
    }
