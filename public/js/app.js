// State variables
let parcels = [];
let fileList = [];
let activeFileIndex = -1;
let selectedParcelId = null;
let hoveredParcelId = null;
let currentZipXmls = []; // Array of XML files extracted from loaded ZIP
let currentZipReader = null;
let currentRootZipReaders = [];
let currentNestedZipReaders = [];


// Configure zip.js to run in the main thread (no workers) to prevent worker setup failures.
if (window.zip) {
    zip.configure({
        useWebWorkers: false
    });
}

// Map viewport configuration
let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
const viewState = {
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};

// DOM elements
const dropZone = document.getElementById('dropZone'); // Removed
const fileInput = document.getElementById('fileInput'); // Removed
const prefSelect = document.getElementById('prefSelect');
const citySelect = document.getElementById('citySelect');
const townSelect = document.getElementById('townSelect');
const townSearchInput = document.getElementById('townSearchInput');

const mapTitle = document.getElementById('mapTitle');

const resetViewBtn = document.getElementById('resetViewBtn');
const printModeBtn = document.getElementById('printModeBtn');
const closeXmlBtn = document.getElementById('closeXmlBtn');
const resetViewBtnOverlay = document.getElementById('resetViewBtnOverlay');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const mapCanvas = document.getElementById('mapCanvas');
const viewportContainer = document.getElementById('viewportContainer');
const hoverTooltip = document.getElementById('hoverTooltip');
const statusCoords = document.getElementById('statusCoords');
const statusHovered = document.getElementById('statusHovered');
const statusScale = document.getElementById('statusScale');
const mapSheetSelectContainer = document.getElementById('mapSheetSelectContainer');
const mapSheetSelect = document.getElementById('mapSheetSelect');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessage = document.getElementById('loadingMessage');

function showLoading(msg) {
    if (loadingMessage && loadingOverlay) {
        loadingMessage.textContent = msg;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Canvas context
const ctx = mapCanvas.getContext('2d');

const JGD2011_ZONES = {
    1: "+proj=tmerc +lat_0=33 +lon_0=129.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    2: "+proj=tmerc +lat_0=33 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    3: "+proj=tmerc +lat_0=36 +lon_0=132.1666666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    4: "+proj=tmerc +lat_0=33 +lon_0=133.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    5: "+proj=tmerc +lat_0=36 +lon_0=134.3333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    6: "+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    7: "+proj=tmerc +lat_0=36 +lon_0=137.1666666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    8: "+proj=tmerc +lat_0=36 +lon_0=138.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    9: "+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    10: "+proj=tmerc +lat_0=40 +lon_0=140.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    11: "+proj=tmerc +lat_0=44 +lon_0=140.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    12: "+proj=tmerc +lat_0=44 +lon_0=142.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    13: "+proj=tmerc +lat_0=44 +lon_0=144.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    14: "+proj=tmerc +lat_0=26 +lon_0=142 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    15: "+proj=tmerc +lat_0=26 +lon_0=127.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    16: "+proj=tmerc +lat_0=26 +lon_0=124 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    17: "+proj=tmerc +lat_0=26 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    18: "+proj=tmerc +lat_0=20 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs",
    19: "+proj=tmerc +lat_0=26 +lon_0=154 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs"
};

window.addEventListener('DOMContentLoaded', () => {
    setupResizeHandler();
    setupInteractionEvents();
    // setupFileEvents(); // Removed dead code
    scanDataDirectory();
    
    // Bind Print Mode toggle
    if (printModeBtn) {
        printModeBtn.addEventListener('click', () => {
            document.body.classList.toggle('print-mode');
            updatePrintButtonLabel();
            drawMap();
        });
    }
    
    // Listen to physical print events
    let wasPrintModeBeforePrint = false;
    window.addEventListener('beforeprint', () => {
        wasPrintModeBeforePrint = document.body.classList.contains('print-mode');
        if (!wasPrintModeBeforePrint) {
            document.body.classList.add('print-mode');
            updatePrintButtonLabel();
            drawMap();
        }
    });
    window.addEventListener('afterprint', () => {
        if (!wasPrintModeBeforePrint) {
            document.body.classList.remove('print-mode');
            updatePrintButtonLabel();
            drawMap();
        }
    });
    
    // Bind Map Sheet dropdown change event
    mapSheetSelect.addEventListener('change', () => {
        const index = parseInt(mapSheetSelect.value);
        updateUrlParams();
        if (currentZipXmls[index]) {
            showLoading('XML展開＆パース中...');
            setTimeout(async () => { // small delay to let UI update loading state
                try {
                    let xmlText = currentZipXmls[index].text;
                    if (!xmlText) {
                        if (currentZipXmls[index].lazyLoad) {
                            xmlText = await currentZipXmls[index].lazyLoad();
                        } else {
                            xmlText = await currentZipXmls[index].entry.getData(new zip.TextWriter());
                        }
                        currentZipXmls[index].text = xmlText; // Cache for future switches
                    }
                    parseMojXml(xmlText);
                } catch (err) {
                    alert('XML読み込みエラー: ' + err.message);
                    hideLoading();
                }
            }, 50);
        } else {
            if (typeof mapCanvas !== 'undefined' && mapCanvas) {
                const ctx = mapCanvas.getContext('2d');
                ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
                parcels = [];
                window.currentEpsgCode = null;
                const mapAttribution = document.getElementById('mapAttribution');
                if (mapAttribution) mapAttribution.style.display = 'none';
                drawMap();
            }
        }
    });
});

function updatePrintButtonLabel() {
    if (!printModeBtn) return;
    const isPrint = document.body.classList.contains('print-mode');
    if (isPrint) {
        printModeBtn.textContent = '🌙 通常モード';
        printModeBtn.classList.add('active');
    } else {
        printModeBtn.textContent = '🖨️ 印刷用(白)';
        printModeBtn.classList.remove('active');
    }
}

// Resize canvas to fit container
function setupResizeHandler() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            mapCanvas.width = width;
            mapCanvas.height = height;
            drawMap();
        }
    });
    resizeObserver.observe(viewportContainer);
}

let currentCityXmls = [];

let PREFECTURES = [];
let CITIES = {};

function updateUrlParams() {
    const url = new URL(window.location);
    let changed = false;
    
    if (prefSelect && prefSelect.value !== url.searchParams.get('pref')) { url.searchParams.set('pref', prefSelect.value); changed = true; }
    if (prefSelect && !prefSelect.value && url.searchParams.has('pref')) { url.searchParams.delete('pref'); changed = true; }
    
    if (citySelect && citySelect.value !== url.searchParams.get('city')) { url.searchParams.set('city', citySelect.value); changed = true; }
    if (citySelect && !citySelect.value && url.searchParams.has('city')) { url.searchParams.delete('city'); changed = true; }
    
    if (townSelect && townSelect.value !== url.searchParams.get('town')) { url.searchParams.set('town', townSelect.value); changed = true; }
    if (townSelect && !townSelect.value && url.searchParams.has('town')) { url.searchParams.delete('town'); changed = true; }
    
    if (mapSheetSelectContainer && mapSheetSelect) {
        if (mapSheetSelectContainer.style.display !== 'none' && mapSheetSelect.value !== url.searchParams.get('sheet')) { url.searchParams.set('sheet', mapSheetSelect.value); changed = true; }
        if ((mapSheetSelectContainer.style.display === 'none' || !mapSheetSelect.value) && url.searchParams.has('sheet')) { url.searchParams.delete('sheet'); changed = true; }
    }
    
    if (changed) window.history.replaceState({}, '', url);
}

let globalRootReaders = {};
async function extractXmlFromUrl(url, xmlFilename, nestedZipName) {
    // Use HttpReader to fetch only the needed bytes via HTTP Range requests (avoiding full ZIP download)
    // Cache the reader so we don't re-fetch the central directory when switching map sheets
    if (!globalRootReaders[url]) {
        globalRootReaders[url] = new zip.ZipReader(new zip.HttpRangeReader(url, { preventHeadRequest: true }));
    }
    const rootReader = globalRootReaders[url];
    const entries = await rootReader.getEntries();
    
    let xmlEntry = entries.find(e => e.filename === xmlFilename);
    if (xmlEntry) {
        const text = await xmlEntry.getData(new zip.TextWriter());
        return text;
    }
    
    // If nestedZipName is provided, use it. Otherwise fallback to guessing from xmlFilename
    let targetNestedZip = nestedZipName;
    if (!targetNestedZip) {
        const baseName = xmlFilename.split('/').pop().replace('.xml', '');
        targetNestedZip = `${baseName}.zip`;
    }
    
    const nestedZipEntry = entries.find(e => e.filename.endsWith(`/${targetNestedZip}`) || e.filename === targetNestedZip);
    
    if (nestedZipEntry) {
        const nestedZipBlob = await nestedZipEntry.getData(new zip.BlobWriter());
        const nestedReader = new zip.ZipReader(new zip.BlobReader(nestedZipBlob));
        const nestedEntries = await nestedReader.getEntries();
        xmlEntry = nestedEntries.find(e => e.filename === xmlFilename || e.filename.endsWith('/' + xmlFilename));
        if (xmlEntry) {
            const text = await xmlEntry.getData(new zip.TextWriter());
            await nestedReader.close();
            return text;
        }
    }
    
    throw new Error(`Could not find ${xmlFilename} in ${url}`);
}

