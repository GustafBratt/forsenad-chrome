document.addEventListener('DOMContentLoaded', function() {
    const actionBtn = document.getElementById('actionBtn');
    const statusDiv = document.getElementById('status');
    
    // Load saved state
    chrome.storage.local.get(['clickCount'], function(result) {
        const clickCount = result.clickCount || 0;
        updateStatus(`Button clicked ${clickCount} times`);
    });
    
    actionBtn.addEventListener('click', function() {
        // Get current click count
        chrome.storage.local.get(['clickCount'], function(result) {
            const newCount = (result.clickCount || 0) + 1;
            
            // Save new count
            chrome.storage.local.set({clickCount: newCount}, function() {
                updateStatus(`Button clicked ${newCount} times`);
                
                // Send message to content script
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'buttonClicked',
                            count: newCount
                        });
                    }
                });
            });
        });
    });
    
    function updateStatus(message) {
        statusDiv.textContent = message;
    }
});
