import os
import sys
import subprocess

# Add PyTorch-bundled CUDA DLLs to system PATH to enable GPU acceleration in ONNX Runtime
try:
    import torch
    torch_lib_dir = os.path.join(os.path.dirname(torch.__file__), "lib")
    if os.path.exists(torch_lib_dir):
        os.environ["PATH"] = torch_lib_dir + os.pathsep + os.environ["PATH"]
except Exception as e:
    print(f"Failed to append PyTorch CUDA path: {e}")

from PIL import Image

# Create a dummy image
temp_img = 'temp_warmup.png'
img = Image.new('RGB', (300, 300), color = 'white')
img.save(temp_img)

print("Starting oemer warmup to trigger checkpoints download...")
try:
    # Running oemer on a dummy image will force it to download the models on first run
    result = subprocess.run(
        [r".\backend\venv\Scripts\oemer", temp_img],
        capture_output=True,
        text=True,
        cwd=os.getcwd()
    )
    print("Warmup Completed.")
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
except Exception as e:
    print("Warmup error:", e)
finally:
    if os.path.exists(temp_img):
        try:
            os.remove(temp_img)
        except Exception:
            pass
    # Clean up generated files
    xml_file = 'temp_warmup.musicxml'
    if os.path.exists(xml_file):
        try:
            os.remove(xml_file)
        except Exception:
            pass