async function loadCityZips(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    
    try {
        townSelect.innerHTML = '<option value="">データ解析中...</option>';
        townSelect.disabled = true;
        if (townSearchInput) townSearchInput.style.display = 'none';
        
        await closeCurrentZipReaders();
        
        let allParsedXmls = [];
        
        for (let url of urls) {
            try {
            let cachedData = null;
            try {
                const jsonUrl = url.replace(/\.zip$/, '.json');
                const jsonRes = await fetch(jsonUrl);
                if (jsonRes.ok) {
                    cachedData = await jsonRes.json();
                }
            } catch (e) {
                console.warn('Server cache not found, falling back to local cache.');
            }
            
            if (!cachedData || cachedData.length === 0) {
                cachedData = getCachedMapNames(url);
            }
            
            let parsedXmls = [];
            
            if (cachedData && cachedData.length > 0) {
                // VERY FAST: Load directly from cache without downloading the ZIP
                parsedXmls = cachedData.map(c => {
                    const baseName = c.filename.split('/').pop().replace('.xml', '');
                    let displayMapName = c.mapName;
                    if (c.places && c.places.length > 0) {
                        const rawMapName = c.mapName;
                        let isMapNameDescriptive = false;
                        
                        // Check if the map name already contains any of the places
                        for (const place of c.places) {
                            const placeName = typeof place === 'string' ? place : place.name;
                            const oaza = placeName.split(" ")[0] || "";
                            let oazaCore = oaza;
                            if (oaza.length >= 3 && (oaza.endsWith('町') || oaza.endsWith('村'))) {
                                oazaCore = oaza.slice(0, -1);
                            }
                            if (oazaCore && rawMapName.includes(oazaCore)) {
                                isMapNameDescriptive = true;
                                break;
                            }
                        }
                        
                        if (!isMapNameDescriptive) {
                            const basePlace = typeof c.places[0] === 'string' ? c.places[0] : c.places[0].name;
                            if (c.places.length >= 3 || rawMapName.endsWith('他')) {
                                displayMapName = `${rawMapName} (${basePlace}ほか)`;
                            } else if (c.places.length === 2) {
                                const names = c.places.map(p => typeof p === 'string' ? p : p.name);
                                displayMapName = `${rawMapName} (${names.join('・')})`;
                            } else {
                                displayMapName = `${rawMapName} (${basePlace})`;
                            }
                        }
                    }
                    return {
                        mapName: displayMapName, // Use formatted name for dropdown matching
                        name: `${displayMapName}${c.isPublic ? ' 📍(地図あり)' : ''} (${baseName})`,
                        entry: null,
                        lazyLoad: async () => await extractXmlFromUrl(url, c.filename),
                        text: null,
                        isPublic: c.isPublic,
                        places: c.places || [],
                        filename: c.filename
                    };
                });
            } else {
                // SLOW: Download ZIP and parse to build cache
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch ${url}`);
                const blob = await response.blob();
                downloadedBlobs[url] = blob; // save for lazyLoad
                
                const rootReader = new zip.ZipReader(new zip.BlobReader(blob));
                currentRootZipReaders.push(rootReader);
                
                let xmlFiles = [];
                let entries = await rootReader.getEntries();
                for (let entry of entries) {
                    if (entry.directory) continue;
                    if (entry.filename.endsWith('.xml')) {
                        xmlFiles.push({ name: entry.filename, entry: entry });
                    } else if (entry.filename.endsWith('.zip')) {
                        const nestedZipBlob = await entry.getData(new zip.BlobWriter());
                        const nestedReader = new zip.ZipReader(new zip.BlobReader(nestedZipBlob));
                        currentNestedZipReaders.push(nestedReader);
                        const nestedEntries = await nestedReader.getEntries();
                        for (let nestedEntry of nestedEntries) {
                            if (!nestedEntry.directory && nestedEntry.filename.endsWith('.xml')) {
                                xmlFiles.push({ name: nestedEntry.filename, entry: nestedEntry });
                            }
                        }
                    }
                }
                
                if (xmlFiles.length === 0) continue;
                
                const xmlFilesMetadata = [];
                const promises = xmlFiles.map(async (fileEntry) => {
                    const xmlText = await fileEntry.entry.getData(new zip.TextWriter());
                    const mapNameMatch = xmlText.match(/<(?:[a-zA-Z0-9_]+:)?地図名>(.*?)<\/(?:[a-zA-Z0-9_]+:)?地図名>/);
                    let mapName = mapNameMatch ? mapNameMatch[1] : '不明な地域';
                    
                    const placesCount = {};
                    let currentOaza = "";
                    let currentChome = "";
                    const matches = xmlText.matchAll(/<[^>]*大字名[^>]*>(.*?)<\/[^>]*大字名>|<[^>]*丁目名[^>]*>(.*?)<\/[^>]*丁目名>|<[^>]*地番[^>]*>.*?<\/[^>]*地番>/g);
                    let totalParcels = 0;
                    for (const m of matches) {
                        const tag = m[0];
                        if (tag.includes('大字名')) {
                            currentOaza = m[1] || "";
                        } else if (tag.includes('丁目名')) {
                            currentChome = m[2] || "";
                        } else if (tag.includes('地番')) {
                            const place = `${currentOaza} ${currentChome}`.trim();
                            if (place) {
                                placesCount[place] = (placesCount[place] || 0) + 1;
                                totalParcels++;
                            }
                            currentOaza = "";
                            currentChome = "";
                        }
                    }
                    
                    // Filter out boundary/sliver places (must be at least 5% of total parcels)
                    const threshold = Math.max(1, totalParcels * 0.05);
                    const significantPlaces = Object.entries(placesCount)
                        .filter(([place, count]) => count >= threshold)
                        .sort((a, b) => b[1] - a[1]) // Sort by frequency descending
                        .map(p => p[0]);
                    
                    if (significantPlaces.length > 0) {
                        let isMapNameDescriptive = false;
                        
                        for (const place of significantPlaces) {
                            const placeName = typeof place === 'string' ? place : place.name;
                            const oaza = placeName.split(" ")[0] || "";
                            let oazaCore = oaza;
                            if (oaza.length >= 3 && (oaza.endsWith('町') || oaza.endsWith('村'))) {
                                oazaCore = oaza.slice(0, -1);
                            }
                            if (oazaCore && mapName.includes(oazaCore)) {
                                isMapNameDescriptive = true;
                                break;
                            }
                        }
                        
                        if (!isMapNameDescriptive) {
                            const basePlace = typeof significantPlaces[0] === 'string' ? significantPlaces[0] : significantPlaces[0].name;
                            if (significantPlaces.length >= 3 || mapName.endsWith('他')) {
                                mapName = `${mapName} (${basePlace}ほか)`;
                            } else if (significantPlaces.length === 2) {
                                const names = significantPlaces.map(p => typeof p === 'string' ? p : p.name);
                                mapName = `${mapName} (${names.join('・')})`;
                            } else {
                                mapName = `${mapName} (${basePlace})`;
                            }
                        }
                    }
                    
                    const coordMatch = xmlText.match(/<[^>]*座標系[^>]*>(.*?)<\/[^>]*座標系>/);
                    const coord = coordMatch ? coordMatch[1].trim() : '';
                    const isPublic = /公共(?:測量|座標)\d+系/.test(coord);
                    
                    xmlFilesMetadata.push({ filename: fileEntry.name, mapName: mapName, isPublic: isPublic, places: significantPlaces });
                    
                    const baseName = fileEntry.name.split('/').pop().replace('.xml', '');
                    return {
                        mapName: mapName,
                        name: `${mapName}${isPublic ? ' 📍(地図あり)' : ''} (${baseName})`,
                        entry: fileEntry.entry,
                        lazyLoad: null,
                        text: xmlText,
                        isPublic: isPublic,
                        places: significantPlaces,
                        filename: fileEntry.name
                    };
                });
                parsedXmls = await Promise.all(promises);
                setCachedMapNames(url, xmlFilesMetadata);
            }
            allParsedXmls = allParsedXmls.concat(parsedXmls);
            } catch (err) {
                console.warn(`Failed to process ${url}:`, err);
            }
        }
        
        if (allParsedXmls.length === 0) throw new Error('No XML files found in any ZIP');
        const parsedXmls = allParsedXmls;
        
        currentCityXmls = parsedXmls;
        
        const getSortRank = (str) => {
            const cityName = citySelect.options[citySelect.selectedIndex]?.text || "";
            // 2. 市区町村名で始まるもの
            if (cityName && str.startsWith(cityName)) return 2;
            // 3. 「大字」で始まるもの
            if (str.startsWith("大字")) return 3;
            // 4. a-zA-Z0-9で始まるもの
            if (/^[a-zA-Z0-9]/.test(str)) return 4;
            // 1. 2～4に当てはまらないもの
            return 1;
        };
        
        let oazaMap = new Map();
        parsedXmls.forEach(item => {
            if (item.places && item.places.length > 0) {
                item.places.forEach(place => {
                    const placeName = typeof place === 'string' ? place : place.name;
                    const placeKana = typeof place === 'object' && place.kana ? place.kana : placeName;
                    const oaza = placeName.split(" ")[0] || placeName;
                    const kanaOaza = placeKana.split(" ")[0] || placeKana;
                    if (!oazaMap.has(oaza)) {
                        oazaMap.set(oaza, { kana: kanaOaza, isPublic: item.isPublic });
                    } else {
                        if (item.isPublic) oazaMap.get(oaza).isPublic = true;
                    }
                });
            } else {
                if (!oazaMap.has(item.mapName)) {
                    oazaMap.set(item.mapName, { kana: item.mapName, isPublic: item.isPublic });
                } else {
                    if (item.isPublic) oazaMap.get(item.mapName).isPublic = true;
                }
            }
        });

        let optionsList = [];
        oazaMap.forEach((info, oaza) => {
            optionsList.push({
                value: oaza,
                text: oaza,
                isPublic: info.isPublic,
                sortKey: info.kana
            });
        });
        
        optionsList.sort((a, b) => {
            const rankA = getSortRank(a.sortKey);
            const rankB = getSortRank(b.sortKey);
            if (rankA !== rankB) return rankA - rankB;
            
            const cmp = a.sortKey.localeCompare(b.sortKey, 'ja', { numeric: true });
            if (cmp !== 0) return cmp;
            return a.value.localeCompare(b.value);
        });
        
        window.currentTownOptions = optionsList.map(opt => ({
            value: opt.value,
            text: opt.text
        }));
        
        
        if (window.currentMinJsonUrl) {
            window.currentTownOptions.unshift({ value: "【全域】(座標あり区画のみ)", text: "【全域】(座標あり区画のみ)" });
        }
        renderTownSelect('');
        townSelect.disabled = false;
        
        if (townSearchInput) {
            townSearchInput.style.display = 'block';
            townSearchInput.value = '';
            townSearchInput.disabled = false;
        }
        
    } catch (e) {
        console.error(e);
        townSelect.innerHTML = '<option value="">解析失敗</option>';
    }
}

function renderTownSelect(filterText) {
    if (!window.currentTownOptions) return;
    const currentVal = townSelect.value;
    townSelect.innerHTML = '<option value="">選択してください</option>';
    const lowerFilter = (filterText || '').toLowerCase();
    
    // Split input into multiple keywords separated by space
    const keywords = lowerFilter.split(/\s+/).filter(k => k);
    
    window.currentTownOptions.forEach(opt => {
        // If all keywords are included in the option text, show it
        const match = keywords.every(k => opt.text.toLowerCase().includes(k));
        
        if (keywords.length === 0 || match) {
            const optionEl = document.createElement('option');
            optionEl.value = opt.value;
            optionEl.textContent = opt.text;
            townSelect.appendChild(optionEl);
        }
    });
    
    // Try to restore previous value if it's still available in filtered options
    if (currentVal && Array.from(townSelect.options).some(o => o.value === currentVal)) {
        townSelect.value = currentVal;
    }
}

if (townSearchInput) {
    townSearchInput.addEventListener('input', (e) => {
        renderTownSelect(e.target.value);
    });
}

async function scanDataDirectory() {
    if (!prefSelect) return;
    
    try {
        if (PREFECTURES.length === 0) {
            prefSelect.innerHTML = '<option value="">ロード中...</option>';
            const resp = await fetch('./data/local_govs.json');
            if (resp.ok) {
                const data = await resp.json();
                PREFECTURES = data.prefectures || [];
                CITIES = data.cities || {};
            }
        }
    } catch (e) {
        console.warn("Failed to load local_govs.json", e);
    }
    
    prefSelect.innerHTML = '<option value="">選択してください</option>';
    PREFECTURES.forEach(pref => {
        const opt = document.createElement('option');
        opt.value = pref.code;
        opt.textContent = pref.name;
        prefSelect.appendChild(opt);
    });
    
    prefSelect.addEventListener('change', () => {
        const prefCode = prefSelect.value;
        citySelect.innerHTML = '<option value="">選択してください</option>';
        townSelect.innerHTML = '<option value="">選択してください</option>';
        citySelect.disabled = true;
        townSelect.disabled = true;
        if (townSearchInput) townSearchInput.style.display = 'none';
        mapSheetSelect.innerHTML = '<option value="">所在を選択してください</option>';
        mapSheetSelect.disabled = true;
        
        if (prefCode && CITIES[prefCode]) {
            CITIES[prefCode].forEach(city => {
                const opt = document.createElement('option');
                opt.value = city.code;
                opt.textContent = city.name;
                citySelect.appendChild(opt);
            });
            citySelect.disabled = false;
        }
        updateUrlParams();
    });
    
    const onCityChange = async () => {
        const cityCode = citySelect.value;
        townSelect.innerHTML = '<option value="">ZIP確認中...</option>';
        townSelect.disabled = true;
        if (townSearchInput) townSearchInput.style.display = 'none';
        mapSheetSelect.innerHTML = '<option value="">所在を選択してください</option>';
        mapSheetSelect.disabled = true;
        
        if (cityCode) {
            try {
                const response = await fetch('./data/');
                if (!response.ok) throw new Error('Directory listing not available');
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const links = doc.getElementsByTagName('a');
                
                let zipGroups = {};
                for (let link of links) {
                    const href = link.getAttribute('href');
                    if (href && href.endsWith('.zip')) {
                        const filename = decodeURIComponent(href).split('/').pop();
                        const match = filename.match(new RegExp(`^${cityCode}-([0-9a-zA-Z]+)-([0-9]+)\\.zip$`));
                        if (match) {
                            const registryCode = match[1];
                            const year = parseInt(match[2], 10);
                            if (!zipGroups[registryCode] || zipGroups[registryCode].year < year) {
                                zipGroups[registryCode] = { year: year, url: './data/' + href };
                            }
                        } else if (filename.startsWith(cityCode + '-')) {
                            // Fallback for non-standard filenames
                            if (!zipGroups[filename]) {
                                zipGroups[filename] = { year: 0, url: './data/' + href };
                            }
                        }
                    }
                }
                
                let minJsonUrls = [];
                for (let link of links) {
                    const href = link.getAttribute('href');
                    if (href && href.endsWith('.min.json.gz') && href.startsWith(cityCode)) {
                        minJsonUrls.push('./data/' + decodeURIComponent(href));
                    }
                }
                window.currentMinJsonUrl = minJsonUrls.length > 0 ? minJsonUrls[0] : null;
                
                const foundZipUrls = Object.values(zipGroups).map(g => g.url);
                
                if (foundZipUrls.length === 0) {
                    townSelect.innerHTML = '<option value="">データがありません</option>';
                } else {
                    await loadCityZips(foundZipUrls);
                }
            } catch (err) {
                console.error(err);
                townSelect.innerHTML = '<option value="">スキャンに失敗しました</option>';
            }
        }
        updateUrlParams();
    };
    
    citySelect.addEventListener('change', onCityChange);
    
    const onTownChange = () => {
        const selectedOaza = townSelect.value;
        
        if (selectedOaza === "【全域】(座標あり区画のみ)") {
            mapSheetSelect.innerHTML = '<option value="">【全域】表示中</option>';
            mapSheetSelect.disabled = true;
            loadWholeCity(window.currentMinJsonUrl);
            updateUrlParams();
            return;
        }
        if (selectedOaza && currentCityXmls.length > 0) {
            currentZipXmls = currentCityXmls.filter(item => {
                if (item.places && item.places.length > 0) {
                    return item.places.some(place => {
                        const placeName = typeof place === 'string' ? place : place.name;
                        const oaza = placeName.split(" ")[0] || placeName;
                        return oaza === selectedOaza;
                    });
                } else {
                    return item.mapName === selectedOaza;
                }
            });
            
            // Pre-calculate chomeText for sorting
            currentZipXmls.forEach(item => {
                let chomeText = "";
                if (item.places && item.places.length > 0) {
                    const chomes = [];
                    item.places.forEach(place => {
                        const placeName = typeof place === 'string' ? place : place.name;
                        const parts = placeName.split(" ");
                        const oaza = parts[0] || placeName;
                        if (oaza === selectedOaza && parts.length > 1) {
                            chomes.push(parts.slice(1).join(" "));
                        }
                    });
                    if (chomes.length > 0) {
                        chomes.sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
                        if (chomes.length <= 3) {
                            chomeText = chomes.join("・");
                        } else {
                            chomeText = chomes[0] + "〜" + chomes[chomes.length - 1]; 
                        }
                    } else {
                        chomeText = item.mapName;
                    }
                } else {
                    chomeText = item.mapName;
                }
                item._tempChomeText = chomeText;
            });

            // Sort by chomeText (natural sort)
            currentZipXmls.sort((a, b) => {
                const textA = a._tempChomeText || "";
                const textB = b._tempChomeText || "";
                return textA.localeCompare(textB, 'ja', { numeric: true });
            });
            
            mapSheetSelect.innerHTML = '<option value="">図面を選択してください</option>';
            currentZipXmls.forEach((item, index) => {
                const baseName = item.filename ? item.filename.split('/').pop().replace('.xml', '') : 'unknown';
                const chomeText = item._tempChomeText;
                const option = document.createElement('option');
                option.value = index;
                const displayText = chomeText ? `${chomeText} (${baseName}.xml)` : `(${baseName}.xml)`;
                option.textContent = displayText + (item.isPublic ? ' 📍' : '');
                mapSheetSelect.appendChild(option);
            });
            
            if (currentZipXmls.length > 0) {
                mapSheetSelect.disabled = false;
                mapSheetSelect.value = "";
                mapSheetSelect.dispatchEvent(new Event('change'));
            } else {
                mapSheetSelect.innerHTML = '<option value="">データがありません</option>';
                mapSheetSelect.disabled = true;
            }
        } else {
            mapSheetSelect.innerHTML = '<option value="">所在を選択してください</option>';
            mapSheetSelect.disabled = true;
            if (typeof mapCanvas !== 'undefined' && mapCanvas) {
                const ctx = mapCanvas.getContext('2d');
                ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
                parcels = [];
                window.currentEpsgCode = null;
                const mapAttribution = document.getElementById('mapAttribution');
                if (mapAttribution) mapAttribution.style.display = 'none';
                drawMap();
            }
        }
        updateUrlParams();
    };
    
    townSelect.addEventListener('change', onTownChange);
    
    // Auto-restore selections from URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialPref = urlParams.get('pref');
    const initialCity = urlParams.get('city');
    const initialTown = urlParams.get('town');
    const initialSheet = urlParams.get('sheet');
    
    if (initialPref) {
        prefSelect.value = initialPref;
        prefSelect.dispatchEvent(new Event('change'));
        
        if (initialCity) {
            citySelect.value = initialCity;
            await onCityChange();
            
            if (initialTown) {
                townSelect.value = initialTown;
                if (initialSheet) {
                    // Temporarily hijack mapSheetSelect update in onTownChange by setting it afterwards
                    onTownChange();
                    setTimeout(() => {
                        mapSheetSelect.value = initialSheet;
                        mapSheetSelect.dispatchEvent(new Event('change'));
                    }, 60); // give the small 50ms timeout in onTownChange time to trigger, wait actually better to just call it.
                } else {
                    onTownChange();
                }
            }
        }
    }
}

// 2. File Loading & Zip Parsing (Browser-side using zip.js with range requests support)
// LocalStorage Caching for Region Names
function getCacheKey(fileOrUrl) {
    if (typeof fileOrUrl === 'string') {
        return 'v2_url:' + fileOrUrl;
    } else if (fileOrUrl instanceof File) {
        return 'v2_file:' + fileOrUrl.name + ':' + fileOrUrl.size + ':' + fileOrUrl.lastModified;
    }
    return null;
}

function getCachedMapNames(fileOrUrl) {
    const key = getCacheKey(fileOrUrl);
    if (!key) return null;
    try {
        const cached = localStorage.getItem('kouzu_map_names_cache_' + key);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn('Failed to read from localStorage cache:', e);
    }
    return null;
}

function setCachedMapNames(fileOrUrl, data) {
    const key = getCacheKey(fileOrUrl);
    if (!key) return;
    try {
        localStorage.setItem('kouzu_map_names_cache_' + key, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to write to localStorage cache:', e);
        if (e.name === 'QuotaExceededError') {
            clearOldCaches();
            try {
                localStorage.setItem('kouzu_map_names_cache_' + key, JSON.stringify(data));
            } catch (ex) {
                console.warn('Failed to write to localStorage even after clearing:', ex);
            }
        }
    }
}

function clearOldCaches() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('kouzu_map_names_cache_')) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.warn('Failed to clear old caches:', e);
    }
}

async function closeCurrentZipReaders() {
    if (currentZipReader) {
        try {
            await currentZipReader.close();
        } catch (e) {
            console.warn('Error closing zip reader:', e);
        }
        currentZipReader = null;
    }
    for (let r of currentNestedZipReaders) {
        try {
            await r.close();
        } catch (e) {
            console.warn('Error closing nested zip reader:', e);
        }
    }
    currentNestedZipReaders = [];
}

async function loadFileFromUrl(url, index) {
    try {
        activeFileIndex = index;
        
        showLoading('読込中...');
        parcels = [];
        selectedParcelId = null;
        hoveredParcelId = null;
        
        if (url.endsWith('.zip')) {
            await closeCurrentZipReaders();
            
            // Resolve relative url to absolute if needed, or pass directly
            currentZipReader = new zip.ZipReader(new zip.HttpRangeReader(url, { preventHeadRequest: true }));
            await parseZipReader(currentZipReader, url);
        } else {
            currentZipXmls = [];
            mapSheetSelectContainer.style.display = 'none';
            showLoading('XMLパース中...');
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}`);
            const text = await response.text();
            
            setTimeout(() => {
                try {
                    parseMojXml(text);
                } catch (err) {
                    alert('XMLパースエラー: ' + err.message);
                    hideLoading();
                }
            }, 50);
        }
    } catch (err) {
        console.error(err);
        mapTitle.textContent = '読み込み失敗';
        alert('ファイルの読み込みに失敗しました: ' + err.message);
        hideLoading();
    }
}

async function processFile(file) {
    parcels = [];
    selectedParcelId = null;
    hoveredParcelId = null;
    
    try {
        if (file.name.endsWith('.zip')) {
            showLoading('ZIP展開中...');
            await closeCurrentZipReaders();
            currentZipReader = new zip.ZipReader(new zip.BlobReader(file));
            await parseZipReader(currentZipReader, file);
        } else if (file.name.endsWith('.xml')) {
            currentZipXmls = [];
            mapSheetSelectContainer.style.display = 'none';
            showLoading('XMLパース中...');
            const text = await file.text();
            
            // Allow UI to update loading overlay before blocking parsing logic
            setTimeout(() => {
                try {
                    parseMojXml(text);
                } catch (err) {
                    alert('XMLパースエラー: ' + err.message);
                    hideLoading();
                }
            }, 50);
        } else {
            throw new Error('対応していないファイル形式です (.zip または .xml のみ)');
        }
    } catch (err) {
        console.error(err);
        alert('ファイル処理エラー: ' + err.message);
        mapTitle.textContent = 'エラーが発生しました';
        hideLoading();
    }
}

// Recursively search zip reader for XML files
async function parseZipReader(zipReader, fileOrUrl) {
    let xmlFiles = [];
    let entries;
    try {
        entries = await zipReader.getEntries();
    } catch (err) {
        console.error(err);
        throw new Error('ZIPファイルの解析に失敗しました。ファイルが破損しているか、対応していない形式の可能性があります。');
    }
    
    // Find all files in ZIP
    for (let entry of entries) {
        if (entry.directory) continue;
        
        const filename = entry.filename;
        if (filename.endsWith('.xml')) {
            xmlFiles.push({ name: filename, entry: entry });
        } else if (filename.endsWith('.zip')) {
            // Nested ZIP
            try {
                const nestedZipBlob = await entry.getData(new zip.BlobWriter());
                const nestedReader = new zip.ZipReader(new zip.BlobReader(nestedZipBlob));
                currentNestedZipReaders.push(nestedReader);
                
                const nestedEntries = await nestedReader.getEntries();
                for (let nestedEntry of nestedEntries) {
                    if (!nestedEntry.directory && nestedEntry.filename.endsWith('.xml')) {
                        xmlFiles.push({ name: nestedEntry.filename, entry: nestedEntry });
                    }
                }
            } catch (err) {
                console.warn('Failed to parse nested ZIP:', filename, err);
            }
        }
    }
    
    if (xmlFiles.length === 0) {
        throw new Error('ZIPファイル内に地図XMLファイルが見つかりませんでした。');
    }
    
    // Check cache
    const cachedData = getCachedMapNames(fileOrUrl);
    if (cachedData) {
        currentZipXmls = xmlFiles.map(fileEntry => {
            const cached = cachedData.find(c => c.filename === fileEntry.name);
            let mapName = cached ? cached.mapName : '不明な地域';
            if (cached && cached.places && cached.places.length > 0) {
                const rawMapName = mapName;
                const basePlace = cached.places[0];
                const parts = basePlace.split(" ");
                const oaza = parts[0] || "";
                const chome = parts.slice(1).join(" ") || "";
                
                let oazaCore = oaza;
                if (oaza.length >= 3 && (oaza.endsWith('町') || oaza.endsWith('村'))) {
                    oazaCore = oaza.slice(0, -1);
                }
                
                let shouldAppend = false;
                if (oaza && !rawMapName.includes(oazaCore)) shouldAppend = true;
                else if (chome && !rawMapName.includes(chome) && !oaza) shouldAppend = true;
                
                if (shouldAppend) {
                    if (cached.places.length >= 3 || rawMapName.endsWith('他')) {
                        mapName = `${rawMapName} (${basePlace}ほか)`;
                    } else if (cached.places.length === 2) {
                        mapName = `${rawMapName} (${cached.places.join('・')})`;
                    } else {
                        mapName = `${rawMapName} (${basePlace})`;
                    }
                }
            }
            const baseName = fileEntry.name.split('/').pop().replace('.xml', '');
            return {
                name: `${mapName} (${baseName})`,
                entry: fileEntry.entry,
                text: null
            };
        });
    } else {
        showLoading('地域名を読み込み中...');
        const xmlFilesMetadata = [];
        
        // Read names of all map sheets in parallel
        const promises = xmlFiles.map(async (fileEntry) => {
            const xmlText = await fileEntry.entry.getData(new zip.TextWriter());
            
            // Fast regex to extract region/map name
            const mapNameMatch = xmlText.match(/<(?:[a-zA-Z0-9_]+:)?地図名>(.*?)<\/(?:[a-zA-Z0-9_]+:)?地図名>/);
            let mapName = mapNameMatch ? mapNameMatch[1] : '不明な地域';
            
            const placesSet = new Set();
            let currentOaza = "";
            let currentChome = "";
            const matches = xmlText.matchAll(/<[^>]*大字名[^>]*>(.*?)<\/[^>]*大字名>|<[^>]*丁目名[^>]*>(.*?)<\/[^>]*丁目名>|<[^>]*地番[^>]*>.*?<\/[^>]*地番>/g);
            for (const m of matches) {
                const tag = m[0];
                if (tag.includes('大字名')) {
                    currentOaza = m[1] || "";
                } else if (tag.includes('丁目名')) {
                    currentChome = m[2] || "";
                } else if (tag.includes('地番')) {
                    const place = `${currentOaza} ${currentChome}`.trim();
                    if (place) placesSet.add(place);
                    currentOaza = "";
                    currentChome = "";
                }
            }
            const placesList = Array.from(placesSet).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
            
            if (placesList.length > 0) {
                const basePlace = placesList[0];
                const parts = basePlace.split(" ");
                const oaza = parts[0] || "";
                const chome = parts.slice(1).join(" ") || "";
                
                let oazaCore = oaza;
                if (oaza.length >= 3 && (oaza.endsWith('町') || oaza.endsWith('村'))) {
                    oazaCore = oaza.slice(0, -1);
                }
                
                let shouldAppend = false;
                if (oaza && !mapName.includes(oazaCore)) shouldAppend = true;
                else if (chome && !mapName.includes(chome) && !oaza) shouldAppend = true;
                
                if (shouldAppend) {
                    if (placesList.length >= 3 || mapName.endsWith('他')) {
                        mapName = `${mapName} (${basePlace}ほか)`;
                    } else if (placesList.length === 2) {
                        mapName = `${mapName} (${placesList.join('・')})`;
                    } else {
                        mapName = `${mapName} (${basePlace})`;
                    }
                }
            }
            
            xmlFilesMetadata.push({
                filename: fileEntry.name,
                mapName: mapName
            });
            
            const baseName = fileEntry.name.split('/').pop().replace('.xml', '');
            
            return {
                name: `${mapName} (${baseName})`,
                entry: fileEntry.entry,
                text: xmlText // Cache read XML text in memory since we already loaded it
            };
        });
        
        currentZipXmls = await Promise.all(promises);
        
        // Save metadata to cache
        setCachedMapNames(fileOrUrl, xmlFilesMetadata);
    }
    
    // Clear and build the dropdown selector
    mapSheetSelect.innerHTML = '';
    currentZipXmls.forEach((item, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = item.name;
        mapSheetSelect.appendChild(option);
    });
    
    // Display the selector if there are multiple maps in the ZIP
    if (currentZipXmls.length > 1) {
        mapSheetSelectContainer.style.display = 'block';
        mapSheetSelect.value = 0;
    } else {
        mapSheetSelectContainer.style.display = 'none';
    }
    
    // Load the first map sheet initially
    showLoading('XML展開＆パース中...');
    setTimeout(async () => {
        try {
            let xmlText = currentZipXmls[0].text;
            if (!xmlText) {
                xmlText = await currentZipXmls[0].entry.getData(new zip.TextWriter());
                currentZipXmls[0].text = xmlText; // Cache first map
            }
            parseMojXml(xmlText);
        } catch (err) {
            alert('XMLパースエラー: ' + err.message);
            hideLoading();
        }
    }, 50);
}

// 3. XML Parsing Logic (DOMParser)
function parseMojXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    
    // Check for XML parsing error
    const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parserError) {
        throw new Error('XML構文エラー: ' + parserError.textContent);
    }
    
    // Metadata extraction
    const mapNameEl = xmlDoc.getElementsByTagNameNS('*', '地図名')[0] || xmlDoc.getElementsByTagName('地図名')[0];
    const cityCodeEl = xmlDoc.getElementsByTagNameNS('*', '市区町村コード')[0] || xmlDoc.getElementsByTagName('市区町村コード')[0];
    const cityNameEl = xmlDoc.getElementsByTagNameNS('*', '市区町村名')[0] || xmlDoc.getElementsByTagName('市区町村名')[0];
    const crsEl = xmlDoc.getElementsByTagNameNS('*', '座標系')[0] || xmlDoc.getElementsByTagName('座標系')[0];
    
    const mapName = mapNameEl ? mapNameEl.textContent : '不明な地図';
    const cityCode = cityCodeEl ? cityCodeEl.textContent : '';
    const cityName = cityNameEl ? cityNameEl.textContent : '';
    const crsName = crsEl ? crsEl.textContent : '任意座標系';
    window.currentCoordinateSystem = crsName;
    
    let epsgCode = null;
    const match = crsName.match(/公共(?:測量|座標)(\d+)系/);
    if (match) {
        const zone = parseInt(match[1]);
        if (JGD2011_ZONES[zone]) {
            epsgCode = "EPSG:66" + (68 + zone);
            proj4.defs(epsgCode, JGD2011_ZONES[zone]);
        }
    }
    window.currentEpsgCode = epsgCode;
    
    const toggleContainer = document.getElementById('mapTileToggleContainer');
    if (toggleContainer) {
        toggleContainer.style.display = epsgCode ? 'block' : 'none';
    }
    
    // Update map attribution visibility
    const toggleGsiMap = document.getElementById('toggleGsiMap');
    const mapAttribution = document.getElementById('mapAttribution');
    if (mapAttribution && toggleGsiMap) {
        mapAttribution.style.display = (epsgCode && toggleGsiMap.checked) ? 'block' : 'none';
    }
    
    let displayTitle = mapName;
    const tSelect = document.getElementById('townSelect');
    const mSelect = document.getElementById('mapSheetSelect');
    if (tSelect && tSelect.value && mSelect && mSelect.value && !mSelect.disabled) {
        const selectedTown = tSelect.options[tSelect.selectedIndex].text;
        const selectedSheet = mSelect.options[mSelect.selectedIndex].text;
        displayTitle = `${cityName || ''} ${selectedTown} ${selectedSheet}`.trim();
    }
    
    mapTitle.textContent = displayTitle;
    
    if (typeof closeXmlBtn !== 'undefined' && closeXmlBtn) {
        closeXmlBtn.style.display = 'block';
        if (printModeBtn) printModeBtn.style.display = 'block';
        if (resetViewBtn) resetViewBtn.style.display = 'block';
    }
    
    // 1. Extract Points (GM_Point)
    const points = {};
    const pointElements = xmlDoc.getElementsByTagNameNS('*', 'GM_Point');
    for (let i = 0; i < pointElements.length; i++) {
        const pt = pointElements[i];
        const id = pt.getAttribute('id');
        const xEl = pt.getElementsByTagNameNS('*', 'X')[0];
        const yEl = pt.getElementsByTagNameNS('*', 'Y')[0];
        if (id && xEl && yEl) {
            let px = parseFloat(xEl.textContent);
            let py = parseFloat(yEl.textContent);
            if (epsgCode) {
                const lonlat = proj4(epsgCode, "EPSG:4326", [py, px]);
                const wm = proj4("EPSG:4326", "EPSG:3857", lonlat);
                px = wm[1];
                py = wm[0];
            }
            points[id] = { x: px, y: py };
        }
    }
    
    // 2. Extract Curves/Lines (GM_Curve)
    const curves = {};
    const curveElements = xmlDoc.getElementsByTagNameNS('*', 'GM_Curve');
    for (let i = 0; i < curveElements.length; i++) {
        const cv = curveElements[i];
        const id = cv.getAttribute('id');
        curves[id] = [];
        
        // Get all column/point references in standard order
        let columns = cv.getElementsByTagNameNS('*', 'GM_PointArray.column');
        if (columns.length === 0) {
            columns = cv.getElementsByTagNameNS('*', 'column');
        }
        for (let j = 0; j < columns.length; j++) {
            const col = columns[j];
            const indirect = col.getElementsByTagNameNS('*', 'GM_PointRef.point')[0] || col.getElementsByTagNameNS('*', 'point')[0];
            if (indirect) {
                const idref = indirect.getAttribute('idref');
                if (idref && points[idref]) {
                    curves[id].push(points[idref]);
                }
            } else {
                const direct = col.getElementsByTagNameNS('*', 'GM_Position.direct')[0] || col.getElementsByTagNameNS('*', 'direct')[0];
                if (direct) {
                    const xEl = direct.getElementsByTagNameNS('*', 'X')[0];
                    const yEl = direct.getElementsByTagNameNS('*', 'Y')[0];
                    if (xEl && yEl) {
                        let px = parseFloat(xEl.textContent);
                        let py = parseFloat(yEl.textContent);
                        if (window.currentEpsgCode) {
                            const lonlat = proj4(window.currentEpsgCode, "EPSG:4326", [py, px]);
                            const wm = proj4("EPSG:4326", "EPSG:3857", lonlat);
                            px = wm[1];
                            py = wm[0];
                        }
                        curves[id].push({ x: px, y: py });
                    }
                }
            }
        }
    }
    
    // 3. Extract Surfaces (GM_Surface)
    const surfaces = {};
    const surfaceElements = xmlDoc.getElementsByTagNameNS('*', 'GM_Surface');
    for (let i = 0; i < surfaceElements.length; i++) {
        const sf = surfaceElements[i];
        const id = sf.getAttribute('id');
        
        // Exterior Boundary
        const exteriorRing = sf.getElementsByTagNameNS('*', 'GM_SurfaceBoundary.exterior')[0] || sf.getElementsByTagNameNS('*', 'exterior')[0];
        const exteriorCoords = [];
        if (exteriorRing) {
            let generators = exteriorRing.getElementsByTagNameNS('*', 'GM_CompositeCurve.generator');
            if (generators.length === 0) {
                generators = exteriorRing.getElementsByTagNameNS('*', 'generator');
            }
            for (let j = 0; j < generators.length; j++) {
                const idref = generators[j].getAttribute('idref');
                if (idref && curves[idref]) {
                    exteriorCoords.push(...curves[idref]);
                }
            }
        }
        
        // Interior Boundaries (Holes)
        const interiorCoordsList = [];
        let interiorRings = sf.getElementsByTagNameNS('*', 'GM_SurfaceBoundary.interior');
        if (interiorRings.length === 0) {
            interiorRings = sf.getElementsByTagNameNS('*', 'interior');
        }
        for (let j = 0; j < interiorRings.length; j++) {
            const coords = [];
            let generators = interiorRings[j].getElementsByTagNameNS('*', 'GM_CompositeCurve.generator');
            if (generators.length === 0) {
                generators = interiorRings[j].getElementsByTagNameNS('*', 'generator');
            }
            for (let k = 0; k < generators.length; k++) {
                const idref = generators[k].getAttribute('idref');
                if (idref && curves[idref]) {
                    coords.push(...curves[idref]);
                }
            }
            if (coords.length > 0) {
                interiorCoordsList.push(coords);
            }
        }
        
        const cleanExterior = cleanDuplicates(exteriorCoords);
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        cleanExterior.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });

        surfaces[id] = {
            exterior: cleanExterior,
            interiors: interiorCoordsList.map(cleanDuplicates),
            bbox: { minX, maxX, minY, maxY }
        };
    }
    
    // Remove duplicate sequential points in paths
    function cleanDuplicates(arr) {
        return arr.filter((pt, index) => {
            if (index === 0) return true;
            const prev = arr[index - 1];
            return Math.abs(pt.x - prev.x) > 1e-7 || Math.abs(pt.y - prev.y) > 1e-7;
        });
    }
    
    // 4. Extract Parcels (筆)
    const fudeElements = xmlDoc.getElementsByTagNameNS('*', '筆') || xmlDoc.getElementsByTagName('筆');
    const tempParcels = [];
    
    for (let i = 0; i < fudeElements.length; i++) {
        const fude = fudeElements[i];
        const id = fude.getAttribute('id');
        
        let chiban = '地番不明';
        let shapeRef = null;
        let scale = '--';
        let accuracy = '--';
        let typeValue = '--';
        let chome = '';
        
        // 追加のメタデータ
        let ooaza = '';
        let ooazaCode = '';
        let chomeCode = '';
        let koaza = '';
        let koazaCode = '';
        let choban = '';
        let hikaiMitei = 'false';
        let chibanAreaCode = '';
        
        // 筆ノードの直下の子要素のみを巡回して取得（getElementsByTagNameNSによる毎回の子要素ツリー全体探索を防ぎ高速化）
        let child = fude.firstElementChild;
        while (child) {
            const localName = child.localName;
            if (localName === '地番') {
                chiban = child.textContent;
            } else if (localName === '形状') {
                shapeRef = child.getAttribute('idref');
            } else if (localName === '縮尺分母') {
                scale = child.textContent;
            } else if (localName === '精度区分') {
                accuracy = child.textContent;
            } else if (localName === '座標値種別') {
                typeValue = child.textContent;
            } else if (localName === '丁目名') {
                chome = child.textContent.trim();
            } else if (localName === '大字名') {
                ooaza = child.textContent.trim();
            } else if (localName === '大字コード') {
                ooazaCode = child.textContent.trim();
            } else if (localName === '丁目コード') {
                chomeCode = child.textContent.trim();
            } else if (localName === '小字名') {
                koaza = child.textContent.trim();
            } else if (localName === '小字コード') {
                koazaCode = child.textContent.trim();
            } else if (localName === '丁番') {
                choban = child.textContent.trim();
            } else if (localName === '筆界未定区分' || localName === '筆界未定') {
                hikaiMitei = child.textContent.trim();
            } else if (localName === '地番区域コード') {
                chibanAreaCode = child.textContent.trim();
            }
            child = child.nextElementSibling;
        }
        
        if (shapeRef && surfaces[shapeRef]) {
            if (!chome) {
                // 地番から丁目を抽出
                const match = chiban.match(/(一|二|三|四|五|六|七|八|九|十|\d)丁目/);
                chome = match ? match[0] : 'その他';
            }
            
            // Precompute centroid
            const geom = surfaces[shapeRef];
            let sumX = 0, sumY = 0;
            geom.exterior.forEach(pt => {
                sumX += pt.x;
                sumY += pt.y;
            });
            const centroidX = sumX / geom.exterior.length;
            const centroidY = sumY / geom.exterior.length;
            
            tempParcels.push({
                id: id || `F-${i}`,
                chiban: chiban,
                scale: scale,
                accuracy: accuracy,
                type: typeValue,
                chome: chome,
                geometry: geom,
                centroid: { x: centroidX, y: centroidY },
                ooaza: ooaza,
                ooazaCode: ooazaCode,
                chomeCode: chomeCode,
                koaza: koaza,
                koazaCode: koazaCode,
                choban: choban,
                hikaiMitei: hikaiMitei,
                chibanAreaCode: chibanAreaCode
            });
        }
    }
    
    parcels = tempParcels;
    
    // Calculate global bounding box
    calculateBounds();
    
    // Reset viewport zoom to fit
    resetView();
    
    // Redraw map
    drawMap();
    
    // Hide loading screen
    hideLoading();
}

