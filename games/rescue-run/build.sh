#!/bin/bash
# Build script for Rescue Run
# Creates a distributable version of the game

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

echo "🔨 Building Rescue Run..."

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy main HTML file
cp "$SCRIPT_DIR/index.html" "$BUILD_DIR/"

# Copy assets if they exist
if [ -d "$SCRIPT_DIR/assets" ]; then
    cp -r "$SCRIPT_DIR/assets" "$BUILD_DIR/"
    echo "✅ Copied assets"
fi

echo "✅ Build complete: $BUILD_DIR"
echo ""
echo "To upload to vanilla platform:"
echo "  1. Go to http://localhost:3000"
echo "  2. Login as admin"
echo "  3. Upload build/index.html as 'Rescue Run'"
echo ""
echo "Or use the API:"
echo "  curl -X POST http://localhost:3000/api/games \\"
echo "    -H 'Cookie: <session cookie>' \\"
echo "    -F 'name=Rescue Run' \\"
echo "    -F 'game=@build/index.html'"
