let lodClusters = null;
// Slippy Map Extension for Arbitrary Coordinate Data (Scalable Reverse Geocoding Version)

let slippyMapState = {
    // Tokyo Metropolitan Government Building
    lon: 139.6917,
    lat: 35.6894,
    zoom: 14,
    
    isDragging: false,
    startX: 0,
    startY: 0,
    wheelTimer: null,
    
    // Reverse Geocoding caching
    lastMuniCd: null,
    currentLv01Nm: null,
    currentMuniCd: null,
    currentIndexData: null
};

const TILE_SIZE = 256;

// Convert Lat/Lon to Tile Z/X/Y
function lon2tile(lon, zoom) {
    return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}
function lat2tile(lat, zoom) {
    return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

// Overwrite drawMap completely
// Overwrite drawMap completely
const originalDrawMap = window.drawMap;
window.drawMap = function() {
    if (parcels.length > 0) {
        // XML is loaded, use original drawing!
        originalDrawMap();
        return;
    }
    
    // Draw Slippy Map
    ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    
    drawSlippyGsiTiles();
    drawDynamicPublicParcels();
    drawCenterCrosshair();
    
    // Update debug info in the footer
    const debugEl = document.getElementById('statusDebug');
    if (debugEl) {
        debugEl.textContent = `ズーム: ${slippyMapState.zoom.toFixed(2)} (${loadedPublicXmls ? loadedPublicXmls.size : 0}タイル)`;
    }
};

function drawDynamicPublicParcels() {
    if (dynamicPublicParcels.length === 0) return;
    
    const zoom = slippyMapState.zoom;
    const centerTileX = (slippyMapState.lon + 180) / 360 * Math.pow(2, zoom);
    const centerTileY = (1 - Math.log(Math.tan(slippyMapState.lat * Math.PI / 180) + 1 / Math.cos(slippyMapState.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;
    
    const screenMinTileX = centerTileX - centerX / TILE_SIZE;
    const screenMaxTileX = centerTileX + centerX / TILE_SIZE;
    const screenMinTileY = centerTileY - centerY / TILE_SIZE;
    const screenMaxTileY = centerTileY + centerY / TILE_SIZE;
    
    const minLon = screenMinTileX / Math.pow(2, zoom) * 360 - 180;
    const maxLon = screenMaxTileX / Math.pow(2, zoom) * 360 - 180;
    const maxLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * screenMinTileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    const minLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * screenMaxTileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    
    ctx.lineWidth = 1;
    ctx.strokeStyle = (window.mapSettings && window.mapSettings.lineColor) || '#3b82f6';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const parcel of dynamicPublicParcels) {
        if (!parcel.pts || parcel.pts.length === 0) continue;
        const pLon = parcel.pts[0][0][0];
        const pLat = parcel.pts[0][0][1];
        if (parcel.id !== "LOD" && (pLon < minLon - 0.005 || pLon > maxLon + 0.005 || pLat < minLat - 0.005 || pLat > maxLat + 0.005)) continue;
        
        ctx.beginPath();
        let sumX = 0, sumY = 0;
        let ptCount = 0;
        
        const rings = parcel.pts;
        
        for (const ring of rings) {
            for (let i = 0; i < ring.length; i++) {
                const ptLon = ring[i][0];
                const ptLat = ring[i][1];
                const ptTileX = (ptLon + 180) / 360 * Math.pow(2, zoom);
                const ptTileY = (1 - Math.log(Math.tan(ptLat * Math.PI / 180) + 1 / Math.cos(ptLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
                const px = centerX + (ptTileX - centerTileX) * TILE_SIZE;
                const py = centerY + (ptTileY - centerTileY) * TILE_SIZE;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
                
                // Only count exterior ring for label positioning
                if (ring === rings[0]) {
                    sumX += px;
                    sumY += py;
                    ptCount++;
                }
            }
            ctx.closePath();
        }
        
        if (parcel.id === "LOD") {
            if (!window.lodPattern) {
                const pCanvas = document.createElement('canvas');
                pCanvas.width = 8; pCanvas.height = 8;
                const pCtx = pCanvas.getContext('2d');
                pCtx.strokeStyle = (window.mapSettings && window.mapSettings.lineColor) ? 
                    window.mapSettings.lineColor.replace(')', ', 0.3)').replace('rgb', 'rgba') : 'rgba(59, 130, 246, 0.3)';
                // Fallback for hex colors
                if (pCtx.strokeStyle.indexOf('#') === 0) pCtx.strokeStyle = pCtx.strokeStyle + '4D'; 
                pCtx.lineWidth = 1;
                pCtx.beginPath();
                pCtx.moveTo(0, 8); pCtx.lineTo(8, 0);
                pCtx.stroke();
                window.lodPattern = ctx.createPattern(pCanvas, 'repeat');
            }
            ctx.fillStyle = window.lodPattern;
            ctx.fill("evenodd");
            ctx.lineWidth = 2;
        } else if (parcel.id === window.selectedParcelId) {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.fill("evenodd");
            ctx.lineWidth = 1;
        } else {
            ctx.lineWidth = 1;
        }
        ctx.stroke();
        
        if (parcel.lbl && zoom >= 18 && ptCount > 0) {
            ctx.fillStyle = (window.mapSettings && window.mapSettings.textColor) || '#1e293b';
            ctx.fillText(parcel.lbl, sumX / ptCount, sumY / ptCount);
        }
    }
}

window.slippyCache = {};

function drawSlippyGsiTiles() {
    let zoom = Math.floor(slippyMapState.zoom);
    let scale = Math.pow(2, slippyMapState.zoom - zoom);
    
    if (zoom > 18) {
        scale = Math.pow(2, slippyMapState.zoom - 18);
        zoom = 18;
    }
    
    const centerTileX = (slippyMapState.lon + 180) / 360 * Math.pow(2, zoom);
    const centerTileY = (1 - Math.log(Math.tan(slippyMapState.lat * Math.PI / 180) + 1 / Math.cos(slippyMapState.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;
    
    const startX = Math.floor(centerTileX - (centerX / (TILE_SIZE * scale)));
    const endX = Math.ceil(centerTileX + (centerX / (TILE_SIZE * scale)));
    const startY = Math.floor(centerTileY - (centerTileY / (TILE_SIZE * scale))); // Fixed bound logic
    const endY = Math.ceil(centerTileY + (centerY / (TILE_SIZE * scale)));
    
    for (let tx = startX; tx <= endX; tx++) {
        for (let ty = Math.floor(centerTileY - (centerY / (TILE_SIZE * scale))); ty <= endY; ty++) {
            if (tx < 0 || tx >= Math.pow(2, zoom) || ty < 0 || ty >= Math.pow(2, zoom)) continue;
            
            const tileType = (window.mapSettings && window.mapSettings.tileType) || 'pale';
            const maxZoomMap = {
                'std': 18,
                'pale': 18,
                'seamlessphoto': 18,
                'blank': 14,
                'relief': 15,
                'hillshade': 16,
                'slopemap': 15
            };
            const maxZ = maxZoomMap[tileType] || 18;
            const reqZ = Math.min(zoom, maxZ);
            const zDiff = zoom - reqZ;
            const scaleF = Math.pow(2, zDiff);
            const reqX = Math.floor(tx / scaleF);
            const reqY = Math.floor(ty / scaleF);
            
            const ext = tileType === 'seamlessphoto' ? 'jpg' : 'png';
            const url = `https://cyberjapandata.gsi.go.jp/xyz/${tileType}/${reqZ}/${reqX}/${reqY}.${ext}`;
            const px = centerX + (tx - centerTileX) * TILE_SIZE * scale;
            const py = centerY + (ty - centerTileY) * TILE_SIZE * scale;
            const size = TILE_SIZE * scale;
            
            const sWidth = TILE_SIZE / scaleF;
            const sHeight = TILE_SIZE / scaleF;
            const sx = (tx % scaleF) * sWidth;
            const sy = (ty % scaleF) * sHeight;
            
            if (window.slippyCache[url] && window.slippyCache[url].complete) {
                if (window.slippyCache[url].naturalWidth !== 0) { // check if not broken
                    ctx.drawImage(window.slippyCache[url], sx, sy, sWidth, sHeight, px, py, size + 1, size + 1);
                }
            } else if (!window.slippyCache[url] && !slippyMapState.isDragging) {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => { if (window.drawMap) window.drawMap(); };
                img.onerror = () => { img.error = true; };
                img.src = url;
                window.slippyCache[url] = img;
            }
        }
    }
}

function drawCenterCrosshair() {
    const cx = mapCanvas.width / 2;
    const cy = mapCanvas.height / 2;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy);
    ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(cx, cy + 15);
    ctx.stroke();
    
    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
}

const loadedPublicXmls = new Map(); // key -> [parcel1, parcel2, ...]
let dynamicPublicParcels = [];
let dynamicPublicLoading = false;

function updateDynamicSidebarStatus(msg) {
    const statusEl = document.getElementById('statusPublicMap');
    if (statusEl) {
        statusEl.innerHTML = msg;
    }
}

function getVisibleQuadtreeTiles(minLon, maxLon, minLat, maxLat, index, currentZoom, tileX, tileY) {
    const key = `${currentZoom}/${tileX}/${tileY}`;
    const visible = [];
    
    if (index.tilesSet.has(key)) {
        visible.push(key);
    } else if (currentZoom < index.maxZoom) {
        const childZ = currentZoom + 1;
        const childX = tileX * 2;
        const childY = tileY * 2;
        for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 2; dy++) {
                const cx = childX + dx;
                const cy = childY + dy;
                const n = Math.pow(2, childZ);
                const c_minLon = cx / n * 360 - 180;
                const c_maxLon = (cx + 1) / n * 360 - 180;
                const c_maxLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * cy / n))) * 180 / Math.PI;
                const c_minLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (cy + 1) / n))) * 180 / Math.PI;
                
                if (c_maxLon >= minLon && c_minLon <= maxLon && c_maxLat >= minLat && c_minLat <= maxLat) {
                    visible.push(...getVisibleQuadtreeTiles(minLon, maxLon, minLat, maxLat, index, childZ, cx, cy));
                }
            }
        }
    }
    return visible;
}