// Calculate the bounding box containing all shapes
function calculateBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    parcels.forEach(p => {
        const bbox = p.geometry.bbox;
        if (bbox) {
            if (bbox.minX < minX) minX = bbox.minX;
            if (bbox.maxX > maxX) maxX = bbox.maxX;
            if (bbox.minY < minY) minY = bbox.minY;
            if (bbox.maxY > maxY) maxY = bbox.maxY;
        }
    });
    

    if (minX === Infinity) {
        bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    } else {
        bounds = { minX, maxX, minY, maxY };
    }
    
    
}

function resetView() {
    if (!bounds || bounds.minX === Infinity) return;
    
    const padding = 40;
    // Spatial Y maps to screen X, Spatial X maps to screen Y (reversed)
    const viewWidth = bounds.maxY - bounds.minY;
    const viewHeight = bounds.maxX - bounds.minX;
    
    if (viewWidth > 0 && viewHeight > 0) {
        const scaleX = (mapCanvas.width - padding * 2) / viewWidth;
        const scaleY = (mapCanvas.height - padding * 2) / viewHeight;
        viewState.zoom = Math.max(0.01, Math.min(scaleX, scaleY));
    } else {
        viewState.zoom = 1;
    }
    
    viewState.offsetX = (mapCanvas.width - viewWidth * viewState.zoom) / 2;
    viewState.offsetY = (mapCanvas.height - viewHeight * viewState.zoom) / 2;
    
    updateStatusScale();
    drawMap();
    if (typeof triggerSidebarUpdate !== 'undefined') triggerSidebarUpdate();
}

