// 1. GLOBAL STATE & CACHING
const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const filterContainer = document.getElementById('filter-container');
const activeBadge = document.getElementById('active-count');
const mapContainer = document.getElementById('map-container');

let allPoints = [];
let activeFilters = new Set();
let currentProjection;
let svg, g, zoomBehavior; // Cache D3 elements
let themeColorsCache = new Map(); // Cache theme colors
let filterButtonsCache = new Map(); // Cache filter button references
let pinGroupsSelection; // Cache pin groups selection

// Pre-compute constants
const ZOOM_CONFIG = { minScale: 1, maxScale: 8, fitMultiplier: 1.2 };
const TRANSITION_DURATION = 400;
const HOVER_TRANSITION_DURATION = 200;

// 2. INITIALIZATION
async function init() {
    try {
        const [pointsRes, mapRes] = await Promise.all([
            fetch('data.json'),
            fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        ]);
        
        const rawPoints = await pointsRes.json();
        const worldData = await mapRes.json();

        // OPTIMIZATION: Pre-process theme arrays once to save CPU during filtering
        allPoints = rawPoints.map(p => ({
            ...p,
            themeArray: p.themes ? p.themes.split(',').map(t => t.trim()) : []
        }));

        // Initial render (Called only once)
        renderMap(worldData, allPoints);
        setupFilters(allPoints);

        // OPTIMIZATION: Debounced resize handler
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => renderMap(worldData, allPoints), 200);
        });

    } catch (error) {
        console.error("Init failed:", error);
    }
}

// 3. MAP RENDERING
function renderMap(worldData, points) {
    const width = mapContainer.clientWidth;
    const height = mapContainer.clientHeight;

    // Clear container efficiently
    while (mapContainer.firstChild) {
        mapContainer.removeChild(mapContainer.firstChild);
    }

    svg = d3.select(mapContainer).append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('id', 'world-map');

    // Create a single group with a stable ID for zooming
    g = svg.append('g').attr('id', 'world-map-group'); 

    currentProjection = d3.geoMercator();

    // 1. Initial fit to get a baseline
    currentProjection.fitSize([width, height], worldData);

    // 2. COVER LOGIC:
    // We calculate the scale needed to fill the width vs the height.
    const bounds = d3.geoPath(currentProjection).bounds(worldData);
    const worldW = bounds[1][0] - bounds[0][0];
    const worldH = bounds[1][1] - bounds[0][1];
    
    const widthRatio = width / worldW;
    const heightRatio = height / worldH;
    
    // 3. Scale up to the LARGER of the two ratios to ensure no black bars
    // We add an extra 1.2x multiplier for that "immersion" zoom you liked.
    const fillScale = currentProjection.scale() * Math.max(widthRatio, heightRatio) * ZOOM_CONFIG.fitMultiplier;
    currentProjection.scale(fillScale);

    // 4. Centering slightly North (20°) to avoid a sea of empty space at the bottom
    currentProjection.center([0, 20]);

    const path = d3.geoPath().projection(currentProjection);

    // Calculate the physical boundaries of the projected landmasses
    const worldBounds = d3.geoPath().projection(currentProjection).bounds(worldData);

    zoomBehavior = d3.zoom()
        .scaleExtent([ZOOM_CONFIG.minScale, ZOOM_CONFIG.maxScale])
        // NEW: Restrict the camera movement to the world bounds
        .translateExtent([
            [worldBounds[0][0], worldBounds[0][1]], 
            [worldBounds[1][0], worldBounds[1][1]]
        ])
        .filter(event => !event.button && event.type !== 'dblclick')
        .on('zoom', handleZoom);

    svg.call(zoomBehavior);

    // Draw Land
    g.append('g')
        .selectAll('path')
        .data(worldData.features)
        .enter()
        .append('path')
        .attr('d', path)
        .attr('class', 'land')
        .on('click', resetMap);

    // Draw Pins - cache the selection
    pinGroupsSelection = g.append('g')
        .selectAll('g')
        .data(points)
        .enter()
        .append('g')
        .attr('class', 'pin-group')
        .attr('transform', d => {
            const coords = currentProjection([d.lng, d.lat]);
            return `translate(${coords[0]}, ${coords[1]})`;
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            focusOnPin(d);
            openSidebar(d.file);
        });

    pinGroupsSelection.append('circle')
        .attr('r', 5)
        .attr('class', d => {
            const isMastered = getMasteredList().includes(d.file);
            return isMastered ? 'pin mastered' : 'pin';
        })
        .on('mouseenter', handlePinHoverEnter)
        .on('mouseleave', handlePinHoverLeave);

    pinGroupsSelection.append('text')
        .attr('x', 10).attr('y', 4)
        .text(d => d.displayLabel)
        .attr('class', 'map-label');
}

