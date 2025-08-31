// Enhanced content script for Chrome extension to parse SJ train information
// This script handles dynamically loaded content with improved error handling and flexibility

class SJTrainParser {
    constructor() {
        this.trains = [];
        this.observer = null;
        this.isRunning = false;
        this.maxAttempts = 10;
        this.interval = 1000;
    }

    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        if (data) {
            console.log(`[${timestamp}] 🚂 ${message}`, data);
        } else {
            console.log(`[${timestamp}] 🚂 ${message}`);
        }
    }

    // Parse train information by matching trains with their destinations
    parseTrainInfo() {
        this.log("Searching for train information...");
        
        // Find the main journey container
        const journeyContainer = document.querySelector('[aria-label="Resedetaljer"]') || document.body;
        
        if (!journeyContainer) {
            this.log("No journey container found");
            return [];
        }
        
        // Get all list items in the journey
        const listItems = journeyContainer.querySelectorAll('[role="listitem"]');
        this.log(`Found ${listItems.length} list items to analyze`);
        
        const trains = new Map();
        
        // Process each list item to find trains and their destinations
        for (let i = 0; i < listItems.length; i++) {
            const listItem = listItems[i];
            
            // Check if this item contains train information
            const trainElement = listItem.querySelector('p[aria-hidden="true"]');
            if (trainElement) {
                const trainMatch = trainElement.textContent.match(/tåg\s+(\d+)/i);
                if (trainMatch) {
                    const trainId = trainMatch[1];
                    this.log(`Found train ${trainId} in list item ${i}`);
                    
                    // Find the corresponding arrival destination
                    const destination = this.findDestinationForTrain(listItems, i, trainId);
                    
                    if (destination) {
                        trains.set(trainId, {
                            id: trainId,
                            destination: destination
                        });
                        this.log(`Train ${trainId} to ${destination}`);
                    } else {
                        this.log(`Train ${trainId} found but no destination detected`);
                    }
                }
            }
        }
        
        this.trains = Array.from(trains.values());
        
        if (this.trains.length === 0) {
            this.log("No train information found on this page");
        } else {
            this.log(`Found ${this.trains.length} trains:`, this.trains);
            this.notifyExtension();
        }
        
        return this.trains;
    }
    
    // Find destination by looking at the journey structure
    findDestinationForTrain(listItems, trainIndex, trainId) {
        // Look for the next arrival after this train's departure
        for (let i = trainIndex + 1; i < listItems.length; i++) {
            const nextItem = listItems[i];
            const srText = nextItem.querySelector('span[class*="srOnly"]');
            
            if (srText) {
                const text = srText.textContent;
                
                // Look for arrival pattern: "Tåget ankommer klockan XX:XX till DESTINATION"
                const arrivalMatch = text.match(/ankommer[\s\S]*?till\s+(.+?)$/i);
                if (arrivalMatch) {
                    return arrivalMatch[1].trim();
                }
            }
        }
        
        return null;
    }

    // Extract train ID and destination for multi-leg journeys
    extractTrainDetails(element, trainId) {
        // Find the container that holds this specific train
        const trainContainer = element.closest('[role="listitem"], .journey-item, .train-item, li');
        
        if (!trainContainer) {
            this.log(`No container found for train ${trainId}`);
            return null;
        }

        // Look for destination by finding the next train leg or final destination
        let destination = this.findDestinationInJourney(trainContainer, trainId);

        if (!destination) {
            this.log(`Train ${trainId} found but no destination detected`);
            return null;
        }

        return {
            id: trainId,
            destination
        };
    }

    findDestinationInJourney(container, currentTrainId) {
        // Strategy 1: Look for screen reader text that mentions this specific train's arrival
        const srSpans = container.querySelectorAll('span[class*="srOnly"], .sr-only, span[class*="sr-"]');
        for (const span of srSpans) {
            const text = span.textContent;
            // Handle text with line breaks: "Tåget ankommer klockan 14:20\n\ntill Vingåker station"
            const arrivalMatch = text.match(/ankommer[\s\S]*?till\s+(.+?)$/i);
            if (arrivalMatch) {
                return arrivalMatch[1].trim();
            }
        }

        // Strategy 2: Find where this train leg ends by looking at the journey structure
        // Look for the main journey container that contains all legs
        const journeyContainer = container.closest('.MuiBox-root') || container;
        
        // Find all train mentions in the journey
        const allTrainElements = journeyContainer.querySelectorAll('p, span');
        const trainPattern = /tåg\s+(\d+)/i;
        let foundCurrentTrain = false;
        let nextTrainId = null;
        
        // Find the next train after our current one
        for (const el of allTrainElements) {
            const match = el.textContent.match(trainPattern);
            if (match) {
                const trainId = match[1];
                if (foundCurrentTrain && trainId !== currentTrainId) {
                    nextTrainId = trainId;
                    break;
                }
                if (trainId === currentTrainId) {
                    foundCurrentTrain = true;
                }
            }
        }

        // Strategy 3: Look for stations in the journey and determine the destination
        const stationSpans = journeyContainer.querySelectorAll('span[aria-hidden="true"]');
        const stations = [];
        
        for (let i = 0; i < stationSpans.length; i++) {
            const span = stationSpans[i];
            const text = span.textContent.trim();
            
            // Look for station names that come after times
            if (i > 0 && /^\d{2}:\d{2}$/.test(stationSpans[i-1]?.textContent?.trim())) {
                // Check if this looks like a station name
                if (/^[A-ZÅÄÖ][a-zåäö\s]+(Central|station|C)?$/i.test(text) && text.length > 3) {
                    stations.push({
                        name: text,
                        time: stationSpans[i-1].textContent.trim(),
                        index: i
                    });
                }
            }
        }

        // If we found a next train, the destination is the station before that train starts
        if (nextTrainId && stations.length > 1) {
            // Find where the next train element appears in the DOM
            const nextTrainElement = Array.from(allTrainElements).find(el => 
                el.textContent.includes(`tåg ${nextTrainId}`)
            );
            
            if (nextTrainElement) {
                // Find the station that appears before the next train element
                for (let i = stations.length - 1; i >= 0; i--) {
                    const station = stations[i];
                    // Simple heuristic: if we have multiple stations, pick the one that's not the first
                    if (i > 0) {
                        return station.name;
                    }
                }
            }
        }

        // Fallback: return the last station mentioned (likely the final destination)
        if (stations.length > 0) {
            return stations[stations.length - 1].name;
        }

        return null;
    }

    findTime(container, type) {
        const timePattern = /\d{2}:\d{2}/g;
        const text = container.textContent;
        const times = text.match(timePattern);
        
        // Simple heuristic: first time is usually departure, second is arrival
        if (times && times.length > 0) {
            return type === 'departure' ? times[0] : (times[1] || times[0]);
        }
        
        return null;
    }

    findPlatform(container) {
        const platformMatch = container.textContent.match(/(?:spår|platform|gleis)\s*(\d+[A-Z]?)/i);
        return platformMatch ? platformMatch[1] : null;
    }

    findStatus(container) {
        const statusKeywords = {
            'försenad': 'delayed',
            'inställd': 'cancelled',
            'i tid': 'on time',
            'delayed': 'delayed',
            'cancelled': 'cancelled',
            'on time': 'on time'
        };

        const text = container.textContent.toLowerCase();
        for (const [swedish, english] of Object.entries(statusKeywords)) {
            if (text.includes(swedish)) {
                return english;
            }
        }

        return null;
    }

    findTrainType(element) {
        const text = element.textContent;
        const types = ['Snälltåget', 'Mälartåg', 'Öresundståg', 'Pågatåg', 'SJ', 'X2000'];
        
        for (const type of types) {
            if (text.includes(type)) {
                return type;
            }
        }
        
        return null;
    }

    // Wait for content with exponential backoff
    async waitForTrainContent() {
        let attempts = 0;
        let delay = this.interval;
        
        const checkForContent = () => {
            return new Promise((resolve) => {
                attempts++;
                this.log(`Attempt ${attempts}/${this.maxAttempts} - Looking for train content...`);
                
                const potentialTrainElements = document.querySelectorAll('p, span, div');
                const hasTrainText = Array.from(potentialTrainElements).some(el => 
                    /tåg\s*\d+/i.test(el.textContent)
                );
                
                this.log(`Found ${potentialTrainElements.length} elements, hasTrainText: ${hasTrainText}`);
                
                if (hasTrainText) {
                    this.log("Train content detected! Parsing...");
                    this.parseTrainInfo();
                    resolve(true);
                    return;
                }
                
                if (attempts < this.maxAttempts) {
                    this.log(`No train content yet, retrying in ${delay}ms...`);
                    setTimeout(() => {
                        delay = Math.min(delay * 1.2, 5000); // Exponential backoff, max 5s
                        checkForContent().then(resolve);
                    }, delay);
                } else {
                    this.log("Max attempts reached, trying final parse...");
                    this.parseTrainInfo();
                    resolve(false);
                }
            });
        };
        
        return checkForContent();
    }

    // Enhanced MutationObserver
    observeForChanges() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.log("Setting up enhanced MutationObserver...");
        
        let debounceTimer = null;
        
        this.observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            if (element.textContent && /tåg|train/i.test(element.textContent)) {
                                shouldCheck = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldCheck) {
                // Debounce to avoid excessive parsing
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.log("DOM changed with potential train content, parsing...");
                    this.parseTrainInfo();
                }, 300);
            }
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
        
        this.log("Enhanced MutationObserver active");
    }

    // Notify the extension popup/background script
    notifyExtension() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'TRAINS_FOUND',
                trains: this.trains,
                url: window.location.href,
                timestamp: Date.now()
            }).catch(err => {
                this.log("Failed to send message to extension", err);
            });
        }
    }

    // Public API
    async start() {
        if (this.isRunning) {
            this.log("Parser already running");
            return;
        }

        this.isRunning = true;
        this.log("SJ Train Parser starting...");
        this.log(`Current URL: ${window.location.href}`);

        // Run immediately
        this.parseTrainInfo();

        // Wait for content with retries
        await this.waitForTrainContent();

        // Set up observer for dynamic changes
        if (document.body) {
            this.observeForChanges();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                this.observeForChanges();
            });
        }
    }

    stop() {
        this.isRunning = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.log("Parser stopped");
    }

    // Get current results
    getTrains() {
        return this.trains;
    }
}

// Initialize and start the parser
const sjParser = new SJTrainParser();

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sjParser.start());
} else {
    sjParser.start();
}

// Expose parser globally for debugging
window.sjParser = sjParser;