function updateStatusScale() {
    if (statusScale) {
        statusScale.textContent = `倍率: ${Math.round(viewState.zoom * 100)}%`;
    }
}
// 5. Canvas Vector Rendering

function drawMap() {
    ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    const isPrint = document.body.classList.contains('print-mode');
    
    // Always fill background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    
    if (parcels.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('XMLデータを読み込んでください', mapCanvas.width / 2, mapCanvas.height / 2);
        return;
    }
    
    // Draw grid background (optional but matches rich aesthetics)
    drawGrid();
    
    // Draw GSI tiles if in Web Mercator
    const toggle = document.getElementById('toggleGsiMap');
    if (window.currentEpsgCode && !isPrint && (!toggle || toggle.checked)) {
        drawGsiTiles();
    }
    
    // 1. Calculate spatial bounds of the current viewport (Inverse of rendering math)
    const spatialMinY = (0 - viewState.offsetX) / viewState.zoom + bounds.minY;
    const spatialMaxY = (mapCanvas.width - viewState.offsetX) / viewState.zoom + bounds.minY;
    const spatialMaxX = bounds.maxX - (0 - viewState.offsetY) / viewState.zoom;
    const spatialMinX = bounds.maxX - (mapCanvas.height - viewState.offsetY) / viewState.zoom;

    // 2. Filter visible parcels with early exit
    const visibleParcels = [];
    
    for (let i = 0; i < parcels.length; i++) {
        const p = parcels[i];
        const bbox = p.geometry.bbox;
        
        if (bbox && p.id !== selectedParcelId && p.id !== hoveredParcelId) {
            // Check if bbox is completely outside the spatial bounds
            if (bbox.maxX < spatialMinX || bbox.minX > spatialMaxX || 
                bbox.maxY < spatialMinY || bbox.minY > spatialMaxY) {
                continue; // Off-screen
            }
        }
        
        visibleParcels.push(p);
    }
    
    // 3. Draw visible parcels
    visibleParcels.forEach(p => {
        const isSelected = p.id === selectedParcelId;
        const isHovered = p.id === hoveredParcelId;
        
        ctx.beginPath();
        p.geometry.exterior.forEach((pt, index) => {
            const sx = (pt.y - bounds.minY) * viewState.zoom + viewState.offsetX;
            const sy = (bounds.maxX - pt.x) * viewState.zoom + viewState.offsetY;
            if (index === 0) {
                ctx.moveTo(sx, sy);
            } else {
                ctx.lineTo(sx, sy);
            }
        });
        ctx.closePath();
        
        if (isSelected) {
            ctx.fillStyle = isPrint ? 'rgba(37, 99, 235, 0.25)' : 'rgba(59, 130, 246, 0.45)';
            ctx.strokeStyle = isPrint ? '#1d4ed8' : '#60a5fa';
            ctx.lineWidth = 2.5;
        } else if (isHovered) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.strokeStyle = (window.mapSettings && window.mapSettings.lineColor) || '#000000';
            ctx.lineWidth = 2.0;
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.strokeStyle = (window.mapSettings && window.mapSettings.lineColor) || '#000000';
            ctx.lineWidth = 1.0;
        }
        ctx.fill();
        ctx.stroke();
    });
    
    // 4. Draw lot numbers (地番) labels on top of visible parcels
    // Draw only if zoom level is reasonably large so text doesn't clutter
    if (viewState.zoom > 0.3) {
        ctx.fillStyle = (window.mapSettings && window.mapSettings.textColor) || '#333333';
        ctx.font = '10px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        visibleParcels.forEach(p => {
            const sx = (p.centroid.y - bounds.minY) * viewState.zoom + viewState.offsetX;
            const sy = (bounds.maxX - p.centroid.x) * viewState.zoom + viewState.offsetY;
            
            // Draw text if inside canvas bounds
            if (sx > 0 && sx < mapCanvas.width && sy > 0 && sy < mapCanvas.height) {
                // Shorten text if too long (e.g. "下落合三丁目101-1" -> "101-1")
                const match = p.chiban.match(/\d+-\d+|\d+/);
                const shortChiban = match ? match[0] : p.chiban;
                ctx.fillText(shortChiban, sx, sy);
            }
        });
    }
}