// Extracted zoom handler for performance
function handleZoom(event) {
    g.attr('transform', event.transform);
    const k = event.transform.k;
    const invK = 1 / k;
    d3.selectAll('.pin').attr('r', 5 * invK);
    d3.selectAll('.map-label')
        .style('font-size', (10 * invK) + 'px')
        .attr('x', 15 * invK);
}

// Extracted pin hover handlers for performance
function handlePinHoverEnter(event, d) {
    const k = d3.zoomTransform(svg.node()).k;
    d3.select(this)
        .transition('hover').duration(HOVER_TRANSITION_DURATION)
        .attr('r', 8 / k); 
}

function handlePinHoverLeave(event, d) {
    const k = d3.zoomTransform(svg.node()).k;
    d3.select(this)
        .transition('hover').duration(HOVER_TRANSITION_DURATION)
        .attr('r', 5 / k);
}

// 4. NAVIGATION & CAMERA
function focusOnPin(d) {
    const width = mapContainer.clientWidth;
    const height = mapContainer.clientHeight;
    
    const coords = currentProjection([d.lng, d.lat]);
    const k = 4;

    const translateX = (width / 4) - k * coords[0]; 
    const translateY = (height / 2) - k * coords[1];

    svg.transition()
        .duration(750)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(translateX, translateY).scale(k));
}

function resetMap() {
    closeSidebar();
    filterContainer.classList.remove('active');
    filterContainer.style.pointerEvents = 'none';
    filterContainer.style.visibility = 'hidden';

    svg.transition()
        .duration(750)
        .call(zoomBehavior.transform, d3.zoomIdentity);
}

// 5. SIDEBAR & MARKDOWN
async function openSidebar(filePath) {
    sidebar.classList.remove('translate-x-full');
        
    // Hide the filter toggle
    const filterToggle = document.getElementById('filter-toggle');
    if (filterToggle) {
        filterToggle.style.opacity = '0';
        filterToggle.style.pointerEvents = 'none';
    }

    sidebarContent.innerHTML = `<p class="animate-pulse">Loading...</p>`;
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error("File not found");
        const rawText = await response.text();
        
        const parts = rawText.split('---');
        if (parts.length < 3) throw new Error("Invalid YAML format");
        
        const yamlData = jsyaml.load(parts[1]); 
        const markdownBody = parts.slice(2).join('---');

        const themes = yamlData.themeArray || (yamlData.themes ? yamlData.themes.split(',').map(t => t.trim()) : []);

        let sidebarHeader = `
            <div class="mb-8 flex flex-col gap-0">
                <div class="flex items-center justify-between border-b border-zinc-800/50 pb-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-zinc-200 text-[10px] font-bold uppercase tracking-widest">
                            ${yamlData.location || "Global"}
                        </span>
                        <span class="text-zinc-400 text-[10px] font-medium uppercase tracking-widest">
                            ${yamlData.date || ""}
                        </span>
                    </div>
                    
                    <button onclick="toggleMastery('${filePath}')" id="mastery-btn" 
                            class="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900/50 transition-all active:scale-95">
                        <div id="mastery-dot" class="w-2 h-2 rounded-full bg-zinc-600 transition-colors"></div>
                        <span id="mastery-label" class="text-[9px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200">
                            Mastered?
                        </span>
                    </button>
                </div>

                <h1 class="text-2xl sm:text-3xl font-bold text-zinc-100 leading-tight tracking-tight">
                    ${yamlData.title || "Untitled Case Study"}
                </h1>

                <div class="flex flex-wrap gap-2">
                    ${themes.map(t => {
                        const cleanTag = t.trim();
                        if (!cleanTag) return '';
                        const color = getThemeColor(cleanTag);
                        return `
                            <span class="px-2 py-0.5 border rounded text-[9px] uppercase tracking-widest font-bold" 
                                  style="background-color: ${color.replace('hsl', 'hsla').replace(')', ', 0.15)')}; 
                                         border-color: ${color}; color: ${color};">
                                ${cleanTag}
                            </span>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        const relatedHTML = getRelatedCasesHTML(filePath, yamlData.themes);
        sidebarContent.innerHTML = sidebarHeader + marked.parse(markdownBody) + relatedHTML;

        updateMasterySidebarUI(filePath);
                
    } catch (err) {
        sidebarContent.innerHTML = `<div class="p-4 border border-red-900/50 bg-red-900/10 rounded"><p class="text-red-400 font-bold">Error loading content</p><p class="text-xs text-red-300/60 mt-1">${err.message}</p></div>`;
    }
}

