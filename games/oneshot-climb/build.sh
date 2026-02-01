#!/bin/bash
# Build script for Oneshot Climb
# Creates a distributable version of the game

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

echo "Building Oneshot Climb..."

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy main HTML file
cp "$SCRIPT_DIR/index.html" "$BUILD_DIR/"

# Copy assets if they exist
if [ -d "$SCRIPT_DIR/assets" ]; then
    cp -r "$SCRIPT_DIR/assets" "$BUILD_DIR/"
    echo "Copied assets"
fi

echo "Build complete: $BUILD_DIR"
echo ""
echo "To test locally via vanilla platform:"
echo "  1. Start platform: cd platforms/vanilla && npm run dev"
echo "  2. Access at: http://localhost:3000/dev/oneshot-climb/index.html"
echo ""
echo "To upload:"
echo "  npm run publish:vanilla"