// Background grid coordinates helper
function drawGrid() {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 0.5;
    
    const step = 50 * viewState.zoom; // grid line every 50 meters (scaled)
    if (step < 10) return; // avoid drawing infinite dense grid lines
    
    // Grid lines along X
    const startX = viewState.offsetX % step;
    for (let x = startX; x < mapCanvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapCanvas.height);
        ctx.stroke();
    }
    
    // Grid lines along Y
    const startY = viewState.offsetY % step;
    for (let y = startY; y < mapCanvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mapCanvas.width, y);
        ctx.stroke();
    }
}

// Global cache for GSI tile images
const tileCache = {};

function drawGsiTiles() {
    // Top-left of canvas in Web Mercator
    const wm_x_min = (0 - viewState.offsetX) / viewState.zoom + bounds.minY;
    const wm_y_max = bounds.maxX - (0 - viewState.offsetY) / viewState.zoom;
    
    // Bottom-right of canvas in Web Mercator
    const wm_x_max = (mapCanvas.width - viewState.offsetX) / viewState.zoom + bounds.minY;
    const wm_y_min = bounds.maxX - (mapCanvas.height - viewState.offsetY) / viewState.zoom;
    
    const earth = 40075016.68557849;
    
    // Determine required zoom level Z
    let Z = Math.floor(Math.log2(viewState.zoom * earth / 256));
    if (Z < 0) Z = 0;
    if (Z > 18) Z = 18; 
    
    function wmToTile(wx, wy, z) {
        const shift = earth / 2;
        const tx = (wx + shift) / earth * Math.pow(2, z);
        const ty = (shift - wy) / earth * Math.pow(2, z);
        return { tx, ty };
    }
    
    const tl = wmToTile(wm_x_min, wm_y_max, Z);
    const br = wmToTile(wm_x_max, wm_y_min, Z);
    
    const tx_min = Math.floor(tl.tx);
    const tx_max = Math.floor(br.tx);
    const ty_min = Math.floor(tl.ty);
    const ty_max = Math.floor(br.ty);
    
    // Safety limit to avoid crashing the browser with too many tiles
    if ((tx_max - tx_min + 1) * (ty_max - ty_min + 1) > 150) return;
    
    const tileSizeWM = earth / Math.pow(2, Z);
    
    for (let tx = tx_min; tx <= tx_max; tx++) {
        for (let ty = ty_min; ty <= ty_max; ty++) {
            const url = `https://cyberjapandata.gsi.go.jp/xyz/std/${Z}/${tx}/${ty}.png`;
            
            const tile_wm_x = tx * tileSizeWM - (earth / 2);
            const tile_wm_y = (earth / 2) - ty * tileSizeWM;
            
            const sx = (tile_wm_x - bounds.minY) * viewState.zoom + viewState.offsetX;
            const sy = (bounds.maxX - tile_wm_y) * viewState.zoom + viewState.offsetY;
            const size = tileSizeWM * viewState.zoom;
            
            if (!tileCache[url]) {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = url;
                img.loaded = false;
                img.onload = () => {
                    img.loaded = true;
                    drawMap(); // redraw map when tile loads
                };
                tileCache[url] = img;
            }
            
            const img = tileCache[url];
            if (img.loaded) {
                // ceil size and add 1 to prevent sub-pixel gaps between tiles
                ctx.drawImage(img, Math.floor(sx), Math.floor(sy), Math.ceil(size)+1, Math.ceil(size)+1);
            }
        }
    }
}