async function updateDynamicPublicMaps() {
    
    if (dynamicPublicLoading) return;
    dynamicPublicLoading = true;
    
    if (!slippyMapState.quadtreeIndex) {
        updateDynamicSidebarStatus("タイル目録を取得中...");
        try {
            const res = await fetch('./data/public_quadtree_index.json');
            if (res.ok) {
                const data = await res.json();
                data.tilesSet = new Set(Object.keys(data.tiles));
                slippyMapState.quadtreeIndex = data;
            } else {
                updateDynamicSidebarStatus("タイル目録の取得に失敗しました");
                dynamicPublicLoading = false;
                return;
            }
        } catch (e) {
            updateDynamicSidebarStatus("エラーが発生しました");
            dynamicPublicLoading = false;
            return;
        }
    }
    
    updateDynamicSidebarStatus("表示エリアを計算中...");
    
    const zoom = slippyMapState.zoom;
    const centerTileX = (slippyMapState.lon + 180) / 360 * Math.pow(2, zoom);
    const centerTileY = (1 - Math.log(Math.tan(slippyMapState.lat * Math.PI / 180) + 1 / Math.cos(slippyMapState.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;
    
    const screenMinTileX = centerTileX - centerX / TILE_SIZE;
    const screenMaxTileX = centerTileX + centerX / TILE_SIZE;
    const screenMinTileY = centerTileY - centerY / TILE_SIZE;
    const screenMaxTileY = centerTileY + centerY / TILE_SIZE;
    
    const minLon = screenMinTileX / Math.pow(2, zoom) * 360 - 180;
    const maxLon = screenMaxTileX / Math.pow(2, zoom) * 360 - 180;
    const maxLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * screenMinTileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    const minLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * screenMaxTileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    
    const baseZ = slippyMapState.quadtreeIndex.minZoom;
    const minTX12 = Math.floor((minLon + 180) / 360 * Math.pow(2, baseZ));
    const maxTX12 = Math.floor((maxLon + 180) / 360 * Math.pow(2, baseZ));
    const minTY12 = Math.floor((1 - Math.log(Math.tan(maxLat * Math.PI / 180) + 1 / Math.cos(maxLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, baseZ));
    const maxTY12 = Math.floor((1 - Math.log(Math.tan(minLat * Math.PI / 180) + 1 / Math.cos(minLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, baseZ));
    
    // Safety check to prevent browser freeze on extreme zoom out
    if ((maxTX12 - minTX12) * (maxTY12 - minTY12) > 100) {
        if (dynamicPublicParcels.length > 0) {
            loadedPublicXmls.clear();
            dynamicPublicParcels = [];
            if (window.drawMap) window.drawMap();
        }
        updateDynamicSidebarStatus("ズームインすると公共座標系図面が表示されます");
        dynamicPublicLoading = false;
        return;
    }
    
    const visibleTiles = [];
    for (let x = minTX12; x <= maxTX12; x++) {
        for (let y = minTY12; y <= maxTY12; y++) {
            visibleTiles.push(...getVisibleQuadtreeTiles(minLon, maxLon, minLat, maxLat, slippyMapState.quadtreeIndex, baseZ, x, y));
        }
    }
    
    // Display based on parcel count
    let totalParcels = 0;
    for (const key of visibleTiles) {
        totalParcels += slippyMapState.quadtreeIndex.tiles[key] || 0;
    }
    
    // Force display if user is highly zoomed in (zoom >= 18) to prevent permanent lockout on ultra-dense tiles
    if (totalParcels > 10000 && slippyMapState.zoom < 18) {
        if (dynamicPublicParcels.length > 0 && dynamicPublicParcels !== lodClusters) {
            loadedPublicXmls.clear();
            dynamicPublicParcels = [];
        }
        updateDynamicSidebarStatus(`広域モード表示中（推計 ${totalParcels.toLocaleString()}筆）`);
        
        if (!lodClusters) {
            try {
                const res = await fetch('./tiles/lod/lod_clusters.json');
                if (res.ok) {
                    lodClusters = await res.json();
                    dynamicPublicParcels = lodClusters;
                    if (window.drawMap) window.drawMap();
                }
            } catch (e) {
                console.error("LOD fetch error", e);
            }
        } else {
            dynamicPublicParcels = lodClusters;
            if (window.drawMap) window.drawMap();
        }
        
        dynamicPublicLoading = false;
        return;
    } else {
        // If we are transitioning from LOD to detailed mode, clear dynamicPublicParcels so it forces a redraw with details
        if (dynamicPublicParcels === lodClusters) {
            dynamicPublicParcels = [];
        }
    }
    
    const toLoadKeys = new Set(visibleTiles);
    let changed = false;
    for (const key of loadedPublicXmls.keys()) {
        if (!toLoadKeys.has(key)) {
            loadedPublicXmls.delete(key);
            changed = true;
        }
    }
    
    let loadedCount = 0;
    for (const key of visibleTiles) {
        if (!loadedPublicXmls.has(key)) {
            loadedPublicXmls.set(key, []);
            try {
                updateDynamicSidebarStatus(`タイル読込中... (${++loadedCount}/${visibleTiles.length})`);
                const res = await fetch(`./data/tiles/${key}.json`);
                if (res.ok) {
                    const parcels = await res.json();
                    loadedPublicXmls.set(key, parcels);
                    changed = true;
                    rebuildDynamicParcels();
                    if (window.drawMap) window.drawMap();
                }
            } catch (e) {
                loadedPublicXmls.delete(key);
            }
        }
    }
    
    if (changed) {
        rebuildDynamicParcels();
        if (window.drawMap) window.drawMap();
    }
    
    updateDynamicSidebarStatus(`表示中: ${dynamicPublicParcels.length.toLocaleString()} 筆`);
    dynamicPublicLoading = false;
}

function rebuildDynamicParcels() {
    dynamicPublicParcels = [];
    for (const parcels of loadedPublicXmls.values()) {
        dynamicPublicParcels.push(...parcels);
    }
}

async function updateArbitrarySidebar() {
    if (parcels.length > 0) return;
    
    const listEl = document.getElementById('arbitraryList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding: 10px; color: #666;">中心座標を確認中...</div>';
    
    try {
        // 1. Reverse Geocode
        const rgUrl = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${slippyMapState.lat}&lon=${slippyMapState.lon}`;
        const rgRes = await fetch(rgUrl);
        if (!rgRes.ok) throw new Error('Reverse geocoding failed');
        
        const rgData = await rgRes.json();
        if (!rgData || !rgData.results) {
            listEl.innerHTML = '<div style="padding: 10px; color: #666;">この場所のデータはありません</div>';
            return;
        }
        
        const muniCd = rgData.results.muniCd; // e.g. "13104"
        const lv01Nm = rgData.results.lv01Nm || ""; // e.g. "高田馬場一丁目"
        
        // 2. Fetch the corresponding city index if needed
        if (slippyMapState.lastMuniCd !== muniCd) {
            try {
                const [idxRes, pubRes] = await Promise.all([
                    fetch(`./data/index_${muniCd}.json`),
                    Promise.resolve(null)
                ]);
                
                if (idxRes.ok) {
                    slippyMapState.currentIndexData = await idxRes.json();
                } else {
                    slippyMapState.currentIndexData = null;
                }
                
                if (pubRes && pubRes.ok) {
                    slippyMapState.currentPublicData = await pubRes.json();
                } else {
                    slippyMapState.currentPublicData = null;
                }
                
                slippyMapState.lastMuniCd = muniCd;
            } catch (e) {
                slippyMapState.currentIndexData = null;
                slippyMapState.currentPublicData = null;
            }
        }
        
        // 2.5 Update Public Maps Panel
        updateDynamicPublicMaps();
        
        if (!slippyMapState.currentIndexData) {
            listEl.innerHTML = `<div style="padding: 10px; color: #666;">この市区町村（${muniCd}）の任意座標系データは登録されていません</div>`;
            return;
        }
        
        // 3. Filter matching Oaza/Chome and aggregate by XML
        // Normalize lv01Nm by stripping Chome details (e.g. "高田馬場一丁目" -> "高田馬場")
        const baseNm = lv01Nm.replace(/[一二三四五六七八九十百千万１-９1-9]+丁目.*$/, '');
        
        // Helper to condense sequential names like ["１丁目", "２丁目", "３丁目"] -> "１〜３丁目"
        const condenseNames = (names) => {
            if (!names || names.length === 0) return '';
            if (names.length === 1) return names[0];

            const groups = {};
            const raw = [];

            const toHalfWidth = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

            names.forEach(name => {
                const match = name.match(/^([^\d０-９]*)([\d０-９]+)([^\d０-９]*)$/);
                if (match) {
                    const prefix = match[1];
                    const numStr = match[2];
                    const suffix = match[3];
                    const type = prefix + '|' + suffix;
                    const num = parseInt(toHalfWidth(numStr), 10);
                    
                    if (!groups[type]) groups[type] = { prefix, suffix, items: [] };
                    groups[type].items.push({ orig: name, num, numStr });
                } else {
                    raw.push(name);
                }
            });

            const result = [];

            for (const type in groups) {
                const group = groups[type];
                const items = group.items.sort((a, b) => a.num - b.num);
                let start = items[0];
                let prev = items[0];

                for (let i = 1; i <= items.length; i++) {
                    const current = items[i];
                    if (current && current.num === prev.num + 1) {
                        prev = current;
                    } else {
                        if (start.num === prev.num) {
                            result.push(start.orig);
                        } else if (start.num + 1 === prev.num) {
                            result.push(start.orig + '、' + prev.orig);
                        } else {
                            result.push(`${group.prefix}${start.numStr}〜${prev.numStr}${group.suffix}`);
                        }
                        start = current;
                        prev = current;
                    }
                }
            }

            result.push(...raw);
            return result.join('、');
        };
        
        const xmlList = [];
        
        // Exact match the Oaza key in the JSON
        if (slippyMapState.currentIndexData[baseNm]) {
            for (const xml of slippyMapState.currentIndexData[baseNm]) {
                xmlList.push(xml);
            }
        }
        
        // Render
        listEl.innerHTML = '';
        const header = document.createElement('div');
        header.style.padding = '5px 10px';
        header.style.fontSize = '11px';
        header.style.background = '#e2e8f0';
        header.style.color = '#475569';
        header.textContent = `📍 ${lv01Nm || muniCd} 付近の図面`;
        listEl.appendChild(header);
        
        if (xmlList.length === 0) {
            listEl.innerHTML += '<div style="padding: 10px; color: #666;">この地点に一致する図面は見つかりませんでした</div>';
            return;
        }
        
        xmlList.forEach(xml => {
            const btn = document.createElement('button');
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.padding = '8px';
            btn.style.margin = '4px 0';
            btn.style.border = '1px solid #cbd5e1';
            btn.style.borderRadius = '4px';
            btn.style.background = '#fff';
            btn.style.cursor = 'pointer';
            
            // Format: "中落合１〜４丁目 (99.9%) / 下落合 (0.1%) (13104-0111-33.xml)"
            let displayStr = '';
            
            if (xml.oazaStats && xml.allChomes && xml.totalParcels) {
                // Sort Oazas by parcel count descending
                const sortedOazas = Object.entries(xml.oazaStats).sort((a, b) => b[1] - a[1]);
                
                const parts = sortedOazas.map(([oaza, count]) => {
                    const chomes = xml.allChomes[oaza] || [];
                    const chomeStr = chomes.length > 0 ? condenseNames(chomes) : '';
                    const nameStr = `${oaza}${chomeStr}`;
                    
                    const percent = (count / xml.totalParcels) * 100;
                    if (percent >= 99.95) {
                        // 100% (or practically 100%)
                        return nameStr;
                    } else {
                        let p = percent.toFixed(1);
                        if (p === '0.0') p = '<0.1';
                        return `${nameStr} (${p}%)`;
                    }
                });
                
                displayStr = `${parts.join(' / ')} (${xml.filename})`;
            } else {
                // Fallback for older JSON formats if still loading
                displayStr = `${baseNm} (${xml.filename})`;
            }
            
            btn.textContent = `📄 ${displayStr}`;
            
            btn.onmouseover = () => btn.style.background = '#f8fafc';
            btn.onmouseout = () => btn.style.background = '#fff';
            
            btn.onclick = async (e) => {
                e.stopPropagation();
                // Extract just the location name (remove the filename from the display string)
                const cleanDisplayStr = displayStr.replace(/\s*\(.*\.xml\)$/, '');
                await loadXmlFromZip(`./data/${xml.zipFile}`, xml.filename, cleanDisplayStr);
            };
            
            listEl.appendChild(btn);
        });
        
    } catch (e) {
        listEl.innerHTML = '<div style="padding: 10px; color: #ef4444;">逆ジオコーディング取得エラー</div>';
        console.error(e);
    }
}

// Link zoom buttons to Slippy Map
const slippyZoomInBtn = document.getElementById('zoomInBtn');
if (slippyZoomInBtn) {
    slippyZoomInBtn.addEventListener('click', (e) => {
        if (parcels.length > 0) return;
        const oldZoom = slippyMapState.zoom;
        slippyMapState.zoom = Math.max(5, Math.min(24, oldZoom + 1));
        drawMap();
        clearTimeout(slippyMapState.wheelTimer);
        slippyMapState.wheelTimer = setTimeout(updateArbitrarySidebar, 500);
    });
}

const slippyZoomOutBtn = document.getElementById('zoomOutBtn');
if (slippyZoomOutBtn) {
    slippyZoomOutBtn.addEventListener('click', (e) => {
        if (parcels.length > 0) return;
        const oldZoom = slippyMapState.zoom;
        slippyMapState.zoom = Math.max(5, Math.min(24, oldZoom - 1));
        drawMap();
        clearTimeout(slippyMapState.wheelTimer);
        slippyMapState.wheelTimer = setTimeout(updateArbitrarySidebar, 500);
    });
}

// Hook into interaction events for Slippy Map
viewportContainer.addEventListener('touchstart', e => {
    if (parcels.length > 0) return;
    if (e.touches.length === 1) {
        slippyMapState.isDragging = true;
        slippyMapState.isPinching = false;
        slippyMapState.startX = e.touches[0].clientX;
        slippyMapState.startY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        slippyMapState.isDragging = false;
        slippyMapState.isPinching = true;
        slippyMapState.pinchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        slippyMapState.pinchStartZoom = slippyMapState.zoom;
        
        const rect = mapCanvas.getBoundingClientRect();
        slippyMapState.pinchStartCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        slippyMapState.pinchStartCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        
        slippyMapState.pinchStartLon = slippyMapState.lon;
        slippyMapState.pinchStartLat = slippyMapState.lat;
    }
}, {passive: true, capture: true});

viewportContainer.addEventListener('mousedown', e => {
    if (parcels.length > 0) return; // Use original if XML loaded
    e.stopImmediatePropagation();
    e.preventDefault(); // Prevent native HTML5 drag/text selection
    slippyMapState.isDragging = true;
    slippyMapState.startX = e.clientX;
    slippyMapState.startY = e.clientY;
    viewportContainer.style.cursor = 'grabbing';
}, true);

window.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
        if (slippyMapState.isDragging || slippyMapState.isPinching) {
            if (parcels.length === 0) e.stopImmediatePropagation();
            slippyMapState.isDragging = false;
            slippyMapState.isPinching = false;
            drawMap();
            clearTimeout(slippyMapState.wheelTimer);
            slippyMapState.wheelTimer = setTimeout(updateArbitrarySidebar, 500);
        }
    } else if (e.touches.length === 1) {
        slippyMapState.isPinching = false;
        slippyMapState.isDragging = true;
        slippyMapState.startX = e.touches[0].clientX;
        slippyMapState.startY = e.touches[0].clientY;
    }
}, true);

window.addEventListener('mouseup', e => {
    if (slippyMapState.isDragging) {
        if (parcels.length === 0) e.stopImmediatePropagation();
        slippyMapState.isDragging = false;
        viewportContainer.style.cursor = 'grab';
        
        drawMap(); // Fetch missing tiles now that dragging stopped
        
        // Debounce reverse geocoding update
        clearTimeout(slippyMapState.wheelTimer);
        slippyMapState.wheelTimer = setTimeout(updateArbitrarySidebar, 500);
    }
}, true);

viewportContainer.addEventListener('mouseleave', e => {
    if (slippyMapState.isDragging) {
        slippyMapState.isDragging = false;
        viewportContainer.style.cursor = 'grab';
        drawMap();
    }
});

viewportContainer.addEventListener('touchmove', e => {
    if (parcels.length > 0) return;
    if (slippyMapState.isDragging && e.touches.length === 1) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const dx = e.touches[0].clientX - slippyMapState.startX;
        const dy = e.touches[0].clientY - slippyMapState.startY;
        
        const zoom = slippyMapState.zoom;
        const dLon = -dx / Math.pow(2, zoom) / TILE_SIZE * 360;
        const dLat = dy / Math.pow(2, zoom) / TILE_SIZE * 360 * Math.cos(slippyMapState.lat * Math.PI/180);
        
        slippyMapState.lon += dLon;
        slippyMapState.lat += dLat;
        
        slippyMapState.startX = e.touches[0].clientX;
        slippyMapState.startY = e.touches[0].clientY;
        drawMap();
    } else if (slippyMapState.isPinching && e.touches.length === 2) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        if (slippyMapState.pinchStartDist === 0) return;
        
        const zoomFactor = currentDist / slippyMapState.pinchStartDist;
        const oldZoom = slippyMapState.pinchStartZoom;
        const newZoom = Math.max(5, Math.min(24, oldZoom + Math.log2(zoomFactor)));
        
        const rect = mapCanvas.getBoundingClientRect();
        const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        
        const cx = mapCanvas.width / 2;
        const cy = mapCanvas.height / 2;
        
        const startDx = slippyMapState.pinchStartCenterX - cx;
        const startDy = slippyMapState.pinchStartCenterY - cy;
        const currentDx = currentCenterX - cx;
        const currentDy = currentCenterY - cy;
        
        const lonOffsetStart = (startDx * 360 / TILE_SIZE) * Math.pow(2, -oldZoom);
        const lonOffsetCurrent = (currentDx * 360 / TILE_SIZE) * Math.pow(2, -newZoom);
        
        const latOffsetStart = -(startDy * 360 * Math.cos(slippyMapState.pinchStartLat * Math.PI / 180) / TILE_SIZE) * Math.pow(2, -oldZoom);
        const latOffsetCurrent = -(currentDy * 360 * Math.cos(slippyMapState.pinchStartLat * Math.PI / 180) / TILE_SIZE) * Math.pow(2, -newZoom);
        
        slippyMapState.lon = slippyMapState.pinchStartLon + (lonOffsetStart - lonOffsetCurrent);
        slippyMapState.lat = slippyMapState.pinchStartLat + (latOffsetStart - latOffsetCurrent);
        slippyMapState.zoom = newZoom;
        
        drawMap();
    }
}, {passive: false, capture: true});

viewportContainer.addEventListener('mousemove', e => {
    if (parcels.length > 0) return;
    if (slippyMapState.isDragging) {
        e.stopImmediatePropagation();
        const dx = e.clientX - slippyMapState.startX;
        const dy = e.clientY - slippyMapState.startY;
        
        const zoom = slippyMapState.zoom;
        const dLon = -dx / Math.pow(2, zoom) / TILE_SIZE * 360;
        // Fix: Use 360 instead of 180 to match Web Mercator derivative
        const dLat = dy / Math.pow(2, zoom) / TILE_SIZE * 360 * Math.cos(slippyMapState.lat * Math.PI/180);
        
        slippyMapState.lon += dLon;
        slippyMapState.lat += dLat;
        
        slippyMapState.startX = e.clientX;
        slippyMapState.startY = e.clientY;
        drawMap();
        return;
    }
    
    // Handle hover and coordinate updates for public map
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const zoom = slippyMapState.zoom;
    const centerTileX = (slippyMapState.lon + 180) / 360 * Math.pow(2, zoom);
    const centerTileY = (1 - Math.log(Math.tan(slippyMapState.lat * Math.PI / 180) + 1 / Math.cos(slippyMapState.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    const tileX = centerTileX + (mx - mapCanvas.width/2) / TILE_SIZE;
    const tileY = centerTileY + (my - mapCanvas.height/2) / TILE_SIZE;
    
    const hoverLon = tileX / Math.pow(2, zoom) * 360 - 180;
    const hoverLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    
    // Update X/Y coordinates in Web Mercator to match arbitrary map style
    if (typeof proj4 !== 'undefined') {
        const wm = proj4("EPSG:4326", "EPSG:3857", [hoverLon, hoverLat]);
        const statusCoords = document.getElementById('statusCoords');
        if (statusCoords) {
            statusCoords.textContent = `X: ${wm[0].toFixed(3)}, Y: ${wm[1].toFixed(3)}`;
            statusCoords.dataset.wmX = wm[0].toFixed(3);
            statusCoords.dataset.wmY = wm[1].toFixed(3);
        }
    }
    
    // Find parcel under mouse
    let hoveredParcel = null;
    if (dynamicPublicParcels.length > 0) {
        for (let i = dynamicPublicParcels.length - 1; i >= 0; i--) {
            const p = dynamicPublicParcels[i];
            if (!p.pts || p.pts.length === 0) continue;
            if (Math.abs(p.pts[0][0][0] - hoverLon) > 0.005 || Math.abs(p.pts[0][0][1] - hoverLat) > 0.005) continue;
            
            if (isPointInDynamicPolygon(hoverLon, hoverLat, p.pts)) {
                hoveredParcel = p;
                break;
            }
        }
    }
    
    if (hoveredParcel) {
        viewportContainer.style.cursor = 'pointer';
    } else {
        viewportContainer.style.cursor = 'grab';
    }
}, true);

viewportContainer.addEventListener('contextmenu', e => {
    e.preventDefault();
    const statusCoords = document.getElementById('statusCoords');
    if (statusCoords && statusCoords.dataset.wmX && statusCoords.dataset.wmY) {
        const coordText = `${statusCoords.dataset.wmX}, ${statusCoords.dataset.wmY}`;
        navigator.clipboard.writeText(coordText).then(() => {
            const orig = statusCoords.textContent;
            statusCoords.textContent = 'Copied!';
            setTimeout(() => {
                if (statusCoords.textContent === 'Copied!') {
                    statusCoords.textContent = orig;
                }
            }, 1000);
        });
    }
});

viewportContainer.addEventListener('wheel', e => {
    if (parcels.length > 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const cx = mapCanvas.width / 2;
    const cy = mapCanvas.height / 2;
    
    const dx = mx - cx;
    const dy = my - cy;
    
    const oldZoom = slippyMapState.zoom;
    const zoomDelta = e.deltaY > 0 ? -0.5 : 0.5;
    const newZoom = Math.max(5, Math.min(24, oldZoom + zoomDelta));
    
    if (newZoom !== oldZoom) {
        const scaleDiff = Math.pow(2, -oldZoom) - Math.pow(2, -newZoom);
        
        const dLon = (dx * 360 / TILE_SIZE) * scaleDiff;
        const dLat = -(dy * 360 * Math.cos(slippyMapState.lat * Math.PI / 180) / TILE_SIZE) * scaleDiff;
        
        slippyMapState.lon += dLon;
        slippyMapState.lat += dLat;
        slippyMapState.zoom = newZoom;
        
        drawMap();
        
        clearTimeout(slippyMapState.wheelTimer);
        slippyMapState.wheelTimer = setTimeout(updateArbitrarySidebar, 500);
    }
}, {passive: false, capture: true});

// Helper to fetch XML and trigger original parse logic
async function loadXmlFromZip(zipUrl, xmlFilename, displayTitle) {
    showLoading('図面を展開中...');
    try {
        const text = await extractXmlFromUrl(zipUrl, xmlFilename);
        parseMojXml(text); // Sets parcels, changes EPSG, etc.
        if (displayTitle) {
            const mapTitle = document.getElementById('mapTitle');
            if (mapTitle) mapTitle.textContent = displayTitle;
        }
        
        const closeBtn = document.getElementById('closeXmlBtn');
        if (closeBtn) closeBtn.style.display = 'block';
        hideLoading();
    } catch (err) {
        alert("エラー: " + err.message);
        hideLoading();
    }
}

// Add reset button logic to return to slippy map
const resetBtn = document.getElementById('resetViewBtn');
if (resetBtn) {
    const origReset = resetBtn.onclick;
    resetBtn.outerHTML = resetBtn.outerHTML; // clone to remove listeners
    const newReset = document.getElementById('resetViewBtn');
    newReset.textContent = '🌐 全体地図に戻る';
    newReset.addEventListener('click', () => {
        parcels = [];
        window.currentEpsgCode = null;
        document.getElementById('mapTitle').textContent = '地図が選択されていません';
        const toggleContainer = document.getElementById('mapTileToggleContainer');
        if (toggleContainer) toggleContainer.style.display = 'none';
        
        // Use Slippy Map default logic
        drawMap();
        updateArbitrarySidebar();
    });
}

// ==========================================
// Address Search Logic
// ==========================================
function setupAddressSearch() {
    const input = document.getElementById('addressSearchInput');
    const btn = document.getElementById('addressSearchBtn');
    
    if (!input || !btn) return;
    
    let isSearching = false;
    
    const doSearch = async () => {
        if (isSearching) return;
        const query = input.value.trim();
        if (!query) return;
        
        isSearching = true;
        btn.textContent = '検索中...';
        btn.disabled = true;
        
        try {
            const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                // Fly to the first result
                const coords = data[0].geometry.coordinates; // [lng, lat]
                slippyMapState.lon = coords[0];
                slippyMapState.lat = coords[1];
                slippyMapState.zoom = 15; // "それっぽいズーム状態" (A reasonable zoom level for addresses)
                
                // Clear any currently loaded arbitrary map if we're jumping somewhere else
                parcels = [];
                window.currentEpsgCode = null;
                document.getElementById('mapTitle').textContent = '地図が選択されていません';
                
                // Force a reverse geocoding update for the new location
                await updateArbitrarySidebar();
                drawMap();
            } else {
                alert('見つかりませんでした。別の住所をお試しください。');
            }
        } catch (e) {
            console.error('Search error:', e);
            alert(`検索エラーが発生しました: ${e.message}`);
        } finally {
            isSearching = false;
            btn.textContent = '検索';
            btn.disabled = false;
        }
    };
    
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        doSearch();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doSearch();
        }
    });
}

setupAddressSearch();
updateArbitrarySidebar();
drawMap();

// Helper for dynamic parcel click detection
function isPointInDynamicPolygon(lon, lat, pts) {
    if (!pts || pts.length === 0) return false;
    let inside = pointInRing(lon, lat, pts[0]);
    if (inside) {
        for (let r = 1; r < pts.length; r++) {
            if (pointInRing(lon, lat, pts[r])) {
                inside = false;
                break;
            }
        }
    }
    return inside;
}

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

viewportContainer.addEventListener('click', e => {
    if (parcels.length > 0) return;
    if (slippyMapState.isDragging || Math.abs(e.clientX - slippyMapState.startX) > 3) return;
    if (dynamicPublicParcels.length === 0) return;
    
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const zoom = slippyMapState.zoom;
    const centerTileX = (slippyMapState.lon + 180) / 360 * Math.pow(2, zoom);
    const centerTileY = (1 - Math.log(Math.tan(slippyMapState.lat * Math.PI / 180) + 1 / Math.cos(slippyMapState.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    const tileX = centerTileX + (mx - mapCanvas.width/2) / TILE_SIZE;
    const tileY = centerTileY + (my - mapCanvas.height/2) / TILE_SIZE;
    
    const clickLon = tileX / Math.pow(2, zoom) * 360 - 180;
    const clickLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / Math.pow(2, zoom)))) * 180 / Math.PI;
    
    let clickedParcel = null;
    for (let i = dynamicPublicParcels.length - 1; i >= 0; i--) {
        const p = dynamicPublicParcels[i];
        if (!p.pts || p.pts.length === 0) continue;
        if (Math.abs(p.pts[0][0][0] - clickLon) > 0.005 || Math.abs(p.pts[0][0][1] - clickLat) > 0.005) continue;
        
        if (isPointInDynamicPolygon(clickLon, clickLat, p.pts)) {
            clickedParcel = p;
            break;
        }
    }
    
    window.selectedParcelId = clickedParcel ? clickedParcel.id : null;
    drawMap();
    
    const statusHovered = document.getElementById('statusHovered');
    if (statusHovered) {
        if (clickedParcel) {
            statusHovered.textContent = `選択中: ${clickedParcel.lbl}`;
        } else {
            statusHovered.textContent = `選択中: なし`;
        }
    }
    
    if (window.updateDetailPanel) {
        if (clickedParcel) {
            const parcelData = {
                id: clickedParcel.id,
                chiban: clickedParcel.lbl,
                isDynamicPublic: true,
                centroid: {
                    lat: clickedParcel.pts[0][0][1],
                    lon: clickedParcel.pts[0][0][0]
                },
                geometry: { exterior: clickedParcel.pts[0].map(pt => {
                    const wm = proj4("EPSG:4326", "EPSG:3857", pt);
                    return { x: wm[0], y: wm[1] };
                }) }
            };
            
            // Asynchronously fetch details if it's the new ID format
            if (clickedParcel.id && clickedParcel.id.includes('|')) {
                const parts = clickedParcel.id.split('|');
                if (parts.length >= 4) {
                    const zipFile = parts[0];
                    const nestedZip = parts[1];
                    const xmlFilename = parts[2];
                    const fid = parts.slice(3).join('|'); // in case fid has | in it somehow, though unlikely
                    
                    let cityName = "";
                    if (window.GSI && window.GSI.MUNI_ARRAY) {
                        const muniCd = zipFile.split('-')[0];
                        const muniData = window.GSI.MUNI_ARRAY[muniCd];
                        if (muniData) {
                            const nameParts = muniData.split(',');
                            if (nameParts.length >= 4) {
                                cityName = nameParts[3].trim();
                            }
                        }
                    }
                    parcelData.city = cityName;
                    window.updateDetailPanel(parcelData);
                    
                    if (window.extractXmlFromUrl) {
                        const cacheKey = xmlFilename;
                        if (!window.publicXmlDocCache) window.publicXmlDocCache = new Map();
                        
                        const processFudeDetails = (xmlDoc) => {
                            // Ensure this is still the selected parcel
                            if (window.selectedParcelId !== clickedParcel.id) return;
                            
                            const fudeElements = xmlDoc.getElementsByTagNameNS('*', '筆') || xmlDoc.getElementsByTagName('筆');
                            let targetFude = null;
                            for (let i = 0; i < fudeElements.length; i++) {
                                if (fudeElements[i].getAttribute('id') === fid) {
                                    targetFude = fudeElements[i];
                                    break;
                                }
                            }
                            
                            if (targetFude) {
                                let child = targetFude.firstElementChild;
                                while (child) {
                                    const localName = child.localName;
                                    if (localName === '縮尺分母') parcelData.scale = child.textContent;
                                    else if (localName === '精度区分') parcelData.accuracy = child.textContent;
                                    else if (localName === '座標値種別') parcelData.type = child.textContent;
                                    else if (localName === '丁目名') parcelData.chome = child.textContent.trim();
                                    else if (localName === '大字名') parcelData.ooaza = child.textContent.trim();
                                    else if (localName === '小字名') parcelData.koaza = child.textContent.trim();
                                    child = child.nextElementSibling;
                                }
                                parcelData.sourceXml = xmlFilename;
                                window.updateDetailPanel(parcelData);
                            }
                        };

                        if (window.publicXmlDocCache.has(cacheKey)) {
                            // LRU Cache Hit: Move to newest by deleting and re-inserting
                            const xmlDoc = window.publicXmlDocCache.get(cacheKey);
                            window.publicXmlDocCache.delete(cacheKey);
                            window.publicXmlDocCache.set(cacheKey, xmlDoc);
                            processFudeDetails(xmlDoc);
                        } else {
                            // Cache Miss: Fetch, Parse, and Store
                            window.extractXmlFromUrl('./data/' + zipFile, xmlFilename, nestedZip).then(xmlText => {
                                if (!xmlText) return;
                                const parser = new DOMParser();
                                const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
                                
                                window.publicXmlDocCache.set(cacheKey, xmlDoc);
                                // Maintain max cache size of 10 to free memory
                                if (window.publicXmlDocCache.size > 10) {
                                    const oldestKey = window.publicXmlDocCache.keys().next().value;
                                    window.publicXmlDocCache.delete(oldestKey);
                                }
                                
                                processFudeDetails(xmlDoc);
                            }).catch(e => console.error(e));
                        }
                    }
                } else {
                    window.updateDetailPanel(parcelData);
                }
            } else {
                window.updateDetailPanel(parcelData);
            }
        } else {
            window.updateDetailPanel(null);
        }
    }
});



