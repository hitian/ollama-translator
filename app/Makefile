.PHONY: help copy-files clean build start build-mac build-win dist

help:
	@echo "Available targets:"
	@echo "  make start      - Copy files and start development"
	@echo "  make build      - Copy files and build for current platform"
	@echo "  make build-mac  - Copy files and build for macOS"
	@echo "  make build-win  - Copy files and build for Windows"
	@echo "  make dist       - Copy files and build distribution"
	@echo "  make clean      - Remove copied files"
	@echo "  make copy-files - Copy shared files from parent directory"

copy-files:
	@echo "🔄 Copying shared files from parent directory..."
	@cp ../index.html .
	@cp ../styles.css .
	@cp ../app.js .
	@cp -r ../vendor .
	@echo "✅ Files copied successfully"

clean:
	@echo "🧹 Cleaning up copied files..."
	@rm -f index.html styles.css app.js
	@rm -rf vendor
	@echo "✅ Cleanup complete"

start: copy-files
	@echo "🚀 Starting Electron app..."
	@npx electron .

build: copy-files
	@echo "📦 Building Electron app..."
	@npx electron-builder
	@echo "✨ Build complete!"

build-mac: copy-files
	@echo "📦 Building Electron app for macOS..."
	@npx electron-builder --mac
	@echo "✨ Build complete!"

build-win: copy-files
	@echo "📦 Building Electron app for Windows..."
	@npx electron-builder --win
	@echo "✨ Build complete!"

dist: copy-files
	@echo "📦 Building distribution..."
	@npx electron-builder
	@echo "✨ Distribution build complete!"
