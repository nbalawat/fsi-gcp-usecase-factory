"""Add the service root to sys.path so 'import main' resolves."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
