#!/bin/bash

# Script to move the SQLite export project to the desired location

echo "This script will help you move the OuterSpatial SQLite project to its final location."
echo ""
echo "To move this project to ../outerspatial-sqlite, run:"
echo "mv outerspatial-sqlite-temp ../outerspatial-sqlite"
echo ""
echo "Or to move it to a different location, run:"
echo "mv outerspatial-sqlite-temp /path/to/your/desired/location/outerspatial-sqlite"
echo ""
echo "After moving, cd into the new directory and run:"
echo "pnpm install"
echo ""
echo "Then copy .env.example to .env.local and configure your environment variables."