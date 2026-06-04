// 1. GLOBAL STATE & CACHING
const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const filterContainer = document.getElementById('filter-container');
const activeBadge = document.getElementById('active-count');

let allPoints = [];
let activeFilters = new Set();
let currentProjection; 

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
    const container = document.getElementById('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select('#map-container').html('');

    const svg = d3.select('#map-container').append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('id', 'world-map');

    // Create a single group with a stable ID for zooming
    const g = svg.append('g').attr('id', 'world-map-group'); 

    currentProjection = d3.geoMercator();
    currentProjection.fitSize([width, height], worldData);

    // Zoom boost to fill the screen (Edge-to-Edge)
    const fillScale = currentProjection.scale() * 1.3;
    currentProjection.scale(fillScale).center([0, 20]); 

    const path = d3.geoPath().projection(currentProjection);

    // Zoom behavior setup
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .filter(event => !event.button && event.type !== 'dblclick')
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            const k = event.transform.k;
            d3.selectAll('.pin').attr('r', 5 / k);
            d3.selectAll('.map-label')
                .style('font-size', (10 / k) + 'px')
                .attr('x', 15 / k);
        });

    svg.call(zoom);

    // Draw Land
    g.append('g')
        .selectAll('path')
        .data(worldData.features)
        .enter()
        .append('path')
        .attr('d', path)
        .attr('class', 'land')
        .on('click', resetMap);

    // Draw Pins
    const pinGroups = g.append('g')
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

    pinGroups.append('circle')
        .attr('r', 5)
        .attr('class', 'pin')
        .on('mouseenter', function() {
            const k = d3.zoomTransform(d3.select('#world-map').node()).k;
            d3.select(this)
                .transition('hover').duration(200)
                .attr('r', 8 / k); 
        })
        .on('mouseleave', function() {
            const k = d3.zoomTransform(d3.select('#world-map').node()).k;
            d3.select(this)
                .transition('hover').duration(200)
                .attr('r', 5 / k);
        });

    pinGroups.append('text')
        .attr('x', 10).attr('y', 4)
        .text(d => d.displayLabel)
        .attr('class', 'map-label');
}

// 4. NAVIGATION & CAMERA
function focusOnPin(d) {
    const container = document.getElementById('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const coords = currentProjection([d.lng, d.lat]);
    const k = 4;

    const translateX = (width / 4) - k * coords[0]; 
    const translateY = (height / 2) - k * coords[1];

    d3.select('#world-map').transition()
        .duration(750)
        .call(d3.zoom().transform, d3.zoomIdentity.translate(translateX, translateY).scale(k));
}

function resetMap() {
    closeSidebar();
    const container = document.getElementById('filter-container');
    container.classList.remove('active');
    container.style.pointerEvents = 'none';
    container.style.visibility = 'hidden';
    
    d3.select('#world-map').transition()
        .duration(750)
        .call(d3.zoom().transform, d3.zoomIdentity);
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
            <div class="mb-8">
                <h1 class="text-2xl font-bold text-zinc-100 leading-tight mb-2">${yamlData.title || "Untitled"}</h1>
                <div class="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-widest mb-4">
                    <span>${yamlData.location || "Unknown"}</span>
                    <span>•</span>
                    <span>${yamlData.date || ""}</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${themes.map(t => {
                        const color = getThemeColor(t);
                        return `<span class="px-2 py-0.5 border rounded text-[9px] uppercase tracking-widest font-bold" 
                                      style="background-color: ${color.replace('hsl', 'hsla').replace(')', ', 0.15)')}; border-color: ${color}; color: ${color};">${t}</span>`;
                    }).join('')}
                </div>
            </div>
        `;

        const relatedHTML = getRelatedCasesHTML(filePath, yamlData.themes);
        sidebarContent.innerHTML = sidebarHeader + marked.parse(markdownBody) + relatedHTML;
                
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
        btn.style.color = color;
        btn.style.borderColor = color;
        btn.style.backgroundColor = 'transparent';
        btn.style.filter = 'saturate(0)'; 
        btn.style.opacity = '0.5';
        btn.style.backgroundColor = `${color}11`;

        btn.onclick = () => {
            if (activeFilters.has(theme)) {
                activeFilters.delete(theme);
                btn.classList.add('opacity-60', 'grayscale');
            } else {
                activeFilters.add(theme);
                btn.classList.remove('opacity-60', 'grayscale');
            }
            updateMapVisibility();
        };
        filterContainer.appendChild(btn);
    });
}

function updateMapVisibility() {
    d3.selectAll('.pin-group')
        .transition().duration(400)
        .style('opacity', d => {
            if (activeFilters.size === 0) return 1;
            return d.themeArray.some(t => activeFilters.has(t)) ? 1 : 0.15;
        })
        .style('pointer-events', d => (activeFilters.size === 0 || d.themeArray.some(t => activeFilters.has(t))) ? 'auto' : 'none');

    if (activeFilters.size > 0) {
        activeBadge.innerText = activeFilters.size;
        activeBadge.classList.remove('hidden');
    } else {
        activeBadge.classList.add('hidden');
    }
}

// 7. HELPERS
function getThemeColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 65%)`;
}

function getRelatedCasesHTML(currentFile, currentThemesStr) {
    if (!currentThemesStr) return '';
    const themes = currentThemesStr.split(',').map(t => t.trim());
    const related = allPoints.filter(p => p.file !== currentFile && p.themeArray.some(t => themes.includes(t))).slice(0, 3);

    if (related.length === 0) return '';
    return `<div class="mt-12 pt-8 border-t border-zinc-800"><h3 class="text-zinc-500 text-[10px] uppercase tracking-[0.2em] mb-4">Related Evidence</h3><div class="grid gap-3">
        ${related.map(p => `<div onclick="focusOnPinByFile('${p.file}')" class="group cursor-pointer p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 transition-all">
            <p class="text-s font-bold text-zinc-300 group-hover:text-blue-400 transition-colors">${p.displayLabel}</p>
            <p class="text-[12px] text-zinc-500 mt-1">${p.location} • ${p.date}</p>
        </div>`).join('')}</div></div>`;
}

window.focusOnPinByFile = (fileName) => {
    const target = allPoints.find(p => p.file === fileName);
    if (target) { focusOnPin(target); openSidebar(target.file); }
};

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') resetMap(); });

function toggleFilterDrawer() {
    const container = document.getElementById('filter-container');
    filterContainer.classList.toggle('active');

    // Explicitly toggle pointer events based on the active class
    if (container.classList.contains('active')) {
        container.style.pointerEvents = 'auto';
        container.style.visibility = 'visible';
    } else {
        container.style.pointerEvents = 'none';
        container.style.visibility = 'hidden'; // Complete removal from the "touch" layer
    }
}

// 8. START
init();