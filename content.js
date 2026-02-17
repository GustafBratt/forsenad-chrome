// Enhanced content script for Chrome extension to parse SJ train information
// This script handles dynamically loaded content with improved error handling and flexibility

// === CRITICAL STARTUP LOGGING ===
console.log('═══════════════════════════════════════════════════');
console.log('🚂 FORSENAD EXTENSION LOADED!');
console.log('🚂 Current URL:', window.location.href);
console.log('🚂 Current pathname:', window.location.pathname);
console.log('🚂 Current search:', window.location.search);
console.log('🚂 Timestamp:', new Date().toISOString());
console.log('🚂 Chrome API check:', typeof chrome);
console.log('🚂 Chrome runtime check:', typeof chrome?.runtime);
if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('🚂 ❌ ERROR: Chrome extension APIs NOT AVAILABLE!');
} else {
    console.log('🚂 ✓ Chrome extension APIs available');
    
    // Test background script communication immediately
    console.log('🚂 Testing background script communication...');
    chrome.runtime.sendMessage({ action: 'ping' }, response => {
        if (chrome.runtime.lastError) {
            console.error('🚂 ❌ Background script communication FAILED:', chrome.runtime.lastError.message);
        } else {
            console.log('🚂 ✓ Background script responded:', response);
        }
    });
}
console.log('═══════════════════════════════════════════════════');

class SJTrainParser {
    constructor() {
        this.trains = [];
        this.observer = null;
        this.isRunning = false;
        this.maxAttempts = 10;
        this.interval = 1000;
        this.lastFetchedTrains = null; // Track which trains we've already fetched stats for
        
        // Station names recognized by forsenad.nu API
        this.validStations = [
            "Alvesta", "Arlanda C", "Arvika", "Avesta Krylbo", "Boden C",
            "Bollnäs", "Borlänge C", "Borås C", "Bräcke", "Duved",
            "Emmaboda", "Eskilstuna C", "Falköping C", "Falun C", "Gällivare C",
            "Gävle C", "Göteborg C", "Hallsberg", "Halmstad C", "Haparanda",
            "Helsingborg C", "Herrljunga C", "Hudiksvall", "Härnösand C", "Hässleholm",
            "Jönköping C", "Kalmar C", "Karlskrona C", "Karlstad C", "Katrineholm C",
            "Kiruna", "Laxå", "Linköping C", "Luleå", "Lund C",
            "Malmö C", "Mjölby", "Mora C", "Norrköping C", "Nässjö C",
            "Riksgränsen", "Sala", "Stockholm C", "Strömstad", "Sundsvall C",
            "Söderhamn", "Södertälje Syd", "Tranås", "Trollhättan", "Umeå C",
            "Uppsala C", "Vetlanda", "Vingåker", "Vännäs", "Västerås C",
            "Ystad", "Ängelholm", "Ånge", "Åre", "Örebro C",
            "Örnsköldsvik C", "Östersund C"
        ];
        
        // Create a Set for faster lookup
        this.validStationsSet = new Set(this.validStations);
    }

