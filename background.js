// Background script for Forsenad Chrome Extension
console.log('Forsenad Extension: Background script loaded');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Background received message:', request);
    
    // Fetch train data from forsenad.nu API (bypasses CORS)
    if (request.action === 'fetchTrainData') {
        console.log('Fetching train data from:', request.url);
        
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
    
    // Unknown action
    console.warn('Unknown action:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
});