// Selection handling
function selectParcel(id, zoomTo = false) {
    selectedParcelId = id;
    hoveredParcelId = null;
    
    const p = parcels.find(item => item.id === id);
    if (p) {
        statusHovered.textContent = '選択中: ' + p.chiban;
        updateDetailPanel(p);
        
        if (zoomTo) {
            // Set scale to a reasonable zoomed-in view
            viewState.zoom = Math.max(viewState.zoom, 2.5); // Ensure zoomed in
            viewState.offsetX = mapCanvas.width / 2 - (p.centroid.y - bounds.minY) * viewState.zoom;
            viewState.offsetY = mapCanvas.height / 2 - (bounds.maxX - p.centroid.x) * viewState.zoom;
            updateStatusScale();
        }
    } else {
        statusHovered.textContent = '選択中: なし';
    }
    if (activeFileIndex >= 0 && activeFileIndex < fileList.length) {
        processXmlContent(fileList[activeFileIndex].content, fileList[activeFileIndex].name);
    }
    
    drawMap();
}

let appMapUpdateTimer = null;
function triggerSidebarUpdate() {
    if (parcels.length > 0 && window.currentEpsgCode && typeof proj4 !== 'undefined') {
        const wm_cx = (mapCanvas.width / 2 - viewState.offsetX) / viewState.zoom + bounds.minY;
        const wm_cy = bounds.maxX - (mapCanvas.height / 2 - viewState.offsetY) / viewState.zoom;
        const lonlat = proj4("EPSG:3857", "EPSG:4326", [wm_cx, wm_cy]);
        
        if (window.slippyMapState) {
            window.slippyMapState.lon = lonlat[0];
            window.slippyMapState.lat = lonlat[1];
            let z = Math.log2(viewState.zoom * 40075016.68557849 / 256);
            window.slippyMapState.zoom = Math.max(5, Math.min(24, z));
            
            clearTimeout(appMapUpdateTimer);
            appMapUpdateTimer = setTimeout(() => {
                if (window.updateArbitrarySidebar) {
                    window.updateArbitrarySidebar();
                }
            }, 500);
        }
    }
}

