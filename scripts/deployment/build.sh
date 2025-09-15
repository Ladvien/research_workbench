#!/bin/bash
# build.sh - Multi-architecture build script for Workbench

set -e

ARCH=$(uname -m)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building Workbench for architecture: $ARCH"
echo "Script directory: $SCRIPT_DIR"

# Backend build
echo "=== Building Backend ==="
cd "$SCRIPT_DIR/backend"

if [ "$ARCH" = "x86_64" ]; then
    echo "Building for AMD64 (x86_64)..."
    cargo build --release --target x86_64-unknown-linux-gnu
    BACKEND_BINARY="target/x86_64-unknown-linux-gnu/release/workbench-server"
elif [ "$ARCH" = "aarch64" ]; then
    echo "Building for ARM64 (aarch64)..."
    cargo build --release --target aarch64-unknown-linux-gnu
    BACKEND_BINARY="target/aarch64-unknown-linux-gnu/release/workbench-server"
else
    echo "Building for native architecture..."
    cargo build --release
    BACKEND_BINARY="target/release/workbench-server"
fi

echo "Backend binary built: $BACKEND_BINARY"

# Frontend build
echo "=== Building Frontend ==="
cd "$SCRIPT_DIR/frontend"

# Install dependencies
echo "Installing frontend dependencies..."
pnpm install --frozen-lockfile

# Build for production
echo "Building frontend for production..."
pnpm build

echo "Frontend built successfully"

echo "=== Build Summary ==="
echo "Architecture: $ARCH"
echo "Backend binary: $SCRIPT_DIR/backend/$BACKEND_BINARY"
echo "Frontend dist: $SCRIPT_DIR/frontend/dist/"
echo ""
echo "To deploy to /opt/workbench/, run:"
echo "  sudo cp $SCRIPT_DIR/backend/$BACKEND_BINARY /opt/workbench/backend/"
echo "  sudo cp -r $SCRIPT_DIR/frontend/dist/* /opt/workbench/frontend/"
echo "  sudo chown -R workbench:workbench /opt/workbench"