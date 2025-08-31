// Popup message handler for content script
class PopupMessageHandler {
    static handleMessage(request, sender, sendResponse) {
        if (request.action === 'buttonClicked') {
            console.log(`Button clicked ${request.count} times from popup`);
            this.showNotification(`Extension button clicked ${request.count} times!`);
            sendResponse({status: 'Message received'});
        }
    }
    
    static showNotification(message) {
        const notification = this.createNotificationElement(message);
        this.addNotificationStyles();
        document.body.appendChild(notification);
        this.scheduleNotificationRemoval(notification);
    }
    
    static createNotificationElement(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = this.getNotificationStyles();
        return notification;
    }
    
    static getNotificationStyles() {
        return `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
        `;
    }
    
    static addNotificationStyles() {
        const style = document.createElement('style');
        style.textContent = this.getNotificationAnimations();
        document.head.appendChild(style);
    }
    
    static getNotificationAnimations() {
        return `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
    }
    
    static scheduleNotificationRemoval(notification) {
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PopupMessageHandler;
}