// 7. Mouse/Touch interactions for Zoom & Pan
function setupInteractionEvents() {
    viewportContainer.addEventListener('mousedown', e => {
        e.preventDefault(); // Prevent native HTML5 drag/text selection
        viewState.isDragging = true;
        viewState.startX = e.clientX;
        viewState.startY = e.clientY;
        viewportContainer.style.cursor = 'grabbing';
    });
    
    window.addEventListener('mouseup', () => {
        if (viewState.isDragging) {
            viewState.isDragging = false;
            viewportContainer.style.cursor = 'grab';
        }
    });

    viewportContainer.addEventListener('mouseleave', () => {
        if (viewState.isDragging) {
            viewState.isDragging = false;
            viewportContainer.style.cursor = 'grab';
        }
    });
    
    viewportContainer.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            viewState.isDragging = true;
            viewState.isPinching = false;
            viewState.startX = e.touches[0].clientX;
            viewState.startY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            viewState.isDragging = false;
            viewState.isPinching = true;
            viewState.pinchStartDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            viewState.pinchStartZoom = viewState.zoom;
            
            const rect = mapCanvas.getBoundingClientRect();
            viewState.pinchStartCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            viewState.pinchStartCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            
            viewState.pinchStartOffsetX = viewState.offsetX;
            viewState.pinchStartOffsetY = viewState.offsetY;
        }
    }, {passive: true});

    window.addEventListener('touchend', e => {
        if (e.touches.length === 0) {
            viewState.isDragging = false;
            viewState.isPinching = false;
        } else if (e.touches.length === 1) {
            // Re-init drag if one finger is lifted during pinch
            viewState.isPinching = false;
            viewState.isDragging = true;
            viewState.startX = e.touches[0].clientX;
            viewState.startY = e.touches[0].clientY;
        }
    });

    viewportContainer.addEventListener('touchmove', e => {
        if (parcels.length === 0) return;
        if (viewState.isDragging && e.touches.length === 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - viewState.startX;
            const dy = e.touches[0].clientY - viewState.startY;
            viewState.offsetX += dx;
            viewState.offsetY += dy;
            viewState.startX = e.touches[0].clientX;
            viewState.startY = e.touches[0].clientY;
            drawMap();
            triggerSidebarUpdate();
        } else if (viewState.isPinching && e.touches.length === 2) {
            e.preventDefault();
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (viewState.pinchStartDist === 0) return;
            
            const zoomFactor = currentDist / viewState.pinchStartDist;
            const oldZoom = viewState.pinchStartZoom;
            const newZoom = Math.max(0.01, Math.min(100, oldZoom * zoomFactor));
            viewState.zoom = newZoom;
            
            const rect = mapCanvas.getBoundingClientRect();
            const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            
            viewState.offsetX = currentCenterX - (viewState.pinchStartCenterX - viewState.pinchStartOffsetX) * (newZoom / oldZoom);
            viewState.offsetY = currentCenterY - (viewState.pinchStartCenterY - viewState.pinchStartOffsetY) * (newZoom / oldZoom);
            
            updateStatusScale();
            drawMap();
            triggerSidebarUpdate();
        }
    }, {passive: false});
    
    viewportContainer.addEventListener('mousemove', e => {
        if (parcels.length === 0) return;
        // Handle drag panning
        if (viewState.isDragging) {
            const dx = e.clientX - viewState.startX;
            const dy = e.clientY - viewState.startY;
            viewState.offsetX += dx;
            viewState.offsetY += dy;
            viewState.startX = e.clientX;
            viewState.startY = e.clientY;
            drawMap();
            triggerSidebarUpdate();
            return;
        }
        
        // Handle coordinates and hover details
        const rect = mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        // Convert screen coordinate to XML spatial coordinate
        const spatialY = (mx - viewState.offsetX) / viewState.zoom + bounds.minY;
        const spatialX = bounds.maxX - (my - viewState.offsetY) / viewState.zoom;
        
        statusCoords.textContent = `X: ${spatialX.toFixed(3)}, Y: ${spatialY.toFixed(3)}`;
        
        // Find parcel under mouse
        const pUnderMouse = findParcelAt(spatialX, spatialY);
        if (pUnderMouse) {
            if (hoveredParcelId !== pUnderMouse.id) {
                hoveredParcelId = pUnderMouse.id;
                viewportContainer.style.cursor = 'pointer';
                
                let placeStr = '';
                if (pUnderMouse.ooaza) placeStr += pUnderMouse.ooaza;
                if (pUnderMouse.chome && pUnderMouse.chome !== 'その他' && pUnderMouse.chome !== '--') placeStr += (placeStr ? ' ' : '') + pUnderMouse.chome;
                if (pUnderMouse.koaza) placeStr += (placeStr ? ' ' : '') + pUnderMouse.koaza;
                
                hoverTooltip.innerHTML = `
                    <strong>地番: ${pUnderMouse.chiban}</strong><br>
                    所在: ${placeStr || '不明'}
                `;
                hoverTooltip.style.left = (mx + 15) + 'px';
                hoverTooltip.style.top = (my + 15) + 'px';
                hoverTooltip.style.display = 'block';
                drawMap();
            } else {
                // Just move tooltip
                hoverTooltip.style.left = (mx + 15) + 'px';
                hoverTooltip.style.top = (my + 15) + 'px';
            }
        } else {
            if (hoveredParcelId !== null) {
                hoveredParcelId = null;
                viewportContainer.style.cursor = 'grab';
                hoverTooltip.style.display = 'none';
                drawMap();
            }
        }
    });
    
    // Zoom centered on cursor position (mouse wheel)
    viewportContainer.addEventListener('wheel', e => {
        e.preventDefault();
        
        const rect = mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        // Zoom factors
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const oldZoom = viewState.zoom;
        const newZoom = Math.max(0.01, Math.min(100, oldZoom * zoomFactor));
        
        // Adjust offsets to keep mouse point anchored in spatial coords
        viewState.offsetX = mx - (mx - viewState.offsetX) * (newZoom / oldZoom);
        viewState.offsetY = my - (my - viewState.offsetY) * (newZoom / oldZoom);
        viewState.zoom = newZoom;
        
        updateStatusScale();
        drawMap();
        triggerSidebarUpdate();
    }, { passive: false });
    
    // Click to select
    viewportContainer.addEventListener('click', e => {
        if (parcels.length === 0) return; // Prevent interference with slippy_map clicks
        if (e.target.tagName === 'BUTTON') return; // Ignore click on controls overlay
        
        const rect = mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        // Convert screen coordinate to XML spatial coordinate
        const spatialY = (mx - viewState.offsetX) / viewState.zoom + bounds.minY;
        const spatialX = bounds.maxX - (my - viewState.offsetY) / viewState.zoom;
        
        const pUnderMouse = findParcelAt(spatialX, spatialY);
        if (pUnderMouse) {
            selectParcel(pUnderMouse.id);
        } else {
            selectedParcelId = null;
            statusHovered.textContent = '選択中: なし';
            drawMap();
            
            // Clear detail panel
            updateDetailPanel(null);
        }
    });
    
    // Navigation controls
    resetViewBtn.addEventListener('click', resetView);
    resetViewBtnOverlay.addEventListener('click', resetView);
    
    if (closeXmlBtn) {
        closeXmlBtn.addEventListener('click', () => {
            parcels = [];
            window.currentEpsgCode = null;
            document.getElementById('mapTitle').textContent = '';
            closeXmlBtn.style.display = 'none';
            if (printModeBtn) printModeBtn.style.display = 'none';
            if (resetViewBtn) resetViewBtn.style.display = 'none';
            if (window.drawMap) window.drawMap();
            if (window.updateArbitrarySidebar) window.updateArbitrarySidebar();
        });
    }
    
    const toggleGsiMap = document.getElementById('toggleGsiMap');
    if (toggleGsiMap) {
        toggleGsiMap.addEventListener('change', () => {
            const mapAttribution = document.getElementById('mapAttribution');
            if (mapAttribution) {
                mapAttribution.style.display = (window.currentEpsgCode && toggleGsiMap.checked) ? 'block' : 'none';
            }
            drawMap();
        });
    }
    
    zoomInBtn.addEventListener('click', () => {
        const oldZoom = viewState.zoom;
        viewState.zoom = Math.min(100, oldZoom * 1.3);
        viewState.offsetX = mapCanvas.width / 2 - (mapCanvas.width / 2 - viewState.offsetX) * (viewState.zoom / oldZoom);
        viewState.offsetY = mapCanvas.height / 2 - (mapCanvas.height / 2 - viewState.offsetY) * (viewState.zoom / oldZoom);
        updateStatusScale();
        drawMap();
    });
    
    zoomOutBtn.addEventListener('click', () => {
        const oldZoom = viewState.zoom;
        viewState.zoom = Math.max(0.01, oldZoom * 0.7);
        viewState.offsetX = mapCanvas.width / 2 - (mapCanvas.width / 2 - viewState.offsetX) * (viewState.zoom / oldZoom);
        viewState.offsetY = mapCanvas.height / 2 - (mapCanvas.height / 2 - viewState.offsetY) * (viewState.zoom / oldZoom);
        updateStatusScale();
        drawMap();
    });
}