function closeSidebar() {
    sidebar.classList.add('translate-x-full');

    // Show the filter toggle again
    const filterToggle = document.getElementById('filter-toggle');
    if (filterToggle) {
        filterToggle.style.opacity = '1';
        filterToggle.style.pointerEvents = 'auto';
    }
}

// 6. FILTERING LOGIC
function setupFilters(points) {
    filterContainer.innerHTML = ''; // Clear previous
    filterContainer.style.pointerEvents = 'auto';
    
    const allThemes = new Set();
    points.forEach(p => p.themeArray.forEach(t => allThemes.add(t)));

    allThemes.forEach(theme => {
        const color = getThemeColor(theme);
        const btn = document.createElement('button');
        
        btn.innerText = theme;
        btn.className = "filter-pill px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-300";
        
        // Default "De-selected" State for Safari
        const setInactiveStyle = (element) => {
            element.style.borderColor = color;
            element.style.color = color;
            element.style.backgroundColor = 'transparent';
            element.style.filter = 'saturate(0)';
            element.style.opacity = '0.4';
        };

        // "Active/Hover" State
        const setActiveStyle = (element) => {
            element.style.filter = 'saturate(1)';
            element.style.opacity = '1';
            element.style.backgroundColor = `${color}22`; // Slight tinted background
        };

        setInactiveStyle(btn);

        btn.onclick = () => {
            if (activeFilters.has(theme)) {
                activeFilters.delete(theme);
                setInactiveStyle(btn);
            } else {
                activeFilters.add(theme);
                setActiveStyle(btn);
            }
            updateMapVisibility();
        };

        // Re-add hover listeners for Safari
        btn.onmouseenter = () => { if (!activeFilters.has(theme)) setActiveStyle(btn); };
        btn.onmouseleave = () => { if (!activeFilters.has(theme)) setInactiveStyle(btn); };

        filterContainer.appendChild(btn);
    });
}

function updateMapVisibility() {
    if (!pinGroupsSelection) return;
    
    pinGroupsSelection
        .transition().duration(TRANSITION_DURATION)
        .style('opacity', d => {
            if (activeFilters.size === 0) return 1;
            return d.themeArray.some(t => activeFilters.has(t)) ? 1 : 0.15;
        })
        .style('pointer-events', d => (activeFilters.size === 0 || d.themeArray.some(t => activeFilters.has(t))) ? 'auto' : 'none');

    if (activeFilters.size > 0) {
        activeBadge.textContent = activeFilters.size;
        activeBadge.classList.remove('hidden');
    } else {
        activeBadge.classList.add('hidden');
    }
}

