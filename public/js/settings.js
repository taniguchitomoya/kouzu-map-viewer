// Default settings
window.mapSettings = {
    lineColor: '#3b82f6',
    textColor: '#1e293b',
    tileType: 'pale'
};

// Load settings from localStorage
try {
    const saved = localStorage.getItem('mapSettings');
    if (saved) {
        window.mapSettings = { ...window.mapSettings, ...JSON.parse(saved) };
    }
} catch (e) {
    console.error("Could not load settings", e);
}

const initSettings = () => {
    const openBtn = document.getElementById('openSettingsBtn');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const modal = document.getElementById('settingsModal');
    const saveBtn = document.getElementById('saveSettingsBtn');
    
    const lineColorPicker = document.getElementById('lineColorPicker');
    const textColorPicker = document.getElementById('textColorPicker');
    const tileOptions = document.querySelectorAll('.tile-option');
    
    // Initialize UI with current settings
    lineColorPicker.value = window.mapSettings.lineColor;
    textColorPicker.value = window.mapSettings.textColor;
    
    tileOptions.forEach(opt => {
        if (opt.getAttribute('data-tile') === window.mapSettings.tileType) {
            opt.classList.add('selected');
        }
        
        opt.addEventListener('click', () => {
            tileOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
    
    // Open Modal
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
        });
    }
    
    // Close Modal
    const closeModal = () => {
        modal.style.display = 'none';
    };
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Save Settings
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            window.mapSettings.lineColor = lineColorPicker.value;
            window.mapSettings.textColor = textColorPicker.value;
            
            const selectedTile = document.querySelector('.tile-option.selected');
            if (selectedTile) {
                window.mapSettings.tileType = selectedTile.getAttribute('data-tile');
            }
            
            localStorage.setItem('mapSettings', JSON.stringify(window.mapSettings));
            closeModal();
            
            // Clear tile cache to force redraw of new tile type
            if (typeof window.slippyCache !== 'undefined') {
                for (let key in window.slippyCache) delete window.slippyCache[key];
            }
            window.lodPattern = null;
            
            // Force redraw
            if (window.drawMap) window.drawMap();
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
} else {
    initSettings();
}