// Ray-casting point-in-polygon algorithm
function findParcelAt(x, y) {
    // Traverse backwards so top/later items are prioritized
    for (let i = parcels.length - 1; i >= 0; i--) {
        const p = parcels[i];
        const bbox = p.geometry.bbox;
        
        // Fast AABB bounding box pre-filter
        if (bbox && (x < bbox.minX || x > bbox.maxX || y < bbox.minY || y > bbox.maxY)) {
            continue;
        }
        
        if (isPointInPolygon({ x, y }, p.geometry.exterior)) {
            // Also check that it's not inside any interior hole
            let insideHole = false;
            for (let hole of p.geometry.interiors) {
                if (isPointInPolygon({ x, y }, hole)) {
                    insideHole = true;
                    break;
                }
            }
            if (!insideHole) return p;
        }
    }
    return null;
}

function isPointInPolygon(pt, poly) {
    let x = pt.x, y = pt.y;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, yi = poly[i].y;
        let xj = poly[j].x, yj = poly[j].y;
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// 8. File Pickers / Drop zone setup (Removed as UI was changed)


// Update the details panel on the sidebar
function updateDetailPanel(parcel) {
    const container = document.getElementById('detailContent');
    
    if (!container) return;
    
    if (!parcel) {
        container.innerHTML = '<p class="empty-msg" style="padding: 10px 0;">筆を選択すると詳細情報が表示されます</p>';
        if (parcels.length === 0) document.getElementById('mapTitle').textContent = '';
        return;
    }
    
    let address = '';
    if (parcel.city) address += parcel.city;
    if (parcel.ooaza) address += (address ? ' ' : '') + parcel.ooaza;
    if (parcel.chome && parcel.chome !== 'その他' && parcel.chome !== '--') {
        address += (address ? ' ' : '') + parcel.chome;
    }
    
    // Update map title for public map mode dynamically
    if (parcels.length === 0) {
        if (address) {
            document.getElementById('mapTitle').textContent = address;
        } else {
            document.getElementById('mapTitle').textContent = '';
        }
    }
    
    address += (address ? ' ' : '') + parcel.chiban;
    
    const isPublicCrs = window.currentEpsgCode !== null || parcel.isDynamicPublic;
    let areaVal = calculateArea(parcel.geometry.exterior);
    
    // Fix area distortion if projected to Web Mercator
    if ((window.currentEpsgCode || parcel.isDynamicPublic) && areaVal > 0) {
        let latRad = 0;
        if (parcel.isDynamicPublic) {
            latRad = parcel.centroid.lat * Math.PI / 180.0;
        } else {
            // centroid.y is Easting (wm_x), centroid.x is Northing (wm_y) in our internal mapping
            const lonlat = proj4("EPSG:3857", "EPSG:4326", [parcel.centroid.y, parcel.centroid.x]);
            latRad = lonlat[1] * Math.PI / 180.0;
        }
        const scale = Math.cos(latRad);
        areaVal = areaVal * scale * scale;
    }
    
    const areaStr = areaVal > 0 
        ? (areaVal.toFixed(2) + (isPublicCrs ? ' ㎡' : ' (任意単位)'))
        : '--';
        
    let html = `
        <div class="detail-row">
            <span class="detail-label">所在</span>
            <span class="detail-value" style="font-weight: bold;">${address}</span>
        </div>
        ${parcel.city ? `
        <div class="detail-row">
            <span class="detail-label">市区町村</span>
            <span class="detail-value">${parcel.city}</span>
        </div>
        ` : ''}
        <div class="detail-row">
            <span class="detail-label">大字・丁目等</span>
            <span class="detail-value">${(parcel.ooaza || '') + (parcel.chome && parcel.chome !== '--' ? ' ' + parcel.chome : '')}</span>
        </div>
        ${parcel.koaza ? `
        <div class="detail-row">
            <span class="detail-label">小字名</span>
            <span class="detail-value">${parcel.koaza}</span>
        </div>
        ` : ''}
        ${parcel.choban ? `
        <div class="detail-row">
            <span class="detail-label">丁番</span>
            <span class="detail-value">${parcel.choban}</span>
        </div>
        ` : ''}
        <div class="detail-row">
            <span class="detail-label">地番</span>
            <span class="detail-value" style="color: var(--accent-color); font-size: 13px; font-weight: bold;">${parcel.chiban}</span>
        </div>
        ${parcel.chibanAreaCode ? `
        <div class="detail-row">
            <span class="detail-label">地番区域コード</span>
            <span class="detail-value">${parcel.chibanAreaCode}</span>
        </div>
        ` : ''}
        <div class="detail-row">
            <span class="detail-label">算出面積</span>
            <span class="detail-value" style="color: var(--success-color); font-weight: bold;">${areaStr}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">精度区分</span>
            <span class="detail-value">${parcel.accuracy || '--'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">座標値種別</span>
            <span class="detail-value">${parcel.zaha || parcel.type || '--'}</span>
        </div>
        ${parcel.hikaiMitei && parcel.hikaiMitei !== 'false' && parcel.hikaiMitei !== '0' ? `
        <div class="detail-row">
            <span class="detail-label">筆界未定</span>
            <span class="detail-value" style="color: #ef4444; font-weight: bold;">${parcel.hikaiMitei}</span>
        </div>
        ` : ''}
    `;

    if (parcel.scale && parcel.scale !== '--') {
        html += `
            <div class="detail-row">
                <span class="detail-label">縮尺分母</span>
                <span class="detail-value">1 / ${parcel.scale}</span>
            </div>
        `;
    }
    
    if (parcel.chibanAreaCode) {
        html += `
            <div class="detail-row">
                <span class="detail-label">地番区域コード</span>
                <span class="detail-value">${parcel.chibanAreaCode}</span>
            </div>
        `;
    }
    
    html += `
        <div class="detail-row">
            <span class="detail-label">筆界未定</span>
            <span class="detail-value" style="color: ${parcel.hikaiMitei === 'true' ? 'var(--danger-color)' : 'inherit'};">
                ${parcel.hikaiMitei === 'true' ? '⚠️ 筆界未定' : '確定'}
            </span>
        </div>
    `;
    
    container.innerHTML = html;
}

// Calculate polygon area using Shoelace formula
function calculateArea(exterior) {
    if (!exterior || exterior.length < 3) return 0;
    let area = 0;
    const n = exterior.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += exterior[i].x * exterior[j].y;
        area -= exterior[j].x * exterior[i].y;
    }
    return Math.abs(area / 2.0);
}

// ---- Added for .min.json.gz (Whole City) ----
async function loadWholeCity(url) {
    console.log("loadWholeCity called with URL:", url);
    try {
        if (!url) throw new Error("URLが不正です");
        showLoading('全域データをダウンロード中...');
        const response = await fetch(url);
        if (!response.ok) throw new Error("データのダウンロードに失敗しました: " + response.status);
        
        showLoading('データを解凍・パース中...');
        
        const arrayBuffer = await response.arrayBuffer();
        const header = new Uint8Array(arrayBuffer, 0, 2);
        let text = "";
        
        if (header[0] === 0x1f && header[1] === 0x8b) {
            console.log("GZIP detected, decompressing...");
            const ds = new DecompressionStream('gzip');
            const stream = new Response(arrayBuffer).body.pipeThrough(ds);
            text = await new Response(stream).text();
        } else {
            console.log("Not GZIP or already decompressed by browser.");
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(arrayBuffer);
        }
        
        console.log("Text length:", text.length);
        const data = JSON.parse(text);
        console.log("Parsed JSON length:", data.length);
        
        showLoading('座標変換・描画準備中...');
        
        await new Promise(resolve => setTimeout(resolve, 50));
        processMinJson(data);
        
    } catch(e) {
        console.error("loadWholeCity Error:", e);
        alert("エラー: " + (e.message || e));
        hideLoading();
    }
}

function processMinJson(data) {
    let idx = 0;
    const CHUNK_SIZE = 5000;
    const tempParcels = [];
    
    function processChunk() {
        try {
            const end = Math.min(idx + CHUNK_SIZE, data.length);
            
            for(; idx < end; idx++) {
                const item = data[idx];
                
                // Skip parcels labeled as out-of-district (地区外) in whole-area view
                if (item.c && item.c.includes("地区外")) {
                    continue;
                }
                
                const rings = item.r;
                if(!rings || rings.length === 0) continue;
                
                const exteriorCoords = [];
                // Flatten all points in rings
                rings.forEach(curve => {
                    curve.forEach(pt => {
                        const wm = proj4("EPSG:4326", "EPSG:3857", pt);
                        exteriorCoords.push({ x: wm[1], y: wm[0] });
                    });
                });
                
                if (exteriorCoords.length === 0) continue;
                
                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;
                let sumX = 0, sumY = 0;
                
                exteriorCoords.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                    sumX += pt.x;
                    sumY += pt.y;
                });
                
                tempParcels.push({
                    id: `F-MIN-${idx}`,
                    chiban: item.c,
                    scale: '--',
                    accuracy: '--',
                    type: '結合データ',
                    chome: '',
                    geometry: {
                        exterior: exteriorCoords,
                        interiors: [], 
                        bbox: { minX, maxX, minY, maxY }
                    },
                    centroid: { x: sumX/exteriorCoords.length, y: sumY/exteriorCoords.length },
                    ooaza: '', ooazaCode: '', chomeCode: '', koaza: '', koazaCode: '', choban: '', hikaiMitei: '', chibanAreaCode: ''
                });
            }
            
            if (idx < data.length) {
                showLoading(`座標変換中... (${Math.round((idx/data.length)*100)}%)`);
                setTimeout(processChunk, 0);
            } else {
                parcels = tempParcels;
                window.currentEpsgCode = "EPSG:3857"; 
                
                mapTitle.textContent = "全域 (座標あり区画のみ)";
                metaCrs.textContent = '座標系: WGS84 -> Web Mercator';
                metaCity.textContent = '市区町村: 全域';
                metaScale.textContent = '縮尺分母: --';
                
                calculateBounds();
                resetView();
                drawMap();
                hideLoading();
            }
        } catch(e) {
            console.error("processChunk Error:", e);
            alert("パース中にエラーが発生しました: " + (e.message || e));
            hideLoading();
        }
    }
    processChunk();
}