// 7. HELPERS
function getThemeColor(str) {
    // Check cache first
    if (themeColorsCache.has(str)) {
        return themeColorsCache.get(str);
    }
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const color = `hsl(${Math.abs(hash) % 360}, 65%, 65%)`;
    
    // Cache the result
    themeColorsCache.set(str, color);
    return color;
}

function getRelatedCasesHTML(currentFile, currentThemesStr) {
    if (!currentThemesStr) return '';
    const themes = currentThemesStr.split(',').map(t => t.trim());
    const related = allPoints.filter(p => p.file !== currentFile && p.themeArray.some(t => themes.includes(t))).slice(0, 3);

    if (related.length === 0) return '';
    return `<div class="mt-12 pt-8 border-t border-zinc-800"><h3 class="text-zinc-500 text-[12px] uppercase tracking-[0.2em] mb-4">Related Evidence</h3><div class="grid gap-3">
        ${related.map(p => `<div onclick="focusOnPinByFile('${p.file}')" class="group cursor-pointer p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 transition-all">
            <p class="text-s font-bold text-zinc-300 group-hover:text-blue-400 transition-colors m-0">${p.displayLabel}</p>
            <p class="text-[12px] text-zinc-500 m-0">${p.location} • ${p.date}</p>
        </div>`).join('')}</div></div>`;
}

window.focusOnPinByFile = (fileName) => {
    const target = allPoints.find(p => p.file === fileName);
    if (target) { focusOnPin(target); openSidebar(target.file); }
};

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') resetMap(); });

function toggleFilterDrawer() {
    filterContainer.classList.toggle('active');

    // Explicitly toggle pointer events based on the active class
    if (filterContainer.classList.contains('active')) {
        filterContainer.style.pointerEvents = 'auto';
        filterContainer.style.visibility = 'visible';
    } else {
        filterContainer.style.pointerEvents = 'none';
        filterContainer.style.visibility = 'hidden';
    }
}

// --- MASTERY SYSTEM ---

function getMasteredList() {
    return JSON.parse(localStorage.getItem('gp-mastery-list') || "[]");
}

window.toggleMastery = (filePath) => {
    let mastered = getMasteredList();
    const index = mastered.indexOf(filePath);

    if (index > -1) {
        mastered.splice(index, 1); // Remove if exists
    } else {
        mastered.push(filePath); // Add if new
    }

    localStorage.setItem('gp-mastery-list', JSON.stringify(mastered));
    
    // Update both UI components immediately
    updateMasterySidebarUI(filePath);
    updateMasteryMapUI();
};

function updateMasterySidebarUI(filePath) {
    const btn = document.getElementById('mastery-btn');
    const dot = document.getElementById('mastery-dot');
    const label = document.getElementById('mastery-label');
    const isMastered = getMasteredList().includes(filePath);

    if (btn && dot && label) {
        if (isMastered) {
            btn.classList.add('border-amber-500/50', 'bg-amber-500/10');
            btn.classList.remove('border-zinc-700', 'bg-zinc-900/50');
            dot.classList.replace('bg-zinc-600', 'bg-amber-500');
            label.innerText = 'Mastered';
            label.classList.replace('text-zinc-400', 'text-amber-500');
        } else {
            btn.classList.remove('border-amber-500/50', 'bg-amber-500/10');
            btn.classList.add('border-zinc-700', 'bg-zinc-900/50');
            dot.classList.replace('bg-amber-500', 'bg-zinc-600');
            label.innerText = 'Mastered?';
            label.classList.replace('text-amber-500', 'text-zinc-400');
        }
    }
}

function updateMasteryMapUI() {
    const mastered = getMasteredList();
    d3.selectAll('.pin').each(function(d) {
        const isMastered = mastered.includes(d.file);
        d3.select(this).classed('mastered', isMastered);
    });
}

// 8. START - Initialize application
init();