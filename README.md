# Forsenad Chrome Extension

A modern Chrome extension built with Manifest V3 that provides an enhanced browsing experience.

## Features

- **Modern UI**: Beautiful gradient design with smooth animations
- **Interactive Popup**: Click counter with persistent storage
- **Content Scripts**: Runs on web pages to enhance functionality
- **Background Service Worker**: Handles extension lifecycle and background tasks
- **Chrome Storage API**: Persistent data storage across browser sessions

## Project Structure

```
forsenad-chrome/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup.html            # Popup interface
├── popup.css             # Popup styling
├── popup.js              # Popup functionality
├── content.js            # Content script for web pages
├── background.js         # Background service worker
├── icons/                # Extension icons (16x16, 48x48, 128x128)
└── README.md             # This file
```

## Installation

### For Development

1. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `forsenad-chrome` folder

2. **The extension will appear in your extensions list**
   - Click the extension icon in the toolbar to open the popup
   - The extension will run on all web pages

### For Production

1. **Create icons:**
   - Add icon files to the `icons/` folder:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)

2. **Package the extension:**
   - Zip all files (excluding development files)
   - Upload to Chrome Web Store or distribute manually

## Development

### Key Components

- **Manifest V3**: Uses the latest Chrome extension manifest format
- **Service Worker**: Background script for extension lifecycle management
- **Content Scripts**: JavaScript that runs on web pages
- **Popup**: User interface accessible from the extension icon

### Adding Features

1. **Modify popup functionality** in `popup.js`
2. **Add page interactions** in `content.js`
3. **Handle background tasks** in `background.js`
4. **Update permissions** in `manifest.json` as needed

### Testing

- Use Chrome DevTools to debug popup and content scripts
- Check the background service worker in `chrome://extensions/`
- Monitor console logs for debugging information

## Permissions

- **`activeTab`**: Access to the currently active tab
- **`storage`**: Persistent data storage

## Browser Compatibility

- Chrome 88+ (Manifest V3 support required)
- Edge 88+ (Chromium-based)
- Other Chromium-based browsers

## Troubleshooting

- **Extension not loading**: Check for syntax errors in manifest.json
- **Content script not working**: Verify matches pattern in manifest
- **Storage not persisting**: Check storage permissions and API usage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