    /**
     * Normalize station name from SJ format to API format
     * SJ uses "Stockholm Central" -> API uses "Stockholm C"
     * SJ uses "Alvesta station" -> API uses "Alvesta"
     * SJ uses "Mora station" -> API uses "Mora C"
     */
    normalizeStationName(sjStationName) {
        if (!sjStationName) return null;
        
        // Trim whitespace
        let normalized = sjStationName.trim();
        
        // Try multiple variations in order of likelihood
        const variations = [];
        
        // 1. Replace "Central" with "C"
        if (normalized.endsWith(' Central')) {
            variations.push(normalized.replace(/\s+Central$/i, ' C'));
        }
        
        // 2. Remove "station" suffix
        if (normalized.endsWith(' station')) {
            const withoutStation = normalized.replace(/\s+station$/i, '');
            variations.push(withoutStation);
            // 3. Try adding " C" after removing "station" (for cases like "Mora station" -> "Mora C")
            variations.push(withoutStation + ' C');
        }
        
        // 4. Try the original name as-is
        variations.push(normalized);
        
        // Try each variation
        for (const variant of variations) {
            if (this.validStationsSet.has(variant)) {
                if (variant !== normalized) {
                    this.log(`✓ Station mapped: "${sjStationName}" -> "${variant}"`);
                }
                return variant;
            }
        }
        
        // Station not found in API
        this.log(`⚠️ Station "${sjStationName}" not found in API (tried: ${variations.join(', ')})`, {
            original: sjStationName,
            variations: variations
        });
        
        return null;
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
        
        // Try multiple selectors to find the journey container
        let journeyContainer = document.querySelector('[aria-label="Resedetaljer"]');
        
        if (journeyContainer) {
            this.log("✓ Found Resedetaljer dialog");
        } else {
            this.log("✗ No Resedetaljer dialog found, searching entire page");
            journeyContainer = document.body;
        }
        
        // Get all list items in the journey
        let listItems = journeyContainer.querySelectorAll('[role="listitem"]');
        this.log(`Found ${listItems.length} list items with [role="listitem"]`);
        
        // Try alternative selectors if the first one fails
        if (listItems.length === 0) {
            this.log("Trying alternative selector: .sjse-route-description-item");
            listItems = journeyContainer.querySelectorAll('.sjse-route-description-item');
            this.log(`Found ${listItems.length} items with .sjse-route-description-item`);
        }
        
        if (listItems.length === 0) {
            this.log("Trying alternative selector: li (all list items in dialog)");
            listItems = journeyContainer.querySelectorAll('li');
            this.log(`Found ${listItems.length} <li> elements`);
        }
        
        // Debug: Show where we're looking
        if (listItems.length === 0) {
            this.log("DEBUG: Checking for train text anywhere on page...");
            const allText = document.body.textContent;
            this.log(`Page contains 'tåg': ${allText.includes('tåg')}`);
            this.log(`Page contains 'Resedetaljer': ${allText.includes('Resedetaljer')}`);
            
            // Try to find ANY element with train numbers
            const allElements = document.querySelectorAll('*');
            let foundTrainText = false;
            for (const el of allElements) {
                if (el.textContent.match(/tåg\s+\d+/i)) {
                    foundTrainText = true;
                    this.log("DEBUG: Found element with train number:", el.className, el.textContent.substring(0, 100));
                    break;
                }
            }
            if (!foundTrainText) {
                this.log("DEBUG: No train numbers found anywhere on page");
            }
        }
        
        const trains = new Map();
        
        // Process each list item to find trains and their destinations
        for (let i = 0; i < listItems.length; i++) {
            const listItem = listItems[i];
            
            // NEW: Look for train information in screen-reader spans
            const srSpans = listItem.querySelectorAll('span[class*="srOnly"], .MuiTypography-srOnly');
            
            for (const span of srSpans) {
                const text = span.textContent;
                
                // Look for pattern: "körs med [operator], tåg XXX"
                const trainMatch = text.match(/tåg\s+(\d+)/i);
                if (trainMatch) {
                    const trainId = trainMatch[1];
                    this.log(`Found train ${trainId} in list item ${i}`);
                    
                    // Find the departure station
                    const departureMatch = text.match(/från\s+(.+?)\./i);
                    const rawDeparture = departureMatch ? departureMatch[1].trim() : null;
                    const departureStation = this.normalizeStationName(rawDeparture);
                    
                    // Find the destination - look ahead in the list
                    const rawDestination = this.findDestinationForTrain(listItems, i, trainId);
                    const destination = this.normalizeStationName(rawDestination);
                    
                    if (destination) {
                        const trainInfo = {
                            id: trainId,
                            from: departureStation,
                            to: destination,
                            rawFrom: rawDeparture,
                            rawTo: rawDestination
                        };
                        trains.set(trainId, trainInfo);
                        this.log(`Train ${trainId} from ${departureStation || rawDeparture} to ${destination}`);
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
            
            // Show which trains are ready for API calls
            const readyForAPI = this.trains.filter(t => this.canCallAPI(t));
            const notReady = this.trains.filter(t => !this.canCallAPI(t));
            
            this.log(`✓ ${readyForAPI.length} trains ready for API calls`);
            if (notReady.length > 0) {
                this.log(`⚠️ ${notReady.length} trains missing station data:`, notReady);
            }
            
            this.notifyExtension();
            
            // Check if we should fetch stats (only if trains changed)
            const trainKey = this.trains.map(t => `${t.id}-${t.to}`).sort().join('|');
            
            if (this.lastFetchedTrains !== trainKey) {
                this.log('🔄 New train set detected, fetching stats...');
                this.lastFetchedTrains = trainKey;
                
                // Automatically fetch delay statistics
                this.fetchAllDelayStats().then(stats => {
                    if (stats.length > 0) {
                        this.displayDelayStats(stats);
                    }
                });
            } else {
                this.log('ℹ️ Same trains as before, skipping stats fetch');
            }
        }
        
        return this.trains;
    }
    
    // Find destination by looking at the journey structure
    findDestinationForTrain(listItems, trainIndex, trainId) {
        // Look for the next arrival after this train's departure
        for (let i = trainIndex + 1; i < listItems.length; i++) {
            const nextItem = listItems[i];
            const srSpans = nextItem.querySelectorAll('span[class*="srOnly"], .MuiTypography-srOnly');
            
            for (const span of srSpans) {
                const text = span.textContent;
                
                // Look for arrival pattern: "Ankommer kl XX:XX till DESTINATION"
                const arrivalMatch = text.match(/Ankommer\s+kl\s+\d+:\d+\s+till\s+(.+?)\./i);
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
        
        let foundCurrentTrain = false;
        let nextDestination = null;
        
        for (const element of allTrainElements) {
            const text = element.textContent;
            
            // Check if this is our train
            if (text.includes(`tåg ${currentTrainId}`) || text.includes(`train ${currentTrainId}`)) {
                foundCurrentTrain = true;
                continue;
            }
            
            // After finding our train, look for the next station/destination
            if (foundCurrentTrain) {
                // Look for arrival patterns
                const arrivalMatch = text.match(/ankommer.*?till\s+(.+?)(?:\s+station)?$/i);
                if (arrivalMatch) {
                    nextDestination = arrivalMatch[1].trim();
                    break;
                }
                
                // Alternative: look for destination in bold or emphasized text
                if (element.tagName === 'STRONG' || element.tagName === 'B') {
                    // This might be a destination
                    const possibleDest = text.trim();
                    if (possibleDest.length > 2 && possibleDest.length < 50) {
                        nextDestination = possibleDest;
                        break;
                    }
                }
            }
        }
        
        return nextDestination;
    }

    // Wait for train content to appear on the page with retries
    async waitForTrainContent() {
        this.log("Waiting for train content to load...");
        
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const hasTrainContent = document.body.textContent.toLowerCase().includes('tåg') ||
                                   document.body.textContent.toLowerCase().includes('train');
            
            if (hasTrainContent) {
                this.log(`Train content detected on attempt ${attempt + 1}`);
                await this.sleep(500); // Give it a bit more time to fully render
                this.parseTrainInfo();
                return;
            }
            
            this.log(`Attempt ${attempt + 1}/${this.maxAttempts}: No train content yet`);
            await this.sleep(this.interval);
        }
        
        this.log("Timeout waiting for train content");
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Set up observer for dynamic content changes
    observeForChanges() {
        this.log("Setting up MutationObserver for dynamic changes...");
        
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

    /**
     * Check if a train has valid station data for API call
     */
    canCallAPI(train) {
        return train.id && train.from && train.to;
    }

    /**
     * Fetch delay statistics for a train from forsenad.nu API
     */
    async fetchDelayStats(train) {
        if (!this.canCallAPI(train)) {
            this.log(`Cannot fetch stats for train ${train.id} - missing station data`);
            return null;
        }

        const url = `https://www.forsenad.nu/api/aggregations?groupBy=advertisedTrainIdent&stationName=${encodeURIComponent(train.to)}&advertisedTrainIdent=${train.id}`;
        
        this.log(`Fetching delay stats for train ${train.id} to ${train.to}`);
        this.log(`URL: ${url}`);
        
        try {
            // Try direct fetch first to test CORS
            this.log(`Attempting direct fetch for train ${train.id}...`);
            const directResponse = await fetch(url);
            this.log(`Direct fetch status: ${directResponse.status}`);
            
            if (directResponse.ok) {
                const data = await directResponse.json();
                this.log(`✓ Direct fetch worked! Data:`, data);
                
                if (data && data.length > 0) {
                    const stats = data[0];
                    return {
                        trainId: train.id,
                        station: train.to,
                        onTime: Math.round(stats.onTime * 100),
                        lessThan30late: Math.round(stats.lessThan30late * 100),
                        moreThan30late: Math.round(stats.moreThan30late * 100),
                        cancelled: Math.round(stats.cancelled * 100),
                        count: stats.count
                    };
                }
            }
        } catch (directError) {
            this.log(`Direct fetch failed (trying background script): ${directError.message}`);
            
            // Fall back to background script
            try {
                this.log(`Sending message to background script...`);
                const response = await chrome.runtime.sendMessage({
                    action: 'fetchTrainData',
                    url: url
                });

                this.log(`Response for train ${train.id}:`, response);

                if (!response) {
                    this.log(`❌ No response for train ${train.id}`);
                    return null;
                }

                if (!response.success) {
                    this.log(`❌ Fetch failed for train ${train.id}: ${response.error}`);
                    return null;
                }

                if (!response.data || response.data.length === 0) {
                    this.log(`⚠️ No data in response for train ${train.id} to ${train.to}`);
                    return null;
                }

                const stats = response.data[0];
                this.log(`✓ Got stats for train ${train.id}:`, stats);
                return {
                    trainId: train.id,
                    station: train.to,
                    onTime: Math.round(stats.onTime * 100),
                    lessThan30late: Math.round(stats.lessThan30late * 100),
                    moreThan30late: Math.round(stats.moreThan30late * 100),
                    cancelled: Math.round(stats.cancelled * 100),
                    count: stats.count
                };
            } catch (error) {
                this.log(`❌ Exception with background script for train ${train.id}:`, error);
                return null;
            }
        }
        
        return null;
    }

    /**
     * Fetch delay statistics for all trains
     */
    async fetchAllDelayStats() {
        const trains = this.trains.filter(t => this.canCallAPI(t));
        this.log(`Fetching delay stats for ${trains.length} trains...`);
        
        const statsPromises = trains.map(train => this.fetchDelayStats(train));
        const allStats = await Promise.all(statsPromises);
        
        // Filter out nulls
        const validStats = allStats.filter(s => s !== null);
        
        this.log(`Retrieved stats for ${validStats.length}/${trains.length} trains`, validStats);
        
        return validStats;
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

    /**
     * Display delay statistics on the page
     */
    displayDelayStats(stats) {
        this.log('Displaying delay statistics', stats);
        
        // Remove any existing forsenad box
        const existingBox = document.getElementById('forsenad-stats-box');
        if (existingBox) {
            existingBox.remove();
        }
        
        // Create the stats box
        const statsBox = document.createElement('div');
        statsBox.id = 'forsenad-stats-box';
        statsBox.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 400px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            background: #f8f9fa;
            color: #333;
            padding: 16px;
            border-bottom: 1px solid #e0e0e0;
        `;
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 600; font-size: 15px;">Förseningsstatistik från forsenad.nu</span>
                <button id="forsenad-close-btn" style="
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                ">×</button>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                Tåg som är upp till 5 minuter försenade räknas som att vara i tid.
            </div>
        `;
        statsBox.appendChild(header);
        
        // Create content area
        const content = document.createElement('div');
        content.style.cssText = 'padding: 20px;';
        
        // Add stats for each train
        stats.forEach((stat, index) => {
            const trainBox = document.createElement('div');
            trainBox.style.cssText = `
                margin-bottom: ${index < stats.length - 1 ? '24px' : '0'};
                padding-bottom: ${index < stats.length - 1 ? '24px' : '0'};
                border-bottom: ${index < stats.length - 1 ? '1px solid #e0e0e0' : 'none'};
            `;
            
            // Horizontal bar chart
            const barChart = `
                <div style="
                    display: flex;
                    height: 48px;
                    border-radius: 8px;
                    overflow: hidden;
                    margin-bottom: 16px;
                ">
                    <div style="
                        background: #10b981;
                        width: ${stat.onTime}%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 600;
                        font-size: 14px;
                    ">${stat.onTime > 8 ? stat.onTime + '%' : ''}</div>
                    <div style="
                        background: #f59e0b;
                        width: ${stat.lessThan30late}%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 600;
                        font-size: 14px;
                    ">${stat.lessThan30late > 8 ? stat.lessThan30late + '%' : ''}</div>
                    <div style="
                        background: #ef4444;
                        width: ${stat.moreThan30late}%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 600;
                        font-size: 14px;
                    ">${stat.moreThan30late > 8 ? stat.moreThan30late + '%' : ''}</div>
                    <div style="
                        background: #9ca3af;
                        width: ${stat.cancelled}%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 600;
                        font-size: 14px;
                    ">${stat.cancelled > 8 ? stat.cancelled + '%' : ''}</div>
                </div>
            `;
            
            // Legend
            const legend = `
                <div style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 12px;
                ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div>
                        <span style="font-size: 13px; color: #4b5563;">I tid (${stat.onTime}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></div>
                        <span style="font-size: 13px; color: #4b5563;">< 30 min (${stat.lessThan30late}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></div>
                        <span style="font-size: 13px; color: #4b5563;">> 30 min (${stat.moreThan30late}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #9ca3af;"></div>
                        <span style="font-size: 13px; color: #4b5563;">Inställt (${stat.cancelled}%)</span>
                    </div>
                </div>
            `;
            
            trainBox.innerHTML = `
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 12px; color: #111827;">
                    Tåg ${stat.trainId} till ${stat.station}
                </div>
                ${barChart}
                ${legend}
                <div style="font-size: 13px; color: #6b7280; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px;">
                    <span>Data från ${stat.count} ankomster</span>
                    <span style="color: #d1d5db;">•</span>
                    <a href="https://www.forsenad.nu/stats-ui/?stationName=${encodeURIComponent(stat.station)}&advertisedTrainIdent=${stat.trainId}&groupBy=month" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                        Detaljer →
                    </a>
                </div>
            `;
            
            content.appendChild(trainBox);
        });
        
        statsBox.appendChild(content);
        
        // Add to page
        document.body.appendChild(statsBox);
        
        // Add close button handler
        document.getElementById('forsenad-close-btn').addEventListener('click', () => {
            statsBox.remove();
        });
        
        this.log('✓ Delay stats displayed on page');
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
