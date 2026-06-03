const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');

// 1. Fetch data
async function init() {
    try {
        const [pointsRes, mapRes] = await Promise.all([
            fetch('data.json'),
            fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        ]);
        
        const points = await pointsRes.json();
        const worldData = await mapRes.json();

        // Initial render
        renderMap(worldData, points);

        // Re-render on window resize to fix blank space dynamically
        window.addEventListener('resize', () => renderMap(worldData, points));

    } catch (error) {
        console.error("Init failed:", error);
    }
}

// 2. Optimized Map rendering
let currentProjection; // Store globally so openSidebar can access it

function renderMap(worldData, points) {
    const container = document.getElementById('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select('#map-container').html('');

    const svg = d3.select('#map-container').append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('id', 'world-map');

    const g = svg.append('g'); // All map elements go in this group for zooming

    currentProjection = d3.geoMercator();
    currentProjection.fitExtent([[50, 50], [width - 50, height - 50]], worldData);

    const path = d3.geoPath().projection(currentProjection);

    // 1. Define the Zoom Behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) // Limit zoom from 1x to 8x
        .filter(event => !event.button && event.type !== 'dblclick')
        .on('zoom', (event) => {
            // Apply the transformation to the group
            g.attr('transform', event.transform);

            // 2. SCALE-AWARENESS: Adjust pins and labels dynamically
            const k = event.transform.k;
            d3.selectAll('.pin').attr('r', 5 / k);
            d3.selectAll('.map-label')
                .style('font-size', (10 / k) + 'px')
                .attr('x', 15 / k);
        });

    // 2. Attach zoom to the SVG
    svg.call(zoom);

    // 3. Keep your 'focusOnPin' working
    // We need to tell the zoom behavior that we moved the camera manually
    window.manualZoomTo = (translateX, translateY, k) => {
        svg.transition()
           .duration(750)
           .call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(k));
    };

    // Draw Land
    g.append('g')
        .selectAll('path')
        .data(worldData.features)
        .enter()
        .append('path')
        .attr('d', path)
        .attr('class', 'land')
        .on('click', resetMap); // Clicking empty ocean resets zoom

    // Draw Pins
    const pins = g.append('g')
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
            event.stopPropagation(); // Prevent land click from triggering
            focusOnPin(d);
            openSidebar(d.file);
        });

    // Inside your renderMap function, find where you append the pins
    pins.append('circle')
        .attr('r', 5)
        .attr('class', 'pin')
        .on('mouseenter', function(event, d) {
            // Get the current zoom scale from the 'g' element
            const transform = d3.zoomTransform(d3.select('#world-map g').node());
            const k = transform.k; // This is your current zoom level (e.g., 4)

            // Adjust the hover radius so it stays visually consistent
            // Instead of a fixed size, we divide the desired "visual" size by k
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 5 / k); // 8 is the "unzoomed" hover size
        })
        .on('mouseleave', function(event, d) {
            const transform = d3.zoomTransform(d3.select('#world-map g').node());
            const k = transform.k;

            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 5 / k); // Return to standard size (adjusted for zoom)
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            focusOnPin(d);
            openSidebar(d.file);
        });

    pins.append('text')
        .attr('x', 10).attr('y', 4)
        .text(d => d.displayLabel)
        .attr('class', 'map-label');
}

function focusOnPin(d) {
    const container = document.getElementById('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const coords = currentProjection([d.lng, d.lat]);
    const x = coords[0];
    const y = coords[1];
    const k = 4;

    const translateX = (width / 4) - k * x; 
    const translateY = (height / 2) - k * y;

    // Use the new sync function to move the 'camera'
    d3.select('#world-map').transition()
        .duration(750)
        .call(d3.zoom().transform, d3.zoomIdentity.translate(translateX, translateY).scale(k));
}

function resetMap() {
    closeSidebar();
    d3.select('#world-map g')
        .transition()
        .duration(750)
        .attr('transform', `translate(0,0)scale(1)`);
        
    d3.selectAll('.pin').transition().duration(750).attr('r', 5);
    d3.selectAll('.map-label').transition().duration(750).style('font-size', '10px').attr('x', 10);
}

// 3. Sidebar and Markdown Logic
async function openSidebar(filePath) {
    sidebar.classList.remove('translate-x-full');
    sidebarContent.innerHTML = `<p class="animate-pulse">Loading...</p>`;
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error("File not found");
        const rawText = await response.text();
        
        // 1. Robustly split YAML from Markdown
        // This looks for the second occurrence of ---
        const parts = rawText.split('---');
        if (parts.length < 3) throw new Error("Invalid YAML format");
        
        const yamlRaw = parts[1];
        const markdownBody = parts.slice(2).join('---');

        // 2. Parse YAML using the library we just added
        const yamlData = jsyaml.load(yamlRaw); 

        // 3. Construct Header
        const themes = yamlData.themes ? yamlData.themes.split(',') : [];

        let sidebarHeader = `
            <div class="mb-8">
                <h1 class="text-2xl font-bold text-zinc-100 leading-tight mb-2">
                    ${yamlData.title || "Untitled"}
                </h1>
                <div class="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-widest mb-4">
                    <span>${yamlData.location || "Unknown"}</span>
                    <span>•</span>
                    <span>${yamlData.date || ""}</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${themes.map(t => {
                        const cleanTag = t.trim();
                        if (!cleanTag) return ''; // Skip empty tags
                        
                        const color = getThemeColor(cleanTag);
                        
                        return `
                            <span class="px-2 py-0.5 border rounded text-[9px] uppercase tracking-widest font-bold" 
                                  style="background-color: ${color.replace('hsl', 'hsla').replace(')', ', 0.15)')}; 
                                         border-color: ${color}; 
                                         color: ${color};">
                                ${cleanTag}
                            </span>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        sidebarContent.innerHTML = sidebarHeader + marked.parse(markdownBody);
        
    } catch (err) {
        console.error("Sidebar Error:", err);
        sidebarContent.innerHTML = `
            <div class="p-4 border border-red-900/50 bg-red-900/10 rounded">
                <p class="text-red-400 font-bold">Error loading content</p>
                <p class="text-xs text-red-300/60 mt-1">${err.message}</p>
                <p class="text-xs text-zinc-500 mt-4 underline cursor-help" onclick="location.reload()">Try refreshing the page</p>
            </div>
        `;
    }
}

function closeSidebar() {
    sidebar.classList.add('translate-x-full');
}

function getThemeColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        // Simple hashing algorithm
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Hue: 0-360 based on the hash
    // Saturation: 70% (Vibrant but not neon)
    // Lightness: 65% (Bright enough to read against dark backgrounds)
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 65%)`;
}

// Start the app
init();