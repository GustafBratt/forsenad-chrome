// Background script for Forsenad Chrome Extension
console.log('Forsenad Extension: Background script loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        console.log('Extension installed');
        
        // Initialize default settings
        chrome.storage.local.set({
            clickCount: 0,
            isEnabled: true,
            installDate: new Date().toISOString()
        });
        
        // Open welcome page (optional)
        // chrome.tabs.create({url: 'welcome.html'});
    } else if (details.reason === 'update') {
        console.log('Extension updated');
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(function() {
    console.log('Extension started');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Background received message:', request);
    
    // Test ping/pong
    if (request.action === 'ping') {
        console.log('Received ping, sending pong');
        sendResponse({ status: 'pong', timestamp: Date.now() });
        return true;
    }
    
    if (request.action === 'getStats') {
        chrome.storage.local.get(['clickCount', 'isEnabled'], function(result) {
            sendResponse({
                clickCount: result.clickCount || 0,
                isEnabled: result.isEnabled !== false
            });
        });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'toggleExtension') {
        chrome.storage.local.get(['isEnabled'], function(result) {
            const newState = !(result.isEnabled !== false);
            chrome.storage.local.set({isEnabled: newState}, function() {
                sendResponse({isEnabled: newState});
            });
        });
        return true;
    }

    if (request.action === 'fetchTrainData') {
        console.log('Fetching train data from:', request.url);
        
        // Make the API call from background script (bypasses CORS)
        fetch(request.url)
            .then(response => {
                console.log('Fetch response status:', response.status, response.statusText);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Fetch success, data:', data);
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('Error fetching train data:', error);
                console.error('URL was:', request.url);
                sendResponse({ success: false, error: error.message });
            });
        
        // Return true to indicate we will send a response asynchronously
        return true;
    }
    
    if (request.action === 'buttonClicked') {
        console.log(`Button clicked ${request.count} times from popup`);
        sendResponse({status: 'Message received'});
    }
});

// Handle browser action click (optional - for extensions without popup)
chrome.action.onClicked.addListener(function(tab) {
    console.log('Extension icon clicked on tab:', tab.id);
    
    // You can add custom behavior here
    // For example, inject content script or modify the page
});

